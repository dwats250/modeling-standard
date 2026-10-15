# Slice — S08 live brief topology, and retirement of S03–S05

Status: PROPOSED — awaiting Dustin approval
Owner: Claude
Date: 2026-10-15
Architecture: [`docs/engineering/LIVE-BRIEF-REBUILD.md`](../engineering/LIVE-BRIEF-REBUILD.md)

## Objective

Replace the obsolete S03–S05 term stack with the structural core of Cory's live-brief model. Specifically:
- one live brief per project;
- brief items carrying their visibility layer, pair scope, subject, shape, product key and pending state;
- one pairwise agreement per pair per project.

Remove every S03–S05 table, trigger function and data function so no product code can reach the retained-version model.

After this slice a brief can be **composed** (the draft phase) through data functions, and its per-party visibility computed. Sharing, ticks, declines, finality and contracts are later slices (S09–S11).

## Authority

**Cory rulings relied on**, all DECIDED for photo shoots:
- **One agreement per pair, per project** (Q5; D02).
- **Three visibility layers**, with money the only private thing (Q14, A2; D02, D10).
- **Requiredness is product-owned.** A drafter cannot promote a preference into a required term (Q2; D04).
- **The fixed deliberate-tick items** are fee, coverage level, physical contact and stop rule (Q6; D04). Money is one field: the fee (Q6).
- **The subject of a term controls it:** declaration, request about another person, open parameter (Q7, §3.11; D04).
- **Universal safety terms can never be dropped** (Q7, A5b).
- **Every field is supplied or explicitly decide-together;** there are no accidental blanks (A3; D04).
- **No-means-no is a safety term every person affirms individually** (Q13; D04). Its wording is OPEN and not needed here.
- **HC1:** there is no version history.
- **HC2:** there is no proposer identity.

**Not relied on, and not touched:** the no-means-no wording, the visible signing act, the remaining D05 vocabulary, the D01 required-term catalogue, and the document trigger table. Internal code names are not product vocabulary.

## Exact scope

### 1. Retire S03–S05

One new migration drops, with nothing else depending on them:
- **tables:** `universal_affirmation`, `agreement_affirmation`, `universal_version_term`, `agreement_version_term`, `universal_version`, `agreement_version`, `universal_term`, `agreement_term`;
- **trigger functions:**
  - `agreement_version_stamp`, `universal_version_stamp`;
  - `agreement_version_check_sealed`, `universal_version_check_sealed`;
  - `agreement_version_term_check_copy`, `universal_version_term_check_copy`;
  - `agreement_affirmation_stamp`, `universal_affirmation_stamp`;
- **the constraint** `pairwise_agreement_id_parties_unique`.

Keep `project_party_project_id_id_unique`; S02, S06 and S07 use it.

**Code removed:**
- `src/projects/terms.ts`, `src/projects/versions.ts`, `src/projects/affirmations.ts`, and their table definitions in `src/projects/tables.ts`;
- `tests/database/terms.test.ts`, `versions.test.ts`, `affirmations.test.ts`.

**Code relocated:**
- The trigger-function hygiene pin in `versions.test.ts` moves to `tests/database/trigger-functions.test.ts`, pinned to the trigger functions that remain.
- `tests/database/identifiers.test.ts` keeps its identifier-length checks. Its agreement-version FK-name assertions are removed, because the object no longer exists. The shipped-exception entry in `src/infrastructure/database/identifier-length.ts` stays, because the 0014 file still exists.

Earlier migrations are not edited.

### 2. One agreement per pair

On `pairwise_agreement`:
- add `UNIQUE (project_id, party_one_id, party_two_id)`, named `pairwise_agreement_one_per_pair`;
- add `UNIQUE (project_id, id)`, named `pairwise_agreement_project_id_id_unique`, as the containment target for `brief_item`.

**Precheck.** In the same migration, before the uniqueness key, a `DO` block raises:

> duplicate pairwise agreements exist; S08 requires one per pair per project — reset the development database

if any pair is duplicated. No row is deleted automatically.

Update `createPairwiseAgreement`'s documentation: the database now refuses a second agreement for the same pair. Rewrite `tests/database/pairwise-agreements.test.ts:86` ("unordered pair") so it no longer creates the same pair twice, and add a test that the second agreement for a pair, in either order, is a unique violation on `pairwise_agreement_one_per_pair`.

### 3. New tables

Put them in `src/briefs/tables.ts` and register it in `drizzle.config.ts`.

**`live_brief`**
- `id uuid` primary key, `gen_random_uuid()`
- `project_id uuid not null`, references `project(id)`, `UNIQUE (project_id)` (`live_brief_one_per_project`)
- `UNIQUE (id, project_id)` (`live_brief_id_project_unique`), the containment target for items
- No other columns. In particular no timestamps (noise doctrine) and no phase; S09 adds the phase.

**`brief_item`**

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `brief_id` | `uuid not null` | — |
| `project_id` | `uuid not null` | — |
| `layer` | `text not null` | `in ('universal','shared','money')` |
| `pairwise_agreement_id` | `uuid` | nullable |
| `subject_party_id` | `uuid` | nullable |
| `shape` | `text` | nullable, `in ('declaration','request','open_parameter')` |
| `product_key` | `text` | nullable, `in ('fee','coverage_level','physical_contact','stop_rule','no_means_no')` |
| `content` | `text` | nullable; when present, `~ '[^[:space:]]'` |
| `value` | `text` | nullable; when present, `~ '[^[:space:]]'` |
| `pending` | `text` | nullable, `in ('decide_together','subject')` |
| `position` | `integer not null` | `>= 1`; not unique (a display hint; ties order by `id`) |

**Containment foreign keys** (all `NO ACTION`):
- `(brief_id, project_id)` → `live_brief (id, project_id)`, named `brief_item_in_brief_fk`;
- `(project_id, pairwise_agreement_id)` → `pairwise_agreement (project_id, id)`, named `brief_item_pair_in_project_fk`;
- `(project_id, subject_party_id)` → `project_party (project_id, id)`, named `brief_item_subject_in_project_fk`.

**Check constraints.** Exact names, because the tests assert them.

| Name | Expression |
|---|---|
| `brief_item_money_is_pair_scoped` | `layer <> 'money' OR pairwise_agreement_id IS NOT NULL` |
| `brief_item_money_is_fee` | `layer <> 'money' OR product_key = 'fee'` |
| `brief_item_fee_is_money` | `product_key IS DISTINCT FROM 'fee' OR layer = 'money'` |
| `brief_item_universal_is_project_wide` | `layer <> 'universal' OR (pairwise_agreement_id IS NULL AND subject_party_id IS NULL)` |
| `brief_item_universal_is_product_owned` | `layer <> 'universal' OR product_key IS NOT NULL` |
| `brief_item_no_means_no_is_universal` | `product_key IS DISTINCT FROM 'no_means_no' OR layer = 'universal'` |
| `brief_item_shape_iff_subject` | `(subject_party_id IS NULL) = (shape IS NULL)` |
| `brief_item_required_is_not_request` | `product_key IS NULL OR shape IS DISTINCT FROM 'request'` |
| `brief_item_wording_owner` | `(product_key IS NULL) = (content IS NOT NULL)` — drafter items carry wording; product items take wording from the product, never the row |
| `brief_item_decide_together_has_no_value` | `pending IS DISTINCT FROM 'decide_together' OR value IS NULL` |
| `brief_item_subject_pending_is_open_parameter` | `pending IS DISTINCT FROM 'subject' OR shape = 'open_parameter'` |
| `brief_item_open_parameter_state` | `shape IS DISTINCT FROM 'open_parameter' OR (pending = 'subject' AND value IS NULL) OR (pending IS NULL AND value IS NOT NULL)` |
| `brief_item_position_positive` | `position >= 1` |

**Product-key uniqueness.** A partial unique index, `brief_item_product_key_once_per_scope`, on `(brief_id, pairwise_agreement_id, subject_party_id, product_key)` `NULLS NOT DISTINCT WHERE product_key IS NOT NULL`. This means one fee per pair, one no-means-no per brief, and one coverage level per subject per scope.

**Triggers.** Hand-written migration, using the hardened pattern: pinned `search_path = pg_catalog, public, pg_temp`, schema-qualified tables, `EXECUTE` revoked from `PUBLIC`.
- **`brief_item_check_scope`** (BEFORE INSERT OR UPDATE). If both `pairwise_agreement_id` and `subject_party_id` are set, the subject must be one of that agreement's two parties. Otherwise it raises `check_violation` with `CONSTRAINT = 'brief_item_subject_in_pair'`. It reads `pairwise_agreement` by `(project_id, id)` and rejects an agreement it cannot see (fail closed).
- **`brief_item_guard_removal`** (BEFORE DELETE). Refuses deleting any item whose `layer = 'universal'` or whose `product_key IS NOT NULL`, with `check_violation`, `CONSTRAINT = 'brief_item_required_is_not_removable'`. S11 will add the single sanctioned path that clears live items after finalization.

Positions need no trigger; the data function assigns them under the brief lock (below).

### 4. Data functions

Put them in `src/briefs/brief.ts`. There is no HTTP operation.

- **`openLiveBrief(db, projectId)` → `{ id, projectId }`.** Creates the project's live brief or returns the existing one (`INSERT … ON CONFLICT (project_id) DO NOTHING`, then read; READ COMMITTED). An unknown project is a foreign-key violation.
- **`addBriefItem(db, briefId, spec)` → `BriefItemRecord`.** `spec` holds:
  - `layer`;
  - optional `pairwiseAgreementId`, `subjectPartyId`, `shape`, `productKey`, `content`, `value`, `pending`.

  It runs in a transaction that takes `pg_advisory_xact_lock` on a key derived from `'live-brief:' || brief_id` (lowercased UUID, as in the S03 fix). It then inserts at `max(position) + 1` (1 when empty). `project_id` is taken from the brief, never from the caller. Every rule above is the database's.
- **`updateDraftBriefItem(db, itemId, changes)` → `BriefItemRecord`.** `changes` is any of `content`, `value`, `pending`. Under the brief lock. Identity, layer, scope, subject, shape and product key cannot change, because the runtime role has no `UPDATE` on those columns. In S08 every brief is in the draft phase. S09 adds the phase and the post-sharing rules; nothing here may anticipate them.
- **`removeDraftBriefItem(db, itemId)`.** Under the brief lock. A universal or product-keyed item is refused by the trigger.
- **`listBriefItems(db, briefId)` → `BriefItemRecord[]`.** Ordered by `position`, then `id`.
- **`listBriefItemsVisibleTo(db, briefId, partyId)` → `BriefItemRecord[]`.**
  - It returns universal and shared items, plus money items whose agreement includes `partyId`.
  - A party not in the brief's project gets an empty list.
  - This is the D10 rule as a pure filter; no party view or HTTP exists.
- **`BriefItemRecord`.** Exactly `{ id, briefId, projectId, layer, pairwiseAgreementId, subjectPartyId, shape, productKey, content, value, pending, position }`, with nullable fields as `null`. It has no timestamps and no author.

Nothing in `src/briefs/` logs, reads a principal, or calls the network.

## Invariants (tested)

- **S08-1:** one live brief per project, including under concurrent `openLiveBrief`.
- **S08-2:** item containment. The brief, pair and subject all belong to the item's project, and a pair-scoped subject is one of the pair.
- **S08-3:** the layer rules: money is pair-scoped and fee-only; universal is project-wide, subject-less and product-owned.
- **S08-4:** requiredness is product-owned. A product-keyed item is never a request. Drafter items carry wording; product items never do.
- **S08-5:** subject and shape go together; the open-parameter, decide-together and settled states are exclusive.
- **S08-6:** one product key per scope.
- **S08-7:** universal and product-keyed items cannot be deleted; other draft items can.
- **S08-8:** one pairwise agreement per pair per project, in either party order.
- **S08-9:** no S03–S05 object exists after migration, and no source file imports one.
- **S08-10:**
  - the live tables carry no timestamp, author, proposer, status-history or revision column;
  - the runtime role cannot update identity, layer, scope, subject, shape or product key;
  - no foreign key cascades.

## Concurrency

- **Brief creation:** twelve concurrent `openLiveBrief(projectId)` calls return one brief id, and exactly one row exists.
- **Item positions:** twelve concurrent `addBriefItem` calls to one brief get positions 1–12, with no duplicates.
- **Agreements:** two concurrent `createPairwiseAgreement` calls for the same pair produce one row and one unique violation.
- **Isolation:** the item data functions run their own READ COMMITTED transaction.

## Privileges

Hand-written grants, in the same migration as the triggers:

| Table | Runtime role |
|---|---|
| `live_brief` | `SELECT, INSERT` |
| `brief_item` | `SELECT, INSERT, DELETE`; `UPDATE (content, value, pending, position)` only |
| `pairwise_agreement` | unchanged (`SELECT, INSERT`) |

`PUBLIC` is revoked on both new tables. There is no `TRUNCATE`, no `REFERENCES`, and no table-level `UPDATE`.

`DELETE` on `brief_item` is deliberate: live state is not evidence (HC1). The removal trigger protects required items.

## Migration strategy

Strategy A (architecture section 12): drop now, with no compatibility layer.

**Migrations**
1. **Generated migration**, `0019_live_brief_topology`:
   - drop the S03–S05 tables and the S05 support constraint;
   - add the two `pairwise_agreement` uniques;
   - create `live_brief` and `brief_item`.

   Hand-edit it only to put the duplicate-pair `DO` precheck before the uniqueness key, and to order constraints so each referenced unique exists first, as in 0005, 0009 and 0011.
2. **Hand-written custom migration**, `0020_live_brief_rules_and_grants`:
   - drop the eight obsolete trigger functions;
   - create the two new triggers;
   - grants.

**Upgrade tests** in `tests/database/migration-upgrades.test.ts`:
- Each existing boundary case that asserts S03–S05 rows survive "to current" asserts them at its own boundary instead (`migrateThrough` the next migration). Its claim is about that seam, not about today's schema.
- **New case, populated pre-S08 (`0018`) → current:**
  - S01 project and parties, S02 agreement, S03–S05 terms, versions and affirmations, S06 account and binding, and S07 invitation are written;
  - after the upgrade, the S01, S02, S06 and S07 rows are unchanged;
  - the S03–S05 tables and functions are absent;
  - the catalogue equals a fresh database;
  - bookkeeping is correct;
  - a second run is a no-op.
- **New case, duplicate pairs at `0018` → upgrade fails** with the precheck message, and the database is unchanged.

**Pins** for the table list, runtime privileges (including the column-level `UPDATE` exception for `brief_item`), and trigger functions are updated to the new set.

## Tests

`tests/database/briefs.test.ts`, against real PostgreSQL as the runtime role.

**Opening a brief**
- create; re-open returns the same brief;
- concurrent opens produce one brief;
- an unknown project is refused.

**Adding items, one test per check constraint, asserting the named constraint:**
- money without a pair;
- money that is not the fee;
- a fee outside money;
- a universal item with a pair or a subject;
- a universal item without a product key;
- no-means-no outside universal;
- a shape without a subject, and a subject without a shape;
- a product-keyed request;
- a drafter item without content;
- a product item with content;
- decide-together with a value;
- `pending = 'subject'` on a non-open-parameter;
- an open parameter both unset-and-valued or neither;
- position 0;
- blank or whitespace-only content and value;
- a second fee for the same pair;
- a second no-means-no in a brief;
- a second coverage level for the same subject and scope;
- a coverage level for two different subjects (allowed).

**Containment**
- a brief from another project;
- an agreement from another project;
- a subject from another project;
- a pair-scoped subject outside the pair (`brief_item_subject_in_pair`);
- every one by the database, including raw SQL as the runtime role.

**Updating**
- content, value and pending change in the draft;
- `UPDATE` of `layer`, `pairwise_agreement_id`, `subject_party_id`, `shape`, `product_key`, `brief_id` or `project_id` by raw SQL is `INSUFFICIENT_PRIVILEGE`.

**Removing**
- a shared drafter item is removed;
- a universal item and a product-keyed money item are refused (`brief_item_required_is_not_removable`), from the data function and from raw SQL.

**Visibility**
- in a project with parties A, B and C and agreements A–C and B–C, each with a fee:
  - A sees universal, shared and the A–C fee, but not the B–C fee;
  - C sees both fees;
  - a party of another project sees nothing.

**Order and concurrency**
- positions under twelve concurrent adds;
- ordering by `(position, id)`.

**Schema shape**
- exact columns, types, constraints and indexes;
- no cascading foreign key;
- no column whose name contains `time`, `_at`, `author`, `propos`, `status`, `version`, `revision`, `history`, `declin`, `sign` or `tick`.

**Boundary**
- no HTTP operation;
- `src/briefs/` has no logging, principal or network code.

**Elsewhere**
- **`pairwise-agreements.test.ts`:** one-per-pair in both orders; concurrent duplicates.
- **`trigger-functions.test.ts`:** the relocated hygiene pin.
- **The upgrade cases above.**
- **A repository guard:** no file under `src/` or `tests/` (other than migrations and upgrade-test fixtures) references `universal_term`, `agreement_version`, `_affirmation`, `projects/terms`, `projects/versions` or `projects/affirmations`.

**Mutation checks to run and report** (each restored):
- remove `live_brief_one_per_project`;
- remove `brief_item_money_is_fee`;
- remove `brief_item_universal_is_product_owned`;
- drop the removal trigger;
- grant table-level `UPDATE` on `brief_item`;
- remove `pairwise_agreement_one_per_pair`.

## Demo impact

The demo stops showing retained versions and tick grids in this slice.

**Removed**
- the version and affirmation sections of the inspector;
- the S03–S05 simulator operations (term add, version present, affirm, for both layers) and their UI;
- the R1 and R2 seam cards;
- the "Keep evidence across a resend" and "Let a real person drop a declined term" capability rows.

**Kept**
- `demo.sim.scenario.start` (project, two parties, one agreement).

**Fixtures** create one live brief per fixture project, with draft items in all three layers:
- universal `no_means_no`, whose wording is rendered as `[product wording pending — Cory]`, never stored;
- shared drafter items, including a pair-scoped deliverable with a subject and a request;
- an open parameter awaiting its subject;
- a decide-together item;
- a fee per pair.

Fixture 2 keeps three parties and two agreements.

**Inspector** shows the live brief read-only:
- items grouped by layer;
- money labelled "private to this pair";
- subject, shape and pending state as plain labels;
- a banner: "Draft composition only. Sharing, green state and signing arrive in S09–S11."

**Open-seams view** lists only the no-means-no wording, the signing act and remaining vocabulary. Its "Decided, not built" list gains "live brief sharing and green state (S09)". Counsel items stay counsel items.

**Demo tests:** `tests/demo/*` and `tests/demo-browser/regression.test.ts` are updated to the new record shape and labels. They assert:
- no version, tick, R1 or R2 text;
- the money layer shown only as private-to-pair;
- the existing snapshot, mobile, no-horizontal-scroll, stale-navigation and reset coverage still passes.

`docs/engineering/DEMO.md` is rewritten for the new record.

## Documentation

- `docs/engineering/S08-LIVE-BRIEF-TOPOLOGY.md`: the as-built note, in the S01–S07 pattern.
- `docs/engineering/S03-TERM-UNITS.md`, `S04-PRESENTED-VERSIONS.md` and `S05-TERM-AFFIRMATION.md` stay as history. Each gets a one-line "Retired in S08" banner.
- Root `README.md` current state: S03–S05 retired, S08 built.

## Explicit exclusions

- **Any phase or sharing** (`draft` → `live`), post-sharing mutation rules, declines, open-parameter setting by the subject, and settling decide-together items in a live phase. All S09.
- **Ticks, green state, group-check, ready-to-sign and presence (on site).** S09.
- **Freeze, fingerprint, signatures and the final contract.** S10, S11.
- **Product wording or a catalogue** for any product key, the D01 required-term list, logistics keys (location, schedule, call time), deposit terms, and typed values (amount, currency, address).
- **The call sheet, documents and the trigger table.**
- **HTTP operations, authorization, participants and OAuth.**
- **Date-change, replacement and restart behaviour;** the same-project-or-new-project question.
- **The three-party signing unit.**

## Stop conditions

Stop and report instead of choosing if implementation would need:
- a layer or shape for `coverage_level`, `physical_contact` or `stop_rule` beyond what the constraints above allow. Their placement belongs to the D01 catalogue;
- any product wording;
- a rule about who may compose or edit a draft brief. That is authorization, which belongs to the participant surface;
- deleting a duplicate `pairwise_agreement` automatically;
- keeping any S03–S05 table, function or test for compatibility;
- a timestamp, author or history column on live state.
