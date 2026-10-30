# Demonstration session — continuation note

## Recovery and reviewer-readiness checkpoint — 2026-10-29

This is the latest verified integration checkpoint; older branch/session pointers below are historical context only.

- **Remote main:** `aa9d686aa33c8d3e905a1dd9c07f366831c2242b`. All six requested PR heads were fetched and unchanged from the rehearsal: #45 `87064ba`, #41 `bee9f4e`, #42 `a70be0e`, #43 `08eb2c7`, #44 `0578151`, #46 `aaff4d6`.
- **Preserved combined candidate:** `/home/dustin/Projects/modeling-standard-integration-20261029`, branch `test/combined-integration-20261029`, clean at `d0b111432f654ab49ab37ceb725e569f3914c3b9`, exactly 18 commits ahead of main and containing each of those six heads once in the required order. It is a local test candidate, not a merge or deployment.
- **Rehearsal evidence at that unchanged candidate:** migration/check verification, build, dependency audit (zero findings), 42 test files / 647 automated tests, and 5 browser test files / 33 demo tests passed against task-owned PostgreSQL. Browser artifacts include desktop/phone toolkit previews, the portfolio conflict screen, and S14 final-record views. This checkpoint reuses that recorded run; it was not rerun during the current documentation update.
- **Integration seam:** local merge commits are #45 `d2595c7`, #41 `55271fb`, #42 `21a2687`, #43 `0da421a`, #44 `053ca9a`, #46 `d0b1114`. Mechanical overlaps in `docs/engineering/DEMO.md`, `docs/engineering/README.md`, and `src/demo/application.ts` were resolved additively, retaining both S14 participant final-record behavior and Track B demo operations. The combined test/build/browser run passed after resolution.
- **PR review state:** #41–#46 remain open, with hosted CI and GitGuardian green; no PR has an independent GitHub review recorded. B2 #43 is stacked on B1 #41, B3 #44 on #43, and B4 #46 on #44. Recommended integration order remains #45 → #41 → #42 → #43 → #44 → #46.
- **Reviewer access:** current inspection found no `ms-staging` or `ms-demo` session, no listener on 3130/8443, and no staging process on loopback port 3130. Asher's Tailscale Serve exposes only the unrelated Options Observatory on port 80. No staging data, Tailscale policy, or access grant was changed. Remote reviewer access is not ready; do not point Cory at port 80 or expose the local synthetic-account chooser remotely.
- **Current next step:** complete the six-PR integration only under Dustin's integration authority. Then prepare an explicitly restricted reviewer endpoint/access path before sending Cory a bookmark. The revised [manual acceptance](MANUAL-ACCEPTANCE.md) contains the single synthetic walkthrough and Windows 11 checklist; its remote link is intentionally pending.

The candidate's test database was task-owned and stopped after verification; its retained volume is not a shared development or staging database. The active `ms-builder` session is in the B4 worktree and was left untouched.

Work item: *Modeling Standard — Demonstration Session PRD*, v2 (2026-10-20), increments A, B, C, D and F, as amended by Dustin's authorization of 2026-10-20 (summarized below). This note lets the work resume after a session reset. It is not a product decision.

- Base: `main` at `820e1bf9445ba3293ce59308d6a2c35a02e5870c` (verified locally and on `origin`).
- Branch: `demo/participant-journey`.
- **Current state:** the demonstration work is combined with the separately built S10 slice on `integration/mobile-demo-s10`; see "Combined baseline" at the end. The sections between here and there record the demonstration session as it happened.

## Authorization amendments (take precedence over the PRD)

1. Q-E = no. No S10/S11, freeze, signatures, contract storage or migrations. The journey ends at READY TO SIGN. PRD §9 is future design input only.
2. Q-A = local/LAN plus the existing read-only export. No remote deployment. The interactive demo and the read-only snapshot are distinguished on screen.
3. Q-D = the existing stylesheet plus the design study's shared information architecture.
4. Composer reduced: no "closed set" term, no `physical_contact` row, no optional extra shared rows. Presence stays a per-party fact. Coverage level follows the walkthrough pattern, labelled as a synthetic example. The acceptance example uses coverage level as the open parameter.
5. Operator-level composition, sharing and the separate settlement simulation control are authorized; their open product questions are documented limitations.
6. Server-side visibility pre-checks, membership checks, hidden-item refusal tests and production isolation are preserved and verified on actual HTTP payloads.
7. Report only results run in this environment.

## Increment status

| Increment | Status | Last passing check |
|---|---|---|
| A. Reliable launch | done | `demo:fresh` from clean, twice, plus fail-fast; `npm test`; `test:demo` |
| B. Composer | done | `tests/demo/shoots.test.ts`; `journey.test.ts` (compose at 1280 and 390) |
| C. Participant views | done | `tests/demo/participant.test.ts` (privacy tampering on Fixture 2) |
| D. Live resolution | done | `participant.test.ts`; `journey.test.ts` (READY TO SIGN at 1280 and 390, untick/retick, decline path) |
| E. S10 freeze/withdrawal | deferred in this session (Q-E = no); S10 was later built as its own slice on `stage-1/s10-signing-freeze` (no signing, no demo change) | see "Combined baseline" |
| F. Delivery | done | `npm run check`; `npm test` 29 files / 357 tests; `npm run test:demo` 2 files / 21 tests; verbatim clean-clone run |

## Exact next action

See "Combined baseline" for the current next action. As recorded at the end of the demonstration session: none in this slice. Next: Dustin and Cory run the journey (handoff below). The S10/S11 signing slice is separate work; its design input is PRD §9 (freeze as an internal mechanism, fingerprint, signature evidence, withdrawal before finality, LB-16 refusal, presence copied into the contract) and it needs its own slice document and migrations.

## Choices made (for Dustin to see)

- **UI routes are hash routes** (`/#/shoots/new`, `/#/shoots/<id>`, `/#/shoots/<id>/as/<party>`) rather than the PRD's path shapes, so reload works without server-side page routes. API routes follow the PRD's shape under `/demo/shoots/…`.
- **Operator-level presence, share and settle reuse the existing simulator routes** (`/demo/sim/briefs/:id/presence`, `/share`, `/demo/sim/items/:id/settle`) instead of adding project-keyed duplicates. Settle is reachable from the participant screen only through the separate *Simulation controls* block.
- **Participant routes:** `GET /demo/shoots/:projectId/as/:partyId`; `POST …/as/:partyId/items/:itemId/{tick,untick,decline,parameter}`; `POST …/as/:partyId/group-check`. Each act answers with the party's refreshed view. The visibility pre-check is the operation's `load`, so it runs before any data function; any miss is the framework's generic 404 (`not_found`), the same as for a nonexistent id. An item that disappears between the pre-check and the act (a concurrent decline) is also the generic 404.
- **Participant DTO** carries no `position` (a gap would reveal a declined request or another pair's fee), no pair-scope record id (a pair-scoped item carries `between: [partyId, partyId]` instead), and no pairs list. `ready` is present only for two parties and one pair. Progress counts are over the party's visible items.
- **Composer wording:** each row has fixed synthetic wording; typed text and values are stored with a `[synthetic] ` prefix (added when absent), as the fixtures are. "Set now" for coverage stores the Model's open parameter already settled (an S08-admitted state); "leave it for the Model" stores it pending. The concept is the first shared item and the shoot's title in the annotation store (the screen heading).
- **Layer placement** of the keyed coverage item (shared) is a demo choice, as in the walkthrough; every layer heading on the composer and participant screens says so.
- **Annotation store:** `.demo/annotations.json`, whole-file atomic replace, writes serialized within the server process. Reset replaces it with exactly the fixtures' annotations and deletes the old `.demo/fixture.json`. Scenario and composed shoots store no pair label; the inspector derives one from the two parties' labels.
- **Inspector** moved to `/inspector` (engineering aid), linked from the entry screen and back to the shoots. Its walkthrough button now writes labels to the store.
- **Read-only export** (`npm run demo:export`) remains the inspector snapshot, now labelled with the store's labels. It does not include participant views (the PRD made that optional "if cheap"; it was not).
- **"Live"** is flagged on screen as a proposed word (D05) wherever it appears as a stage.
- **One existing test was made robust, not weakened:** the decline row-count check in `tests/database/live-briefs.test.ts` counted rows across the whole test database and became racy once the new demo suites wrote to it in parallel. It now counts the test's own project and asserts exactly 2.
- **Commits:** A is its own commit. B, C and D share one commit: the composer, participant routes and live resolution share one route module and one UI module (`journey.js`), so a three-way split would have been artificial.

## Open seams hit (not answered here)

- **Q-S — who enters a decide-together value, and how** (Cory). Settle is an unattributed operator act in *Simulation controls*, with that question on screen.
- **Who composes / the composing flow** (Cory, participant surface). The composer is operator-level and says so; no in-place draft editing.
- **The visible signing act** (D04, OPEN). Not built; the milestone says signing is the next step and is not built.
- **No-means-no wording** (D04, OPEN). No item or placeholder; the entry screen lists the omission.
- **`no_means_no` is not in `DELIBERATE_TICK_KEYS`** although D04 says each person affirms it individually. Unchanged here; for the catalogue homework.
- **Presented-version / response words** (D05, OPEN). "Live" is flagged as proposed.

## Known defects / limitations

- The simulated party is a URL parameter: on LAN anyone on the Wi-Fi can act as any person by editing the address. Acceptable only because everything is synthetic; stated on the entry screen and in `DEMO.md`.
- The inspector (engineering aid) still has its pre-existing "Settle together" form inside the simulated party's action area; the participant screens never attribute settle to a party.
- Settle and parameter values typed on the participant screen are prefilled with `[synthetic] ` but not forced to keep it.

## Handoff

**Open and do (on Asher, from a clean checkout of `demo/participant-journey`):**

```
npm run db:up                 # only if PostgreSQL is not already up (Docker; db/provision.sql)
cp .env.example .env          # first time only
npm ci
npm run demo:fresh            # open http://127.0.0.1:3100/
npm run demo:fresh -- --lan   # for a phone on the same Wi-Fi: open the printed 192.168.x.x URL
npm run demo:export           # .demo/modeling-standard-demo.html, read-only inspector snapshot
```

Then: **New shoot** → compose → set both on site → **Share the brief** → **Look at it as Model** → set the coverage level → switch to **Photographer** in the band → enter the agreed values in **Simulation controls** → group-check and tick the fee and coverage → switch to **Model** → tick → **READY TO SIGN**. Untick anything to see "No longer ready to sign"; retick. The **Declined request** card shows decline-and-continue; **Three-person fee case** shows each person only their own fee.

**Verification run in this environment:** `npm run check` (pass); `npm test` 29 files, 357 tests (pass, twice); `npm run test:demo` 2 files, 21 tests (pass; Chrome at `/usr/bin/google-chrome`); `npm run build` excludes `src/demo`; `demo:fresh` twice from clean gives identical fixtures, and a third run while serving exits 1 with "stop the running demo first"; `--lan` serves on the machine's private addresses and refuses a foreign Host header (421); `demo:export` writes the snapshot; the commands above run verbatim in a fresh clone (with the database already up). Greps over new code, UI strings and export: no "declined by", history, timestamp or AI attribution.

**Not personally verified:** a real phone on the LAN (only the LAN address from this machine was tested); `npm run db:up` from a fresh clone (the existing container was already serving port 5432; a second compose project from another directory would collide on that port).

## Mobile presentation pass (branch `demo/mobile-presentation`)

Based on `demo/participant-journey` at `2bca5ae` (PR #31, untouched). Presentation only: no route, rule, permitted action, privacy behaviour or stored data changed.

- The journey has its own stylesheet (`journey.css`) following `planning/I-creative-direction.md` §10; the inspector keeps `styles.css`.
- Welcome with one primary action; examples, inspector and engineering notes in a Demo menu; caveats, proposed vocabulary, the catalogue caveat and decision references consolidated in About this demo, reachable from the persistent Synthetic demo indicator.
- Composer in section cards with segmented states, progressive value boxes, natural invented examples and session-kept input.
- The brief as one document; a next-step card for the current person and a waiting state when they are done; a milestone card at READY TO SIGN.
- `[synthetic]` marks are kept in storage and hidden in display; values typed on the screens are stored marked.
- Presentation assertions in `tests/demo-browser/journey.test.ts` were updated to the new structure and wording; behaviour, refusal and privacy assertions kept.

## Combined baseline (branch `integration/mobile-demo-s10`)

The completed demonstration work and the S10 slice, combined and verified together. Nothing here is on `main`; `main` is still `820e1bf`.

| Source | Head | Pull request | Contains |
|---|---|---|---|
| `demo/participant-journey` | `2bca5ae` | #31 (open) | Increments A–D and F: launch, annotation store, composer, participant views and live resolution to READY TO SIGN |
| `demo/mobile-presentation` | `276fe87` | none | `demo/participant-journey` plus the mobile presentation pass |
| `stage-1/s10-signing-freeze` | `78bc4e0` | #32 (open) | S10: the internal signing phase, fingerprint v1, withdrawal by untick, migrations 0023–0025 (0025: sharing only in READ COMMITTED) |

**How it was built.** From `main` at `820e1bf`: `git merge --no-ff demo/mobile-presentation`, then `git merge --no-ff stage-1/s10-signing-freeze`. Both merged without textual conflicts. The one expected overlap, `src/demo/operations.ts`, auto-merged: the demo operation factory and participant routes, and S10's `signing` in the inspector record's phase enum. Checked by hand and kept:

- the polished participant journey and its privacy pre-checks (participant routes stay live-only);
- `signing` in the inspector's phase schema, and S10's refusal-code mappings next to the simulator factory;
- S10's fingerprint, withdrawal and concurrency guards, and migration 0025's READ COMMITTED rule for sharing;
- the project-scoped decline-count fix in `tests/database/live-briefs.test.ts`, which was identical on both sides.

**One integration defect, fixed.** `tests/demo/shoots.test.ts` pinned the last migration to 0022 (23 files). That was true on the demo branch and false once S10's migrations are present. It now states its intent independently of slice numbering: every migration file is journalled, none comes from the demo, and no project, party, pair or brief table has a name, role, label or title column. Nothing else changed.

**What the combined baseline does.** Everything in "Mobile presentation pass" above, unchanged: compose → share → look as each person → resolve → READY TO SIGN, at phone and desktop widths. Underneath, the S10 data functions exist: a READY TO SIGN two-party brief can be frozen for signing internally and withdrawn by an untick. No screen, route or control freezes or signs anything; the demo never enters `signing`. Signing (S11) is not built.

**Verified on the combined tree.** Run against an isolated PostgreSQL 17 container on `127.0.0.1:5433` provisioned from `db/provision.sql`, so the presentation demo's database on 5432 was never touched:

- `npm run check`: passed (typecheck, lint, `db:drift`, `db:identifiers`: 26 migration files).
- `npm test`: 30 files, 387 tests passed, twice.
- Among them, `tests/database/migration-upgrades.test.ts`: 11 populated upgrades passed, including 0020 → current, 0022 → current and 0024 → current.
- Among them, `tests/database/brief-signing.test.ts`: 28 passed, including the sharing-isolation regressions under REPEATABLE READ and SERIALIZABLE.
- `npm run test:demo`: 2 files, 22 browser tests passed. The journey suite covers compose → share → participant resolution → READY TO SIGN and back at 1280 and 390, the decline path, the three-person case and no browser errors.
- `npm run build`: `dist/` has no `src/demo`.

**Recommended integration order.**

1. PR #31 (`demo/participant-journey`) into `main`.
2. `demo/mobile-presentation` into `main` (it has no pull request yet).
3. PR #32 (`stage-1/s10-signing-freeze`) into `main`.
4. The integration fix commit (the `shoots.test.ts` change) with or right after step 3. Without it, `main` fails that one test as soon as both the demo and S10 are present, in either order.

Equivalently, after step 1, `integration/mobile-demo-s10` itself can be merged: its tree is the combined, verified result. Dustin owns the PR and merge steps.

**Still open.** S11 (signatures and the final contract), whose affirmation-evidence design is unresolved. The visible signing act (D04). The no-means-no wording (D04). Who composes, who shares and who enters an agreed value (Cory). Chaperone participation and three-party signing. What a person sees while a brief is signing. The required-term catalogue (Dustin drafts, Cory reviews). Gate 2 (D06) for any real use.
