# Local synthetic demo

> **Rebuilt for S08 (2026-10-15).** The S03–S05 presentation — stored terms, sealed versions, per-version tick grids, drop-and-resend, the term/version/tick simulator operations, and the R1 and R2 cards — is retired with those tables. The inspector now shows the **draft live brief** by layer, under the banner "Draft composition only. Sharing, green state and signing arrive in S09–S11."

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
- **Fixtures.** Parties, pair-scope records and draft brief items are written with the S01, S02 and S08 data functions (fixture construction; no product path exists — D03, D12). Labels such as "the model" are demo annotations in `.demo/fixture.json`, never stored in the product database. Every stored text is marked `[synthetic]`.
  - **Fixture 1 (D01):** two parties, one pair, no money (D01 had none). A universal item with a subject (a declaration); a shared project-wide item; a pair-scoped shared request with a subject; an open parameter awaiting its subject; a decide-together item.
  - **Fixture 2:** parties A, B, C with pairs A–C and B–C; a universal item, a shared item, and a fee per pair (A–C with a value, B–C to be decided together).
  - **Fixture 3:** no parties and an empty draft brief.
  - **No no-means-no item.** Its wording is Cory's to write (D04); no placeholder is created. A keyed item without wording, if one exists, is shown only as instrumentation — "item key `no_means_no` — wording not materialized (draft)" — never as document text.
- **The record.** `GET /demo/projects/:id/record` returns the project, its parties, its pair-scope records (`agreements`: id and the two parties) and the live brief (`brief`: id and its items with exactly the twelve stored fields less brief and project, or `null` if none is opened). No time, author, proposer, phase, tick, requiredness or finality field exists to show.
- **The inspector.** Items are shown by layer (universal, shared, money) in display order. Money is labelled "private to this pair" with the pair it is between; a pair-scoped shared item is labelled "between", since pair scope on a shared item does not restrict who sees it (D10). Subject, shape, pending state and item key are labels. Wording is shown only when stored.
- **Not a party view.** The inspector shows the whole stored record. D10 is decided for photo shoots; `listBriefItemsVisibleTo` exists as a data function, but no party view is built.

## Scenario starter (live demo only)

"Start a scenario" (`POST /demo/sim/scenarios`, `demo.sim.scenario.start`) creates a fresh project with two parties and one pair between them (the D01 shape), with no live brief. It is the only simulator operation: draft composition has data functions (S08) but no route and no simulator operation, because who may compose a draft is the participant surface's question. Protected, strict input, never in the production list, hidden in the portable snapshot.

## Regression

`npm run test:demo` (needs `CHROME_PATH`, plus the usual database settings) runs the whole demo in a real browser through `playwright-core` and the system Chrome, with no browser download. It covers:
- reset and the initial fixtures as draft briefs by layer, with exact item counts, the banner, and subject, shape and pending labels;
- money shown only as private to its pair, one fee per pair;
- no version, tick, R1, R2, sealed, affirmation or simulate text on any project view, and no version or R1/R2 text on the decisions view, which names only the current seams;
- no superseded wording (D03 or D10 undecided, universal omission open, "on site" open, two private layers);
- no product-wording placeholder presented as document text: every wording line is `[synthetic]`, and a keyed item without wording renders as instrumentation only;
- project creation and the scenario starter, with their empty states;
- stale navigation (a late response never replaces the selected view);
- the portable snapshot from `file://`, with zero network requests;
- reset repeatability;
- desktop (1280) and mobile (390) rendering with no horizontal scroll and no browser errors;
- every demo route returning 404 from the production application.

Screenshots go to `test-results/demo/` and are uploaded by CI as `demo-screenshots`. The suite resets `modeling_standard_demo`.

`demo:reset` refuses while a demo server is connected (the migration role cannot end the runtime role's sessions) and says to stop `npm run demo` first.

## Deliberately unavailable

Shown disabled, each saying whether it is decided-but-not-built or still open: add a party, compose the brief, share the brief (S09), green state (S10), sign (S11), view as a party.
