# Live brief rebuild — replacing S03–S05

Status: PROPOSED ARCHITECTURE, 2026-10-15 — awaiting Dustin's review. No code, schema, migration, test or demo behaviour changed to produce it.

Base: `main` at `ef08117`, which contains S01–S07.

Authority:
- Cory's rulings in [`decisions/2026-10-09-15-cory-reconciliation.md`](../../decisions/2026-10-09-15-cory-reconciliation.md), as corrected by handoff corrections HC1 (no version history) and HC2 (no proposer identity);
- D02 (DECIDED for photo shoots), D04 (OPEN only on the no-means-no wording and the visible signing act), D05, D08, D10 (DECIDED for photo shoots) and D12.

The first slice is proposed in [`docs/slices/S08-live-brief-topology.md`](../slices/S08-live-brief-topology.md).

---

## 1. The product model in plain language

A photo shoot is a **project**. Before anyone signs there is **one live brief** for it. The brief holds everything the shoot needs, in three visibility layers:

- **Universal safety:** the same terms for everyone physically on site. They can never be dropped.
- **Shared material:** logistics, schedule, call times, location, craft terms, deliverables and usage, visible to everyone in the collaboration. The call sheet is eventually produced from the logistics part.
- **Private money:** the fee between two people. It is visible only to those two. This is the only private thing.

Some terms are **about a person**, and that person controls them:
- a **declaration** ("don't touch my hair") cannot be overridden; the others proceed under it or walk away;
- a **request** about someone can be declined by them, and then it simply disappears;
- an **open parameter** ("you set this one") is filled in by the person it concerns.

Every field that reaches another person is either **supplied** or explicitly **decide-together**.

The brief cycles between people:
- they tick items, and the brief fills in **green**;
- declined requests vanish;
- decide-together items and open parameters get settled;
- **nothing is ever added or widened** once the brief has been shared.

When every item is green for everyone who must green-light it, the brief is **ready to sign**. Signing produces **one final contract**, and only that contract is evidence. Each person's record of it is everything jointly agreed plus their own payment terms, and nobody else's.

The product keeps no version history, no change history, no record of a "no", and no record of who proposed what.

## 2. Current versus target

```
CURRENT (S03–S05, obsolete model)                TARGET

project ── pairwise_agreement (duplicates ok)    project ── pairwise_agreement (one per pair)
   │             │                                  │              │
universal_term  agreement_term  (append-only)       └── live_brief (one per project; mutable workspace)
   │             │                                         │
universal_version agreement_version (sealed, numbered)     └── brief_item  (layer · scope · subject · shape
   │             │                                         │               · product key · content · value · pending)
universal_version_term agreement_version_term (copies)     │
   │             │                                         └── brief_tick   (current green state; no time; deletable)
universal_affirmation agreement_affirmation                         │
   (append-only, per version, timestamped)          ready-to-sign = derived predicate, checked under a brief lock
                                                                    │
                                                    final_contract (frozen, append-only)
                                                                    │
                                                    contract signatures + evidence (append-only)
```

The left column keeps every intermediate state forever. The right column keeps only the current working state, which is mutable and not evidence, and then one frozen contract.

## 3. Invariants

| ID | Invariant | Enforced by |
|---|---|---|
| LB-1 | A project has at most one live brief. | Unique key |
| LB-2 | Every brief item belongs to its brief's project. Its pair scope and subject belong to that project, and a pair-scoped subject is one of the pair. | Composite foreign keys plus a check trigger |
| LB-3 | Layer rules: money is always pair-scoped; universal is project-wide with no subject; universal items are product-owned. | Check constraints |
| LB-4 | Money is the only private layer, and it holds only product-defined money items. Today that is only `fee`; deposit terms join when the catalogue defines them. | Check constraint |
| LB-5 | Requiredness is product-owned. Only product-keyed items are required, and a product-keyed item is never a declinable request. A drafter cannot create a required item. | Check constraints; product wording lives in code, not in the row |
| LB-6 | A subject is zero or one party. A shape exists if and only if a subject exists. | Check constraints |
| LB-7 | Every item is settled, decide-together, or awaiting its subject (open parameter only). There are no accidental blanks. | Check constraints, and a shareability check at share time (S09) |
| LB-8 | After the brief is shared, nothing is added or widened. No item is inserted. Settled content and values never change. Only pending → settled transitions, request removal by its subject, ticks and unticks happen. | Triggers plus column-limited grants (S09) |
| LB-9 | Universal and product-keyed items can never be removed. | Trigger |
| LB-10 | A decline leaves no trace: the request row is deleted and its ticks go with it. | `ON DELETE CASCADE` inside live state only |
| LB-11 | Ticks are current state only. They carry no time, order or author beyond the ticking party, and an untick deletes the row. | Schema: `brief_tick (item, party)` with no time column |
| LB-12 | A tick is accepted only from a party who must green-light that item, and only on a settled item. | Trigger (S09) |
| LB-13 | Ready to sign is derived, not stored. It is checked and frozen under the brief lock. | Data function plus the freeze transaction (S10) |
| LB-14 | The final contract is append-only. Nothing cascades into it. Live state never references it. | Grants and foreign keys (S11) |
| LB-15 | Until every approver has signed, nothing is evidence. The frozen brief and its pending signatures are live state, discarded on any withdrawal. Only a fully signed contract is written to the append-only contract tables. | Freeze and finalize data functions (S10, S11) |
| LB-16 | One pairwise agreement per pair per project. | Unique key (S08) |

## 4. Proposed data model

All names are internal code names. D05 public vocabulary is unaffected.

**`pairwise_agreement`** — kept, and reinterpreted as the agreement between two parties of a project. There is exactly one per pair per project (section 10). S08 adds `UNIQUE (project_id, party_one_id, party_two_id)` and `UNIQUE (project_id, id)`.

**`live_brief`** — the mutable workspace.
- S08 columns: `id`, `project_id` (unique).
- S09 adds the phase: `draft` → `live` → `signing`.
- There are no timestamps: when people act is noise.

**`brief_item`** — one term or field of the brief.

| Column | Meaning |
|---|---|
| `id`, `brief_id`, `project_id` | Identity and containment |
| `layer` | `universal` · `shared` · `money` (visibility layer) |
| `pairwise_agreement_id` | Null for project-wide items. Set for pair-scoped items: every money item, and shared items that concern one pair, such as their deliverables or usage |
| `subject_party_id` | Null when the term is about nobody in particular (universal safety, logistics, the fee); else the one party it is about |
| `shape` | `declaration` · `request` · `open_parameter`; present exactly when a subject is |
| `product_key` | Null for drafter-written items. Else one of `fee`, `coverage_level`, `physical_contact`, `stop_rule`, `no_means_no`. The product owns the wording, so `content` is null |
| `content` | The drafter's wording; present exactly when `product_key` is null |
| `value` | The supplied value of a field (amount, level, address), when the item has one |
| `pending` | Null when settled; `decide_together`; or `subject` (an open parameter awaiting its subject's value) |
| `position` | Display order hint only |

**`brief_tick` (S09)** — `(brief_item_id, party_id)`, primary key on both. It has no time, no order and no bulk flag. Deleting a tick is an untick. It cascades from its item.

**Freeze (S10)** — no new evidence table yet:
- the brief's phase becomes `signing`, which locks every item and every tick;
- the brief records a fingerprint computed over a canonical serialization of its current items, with product wording rendered from the code catalogue. It is a digest of exactly what is being signed and carries no legal meaning here;
- `pending_signature (brief_id, party_id)` rows (S11) are live state and deletable.

**`final_contract`, `final_contract_item`, `final_contract_signature` (S11)** — written once, in the transaction in which the last approver signs:
- the items, copied with the faithful-copy technique S04 used, once;
- the fingerprint;
- each party's signature: party, bound account (S06) as the credential, database time, and IP and device once an HTTP surface exists;
- append-only, no cascades.

The visible signing act is not chosen.

**Why one item table, not three.** The layers decide visibility and who must green-light an item. They do not change what an item is. One table with a `layer` column gives:
- one tick mechanism;
- one no-widening rule;
- one freeze and one final copy.

Three tables would triple each of those for no semantic gain. Money is still enforced as a product-defined, pair-scoped layer (LB-4), so this does not create generic private terms.

## 5. Visibility model

What a party sees is a pure function of the current rows:

- **universal:** everyone in the project;
- **shared:** everyone in the project. Pair-scoped shared items such as deliverables and usage are visible to all; their scope affects who green-lights them, not who sees them;
- **money:** only the two parties of `pairwise_agreement_id`;
- **ticks:** everyone sees the live document fill in green (D10, "a live shared document"). A tick on a money item is visible only to whoever can see that item;
- **never present anywhere:** times, ordering of actions, who removed what, revision counts, whether group-check was used. None of these is stored, so none can leak (noise doctrine).

A person's final record is the same function applied to the final contract: everything jointly agreed, plus money items of their own pairs. One canonical contract with per-party views satisfies D10. Separate per-party artifacts are a rendering detail, not separate agreements.

## 6. Term subject and shape

Cory's examples and how each maps:

| Example | Layer | Scope | Subject | Shape | Product key |
|---|---|---|---|---|---|
| "Don't touch my hair" | shared | project or pair | her | declaration | — |
| Asking the model to bring a wardrobe change | shared | pair | the model | request | — |
| "Here is the theme, what's your level?" | shared | pair | the model | open_parameter | — (or `coverage_level`) |
| The model's coverage level | shared or universal (see note) | — | the model | declaration or open_parameter | `coverage_level` |
| The fee | money | pair | — | — | `fee` |
| No-means-no acknowledgment | universal | project | — | — | `no_means_no` |
| Location, schedule, call times | shared | project | — | — | — (catalogue keys later) |
| 20 edited images delivered | shared | pair | the photographer | request or declaration | — |

**Rules**
- **Declaration:** only the subject sets or settles it. Everyone else may tick or walk away. Nobody else can decline it.
- **Request:** the subject may decline it, which deletes it. Nobody else can remove it once the brief is shared.
- **Open parameter:** created with `pending = 'subject'`. Only the subject may supply the value, which settles it.
- **No subject:** accept (tick) or walk away. Nobody declines it.
- **Several subjects:** none of Cory's examples needs one. Dual roles are "additional terms inside it" (Q5), so they are separate items, one subject each.

**Note on product-key layers.** The layer and shape of `coverage_level`, `physical_contact` and `stop_rule` are not fixed by the schema. They belong to the D01 required-term draft that Dustin writes and Cory checks; that is already queued and is not new homework. The only placements fixed now follow directly from rulings:
- `fee` is money (Q6);
- `no_means_no` is universal (Q13).

## 7. Live tick (green) model

Ticks are **mutable current state**, not evidence (HC1).

- **Tick:** insert `(item, party)`.
- **Untick:** delete the row. That is taking away before finality (Q11), and it leaves nothing behind.
- **Decline:** deletes the request item, and its ticks cascade.
- **Who must tick an item (its approvers)** is derived, not stored:
  - universal → every party who will be on site (presence arrives in S09 as a per-party roster fact);
  - shared project-wide → every party of the project;
  - shared pair-scoped, or money → the two parties of the pair.
- **Green item:** every approver has a tick.
- **Accepted material stays green:** an item's content and value cannot change after sharing, so a tick can never refer to stale content. No revision counter and no carry-forward are needed.
- **Group-check** is one data-function call that inserts individual ticks. It refuses product-keyed items (fee, coverage level, physical contact, stop rule, no-means-no), so the four deliberate items cannot hide behind it. Nothing records that it was used.

**Why not append-only:**
- Append-only exists to make the past reconstructable, which HC1 forbids for live state.
- Replaceable snapshot rows would be hidden versions.
- Fully derived state is impossible, because a tick is a person's act, not a computation.
- Plain rows that can be inserted and deleted are the minimum.

## 8. Finality seam

**Ready to sign** is a predicate over current rows. All of these must hold:
1. the brief is `live`;
2. no item is pending (`decide_together` or `subject`);
3. every item has a tick from each of its approvers;
4. every approver is a party of the project.

D02: there is no organizer confirmation.

The **freeze** (S10) works in one transaction under the brief's lock:
1. re-check the predicate;
2. compute the fingerprint of the current items;
3. set the phase to `signing`, which locks every item and every new tick.

Nothing is copied at freeze.

**Withdrawal during signing:** any untick or withdrawal returns the phase to `live` and deletes the pending signatures. A document not signed by everyone was never "the final contract" (HC1), and nothing about the attempt is kept.

**Signing (S11)** records a pending signature per party, bound to the fingerprint. When the last approver signs, the same transaction writes the append-only final contract (items, fingerprint, signatures) and deletes the live items, ticks and pending signatures. They are not evidence; the contract now holds the agreed content.

The visible signing act (typed name, drawn mark, click) is D04-open. It sits at the HTTP/UI boundary and does not change the storage.

## 9. Final-contract seam

**Contents**
- the frozen items of every layer;
- product wording rendered at freeze time;
- the pair scope and subject of each item;
- the contract's parties.

**Evidence (S11)**
- a fingerprint over a canonical serialization of the frozen content;
- per-party signature rows: party, bound account (credential), database time;
- IP and device once a request surface exists.

**Per-person record:** a view that filters money items to the person's own pairs. It is one contract, not several agreements.

**Not chosen here:** the signature UX, the legal meaning of the fingerprint, chaining across contracts, retention (counsel), and the document trigger table (D08).

## 10. `pairwise_agreement`: relationship versus contract instance

Cory: "one agreement per pair, per project". Also, a changed date or a variable-supplier replacement "ends the agreement" and "a new one begins".

**Technical resolution:**
- `pairwise_agreement` is **the agreement between two parties of a project**. It is unique per pair per project from S08.
- What ends and restarts is the **contract instance**: the signed `final_contract` and its live brief cycle. It is not the relationship row.
- An ended contract stays as evidence of what was signed. A restart opens the live brief again, seeded from the ended contract's terms ("terms carry over so a new one is quick"), and everyone signs a new contract.

There is no history problem here. The ended contract is a signed contract, which is evidence, not a negotiation state.

**Seam deferred to the date-change slice, not needed until then:** whether the new agreement begins inside the same project or as a new project. Both are product-consistent and users would see them differently, as one shoot container or two. Neither choice affects S08–S11, so it is not raised as Cory homework now.

**Second seam, deferred to the first three-party slice:** the signing unit with three or more parties. The rulings read both ways:
- one all-green moment for the whole brief ("until everything is green for everyone", Q3, Q12);
- each pair final independently (2026-10-05: an unrelated participant does not hold up another pair).

D01 is two people, where the two readings coincide. S08–S11 are built and tested for one project with one pair. The approver derivation already generalizes. Only the freeze unit would differ, and that question goes to Cory with the first three-party slice. D02 already notes that (a) and (f) can wait for the slice that adds a third person. This is not a contradiction in the recorded rulings; it is an unresolved case they do not address.

## 11. Disposition of S03–S05

| Object | Disposition | Why |
|---|---|---|
| `universal_term`, `agreement_term` | **DROP BEFORE REAL USE (S08)** | Append-only source rows existed to feed retained versions (HC1). `agreement_term` also encodes the superseded private "commercial and craft" layer. `brief_item` replaces both. |
| `universal_version`, `agreement_version` | **DROP (S08)** | They number successive retained presentations, which the product does not have. |
| `universal_version_term`, `agreement_version_term` | **DROP (S08)** | Frozen copies per version. The faithful-copy technique moves to the single copy into `final_contract` at finalization (S11). |
| `universal_affirmation`, `agreement_affirmation` | **DROP (S08)** | Append-only, timestamped, per-version tick history: time leaks response behaviour, and the rows outlive the state they describe. Replaced by `brief_tick` (S09) and contract signatures (S11). |
| Trigger functions `*_version_stamp`, `*_version_check_sealed`, `*_version_term_check_copy`, `*_affirmation_stamp` | **DROP (S08)** | They belong to the dropped tables. Their patterns are kept: pinned `search_path`, no `PUBLIC` execute, database time, fail-closed visibility checks. |
| Read-committed-only guard (0013) | **DROP with the affirmation functions (S08)** | The lesson stays: live mutations and the freeze run as READ COMMITTED, and snapshot-isolated callers fail closed. |
| Uniques added only to serve them: `agreement_term (pairwise_agreement_id, id)`, `universal_term (project_id, id)` | **DROP with their tables (S08)** | No remaining referent. |
| `pairwise_agreement_id_parties_unique` | **DROP (S08)** | It existed only so S05 rows could prove their party was one of the pair. The new pair-subject check is a trigger. |
| `project_party_project_id_id_unique` | **KEEP UNCHANGED** | Used by S02, S06 and S07, and by `brief_item` containment. |
| `pairwise_agreement` | **KEEP BUT REINTERPRET; add uniqueness (S08)** | It is the agreement between two parties (section 10). |
| Grants on dropped tables | **DROP with them** | The minimal-privilege pattern carries into the new grants. |
| `src/projects/terms.ts`, `versions.ts`, `affirmations.ts` | **DROP (S08)** | No product code may reach the obsolete model. Git keeps the history. |
| `tests/database/terms.test.ts`, `versions.test.ts`, `affirmations.test.ts`, the S04 FK-name identifier test | **DROP or RELOCATE (S08)** | The trigger-function hygiene pin, which lives in `versions.test.ts`, moves to its own file. |
| Demo simulator term, version and affirm operations; inspector version grids | **REPLACE (S08 strips; S09 rebuilds as live brief)** | Section 15. |
| Migrations `0007`–`0014` | **KEEP UNCHANGED** | Applied migrations are never edited. A new migration drops the objects. |

No QUARANTINE disposition is used: section 12 explains why.

## 12. Migration strategy

| Strategy | For | Against |
|---|---|---|
| **A. Drop now** | Old and new term models never coexist; nothing obsolete is reachable; tests describe one model; no compatibility code | The demo and the upgrade tests must change in the same slice; one slice is larger |
| **B. Revoke writes, drop later** | Smaller first diff | Two term models live side by side; dead tables, grants, pins and upgrade tests must be maintained; "later" needs its own slice; readers must keep learning which model is real |
| **C. Repurpose** | Reuses table names | Nothing matches semantically. A version is not a live brief. A term row has no layer, subject or shape. An affirmation row is history, not state. Repurposing would keep misleading names and constraints |

**Recommendation: A, in S08.** There is no real data, and production has no principal.

- **The drop migration:**
  - removes the S03–S05 tables, constraints and trigger functions;
  - fails loudly if a database holds duplicate pairwise agreements, before adding the uniqueness key. No real data exists; a development database is fixed by `npm run demo:reset`.
- **Populated-upgrade tests:**
  - existing boundary cases stop at the boundary they test;
  - one new case upgrades a populated pre-S08 database (S01–S07 rows, including S03–S05 rows) to current and proves:
    - S01, S02, S06 and S07 rows are unchanged;
    - the S03–S05 objects are gone;
    - the catalogue equals a fresh database;
    - a rerun is a no-op.

## 13. Concurrency model

- **One lock per brief:** `pg_advisory_xact_lock` on a key derived from the brief id, the same technique as S03 and S04. Every live mutation data function takes it: add, edit, remove, share, tick, untick, decline, settle, freeze, sign, withdraw. Triggers that check brief-wide conditions take it too, so raw SQL serializes the same way.
- **The freeze** re-checks ready-to-sign while holding the lock, so a concurrent untick or decline either happens entirely before the freeze (which then fails) or waits and finds the phase `signing` (and is refused or aborts signing, per the S10 rule).
- **Isolation:** live and contract functions run as READ COMMITTED (S05's lesson). Triggers that need current visibility fail closed under snapshot isolation.
- **Uniqueness races:** one brief per project, and one product key per scope, use unique keys with `ON CONFLICT` reads, as in S06 and S07.

## 14. Runtime privilege model

| Table | Runtime grants | Why |
|---|---|---|
| `live_brief` | `SELECT, INSERT`; `UPDATE (phase)` from S09 | Mutable workspace; only the phase changes |
| `brief_item` | `SELECT, INSERT, DELETE`; `UPDATE (content, value, pending, position)` | Live state; identity, layer, scope, subject, shape and product key are never updatable; triggers police the rest |
| `brief_tick` (S09) | `SELECT, INSERT, DELETE` | A tick or untick is an insert or a delete; there is nothing to update |
| `pending_signature` (S11) | `SELECT, INSERT, DELETE` | Live state until the contract is final; discarded on withdrawal |
| `final_contract`, `final_contract_item`, `final_contract_signature` (S11) | `SELECT, INSERT` | Evidence: append-only, written once at finalization, no cascades |
| Everything else | unchanged | |

**Append-only is right for evidence, not for live state.** The earlier preference for append-only everywhere came from treating every row as evidence. Under HC1 that is wrong for the live brief.

## 15. Demo transition plan

| When | Demo shows |
|---|---|
| **S08** | Projects, parties, the pairwise agreement. The live brief **read-only**: items grouped by layer, money labelled private to its pair, subject, shape and pending state shown. Removed: version grids, tick grids, the S03–S05 simulator operations, and the R1/R2 seam cards. The open-seams view lists only the no-means-no wording, the signing act and vocabulary. |
| **S09** | One live brief → live green state → the ready-to-sign indicator. The simulator: start, add items in draft, share, tick and untick, decline a request, settle a decide-together item, set an open parameter. Every refused action is visible: adding after sharing, widening, removing a universal item. |
| **S10** | Ready to sign → signing (locked, fingerprinted) → back to live on withdrawal. |
| **S11** | The final contract with per-party records and evidence rows. The signing act stays a labelled simulation until D04 names it. |

From S08 on, retained versions and R1/R2 never appear as product concepts.

## 16. Risks and deliberately deferred work

**Risks**
- **Product-key layers for `coverage_level`, `physical_contact` and `stop_rule` are unset** until the D01 required-term draft. Mitigation: they are allowed in any compatible layer, and the S09 shareability check refuses a product-keyed item whose catalogue wording is missing. A real brief cannot be shared before the catalogue exists; the demo uses a synthetic catalogue.
- **The multi-party signing unit** (section 10). Mitigation: two-party scope until asked.
- **Deleting live rows** means a mistaken delete cannot be undone. That is accepted; it is what "a declined term is gone" means.

**Deferred, and not blocking S08–S10**
- no-means-no wording (D04, Cory);
- the visible signing act (D04, Cory; S11 UI only);
- vocabulary (D05, names only);
- the D01 required-term catalogue and the document trigger table (Dustin drafts, Cory checks);
- call-sheet generation (D08 slice after S11);
- presence beyond a per-party on-site fact;
- date-change and replacement restarts;
- mid-shoot stop, DNS and DNF facts;
- retention (counsel);
- an HTTP participant surface (after OAuth).

**Call sheet**
- **Source:** shared-layer project-wide logistics items (location, schedule, call times, entering as catalogue keys with the D01 draft), plus the roster and on-site facts.
- **Owner:** a D08 document slice after S11, rendering from the final contract (and optionally previewing from the live brief).
- **Buildable now:** the shared layer itself, in S08. Generation waits for the catalogue keys and D08.

## 17. Why this is the smallest faithful architecture

- **Three new tables** (`live_brief`, `brief_item`, `brief_tick`) replace eight. Three append-only contract tables are added only when finalization exists (S11).
- **One item table** carries all three layers; layer, scope and subject drive visibility and approval.
- **No history mechanism exists** to be misused: no revisions, no soft deletes, no event log, no audit rows, no timestamps in live state.
- **The database enforces the product rules with current state only:**
  - layer and requiredness by checks;
  - no widening by triggers and column-limited grants;
  - no removal of safety items by a trigger.
- **The existing techniques survive:** composite containment, database time, faithful copy, advisory-lock serialization, READ COMMITTED fail-closed, least privilege.
- **Nothing waits on a name.** Wording and gesture questions sit at the catalogue and UI boundaries.

## 18. Adversarial questions

1. **Are we rebuilding version history under another name?** No. Live rows are updated in place or deleted. There is no revision number, snapshot, soft-delete flag or event table. Freezing locks the current rows and fingerprints them; it copies nothing. The only copy is the final contract, written once when everyone has signed.

2. **Are we treating three layers as three tables?** No. One table with a `layer` column, justified in section 4. Separate tables would triple the tick, no-widening and freeze machinery.

3. **Are we creating generic private terms?** No. Money is the only private layer, and it admits only product-defined money keys (`fee` today). There is no free-text private item.

4. **Are declined terms retained anywhere?** No. A decline deletes the request, and its ticks cascade. No negative row exists, and no column records a removal. Only PostgreSQL's WAL, MVCC and backups hold transient copies, which are infrastructure, not product records.

5. **Are ticks treated as evidence?** No. `brief_tick` has no time, is deletable, and is discarded after finalization. Evidence is the signature row on the final contract.

6. **Does live state need UPDATE and DELETE, and are we resisting that out of habit?** Yes, it needs them, and the design grants them: `UPDATE` on four item columns, and `DELETE` on items and ticks. The append-only habit came from treating rows as evidence.

7. **Is append-only appropriate for live state?** No, only for the final contract and its signatures.

8. **Can the database prevent widening without prior versions?** Yes. After sharing:
   - `INSERT` on `brief_item` is refused;
   - updates are allowed only from pending to settled;
   - settled content and value are immutable;
   - layer, scope, subject, shape and key are not updatable at all, by grant.

   None of this needs the old value beyond the row's own `OLD` in a trigger.

9. **Can universal safety be protected without copies?** Yes. A `BEFORE DELETE` trigger refuses universal and product-keyed items, and live items are only bulk-deleted by the finalize function, after the contract holds them.

10. **One subject, several, or none?** Zero or one, from Cory's examples (section 6). Dual roles are separate items.

11. **Are craft, usage and deliverable terms placed correctly?** Yes, in the shared layer, visible to all, pair-scoped only for who green-lights them. The money layer cannot hold them.

12. **Does the `pairwise_agreement` treatment reconcile one-per-pair with restarts?** Yes. The agreement is unique per pair per project, and a restart creates a new contract instance under it. Only the same-project-or-new-project question is deferred, to the date-change slice.

13. **Does the schema expose negotiation behaviour?** No. There are no timestamps, ordering, authorship or bulk flags in live state, and ticks show only current green.

14. **Can S04 and S05 simply be removed before real use?** Yes. That is the recommendation (section 12).

15. **Is anything blocked only because its name is open?** No. "Presented version", "response" and "archived" are labels only. Internal code names (`live_brief`, `brief_item`, `brief_tick`, `final_contract`) are not product vocabulary. The no-means-no wording blocks real sharing, not structure. The signing act blocks only S11's UI.

---

## 19. Implementation slice stack

### S08 — Live brief topology, and retirement of S03–S05

PRD: [`docs/slices/S08-live-brief-topology.md`](../slices/S08-live-brief-topology.md).

- **Purpose:** the new term topology, one agreement per pair, no obsolete model reachable.
- **Decisions relied on:** D02 (one per pair; three layers), D04 (product-owned requiredness; the four named items; subject control; decide-together), D10 (money the only private thing), HC1 and HC2.
- **Touches:**
  - the drop and create migrations;
  - `src/briefs/`;
  - deleting `terms.ts`, `versions.ts` and `affirmations.ts`;
  - the S02 uniqueness key;
  - pins and upgrade tests;
  - stripping the demo to read-only brief items.
- **Usable:** composing a draft brief in data functions; layer visibility.
- **Still impossible:** sharing, ticks, declines, finality, contracts, any HTTP.
- **Tests:**
  - every check constraint and containment key;
  - the pair-subject trigger;
  - the no-delete trigger;
  - the visibility function;
  - one brief per project under concurrency;
  - one agreement per pair;
  - the duplicate-pair migration precheck;
  - the populated pre-S08 → current upgrade;
  - privilege pins.
- **Migration:** drops S03–S05 objects; adds `live_brief` and `brief_item`.
- **Demo:** version and tick grids removed; read-only brief.
- **Open Cory item:** none.

### S09 — Sharing and live resolution

- **Purpose:** draft → live, the no-widening rules, decline, settling, presence, ticks, green and ready-to-sign.
- **Decisions relied on:** Q3, Q4, Q7, Q8, Q10, Q11, Q15 (direct send is per-term; posted-work wholesale acceptance is a later route), Q16, A3, D12.
- **Touches:**
  - `live_brief.phase`;
  - a per-party on-site fact;
  - `brief_tick`;
  - triggers for LB-8, LB-9 and LB-12;
  - the shareability check;
  - group-check;
  - the ready-to-sign predicate;
  - the demo simulator.
- **Usable:** the whole live cycle in data functions and the demo.
- **Still impossible:** freezing, signing, contracts, real participants (no HTTP).
- **Tests:** each allowed and refused mutation per phase; actor rules (only the subject declines or sets; only approvers tick); deliberate items refused by group-check; ready-to-sign under concurrency; no time columns; untick leaves nothing.
- **Open Cory item:** none structurally. Real sharing of a brief containing `no_means_no` waits for its wording; the demo uses synthetic wording.

### S10 — Freeze (ready to sign)

- **Purpose:** the ready-to-sign → `signing` transition under the brief lock; the canonical serialization and fingerprint of what will be signed; the item lock while signing; and the return to `live` on any withdrawal.
- **Decisions relied on:** D02 finality (no organizer step), Q11, Q12, HC1.
- **Touches:** `live_brief` phase and fingerprint; the canonical serializer (product wording rendered from the code catalogue); the freeze and abandon functions; the demo's ready-to-sign → signing view.
- **Usable:** a locked, fingerprinted brief per two-party project.
- **Still impossible:** signatures, a final contract.
- **Open Cory item:** none for two parties. The three-party signing unit is deferred (section 10).

### S11 — Signatures and the final contract

- **Purpose:** pending signatures (live state); finalization when the last approver signs, writing the append-only `final_contract` with items, fingerprint and per-party signature evidence (bound account as credential, database time); deletion of the live state; the per-person record view.
- **Decisions relied on:** Q12, Q17, HC1, D10, D12.
- **Usable:** a final contract as evidence.
- **Still impossible:**
  - the visible signing act, which is D04-open; the storage is built, and the UI stays a labelled simulation;
  - IP and device evidence until an HTTP surface exists;
  - restarts.
- **Open Cory item:** the signing act, for the UI only.

**After the stack, not part of it:**
- the D01 catalogue (wording and keys, including location and call times);
- the call-sheet document (D08);
- the HTTP participant surface (OAuth, sessions);
- date-change and replacement restarts;
- mid-shoot stop, DNS and DNF;
- posted-work wholesale acceptance.
