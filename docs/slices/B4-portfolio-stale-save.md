# Slice B4 — Portfolio stale-save protection

<!-- This template is not implementation authority. The current Dustin-approved work order controls scope and permissions within binding product and real-use boundaries. -->

Status: Implemented as a synthetic, private local-demo slice on `feat/b4-portfolio-stale-save`, stacked on B3 (`feat/b3-portfolio-captions` at `0578151`, PR #44). Uncommitted at the time of this record, pending independent review. See "As built".

## Outcome

A synthetic signed-in professional who saves a portfolio draft that was saved elsewhere since it was opened (another tab or window) is told so and loses nothing: the save is refused, the edits stay on the screen, and reviewing or loading the saved version, or saving over it, is a deliberate choice. Of any number of simultaneous saves based on the same saved version, exactly one lands, including simultaneous first saves.

## Product decisions required

None beyond B2's and B3's. A reversible synthetic engineering choice authorized by the Dustin work order, not product policy: a numeric save revision per draft and a refusal when it is stale. No merge, history or version retention.

## Invariants

- Owner-only, as B1–B3: the owner is the session's account; no route or body names an account, profile or draft. Revisions are per draft, so one owner's saves never affect another's and one owner's revision number means nothing on another's draft.
- Atomic compare-and-swap, not timestamps and not a read-before-write check: the compare and the write are one statement (`INSERT … ON CONFLICT DO NOTHING` for a first save, `UPDATE … WHERE revision = expected` after), evaluated by PostgreSQL. No row back means stale.
- The revision is the database's: 1 on insert and +1 on every update by trigger; the runtime role cannot set it (no column UPDATE grant); below 1 refused by CHECK.
- A stale save writes nothing and answers a distinct, generic 409 `stale_revision` with no draft data, no caption, no revision and no other owner's anything.
- `expectedRevision` is required on every save; missing, negative, fractional, non-numeric or beyond a PostgreSQL integer: 400, unchanged draft.
- The screen never auto-refreshes, discards or overwrites on a conflict. Reviewing the saved version, loading it over the edits, and saving over it are each one explicit press.
- Toolkit routes stay in the local synthetic demo only (production and staging: generic 404).

## Explicitly out of scope

Merging, version history, retention, real-time presence or locking, uploads, public or shared portfolios, sign-in or provider changes, the comp card and profile (last write still wins there), Track A semantics.

## As built (2026-10-28)

**Model.** `portfolio_draft.revision integer not null default 1`, CHECK `portfolio_draft_revision_positive` (≥ 1). Trigger function `portfolio_draft_revision` (BEFORE INSERT OR UPDATE): 1 on insert, `OLD.revision + 1` on update, whatever the caller supplied. Migration 0036 (generated) and 0037 (hand-written: the function and trigger; no new grants, so the runtime role still updates `items` and `captions` only).

**Data.** `savePortfolioForAccount(db, accountId, { items, captions?, expectedRevision })` runs one compare-and-swap statement and throws `StaleRevisionError` (no data on it) when no row comes back; `UNSAVED_REVISION` (0) names "no draft yet". `findPortfolioForAccount` returns `revision`.

**HTTP.** `GET /me/portfolio` → `draft.revision` (0 until first saved). `POST /me/portfolio` takes `{ items, captions?, expectedRevision }`; stale → 409 `{ error: { code: 'stale_revision', requestId } }`; the rest as B2/B3. `profile_required` 409 unchanged.

**Screen.** Organize: the save sends the revision the screen was opened (or last saved or reviewed) at. On `stale_revision`, a warning section (`role="alert"`, "Not saved: this portfolio changed elsewhere") appears above the selection with the edits, order, captions and live preview untouched and the status line reading "Not saved. See the warning above." One button, "Review the saved version", fetches the saved draft and lists its images and captions under the warning; from then on the screen is based on that revision, so Save, said plainly, replaces it with the edits on screen; a second button, "Replace my edits with the saved version", loads it into the editor. Nothing happens until one of those is pressed; saving again without reviewing is refused again.

**Environment (task-owned).** Worktree `/home/dustin/Projects/modeling-standard-b4-portfolio-stale-save`; PostgreSQL container `ms-b4-postgres` on `127.0.0.1:5444`; `.env` points only there. No demo service started; browser tests use their own ephemeral server.

**Commands run (B4 instance only, uncommitted working tree):**

| Command | Result |
|---|---|
| `npm run check` | exit 1 at `db:drift` only: `drizzle-kit generate` reports no schema changes, but the drift step requires committed migrations and these are uncommitted (as in B2 and B3, it passes after the commit). `typecheck`, `lint` and `db:identifiers` run individually: exit 0; 38 migration files, no identifier over 63 bytes |
| `npm run build` | built; no `dist/demo`; no built module outside `dist/toolkit/` imports the toolkit operations |
| `npm test` | 42 files, 646 tests passed (+10 over B3: 3 database, 7 HTTP) |
| `npm run test:demo` | 5 files, 33 tests passed (+1 browser case) |

**Tests.** `tests/database/portfolio.test.ts` (revisions from 1; stale, ahead and repeated-first saves refused with nothing written and a data-free error; malformed revisions refused; six simultaneous first saves → one winner; four competing updates on one revision → one winner; owner B's revisions separate; by direct SQL as the runtime role: a supplied revision replaced by 1, +1 per update, unchanged after a refused write, no UPDATE privilege on `revision`, the compare-and-swap matching no row when stale; revision 0 refused by the CHECK even with the trigger off). `tests/http/portfolio.test.ts` (revision issued on GET, required on POST, +1 per save; a two-tab conflict answered 409 with no draft data; stale ahead, behind and at the integer limit; first-save races and update races over HTTP; twelve malformed or missing revisions and three other spellings → 400 with the draft unchanged; owner A/B isolation of revisions and of the stale answer; reload and application restart). `tests/demo/toolkit.test.ts` (a stale save by B over the demo harness). `tests/demo-browser/toolkit.test.ts` (A in two tabs at 1280: tab 2 saves; tab 1's save is refused, every edit and the preview stay, the server is untouched; Review shows the saved version beside the edits; the explicit load replaces them and the next save lands; tab 2, now stale, is refused, refused again unreviewed, reviews, keeps its edits and saves over). Pinned lists updated: trigger functions; the runtime-role case title names the revision as never updatable.

**Visual evidence.** `test-results/demo/toolkit-desktop-portfolio-conflict.png` (untracked, regenerated per run).

**Known limitations.** The warning says "another tab or window"; it cannot tell which. The comp card and profile still have last-write-wins (outside this slice). The revision is visible to the owner in the JSON view and is a plain counter; it carries no content.

**Integration gate.** This private synthetic slice does not authorize real use. Integrate only after B1–B3 and owner authorization.
