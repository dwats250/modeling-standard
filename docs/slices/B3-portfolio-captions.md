# Slice B3 — Private portfolio captions

<!-- This template is not implementation authority. The current Dustin-approved work order controls scope and permissions within binding product and real-use boundaries. -->

Status: Implemented as a synthetic, private local-demo slice on `feat/b3-portfolio-captions`, stacked on B2 (`feat/b2-private-portfolio-drafts` at `08eb2c7`, PR #43). See "As built".

## Outcome

A synthetic signed-in professional writes, optionally, one brief plain-text caption under any image selected in the B2 portfolio draft. Captions show under their images in the organizer's live preview and the full preview, stay with their image when the order changes, go when the image is removed (adding it again starts blank), and survive save, reload and an application restart. Only the owner sees them.

## Product decisions required

None beyond B2's. A reversible synthetic presentation detail authorized by the Dustin work order, not product policy: one caption per selected image, at most 120 characters, one line, blank meaning none.

## Invariants

- Owner-only, as B1 and B2: the owner is the session's account; no route or body names an account, profile or draft.
- Strict input: a caption is accepted only for a selected fixture key, as one trimmed line of plain text within the limit; unknown fields refused. The database holds exactly one caption per item (blank allowed), none longer than 120 characters.
- Captions are written to the screen with `textContent` only; markup-like text is shown as text.
- Runtime role: UPDATE of `items` and `captions` only; still no DELETE, owner or time changes; database time.
- Toolkit routes stay in the local synthetic demo only (production and staging: generic 404).

## Explicitly out of scope

Uploads or image bytes, external URLs, public profiles, directory, sharing, messaging, payments, sign-in changes, participant signing, retention, new services or frameworks, Track A semantics. B2's as-built record stands; captions were outside that slice.

## As built (2026-10-27)

**Model.** `portfolio_draft.captions text[] default '{}'`, positional beside `items` ('' = no caption). CHECK `portfolio_draft_captions_aligned`: as many captions as items, one-dimensional, 1-based. The B2 trigger function `portfolio_draft_check_items` (same name, replaced) also refuses a NULL caption or one over 120 characters (`check_violation`, constraint `portfolio_draft_caption_length`). Migration 0034 (generated, plus one hand-written backfill of blank captions for existing drafts) and 0035 (hand-written: the function, `GRANT UPDATE (captions)`).

**HTTP.** `GET`/`POST /me/portfolio` views now carry `draft.captions` (an object of the non-blank captions by fixture key) and `maxCaptionLength`. `POST` takes `{ items, captions? }` where `captions` is an object keyed by selected fixture keys; a blank or omitted caption is none; a caption for an unselected or unknown key, over 120 characters, with a line break or control character, a non-string, or a non-object `captions`: 400. A singular `caption` field is refused; only the keyed `captions` object is accepted.

**Screens.** Organize: a "Caption (optional)" text field under each selected image (maxlength 120, 44 px tall, labelled "Caption for <image>"); typing updates the live preview and the save status; captions go with their image through ↑ ↓ and out with Remove. Preview (compact and full): the caption, when there is one, under its numbered image. Unsaved captions carry to the full preview and back.

**Environment (task-owned).** Worktree `/home/dustin/Projects/modeling-standard-b3-portfolio-captions`; container `ms-b3-postgres` on `127.0.0.1:5441` (volume `ms-b3-pgdata`); `.env` points only there. No demo service started; browser tests use their own ephemeral server.

**Commands run (B3 instance only):**

| Command | Result |
|---|---|
| `npm test` | 42 files, 636 tests passed (+4 database and HTTP cases; one of three runs reported a single failure that did not recur, output not kept) |
| `npm run test:demo` | 5 files, 32 tests passed |
| `npm run check` (after commit) | exit 0; no schema changes; 36 migration files, no identifier over 63 bytes |
| `npm run build` | built; no `dist/demo`; no built module registers a `/me` route |

**Tests.** `tests/database/portfolio.test.ts` (captions beside items through reorder and removal; by direct SQL as the runtime role: misaligned, NULL, overlong and two-dimensional captions refused; blank, short and 120-character captions kept; items alone no longer updatable without captions). `tests/http/portfolio.test.ts` (set, edit, clear, trim, reorder, remove and re-add; eleven refused caption bodies leaving the draft unchanged; B cannot read or change A's captions; restart). `tests/demo/toolkit.test.ts` (A's caption absent from B's view). `tests/demo-browser/toolkit.test.ts` (A at 1280: captions typed, kept through reorder, dropped on removal, unsafe text shown as text, carried to the preview and back, saved, reloaded, caption-only edits dirty the status; B at 390: its own caption, 44 px fields, crafted caption requests refused; restart). Pinned lists updated: runtime updatable columns.

**Visual evidence.** `test-results/demo/toolkit-{desktop-portfolio,desktop-portfolio-preview,phone-portfolio,phone-portfolio-preview,phone-portfolio-empty}.png` (untracked, regenerated per run).

**Known limitations.** Last write wins between two tabs (addressed by B4, `B4-portfolio-stale-save.md`). A caption refused by the server (only possible by a crafted request, since the field enforces the length) is reported on the save status line, not beside the field. The preview grid's first, larger image leaves its caption below the frame at the same small size as the rest.

**Integration gate.** This private synthetic slice does not authorize real use. Integrate only after B1 and B2 and owner authorization.
