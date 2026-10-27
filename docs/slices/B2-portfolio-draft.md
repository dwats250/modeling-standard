# Slice B2 — Private portfolio draft

<!-- This template is not implementation authority. The current Dustin-approved work order controls scope and permissions within binding product and real-use boundaries. -->

Status: Implemented and pushed on `feat/b2-private-portfolio-drafts`, PR #43, stacked on B1 (`feat/b1-profile-comp-card` at `bee9f4e`, PR #41, open). See "As built".
Owner: Dustin (assignment); builder session `ms-builder`.

## Outcome

A synthetic signed-in professional with a B1 profile selects up to eight images from the generated fixture catalogue, removes and reorders them, saves, and finds the same order — in the editor and in a responsive, clearly private portfolio preview — after a reload or an application restart.

## Product decisions required

- README: Track B is the current implementation priority (private synthetic profiles and their presentation).
- D07 (DECIDED): profile and portfolio sit behind a separate paid boundary. B2 implements no price, tier or entitlement and calls nothing free or paid.
- I6 / D10: no directory; owner-controlled material. B2 reads no one else's material.
- Dustin-authorized provisional synthetic choices (reversible, not product policy): one portfolio draft per profile; an ordered list of fixture keys; at most eight images (below the ten-image catalogue, so the limit is real); an empty draft is valid; no captions or other per-image fields; up/down/remove controls; the preview layout.

## Invariants

- Owner-only, as B1: the owner is the session's account, its profile found on the server; no route or body names an account, profile or draft, and a strict body refuses any field that tries.
- Strict input at the operation boundary (known, distinct fixture keys; at most eight; no other fields) and again in PostgreSQL (count, one-dimensional list, key shape, no NULL, no repeats).
- Runtime role: SELECT, INSERT, UPDATE of `items` only; no DELETE; owner and time columns unchangeable; database time.
- Toolkit routes stay in the local synthetic demo only: production and S13 staging have no `/me/*` route.

## Scope

- `src/toolkit/tables.ts` (`portfolio_draft`, `PORTFOLIO_MAX_ITEMS`), `src/toolkit/portfolio.ts` (owner-keyed data functions), `src/toolkit/operations.ts` (`GET`/`POST /me/portfolio`, added to `toolkitOperations`).
- Migrations 0032 (generated: table, one per profile, count and shape CHECK) and 0033 (hand-written: item guard trigger, B1's stamp trigger, grants).
- Local demo screens: `#/me/portfolio` (organize) and `#/me/portfolio/preview`, in `src/demo/ui/toolkit.js` and `toolkit.css`; section tabs (Profile, Comp card, Portfolio) with an editing/preview row inside the comp card and portfolio.

## Explicitly out of scope

Real uploads or image bytes, external URLs, captions, public profiles or states, discovery, sharing grants, outside sharing, sign-in or Google changes, payments, billing or entitlements, messaging, participant signing, retention or erasure policy, new services or frameworks, deployment, Track A semantics.

## As built (2026-10-27)

**Model.** `portfolio_draft (id, profile_id unique → professional_profile, items text[] default '{}', created_at, updated_at)`. A CHECK holds the count (≤ 8) and a one-dimensional, 1-based list; the trigger `portfolio_draft_check_items` refuses NULL items, items not shaped like a fixture key (`^[a-z0-9-]{1,40}$`) and repeats with `check_violation`, since a CHECK cannot look inside the elements. Which keys exist is the application catalogue.

**HTTP.** `GET /me/portfolio` → `{ profile, draft: { items, updatedAt }, maxItems, fixtures: [{ key, label }] }`; an unsaved draft reads as `{ items: [], updatedAt: null }`. `POST /me/portfolio` takes exactly `{ items }` and returns the same view. No principal: 401. A synthetic principal (operator, test header): generic 404. No profile yet: 409 `profile_required`. Unknown, malformed or repeated keys, more than eight, and any other field: 400. No id or owner in any response.

**Screens.** Organize: "Your selection" (count, ordered list, ↑ ↓ Remove per image, focus kept on the moved control; empty and full notes) and "Add images" (the catalogue as toggle buttons; disabled when full). Live preview and Save follow the B1 comp-card layout (preview first and a sticky Save on a phone; a sticky column on a desktop). Preview: the profile's name and profession, the images in order with the first large and each numbered, "Private draft · synthetic fixture images"; "No images yet" when empty. Unsaved edits carry to the preview, labelled as unsaved. All text is written with `textContent`.

**B1 touched only where B2 needed it.** The chooser, teaser and Demo menu text now name the portfolio; the comp card's Preview moved from the section tabs to the comp card's own editing/preview row (same address). B1's browser test changed accordingly: two heading strings and one selector (`.tk-subtab` for the comp-card preview link).

**Environment (task-owned).** Worktree `/home/dustin/Projects/modeling-standard-b2`; container `ms-b2-postgres` on `127.0.0.1:5440` (volume `ms-b2-pgdata`, provisioned from this worktree's `db/provision.sql`); untracked `.env` with only the 5440 URLs and `CHROME_PATH=/usr/bin/google-chrome`. No demo service was started; browser tests use their own ephemeral server.

**Commands run (B2 instance only):**

| Command | Result |
|---|---|
| `npm test` before any change | 40 files, 617 tests passed |
| `npm test` | 42 files, 632 tests passed (+6 database, +8 HTTP, +1 local-demo harness) |
| `npm run test:demo` | 5 files, 32 tests passed |
| `npm run check` (after commit, so the drift check sees committed migrations) | exit 0; no schema changes; 34 migration files, no identifier over 63 bytes |
| `npm run build`; `dist/` inspected | built; no `dist/demo`; the built production operation list has 16 operations, none under `/me`, `/demo` or `/media`, and no built module imports the toolkit operations |

**Tests.** `tests/database/portfolio.test.ts` (one draft per profile, order kept, empty and full, owner isolation; by direct SQL as the runtime role: nine items, repeats, non-key strings including a comma-joined pair, NULL, two-dimensional and non-1-based arrays refused; no delete, owner, time or truncate changes; database time). `tests/http/portfolio.test.ts` (401, synthetic 404, B cannot read or change A's draft by body, query or path, no ids, 409, order through select/remove/reorder, empty and full saves, fourteen refused bodies leaving the draft unchanged, restart). `tests/http/toolkit.test.ts` and `tests/http/staging.test.ts`: the portfolio routes are generic 404 in production (authenticated account) and on staging (Google session). `tests/demo/toolkit.test.ts`: the local demo registers them and keeps A's and B's portfolios apart. `tests/demo-browser/toolkit.test.ts`: the B2 case described in `docs/engineering/DEMO.md`. Pinned lists updated explicitly: tables (`migrations.test.ts`), runtime privileges and updatable columns (`runtime-role.test.ts`), trigger functions (`trigger-functions.test.ts`).

**Visual evidence.** `test-results/demo/toolkit-{desktop-portfolio,desktop-portfolio-preview,phone-portfolio,phone-portfolio-preview,phone-portfolio-empty}.png` (untracked, regenerated per run), inspected at 1280 and 390; no horizontal overflow (asserted), controls at least 44 px (asserted on the phone).

**Known limitations.** Last write wins between two tabs of the same owner. A fixture key removed from the catalogue later would stay in saved drafts (the database checks shape, not membership) and the screens would label it "Fixture". The phone preview with very few images leaves blank space beside the second. Sign-in for professionals remains deferred.

**Next action.** Review PR #43 and its CI; integrate only after its B1 dependency (PR #41) and owner authorization. Real sign-in and manual acceptance remain a separate later gate.
