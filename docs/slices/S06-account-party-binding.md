# Slice — S06 account and party binding core

Status: BUILT — awaiting Dustin's review (authorized by the Post-Reconciliation Build Sprint 1 charge, 2026-10-15)
Owner: Claude
Date: 2026-10-15

## Outcome

The application can durably record **external sign-in → account → project-local party**, so a later authentication adapter can resolve a Google or Apple sign-in to exactly one internal account and bind that account to a party of a project, without changing S01's project or party model.

No one can sign in yet. This is storage and data functions only.

## Product decisions required

- `decisions/D03-participation-credential.md` — DECIDED for the photo-shoot scope: an account is required; it is created by Google or Apple sign-in at the invitation; sign-in is the door, not identity.
- `decisions/D11-adult-assurance.md` — relied on only for what it excludes: verification is separate and happens at first participation. Its one open item (synthetic-demo verification) is not touched.
- `decisions/D12-who-may-act.md` — DECIDED. No proxies; the person acting is the party bound to their account.
- `decisions/D01-first-scenario.md` — DECIDED. The project remains the container; the creator is role-neutral.

Nothing here depends on R1, R2 or any other open item.

## Invariants

- **I-S06-1.** An account's login provider is exactly `google` or `apple`.
- **I-S06-2.** The provider subject is nonblank.
- **I-S06-3.** `(provider, provider subject)` identifies exactly one account; repeated and concurrent resolution of one login yields one account.
- **I-S06-4.** A Google login and an Apple login are never linked, even with the same subject text.
- **I-S06-5.** An account stores no tokens, email, name, avatar, profile, portfolio, date of birth, verification result or vendor data.
- **I-S06-6.** A binding names a project, a party of that project, and an account; the database enforces the containment.
- **I-S06-7.** A party is bound at most once and is never rebound to another account; concurrent competing bindings leave one durable winner.
- **I-S06-8.** Bindings and accounts are append-only for the runtime role; no foreign key cascades, so historical bindings survive any later closure work.
- **I-S06-9.** Times are set by the database.
- **I-S06-10.** No invariant limits how many parties one account may be bound to, in one project or across projects. That is not a decided rule.
- **I-S06-11.** Account ≠ verified identity; account ≠ party; a binding grants no proxy authority.
- **I-S06-12.** Production still has no principal. No HTTP operation is added.

## In scope

- `account` and `party_account_binding` tables, stamp triggers and runtime grants (`migrations/0015`, `migrations/0016`).
- Data functions: `resolveAccountForLogin`, `findAccountByLogin`, `findAccount`, `bindPartyToAccount`, `findBindingForParty`, `listBindingsForAccount`.
- Real-PostgreSQL tests, and extension of the table, privilege, trigger-function and populated-upgrade pins.
- Documentation of the intended principal relationship: an authenticated production principal will represent an internal account id.

## Explicitly out of scope

- Real OAuth, provider SDKs, callbacks, tokens, sessions, cookies or JWTs; any provider network call.
- An authentication adapter or a production principal resolver.
- Invitation links or tokens, and invitation HTTP flows (D03's link-is-the-invitation is a later slice).
- Identity verification, age, documents or vendors (D11).
- Archive lookup, reference numbers, recovery (D03, D09).
- Profiles, portfolios, roles, payer or payee.
- Renaming `SyntheticPrincipal`, refactoring the authorization layer, or migrating `project.created_by_principal_id`.
- Any S02–S05 product semantics.

## Acceptance evidence

`tests/database/accounts.test.ts`; the S06 entries in `tests/database/runtime-role.test.ts`, `tests/database/migrations.test.ts`, `tests/database/versions.test.ts` (trigger-function pin) and `tests/database/migration-upgrades.test.ts`; the project-DTO check in `tests/http/projects.test.ts`. Mutation checks: removing either uniqueness key or widening runtime privileges fails the race, competing-bind and privilege tests.

## Expected change surface

`src/accounts/`, `drizzle.config.ts`, `migrations/0015–0016` and snapshots, the pins listed above, comments in `src/projects/tables.ts`, `src/projects/party.ts` and `src/authorization/access.ts`.

## Change-locality check

- A third sign-in provider: one check constraint and the `LOGIN_PROVIDERS` list.
- A decided "one account per project" rule: one unique key on `party_account_binding (project_id, account_id)` and a test.
- Account closure: additive; bindings remain as evidence because nothing cascades.
- Verification: its own table or slice; the account table does not change.

## Stop conditions

Stop if implementation would need: a rule on one account holding several parties in one project; cross-provider linking; anything about who may create a binding (that is the invitation slice); or R1/R2.
