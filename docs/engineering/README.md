# Engineering — current orientation

**Scope:** This is the current navigation entry point for the implemented codebase. The dated S01–S13 records remain authoritative descriptions of their own slices, not an instruction to replay that sequence. Start with the [root README](../../README.md) for the product and current development focus and [current decisions](../../decisions/README.md) for binding product semantics.

## Application today

- **Runtime:** One Node 24 / TypeScript / Fastify application with Zod request/response validation, explicit principal resolution, authorization policies, PostgreSQL, and reviewed Drizzle migrations.
- **Entry points:** `src/main.ts` for the compiled application, `src/app/operation-list.ts` for the registered HTTP operation surface, and `src/demo/` for synthetic demo/staging compositions.
- **Core domains:** `src/projects/`, `src/participants/`, `src/identity/`, and `src/contracts/`, alongside live-brief and foundational modules. Inspect actual source paths and tests when changing behavior; this index is not a generated inventory.
- **Evidence:** Final contracts are stored append-only under runtime-role restrictions. The synthetic operator/test finalization is **not** participant signing.
- **Current priority:** Track B private synthetic professional profiles and comp-card drafts. B1 (`src/toolkit/`; [slice record](../slices/B1-profile-comp-card.md)) adds an owner-only profile and comp-card draft with a local-demo editor and preview, registered only in the local demo (not production or staging); sign-in for professionals is deferred. Track A's collaboration and agreement foundations are already implemented in stages.

## Environments and real-use boundary

| Environment | Purpose | Important boundary |
|---|---|---|
| Compiled application | Runtime operation surface | Does not serve the demo or a complete real participant UI |
| Local demo | Synthetic two-person photo-shoot walkthrough, inspector, and operator simulations | Test identities; no real participants or signing |
| Tailnet HTTPS staging | Synthetic demo with Google sign-in and operator access | Real-Google acceptance remains partial; Google login does not verify identity or age |
| Tests | Isolated integration and browser verification | Database resets and migration generation require care |

**Real use is not approved or enabled.** See [DEMO.md](DEMO.md), [S13-STAGING.md](S13-STAGING.md), and the recorded acceptance in [S13-CONTINUATION.md](S13-CONTINUATION.md).

## Verification and side effects

From the repository root with the **right database environment**:

```sh
npm run check       # typecheck, lint, migration drift, identifier checks
npm test            # test DB is dropped and recreated
npm run test:demo   # demo DB is reset; requires Chrome/Chromium
npm run build       # compiles the application
```

`npm run check` includes `drizzle-kit generate`, which may write files. `npm test` recreates a named database and browser tests reset demo data. A Git worktree alone does **not** isolate these databases. Inspect configuration and use a task-owned database environment before running destructive commands. Database changes use reviewed SQL migrations, not `drizzle-kit push`.

The [root README](../../README.md#engineering-and-local-development) contains setup commands; the [demo runbook](DEMO.md) and [staging runbook](S13-STAGING.md) provide environment-specific instructions.

## Where to find implementation evidence

- [STAGE-0.md](STAGE-0.md): original foundation **at its stage**, not the current whole-app state.
- [S01–S02](S01-PROJECT-PARTY-CORE.md): project/party and pairwise agreement core ([S02](S02-PAIRWISE-AGREEMENT-CORE.md)).
- [S06](S06-ACCOUNT-PARTY-BINDING.md), [S07](S07-DIRECT-INVITATION-CORE.md): binding and invitations.
- [S08](S08-LIVE-BRIEF-TOPOLOGY.md), [S09](S09-LIVE-RESOLUTION.md), [S10](S10-SIGNING-FREEZE.md): current live brief and freeze.
- [S11](S11-FINAL-CONTRACT.md): test/operator final-contract storage.
- [S12](S12-PARTICIPANT-ACCESS.md): participant access.
- [S13](S13-STAGING.md): Google sign-in and synthetic staging; [acceptance/continuation](S13-CONTINUATION.md).
- [B1](../slices/B1-profile-comp-card.md): private professional profile and comp-card draft (Track B), with its as-built record.
- [OCTOBER-SEMANTIC-IMPACT.md](OCTOBER-SEMANTIC-IMPACT.md): later rulings superseding earlier slice assumptions.
- [S03–S05](S03-TERM-UNITS.md): superseded implementation records ([S04](S04-PRESENTED-VERSIONS.md), [S05](S05-TERM-AFFIRMATION.md)), retained as history.

Continue from the **actual Git state, code, tests, and latest validated acceptance evidence**, not an old handoff's branch pointer. Existing continuation notes are dated snapshots, not standing task instructions.
