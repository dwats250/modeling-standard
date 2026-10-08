# S05: per-term affirmation evidence, as built

Slice: `docs/slices/S05-term-affirmation.md`. The PRD is PROPOSED, stacked on S04 and S03, and held at the merge seam.

Grounds:
- D04's per-term ruling;
- DOCTRINE:51 (signatures bound to the clauses they affirm);
- D02 ("all parties" means the parties named in that agreement; universal terms affirmed by everyone on site);
- D12 (no proxies);
- ruling 6 (escalation), which is the reason for the first-version restriction.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `agreement_affirmation` | `src/projects/tables.ts`, `migrations/0011` | agreement, its two parties as stored, version, presented term, affirming party, `affirmed_at` |
| `universal_affirmation` | same | project, version, presented term, affirming party, `affirmed_at` |
| Supporting uniques | same | `pairwise_agreement (id, party_one_id, party_two_id)`; `agreement_version_term (agreement_version_id, id)`; `universal_version_term (universal_version_id, id)`. No columns added |
| First-version and clock triggers | `migrations/0012` | See below |
| Runtime grants | `migrations/0012` | `SELECT, INSERT`; `PUBLIC` revoked; trigger functions not executable by `PUBLIC` |
| Data functions | `src/projects/affirmations.ts` | `affirmAgreementTerm`, `listAgreementAffirmations`, `affirmUniversalTerm`, `listUniversalAffirmations`. No HTTP |

## How the database enforces it

- **Pairwise party is one of the pair.** The pairwise affirmation stores the agreement's `(id, party_one_id, party_two_id)`.
  - A foreign key to the new unique on `pairwise_agreement` makes those exactly the agreement's own pair.
  - `CHECK (party_id = party_one_id OR party_id = party_two_id)` then confines the affirming party to that pair.
  
  These are declarative constraints, as in S02.
- **Universal party is a party of the project.** Foreign key `(project_id, party_id) → project_party (project_id, id)`.
- **Term belongs to version, version to container.**
  - `(container, version) → version (container, id)`
  - `(version, presented term) → version term (version, id)`
- **One affirmation per party per term.** A unique key on `(presented term, party)`.
- **First version only, and database time.** A BEFORE INSERT trigger looks up the version by `(container, id)`.
  - It rejects the insert if the version is not visible to the inserting transaction, or its sequence is not 1.
  - It then sets `affirmed_at := clock_timestamp()`.
  - A not-visible version is rejected rather than left to the foreign key. This closes the same race the S04 review found for copies: a later version committed between the trigger and the deferred foreign-key check.
- **Permanence.** No `UPDATE`, `DELETE` or `TRUNCATE` grant.

## Non-obvious choices

- **Why only first versions can be affirmed.** A later version may escalate a boundary (for example by dropping a "no touching" term). Ruling 6 requires a neutral record and a mandatory delay before acceptance, and neither is specified. So the database fails closed. The restriction lives in one trigger per layer and is replaced when ruling 6 is built.
- **No finality and no "outstanding" view.** Finality is over the *required* terms (D02), and requiredness is open (D04). An "outstanding" list would also assume everyone must affirm every term. Both are left out.
- **Universal affirmations accept any party of the project.** Who must affirm, meaning who is on site, is open (D02 f). Recording that a party affirmed decides nothing about anyone else.
- **No actor or metadata.** A party is not yet bound to a person (D03), so the data functions take a party id and authorize nobody. Credential, IP and device are parked (D04). Any future HTTP surface must establish that the person acting is the party (D12) before calling these.
- **Migration order.** Drizzle again placed the new uniques after the foreign keys that need them. `migrations/0011` was reordered by hand, and the drift check passes.

## Tests

`tests/database/affirmations.test.ts`, for both layers:
- per-party, per-term recording with database time, reading back per version;
- per-term independence;
- rejection of:
  - pairwise: a same-project party outside the pair, and a party of another project;
  - universal: a party of another project;
- duplicate rejection;
- rejection of affirming a later version's term;
- unknown presented term;
- raw-SQL attacks as the runtime role:
  - a term not in the stated version;
  - another container's version;
  - a backdated time inside a transaction held open over a second;
  - a version another transaction has not committed;
  - update, delete or truncate;
  - (pairwise) a claimed pair other than the agreement's own;
- excluded semantics;
- no HTTP operation;
- trigger functions not callable.

The S04 trigger-function hygiene test, covering `search_path` with `pg_temp` last and non-callability, now covers these functions too. The table-list and privilege pins are extended.
