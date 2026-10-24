# Slice B1 — Private professional profile and comp-card draft

<!-- This template is not implementation authority. The current Dustin-approved work order controls scope and permissions within binding product and real-use boundaries. -->

Status: Implemented locally on `feat/b1-profile-comp-card` (not pushed, not merged). See "As built" below.
Owner: Dustin (assignment); builder session `ms-builder`.

## Outcome

A synthetic signed-in professional creates and edits a private profile (display name, profession, short biography), arranges a comp-card draft from five deterministic fixture-backed media slots (hero, full body, profile view, lifestyle, beauty), sees a responsive comp-card preview, saves, and returns later — after a reload or an application restart — to continue editing.

## Product decisions required

- README: Track B is the current implementation priority, starting with private synthetic profiles and comp-card drafts.
- D07 (DECIDED): profile and portfolio sit behind a separate paid boundary. Nothing here is priced, gated or called free or paid.
- I6 / D10: no people directory; a person's professional material is owner-controlled. B1 has no reading of anyone else's material at all.
- D10: measurements, contact details and exact location are sensitive. B1 stores none of them.
- Dustin-authorized provisional synthetic choices (reversible, not product policy): the five slot names, the fixture catalogue and its generated images, one profile per account and one draft per profile, the optional tagline, distinct fixtures per slot, the field lengths, and the local demo's two fixed synthetic owners.

## Invariants

- Owner-only: every toolkit operation acts on the signed-in account's own rows, found from the server-side session. No route or body names an owner, profile or draft id.
- Strict input and output (the operation boundary); unknown fixture keys refused.
- Durable: rows in PostgreSQL; reviewed migrations; runtime role cannot delete rows or change ownership.
- Production unchanged: no sign-in path, provider, invitation or Track A behavior changes. The synthetic owner harness is in `src/demo/`, excluded from the build.

## In scope

- `src/toolkit/`: tables, data functions, fixture catalogue, four operations (`GET`/`POST /me/profile`, `GET`/`POST /me/comp-card`).
- Migrations 0030 (generated) and 0031 (hand-written stamps, guards, grants).
- Local demo: a two-owner synthetic harness (`POST /demo/toolkit/owner`, local only), generated SVG fixture images, profile, comp-card editor and preview screens.
- Database, HTTP and browser tests; demo documentation.

## Explicitly out of scope

Sign-in screens, invitation-free onboarding, Google changes, login links, manual device acceptance, real uploads or real images, public or shared profiles, discovery, sharing grants, measurements, contact or location, payments or paywall enforcement, messaging, participant signing, staging exposure, deployment, Track A semantics.

## Acceptance evidence

See "As built" for the commands actually run and their results.

## Expected change surface

`src/toolkit/*`, `src/app/operation-list.ts`, `drizzle.config.ts`, `migrations/0030*`, `migrations/0031*`, `migrations/meta/*`, `src/demo/{toolkit.ts,fixture-images.ts,operations.ts,application.ts,server.ts}`, `src/demo/ui/{toolkit.js,toolkit.css,journey.js,index.html}`, tests, `docs/engineering/DEMO.md`, `docs/engineering/README.md`.

## Change-locality check

Slot names and the catalogue live in `src/toolkit/fixture-media.ts` and the slot columns; a changed slot set is one migration plus that file. Who may hold a profile is the toolkit access policy in `src/toolkit/operations.ts`. Real sign-in for professionals replaces only the demo harness.

## Stop conditions

A required change to Track A tables or agreement semantics; a change to invitation sign-in (D03); any need to store real images or expose a profile beyond its owner.

## Environment (task-owned)

| Resource | Value |
|---|---|
| Worktree | `/home/dustin/Projects/modeling-standard-b1` |
| Branch | `feat/b1-profile-comp-card` (no upstream) |
| Base | `origin/main` at `aa9d686` (verified 2026-10-24) |
| PostgreSQL | container `ms-b1-postgres`, `127.0.0.1:5438`, volume `ms-b1-pgdata`, provisioned by `db/provision.sql` |
| Demo | `127.0.0.1:3160` (`DEMO_PORT`) |
| `.env` | untracked; both database URLs point at 5438 |

Every test command in this assignment ran with that `.env`, so `modeling_standard_test`, `modeling_standard_demo` and the staging test databases were created and dropped only on the B1 instance.

## As built (2026-10-24)

**What works.** A synthetic professional, chosen in the local demo, creates and edits a private profile and a comp-card draft, arranges the five slots from ten generated fixtures (a choice already used swaps), sees a live and a full-size preview, saves, and finds the same state after a reload and after an application restart. Owner A cannot read or change owner B's data: the owner is the session's account and nothing in an address or body can name another. Missing authentication is 401; a synthetic (operator or test) principal is the generic 404; unknown, duplicate or URL fixture keys, extra fields, control characters and over-long text are 400; a draft before a profile is 409 `profile_required`. Text is written to the page with `textContent` only.

**How to inspect.** From this worktree, with `ms-b1-postgres` up: `npm run demo` (or `npm run demo:fresh` to reset), open `http://127.0.0.1:3160/#/me`, choose Synthetic professional A or B. Use a second browser profile for the other owner.

**Commands run (B1 instance only, `.env` on 127.0.0.1:5438):**

| Command | Result |
|---|---|
| `npm test` before any change | 37 files, 584 tests passed |
| `npm test` | 40 files, 628 tests passed |
| `npm run test:demo` (`CHROME_PATH=/usr/bin/google-chrome`) | 5 files, 31 tests passed |
| `npm run check` (after commit, so the drift check sees committed migrations) | exit 0; no schema changes; 32 migration files, no identifier over 63 bytes |
| `npm run build`; `dist/` inspected | built; no `dist/demo`; built operation list has the four `/me/*` routes and no `/demo/toolkit` or `/media` route |

**Visual evidence.** `test-results/demo/toolkit-{phone-chooser,desktop-profile,phone-profile,desktop-card,phone-card,desktop-preview,phone-preview}.png` from `npm run test:demo` (untracked, regenerated per run). Inspected at 1280 and 390: no horizontal overflow (asserted), touch targets at least 44 px (asserted), the sticky save placement and the per-slot strips corrected after a first inspection.

**Also fixed.** The operator's start screen wrote a stray "null" when no shoot had been composed (present on `main`); it now writes nothing there, and the toolkit browser test asserts no stray `null`/`undefined`.

**Deliberately not done (deferred, not completed).** Sign-in for professionals: no sign-in screen, invitation-free onboarding, login link, Google change, or manual multi-device acceptance. The harness's two fixed synthetic professionals stand in for it, locally only.

**Known limitations.** Last write wins between two tabs of the same owner. The toolkit routes are in the production operation list, so on synthetic staging a Google-signed-in account could call them directly; staging shows no toolkit screen and has no harness. Synthetic status comes from the account and environment; profile text is not stored with a `[synthetic]` mark. Fixture images are served only by the demo server.

**Resources.** `ms-b1-postgres` (volume `ms-b1-pgdata`) left running for inspection; stop with `docker stop ms-b1-postgres`. Demo servers started for inspection were stopped by exact PID. Nothing else was started or changed.

**Next action.** Dustin reviews `feat/b1-profile-comp-card` and decides on push and PR. Professional sign-in remains the open follow-on.
