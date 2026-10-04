# Stage 0: engineering foundation

What Stage 0 built, as built. Authorized by Dustin's Gate 0 charge. Planning context: `planning/G-development-sequence.md` (Stage 0) and `planning/D-technical-architecture.md`.

## Scope

A product-neutral technical chassis: one TypeScript application on PostgreSQL with validated configuration, an error boundary, structured redacted logging, a mandatory authorization boundary, strict input and output shapes, reviewed migrations with separate runtime and migration credentials, a bounded evidence-mechanics probe, tests at every layer, and CI.

It has no product behaviour. Nobody can sign in, and in the production build every protected operation is denied. The only data it stores is synthetic.

## Architecture

| Concern | Choice |
|---|---|
| Runtime | Node 24 (`.nvmrc`, `engines`), TypeScript 6 strict, ESM. Erasable syntax only, so Node runs `src/` directly; `tsc` emits `dist/` for the built artifact |
| HTTP | Fastify 5, one process |
| Validation | Zod 4 at every boundary (configuration, request params/query/body, responses) |
| Database | PostgreSQL (local and CI: 17; tested locally on 16). Drizzle ORM over `pg` |
| Migrations | `drizzle-kit generate` produces SQL from `src/stage0/tables.ts` for review; privileges are hand-written SQL migrations; applied by Drizzle's migrator in journal order. `drizzle-kit push` is never used |
| Logging | Pino (Fastify's logger) as JSON |
| Tests | Vitest against real PostgreSQL |

Request path, end to end:

```
src/main.ts           read env once → loadAppConfig → open runtime DB pool → SELECT 1 → createApp → listen
src/app/create-app.ts Fastify + request id + error boundary + not-found + registerOperations(operations)
src/app/operations.ts the complete list of operations (the whole HTTP surface)
src/http/operations.ts per request: resolve principal → 401 if protected and absent → parse params/query/body
                      (400) → load target + policy (404/403) → run → parse output (500 on mismatch) → send
src/stage0/*.ts       the synthetic operations, their policies, their data functions, their tables
```

Dependencies injected into `createApp`: the database, the logger, and the principal source. Nothing else. Production and the integration tests construct the app through the same `createApp` with the same operation list; tests substitute only the principal source and the log destination.

## Commands

```
npm ci                  install from the lockfile
npm run db:up           local PostgreSQL in Docker (provisions roles on first start)
npm run db:migrate      apply migrations with MIGRATION_DATABASE_URL
npm run check           typecheck, lint, migration drift check
npm test                all suites (creates and drops its own test database)
npm run build           compile to dist/
npm start               run dist/main.js
```

## Database roles

| Role | Login | Purpose | Privileges |
|---|---|---|---|
| `ms_migrator` | yes | Runs migrations; owns the database and every table | Owner. `CREATEDB` locally/CI only, so tests can create disposable databases |
| `app_runtime` | no | Group role that migrations grant to | `SELECT, INSERT` on `synthetic_resource`; `SELECT, INSERT` on `synthetic_evidence`. Nothing else |
| `ms_runtime` | yes | The application's credential | Member of `app_runtime`. Owns nothing |

`db/provision.sql` creates these for local development and CI with non-secret passwords. Production provisioning is not chosen in Stage 0. Migrations name only `app_runtime`, so a deployment can choose its own login names.

The application only ever receives `DATABASE_URL` (runtime). The migration command only reads `MIGRATION_DATABASE_URL`. A test pins the runtime privilege set exactly, so any widened grant fails CI.

## Authorization boundary

- Every route is an operation in `src/app/operations.ts`. An operation declares `publicAccess(reason)` or `{ kind: 'protected', load, policy }`. Registration validates every definition at boot and throws on a missing or malformed declaration, a non-strict input or output schema, or a duplicate route.
- `registerOperations` installs an `onRoute` guard: any route not created by it, including in encapsulated plugins, throws at registration.
- Protected operations: no principal → 401 before input is parsed or the database is touched. Then the target is loaded (`load`) and the policy runs on that object: missing → 404, policy false → 403.
- The principal is an opaque `{ id }` from `resolvePrincipal`. Production passes `resolveNoPrincipal`; tests pass a header-reading resolver that exists only in `tests/support/app.ts`.
- Policies live next to the behaviour they govern (`src/stage0/synthetic-resource.ts`).
- The negative test is generated from the operation list: every protected operation is called without a principal and must return 401 with no side effects. A second test pins which operations are public (today: only `health`).

Status codes 401/403/404 are distinguishable in Stage 0. Whether a later operation should hide a target's existence from someone not permitted to see it is decided per operation when real operations exist.

## Input and output

Inputs are `z.strictObject` schemas for params, query and body; undeclared fields are rejected (400), not stripped. Omitted parts default to "no fields allowed". Data functions map columns explicitly; request input is never spread into a row. Outputs are strict schemas too: a handler result that does not match exactly (for example, a whole row) becomes a 500, and the log records the mismatch path, never the values. Error bodies are uniformly `{ error: { code, requestId, issues? } }`.

## Evidence-mechanics probe

`src/stage0/synthetic-evidence.ts` writes synthetic bytes with a SHA-256 digest computed by the application, reads them back exactly, and verifies the digest. A table CHECK makes PostgreSQL itself reject a digest that does not match the bytes. The module has no update or delete function, and the runtime role holds no `UPDATE`, `DELETE` or `TRUNCATE` privilege on the table.

**Threat boundary proven** (by `tests/database/evidence-probe.test.ts`, as the runtime role in raw SQL):

- Holds against normal application behaviour, application bugs, and a compromised runtime credential: `UPDATE`, `DELETE`, `TRUNCATE` and `DROP` fail with `insufficient_privilege`, and the bytes still verify afterwards.
- Does **not** hold against the migration/owner role or a database administrator. A test pins that the owner can delete, so this document cannot drift into overclaiming.
- Is **not** a retention guarantee and sets no retention period.
- Is **not** the final evidence or artifact mechanism. The future schema, hash topology and artifact storage are decided later (Deliverable D §3–4).

Mechanism chosen: privileges alone (plus the integrity CHECK). Triggers rejecting `UPDATE`/`DELETE` were not added; they would be a second layer against privilege misconfiguration, which the exact privilege test already catches in CI.

## Test layers

| Layer | Files | Proves |
|---|---|---|
| Unit | `tests/unit/` | Config fails closed without echoing values; error serialization drops query parameters and row details; digest detects alteration |
| Database | `tests/database/` | Empty database migrates and re-migration is a no-op; only the two synthetic tables exist; exact runtime privileges; runtime cannot alter schema or migration journal; rollback and commit; evidence probe |
| HTTP | `tests/http/` | Registration rules; no route outside the list; generated 401s; owner 200, wrong principal 403, missing 404; production resolver denies all protected operations; strict input; exact response shape; output mismatch → 500 without leaking; health, request id, error and log shape; DB-down health without leaking credentials |
| Boot | `tests/boot/` | The real entry point exits 1 on missing/malformed config and on an unreachable database, and boots and answers health with valid config |

The global test setup throws if `DATABASE_URL` or `MIGRATION_DATABASE_URL` is missing; database suites never skip. ESLint rejects `.skip`, `.only`, `.todo`, `.skipIf` and `.runIf` in tests. CI additionally boots `dist/main.js` and checks `/health`.

## Explicit exclusions

No accounts, sign-in, sessions or credentials. No product nouns, tables or types. No web client. No mail, object storage, PDF rendering, background work, rate limiting or vendor of any kind. No deployment pipeline. No OpenAPI or code generation. No dependency-injection framework, plugin system or shared kernel.

## Deferred

- Sign-in mechanics and what a principal is (D3), and therefore any real principal source.
- Whether protected operations hide target existence (decided per operation).
- Evidence schema, hash topology, artifact storage and rendering (D2, D4, D10, the probe result).
- Triggers on evidence tables; a migration check against cascades toward evidence (no foreign keys exist yet).
- A boot-time assertion that the runtime credential lacks owner privileges.
- Production database provisioning, hosting and every other vendor.
- Web client toolchain and layout.
