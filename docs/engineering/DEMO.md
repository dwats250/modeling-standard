# Local synthetic demo

A record inspector for showing what is built, with invented records, on a developer machine. Not a product flow, not a credential mechanism, not real-use approval (Gate 2).

## Run

```
npm run demo:reset   # drops and recreates modeling_standard_demo, migrates, loads fixtures
npm run demo         # http://127.0.0.1:3100/ (DEMO_PORT to change)
```

Uses the same `.env` credentials, pointed at `modeling_standard_demo`.

## Boundaries

- **Never in production.** `src/main.ts` and `src/app/operation-list.ts` do not import `src/demo/`; `tsconfig.build.json` excludes it from `dist/`. Tests pin both.
- **Guards.** Refuses to start unless `HOST` is loopback, the PostgreSQL server is on loopback, and the target database is exactly `modeling_standard_demo`. Requests whose `Host` header is not this loopback server and port get 421 (blocks DNS rebinding).
- **One principal.** A fixed synthetic `demo-operator`. It stands for nobody, is never a party, and only creates projects (real `project.create`) and reads its own records.
- **Same boundary.** The two inspector reads (`GET /demo/projects`, `GET /demo/projects/:id/record`) are ordinary protected operations with strict input/output and the S01 creator-only policy, registered through `createApp({ additionalOperations })`.
- **Front door.** `src/demo/server.ts` serves the static UI and forwards everything else to the app with `app.inject`, passing only `content-type`. Fastify's "every route is an operation" rule is untouched.
- **Fixtures.** Parties and agreements are written with the S01/S02 data functions (fixture construction; no product path exists — D03, D02/D12). Labels such as "the model" are demo annotations in `.demo/fixture.json`, never stored in the product database.
- **Not a party view.** The inspector shows the whole stored record. What each party sees is D10.

## Deliberately unavailable

Shown disabled with the blocking decision: add a party (D03), create an agreement (D02/D12), send or invite (D03), view as a party (D10).
