# Local synthetic demo

> **Historical implementation visualization (2026-10-15).** The inspector's version view — successive sealed versions, earlier versions kept, per-version tick grids — shows how S03–S05 storage works. It is **not the current product model**: Cory's model has one live brief that cycles before signing, keeps no intermediate states, and makes only the final contract evidence (handoff correction HC1 in `decisions/2026-10-09-15-cory-reconciliation.md`). The demo's open-seams view also still lists **R1 and R2**, which are withdrawn: both rested on handoff errors (HC1, HC2). Demo code is unchanged in this correction pass; the next term-model sprint will replace or retire this presentation.

> **Reconciled with Cory's 2026-10-14/15 rulings** (Sprint 1, Phase 2). The demo no longer claims D03, D10, "on site" or universal omission are undecided, no longer offers a universal-omission or escalating resend, calls S05 rows tick rows rather than signatures, and labels the two-layer storage as a known-stale stand-in. What the demo still shows only because S03–S05 storage has not been rebuilt is listed under "Still stale by construction" below.

A record inspector for showing what is built, with invented records, on a developer machine. Not a product flow, not a credential mechanism, not real-use approval (Gate 2).

## Run

```
npm run demo:reset   # drops and recreates modeling_standard_demo, migrates, loads fixtures
npm run demo         # http://127.0.0.1:3100/ (DEMO_PORT to change)
npm run demo:export  # .demo/modeling-standard-demo.html — portable, read-only snapshot
```

The snapshot is one HTML file with the inspector's markup, styles, script and every record it shows inlined. It opens from disk on any device, makes no network request (its CSP is `default-src 'none'`), refuses every write, and says on every screen that it is a read-only synthetic snapshot. It contains only what the inspector shows: synthetic records and fixture labels; no credentials, database location or internal principal (tested).

The inspector's **Open decisions for Cory** view walks through the Cory seams as they stood after Sprint 1: D04 no-means-no wording, D04 signing act, R1, R2 and the remaining D05 vocabulary. R1 and R2 have since been withdrawn (see the note above), so the view currently over-states the open seams. For each it shows what is already decided and built, what is still open, what waits on it, and the smallest question. It poses questions only. Below the cards it lists what is **decided but not built** (DECIDED ≠ IMPLEMENTED), and **counsel items**, labelled as not Cory homework. `decisions/README.md` remains the full list.

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
- **Fixtures.** Parties and agreements are written with the S01/S02 data functions (fixture construction; no product path exists — D03, D02/D12). Labels such as "the model" are demo annotations in `.demo/fixture.json`, never stored in the product database.
- **Terms, versions, tick rows (S03–S05).** The record shows stored terms per layer, each sealed presented version with its frozen wording, which terms a later pairwise version dropped, and a term × party grid of stored tick rows (S05 per-term affirmation evidence). Tick rows are not signatures: signing comes only after every term is green for everyone, and is not built. It computes no finality, "pending" or "declined": an empty cell means only that no row is stored. Fixture term text is marked `[synthetic]`.
- **Not a party view.** The inspector shows the whole stored record. D10 is decided for photo shoots; no party view is built.

## Scenario simulator (live demo only)

"Start a simulation" creates a fresh project with two parties and one pairwise agreement (the D01 shape). Each layer has a **Simulate — demo only** panel to add a term and present a version from chosen terms, and empty cells of a sole version 1 offer **simulate** to record a row naming that party.

What a later version may do follows Cory's rulings, enforced by the simulator (demo-only; production S04 does not enforce these yet):
- **No escalation, either layer.** A later version may keep or leave out terms of the version before it, but may not add a term that version did not hold. The UI disables such terms; the server refuses them with `term_added_after_presentation`.
- **Pairwise:** leaving a term out is the decided drop-and-resend (D02). The UI says who may drop a declined term is open (R2) and that retained history is open (R1); both are withdrawn — there is no proposer-only drop (HC2) and no version history (HC1). Earlier versions stay visible only because current storage retains them.
- **Universal (shared safety):** a shared safety term can never be left out. After version 1 every shared term is locked in; the server refuses an omission with `universal_term_omitted`.

- Seven demo-only operations under `/demo/sim/` (`src/demo/simulator.ts`), protected, creator-only on the project (directly or through the agreement), strict input; never in the production list.
- **Assumptions, shown in the UI:** the operator adds and presents terms (the UI still cites R2, now withdrawn) and records tick rows naming a party (only the party may, D12, signed in to its own account, D03 — decided, not built). A version needs at least one term: the database requires a positive term count (S04), a current storage restriction rather than a product rule. No repeated term is a simulator input rule.
- Everything else is the database's own S03–S05 rules; violations come back as 409s (`version_not_affirmable`, `already_affirmed`, `party_not_in_agreement`, `presented_term_not_found`, `term_not_in_container`, `affirmed_too_soon`).
- **Reset:** start another simulation for a clean project; `npm run demo:reset` restores the whole demo database. Records are append-only, so nothing is edited or deleted in place.
- Hidden in the portable snapshot.

## Regression

`npm run test:demo` (needs `CHROME_PATH`, plus the usual database settings) runs the whole demo in a real browser through `playwright-core` and the system Chrome, with no browser download. It covers:
- reset and the initial fixtures, with exact evidence counts;
- project creation and its empty states;
- version history and pairwise drop-and-resend;
- the simulator flow, preserving version 1 and its rows, refusing an escalating resend and offering no universal omission (including when a disabled control is forced on);
- no superseded wording (D03 or D10 undecided, universal omission open, "on site" open, two private layers, "affirmation row") on any fixture or the decisions view, which names only the current seams;
- the portable snapshot from `file://`, with zero network requests;
- reset repeatability;
- desktop (1280) and mobile (390) rendering with no horizontal scroll and no browser errors;
- every demo route returning 404 from the production application.

Screenshots go to `test-results/demo/` and are uploaded by CI as `demo-screenshots`. The suite resets `modeling_standard_demo`.

`demo:reset` refuses while a demo server is connected (the migration role cannot end the runtime role's sessions) and says to stop `npm run demo` first.

## Deliberately unavailable

Shown disabled, each saying whether it is decided-but-not-built or still open: add a party, create an agreement, add or present terms, tick a term, sign, send or invite, view as a party.

## Still stale by construction

These remain because fixing them belongs to later S03–S05 slices, not to the demo:

- Terms still sit in two storage layers (project and pairwise). The UI labels the pairwise layer as a storage stand-in; the shared-logistics layer and the call sheet are not built and are not faked.
- A later version takes no tick rows (S05's temporary single-version guard); carrying ticks forward across a resend is decided but not built.
- Earlier presented versions remain visible because storage retains them. Cory's model keeps no version history (HC1); R1, which the UI still cites, is withdrawn.
- The open-seams view and several hints still name R1 and R2 as open Cory questions; both are withdrawn (HC1, HC2).
- The simulator lets the operator name any project party on a universal row; presence ("on site") is not recorded.
- Production S04 itself still accepts an escalating or omitting version; only the simulator refuses them.
