# Demonstration session — continuation note

Work item: *Modeling Standard — Demonstration Session PRD*, v2 (2026-10-20), increments A, B, C, D and F, as amended by Dustin's authorization of 2026-10-20 (summarized below). This note lets the work resume after a session reset. It is not a product decision.

- Base: `main` at `820e1bf9445ba3293ce59308d6a2c35a02e5870c` (verified locally and on `origin`).
- Branch: `demo/participant-journey`.

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
| E. S10 freeze/withdrawal | deferred (Q-E = no) | — |
| F. Delivery | see the handoff section | — |

## Exact next action

See the handoff section at the end; if it is absent, F is unfinished: rewrite `docs/engineering/DEMO.md`, run the verification list, push.

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
