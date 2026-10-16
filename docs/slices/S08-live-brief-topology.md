# Slice — S08 draft live-brief topology, and retirement of S03–S05

Status: PROPOSED — awaiting Dustin approval (revised 2026-10-15 after the seam review)
Owner: Claude
Date: 2026-10-15
Architecture: [`docs/engineering/LIVE-BRIEF-REBUILD.md`](../engineering/LIVE-BRIEF-REBUILD.md)

## Objective

Retire the obsolete S03–S05 term stack, and establish the **neutral draft topology** of Cory's live-brief model:
- one live-brief workspace per project;
- brief items carrying a visibility layer, an optional pair scope, an optional subject and shape, an optional item key, their exact current wording and value, a pending state, and a display position;
- one pair-scope row per pair per project.

S08 is **draft composition only**. A draft can be freely added to, edited and emptied. S08 has no phase and enforces no rule whose meaning begins at sharing. Post-share rigidity, safety-material protection, ticks, requiredness and finality are S09–S11.

## Authority

Rulings relied on, all DECIDED for photo shoots. Each constraint below cites the one it rests on.

- **Q5 / D02:** one agreement per pair, per project.
- **Q14, A2 / D02, D10:** three visibility layers. Universal safety applies to everyone on site with the same terms. Money is the only private thing.
- **Q6 / D04:** money is one field, the fee.
- **Q13 / D04:** no-means-no is a safety term every person affirms individually. Its wording is OPEN and not needed.
- **Q7, §3.11 / D04:** the subject of a term controls it. The shapes are declaration, request and open parameter.
- **A3 / D04:** every field is supplied or explicitly decide-together. Only the *states* are represented here; the completeness check is S09.
- **HC1:** no version history.
- **HC2:** no proposer identity.

**Not relied on, and not represented:**
- requiredness (a product policy; the D01 catalogue is Dustin-draft, Cory-review);
- deliberate-tick behaviour (S09, in code);
- removability after sharing (S09);
- the restart after an ended contract (deferred);
- the multi-party signing unit (deferred);
- the no-means-no wording, the visible signing act and the remaining vocabulary.

## Exact scope

### 1. Retire S03–S05

**One generated migration drops:**
- the tables `universal_affirmation`, `agreement_affirmation`, `universal_version_term`, `agreement_version_term`, `universal_version`, `agreement_version`, `universal_term` and `agreement_term`;
- the constraint `pairwise_agreement_id_parties_unique`.

**The hand-written migration drops the trigger functions:**
- `agreement_version_stamp`, `universal_version_stamp`;
- `agreement_version_check_sealed`, `universal_version_check_sealed`;
- `agreement_version_term_check_copy`, `universal_version_term_check_copy`;
- `agreement_affirmation_stamp`, `universal_affirmation_stamp`.

Keep `project_party_project_id_id_unique`, which S02, S06 and S07 use.

**Code removed:**
- `src/projects/terms.ts`, `versions.ts` and `affirmations.ts`, and their table definitions in `src/projects/tables.ts`;
- `tests/database/terms.test.ts`, `versions.test.ts` and `affirmations.test.ts`.

**Code relocated:**
- The trigger-function hygiene pin, now in `versions.test.ts`, moves to `tests/database/trigger-functions.test.ts`, pinned to the functions that remain.
- `tests/database/identifiers.test.ts` loses its agreement-version FK-name assertions, because the object no longer exists, and keeps the identifier-length checks.
- The shipped-exception entry in `src/infrastructure/database/identifier-length.ts` stays, because the 0014 file still exists.

Earlier migrations are not edited.

### 2. One pair-scope row per pair

`pairwise_agreement` remains an **internal pair-scope record**. Its name is not evidence that it is Cory's "agreement" or a contract. Add:
- `UNIQUE (project_id, party_one_id, party_two_id)`, named `pairwise_agreement_one_per_pair` (Q5). Nothing in S08 needs a second row per pair;
- `UNIQUE (project_id, id)`, named `pairwise_agreement_project_id_id_unique`, as the containment target.

**Precheck.** Before adding the uniqueness key, a `DO` block in the same migration raises:

> duplicate pairwise agreements exist; S08 requires one per pair per project — reset the development database

if any pair is duplicated. No row is deleted automatically.

**Code changes:**
- Update `createPairwiseAgreement`'s documentation.
- Rewrite `tests/database/pairwise-agreements.test.ts:86` so it no longer creates the same pair twice.
- Add tests: a second row for a pair, in either order, is a unique violation on `pairwise_agreement_one_per_pair`; two concurrent creations produce one row.

### 3. New tables

Put them in `src/briefs/tables.ts` and register it in `drizzle.config.ts`.

**`live_brief`**
- `id uuid` primary key, `gen_random_uuid()`
- `project_id uuid not null`, references `project(id)`
- `UNIQUE (project_id)`, named `live_brief_one_per_project`
- `UNIQUE (id, project_id)`, named `live_brief_id_project_unique`
- No other columns. In particular no timestamps and no phase; S09 adds the phase.

**`brief_item`**

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `brief_id` | `uuid not null` | — |
| `project_id` | `uuid not null` | — |
| `layer` | `text not null` | `in ('universal','shared','money')` |
| `pairwise_agreement_id` | `uuid` | nullable |
| `subject_party_id` | `uuid` | nullable |
| `shape` | `text` | nullable; `in ('declaration','request','open_parameter')` |
| `item_key` | `text` | nullable; `in ('fee','no_means_no','coverage_level','physical_contact','stop_rule')`. Semantic identity only: not requiredness, wording ownership, removability or deliberate-tick behaviour |
| `content` | `text` | nullable; when present, `~ '[^[:space:]]'`. The exact wording currently in the brief |
| `value` | `text` | nullable; when present, `~ '[^[:space:]]'` |
| `pending` | `text` | nullable; `in ('decide_together','subject')` |
| `position` | `integer not null` | `>= 1`; not unique (display order; ties order by `id`) |

**Foreign keys** (all `NO ACTION`):
- `(brief_id, project_id)` → `live_brief (id, project_id)`, named `brief_item_in_brief_fk`;
- `(project_id, pairwise_agreement_id)` → `pairwise_agreement (project_id, id)`, named `brief_item_pair_in_project_fk`;
- `(project_id, subject_party_id)` → `project_party (project_id, id)`, named `brief_item_subject_in_project_fk`.

**Check constraints.** Exact names, each with its basis.

| Name | Expression | Basis |
|---|---|---|
| `brief_item_money_is_pair_scoped` | `layer <> 'money' OR pairwise_agreement_id IS NOT NULL` | Money is private to the pair it is between (A2, D10) |
| `brief_item_money_is_fee` | `layer <> 'money' OR item_key = 'fee'` | "Money is not a category, it is one field: the fee" (Q6) |
| `brief_item_fee_is_money` | `item_key IS DISTINCT FROM 'fee' OR layer = 'money'` | Same (Q6) |
| `brief_item_universal_is_project_wide` | `layer <> 'universal' OR pairwise_agreement_id IS NULL` | Universal safety is the same terms for everyone on site (Q14). A subject *is* allowed (Q7) |
| `brief_item_no_means_no_is_universal` | `item_key IS DISTINCT FROM 'no_means_no' OR layer = 'universal'` | A safety term every person affirms (Q13) |
| `brief_item_shape_iff_subject` | `(subject_party_id IS NULL) = (shape IS NULL)` | Shape is how the subject controls the term (Q7) |
| `brief_item_drafter_item_has_wording` | `item_key IS NOT NULL OR content IS NOT NULL` | A drafter-written item *is* its wording. A keyed item may wait in the draft for materialized wording, which S09 requires before sharing |
| `brief_item_decide_together_has_no_value` | `pending IS DISTINCT FROM 'decide_together' OR value IS NULL` | Decide-together means not yet supplied (A3) |
| `brief_item_subject_pending_is_open_parameter` | `pending IS DISTINCT FROM 'subject' OR shape = 'open_parameter'` | Only an open parameter awaits its subject (§3.11) |
| `brief_item_open_parameter_state` | `shape IS DISTINCT FROM 'open_parameter' OR (pending = 'subject' AND value IS NULL) OR (pending IS NULL AND value IS NOT NULL)` | An open parameter is either handed to its subject or set by them |
| `brief_item_position_positive` | `position >= 1` | — |

**One fee per pair.** A partial unique index, `brief_item_one_fee_per_pair`, on `(pairwise_agreement_id)` `WHERE item_key = 'fee'` (Q6: one field). No other uniqueness by key is imposed; nothing decided requires it.

**Not in S08, deliberately:**
- any rule that a keyed item is required or not removable;
- any rule tying universal items to product authorship or subjectlessness;
- any requiredness flag;
- any phase-dependent rule.

**Trigger.** Hand-written, using the hardened pattern: pinned `search_path = pg_catalog, public, pg_temp`, schema-qualified tables, `EXECUTE` revoked from `PUBLIC`.

`brief_item_check_scope` runs BEFORE INSERT OR UPDATE. When both `pairwise_agreement_id` and `subject_party_id` are set:
- the subject must be one of that pair's two parties;
- it reads `pairwise_agreement` by `(project_id, id)` and fails closed if the row is not visible;
- otherwise it raises `check_violation` with `CONSTRAINT = 'brief_item_subject_in_pair'`.

Because the runtime role cannot update those columns (see Privileges), the trigger effectively runs on INSERT. It is declared for UPDATE as defence in depth.

There is **no removal trigger** in S08. Draft items, including universal and keyed ones, can be removed while composing. Protection after sharing is S09's.

### 4. Data functions

Put them in `src/briefs/brief.ts`. There is no HTTP operation, logging, principal or network.

- **`openLiveBrief(db, projectId)` → `{ id, projectId }`.** Creates the project's brief or returns the existing one (`INSERT … ON CONFLICT (project_id) DO NOTHING`, then read). Runs as READ COMMITTED. An unknown project raises a foreign-key violation.
- **`addBriefItem(db, briefId, spec)` → `BriefItemRecord`.**
  - `spec` holds `layer`, and optionally `pairwiseAgreementId`, `subjectPartyId`, `shape`, `itemKey`, `content`, `value`, `pending`.
  - It runs in a READ COMMITTED transaction holding `pg_advisory_xact_lock` on a key from `'live-brief:' || lower(brief_id::text)`, the S03 fix technique.
  - It inserts at `max(position) + 1` (1 when empty).
  - `project_id` is read from the brief, never taken from the caller.
  - An unknown brief raises `BriefNotFoundError`.
- **`updateDraftBriefItem(db, itemId, changes)` → `BriefItemRecord`.**
  - `changes` is any of `content`, `value`, `pending`.
  - It runs under the brief lock.
  - Layer, scope, subject, shape, key, brief and project cannot be changed; the runtime role has no `UPDATE` on them.
  - An unknown item raises `BriefItemNotFoundError`.
- **`removeDraftBriefItem(db, itemId)`.** Deletes any draft item under the brief lock. An unknown item raises `BriefItemNotFoundError`.
- **`listBriefItems(db, briefId)` → `BriefItemRecord[]`.** Ordered by `position`, then `id`.
- **`listBriefItemsVisibleTo(db, briefId, partyId)` → `BriefItemRecord[]`.**
  - It returns universal and shared items, plus money items whose pair includes `partyId`.
  - A party outside the brief's project gets an empty list.
  - This is the D10 rule as a filter only; no party view or HTTP exists.
- **`BriefItemRecord`.** Exactly `{ id, briefId, projectId, layer, pairwiseAgreementId, subjectPartyId, shape, itemKey, content, value, pending, position }`, with absent fields as `null`. It has no timestamps and no author.

There is no catalogue: nothing supplies product wording. Callers pass `content`, or leave it null for a keyed item.

## Invariants (tested)

- **S08-1:** one live brief per project, including under concurrency.
- **S08-2:** brief, pair and subject containment, and pair-scoped subjects within their pair.
- **S08-3:** money is pair-scoped and fee-only; a fee is money; one fee per pair.
- **S08-4:** universal items are project-wide and may have a subject; no-means-no is universal.
- **S08-5:** subject and shape go together; the open-parameter, decide-together and settled states are exclusive.
- **S08-6:** a drafter item always has wording; a keyed draft item may not yet.
- **S08-7:** any draft item, including universal and keyed ones, can be removed, and content, value and pending can be edited.
- **S08-8:** one `pairwise_agreement` per pair per project, in either order.
- **S08-9:** no S03–S05 object exists after migration, and no source file references one.
- **S08-10:**
  - live tables carry no timestamp, author, proposer, status-history, revision, requiredness or tick column;
  - identity, layer, scope, subject, shape and key are not updatable by the runtime role;
  - no foreign key cascades.

## Concurrency

| Race | Expected result |
|---|---|
| 12 concurrent `openLiveBrief` calls | One brief id, and one row |
| 12 concurrent `addBriefItem` calls to one brief | Positions 1–12 |
| 2 concurrent fees for one pair | One row and one unique violation on `brief_item_one_fee_per_pair` |
| 2 concurrent `createPairwiseAgreement` calls for one pair | One row and one unique violation |

## Privileges

Hand-written grants:

| Table | Runtime role |
|---|---|
| `live_brief` | `SELECT, INSERT` |
| `brief_item` | `SELECT, INSERT, DELETE`; `UPDATE (content, value, pending, position)` only |
| `pairwise_agreement` | unchanged |

`PUBLIC` is revoked. There is no `TRUNCATE`, no `REFERENCES`, and no table-level `UPDATE`. `DELETE` is correct for a draft workspace: live state is not evidence (HC1).

## Migration strategy

Strategy A: drop now.

**Migrations**
1. **`0019_live_brief_topology`, generated:**
   - drops S03–S05 and the S05 support constraint;
   - adds the `pairwise_agreement` uniques;
   - creates both tables.

   Hand-edit it only to put the duplicate-pair `DO` precheck before the uniqueness key, and to order constraints so each referenced unique exists first, as in 0005, 0009 and 0011.
2. **`0020_live_brief_scope_and_grants`, hand-written:** drops the eight obsolete trigger functions, creates `brief_item_check_scope`, and sets the grants.

**Upgrade tests** in `tests/database/migration-upgrades.test.ts`:
- Each existing boundary case that asserts S03–S05 rows survive "to current" asserts that at its own next boundary instead.
- **New case: populated `0018` → current.**
  - Written beforehand: S01 project and parties, an S02 pair, S03–S05 terms, versions and affirmations, an S06 account and binding, and an S07 invitation.
  - S01, S02, S06 and S07 rows are unchanged.
  - The S03–S05 tables and functions are absent.
  - The catalogue equals a fresh database, and bookkeeping is correct.
  - A rerun is a no-op.
- **New case: duplicate pairs at `0018`.** The upgrade fails with the precheck message, and the database is unchanged.

The table-list, privilege (including column-level `UPDATE` on `brief_item`) and trigger-function pins are updated.

## Tests

`tests/database/briefs.test.ts`, as the runtime role on real PostgreSQL.

**Opening a brief:** create, re-open, concurrent open, unknown project.

**Every check constraint, asserting its name:**
- money without a pair;
- money that is not the fee;
- a fee outside money;
- a universal item with a pair;
- no-means-no outside universal;
- a shape without a subject, and a subject without a shape;
- a drafter item without content;
- decide-together with a value;
- `pending = 'subject'` on a non-open-parameter;
- each invalid open-parameter combination;
- position 0;
- blank or whitespace content and value;
- a second fee for a pair.

**Accepted shapes, explicitly:**
- a universal item with a subject and the shape `declaration`;
- a universal item with no key, as drafter wording;
- a keyed item with null content;
- a keyed item with content;
- a universal `request`;
- a shared open parameter awaiting its subject;
- a decide-together item.

**Containment:** a brief, pair or subject from another project, and a pair-scoped subject outside the pair (`brief_item_subject_in_pair`). Each is checked through the data functions and through raw SQL.

**Editing:**
- content, value and pending change;
- raw-SQL `UPDATE` of layer, scope, subject, shape, key, brief or project fails with `INSUFFICIENT_PRIVILEGE`.

**Removing:** universal, keyed, money and shared draft items are all removable.

**Visibility:**
- parties A, B and C, with pairs A–C and B–C, each with a fee;
- A sees universal, shared and the A–C fee only;
- C sees both fees;
- an outsider sees nothing.

**Order and concurrency:** as listed under Concurrency.

**Schema shape:**
- exact columns, types, constraints, indexes and FK actions;
- no column whose name contains `time`, `_at`, `author`, `propos`, `status`, `version`, `revision`, `history`, `declin`, `sign`, `tick` or `requir`.

**Boundary:** no HTTP operation, and `src/briefs/` has no logging, principal or network code.

**Elsewhere:**
- the pairwise-agreement uniqueness tests;
- the relocated `trigger-functions.test.ts`;
- the upgrade cases above;
- a repository guard: no file in `src/` or `tests/` (except migrations and upgrade-test fixtures) references `universal_term`, `agreement_version`, `_affirmation`, `projects/terms`, `projects/versions` or `projects/affirmations`.

**Mutation checks to run and report** (each restored):
- remove `live_brief_one_per_project`;
- remove `brief_item_money_is_fee`;
- remove `brief_item_universal_is_project_wide`;
- drop `brief_item_check_scope`;
- grant table-level `UPDATE` on `brief_item`;
- remove `pairwise_agreement_one_per_pair`.

## Demo impact

The demo is developer instrumentation.

**Removed:**
- the version and affirmation sections;
- the S03–S05 simulator operations (term add, version present and affirm, both layers) and their UI;
- the R1 and R2 cards;
- the capability rows that depended on them.

**Kept:** `demo.sim.scenario.start` (project, two parties, one pair).

**Fixtures** create a live brief per fixture project with synthetic draft items, every text marked `[synthetic]`:
- a shared project-wide item;
- a universal item with a subject (a synthetic declaration);
- a pair-scoped shared request with a subject;
- an open parameter awaiting its subject;
- a decide-together item;
- a fee per pair.

**There is no fake no-means-no row.** If a keyed item without wording is shown at all, it is shown as instrumentation: "item key `no_means_no` — wording not materialized (draft)". It is never text that looks like part of a participant document.

**The inspector** shows the brief read-only:
- items by layer;
- money labelled "private to this pair";
- subject, shape and pending state as labels;
- a banner: "Draft composition only. Sharing, green state and signing arrive in S09–S11."

**The open-seams view** lists only the no-means-no wording, the signing act and remaining vocabulary. Counsel items stay counsel items.

**Demo tests** (`tests/demo/*`, `tests/demo-browser/regression.test.ts`) are updated. They assert:
- no version, tick, R1 or R2 text;
- money shown only as private-to-pair;
- no product-wording placeholder presented as document text;
- the existing snapshot, mobile, no-horizontal-scroll, stale-navigation and reset coverage still passes.

`docs/engineering/DEMO.md` is rewritten for the new record.

## Documentation

- `docs/engineering/S08-LIVE-BRIEF-TOPOLOGY.md`, the as-built note.
- A one-line "Retired in S08" banner on the S03, S04 and S05 as-built notes. They stay as history.
- The root `README.md` current state.

## Explicit exclusions

- **S09 (sharing):** phases, sharing, the shareability and completeness check, post-share immutability, safety-material protection after sharing, declines, open parameters set by their subject in a live phase, settling.
- **S09 (green state):** ticks, green state, group-check, ready to sign, on-site presence.
- **S10–S11:** the requiredness policy, the catalogue, product wording, logistics keys, deposit terms, typed values, the freeze, the fingerprint, signatures and the final contract.
- **Deferred:** restart, reopen or end behaviour; the multi-party signing unit.
- **Elsewhere:** the call sheet, documents, HTTP, authorization and OAuth.

## Stop conditions

Stop and report rather than choose if implementation would need:
- a layer, shape or requiredness rule for any `item_key` beyond the constraints above;
- product wording;
- a rule about who may compose a draft (that is authorization);
- automatic deletion of duplicate `pairwise_agreement` rows;
- keeping any S03–S05 object for compatibility;
- a timestamp, author, history, requiredness or tick column on live state;
- any phase-dependent rule.
