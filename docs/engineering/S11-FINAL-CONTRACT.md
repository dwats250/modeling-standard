# S11 — Final contract storage and finalization

A brief that S10 froze, in a project of exactly two parties and one pair, can be finalized into an append-only **final contract** by one call carrying both parties' bound-account signature evidence. The contract is copied verbatim from the frozen brief; the brief becomes `final` and its items and ticks are deleted. The only caller is an operator/test act labelled synthetic. **Nothing here is the signing act**, and no participant can sign, see a signing brief, or see a contract.

Slice and decisions relied on: `docs/slices/S11-final-contract.md` (authorized by `planning/sprint-2026-10-21/EXECUTION-PACKAGE.md` §3.2, which narrows `WS2-S11-RECON.md` §D). Built on `main` at `52216b9`.

## What exists

- **Tables** (`src/contracts/tables.ts`; migrations `0028_final_contract`, generated, and `0029_contract_guards_and_grants`, hand-written):
  - `contract (id, project_id, brief_id, fingerprint)` — one per brief and per project.
  - `contract_party (contract_id, project_id, party_id, account_id, on_site)`.
  - `contract_item (contract_id, project_id, item_id, position, layer, pairwise_agreement_id, subject_party_id, shape, item_key, content, value, approver_party_ids)`.
  - `contract_signature (contract_id, project_id, sequence, party_id, account_id, fingerprint, signed_at, ip, user_agent, prev_hash, record_hash)`.
- **Phase** `live_brief.phase` admits `final`: `signing → final` only, terminal, fingerprint cleared.
- **Data functions** (`src/contracts/contract.ts`):
  - `finalizeBrief(db, briefId, [sigA, sigB])`, each `{ partyId, accountId, fingerprint, evidence?: { ip?, userAgent? } }` → `{ contractId, fingerprint }`. Refusals (`BriefActionRefusedError`): `not_signing`, `already_final`, `unsupported_topology`, `not_a_party`, `not_bound_account`, `fingerprint_mismatch`.
  - `getContract` (whole record; internal and the operator inspector), `findContractForBrief`.
  - `getContractVisibleTo(db, contractId, partyId)` and its pure filter `contractViewFor` — the per-party view.
  - `verifyContractChain(db, contractId)` and its pure core `verifyContractRecord`; `signatureRecordHash`.
- **Rendering** (`src/contracts/rendering.ts`): `renderContractHtml(view)`, the labelled proposal rendering.
- **Demo:** the operator-only `POST /demo/sim/briefs/:id/finalize` (labelled synthetic); the inspector record's `contract`; the inspector's final stage and contract section; the journey's operator screen shows a frozen or final shoot as a pointer to the inspector.

## Finalization, in one READ COMMITTED transaction

Under S10's per-brief advisory lock and `FOR UPDATE` on the brief row:

1. The brief must be `signing` (`already_final` if final) with exactly two parties and one pair.
2. The two signatures must name the project's two parties, each with the account bound to it (S06; D12), each over the brief's stored fingerprint; the snapshot recomputed now must still give that fingerprint.
3. Insert `contract`, both `contract_party` rows, every `contract_item` (display order 1..n; approvers sorted), then the two `contract_signature` rows in chain order (by party id; the order the caller gives does not matter).
4. `live_brief` → `final`, fingerprint null. The database checks the contract against the brief's rows (below).
5. Delete the brief's ticks and items (HC1). Presence rows remain; the runtime role cannot delete them, and they are current state, not evidence.

## What the database enforces (0029)

| Guard | Effect |
|---|---|
| `contract_check_insert` | A contract is written only for a brief that is `signing` with the same fingerprint, in READ COMMITTED; the brief row is locked FOR SHARE (`contract_requires_signing_brief`, `contract_read_committed_only`) |
| `contract_require_final` (deferred constraint trigger) | At commit, a contract's brief must be `final` (`contract_requires_final_brief`): a contract cannot be left behind to block a later finalization |
| `contract_part_check` on `contract_party`, `contract_item`, `contract_signature` | Written only while the contract's brief is `signing` with the contract's fingerprint (`contract_part_requires_signing_brief`), so nothing is ever added to a committed contract. A party's account must be its binding (`contract_party_requires_binding`) and its on-site fact the brief's (`contract_party_presence_mismatch`). A signature binds the contract's fingerprint (`contract_signature_fingerprint_mismatch`) and is written in chain order (`contract_signature_chain_order`); the database sets `signed_at`, `prev_hash` and `record_hash`, overwriting anything supplied |
| `live_brief_check_phase` (replaced) | `signing → final` only in READ COMMITTED (`live_brief_final_read_committed_only`), only with the contract for that fingerprint (`live_brief_final_requires_contract`), exactly the project's parties and one signature by each (`live_brief_final_requires_signatures`), and a verbatim copy: one contract item per brief item, every stored column equal, the canonical order as 1..n, each item's derived approvers sorted (`live_brief_final_copy_mismatch`). Nothing leaves `final` |
| `brief_item_guard_live` (replaced) | While final, an item may only be deleted (`brief_item_final_fixed`) |
| `pairwise_agreement_guard_signing` (replaced) | No pair is added once final (`pairwise_agreement_final_fixed`) |
| Privileges | Runtime: `SELECT, INSERT` on the four contract tables, nothing else; no cascading foreign key; every foreign key points at a row the runtime role cannot delete; none at `brief_item` |

S09/S10 guards already keep a final brief's presence, roster and ticks fixed (each refuses outside its phase). These guards bind the runtime role; the migration (owner) role is not constrained by privileges (tested, so this document does not overclaim).

**So no table holds one signature without the other**: a signature can be written only inside the finalizing transaction, and that transaction can commit only with both.

## Signature record v1 and the chain

`record_hash` = SHA-256 (lowercase hex) of the UTF-8 text of `JSON.stringify` of:

```
["modeling-standard/contract-signature", 1, contractId, sequence, partyId, accountId,
 fingerprint, signedAtMs, ip | null, userAgent | null, prevHash]
```

Ids lowercase; `signedAtMs` the integer Unix time in milliseconds; `ip` the host address text. `prev_hash` is the contract fingerprint for sequence 1, the first record's hash for sequence 2. The database computes it on insert; `signatureRecordHash` computes the same in the application (tested on stored rows, awkward user-agent text and both IP families).

`verifyContractRecord` recomputes, independently of the database: the S10 fingerprint v1 from the contract's own parties, the project's pairs and the clauses with their approvers; one signature per party in party-id order, each by the recorded account, over the fingerprint; each link; each record hash. Altering any stored field in memory fails it (tested field by field).

This is a within-document chain. `signed_at` is database time, nothing more: not a trusted timestamp, not a legal claim.

## Choices made (for Dustin to see)

- **Each signature names the fingerprint it binds**, so a signature over an earlier frozen state is refused (`fingerprint_mismatch`).
- **One time for both signatures**: the finalizing transaction's time, truncated to milliseconds (so the application reads it exactly). They are recorded in one act; nothing orders them.
- **Chain order by party id**, not by call order: `sequence` must not say who went first (package §7 Q3).
- **Display order, not raw position**, in `contract_item.position`: a gap would record a declined request (HC1, Q10). The fingerprint never bound raw positions.
- **`approver_party_ids`** names what the column is; neither affirmation reading is promoted (WS2 B2). No affirmation table, no column named for who affirmed or signed.
- **IP and user agent** nullable, a single host address and at most 512 characters. The operator finalization passes none: the operator's browser is neither party's device.
- **The proposal rendering has no style or script**, so it can sit in a sandboxed iframe inside the inspector, whose policy forbids inline styles. Parties appear by id (no name is stored).
- **The demo finalize freezes a ready live brief first**, after checking both bindings, so a refusal for an unbound party leaves the brief as it was.

## Per-party view (D10)

Parties with on-site facts, and every universal and shared clause plus only the money clauses of the viewer's own pairs, each with content, value, layer, pair, subject, shape, key and approver ids, in display order. No signature time, IP, user agent, hash, fingerprint, account or position (noise doctrine). A non-party or unknown contract is `ContractNotFoundError`. The two-party case and a three-party record built in memory (S10 refuses three parties, so such a contract cannot reach the database) are both tested, including that another pair's fee value never appears in the view or the rendering.

## Not in this slice

The signing act; any participant route or screen for a `signing` or `final` brief (participant routes stay live-only: 404); pending or sequential signatures; `brief_signature`; archive references and the surname check; PDF or email; retention, purge or erasure; mid-shoot stop, DNS/DNF, amendment; three or more parties; any no-means-no wording.

## Unruled seams hit, left omitted

The visible signing act and no-means-no wording (D04); what each clause shows and the affirmation display (§7 Q2); signing order (§7 Q3); what a person sees while signing and after (D10 noise doctrine vs. live document); archived-state words (D05); retention and erasure (D09, counsel); surname capture (D03).

## Tests

- `tests/database/contracts.test.ts` (32): preconditions and refusals with nothing written; the verbatim copy, column by column, with presence kept and items and ticks gone; fingerprint and chain, application equal to database; tamper detection; awkward text and request evidence; bad evidence refused; a finalization by direct runtime SQL admitted only when complete and verbatim (one signature, wrong chain order, changed wording or value, raw position, missing item, changed or reordered approvers, a contract left without finalizing, wrong phase or fingerprint, snapshot isolation, wrong binding or presence: each refused); finalize-vs-untick in both orders and raced six times; two concurrent finalizations; a raw contract write in flight; runtime immutability (owner can, so privilege is the boundary); every change to a final brief and every addition to its contract refused; no cascade; exact columns; excluded names; no `affirmed`/`signed` "by" identifier in `src/` or `migrations/` (AC-20); the per-party view, rendering escapes and leak checks.
- `tests/database/migration-upgrades.test.ts`: a database populated at 0025 with a draft, a live ready brief and a frozen brief upgrades with every row unchanged, empty contract tables with their grants, a fresh catalog and a no-op rerun; the frozen brief is then withdrawn, re-frozen to the same fingerprint and finalized; the live one is frozen and finalized; the draft is untouched.
- `tests/database/brief-signing.test.ts`: the fingerprint v1 golden vector is unchanged.
- Pins updated deliberately: table list (`migrations.test.ts`), runtime privileges (`runtime-role.test.ts`), trigger functions (`trigger-functions.test.ts`).
- `tests/demo/simulator.test.ts`: the operator finalize — refused when not ready or unbound (nothing changes), creator-only, strict input, then the stored contract in the inspector record with a verifying chain and both renderings; `already_final`.
- `tests/http/participant-access.test.ts` (AC-20): two signed-in people reach ready; after the operator freezes and after it finalizes, every participant route and the operator's `/as/` simulation is the generic 404.
- `tests/demo-browser/regression.test.ts`: in the inspector, the finalize refused for unbound people, then FINAL with the contract, a verifying chain, two signature records, two sandboxed renderings whose content loads, no enabled "sign" control, no history words, no horizontal scroll at 390 px, no browser errors.
