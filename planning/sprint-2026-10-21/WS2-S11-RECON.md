> Supporting reconnaissance for [EXECUTION-PACKAGE.md](EXECUTION-PACKAGE.md). Read-only findings and recommendations ([F]); not a product decision. Neither reading of affirmation evidence is promoted. **§3.2 of the package narrows §D below** (no pending signatures, no `brief_signature`, no archive reference; one finalization call with both signatures); where they differ the package governs.

# WS2 — S11 signing and final-record design (reconnaissance)

Read-only reconnaissance against `main` at `57f0b63`. Nothing here is a product decision. Every claim cites `path:line` in this repository; `DOCTRINE:n` / `VISION:n` are the prototype-repository line numbers as the planning documents cite them (README.md:60-62) and are only ever cited here through a repository file that quotes them. Provenance tags are the README's (README.md:52-58); none is upgraded. **Both readings of "affirmation evidence" are kept open throughout (S10-SIGNING-FREEZE.md:123); neither is promoted.**

Section map: **A** settled requirements · **B** technical alternatives (Dustin's) · **C** genuine Cory questions · **D** smallest implementable S11 slice, with ordered test cases.

---

## A. Settled requirements

| # | Requirement | Exact source | Tag | What it constrains in S11 |
|---|---|---|---|---|
| A1 | Ticking a term and signing are two different acts; everyone ticks until every term is green for every person; only then does anyone sign | `decisions/D04-terms-and-affirmation.md:71-74`; `decisions/2026-10-09-15-cory-reconciliation.md:113` | Cory ruling (Q12) | The signing function refuses a brief that is not in S10's `signing` phase (which already requires all-green: `migrations/0024_signing_guards_and_grants.sql:128-156`). Ticks (`brief_tick`) are never read as a signature. |
| A2 | Nobody signs a document that can still change | `decisions/D04-terms-and-affirmation.md:74`; `decisions/D02-agreement-topology-lifecycle.md:96` | Cory ruling (Q12) | A signature binds the S10 fingerprint; any mismatch is refused. Items, ticks, presence, roster and pairs stay frozen while signing (`docs/engineering/S10-SIGNING-FREEZE.md:65-76`). |
| A3 | No organizer confirmation step: all green, then everyone signs; that is the final act | `decisions/D02-agreement-topology-lifecycle.md:95`; `decisions/2026-10-09-15-cory-reconciliation.md:172` | Cory ruling (A5a) | The second (last) signature finalizes in the same transaction. No "confirm" function, no creator privilege. |
| A4 | The signing event produces the final contract, which is **the** evidentiary document; the only thing that exists afterwards | `decisions/2026-10-09-15-cory-reconciliation.md:18,30`; `decisions/D02-agreement-topology-lifecycle.md:89,96`; `decisions/D09-preservation-and-evidence-access.md:44` | Cory correction HC1 | After finalization the live brief's items and ticks are not evidence and need not exist; the contract is append-only. |
| A5 | Evidence attaches to the final contract: its fingerprint, each person's affirmation and signature evidence, time, credential, device and IP, with chained timestamps, kept as long as the document | `decisions/D04-terms-and-affirmation.md:83`; `decisions/2026-10-09-15-cory-reconciliation.md:31,131` | Cory ruling (Q17 as corrected by HC1) | Signature record fields (B3). "Affirmation evidence" is the unresolved reading (B2). "No signing UX or chain structure is designed here" (`D04:83`) — chain structure is technical (B3). |
| A6 | No version history; intermediate states of the live brief are not retained | `decisions/2026-10-09-15-cory-reconciliation.md:16-33`; `decisions/D02-agreement-topology-lifecycle.md:89`; `decisions/D10-what-each-party-sees.md:69` | Cory correction HC1 | The contract copies the final state only. No history of freezes, withdrawals or earlier pending signatures (see A9). |
| A7 | A "no" is not recorded; if a term is absent from the final contract it is not agreed | `decisions/D02-agreement-topology-lifecycle.md:88`; `decisions/D10-what-each-party-sees.md:68`; `decisions/2026-10-09-15-cory-reconciliation.md:105` | Cory ruling (Q10) | Contract items carry no position gaps or decline marks (S10 already excludes raw positions from the fingerprint for this reason: `docs/engineering/S10-SIGNING-FREEZE.md:54`). |
| A8 | Authorship is not recorded, visibly or invisibly | `decisions/D02-agreement-topology-lifecycle.md:87`; `decisions/2026-10-09-15-cory-reconciliation.md:41-47` | Cory ruling (Q9, HC2) | No proposer/author column on the contract or its items. (A signature records the signer; that is the signing act, not authorship of a term.) |
| A9 | Withdrawal before finality is allowed; the agreement can only shrink | `decisions/D02-agreement-topology-lifecycle.md:100-101`; `decisions/2026-10-09-15-cory-reconciliation.md:107-111` | Cory ruling (Q11, A5a) | A party may withdraw after signing but before the other signs; S10 already makes an untick while `signing` the withdrawal (`src/briefs/live.ts:261-265`). A pending signature is discarded with it (LB-14, `docs/engineering/LIVE-BRIEF-REBUILD.md:87`, which is an engineering invariant [F] consistent with HC1). |
| A10 | After signing: cancellation is DNF (no new category), no rewriting or amendment, a changed date ends the agreement and everyone signs a new one | `decisions/D02-agreement-topology-lifecycle.md:103,106,108` | Cory ruling (A5a) | S11 builds no amendment, cancellation, DNF, date-change or restart path (what follows an ended contract is deferred: `docs/engineering/LIVE-BRIEF-REBUILD.md:219-224`). A final contract is terminal. |
| A11 | Consent withdrawn mid-shoot is recorded as a factual event ("stopped early, called by X"), never as failure; distinct from DNF | `decisions/D02-agreement-topology-lifecycle.md:102` | Cory ruling (Q11) | **Not S11 scope.** It is an event after the contract exists, with no downstream consequence decided (`D02:102`). Listed as deferred in `docs/engineering/LIVE-BRIEF-REBUILD.md:308`. The contract design must not foreclose it (no "status" column that would have to change — see B1). |
| A12 | Each party's signature is bound to the specific clauses it affirms, co-located with them, not a blanket signature divorced from the terms | `decisions/D04-terms-and-affirmation.md:23` (DOCTRINE:51); `planning/B-product-invariants.md:108-114` (I10) | [R] | The signature must be verifiably bound to the exact clauses (fingerprint covers every item's content, value and approvers: `src/briefs/live.ts:463-485`), and the rendered record must show the binding beside the clauses. How the binding is stored vs shown is B2; what it visibly looks like per clause is C(ii). |
| A13 | Clause text is frozen as presented, verbatim, not a reference to a mutable template; agreed parameters as values | `decisions/D04-terms-and-affirmation.md:22` (DOCTRINE:46); `planning/B-product-invariants.md:19` (DOCTRINE:46-47) | [R] | The contract copies stored `content` and `value` verbatim from `brief_item` rows (which S09 already made immutable once shared: `docs/engineering/S09-LIVE-RESOLUTION.md:39`). Never re-rendered from a catalogue. |
| A14 | The record captures the identity or credential used to agree; timestamps per signature | `decisions/D03-participation-credential.md:21` (DOCTRINE:52); `planning/B-product-invariants.md:110` | [R] | Each signature row stores the account id (S06 binding, `src/accounts/tables.ts:60-84`) and database time. Login is not identity (`D03:20`, VISION:317); the record says "credential", nothing more. |
| A15 | A portable artifact delivered to every party, held independently | `planning/B-product-invariants.md:134-141` (DOCTRINE:53); `decisions/D10-what-each-party-sees.md:28` | [R] (delivery); [R-prov] (continued in-product retrievability, DOCTRINE:57: `B-product-invariants.md:141`) | Each party must be able to obtain a self-contained rendering of their record. The singular "PDF" is not a topology decision (`D02:18`; `B-product-invariants.md:136`). B5. |
| A16 | Final record contents per party: everything jointly agreed plus the person's own payment terms, nobody else's numbers; one record with per-party views vs separate artifacts is a technical choice that must deliver exactly that | `decisions/D10-what-each-party-sees.md:70`; `decisions/2026-10-09-15-cory-reconciliation.md:160` | Cory ruling (A2) | The per-party read of the contract filters money items to the party's own pair (same rule S09 applies live: `docs/engineering/S09-LIVE-RESOLUTION.md:61`). With two parties and one pair the filter is trivially satisfied but must still be implemented and tested (B5, D). |
| A17 | Money is the only private thing; craft, deliverables, usage shared | `decisions/D10-what-each-party-sees.md:54` | Cory ruling (Q14, A2) | Contract items keep their `layer`; the per-party view hides only `money` items of other pairs. |
| A18 | Brief before signing; contract after; what each person walks away holding is the contract | `decisions/D05-vocabulary.md:28-29` | Cory ruling (B1) | Internal names `contract*` are fine (`D05:30`: internal code names do not wait). Any participant-facing label is D05-bound; archived-state words are OPEN (`D05:35`). |
| A19 | No proxies; the person acting is the person reading and affirming | `decisions/D12-who-may-act.md:29-31` | Cory ruling | The signing function takes the party **and** the account; the database checks the account is that party's bound account. No operator signs "for" a party except in test/demo synthetic use, which must be labelled as such. |
| A20 | Consent-bearing records are append-only; removal means archive, not destruction; records outlive account deletion | `decisions/D09-preservation-and-evidence-access.md:19` (DOCTRINE:56), `:41` | [R]; Cory ruling (B3) | Contract tables: runtime role `SELECT, INSERT` only, no cascades toward them (`planning/B-product-invariants.md:36` [F] mechanism), no foreign key from a contract row to anything that can be deleted. No purge path (`D09:54`). |
| A21 | Archive by long random reference that is itself the credential, with surname as sanity check; archive access needs no account; no third party | `decisions/D03-participation-credential.md:44-47`; `decisions/D09-preservation-and-evidence-access.md:41,45` | Cory ruling (A1, B3) | S11 can mint and store a per-party reference digest (S07 pattern: `src/invitations/tables.ts:45-46`). The surname check cannot be built: no table stores a name (B6). |
| A22 | Suspension blocks acting, never reading | `decisions/D09-preservation-and-evidence-access.md:42` | Cory ruling (B3) | Contract read functions must never consult account status. (No suspension exists yet; the constraint is on design, not a test.) |
| A23 | Counsel-dependent retention, purge and statutory erasure | `decisions/D09-preservation-and-evidence-access.md:47` | OPEN (counsel) | S11 sets no retention period, no purge path, makes no promise of duration (`D09:54`). |
| A24 | What signing looks like (typed name, drawn signature, tap, other) | `decisions/D04-terms-and-affirmation.md:101`; `decisions/README.md:64-65` | OPEN | No participant-facing signing control. The data function takes no "typed name" or drawn image (either would be a default for the open act). B7, C(i). |
| A25 | No-means-no wording | `decisions/D04-terms-and-affirmation.md:100` | OPEN | S11 does not block on it structurally (an item's `content` is whatever was stored), but no real brief can be signed without it (`D04:92`: the signed acknowledgment stays on every brief). C(v). |
| A26 | Noise doctrine: participants see what was agreed, never how; response times, read receipts, revision counts etc. are not exposed; recording versus showing | `decisions/D10-what-each-party-sees.md:78`; `decisions/2026-10-09-15-cory-reconciliation.md:245-251` | Cory doctrine §3.1–3.2 | Signature times, IP, device and chain hashes are stored on the contract and are never in the per-party view. Whether "the other has not signed yet" is process data is C(iii). |
| A27 | Signatures are not legal instruments; the product claims only what it does | `planning/B-product-invariants.md:82` (DOCTRINE:59, DOCTRINE:93) | [R] | No "legally binding" wording, no claim that the fingerprint has legal meaning (`docs/engineering/LIVE-BRIEF-REBUILD.md:215`). |
| A28 | S10/S11 finalize only exactly two parties and one pair | `docs/engineering/LIVE-BRIEF-REBUILD.md:89` (LB-16); `docs/engineering/S10-SIGNING-FREEZE.md:30` | Engineering boundary [F], not a product ruling | S11 inherits S10's refusal; the multi-party signing unit stays deferred (`LIVE-BRIEF-REBUILD.md:225-229`). |

Also relevant but already satisfied upstream and only inherited: readiness is S09's structural rule, not real-use completeness (`docs/engineering/S10-SIGNING-FREEZE.md:92`); required-term catalogue not drafted (`D04:104`).

---

## B. Technical design alternatives (Dustin's)

### B1. Final-contract storage

| Option | Description | For | Against |
|---|---|---|---|
| **1. New append-only `contract` tables, copied at finalization** | `contract` (project, brief id, fingerprint, parties, presence), `contract_item` (verbatim content/value/layer/scope/subject/shape/key, per-item approver party ids), `contract_signature`. Written once in the finalizing transaction; live items and ticks deleted; `live_brief.phase` → terminal `final`. This is the position in `docs/engineering/LIVE-BRIEF-REBUILD.md:134-139, 201-203, 324, 330` ("Append-only for live state? No, only for the final contract"; "the only copy is the final contract"). | Immutability by **privilege** (runtime `SELECT, INSERT` only), the mechanism already proven in Stage 0 (`docs/engineering/STAGE-0.md:76-88`) and used for S04 sealing and S06/S07 (`docs/engineering/OCTOBER-SEMANTIC-IMPACT.md:77`). No cascade can reach it. Live tables keep their `UPDATE`/`DELETE` grants without becoming evidence (`src/briefs/tables.ts:11-14`). Discarding ticks is compatible with both affirmation readings (B2). Terminal `final` phase on `live_brief` prevents reopening (`LIVE-BRIEF-REBUILD.md:220-222`). | A copy step with verbatim-fidelity tests; two migrations; the contract tables mirror `brief_item` columns. |
| **2. Keep live rows; flip `live_brief.phase` to `final`** | No copy. Items, ticks, presence stay where they are; triggers refuse all change in `final`. | Fewer tables; no copy fidelity to prove. | Immutability rests on triggers only: the runtime role retains `DELETE` on `brief_item` and `brief_tick` and `UPDATE (content, value, pending, position)` (`docs/engineering/S09-LIVE-RESOLUTION.md:73-78`), so a trigger bug or a dropped trigger is a silent evidence hole; contradicts the Stage 0 threat boundary ("privileges alone", `STAGE-0.md:88`). Keeping `brief_tick` rows alive as the record **silently selects affirmation reading 1** (ticks become retained evidence), against `decisions/D04-terms-and-affirmation.md:75` ("ticks are live-brief state, not retained evidence"). `brief_tick` cascades on item delete (`src/briefs/tables.ts:222`) — a cascade toward evidence. No per-signature co-location. |
| **3. Hybrid: contract header + signatures new, items left live** | Only `contract` and `contract_signature` new; items referenced by foreign key. | Smallest schema. | A foreign key from evidence to a deletable, updatable row (`brief_item`) breaks A20 and A13; a later slice that needs to delete a brief (restart, D02 date change) collides with it. |

**Recommendation [F]: Option 1.** Terminal phase `final` on `live_brief` with `fingerprint` cleared there (the fingerprint lives on `contract`, so `live_brief_fingerprint_iff_signing` is unchanged: `src/briefs/tables.ts:51-54`), items and ticks deleted in the finalizing transaction, pending signatures deleted. The `final` phase admits no outgoing transition. Do **not** delete the `live_brief` row: `live_brief_one_per_project` (`src/briefs/tables.ts:55`) then also enforces "do not reopen or reseed" (`LIVE-BRIEF-REBUILD.md:220-222`) for free. **Mid-shoot stop (A11) is not foreclosed**: it would be a later append-only event table referencing `contract.id`, never a status column on `contract`.

### B2. Affirmation evidence — both readings, neutrally

**The two readings** (`docs/engineering/S10-SIGNING-FREEZE.md:123`):

- **Reading 1 — record at finalization which person affirmed which term**, alongside the signatures (a per-item, per-party affirmation record on the contract).
- **Reading 2 — affirmation is implied** by the signed fingerprint plus topology: once every derived approver has ticked, the signature over the fingerprint (which binds each item's derived approvers: `docs/engineering/S10-SIGNING-FREEZE.md:50`; `src/briefs/live.ts:481`) is the affirmation evidence; no separate record.

**A fact that makes the comparison precise.** At the moment of freeze, and therefore at finalization, *the set of parties who ticked each item equals that item's derived approvers, by database precondition* (`migrations/0024_signing_guards_and_grants.sql:128-156`, `live_brief_signing_requires_ready`), and that approver list is inside the fingerprint (`migrations/0024:183-199`). So a Reading-1 row "party P affirmed item I" carries, at finalization, exactly the information "P is a derived approver of I" — which Reading 2 already stores. The readings differ in **representation and naming**, not in what fact is provable. They would differ in content only if a Reading-1 row carried per-tick time, device or IP; none exists (`brief_tick` has no timestamp: `src/briefs/tables.ts:205-207`; LB-12 `LIVE-BRIEF-REBUILD.md:85`), and HC1 says ticks are live state, so such data is not available to record without changing S09.

| Settled requirement | Reading 1 | Reading 2 |
|---|---|---|
| A12 DOCTRINE:51 "signature bound to the specific clauses it affirms, co-located" | Satisfied literally in storage: a row per clause per person. | Satisfied cryptographically (signature → fingerprint → each clause's content, value and approvers). Co-location is a property of the **rendered** document, which can be produced from `contract_item.approver_party_ids` + `contract_signature` either way. Strain: the binding is only legible by recomputation unless the approver list is also copied in clear (which the recommendation below does). |
| A5 Q17 "each person's affirmation **and** signature evidence" | Reads the "and" as two records; satisfied. | Reads affirmation as what the signature attests to; satisfied if the signature demonstrably covers per-clause approvers. Strain: a reviewer could say "affirmation evidence" names a thing and Reading 2 stores nothing named that. |
| A6/HC1 no intermediate state; D04:75 ticks are not retained evidence | Strain: a Reading-1 row is a retained derivative of ticks. Mitigation: it is the **final** state, not an intermediate one; HC1 forbids history, not the final state. | Satisfied: nothing derived from ticks is retained; ticks are discarded (`LIVE-BRIEF-REBUILD.md:328`). |
| A26 noise doctrine | Satisfied as long as the row has no time/device (it cannot). | Satisfied. |
| A8 no authorship | Both satisfied (an approver is not an author). | |
| A7 a "no" not recorded | Both satisfied (only present items are copied). | |

**What a slice can build that is compatible with both** (the recommended S11 content):

1. `contract_signature` binds the party, the account, database time and the **fingerprint** (B3). The fingerprint already binds each item's derived approvers. — Needed under both readings.
2. `contract_item` copies, per item, the **sorted list of parties who, as of finalization, were its approvers and had ticked it** (one and the same set, see above), in clear, as a column such as `party_ids` or `approver_party_ids`. Reading 1 calls this "who affirmed it"; Reading 2 calls it "topology copied in clear so the fingerprint is legible". — Needed under both: Reading 1 needs the fact; Reading 2 needs it to render co-location without recomputation.
3. **Not** a separate `contract_affirmation` table, and **not** a column named `affirmed_by`/`signed_by` on the item. Naming would promote a reading.
4. Discard `brief_tick` rows at finalization (both readings).

**Is it a technical question Dustin can settle?** Argued both ways:

- *It is product (Cory's):* Q17 is a product requirement, "not a security recommendation" (`D04:83`); whether the record *names* a per-clause affirmation is the kind of thing Cory ruled on (Q12, Q16). The word "affirmation evidence" is his. If he means a visible per-clause "affirmed by X", storage that only implies it may fail his intent. `S10-SIGNING-FREEZE.md:123` explicitly refused to decide.
- *It is technical (Dustin's):* The product requirement is a proposition to be proved ("P affirmed clause I before signing") plus a display requirement (co-located, DOCTRINE:51). Both readings prove the identical proposition from the identical data, because at finalization ticks ≡ approvers by database guard. The *storage* of a fact that is identical under both readings is a representation choice, exactly like "one record with per-party views vs separate artifacts" which Cory himself classed as technical (`D10:70`). `D04:83` ends: "No signing UX or chain structure is designed here" — i.e. the structure is open to engineering.

**My view [F]:** the *storage* question is technical and is settled by item 2 above without naming a reading; the residual product question is **only** what the delivered contract *shows* beside each clause (C(ii)). I would not put "Reading 1 vs Reading 2" to Cory as such — it is an engineering framing he did not create — but I would show him the rendered record (D05 says he reacts to things in context: `D05:35`) and ask C(ii). If Dustin disagrees and treats storage as product, the compatible build above still stands and loses nothing.

### B3. Signature record

**Settled vs technical.**

| Aspect | Settled by | What is settled | Technical remainder |
|---|---|---|---|
| Who signs | D12 (`D12:29`), D03 (`D03:31`) | The party themself, through their bound account | Database check that `account_id` is the party's `party_account_binding` (`src/accounts/tables.ts:60-84`); a party without a binding cannot sign |
| When | Q12, A5a (`D04:74`, `D02:95`) | Only in S10 `signing`, bound to the frozen fingerprint | Fingerprint equality check in a trigger |
| What is recorded | Q17 (`D04:83`), DOCTRINE:52 (`D03:21`) | time, credential, device, IP, chained timestamps | Column shapes; what "chained" means; nullability before an HTTP surface exists |
| Pending signatures | Q11 (`D02:101`) withdrawal before finality allowed; HC1 nothing retained | One party may sign before the other; a withdrawal discards it, keeping nothing | Where pending signatures live (LB-14, `LIVE-BRIEF-REBUILD.md:87,199,201` is the engineering position [F]) |
| Withdrawal vs pending signature | S10 (`src/briefs/live.ts:261-265`; `S10-SIGNING-FREEZE.md:96`) | Untick while signing returns to live; nothing kept | Extend the same transaction to delete `brief_signature` rows (both parties', since the fingerprint is void) |

**Proposed record [F].**

- `brief_signature` (live state, deletable): `brief_id`, `project_id`, `party_id`, `account_id`, `fingerprint`, `signed_at` (database `clock_timestamp()`, caller cannot supply — pattern `migrations/0016_account_party_binding_stamps_and_grants.sql:8-33`), `ip` (inet, nullable), `user_agent` (text, nullable). PK `(brief_id, party_id)`. Trigger: brief must be `signing`, `fingerprint` must equal `live_brief.fingerprint`, `account_id` must be the party's binding, READ COMMITTED only, locks the brief row `FOR SHARE`. Runtime `SELECT, INSERT, DELETE`; no `UPDATE`.
- `contract_signature` (append-only): the same fields copied, plus `contract_id`, `sequence` (1 or 2), `prev_hash`, `record_hash`. Runtime `SELECT, INSERT`.
- **"Chained timestamps", minimally:** `record_hash = sha256(prev_hash ‖ canonical(contract_id, sequence, party_id, account_id, fingerprint, signed_at, ip, user_agent))`, with `prev_hash` of the first signature = the contract fingerprint, and `contract.record_hash` = hash of the last signature. A table CHECK can verify `record_hash` against stored bytes the way `synthetic_evidence_sha256_matches_payload` does (`src/stage0/tables.ts:39`), if the canonical bytes are stored. This is a within-document chain; a cross-document chain (every contract chained to the previous one platform-wide) is a later choice and not required by `D04:83` ("no … chain structure is designed here"). Note: `signed_at` is database time, not a trusted timestamp authority; the claim made is "database time at write", nothing more (A27).
- **IP / device before HTTP:** nullable now; `docs/engineering/LIVE-BRIEF-REBUILD.md:215` ("IP and device evidence arrives with an HTTP surface"). The data function takes an optional `{ ip, userAgent }` so the demo/test caller can pass synthetic values and the shape is exercised. Do not invent a device fingerprint.
- Pending signatures are **not** shown to the other party in S11 (no participant surface); whether they ever are is C(iii).

### B4. Finalization moment

In one READ COMMITTED transaction under the per-brief advisory lock (`src/briefs/live.ts:48`) and `FOR UPDATE` on the brief row (pattern `src/briefs/live.ts:528-533`):

1. require phase `signing`; compute the snapshot and re-verify the fingerprint equals `live_brief.fingerprint` (defensive; the database already forbids drift);
2. verify this `(party, account)`; insert the `brief_signature` row;
3. if the other party's `brief_signature` is absent → return `pending`; done;
4. otherwise: insert `contract`, `contract_item` rows (verbatim copy + approver list), two `contract_signature` rows (chained in `signed_at` order); update `live_brief` to `final` with `fingerprint = null`; delete `brief_signature`, `brief_tick`, `brief_item` rows for the brief.

Trigger changes needed (hand-written migration): `live_brief_check_phase` admits `signing → final` only in READ COMMITTED and only when a `contract` row for this brief with the same fingerprint exists in the transaction (or order the writes so the contract is inserted first and the trigger checks it); `brief_item_guard_live` and `brief_tick_guard_delete` admit deletes when the brief is `final` (today they refuse all change in `signing`: `migrations/0024:243,300`) — the same "change phase first, then delete" ordering S10 uses for withdrawal (`src/briefs/live.ts:264-265`). A contract insert trigger refuses unless the brief is `signing` with that fingerprint and exactly two `brief_signature` rows exist with that fingerprint (fail closed against a direct-SQL contract).

**Concurrency with untick-withdrawal.** Both `signBrief` and `untickBriefItem` take the same advisory lock, so they serialize:

| Order | Outcome |
|---|---|
| Untick, then second sign | The sign is refused `not_signing` (brief is live, fingerprint null, pending signatures gone) |
| Second sign, then untick | The untick is refused (`final` is not `signing` or `live`); the contract stands |
| First sign, then untick by **either** party | Withdrawal: live, tick removed, all pending signatures deleted, no residue |
| Raw SQL tick delete in flight | Refused while signing (`brief_tick_signing_fixed`); the finalization waits on the `FOR SHARE` lock or finds the brief changed |
| Two concurrent signs by the same party | One row (PK), the second is a no-op or refused `already_signed` — choose a no-op to match `tickBriefItem` (`S09-LIVE-RESOLUTION.md:58`) |
| Two concurrent signs by different parties | Serialized by the lock: the second finalizes |

### B5. Participant-visible record and the portable artifact

- **Content** is settled: everything jointly agreed + own payment terms, nobody else's numbers (`D10:70`). One canonical contract with a per-party view is explicitly a permitted technical choice (`D10:70`; `LIVE-BRIEF-REBUILD.md:150`).
- **Data function:** `getContractVisibleTo(db, contractId, partyId)` applying the S09 money filter (`docs/engineering/S09-LIVE-RESOLUTION.md:61`) and returning: items (content, value, layer, subject, approver list), parties and presence, the two signers' party ids and signing times? — **No times.** Times, IP, device, hashes are evidence, not what was agreed (`D10:78`). Return the fingerprint? It is harmless but is process-adjacent; recommend omitting it from the party view and keeping it in the artifact's footer only if Dustin wants verifiability — mark as technical.
- **Artifact format:** Options: (a) server-rendered HTML per party; (b) PDF per party; (c) a signed JSON bundle. Recommend **(a) first [F]**, as the smallest: no rendering vendor (STAGE-0 excludes PDF rendering: `docs/engineering/STAGE-0.md:103`; doctrine 9 minimizes third parties: `2026-10-09-15:267`), testable as text, and it exercises the per-party filter. Caveat: the ratified word is "PDF" (`B-product-invariants.md:136`); the planning reads the ratified part as "a portable artifact each holds independently". HTML is a stepping stone; do not document it as satisfying DOCTRINE:53 permanently. Delivery out of the product (email) is not in S11 (no mail vendor).
- Leak tests: the view for party A must contain no money item of a pair A is not in (trivial with one pair, but the test must exist so a later multi-pair slice inherits it), no signature time, IP, user agent, hash, or the other party's account id.

### B6. Evidence access: the archive reference

- Settled: long random reference as the credential, surname as sanity check (`D03:45`); no account needed (`D09:41`); no third party (`D09:45`).
- **S11 can mint** one reference per party per contract: 32 random bytes, stored as SHA-256 digest only (exactly `direct_invitation.credential_digest`: `src/invitations/tables.ts:45-46,58-59`), in `contract_party_reference (contract_id, party_id, reference_digest)`, append-only. The plaintext reference is returned once to the caller (later: to the person's screen/email).
- **The surname check cannot be built.** No table stores a name: `account` holds only `(login_provider, provider_subject)` (`src/accounts/tables.ts:31-46`, "Deliberately absent: … display name"); `project_party` is a bare id (`src/projects/tables.ts:36-56`); invitations exclude `name` (`tests/database/invitations.test.ts:45`). Capturing a surname is a product-visible step: *where* (at sign-in? at first participation with verification, D11? at signing?) overlaps with the open signing act (if the act were "type your legal name", the surname would come from there). So it is **Cory-adjacent**, not purely technical: see C(vi). Treat as out of this sprint; the archive retrieval UX is later. The reference itself is technical and can be minted now.

### B7. The visible signing act is OPEN — what can be built

- Build: the data functions (`signBrief`, `getContractVisibleTo`, `renderContractFor`), the tables, guards and an **operator/test-only** call in the demo simulator (as S10 did with freeze: `docs/engineering/S10-SIGNING-FREEZE.md:119`), clearly labelled synthetic.
- Do not build: any participant control that performs the signing act, any typed-name/drawn-signature input, any wording such as "I agree"/"Sign". Each of these answers `D04:101`.
- A participant screen showing the frozen brief in `signing` with **no** control is itself a design of "what a person sees while a brief is signing", which the demo notes list as open (`docs/engineering/DEMO-SESSION-NOTES.md:133`) and S10 deliberately did not show (`S10-SIGNING-FREEZE.md:125`). Recommend **no participant surface in S11** (data functions and inspector only), exactly as S09/S10. This keeps C(i) and C(iii) untouched.

---

## C. Genuine Cory questions

Each uses the D01 scenario (`decisions/D01-first-scenario.md:32`): the model created the project and sent it to a photographer she knows; shoot at her home; implied-nude coverage; no money; possible album-cover use by her.

| # | Question | Concrete example | Why it is Cory's |
|---|---|---|---|
| (i) | **What is the act of signing**, once everything is green? Typed name, drawn signature, a single tap on a sentence, something else? | The photographer has ticked every term; she has ticked every term. The brief is READY TO SIGN. What does each of them now do on the phone to sign? | `D04:101` OPEN; `decisions/README.md:64-65`. |
| (ii) | **What does the contract show beside each clause?** Must each term visibly read "affirmed by Cory / affirmed by [photographer]", or does one block at the end with both signatures, where the document states that every term above was affirmed by both, satisfy "co-located"? | The coverage term "implied nude; sheer fabric permitted at the agreed level" — does it carry both names under it, or only the signature block at the end? | DOCTRINE:51 co-location is [R]; its visible form is the residual product part of B2. Show him a rendered example (`D05:35`). |
| (iii) | **What does a person see after they have signed but the other has not?** Is "waiting on the other person" acceptable information, or is it process data under the noise doctrine? | She signs on Tuesday; he signs Thursday. On Wednesday, does her screen say "you have signed; waiting for him", only "signing", or does it look no different from before she signed? | `D10:78` (noise doctrine) vs "a live shared document, everyone watches it fill in green" (`D10:63`). Not settled either way for signatures; `DEMO-SESSION-NOTES.md:133`. |
| (iv) | **Archived-state words** (and the word for a signed record a person later opens). | A year later she opens her record of this shoot. What does the screen call it? "Contract"? "Signed"? "Completed"? | `D05:35` OPEN; to be drafted in context on a real screen. |
| (v) | **No-means-no wording**, needed on every brief before any real signing. | The acknowledgment both of them sign, in its two faces: for her, the tools she has (safe word, stop anything); for him, the obligation. Exact text. | `D04:100` OPEN; `D04:92`. Not a blocker to building S11's storage, a blocker to any real contract. |
| (vi) | **Where is a person's surname captured** for the archive sanity check — and is that capture part of the signing act? | Two years on, she has closed her account and has only her reference number. The archive asks for the reference and her surname. When did the product learn her surname: at Google sign-in, at verification, or when she signed? | `D03:45` accepts the surname check but nothing captures a name; if the answer is "when she signs", it is part of (i). |

Not Cory questions (settled or technical): contract storage, hash chain structure, pending-signature storage, per-party view mechanism, archive reference format, IP/device column shapes, HTML vs PDF, two-party boundary, retention (counsel).

---

## D. Smallest implementable S11 slice, or the blocker

**There is no blocker to the storage and finalization slice.** `docs/engineering/LIVE-BRIEF-REBUILD.md:358` already states it: "Storage: no. A real signing UI: yes (D04 visible signing act)." Every structural requirement is settled (A1–A10, A12–A14, A16–A20); the open items (A24, A25, C) govern the participant surface and wording, which the slice omits.

### Decisions relied on (exact subparts)

D04 Q12 (`D04:71-74`), D04 Q17 as corrected by HC1 (`D04:83`), D04 "no version history" (`D04:85`), DOCTRINE:46 and :51 as recorded (`D04:22-23`), D02 A5a finality (`D02:95`), D02 Q11 withdrawal (`D02:101`), D02 Q9/Q10 (`D02:87-88`), HC1 and HC2 (`2026-10-09-15:16-47`), D10 final record and noise doctrine (`D10:70,78`), D10 layers (`D10:54`), D03 credential captured (`D03:21`) and archive reference (`D03:45`), D12 no proxies (`D12:29`), D09 append-only and outlives account (`D09:19,41`), D05 internal names (`D05:30`). Engineering boundary LB-14, LB-16 (`LIVE-BRIEF-REBUILD.md:87,89`).

### What it builds

| Piece | Content |
|---|---|
| `src/briefs/tables.ts` | `live_brief.phase` admits `final` (terminal). |
| New `src/contracts/tables.ts` | `contract` (id, project_id, brief_id, fingerprint, record_hash; unique on brief_id and on project_id); `contract_party` (contract_id, party_id, account_id, on_site); `contract_item` (contract_id, item_id, layer, pairwise_agreement_id, subject_party_id, shape, item_key, content, value, position, approver_party_ids uuid[] — name chosen so as not to promote a reading, B2); `contract_signature` (contract_id, sequence, party_id, account_id, fingerprint, signed_at, ip, user_agent, prev_hash, record_hash); `contract_party_reference` (contract_id, party_id, reference_digest). All runtime `SELECT, INSERT`; no `UPDATE`, `DELETE`, `TRUNCATE`; no cascades; foreign keys only to `project`/`project_party`/`account` (never to `brief_item`). |
| `brief_signature` (live) | As B3; runtime `SELECT, INSERT, DELETE`. |
| Migrations | `0026_final_contract` (generated, hand-ordered: tables, phase check) and `0027_contract_guards_and_grants` (hand-written: signature trigger, finalization transition in `live_brief_check_phase`, `brief_item_guard_live` / `brief_tick_guard_delete` admitting deletes under `final`, contract insert guard, record-hash CHECK, grants, `REVOKE EXECUTE … FROM PUBLIC`). |
| Data functions (`src/contracts/sign.ts`, `src/contracts/record.ts`) | `signBrief(db, briefId, partyId, accountId, evidence?: {ip, userAgent})` → `{ status: 'pending' } \| { status: 'final', contractId }`; `untickBriefItem` extended to delete pending signatures; `getBriefSigningState` extended with which parties have pending signatures (internal, not a party view); `getContractVisibleTo(db, contractId, partyId)`; `renderContractHtmlFor(db, contractId, partyId)` (pure function over the visible record); `mintContractReference(db, contractId, partyId)`; `verifyContractChain(db, contractId)` (pure recomputation, for tests and the inspector). |
| Refusals | `not_signing`, `fingerprint_mismatch`, `not_bound_account`, `not_a_party`, `unsupported_topology` (inherited), `already_final`. |
| Demo | Inspector shows `final` and a contract record; simulator exposes an operator-only `sign as party` labelled synthetic (as the S10 freeze would be). No participant route. |
| Docs | `docs/slices/S11-…md` (PRD) and `docs/engineering/S11-….md` as built; README status line. |

### What it omits, and why (each tied to an OPEN item)

| Omission | Tied to |
|---|---|
| Any participant-facing signing control, typed name, drawn signature, "I agree" wording | `D04:101` (visible signing act OPEN); C(i) |
| Any participant view of a brief in `signing`, including "waiting on the other" | C(iii); `DEMO-SESSION-NOTES.md:133` |
| Per-clause visible "affirmed by" wording in the HTML rendering: the rendering shows each clause with the stored approver list in a neutral form and the signature block; the final presentation is C(ii) | DOCTRINE:51 visible form; C(ii) |
| A separate affirmation table / `affirmed_by` naming | B2 (compatible-with-both rule) |
| Participant-facing labels ("contract", "signed", archived states) | `D05:35`; C(iv) |
| Surname capture and the archive lookup | `D03:45` not capturable; C(vi) |
| Email/out-of-product delivery, PDF | No vendor (STAGE-0:103); B5 |
| Retention, purge, erasure | `D09:47` counsel |
| Mid-shoot stop, DNS, DNF, date change, restart | `D02:102,106,108`; `LIVE-BRIEF-REBUILD.md:219-224,308` |
| Three or more parties, chaperone as party | LB-16; `S10-SIGNING-FREEZE.md:30` |
| HTTP surface, real principal, suspension | Not in any slice yet; A22 is a design constraint only |

### Independent of the blocker and doable now

All of "What it builds". Nothing in the storage slice waits on Cory. The required-term catalogue (`D04:104`) and no-means-no wording (`D04:100`) gate **real** signing (Gate 2), not synthetic finalization.

### What Dustin can do after this slice (plain words)

Take any synthetic two-person brief the demo already drives to READY TO SIGN, freeze it, have each person's bound account sign it through an operator call, and get back an append-only contract that the runtime role cannot alter, a per-person HTML record that shows only what that person is entitled to, a verifiable signature chain, and an archive reference per person. Then put the rendered record in front of Cory and ask C(i)–(iv) on a real screen.

### Ordered test cases (database level, mirroring S10's rigour)

**Preconditions and refusals**
1. Sign refused on a `draft` and on a `live` brief (`not_signing`); nothing written.
2. Sign refused for a party not in the project (`not_a_party`), for a party with no account binding, and for an account that is not that party's binding (`not_bound_account`, D12); through the function and by direct runtime SQL into `brief_signature`.
3. Sign refused with a fingerprint that does not equal `live_brief.fingerprint` (direct SQL), and outside READ COMMITTED.
4. First signature returns `pending`; `brief_signature` has one row with database time (a backdated `signed_at` supplied by the caller is overwritten, pattern `tests/database/accounts.test.ts` stamp tests); no contract exists; the brief is still `signing` with the same fingerprint.
5. Repeat sign by the same party is a no-op (one row).
6. Second signature finalizes: `contract`, `contract_party` (2), `contract_item` (every item, verbatim content/value/layer/scope/subject/shape/key, approver lists equal to the S10 snapshot's), `contract_signature` (2, sequences 1 and 2 in `signed_at` order), `brief_signature` empty, `brief_tick` empty, `brief_item` empty, `live_brief.phase = 'final'`, fingerprint null. Full-row comparison of the contract items against the pre-freeze items (as S10's no-residue test does: `tests/database/brief-signing.test.ts:370`).
7. The contract fingerprint equals `briefFingerprint` of the snapshot taken before signing, and `verifyContractChain` passes; altering any field in the canonical bytes in memory fails verification.
8. Awkward text (quotes, newlines, control characters, non-ASCII, emoji) copied byte-exact (reuse S10's vectors: `brief-signing.test.ts:309`).

**Withdrawal and pending signatures**
9. First sign, then untick by the signer: live, tick removed, fingerprint null, `brief_signature` empty, no residue (full-row comparison against a never-signed brief).
10. First sign, then untick by the **other** party: same outcome (both pending signatures gone; the fingerprint is void).
11. Re-freeze after 9/10 gives the same fingerprint for the same state; a signature made against the old fingerprint cannot be replayed (direct SQL insert with the old digest refused when the brief is live; and refused after re-freeze only if the state changed — assert both branches).

**Concurrency**
12. Race: second sign vs untick, alternated and repeated (pattern `brief-signing.test.ts:507-545`): outcomes are exactly {final contract + untick refused} or {withdrawn + sign refused `not_signing`}; never a contract whose fingerprint differs from its items, never a contract alongside a live brief with items.
13. Two concurrent second-signs (different parties racing to be second after the first): exactly one contract.
14. A raw `brief_tick` delete held open in another transaction while the finalizing sign starts: the sign waits (confirm blocked on the lock as S10's test does: `brief-signing.test.ts:552`) and then refuses or finalizes according to the committed state.
15. Finalization refused outside READ COMMITTED (`live_brief_final_read_committed_only`).

**Immutability by runtime role**
16. As `app_runtime`, `UPDATE`, `DELETE`, `TRUNCATE` on each contract table fail `insufficient_privilege`; the owner can (pinned, so the doc cannot overclaim: `STAGE-0.md:84`).
17. A direct runtime `INSERT` into `contract` for a brief that is not `signing`, or with a fingerprint other than the brief's, or with fewer than two matching `brief_signature` rows, is refused by the guard.
18. `live_brief` in `final` refuses every phase change, every item insert, every tick insert, every presence change, every party or pair insert (extend S10's "refuses direct SQL" test: `brief-signing.test.ts:343`).
19. No cascade path reaches a contract table (catalog query over `pg_constraint` for `ON DELETE CASCADE` toward `contract*`); deleting nothing upstream is possible anyway, but pin it.
20. Exact privilege pins updated: `runtime-role.test.ts`, `trigger-functions.test.ts`, `briefs.test.ts` column and constraint lists; excluded-semantics lists narrowed deliberately (`sign`, `final` become allowed only in `contract*`/`brief_signature` names: `docs/engineering/OCTOBER-SEMANTIC-IMPACT.md:148`).

**Per-party view leaks nothing**
21. `getContractVisibleTo` for each party returns every universal and shared item and the fee of their own pair; a fixture with a money item of a pair the viewer is not in (constructible only at the database level, since S10 refuses three parties: build the contract rows directly as owner for this test) returns no such item.
22. The view and the rendered HTML contain no `signed_at`, `ip`, `user_agent`, `prev_hash`, `record_hash`, account ids, position gaps, or the other party's account; string-search the rendering for every evidence value from the fixture.
23. A non-party gets `not_a_party`/not found, never an empty record.
24. The HTML is self-contained (no external references) and contains every visible clause's exact `content` and `value`.

**Archive reference**
25. `mintContractReference` returns 32 random bytes once; only the digest is stored; two mints for the same party yield two distinct rows (rotation undefined, as S07: `src/invitations/tables.ts:33-35`); the digest is unique; runtime cannot update or delete it.

**Upgrade from 0025**
26. A database populated at 0025 with a draft brief, a live all-ticked brief and a **frozen `signing` brief** (fingerprint set) migrates to current: every row unchanged, phases unchanged, fingerprint of the frozen brief unchanged, contract tables empty, grants and triggers present, catalog equal to a fresh migration, rerun a no-op. Then: the frozen brief can be withdrawn by untick (S10 behaviour preserved), re-frozen, signed twice and finalized; the live brief can be frozen and finalized; the draft is untouched (pattern `tests/database/migration-upgrades.test.ts:316`).
27. Fingerprint v1 golden vector unchanged (`brief-signing.test.ts:430`): finalization does not alter the digest definition.

**Demo**
28. The inspector snapshot schema admits `final` and a contract record; no participant route accepts a brief in `signing` or `final` (participant routes stay live-only: `DEMO-SESSION-NOTES.md:106`); the browser regression finds no signing control.
