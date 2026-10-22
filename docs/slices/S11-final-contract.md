# Slice — S11 final contract storage and finalization

Status: BUILT — awaiting Dustin's review (authorized 2026-10-21: `planning/sprint-2026-10-21/EXECUTION-PACKAGE.md` §3.2 and AC-19/AC-20, which narrows `WS2-S11-RECON.md` §D)
Date: 2026-10-21

Built on `main` at `52216b9` (S12 and S13 merged), so the migrations are `0028` (generated) and `0029` (hand-written).

## Outcome

A synthetic two-person brief that S10 has frozen can be finalized by one operator/test-only call that carries both people's bound-account signature evidence. The result is an append-only contract, copied verbatim from the frozen brief, that the runtime role cannot alter; a per-party view of it; a labelled proposal rendering of that view for the operator; and a recomputable signature chain.

Nothing here is the signing act. No participant can sign, see a brief that is signing, or see a contract.

## Product decisions required

- `decisions/D04-terms-and-affirmation.md` — Q12 (tick and sign are separate; nobody signs what can still change; sign only when all green), Q17 as corrected by HC1 (the final contract carries the fingerprint and each person's evidence; no signing UX or chain structure is designed there), "no version history". **OPEN and not answered here:** the visible signing act, no-means-no wording.
- `decisions/D02-agreement-topology-lifecycle.md` — A5a (all green, then everyone signs; no organizer confirmation), Q9 (no authorship), Q10 (a "no" is not recorded), Q11 (withdrawal before finality).
- `decisions/2026-10-09-15-cory-reconciliation.md` — HC1 (the final contract is the evidentiary document; no intermediate state retained), HC2 (no proposer).
- `decisions/D10-what-each-party-sees.md` — the final record per party (everything jointly agreed plus one's own payment terms), money the only private thing, the noise doctrine.
- `decisions/D12-who-may-act.md` — no proxies: a signature is the party's own bound account's.
- `decisions/D03-participation-credential.md` — the record captures the credential used (the account), not identity.
- `decisions/D09-preservation-and-evidence-access.md` — consent-bearing records are append-only. **OPEN and not answered here:** counsel-dependent retention and erasure.
- `decisions/D05-vocabulary.md` — internal names do not wait (`contract*` is internal). **OPEN:** every participant-facing word.

## Unruled seams — omitted, no default

| Seam | Source | What this slice does |
|---|---|---|
| The visible signing act | D04 (OPEN), package §7 Q1 | No participant control, typed name, drawn signature or "I agree". The only caller is an operator/test act labelled synthetic. |
| Signing order: together, or one first | package §7 Q3 | One call carries both signatures. Nothing stores one signature while the other is awaited. `sequence` is the chain order (by party id), not who signed first. |
| What each clause shows | package §7 Q2 | The proposal rendering lists each clause with its stored approver party ids in a neutral form, labelled as a proposal for Cory's reaction. Not a product presentation. |
| No-means-no wording, affirmation display | D04 (OPEN) | No wording or placeholder. A clause's text is whatever the brief stored. |
| Participant view of signing or final briefs; "waiting on the other person" | package §7 Q3; `DEMO-SESSION-NOTES.md` | None. Participant routes stay live-only (404 otherwise). |
| Surname capture, archive reference | D03 (surname not capturable), package §3.2 | Neither built. |
| Retention, purge, erasure | D09 (OPEN, counsel) | None. No duration promised. |
| Participant-facing labels ("contract", "signed", archived states) | D05 (OPEN) | None outside the operator inspector. |

## Implementation decisions (Dustin's to see; technical)

1. **Storage (WS2 B1 option 1).** New tables `contract`, `contract_party`, `contract_item`, `contract_signature`. Runtime role `SELECT, INSERT` only; no `UPDATE`, `DELETE`, `TRUNCATE`; no cascading foreign key; foreign keys only to rows the runtime role cannot delete (`project`, `project_party`, `pairwise_agreement`, `account`, `live_brief`), never to `brief_item`.
2. **Terminal phase.** `live_brief.phase` admits `final`, with no outgoing transition and no fingerprint (the fingerprint lives on `contract`). The `live_brief` row stays, so the one-brief-per-project key also prevents reseeding.
3. **Verbatim copy, checked by the database.** `contract_item` copies each item's id, layer, pair, subject, shape, key, `content` and `value` exactly, and its derived approvers as `approver_party_ids` (sorted). The name promotes neither affirmation reading (WS2 B2); there is no affirmation table and no `affirmed_by`/`signed_by` name. On `signing → final` the database requires the contract to match the brief's current rows exactly, column by column, including the approver lists.
4. **Display order, not raw position.** `contract_item.position` is the dense order 1..n in the brief's canonical order (position, then id). Raw positions are not copied: a gap would record that a request was declined (HC1, D02 Q10). The fingerprint never bound raw positions, so this changes nothing it proves.
5. **Presence and accounts.** `contract_party` records each party, its on-site fact and its bound account, checked against `brief_party_presence` and `party_account_binding` on insert. Presence rows stay on the brief (the runtime role cannot delete them); ticks and items are deleted at finalization (HC1).
6. **One call, both signatures.** `finalizeBrief(db, briefId, [sigA, sigB])`, each `{ partyId, accountId, fingerprint, evidence?: { ip?, userAgent? } }`. Each signature names the fingerprint it binds, so a signature over a stale frozen state is refused `fingerprint_mismatch`. READ COMMITTED, under S10's per-brief advisory lock and `FOR UPDATE` on the brief row. Refusals: `not_signing`, `already_final`, `fingerprint_mismatch`, `not_a_party`, `not_bound_account`, `unsupported_topology`.
7. **Signature time.** `signed_at` is set by the database to the finalizing transaction's time, truncated to milliseconds; a caller cannot supply it. Both signatures carry the same time: they are recorded in one act, and nothing orders them. The claim is "database time at write", nothing more.
8. **Chain (within one contract).** `record_hash = sha256(JSON ["modeling-standard/contract-signature", 1, contractId, sequence, partyId, accountId, fingerprint, signedAtMs, ip, userAgent, prevHash])`; `prev_hash` of sequence 1 is the contract fingerprint, of sequence 2 the first record's hash. Computed by the database on insert (caller values overwritten). `verifyContractChain` recomputes everything in the application: the fingerprint v1 from the contract's own rows, then each link.
9. **IP and device.** `ip inet` (a single host address) and `user_agent text` (≤ 512 characters), both nullable: no HTTP surface supplies them yet. No device fingerprint is invented.
10. **No partial contract can commit.** A deferred constraint trigger refuses, at commit, a `contract` whose brief is not `final`; contract parts can be inserted only while the brief is `signing` with the contract's fingerprint; `signing → final` requires exactly the two parties, two signatures and the full verbatim item set. So no table holds one signature without the other.
11. **Per-party view.** `getContractVisibleTo(db, contractId, partyId)`: parties with on-site facts, and every universal and shared clause plus only the money clauses of the viewer's own pairs, with approver ids. No time, IP, user agent, hash, fingerprint, account id or position. A non-party gets `ContractNotFoundError`, never an empty record.
12. **Proposal rendering.** `renderContractHtml(view)` is a pure function producing self-contained HTML (no external reference, a restrictive content-security policy, every value escaped), headed as a proposal rendering for Cory's reaction. Shown only in the operator's record inspector.
13. **Demo.** An operator-only `finalize` act in the simulator, labelled synthetic: it freezes a ready brief if needed and finalizes with each party's existing bound account (parties that claimed invitations). The inspector shows `final` and the stored contract with its chain check and each party's proposal rendering. The operator's read-only snapshot (`npm run demo:export`) embeds the inspector record, so it also carries a finalized project's contract data and each party's proposal rendering; it is an operator/demo artifact, not participant UX. No participant route changes.

## Explicitly out of scope

`brief_signature`, pending signatures, `signBrief → pending`, "untick discards pending signatures", `contract_party_reference`, `mintContractReference`, the surname check, PDF, email, any participant route or screen for `signing` or `final`, mid-shoot stop, DNS/DNF, amendment, three or more parties.

## Acceptance evidence

AC-19 and AC-20 of the package: database tests in `tests/database/contracts.test.ts` (preconditions and refusals; verbatim copy; chain; finalize-vs-untick races; runtime-role immutability; no cascade; per-party view and rendering leak nothing; no partial contract), the populated upgrade from 0025, the unchanged fingerprint golden vector, the schema and privilege pins, the demo tests and the browser regression.

## Change-locality check

- Cory rules signing order "one may sign first": a pending table feeds `finalizeBrief`; the contract tables do not change.
- Cory rules what each clause shows: only the rendering changes.
- Cory rules the signing act: a participant surface calls `finalizeBrief` (or its pending feeder); storage does not change.
- Counsel rules retention: an append-only archive or purge policy is added beside the tables.

## Stop conditions

Any need for a participant signing control, wording, a participant view of `signing`/`final`, a one-signature-waits mechanism, an affirmation table or naming, a surname, or a retention rule.
