# Live brief rebuild — replacing S03–S05

Status: PROPOSED ARCHITECTURE, 2026-10-15, revised the same day after Dustin's seam review. Awaiting Dustin's review. No code, schema, migration, test or demo behaviour changed to produce it.

Base: `main` at `ef08117` (S01–S07).

Authority:
- Cory's rulings in [`decisions/2026-10-09-15-cory-reconciliation.md`](../../decisions/2026-10-09-15-cory-reconciliation.md), as corrected by HC1 (no version history) and HC2 (no proposer identity);
- D02 and D10, both DECIDED for photo shoots;
- D04, OPEN only on the no-means-no wording and the visible signing act;
- D05, D08 and D12.

First slice: [`docs/slices/S08-live-brief-topology.md`](../slices/S08-live-brief-topology.md).

**Revision note.** The first version of this plan over-resolved Cory's semantics in four places. This revision corrects them:
1. It equated "product key" with "required".
2. It rendered product wording from running code at freeze time.
3. It made the universal layer subjectless and product-authored.
4. It resolved the date-change restart by redefining "agreement".

It also removes live-phase rules from S08 and scopes S10/S11 to the D01 two-party case.

---

## 1. Product model in plain language

A photo shoot is a **project**. Before anyone signs there is **one live brief** for it, holding everything the shoot needs in three visibility layers.

**The three layers**
- **Universal safety:** seen and affirmed by everyone physically on site. Safety material cannot disappear from the live agreement.
- **Shared material:** logistics, schedule, call times, location, craft terms, deliverables and usage, visible to everyone in the collaboration. The call sheet is eventually produced from the logistics part.
- **Private money:** the fee. It is visible only to the two people it is between. This is the only private thing.

**Terms about a person.** The subject of a term controls it, in any layer:
- a **declaration** ("don't touch my hair") cannot be overridden; the others proceed under it or walk away;
- a **request** about someone can be declined by them, and then it disappears;
- an **open parameter** ("you set this one") is filled in by the person it concerns.

**No accidental blanks.** Every field in a shared brief is either supplied or explicitly decide-together.

**How the brief cycles.** People tick items and the brief fills in green. Declined requests vanish; decide-together items and open parameters get settled. Once the brief has been shared, nothing is added or widened.

**Signing.** When everything is green for everyone who must green-light it, the brief is ready to sign. Signing produces the final contract, and only that is evidence. Each person's record is everything jointly agreed plus their own payment, and nobody else's.

**What is never kept:** version history, change history, any record of a "no", and any record of who proposed what.

**Requiredness** belongs to the product: material protecting physical or emotional safety, which can include compensation and deliverables. A drafter can never promote a preference into a required term. *Which* items are required in a given brief is a product policy still to be written: the D01 required-term catalogue, which Dustin drafts and Cory reviews. This architecture leaves room for it and does not define it.

## 2. Current versus target

```
CURRENT (S03–S05, obsolete)                       TARGET

project ── pairwise_agreement (duplicates ok)    project ── pairwise_agreement (internal pair-scope record,
   │             │                                  │              one per pair per project)
universal_term  agreement_term (append-only)        │
   │             │                                  └── live_brief (one per project; mutable workspace)
*_version (sealed, numbered, kept forever)                 │
   │             │                                         └── brief_item (layer · pair scope · subject · shape
*_version_term (frozen copies)                             │               · item key · exact current wording/value
   │             │                                         │               · pending state · position)
*_affirmation (append-only, timestamped,                   │
              per version)                                 └── brief_tick (S09; current green state; no time)
                                                                    │
                                                    ready-to-sign = derived predicate (S09/S10)
                                                    freeze = lock + fingerprint of current rows (S10)
                                                    final contract = one append-only copy (S11; two-party only)
```

## 3. Invariants

| ID | Invariant | Where |
|---|---|---|
| LB-1 | A project has at most one live brief. | S08 unique key |
| LB-2 | An item's brief, pair scope and subject all belong to its project; a pair-scoped subject is one of the pair. | S08 composite FKs and a trigger |
| LB-3 | Money is pair-scoped. The money layer holds only the fee, and a fee is only money: "money is not a category, it is one field: the fee" (Q6). One fee per pair. | S08 checks and a partial unique key |
| LB-4 | Universal safety applies to everyone on site with the same terms (Q14), so a universal item is project-wide, never pair-scoped. It may have a subject (Q7). | S08 check |
| LB-5 | No-means-no is a universal safety term every person affirms (Q13). | S08 check |
| LB-6 | Subject and shape go together. The settled, decide-together and awaiting-subject states are exclusive. | S08 checks |
| LB-7 | A drafter-written item always carries its wording. A keyed item may sit in a draft without materialized wording. | S08 check |
| LB-8 | **Exact wording is current document state.** No item can be shared, ticked or frozen without its exact wording stored in the row. After sharing, wording is immutable and a value can only move once from pending to settled, so a tick (only accepted on a settled item) always refers to the text the person saw. | S09 share check and triggers; S10 freeze copies stored text |
| LB-9 | After sharing, nothing is added or widened. Only pending → settled transitions, request removal by its subject, ticks and unticks happen. | S09 triggers and column grants |
| LB-10 | After sharing, safety material cannot be removed. The removal rule for other items follows the product's requiredness policy once it exists. | S09 trigger |
| LB-11 | A decline leaves no trace: the item row is deleted and its ticks cascade. | S09 |
| LB-12 | Ticks are current state only: no time, no order, no author beyond the ticking party. An untick deletes the row. | S09 |
| LB-13 | Ready to sign is derived, never stored, and re-checked under the brief lock at freeze. | S09/S10 |
| LB-14 | Until everyone has signed, nothing is evidence; a withdrawal discards the pending signatures. Only a fully signed contract is written to append-only tables. | S10/S11 |
| LB-15 | One `pairwise_agreement` row per pair per project. | S08 unique key |
| LB-16 | S10/S11 finalize only a project with exactly two parties and exactly one pair. Anything else is refused, fail-closed, until Cory answers the multi-party signing unit. | S10/S11 |

## 4. Proposed data model

All names are internal code names; D05 public vocabulary is unaffected.

**`pairwise_agreement` — an internal pair-scope record.**
- It identifies two parties of a project, so pair-scoped items such as the fee and pair-specific shared terms have something to attach to.
- Its historical name is **not** evidence that it is Cory's "agreement" or a final contract.
- S08 adds `UNIQUE (project_id, party_one_id, party_two_id)`: Cory ruled one agreement per pair per project, and nothing in S08–S11 needs a second pair-scope row.
- What happens after an already-final contract is ended by a date change or a variable-supplier replacement is **deferred** (section 10). Nothing in S08–S11 reopens or reseeds anything.

**`live_brief`** — the mutable workspace, one per project.
- S08 columns: `id`, `project_id`.
- S09 adds the phase (`draft` → `live` → `signing`).
- There are no timestamps.

**`brief_item`** — one term or field. Each column carries one concept.

| Column | Concept | Notes |
|---|---|---|
| `layer` | Visibility and affirmation layer | `universal`, `shared` or `money` |
| `pairwise_agreement_id` | Optional pair scope | Required for money; never for universal |
| `subject_party_id` | Optional subject: the person the term is about, who controls it | Any layer |
| `shape` | How the subject controls it | `declaration`, `request` or `open_parameter`; present exactly when a subject is |
| `item_key` | Semantic identity of a product-known item, nothing more | Null for an ordinary drafter item. S08 values: `fee`, `no_means_no`, `coverage_level`, `physical_contact`, `stop_rule` |
| `content` | The exact wording currently in the brief | For a keyed item a product catalogue may *supply* it, but it is always stored here before anyone acts on it |
| `value` | The supplied value of a field | Amount, level or address |
| `pending` | Unsettled state | Null when settled; `decide_together`; or `subject` (open parameter awaiting its subject) |
| `position` | Stable display order | Display only |

**What `item_key` does not mean**
- **Requiredness:** a product policy that may depend on the key and context, defined later, never stored as a drafter-settable flag.
- **Wording ownership:** wording is always the stored `content`.
- **Removability:** S09 decides it by phase, layer and policy.
- **Deliberate-tick behaviour:** a fixed set in code — `fee`, `coverage_level`, `physical_contact`, `stop_rule` — that S09's group-check refuses. It is not a column.

**`brief_tick` (S09)**
- `(brief_item_id, party_id)`, with that pair as primary key;
- no time and no bulk flag;
- an untick deletes the row;
- rows cascade when their item is deleted.

**Freeze (S10)** locks the brief and stores a fingerprint of the current rows' stored wording and values. It copies nothing.

**`final_contract`, `final_contract_item` and `final_contract_signature` (S11)** are written once, when the last party signs:
- the items' stored `content` and `value`, copied verbatim;
- the fingerprint;
- each party's signature: party, bound account (S06), database time;
- append-only, no cascades;
- two-party projects only (LB-16).

## 5. Visibility model

| Material | Who sees it |
|---|---|
| Universal and shared items, including pair-scoped shared items such as deliverables | Every party of the project |
| Money items | The two parties of their pair |
| Ticks (S09) | Anyone who can see the item |
| Times, action order, who removed what, revisions, use of group-check | Nobody: none of it is stored |

A person's final record is the same filter applied to the final contract. One canonical contract with per-party views satisfies D10.

## 6. Subject and shape

| Cory's example | Representable as |
|---|---|
| "Don't touch my hair" | Subject: her; shape: declaration. **Layer not fixed by this architecture:** the topology allows it in universal (affirmed by everyone on site) or in shared. The product's rule for where personal safety declarations go comes with the catalogue. |
| A request about another person | Subject: that person; shape: request; any layer. |
| "Here's the theme, what's your level?" | Subject: the person; shape: open parameter, with `pending = 'subject'` until they set the value. |
| The fee | Money layer, pair-scoped, `item_key = 'fee'`. Subject and shape not decided, so not constrained. |
| No-means-no acknowledgment | Universal, `item_key = 'no_means_no'`; wording open (Cory). |
| Logistics: location, schedule, call times | Shared, project-wide; keys arrive with the catalogue. |

**Subject count:** zero or one. Cory's examples never need several. Dual roles are "additional terms inside it" (Q5), meaning separate items.

## 7. Live tick (green) model — S09

Ticks are mutable current state, not evidence.

- **Tick and untick:** a tick is an insert; an untick is a delete.
- **Decline:** deletes the request item, and its ticks cascade.
- **Approvers**, derived rather than stored:
  - universal items → every party who will be on site (a per-party roster fact added in S09);
  - shared project-wide items → every party of the project;
  - pair-scoped items → the pair.
- **Green item:** every approver has ticked it.
- **Wording cannot drift under a tick:**
  1. sharing requires every item to have stored `content`;
  2. after sharing, `content` cannot change, and `value` can only go once from pending to settled;
  3. a tick is accepted only on a settled item;
  4. the catalogue is consulted only to *fill* `content` while composing.

  So a tick always refers to the exact text in the row, and a deployment that changes catalogue wording cannot change an existing brief.
- **Group-check:** inserts individual ticks and refuses the four deliberate-tick keys. Nothing records that it was used.

## 8. Finality seam — S09/S10

**Ready to sign** (derived), all of:
- the brief is `live`;
- nothing is pending;
- every item is green;
- there is no organizer confirmation (D02).

**Freeze (S10)** runs under the brief lock:
1. re-check ready to sign;
2. refuse unless the project has exactly two parties and one pair (LB-16);
3. compute a fingerprint over the stored `content` and `value` of the current items, in canonical order;
4. set the phase to `signing`, which locks every item and every new tick.

**Withdrawal while signing:** any untick or withdrawal returns the brief to `live` and deletes pending signatures. Nothing about the attempt is kept.

**Signing (S11)** records a pending signature per party, bound to the fingerprint. When the second party signs, the same transaction:
- writes the append-only final contract by copying stored wording and values verbatim;
- deletes the live items, ticks and pending signatures.

**The visible signing act** is D04-open. It sits at the UI and HTTP boundary.

## 9. Final-contract seam — S11, two-party only

The contract contains:
- the exact stored wording and values of every item;
- their layer, scope and subject;
- the fingerprint;
- the two signatures (party, bound account, database time).

IP and device evidence arrives with an HTTP surface. The legal meaning of the fingerprint, the signature UX and retention (counsel) are not chosen here.

## 10. Deferred seams — not resolved here

1. **What follows an ended contract.** Cory: a changed date "ends the agreement and a new one begins"; a variable-supplier replacement starts again from scratch. Whether the new agreement is a new project, a new internal agreement object or another arrangement is **deferred**. S08–S11:
   - do not reopen a brief;
   - do not seed one from an ended contract;
   - do not end contracts.

   The `pairwise_agreement` uniqueness key is compatible with every option, because none needs two live pair-scope rows in one project at once. If the answer requires otherwise, the key changes then.
2. **The signing unit with three or more parties.** The rulings read both ways:
   - one all-green moment for the whole brief (Q3, Q12);
   - each pair independent (2026-10-05).

   S08 and S09 support any number of parties, because topology, visibility and green state are decided. S10 and S11 refuse anything but one pair of two parties (LB-16). Cory is asked with the first three-party slice.
3. **The requiredness policy and catalogue:**
   - which items are required in a given brief;
   - which keys carry values;
   - which layer `coverage_level`, `physical_contact`, `stop_rule` and personal safety declarations belong in;
   - deposit terms;
   - logistics keys.

   All of this comes from the D01 required-term draft (Dustin drafts, Cory reviews; already queued).

## 11. Disposition of S03–S05

| Object | Disposition | Why |
|---|---|---|
| `universal_term`, `agreement_term` | **DROP BEFORE REAL USE (S08)** | Append-only source rows fed retained versions (HC1). `agreement_term` also encodes the superseded private craft layer. `brief_item` replaces both. |
| `universal_version`, `agreement_version` | **DROP (S08)** | They number retained presentations, which do not exist in the product. |
| `universal_version_term`, `agreement_version_term` | **DROP (S08)** | Per-version frozen copies. The faithful-copy technique reappears once, at finalization (S11). |
| `universal_affirmation`, `agreement_affirmation` | **DROP (S08)** | Append-only, timestamped tick history. Replaced by `brief_tick` (S09) and signatures (S11). |
| Their trigger functions (`*_version_stamp`, `*_version_check_sealed`, `*_version_term_check_copy`, `*_affirmation_stamp`) | **DROP (S08)** | Tied to the dropped tables. The patterns are kept: pinned `search_path`, no `PUBLIC` execute, database time, fail-closed visibility. |
| The read-committed-only guard (0013) | **DROP with them** | The lesson is kept: live and contract functions run as READ COMMITTED. |
| Uniques that only served them: `agreement_term (pairwise_agreement_id, id)`, `universal_term (project_id, id)`, `pairwise_agreement_id_parties_unique` | **DROP (S08)** | They have no remaining referent. Pair-subject membership becomes a trigger. |
| `project_party_project_id_id_unique` | **KEEP UNCHANGED** | Used by S02, S06, S07 and `brief_item`. |
| `pairwise_agreement` | **KEEP, REINTERPRET AS AN INTERNAL PAIR-SCOPE RECORD; add uniqueness (S08)** | Section 4. |
| `src/projects/terms.ts`, `versions.ts`, `affirmations.ts` and their tests | **DROP (S08)** | Git keeps the history. The trigger-function hygiene pin is relocated. |
| Demo S03–S05 simulator operations and version and tick grids | **REPLACE (S08 strips; S09 rebuilds)** | Section 15. |
| Migrations 0007–0014 | **KEEP UNCHANGED** | Applied migrations are never edited. |

## 12. Migration strategy

| Strategy | For | Against |
|---|---|---|
| **A. Drop now** | One term model; nothing obsolete reachable; tests describe one model | The demo and the upgrade tests change in the same slice |
| **B. Revoke writes, drop later** | Smaller first diff | Two models side by side, dead pins and grants, and a later cleanup slice |
| **C. Repurpose** | Reuses names | Nothing matches: a version is not a live brief, and an affirmation row is history, not state |

**Recommendation: A, in S08.** There is no real data, and production has no principal.

The migration fails loudly on duplicate pairs before adding the uniqueness key; it never deletes rows.

## 13. Concurrency

- **One lock per brief:** a `pg_advisory_xact_lock` on a key derived from the brief id, taken by every brief mutation and by brief-wide triggers.
- **Freeze** re-checks under that lock.
- **Isolation:** READ COMMITTED; snapshot-isolated callers fail closed.
- **Uniqueness:** one brief per project and one fee per pair, each by unique key plus `ON CONFLICT` read.

## 14. Runtime privileges

| Table | Grants |
|---|---|
| `live_brief` | `SELECT, INSERT`; from S09, `UPDATE (phase, fingerprint)` |
| `brief_item` | `SELECT, INSERT, DELETE`; `UPDATE (content, value, pending, position)` only |
| `brief_tick` (S09), `pending_signature` (S11) | `SELECT, INSERT, DELETE` |
| `final_contract*` (S11) | `SELECT, INSERT` |

Append-only belongs to evidence, not to live state.

## 15. Demo transition

| Slice | Demo |
|---|---|
| **S08** | The live brief read-only, as developer instrumentation:<br>• items grouped by layer;<br>• money labelled private to its pair;<br>• subject, shape and pending state shown;<br>• a keyed item without materialized wording shown as an unmaterialized draft item, never as participant text.<br>Version and tick grids, S03–S05 simulator operations and R1/R2 are removed. |
| **S09** | Draft → share → live green → ready to sign. The simulator covers ticks, declines, settling and the refused post-share actions. |
| **S10** | Ready to sign → signing (locked, fingerprinted) → back to live on withdrawal. A multi-party fixture shows the refusal. |
| **S11** | The final contract with per-party records. The signing act stays a labelled simulation. |

## 16. Risks and deferred work

- **Requiredness policy and catalogue are unwritten.** Until then, S09 can enforce only what is decided: safety material cannot be removed after sharing, there are no accidental blanks, and nothing widens. Required-item completeness is checked once the catalogue exists.
- **Mistaken deletes of live rows cannot be undone.** That is accepted: "a declined term is gone".
- **Deferred:**
  - no-means-no wording (Cory);
  - the signing act (Cory; S11 UI only);
  - vocabulary (names only);
  - the catalogue;
  - the call sheet (D08 slice after S11; its source is project-wide shared logistics items plus the roster);
  - HTTP and participants;
  - restarts (section 10);
  - the multi-party signing unit;
  - mid-shoot stop, DNS and DNF;
  - posted-work acceptance;
  - retention (counsel).

## 17. Why this is the smallest faithful architecture

- **Three live tables** replace eight. The contract tables arrive only with finalization.
- **One item table:** layers decide visibility and approvers, not what an item is.
- **No history mechanism** exists to misuse.
- **The database enforces only decided rules,** using current state:
  - layer topology, fee and no-means-no placement, and containment in S08;
  - post-share rigidity, wording immutability and safety-material protection in S09.
- **Each column means one thing.** In particular, `item_key` is identity only.

## 18. Adversarial questions

1. **Rebuilding version history?** No. Live rows are updated or deleted, with no revisions, snapshots, soft deletes or event logs. The freeze fingerprints and copies nothing; the only copy is the final contract.
2. **Three layers as three tables?** No. One `layer` column.
3. **Generic private terms?** No. The money layer holds only the fee.
4. **Declined terms retained?** No. The row is deleted and its ticks cascade.
5. **Ticks as evidence?** No. No time, deletable, discarded at finalization.
6. **Avoiding UPDATE and DELETE out of habit?** No. Live state is granted them.
7. **Append-only for live state?** No, only for the final contract.
8. **Preventing widening without prior versions?** Yes, in S09. After sharing, no inserts; settled content and value are immutable; identity columns are not updatable by grant.
9. **Protecting universal safety without copies?** Yes, in S09. A delete trigger refuses universal items once the brief is shared.
10. **One subject, several, or none?** Zero or one.
11. **Craft, usage and deliverables placed correctly?** Yes: shared, visible to all, optionally pair-scoped for who approves them.
12. **Does `pairwise_agreement` reconcile one-per-pair with restarts?** The uniqueness key implements one per pair per project. The restart is **not** resolved (section 10); the row is an internal pair-scope record, not a claim about Cory's "agreement".
13. **Does the schema expose negotiation behaviour?** No: no timestamps, ordering, authorship or bulk flags.
14. **Can S04 and S05 be removed before real use?** Yes (section 12).
15. **Is anything blocked only by a name?** No.

**Added after the seam review**

16. **Are we conflating the product key with requiredness?** No. `item_key` is semantic identity only. Requiredness is a product policy that is not defined yet and never a drafter-settable column. Deliberate-tick membership is a separate code-side set. Removability follows phase, layer and policy.
17. **Can product wording change underneath a green tick?** No. Wording is stored in `content` before anyone can act, and is immutable after sharing. Ticks require settled items; freeze and finalization copy the stored text, never code. The catalogue only fills `content` while composing.
18. **Can a subject-controlled safety declaration exist in the universal layer?** Yes. Universal items may have a subject and shape. Only "project-wide" is required of universal items, because universal terms are the same for everyone on site. Product ownership is not required.
19. **Are we resolving the date-change restart through terminology?** No. `pairwise_agreement` is described as an internal pair-scope record, and what follows an ended contract is explicitly deferred. Nothing reopens, reseeds or ends a contract in S08–S11.
20. **Are we enforcing post-share rigidity during the draft phase?** No. S08 has no phase and lets the draft add, edit and remove any item. Every post-share rule is S09.
21. **Does the S10/S11 design assume a multi-party signing unit?** No. They are scoped to one pair of two parties and refuse anything else.

---

## 19. Slice stack

| Slice | Purpose | Blocked by a Cory-open item? |
|---|---|---|
| **S08 — Draft live-brief topology; retire S03–S05** | Workspace, item topology, containment, layers, subject and shape, pending states, exact current wording and value, fee and money topology, one pair-scope row per pair, draft composition, D10 visibility filter. Drop S03–S05. No phase, rigidity, ticks, requiredness, freeze or contract. | **No.** |
| **S09 — Share and live resolution** | Phase `draft` → `live`; share-time checks (no accidental blanks; every item's exact wording stored); post-share rigidity (no inserts, settled content immutable, safety material not removable); declines; settling; open parameters by their subject; on-site roster fact; ticks; group-check excluding the four deliberate keys; ready-to-sign predicate. | **No** structurally. Real use of a brief containing `no_means_no` waits for its wording (Cory). Required-item completeness waits for the catalogue (Dustin drafts, Cory reviews); S09 does not invent it. |
| **S10 — Freeze (two-party)** | Ready to sign → `signing` under the lock; fingerprint of stored wording and values; lock while signing; back to live on withdrawal; refuses anything but one pair of two parties. | **No.** |
| **S11 — Signatures and final contract (two-party)** | Pending signatures; on the second signature, the append-only contract with verbatim wording, fingerprint and signature evidence; live state removed; per-person record view. | **Storage: no. A real signing UI: yes** (D04 visible signing act). |

Not part of the stack:
- the D01 catalogue;
- the call sheet (D08);
- the HTTP participant surface (OAuth and sessions);
- restarts and their seam;
- the multi-party signing unit;
- mid-shoot stop, DNS and DNF;
- posted-work acceptance.
