# Slice — S07 direct invitation link core

Status: BUILT — awaiting Dustin's review (authorized by the Post-Reconciliation Build Sprint 2 charge, 2026-10-15)
Owner: Claude
Date: 2026-10-15

## Outcome

The application can create a **direct-send invitation** for an existing project-local party, resolve its link credential back to that party, and let a sign-in account **claim** it, which binds the account to the party through S06.

**The link is the invitation.** How the link travels is not product state. Nothing here sends anything, signs anyone in, verifies anyone, or shows anyone the brief.

## Product decisions required

- `decisions/D03-participation-credential.md` — DECIDED for the photo-shoot scope:
  - an account is required, created by Google or Apple sign-in at the invitation;
  - the link is the invitation, and email is only one way to deliver it;
  - a wrong address needs no product-state correction;
  - there is no forwarded-invitation mechanism;
  - sign-in is not identity.
- `decisions/D11-adult-assurance.md` — relied on only for what it excludes: verification is separate and happens at first participation.
- `decisions/D12-who-may-act.md` — DECIDED. No proxies.
- `decisions/D07-initiation-and-paywall.md` — DECIDED. Direct send is one of the three routes. Posted work, applications and referral links are distinct flows and are out of scope.

Nothing here depends on an open decision. The handoff corrections HC1 and HC2 do not bear on this slice.

## Invariants

- **I-S07-1.** An invitation names a project and an existing party of that project. The database enforces the containment.
- **I-S07-2.** Each credential digest is unique.
- **I-S07-3.** The raw credential is never stored, logged or derivable from the database. Only SHA-256 of its 32 bytes is stored.
- **I-S07-4.** The credential is 32 CSPRNG bytes, in canonical unpadded base64url. Any other spelling resolves to nothing.
- **I-S07-5.** An invitation stores no recipient identity, address, channel, delivery or read state, expiry, rotation, revocation or acceptance status, and no IP or device data.
- **I-S07-6.** Nothing limits how many invitations a party may have. Rotation, reissue and revocation are not defined.
- **I-S07-7.** A claim is recorded only as the S06 party-account binding. It is idempotent for the same account, refuses any other account, and leaves one durable winner under concurrency.
- **I-S07-8.** Resolving or claiming exposes no project content, establishes no identity, is not acceptance of any term, and grants no proxy authority.
- **I-S07-9.** Invitations are append-only for the runtime role. No foreign key cascades. The creation time is set by the database.
- **I-S07-10.** No HTTP operation is added. Production still has no principal.

## In scope

- The `direct_invitation` table, its stamp trigger and its runtime grants (`migrations/0017`, `migrations/0018`).
- `createDirectInvitation`, `resolveDirectInvitation` and `claimDirectInvitation` in `src/invitations/invitation.ts`.
- Real-PostgreSQL tests, mutation checks, populated-upgrade coverage through S07, and extended pins.

## Explicitly out of scope

- OAuth or any provider integration, and sessions, cookies, JWTs or a production principal.
- Identity or age verification.
- Archive references or recovery, and surname lookup.
- Email, SMS or any delivery.
- Posted work, applications, referral behaviour, profiles, portfolios and the paywall.
- S02 uniqueness and any term-model, live-brief, S04/S05, signing, finality, document, call-sheet, payment, legal or retention work.

## Acceptance evidence

- `tests/database/invitations.test.ts`.
- The S07 entries in the table, privilege and trigger-function pins.
- The populated 0016 → current upgrade case in `tests/database/migration-upgrades.test.ts`.
- Mutation results in the as-built note.

## Change-locality check

- **Expiry or revocation, if Cory ever defines them:** additive, because nothing here assumes a single or permanent invitation.
- **A delivery feature:** sits outside this table; the link is still the invitation.
- **The sign-in adapter:** composes `resolveAccountForLogin` (S06) then `claimDirectInvitation` (S07); neither changes.

## Stop conditions

Stop if implementation would need:

- a rule on how many invitations a party may hold;
- any invitation lifecycle state;
- recipient data;
- anything about who may create an invitation, which belongs to the authenticated participant flow.
