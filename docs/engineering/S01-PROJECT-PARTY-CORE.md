# S01: project and party core, as built

Slice: `docs/slices/S01-project-party-core.md`. Decisions relied on: D01 (project is the container; creator is role-neutral) and D12 (no proxy authority). Nothing else.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `project` table | `src/projects/tables.ts`, `migrations/0003` | `id`, `created_by_principal_id`, `created_at`. No product content columns |
| `project_party` table | same | `id`, `project_id` (foreign key to `project`). Nothing else |
| Runtime grants | `migrations/0004` | `SELECT, INSERT` on both tables to `app_runtime`; `PUBLIC` revoked. No `UPDATE`, `DELETE`, `TRUNCATE` or `REFERENCES` |
| `POST /projects` | `src/projects/project.ts` | Protected. Body must be `{}`. Any present principal may create; it is recorded as creator. Returns `{ id }` |
| `GET /projects/:id` | same | Protected. Creator only. Returns `{ id }` |
| `addProjectParty(db, projectId)` | `src/projects/party.ts` | Data function only, no HTTP route |

## Non-obvious choices

- **The creator is not a party.** Creating a project creates no party record. The creator is stored only as `created_by_principal_id`, an audit and authorization fact. Making the creator a party would bind a party to a principal, which S01 forbids (stop condition; D03).
- **Parties are bare identifiers.** No role, no label, no principal or account link. A label was left out so nothing can be read as identity. Binding a party to a person is meant to be added in `party.ts` and the party table without touching `project`.
- **Adding a party has no HTTP surface.** An endpoint would have to say who may add a party and how someone joins (D03), and would imply the creator acts on others' behalf (D12).
- **Responses are `{ id }` only.** Creator and creation time are withheld as internal audit fields. Parties are not returned because who sees the roster is D10, still open.
- **A project has no descriptive fields.** What a project carries (title, concept, brief) is not part of S01, so the create body accepts no fields.
- **Wrong principal gets 403, missing project 404**, the existing Stage 0 boundary behaviour. Whether project reads should hide existence was not decided here.
- **"Any present principal may create"** is the only creation rule. D07's capacity limit is not enforced (billing and entitlements are out of scope); in production no principal exists, so every protected operation is still denied.

## Tests

`tests/database/projects.test.ts` (persistence as the runtime role, schema shape and excluded semantics, privileges) and `tests/http/projects.test.ts` (create and read through the production `createApp`, strict input and output, wrong principal, creator neutrality, absent principal rejected before the body is read, checked against an isolated database so the no-write count is race-free). The Stage 0 pins for the table list, runtime privileges and operation classification were extended to the two new tables and two new protected operations.
