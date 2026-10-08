# S03: term units, as built

Slice: `docs/slices/S03-term-units.md`. The PRD is PROPOSED and held at the merge seam.

Decisions relied on:
- the D04 partial ruling that every term is individually represented;
- the D02 structure ruling (universal safety and consent terms, private pairwise commercial and craft terms);
- reconciliation ruling 11.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `universal_term` table | `src/projects/tables.ts`, `migrations/0007` | `id`, `project_id`, `position`, `content` |
| `agreement_term` table | same | `id`, `pairwise_agreement_id`, `position`, `content` |
| Runtime grants | `migrations/0008` | `SELECT, INSERT` on both; `PUBLIC` revoked. No `UPDATE`, `DELETE`, `TRUNCATE` or `REFERENCES` |
| Data functions | `src/projects/terms.ts` | `addUniversalTerm`, `listUniversalTerms`, `addAgreementTerm`, `listAgreementTerms`. No HTTP operation |

## Constraints

- **Text:** `content ~ '[^[:space:]]'`, so it is not empty and not only whitespace (tabs and newlines included).
- **Position:** `position >= 1`, unique per container.
- **Container:** a foreign key to the project or the pairwise agreement.

## Non-obvious choices

- **No required, body or money columns.** Each would answer an open D04 question:
  - what makes a term required, and who decides;
  - who classifies body and money terms.
  
  Finality (D02) cannot be computed until requiredness is decided, so no later slice in this stack computes it.
- **Append-only.** D02's drop-and-resend concerns a term already sent. It is done by presenting a new version without the term (S04), so no draft row is ever deleted and no `DELETE` is granted.
- **Position is storage order.** Ruling 4's presentation order spans both layers and is undecided.
- **Concurrency.** An addition runs in a transaction that first takes `pg_advisory_xact_lock` on a key derived from the container id, then inserts at `max(position) + 1`. Concurrent additions to one container queue rather than collide. The runtime role holds the default `EXECUTE` on the advisory-lock functions. Row locks are not used because they would need `UPDATE` on the parent table.
- **Integer ceiling.** A raw insert at position 2147483647 would stop further additions to that container ("integer out of range"). Only raw SQL with the runtime credential can do that. No cap is imposed, because a maximum term count is not a decision this slice may make.

## Tests

`tests/database/terms.test.ts`:
- add and list per container;
- isolation;
- listing by position, for rows inserted out of order;
- twelve concurrent additions per container getting positions 1 to 12;
- the database rejects blank text (including tab-only), positions below 1, duplicate positions and unknown containers;
- exact columns and defaults;
- no excluded semantic in column or constraint names;
- no update, delete or truncate as the runtime role;
- no HTTP operation.

The table-list and runtime-privilege pins are extended to the two tables.
