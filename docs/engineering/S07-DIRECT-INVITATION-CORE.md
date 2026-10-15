# S07: direct invitation link core, as built

Slice: `docs/slices/S07-direct-invitation-core.md`. Decisions relied on: D03 (the link is the invitation; account by Google or Apple sign-in; sign-in is not identity), D11 (verification is separate), D12 (no proxies) and D07 (direct send is one route). Nothing open.

**What this is not.**

- The link is the invitation; the delivery channel is not product state.
- The raw credential is not stored.
- An invitation does not establish identity and is not acceptance.
- An invitation grants no proxy authority.
- A claim only binds an account to an existing project-local party (S06).
- Verification still happens later (D11).
- This covers direct send only, not posted work, applications or referrals.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `direct_invitation` table | `src/invitations/tables.ts`, `migrations/0017` | `id`, `project_id`, `party_id`, `credential_digest`, `created_at` |
| Stamp trigger | `migrations/0018` | `direct_invitation_stamp`: database time, not the caller's |
| Runtime grants | `migrations/0018` | `SELECT, INSERT`; `PUBLIC` revoked; stamp function not executable by `PUBLIC` |
| Data functions | `src/invitations/invitation.ts` | `createDirectInvitation`, `resolveDirectInvitation`, `claimDirectInvitation`. No HTTP operation and no production caller |

## Schema

`direct_invitation`:

- `id uuid` primary key, `gen_random_uuid()`.
- `project_id uuid not null`, referencing `project(id)`.
- `party_id uuid not null`. `(project_id, party_id)` references `project_party(project_id, id)` (`direct_invitation_party_in_project_fk`).
- `credential_digest bytea not null`:
  - `UNIQUE` (`direct_invitation_digest_unique`);
  - `CHECK (octet_length(credential_digest) = 32)` (`direct_invitation_digest_sha256_length`).
- `created_at timestamptz not null`, overwritten with `clock_timestamp()` by `direct_invitation_stamp`.
- Every foreign key is `NO ACTION`: nothing cascades.

## Credential

- **Generation.** `crypto.randomBytes(32)`: 256 bits from the operating system's CSPRNG.
- **Encoding.** Unpadded base64url, exactly 43 characters from `[A-Za-z0-9_-]`, safe in a URL path or query.
- **Digest.** SHA-256 of the 32 decoded bytes, stored as 32 raw bytes in `bytea`. Hashing the bytes rather than the text, and accepting only the canonical spelling, means each credential has exactly one textual form. The digest is never returned by the data functions.
- **No stretching.** It is a high-entropy bearer credential, not a password, so it is not stretched.
- **The raw credential** appears only in the result of `createDirectInvitation`.

## Behaviour

- **Create.** Inserts a row for an existing party of the project and returns `{ id, projectId, partyId, createdAt, credential }`. The database rejects a party of another project, or an unknown party.
- **Resolve.** Checks the credential is exactly canonical base64url of 32 bytes, hashes it, and looks up the digest. It returns `{ id, projectId, partyId, createdAt }` or `undefined`. Unknown and malformed credentials (wrong length, padding, standard base64, hex, whitespace, non-canonical trailing bits) behave the same. It returns no project content and is not authorization to read the brief.
- **Claim.** One READ COMMITTED transaction:
  1. resolve the credential, or `InvitationNotFoundError`;
  2. check the account exists, or `AccountNotFoundError`;
  3. bind through S06's `bindPartyToAccount`.

  The same account again returns the existing binding. Any other account gets `PartyAlreadyBoundError`, whichever invitation for that party it presents, and the original binding is unchanged. The invitation row is never modified; the binding is the only record of a claim.

## Concurrency

Eight accounts claiming one invitation at once leave exactly one binding. The seven losers receive `PartyAlreadyBoundError`, and the durable binding equals the winner's result. S06's unique key on the party is the final authority; its `ON CONFLICT DO NOTHING` waits for the competing insert and then reads it under READ COMMITTED.

Twenty concurrent creations for one party produce twenty distinct credentials and digests.

## Tests

`tests/database/invitations.test.ts`, as the runtime role against real PostgreSQL.

**Creation**
- format and entropy;
- distinct credentials and digests;
- only the SHA-256 digest is stored, and the row holds neither the credential text nor its hex;
- cross-project and unknown parties are rejected by the named containment key;
- a duplicate digest is a unique violation;
- a digest that is not 32 bytes is a check violation;
- the creation time cannot be backdated.

**Resolution**
- a valid credential resolves to the right project and party, with no credential or digest in the result;
- an unknown credential resolves to nothing;
- nine malformed spellings resolve to nothing;
- a credential equal to the stored digest resolves to nothing, because lookup is by digest only.

**Claim**
- success creates exactly one binding;
- the same account again is idempotent;
- another account is refused through either of two invitations for the party, with the original kept;
- eight concurrent claimants leave one winner;
- an unknown account and an unknown or malformed credential bind nothing;
- the bound project and party are the invitation's own.

**Boundaries**
- exact columns and types;
- exact constraints, with no cascade;
- a semantic guard against recipient, delivery, lifecycle, identity and request-metadata names;
- no HTTP operation;
- the project and S06 account records leak no invitation data;
- no credential appears in any row of any table, or in a trace-level log captured from the same database handle;
- the S07 source has no logging, network, mail or provider code;
- no update, delete or truncate, and the stamp function cannot be called.

**Elsewhere**
- the table-list, runtime-privilege and trigger-function pins are extended;
- `migration-upgrades.test.ts` upgrades a populated S06-era database (project, parties, account, binding) across S07 and checks:
  - the rows are unchanged;
  - the invitation table arrives empty with `SELECT, INSERT`;
  - bookkeeping is correct;
  - the catalog matches a fresh database;
  - a second run is a no-op;
  - a pre-existing party can be invited.
- The S06 upgrade case now expects bookkeeping through the newest migration, not through 0016.

## Mutation checks

Run by hand, each restored:

| Mutation | Tests that fail |
|---|---|
| Remove `direct_invitation_digest_unique` | Duplicate-digest test; exact-constraints test |
| Store the credential bytes instead of their digest | Digest-only storage test; valid-resolve test; lookup-by-digest test; every claim test that resolves a credential; DTO-leak test |
| Remove `direct_invitation_party_in_project_fk` | Cross-project creation test; exact-constraints test |
| Remove S06's `party_account_binding_one_per_party` | Concurrent-claim, idempotent and refuse-other-account claim tests, plus the S06 binding tests |
| Grant `UPDATE` on `direct_invitation` | No-update test; runtime privilege-set test |
