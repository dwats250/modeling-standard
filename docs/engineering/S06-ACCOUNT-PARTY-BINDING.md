# S06: account and party binding, as built

Slice: `docs/slices/S06-account-party-binding.md`. Decisions relied on: D03 (account required; Google or Apple sign-in; sign-in is not identity), D11 (verification is separate), D12 (no proxies) and D01. Nothing open.

**What this is not.** An account is a sign-in account, not a verified identity. An account is not a party. A binding gives no one authority to act for anyone else. No real sign-in exists yet, provider subjects are only login credentials, invitation and verification are later slices, and production still has no principal.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `account` table | `src/accounts/tables.ts`, `migrations/0015` | `id`, `login_provider`, `provider_subject`, `created_at` |
| `party_account_binding` table | same | `id`, `project_id`, `party_id`, `account_id`, `bound_at` |
| Stamp triggers | `migrations/0016` | `account_stamp`, `party_account_binding_stamp`: database time, not the caller's |
| Runtime grants | `migrations/0016` | `SELECT, INSERT` on both; `PUBLIC` revoked; stamp functions not executable by `PUBLIC` |
| Data functions | `src/accounts/account.ts`, `src/accounts/binding.ts` | No HTTP operation, no production caller |

## Schema

`account`:

- `id uuid` primary key, `gen_random_uuid()`.
- `login_provider text not null`, `CHECK (login_provider in ('google', 'apple'))` (`account_login_provider_known`).
- `provider_subject text not null`, `CHECK (provider_subject ~ '[^[:space:]]')` (`account_provider_subject_nonblank`).
- `created_at timestamptz not null`, overwritten with `clock_timestamp()` by `account_stamp`.
- `UNIQUE (login_provider, provider_subject)` (`account_login_unique`).

`party_account_binding`:

- `id uuid` primary key.
- `project_id uuid not null` → `project(id)`.
- `party_id uuid not null`; `(project_id, party_id)` → `project_party(project_id, id)` (`party_account_binding_party_in_project_fk`).
- `account_id uuid not null` → `account(id)`.
- `bound_at timestamptz not null`, overwritten with `clock_timestamp()` by `party_account_binding_stamp`.
- `UNIQUE (party_id)` (`party_account_binding_one_per_party`).
- Every foreign key is `NO ACTION`: nothing cascades.

## Non-obvious choices

- **A separate binding table, not a column on `project_party`.** S01's party keeps its meaning; the binding is append-only evidence with its own time.
- **Race-safe resolution.** `resolveAccountForLogin` is `INSERT … ON CONFLICT (login_provider, provider_subject) DO NOTHING RETURNING`, then a read. A concurrent resolver waits on the other's uncommitted row, then reads it. Under REPEATABLE READ or SERIALIZABLE the read cannot see that row, so the call throws rather than inventing a second account (tested).
- **Idempotent, fail-closed binding.** `bindPartyToAccount` is `INSERT … ON CONFLICT (party_id) DO NOTHING RETURNING`. On conflict it returns the existing binding if it names the same account and project, and otherwise throws `PartyAlreadyBoundError`. Concurrent competing bindings leave exactly one durable row.
- **No limit on parties per account.** Not a decided invariant, so no unique key on `(project_id, account_id)` and no test asserting one either way.
- **No provider data beyond the subject.** No email, name or token: sign-in is the door, not identity. Cross-provider linking is not inferred.
- **The principal boundary is unchanged.** `src/main.ts` still uses `resolveNoPrincipal`. `src/authorization/access.ts` now documents that an authenticated production principal is intended to represent an internal account id. `SyntheticPrincipal` and `project.created_by_principal_id` are deliberately not renamed or migrated.

## Tests

`tests/database/accounts.test.ts`, against real PostgreSQL as the runtime role:

- **Accounts.** Google and Apple creation; repeat resolution yields the same account; 12 concurrent resolutions yield one account; a resolution blocked on another session's uncommitted insert returns that row; the same subject under both providers gives two accounts; unsupported providers (including case variants) and blank subjects are rejected by the database; the creation time cannot be backdated; snapshot-isolation resolution fails closed.
- **Bindings.** Bind and read back from either side; unknown account rejected; unknown and wrong-project parties rejected by the named containment key; repeating the same binding returns it without a second row (a raw duplicate insert is a unique violation); rebinding to another account throws and keeps the original; eight concurrent competing bindings leave one winner, the rest `PartyAlreadyBoundError`; one account across two projects; the binding time cannot be backdated.
- **Schema.** Exact columns; exact constraints; no cascading foreign key; a semantic guard rejecting verified-identity, role, payment, proxy, guardian, profile, portfolio, invitation, signature and token names.
- **Boundary.** No account, login or binding HTTP operation; no update, delete or truncate; stamp functions not callable.

Elsewhere:

- The table-list, runtime-privilege and trigger-function pins are extended.
- `tests/http/projects.test.ts` checks that a bound party leaks no account, provider or subject into the project DTO.
- `tests/database/migration-upgrades.test.ts` upgrades a populated 0014 database across S06, then binds a pre-existing party.

**Mutation checks** (run by hand):

| Mutation | Tests that fail |
|---|---|
| Remove `account_login_unique` | The concurrent and blocked-resolution tests |
| Remove `party_account_binding_one_per_party` | The competing-bind test |
| Grant `UPDATE` on `party_account_binding` | The privilege-set test and the no-update test |
