# Deliverable D. Technical architecture

Status: Fable recommendation. Technical choices are Dustin's to accept or amend; none of them is a Cory decision. The charge's §16 hypothesis (TypeScript, React, Vite, Node, PostgreSQL, Drizzle or equivalent, Zod or equivalent, one deployable) survives review: recon C found no defect attributable to language, framework or database. What changes is how the stack is assembled.

## 1. Topology

One repository, one deployable, one database, one blob bucket, one outbound mail provider.

```
repo/
  apps/web        React + Vite single-page app (served as static files)
  apps/server     Node 24 LTS service: HTTP API, outbox worker, CLI commands
  packages/kernel shared value types (Actor, Audience, Role, Compensation, Usage, Boundary terms), command input and output types
  db/             SQL migrations (generated then hand-reviewed), seed and fixture builders
  infra/          Dockerfile, compose for local Postgres, S3-compatible store and mail catcher
```

The server serves the API under `/api` and the built web app as static files. No separate gateway. The outbox worker runs inside the same process (single instance) with a lock so a second instance would not double-send; if the product ever needs two instances the worker moves to a second process of the same image. No queue infrastructure.

## 2. Frontend and backend relationship

- The API is a **command registry**, not a set of hand-written routes: a typed array of `defineCommand({ name, input, output, policy, rateLimit?, handler })` objects. At boot the array registers Fastify routes and fails if any entry lacks a `policy` (or lacks a `rateLimit` when it sends email). The authorization test iterates the same array. No code generation: the web app imports input and output types from `packages/kernel` directly. No OpenAPI document; there is no consumer for one.
- Transport is JSON over HTTPS with conventional paths. TanStack Query for data; React Router for navigation; route-level code splitting from day one; a bundle-size budget in CI.
- No DB row is ever returned. Every response is a DTO declared on the command.
- Bearer flows (an invitee opening a link) hit the same registry with `actor.kind = bearer`; there is no second API.

**HTTP framework**: Fastify. Reasons: schema-first validation and typed request context are native, which is the exact property the prototype lacked (141 `req: any` handlers); plugin encapsulation gives one place for actor resolution and policy hooks; mature and boring. Express with a mandatory typed wrapper or Hono would both satisfy the requirement; the requirement is "no untyped request and no route without a policy", not the framework.

## 3. Database approach

- PostgreSQL 16 or later. Driver: `postgres` (postgres.js) or `pg` against a plain connection string; not the serverless WebSocket driver.
- Drizzle for typed queries and schema-as-code; `drizzle-kit generate` produces SQL migrations that are reviewed and committed; never `push`. Triggers, grants and check constraints are hand-written SQL in the same migration files.
- **Two database roles**: `app` (used at runtime) and `migrate`. The `app` role has no UPDATE or DELETE privilege on evidence tables. A trigger on those tables rejects UPDATE and DELETE for every role except a purge role that does not exist until Cory and counsel define retention.
- Foreign keys default to RESTRICT. Migration lint (a small script over the SQL) fails on any CASCADE toward an evidence table.
- Generated insert schemas are never used as API validators. API input shapes are written per command in the registry.
- All enum-like columns are Postgres enums or checked text, never free text.

## 4. Authentication model

- **Internal account id** (UUIDv7) is the only identity the rest of the system sees. External identities are rows in `external_identity (provider, subject, email, verified, linked_at)`.
- **Passwordless email** is the first and, in slice 1, only login method: a one-time code (the primary path, since phone mail apps open links in in-app browsers) with a link as convenience, valid for a short window, single use. This matches Cory's stated signup feel ("I'd almost not know I signed up") **[CA]** and is the smallest secure implementation. OAuth links (Google, Apple) are added later as linked identities, not as primary keys.
- Login requests, invitations and presentations are rate-limited per address, per IP and per account, and login requests answer uniformly whether or not the address exists; a two-person team cannot absorb an email-bombing or deliverability incident.
- Sessions are server-side rows in Postgres, referenced by an httpOnly, Secure, SameSite=Lax cookie. Origin checks on mutating requests.
- Actor resolution runs before every command and loads the account row (so suspension is enforced on every request, not only at login).
- Adult attestation (D11) is recorded on the account at first participation and copied into every affirmation. Adult verification is an adapter interface (`AgeVerifier`) with a null implementation in slice 1 and a real one required before stage 3 uploads. The Actor carries `verified: unverified | adult`.
- No product state is created inside the auth callback. "Claim invitation" is an explicit Identity command, and it succeeds only when the claiming account's verified email matches the invited address.

## 5. Authorization architecture

- **Deny by default.** A command with no policy declaration fails registration at boot.
- Policies are functions over `(actor, target)` evaluated after the target is loaded, so the check is on the object being mutated (never a parent).
- Repository methods take a scope parameter (`forAccount(id)`, `forShoot(id)`, `forGrant(id)`); there is no `update(id)` or `delete(id)` on any repository.
- Actor kinds: `account`, `bearer` (a scoped grant: invitation, share link, access grant), `system` (outbox, scheduled commands), `admin` (an account with an admin role, still subject to policy).
- A generated test iterates every registry entry and asserts: unauthenticated is rejected; a wrong account is rejected; a suspended account is rejected; an expired or revoked bearer is rejected; the declared happy actor succeeds against a fixture. A command without a fixture fails CI.

## 6. Persistence, immutable evidence

- Working state (Shoot, TermsDraft, Participant, Invitation) is ordinary mutable rows with soft-archive.
- **Versions** are written once by the `present` command: canonical terms as exact bytes (RFC 8785 canonicalization, stored as `text`/`bytea`, never as `jsonb`, so the hash recomputes from what is stored), the rendered clause text produced by the renderer at that moment, the renderer template version, a hash per term block and a hash for the whole. Sequence number per shoot. The organizer's presenting affirmation is written in the same transaction.
- **Review events and Affirmations** reference `version_id`; each is one immutable row. An affirmation stores the actor kind and id, the credential id (session), typed legal name, adult attestation, the term blocks affirmed, timestamp, and request metadata (IP, user agent) as a default Cory can veto (D4).
- **Records** are written once when the agreement freezes: a common hash over the canonical version and its affirmations, and one rendered view per party stored in the **evidence storage class** (write-once: a bucket or prefix with object lock or versioning where the vendor supports it, which runtime credentials can write but not delete or overwrite, excluded from every purge job by construction). Any party to the version can retrieve their view forever; retrieval is logged.
- Integrity: a `verify record` command recomputes hashes from stored bytes and reports mismatch; a nightly job does the same over all records and alerts.
- No evidence table has an UPDATE or DELETE path in the application (section 3), and a test proves that deleting an evidence blob with runtime credentials fails.

## 7. Media strategy

- Slice 1 has no user-uploaded media. The blob adapter is still built in the walking skeleton because Records need it, with two storage classes from the start: `evidence` (write-once, no expiry, never purged) and `working` (expiry allowed).
- `BlobStore` interface with an S3-compatible implementation and a local-disk fake used in tests. Every blob has an owner, an audience, a storage class, a size class (`original | web | thumb`), a content type, an optional expiry (working class only), and a scan status.
- Ingest pipeline (stage 3): strip EXIF and location metadata, derive web and thumbnail sizes, keep originals only where the product requires them, mark expiry for transit media.
- `ImageScanner` interface with a null implementation; a real implementation is required before any public upload exists (Cory: not deferrable by phasing) **[CA]**.
- Zero-egress storage class is the cost lever (COST-REALITY); vendor deferred to stage 3.

## 8. Provider boundaries

Each external capability is an interface in `apps/server/src/adapters/<name>/` with a real implementation and a fake. No vendor SDK is imported outside its adapter directory; an import-boundary lint rule enforces this.

| Interface | Slice 1 real | Fake | Notes |
|---|---|---|---|
| `Mailer` | one transactional provider, paid tier | in-memory + local catcher | Delivery state surfaced to Communications. Never free-tier for the core loop (100/day cap). |
| `BlobStore` | S3-compatible | local disk | Vendor chosen at stage 3. |
| `PdfRenderer` | one HTML template rendered by headless Chromium in a child process with a memory cap and a timeout | snapshot fake | One template for screen and PDF so the record looks like what was reviewed. Cost: Chromium in the image (a few hundred MB) and a render process that can be killed without taking the API down. If that cost bites, a Node PDF renderer behind the same interface with a shared component tree is the fallback; decided in the walking skeleton. |
| `Clock` | system | controllable | Required for deterministic tests of expiry. |
| `TokenGenerator` | CSPRNG | seeded | For bearer grants and login codes. |
| `Config` | env parsed once at boot into a typed object | test config | Missing config fails at boot, never at first use. |
| `Logger` | structured JSON (pino) with request id | capture | |
| `AgeVerifier` | null | null | Stage 5 or later. |
| `ImageScanner` | null | null | Before any public upload. |
| `Billing` | absent | absent | Not built until post-beta; when built, safety domains cannot import it. |

## 9. Jobs and background work

Justified: yes, minimally. Sending mail with retries, freezing records (render then store), and scheduled purge of expired grants and transit media all need to run outside the request.

- A `outbox` table with `SKIP LOCKED` polling by an in-process worker; idempotent handlers keyed by job id; exponential backoff; dead-letter after N attempts with an alert.
- Scheduled maintenance is a CLI command (`server jobs run purge --dry-run`) invoked by the host's scheduler, never a timer at boot, never keyed on naming heuristics, never touching evidence.
- Test data is marked by a column on the row and cleaned only by test tooling.

## 10. Testing architecture

- `createApp(deps)` is the only way the server is constructed. Production passes real adapters; tests pass fakes plus a real, disposable Postgres (testcontainers or the compose database).
- Test layers:
  1. Domain unit tests for the agreement state machine and term validation (pure functions, fast).
  2. Command tests through the registry against real Postgres: happy path, the generated authorization matrix, and invariant probes (attempt UPDATE/DELETE on evidence through the API and through raw SQL as the `app` role).
  3. Renderer golden tests: canonical JSON in, rendered text out, byte-stable.
  4. Adapter contract tests run against both fake and real implementation.
  5. Three or four Playwright journeys at a phone viewport for the flows in the current slice.
- No critical suite may be skipped for missing environment; the database is provided in CI.

## 11. CI

GitHub Actions on every pull request, in this order, each a hard gate: clean install from lockfile (no private registries) → lint (including import boundaries, file size budget of roughly 300 lines per page component, no `any` in server code) → strict typecheck with zero errors → migrations from empty database → tests → build → bundle-size budget → container build → boot and `/healthz` smoke → dependency audit and secret scan. Branch protection on `main`; human merge only (Dustin).

## 12. Deployment philosophy

- One container image, immutable per commit; configuration by environment; migrations applied as a release step before the new image receives traffic.
- One managed PostgreSQL with daily backups and a quarterly restore drill; one blob bucket; one mail provider; DNS and TLS at the edge.
- Vendor selection is deferred until slice 1 runs end to end locally (the charge's "select vendors after requirements"). Evaluation checklist (adapted from the previous target doc): traffic, storage, data location and privacy, uptime need, backup and restore, operating skill and time, monthly cost, exit path. Given COST-REALITY's finding that founder time is the scarce resource, the default lean is small managed services over a self-run host, with the adapters keeping the swap cheap.
- Observability from the first commit: structured logs with request ids, `/healthz` and `/readyz`, uptime check, error tracking added at beta.

## 13. Decide now vs defer

| Decide now (slice 1 depends on it) | Defer (a stage names when) |
|---|---|
| Node 24 LTS, TypeScript strict, monorepo layout | Hosting vendor (stage 5) |
| Fastify + typed command array; deny-by-default policy; rate limits on mail-sending commands | Blob vendor (stage 3; the evidence storage class exists from stage 0 on whatever S3-compatible store is used locally and in the first deployment) |
| PostgreSQL, Drizzle with reviewed SQL migrations, two roles, evidence triggers, canonical bytes as text | Mail vendor final choice (any transactional provider behind the adapter; pick at stage 1 end) |
| Internal account id; passwordless code-first login; server sessions; adult attestation; matching-email claim rule | OAuth providers (stage 3) |
| Version, ReviewEvent, Affirmation, Record and RecordView model and hashing; organizer signs what they present | Age verification vendor (before stage 3 uploads) |
| Outbox in Postgres, in-process worker | Image scanning vendor (before stage 3 uploads) |
| `createApp(deps)`, adapter fakes, CI order | Public link page rendering: one server-rendered HTML template from the same Fastify app (stage 4, if Cory decides the page exists) |
| HTML-template renderer behind `PdfRenderer`, Chromium in a child process | Error tracking vendor (beta) |
| React + Vite + TanStack Query + React Router; Tailwind v4; design tokens package created at stage 3, not reserved now | Component library depth (stage 3 with the design system) |
| | Import-boundary lint for Entitlements (stage 6, when the module exists) and the Billing provider (stage 6) |

## 14. Dependency discipline

Start from a short list and add one-in-one-out. Specifically avoided from the prototype: two PDF stacks, eight upload packages, six email-template packages, test tools in production dependencies, dead auth packages, a serverless DB driver on a conventional database, generated insert schemas as API validators, a maps SDK. Runtime dependencies for slice 1 should fit on one screen.
