# S02: pairwise agreement topology core, as built

Slice: `docs/slices/S02-pairwise-agreement-core.md`. Decisions relied on: the D02 structure ruling (commercial and craft agreements are private and pairwise under the project), D12 (no proxy authority) and D01 (project is the container; creator is role-neutral). No other D02 subpart, and nothing from D03, D04 or D10.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `pairwise_agreement` table | `src/projects/tables.ts`, `migrations/0005` | `id`, `project_id`, `party_one_id`, `party_two_id`. Nothing else |
| Composite unique on `project_party (project_id, id)` | same | Target for the composite foreign keys. Adds no column; S01 behaviour is unchanged |
| Runtime grants | `migrations/0006` | `SELECT, INSERT` to `app_runtime`; `PUBLIC` revoked. No `UPDATE`, `DELETE`, `TRUNCATE` or `REFERENCES` |
| `createPairwiseAgreement(db, projectId, [a, b])`, `findPairwiseAgreement(db, id)` | `src/projects/agreement.ts` | Data functions only. No HTTP operation was added |

## How the database enforces the topology

- **Both parties in the agreement's project:** foreign keys `(project_id, party_one_id)` and `(project_id, party_two_id)` → `project_party (project_id, id)`. A party of another project, or one that does not exist, fails with a foreign-key violation.
- **Two distinct parties:** `CHECK (party_one_id <> party_two_id)`.
- **No side has precedence:** `CHECK (party_one_id < party_two_id)`. The pair is stored in canonical UUID order, so "one" and "two" are sort positions, not roles, and the same pair can be written only one way. The data function sorts whatever order it is given.

## Non-obvious choices

- **Duplicates are neither allowed nor forbidden on purpose.** There is no uniqueness constraint on the pair, and no test asserts either answer. Whether the same two parties may hold more than one agreement record is a stop condition in the slice; it is left for D02 lifecycle work.
- **No actor is recorded.** Who may create an agreement is undecided, so the record has no creator, proposer or sender column, and the data function takes no principal.
- **The `project_id → project` foreign key is redundant** with the composite keys (an existing party implies an existing project). It is kept so the agreement's dependence on its project is explicit.
- **Drizzle generated the composite unique after the foreign keys that need it.** `migrations/0005` was reordered by hand so the unique is created first. The snapshot is unaffected, so the drift check still passes.

## Tests

`tests/database/pairwise-agreements.test.ts`, against real PostgreSQL migrated by the production migration path and used as the runtime role: persistence and read-back; order independence; a reversed raw insert rejected; self-pairing rejected; either side from another project rejected, each by its own named constraint; nonexistent parties and project rejected; exact columns and references; no excluded semantic in column or constraint names; no agreement operation in the HTTP surface; no update, delete or truncate as the runtime role. The Stage 0 and S01 pins for the table list and runtime privileges were extended to the new table.
