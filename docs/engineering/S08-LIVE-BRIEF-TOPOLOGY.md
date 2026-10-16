# S08: draft live-brief topology, and retirement of S03–S05, as built

Slice: `docs/slices/S08-live-brief-topology.md`. Decisions relied on: D02 and D10 (three layers; only money is private), D04 (per-term representation; the subject controls a term, Q7), Q6 (money is one field, the fee), Q13/Q14 (universal safety is the same terms for everyone), and handoff corrections HC1 (no version history; live state is not evidence) and HC2 (no proposer).

**What this is not.**

- Draft composition only. There is no phase, sharing, tick, green state, requiredness, rigidity, freeze, contract, call sheet or signing (S09–S11).
- `item_key` is semantic identity only. It does not mean required, immutable, product-authored, non-removable or deliberate-tick.
- Wording is stored, never rendered from code. There is no product catalogue, and no no-means-no wording exists (D04, open).
- `pairwise_agreement` is an internal pair-scope record, not Cory's "agreement" or a contract.
- No HTTP operation, principal, logging or network code. Who may compose a draft is the participant surface's question.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `live_brief` table | `src/briefs/tables.ts`, `migrations/0019` | `id`, `project_id`; one per project |
| `brief_item` table | `src/briefs/tables.ts`, `migrations/0019` | 12 columns, 17 checks, 3 composite FKs, one partial unique index |
| One pair-scope row per pair | `src/projects/tables.ts`, `migrations/0019` | `pairwise_agreement_one_per_pair`, `pairwise_agreement_project_id_id_unique` |
| Pair-subject trigger | `migrations/0020` | `brief_item_check_scope`, fail-closed |
| Runtime grants | `migrations/0020` | see Privileges |
| Data functions | `src/briefs/brief.ts` | `openLiveBrief`, `findLiveBriefForProject`, `addBriefItem`, `updateDraftBriefItem`, `removeDraftBriefItem`, `listBriefItems`, `listBriefItemsVisibleTo` |

## Retired

Dropped by `0019` (tables, explicitly, in dependency order, **without** `CASCADE`, so an unexpected dependant stops the migration): `universal_affirmation`, `agreement_affirmation`, `universal_version_term`, `agreement_version_term`, `universal_version`, `agreement_version`, `universal_term`, `agreement_term`.

Dropped by `0020` (functions): `agreement_affirmation_stamp`, `universal_affirmation_stamp`, `agreement_version_term_check_copy`, `universal_version_term_check_copy`, `agreement_version_check_sealed`, `universal_version_check_sealed`, `agreement_version_stamp`, `universal_version_stamp`.

Deleted: `src/projects/terms.ts`, `versions.ts`, `affirmations.ts` and their tests. `pairwise_agreement_id_parties_unique` is replaced by the two keys below. Migrations 0007–0014 are unchanged and still run on a fresh database.

## Schema

`live_brief`:

- `id uuid` primary key, `gen_random_uuid()`.
- `project_id uuid not null`, references `project(id)`.
- `live_brief_one_per_project UNIQUE (project_id)`; `live_brief_id_project_unique UNIQUE (id, project_id)` (containment target).

`brief_item`:

- `id uuid` primary key; `brief_id uuid not null`; `project_id uuid not null`; `layer text not null`; `pairwise_agreement_id uuid`; `subject_party_id uuid`; `shape text`; `item_key text`; `content text`; `value text`; `pending text`; `position integer not null`.
- Foreign keys, all `NO ACTION`:
  - `brief_item_in_brief_fk (brief_id, project_id) → live_brief (id, project_id)`;
  - `brief_item_pair_in_project_fk (project_id, pairwise_agreement_id) → pairwise_agreement (project_id, id)`;
  - `brief_item_subject_in_project_fk (project_id, subject_party_id) → project_party (project_id, id)`.
- Checks:
  - `layer_known` (universal, shared, money); `shape_known` (declaration, request, open_parameter); `item_key_known` (fee, no_means_no, coverage_level, physical_contact, stop_rule); `pending_known` (decide_together, subject);
  - `content_nonblank`, `value_nonblank`; `position_positive`;
  - `money_is_pair_scoped`; `money_is_fee`; `fee_is_money`;
  - `universal_is_project_wide` (no pair; a subject is allowed); `no_means_no_is_universal`;
  - `shape_iff_subject`; `drafter_item_has_wording` (an unkeyed item has content);
  - `decide_together_has_no_value`; `subject_pending_is_open_parameter`; `open_parameter_state` (awaiting its subject with no value, or settled with a value).
- `brief_item_one_fee_per_pair`: unique on `(pairwise_agreement_id) WHERE item_key = 'fee'`.

**Null safety (deviation from the PRD's literal expressions).** A CHECK that evaluates to NULL passes. As written in the PRD, `money_is_fee`, `subject_pending_is_open_parameter` and `open_parameter_state` compared nullable columns with `=`, which admitted money with no key, `pending = 'subject'` with no shape, and an open parameter with no pending state. They are written with `IS [NOT] DISTINCT FROM`; the intent is unchanged, and the tests prove each refuses its target row.

`pairwise_agreement`: `pairwise_agreement_one_per_pair UNIQUE (project_id, party_one_id, party_two_id)` (pairs are stored canonically ordered, so either supplied order collides) and `pairwise_agreement_project_id_id_unique UNIQUE (project_id, id)`.

## Pair-subject trigger

`brief_item_check_scope()`, `BEFORE INSERT OR UPDATE` on `brief_item`: when both a pair and a subject are set, the subject must be one of that pair's two parties. It reads the pair by `(project_id, id)`; if no row is found, or the subject is neither party, it raises `check_violation` with constraint name `brief_item_subject_in_pair`. Hardened: `SET search_path = pg_catalog, public, pg_temp`, schema-qualified tables, `EXECUTE` revoked from `PUBLIC`.

## Behaviour

- **Open.** `openLiveBrief` inserts with `ON CONFLICT (project_id) DO NOTHING` and then reads, so concurrent opens return one brief. An unknown project is a foreign-key violation.
- **Add.** One READ COMMITTED transaction under `pg_advisory_xact_lock(hashtextextended('live-brief:' || lower(brief id), 0))`: read the brief (or `BriefNotFoundError`), take the project from the brief, never the caller, and append at `max(position) + 1`. Every topology rule is the database's.
- **Update.** `content`, `value` and `pending` only, under the same lock. Layer, scope, subject, shape, key, brief and project cannot change: the runtime role has no `UPDATE` on them.
- **Remove.** Any draft item, including universal, keyed and money ones.
- **List.** By `position`, then `id`.
- **Visibility (D10).** `listBriefItemsVisibleTo(brief, party)`: a party outside the brief's project sees nothing; a member sees every universal and shared item (pair scope on a shared item does not restrict who sees it) and only the money items of pairs it is in. A filter only; no party view or route.

## Privileges

Runtime role, with `PUBLIC` revoked on both tables:

- `live_brief`: `SELECT, INSERT`.
- `brief_item`: `SELECT, INSERT, DELETE`, and `UPDATE (content, value, pending, position)` only.

No `TRUNCATE`, `REFERENCES` or `TRIGGER`; no `UPDATE` or `DELETE` on `live_brief`; the trigger function is not executable by the runtime role.

## Migrations

- `0019_live_brief_topology.sql`: generated by drizzle-kit, then hand-ordered: a duplicate-pair precheck (`DO` block raising `unique_violation`, "duplicate pairwise agreements exist; S08 requires one per pair per project — reset the development database"); the eight table drops; the old pair key dropped and the two new keys added; `live_brief`, `brief_item`; their foreign keys after the keys they reference; the fee index. Drizzle's no-op `DISABLE ROW LEVEL SECURITY` statements are omitted.
- `0020_live_brief_scope_and_grants.sql`: hand-written; the function drops, the trigger, revokes and grants.

**Upgrade.** A database populated at 0018 (S01, S02, S03–S05, S06, S07 rows) migrates to current with every surviving row unchanged, the retired tables and functions gone, the new grants in force, bookkeeping complete, a catalog identical to a fresh migration, and a rerun a no-op. With duplicate pairs present at 0018, the migration fails on the precheck and leaves rows, bookkeeping and catalog exactly as they were: nothing is deleted automatically.

## Mutation checks

Each mutation was applied to 0019/0020 and the database suite rerun:

| Mutation | Caught by |
|---|---|
| remove `live_brief_one_per_project` | the concurrent-open and second-raw-row tests, the catalog test, and every test that opens a brief (`ON CONFLICT` needs the key): 16 failures |
| remove `money_is_fee` | the named-refusal test and the catalog test |
| remove `universal_is_project_wide` | the named-refusal test and the catalog test |
| drop the `brief_item_check_scope` trigger | the containment tests, through data functions and raw SQL |
| grant table-level `UPDATE` on `brief_item` | the identity-immutability test, the effective-privileges test, the updatable-columns test and the 0018 upgrade test |
| remove `pairwise_agreement_one_per_pair` | the one-per-pair test and the concurrent pair-creation test |

## Demo

See `DEMO.md`. The inspector shows the draft brief by layer with the banner "Draft composition only. Sharing, green state and signing arrive in S09–S11."; the S03–S05 views, simulator operations and the R1/R2 cards are gone.
