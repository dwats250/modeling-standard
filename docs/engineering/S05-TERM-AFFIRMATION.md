# S05: per-term affirmation evidence, as built

> **Retired in S08 (2026-10-15).** This slice's per-term affirmation rows (`agreement_affirmation`, `universal_affirmation`), their trigger functions and data functions were dropped by `migrations/0019_live_brief_topology.sql` and `0020_live_brief_scope_and_grants.sql`, replaced by the draft live brief ([`S08-LIVE-BRIEF-TOPOLOGY.md`](S08-LIVE-BRIEF-TOPOLOGY.md)). Its migrations remain as history and still run on a fresh database. Nothing below describes the current schema.

> **As-built history; see [`OCTOBER-SEMANTIC-IMPACT.md`](OCTOBER-SEMANTIC-IMPACT.md).** Cory has since ruled that ticking and signing are separate acts, that approvals carry forward across a shrink-only resend, and that escalation cannot occur (2026-10-14/15). These rows are tick evidence, not signatures; the single-version guard below is now a replaceable temporary guard. *Corrected 2026-10-15 (HC1): there is no carry-forward across retained versions, because Cory's model retains no versions; ticks are live-brief state and evidence attaches to the final contract. The "approvals carry forward" wording above came from a handoff error.*

Slice: `docs/slices/S05-term-affirmation.md`. The PRD is APPROVED and merged.

Grounds:
- D04's per-term ruling;
- DOCTRINE:51;
- D02 ("all parties" means the parties named in that agreement).

D12 (no proxies) is a precondition on future callers, not a property of these tables. DOCTRINE:52's credential is not yet recorded. These rows are storage only, and no runtime path may write them before D03.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `agreement_affirmation` | `src/projects/tables.ts`, `migrations/0011` | agreement, its two parties as stored, version, presented term, party, `affirmed_at` |
| `universal_affirmation` | same | project, version, presented term, party, `affirmed_at` |
| Supporting uniques | same | `pairwise_agreement (id, party_one_id, party_two_id)`; `agreement_version_term (agreement_version_id, id)`; `universal_version_term (universal_version_id, id)`. No columns added |
| Stamp triggers | `migrations/0012` | See below |
| Runtime grants | `migrations/0012` | `SELECT, INSERT`; `PUBLIC` revoked; trigger functions not executable by `PUBLIC` |
| Data functions | `src/projects/affirmations.ts` | `affirmAgreementTerm`, `listAgreementAffirmations`, `affirmUniversalTerm`, `listUniversalAffirmations`. No HTTP or other caller |

## How the database enforces it

- **Pairwise party is one of the pair.** The pairwise row stores the agreement's `(id, party_one_id, party_two_id)`.
  - A foreign key to the new unique on `pairwise_agreement` makes those exactly the agreement's own pair.
  - `CHECK (party_id = party_one_id OR party_id = party_two_id)` then confines the party.
- **Universal party is a party of the project.** `(project_id, party_id) → project_party (project_id, id)`.
- **Term in version, version in container.**
  - `(container, version) → version (container, id)`
  - `(version, presented term) → version term (version, id)`
- **One affirmation per party per term.** A unique key on `(presented term, party)`.
- **The stamp trigger (BEFORE INSERT), per layer, in order:**
  1. It takes the container's advisory lock, the same key as the S04 numbering trigger. Affirmations and presentations to one container therefore serialize.
  2. It looks the version up by `(container, id)`. It rejects the row (`*_single_version_only`) if:
     - the version is not visible to this transaction;
     - its sequence is not 1;
     - any later version exists in the container.
     
     Rejecting the not-visible case here closes the race in which a version committed between this trigger and the end-of-statement foreign-key check.
  3. It rejects the row (`*_after_presentation`) if the version's `presented_at` is not earlier than this transaction's start (`now()`).
     - A version presented in this transaction always fails this check, because S04 stamps `presented_at` with `clock_timestamp()`.
     - A version presented by another transaction after this one began is refused too. This fails closed, and retrying succeeds.
  4. It sets `affirmed_at := clock_timestamp()`.
- **Append-only.** No `UPDATE`, `DELETE` or `TRUNCATE` grant.

## Non-obvious choices

- **Single version only.** Two open questions meet here:
  - whether version 1 stays affirmable once a resend exists (D02 d, g, h);
  - whether a later version can be affirmed at all (ruling 6 escalation).
  
  The trigger stops short of both, so drop-and-resend leaves the resent version unaffirmable for now. It does not detect escalation in general: a second agreement between the same pair starts at its own version 1, and S02 left pair duplicates undecided.
- **Timing check by transaction start.** A row's `xmin` comparison would miss versions inserted in a savepoint. Comparing the server-set `presented_at` with `now()` cannot be forged and also covers savepoints. The cost is the fail-closed refusal described above.
- **No finality, outstanding or pending view.** Finality needs requiredness (D04). The absence of a row means nothing.
- **Universal rows accept any project party.** "On site" is not defined, so this says nothing about who must affirm.
- **Transactions.** Affirmations are accepted only under READ COMMITTED; the stamp triggers reject REPEATABLE READ and SERIALIZABLE (`*_read_committed_only`, `migrations/0013`). Under snapshot isolation the later-version check would read a snapshot older than a version committed after the transaction began, so version 1 could be affirmed after version 2 exists. Review found and reproduced that; 0013 closes it.
- **Errors.** Database errors (foreign key, check, unique) surface as-is; only an unknown presented term has a domain error. There is no HTTP surface to translate them for.
- **Migration order.** `migrations/0011` was reordered by hand so the uniques precede the foreign keys that need them. The drift check passes.

## Tests

`tests/database/affirmations.test.ts`, for both layers:
- per-party, per-term recording with database time, and per-term independence;
- rejection of:
  - parties outside the pair or project;
  - duplicates;
  - a later version's term;
  - version 1 after a resend;
  - the presenting transaction;
  - an unknown term;
- raw-SQL attacks as the runtime role:
  - a foreign term in the stated version;
  - another container's version;
  - a backdated time inside a transaction held open over a second;
  - an uncommitted version 1 on a fresh container;
  - update, delete or truncate;
  - (pairwise) a claimed pair other than the agreement's own;
- exact constraint lists;
- excluded semantics;
- no HTTP operation;
- trigger functions not callable.

The S04 hygiene test pins every trigger function in the schema by name, with `search_path` ending in `pg_temp` and no `EXECUTE` for the runtime role. The table-list and privilege pins are extended.
