# Local synthetic demo

A record inspector for showing what is built, with invented records, on a developer machine. Not a product flow, not a credential mechanism, not real-use approval (Gate 2).

## Run

```
npm run demo:reset   # drops and recreates modeling_standard_demo, migrates, loads fixtures
npm run demo         # http://127.0.0.1:3100/ (DEMO_PORT to change)
npm run demo:export  # .demo/modeling-standard-demo.html — portable, read-only snapshot
```

The snapshot is one HTML file with the inspector's markup, styles, script and every record it shows inlined. It opens from disk on any device, makes no network request (its CSP is `default-src 'none'`), refuses every write, and says on every screen that it is a read-only synthetic snapshot. It contains only what the inspector shows: synthetic records and fixture labels; no credentials, database location or internal principal (tested).

The inspector's **Open decisions for Cory** view is a selected walkthrough, not the full list of open decisions (`decisions/README.md` has every decision and its status). It maps D03, D10, D04 requiredness and D05: what is built, what is undecided, what waits on it, and the smallest question. It poses questions only.

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
- **Terms, versions, affirmation rows (S03–S05).** The record shows stored terms per layer, each sealed presented version with its frozen wording, which terms a later version left out (a pairwise drop-and-resend, or an undecided universal omission), and a term × party grid of stored affirmation rows. It computes no finality, requiredness, "pending" or "declined": an empty cell means only that no row is stored. Fixture term text is marked `[synthetic]`.
- **Not a party view.** The inspector shows the whole stored record. What each party sees is D10.

## Scenario simulator (live demo only)

"Start a simulation" creates a fresh project with two parties and one pairwise agreement (the D01 shape). Each layer has a **Simulate — demo only** panel to add a term and present a version from chosen terms, and empty cells of a sole version 1 offer **simulate** to record a row naming that party.

What a later version with fewer terms means differs by layer, and the inspector says so in each:
- **Pairwise:** leaving a term out is drop-and-resend, decided in D02. Earlier versions stay exactly as they were.
- **Universal (shared safety and consent):** storage can freeze a later version with a different set of terms, so the simulator can show the mechanics. Whether a shared safety or consent term may actually be left out is undecided and Cory's call.

Neither layer's wording claims withdrawal, replacement or finality.

- Seven demo-only operations under `/demo/sim/` (`src/demo/simulator.ts`), protected, creator-only on the project (directly or through the agreement), strict input; never in the production list.
- **Assumptions, shown in the UI:** the operator adds and presents terms (who may is D02/D04) and records rows naming a party (only the party may, D12; how is D03). A version needs at least one term: the database requires a positive term count (S04), a current storage restriction rather than a product rule. No repeated term is a simulator input rule.
- Everything else is the database's own S03–S05 rules; violations come back as 409s (`version_not_affirmable`, `already_affirmed`, `party_not_in_agreement`, `presented_term_not_found`, `term_not_in_container`).
- **Reset:** start another simulation for a clean project; `npm run demo:reset` restores the whole demo database. Records are append-only, so nothing is edited or deleted in place.
- Hidden in the portable snapshot.

## Regression

`npm run test:demo` (needs `CHROME_PATH`, plus the usual database settings) runs the whole demo in a real browser through `playwright-core` and the system Chrome, with no browser download. It covers:
- reset and the initial fixtures, with exact evidence counts;
- project creation and its empty states;
- version history and pairwise drop-and-resend;
- the simulator flow, preserving version 1 and its rows;
- the portable snapshot from `file://`, with zero network requests;
- reset repeatability;
- desktop (1280) and mobile (390) rendering with no horizontal scroll and no browser errors;
- every demo route returning 404 from the production application.

Screenshots go to `test-results/demo/` and are uploaded by CI as `demo-screenshots`. The suite resets `modeling_standard_demo`.

`demo:reset` refuses while a demo server is connected (the migration role cannot end the runtime role's sessions) and says to stop `npm run demo` first.

## Deliberately unavailable

Shown disabled with the blocking decision: add a party (D03), create an agreement (D02/D12), add or present terms (D02/D04), record an affirmation (D12/D03), send or invite (D03), view as a party (D10).
