# Local synthetic demo

> **S09 walkthrough (2026-10-15; presentation pass 2026-10-15).** The demo now walks a synthetic **Photographer** and **Model** from a draft brief to **READY TO SIGN**: say who is on site, share, settle what was left to decide, let the model set her open parameter and decline a request (it simply disappears), tick as each party, group-check ordinary material (the deliberate items refuse it), watch items go green, untick to lose readiness, and retick. It stops at READY TO SIGN; signing arrives in S10–S11. The S03–S05 presentation (versions, tick grids, R1, R2) was retired in S08.

A record inspector for showing what is built, with invented records, on a developer machine. Not a product flow, not a credential mechanism, not real-use approval (Gate 2).

## Run

```
npm run demo:reset   # drops and recreates modeling_standard_demo, migrates, loads fixtures
npm run demo         # http://127.0.0.1:3100/ (DEMO_PORT to change)
npm run demo:export  # .demo/modeling-standard-demo.html — portable, read-only snapshot
```

The snapshot is one HTML file with the inspector's markup, styles, script and every record it shows inlined. It opens from disk on any device, makes no network request (its CSP is `default-src 'none'`), refuses every write, and says on every screen that it is a read-only synthetic snapshot. It contains only what the inspector shows: synthetic records and fixture labels; no credentials, database location or internal principal (tested).

The inspector's **Open decisions for Cory** view walks through the remaining Cory seams: D04 no-means-no wording, the D04 signing act, and the remaining D05 vocabulary. For each it shows what is already decided and built, what is still open, what waits on it, and the smallest question. It poses questions only. Below the cards it lists what is **decided but not built** (DECIDED ≠ IMPLEMENTED), and **counsel items**, labelled as not Cory homework. `decisions/README.md` remains the full list.

Uses the same `.env` credentials, pointed at `modeling_standard_demo`.

## Boundaries

- **Never in production.** `src/main.ts` and `src/app/operation-list.ts` do not import `src/demo/`; `tsconfig.build.json` excludes it from `dist/`. Tests pin both.
- **Guards.** Refuses to start unless `HOST` is loopback, the PostgreSQL server is on TCP loopback, and the target database is exactly `modeling_standard_demo`.
  - The server check uses the pinned `pg` driver's own resolution (`ConnectionParameters`), so `?host=`/`?port=` overrides, a host taken from `PGHOST` and Unix-socket hosts are all judged as the driver would use them. Sockets are refused.
  - The verified target (host, port, database, user, password) is what is handed to the driver; no connection string is reinterpreted later. This covers the runtime, migration, reset-admin and export connections, and every check runs before any client exists.
- **Host header.** Requests are served only when the `Host` header is exactly `127.0.0.1`, `localhost` or `[::1]` with the server's own port. Userinfo, paths, query, fragment, whitespace and leading zeros are refused with 421 (this also blocks DNS rebinding).
- **One principal.** A fixed synthetic `demo-operator`. It stands for nobody, is never a party, and only creates projects (real `project.create`) and reads its own records.
- **Same boundary.** The two inspector reads (`GET /demo/projects`, `GET /demo/projects/:id/record`) are ordinary protected operations with strict input/output and the S01 creator-only policy, registered through `createApp({ additionalOperations })`.
- **Front door.** `src/demo/server.ts` serves the static UI and forwards everything else to the app with `app.inject`, passing only `content-type`. Fastify's "every route is an operation" rule is untouched.
- **Fixtures.** Parties, pair-scope records, brief items, presence, sharing, settlement and ticks are written with the S01, S02, S08 and S09 data functions (fixture construction; no product path exists — D03, D12). Labels such as "the model" are demo annotations in `.demo/fixture.json`, never stored in the product database. Every stored text is marked `[synthetic]`.
  - **Fixture 1 (D01):** two parties, one pair, no money (D01 had none). A universal item with a subject (a declaration); a shared project-wide item; a pair-scoped shared request with a subject; an open parameter awaiting its subject; a decide-together item.
  - **Fixture 2:** parties A, B, C with pairs A–C and B–C; a universal item, a shared item, and a fee per pair (A–C with a value, B–C to be decided together).
  - **Fixture 3:** no parties and an empty draft brief.
  - **Fixture 4:** the walkthrough finished — Photographer and Model on site, shared, every pending value settled, every item green, **READY TO SIGN**. It is what the portable snapshot shows as the S09 end state.
  - **No no-means-no item.** Its wording is Cory's to write (D04); no placeholder is created. A keyed item without wording, if one exists, is shown only as instrumentation — "item key `no_means_no` — wording not materialized (draft)" — never as document text.
- **The record.** `GET /demo/projects/:id/record` returns the project, its parties, its pair-scope records (`agreements`: id and the two parties) and the live brief, or `null`: its `phase` (`draft` or `live`), `ready` (derived), `presence` (each party's on-site fact) and its items — the stored fields plus each item's derived `approverIds`, `tickedBy` and `green`. No time, author, proposer, revision, decline, requiredness or finality field exists to show.
- **The inspector.** Product story first, engineering second:
  - **Orientation band** (sticky, so it stays in view while acting): the cast, the stage headline — DRAFT, LIVE ("n of m green · k still open") or READY TO SIGN — and, once live, the **Acting as** switch. A stage change seen after an act (now live; ready to sign; no longer ready) pulses the band once with a one-line note that is gone on the next render. On a phone the band is compact and the selected brief comes before the project list.
  - **Milestone panel** at the top of the brief says the stage in words. READY TO SIGN reads: everything currently in the brief is resolved and green-lit; signing is the next step and is not built in this demo yet.
  - **Three layers**, each with its colour and audience: Universal (everyone on site sees these), Shared (everyone in the collaboration sees these), Private money (only the pair it belongs to). Items are numbered by display order (no gap ever betrays a declined item).
  - **Plain-language labels** derived from stored fields, nothing stored changes: "Model sets this", "Request · only Model can decline it", "Declaration by Model", "Waiting for Model", "Decide together · still open", "Needs its own tick", "Private · only Model & Photographer see this", "Between Model & Photographer · everyone can see it". Pending reads as neutral waiting, not as an error.
  - **Green state.** Each live item shows ✓ or ○ per approver and turns green when all have ticked. Tick is the primary action; once ticked, Untick is a small secondary link.
  - **Engineering notes** (banner toggle, off by default, remembered per browser) reveal decision and slice references, project and record ids, the Parties and Pairs records, and the schema labels (`project-wide`, `subject ·`, `shape ·`, `pending:`, `private to this pair · Pair: …`, `between · Pair: …`, `item key …`), plus the caveat that READY TO SIGN is the structural all-green rule, not real-use completeness (Gate 2).
  - Wording is shown only when stored; a keyed item without wording is shown only as instrumentation. Current state only: no activity feed, timestamps, revision count, "declined by", version number, read receipt or audit trail.
- **Not a party view.** The inspector shows the whole stored record. D10 is decided for photo shoots; party-visible reads exist as data functions (S08, S09), but no party view is built.

## The walkthrough (live demo only)

"Start the walkthrough" (`demo.sim.scenario.start`) creates a project with a synthetic Photographer and Model, their pair, and a draft brief: two universal items (one a declaration by the model), shared items (call time, a decide-together delivery date, a coverage level the model sets, a pair-scoped deliverable, a pair-scoped album-cover request about the model) and the fee. No no-means-no item. The labels Photographer and Model are kept in this browser only; the database stores no role.

On the brief:
- **Draft:** On site / Not on site per party, then **Share the brief**. Sharing is refused until every party has an answer.
- **Live:** the band's "Acting as" switch chooses the synthetic party. Per item, that party can: **Settle together** (decide-together), **Set as Model** (only the subject sets an open parameter; others see "Waiting for Model"), **Decline as Model** (only the subject, only a non-universal request; it disappears, with a transient "Request removed." toast), **Tick** / **Untick**. **Group-check** is a shortcut that ticks each chosen ordinary item individually; the fee and coverage level are shown disabled ("Needs its own tick") and the server refuses them if forced.
- **Ready to sign** appears when nothing is pending and everything is green — in the band and as the milestone panel — and goes away on any untick, with a "No longer ready to sign" note in the band.

Demo-only operations under `/demo/sim/` (`src/demo/simulator.ts`), protected and creator-only through the brief or item; never in the production list:

| Operation | Path |
|---|---|
| `demo.sim.scenario.start` | `POST /demo/sim/scenarios` |
| `demo.sim.brief.presence` | `POST /demo/sim/briefs/:id/presence` |
| `demo.sim.brief.share` | `POST /demo/sim/briefs/:id/share` |
| `demo.sim.brief.group-check` | `POST /demo/sim/briefs/:id/group-check` |
| `demo.sim.item.settle` | `POST /demo/sim/items/:id/settle` |
| `demo.sim.item.parameter` | `POST /demo/sim/items/:id/parameter` |
| `demo.sim.item.decline` | `POST /demo/sim/items/:id/decline` |
| `demo.sim.item.tick` / `untick` | `POST /demo/sim/items/:id/tick`, `/untick` |

Every act is a simulation: in the product each person acts only for themselves (D12), signed in (D03; not built). The rules are the S09 data functions' and the database's; refusals come back as 409s with stable codes (`presence_missing`, `not_subject`, `not_request`, `deliberate_tick`, `not_an_approver`, `still_pending`, `not_draft`, …). Hidden in the portable snapshot, which shows state only.

## Regression

`npm run test:demo` (needs `CHROME_PATH`, plus the usual database settings) runs the whole demo in a real browser through `playwright-core`, with no browser download. It covers:
- reset and the four fixtures: drafts by layer with their labels, money private to its pair, an empty brief, and Fixture 4 at READY TO SIGN;
- the full walkthrough on desktop: draft, refused share, presence, share, settle, open parameter by its subject only, decline (the item disappears and numbering shows no gap), individual ticks, group-check with the deliberate item refused even when forced, all green, untick (readiness lost), retick, **READY TO SIGN** — with no enabled signing control;
- no version, R1, R2, sealed, affirmation, "declined by", "changed by", revision, activity, audit or read-receipt text in any project view, and no version or R1/R2 text on the decisions view, which names only the current seams;
- no superseded wording; no product-wording placeholder presented as document text, and a keyed item without wording rendered as instrumentation only;
- project creation and its empty states; stale navigation; the portable snapshot from `file://` with zero network requests and no controls; reset repeatability;
- presentation: cast and stage in the band, engineering notes collapsed by default and revealed by the toggle, plain-language labels beside the schema labels, neutral waiting labels, the band's transition notes, the READY TO SIGN milestone copy, the band still on screen after the final tick, and on a phone the band in the first half-screen and stuck to the top while scrolling;
- desktop (1280) and mobile (390) rendering with no horizontal scroll and no browser errors;
- every demo route returning 404 from the production application.

Milestone screenshots (ids masked, transient toast cleared, band pulse finished, so they are stable run to run), each stage at desktop (full page) and mobile (`-mobile-top` is the first screen, `-mobile` the full page):
- `walkthrough-1-draft-*`;
- `walkthrough-2-live-open-*` (just shared, items still open);
- `walkthrough-3-live-resolved-*` (settled, set and declined, nothing ticked);
- `ready-to-sign-desktop.png`, `-desktop-top.png`, `-desktop-after-tick.png` (what is on screen right after the final tick), `ready-to-sign-mobile.png`, `-mobile-top.png`, `-mobile-scrolled.png` (band stuck to the top);
- per-fixture shots. They are milestone evidence, not design approval.

Screenshots go to `test-results/demo/` and are uploaded by CI as `demo-screenshots`. The suite resets `modeling_standard_demo`.

`demo:reset` refuses while a demo server is connected (the migration role cannot end the runtime role's sessions) and says to stop `npm run demo` first.

## Deliberately unavailable

Shown disabled: add a party; compose the brief; share, resolve and tick for real (data functions only; simulated here); sign (S10–S11); view as a party.
