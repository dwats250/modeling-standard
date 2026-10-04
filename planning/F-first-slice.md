# Deliverable F. Stage 1: the first adult collaboration slice

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). **A conditional envelope, not a build specification.** Not implementation authority.

The previous version of this document described a fixed workflow with fourteen acceptance criteria drafted under Fable's preferred answers. It is replaced by three things: the outcomes Cory's existing direction supports, a proposed shape for the smallest useful first slice, and the decisions that still block its precise behaviour. PRDs for Stage 1 are written piece by piece as those decisions are answered (Gate 1 in the root `README.md`).

## 1. The outcome envelope

These are what Cory's ratified direction supports. Any first slice has to deliver them; none of them says how.

| # | Outcome | Source |
|---|---|---|
| 1 | Relevant collaborators establish explicit professional terms before the work | [R] VISION:136, DOCTRINE:29 |
| 2 | Required participants agree to the terms relevant to them | [R] VISION:150, VISION:374 |
| 3 | Signatures are bound to the specific clauses they affirm | [R] DOCTRINE:51 |
| 4 | Compensation, deliverables, usage and boundaries are preserved | [R] DOCTRINE:47-50 |
| 5 | A change cannot silently rewrite an earlier agreement | [R] DOCTRINE:46, DOCTRINE:56 |
| 6 | Affected people return to review when a change requires it | [R] VISION:152; the rule itself is [OPEN] D2 |
| 7 | Each party receives an authorized, independently holdable artifact containing the evidence they are entitled to | [R] DOCTRINE:53, VISION:154 |
| 8 | Ordinary archival or account cleanup does not destroy another party's agreement evidence | [R] DOCTRINE:56 |
| 9 | The product does not claim to witness what happened on set | [R] DOCTRINE:40-42 |
| 10 | The product does not claim identity verification or legal enforceability beyond what it performs | [R] DOCTRINE:59, DOCTRINE:93, VISION:316-317 |

## 2. Proposed shape of the first slice [F]

A recommendation for the smallest slice that delivers the envelope. Every line depends on a Cory decision and is marked.

- **One scenario, selected by Cory** (D1). Not a paid preset and a trade preset; one real collaboration, with the fields and wording it needs.
- **Adults acting for themselves.** A proposed constraint that needs Cory's approval (D12), together with how adulthood is assured (D11). If the chosen scenario includes someone who signs for another party, this constraint does not hold.
- **Private.** Nothing public, nothing browsable (I6). The visibility and invitation rules inside the collaboration are approved explicitly (D10, D3), not assumed.
- **As many parties as the scenario has, and no more.** The model treats parties as a set from the start, so nothing is hard-wired to two. If the scenario has two people, the topology question (D2a) and most of the visibility grid (D10) do not block the first slice and return with the first three-party slice. If it has more, they block.
- **Obligations stated as who owes what to whom** (Deliverable E, section 2), for the obligations the scenario actually contains. No obligation is implied by an "organizer" role.
- **Only the terms the scenario and the ratified evidence set require** (D4). No inherited field vocabulary.
- **One journey end to end**: create, present, respond, finalize, artifact delivered to each party, archive without loss.
- **Amendment and cancellation only once their rules are settled** (D2e, D2g, D2h). The first journey can be built and demonstrated without either; neither is offered until Cory has decided how it works.
- **Releases included if the scenario triggers them** (D8). If the scenario's usage terms trigger a release and no approved template exists, the slice is a demonstration and is not used for real work.

## 3. What the slice excludes

Images and uploads of any kind. Public pages, handles, comp cards, portfolios, concept posts. Discovery. Availability and calendar. Reports, strikes and moderation tooling. Plans, tiers and billing. Youth, guardians, organizations and representatives. Profiles beyond what a party needs to be named in an agreement. User-editable presets. Delivery tracking after the shoot.

Excluding something here does not make it unnecessary for real use. If the chosen scenario needs a release, adult assurance, record recovery or anything else on this list, it moves into the real-use gate (section 6).

## 4. Decisions that block each piece

A piece of Stage 1 starts when every decision in its row is answered and its PRD is approved. Nothing starts on a preferred answer.

| Piece of work | Needs | Notes |
|---|---|---|
| Scenario scope; parties and obligations | D1, D12 | Everything else depends on this |
| Terms content and validation | D1, D4 | |
| Invitation and participation credential | D3, D11, D12 | Includes what is recorded as the credential used |
| What each party is shown | D10, D4; D2a if more than two parties | Produces the per-party presentation that evidence binds to |
| Response, signing and finalization | D2b to D2d, D4 | D2a if more than two parties |
| Roster changes | D2f | Only if the scenario needs them |
| Amendments | D2g, D2h | May follow the first journey |
| Cancellation of a finalized collaboration | D2e | May follow the first journey |
| Artifact content and delivery | D10, D2, D5; D8 if a release is triggered | |
| Screens, emails and artifact wording | D5; D11 for any assurance wording | Internal code names do not wait |
| In-product access to records after account changes | D9, D3 | Delivery of the portable artifact does not wait for D9. This piece may be the last of Stage 1; it must be done before real use. |
| Any statement that creating or inviting is free or paid | D7 | Billing itself is not in this stage |

## 5. The synthetic demonstration

Once the pieces are built on Cory's answers, a demonstration with invented people and inboxes the team controls can prove:

- the application flow end to end;
- authorization, including wrong-person and wrong-collaboration attempts;
- versioning: earlier presented states are unchanged by later edits;
- evidence mechanics: what each party was shown and affirmed can be reconstructed and checked;
- privacy boundaries between parties;
- behaviour under concurrency and failure (section 7);
- artifact creation and delivery.

A synthetic demonstration is built on approved semantics like everything else in Stage 1; it is synthetic because of who uses it, not because its rules are provisional. It is labelled as a demonstration wherever it is shown.

## 6. Real use is a separate gate

A working demonstration is not readiness for real professional use. Before any real collaboration between real people runs on the product (Gate 2), Cory approves real use for a named scenario, and each of these is resolved for that scenario:

| Prerequisite | Decision |
|---|---|
| Real private use is permitted before the public launch | D6 |
| The releases the scenario's usage terms trigger exist, with approved templates | D8 |
| Adult assurance: the method, and Cory's approval of any departure from verifying at first participation | D11 |
| Identity claims in the product match what it actually checks | D3, D11, I7 |
| Record access and recovery after lost credentials, closure and suspension | D9, D3 |
| Retention | D9, counsel |
| Legal review of whatever Cory or counsel marks as needing it | D8, D9 |
| The scenario is within the approved scope | D1, D12 |

Trade and portfolio work is not exempt from any of these. It involves usage rights and can trigger a release as readily as paid work.

## 7. Engineering obligations once the transitions are approved

When Cory has settled the state transitions (D2), the Stage 1 PRDs specify behaviour for each of the following. None is designed before the transitions exist.

- Concurrent edits to the same terms.
- An acceptance arriving while the terms are being changed.
- A withdrawal arriving during finalization.
- Finalization triggered twice.
- Retries of any step.
- Artifact rendering fails.
- Artifact storage fails.
- Finalization partly completes.
- Idempotency of every operation that can be retried.
- Recovery from an interrupted operation.

The target is the smallest transactional model that handles the approved semantics correctly. This does not call for event sourcing.

## 8. Acceptance evidence

Stated as outcomes; each PRD turns its share into exact criteria.

- A party cannot see anything about another party that the approved visibility rules withhold, through any screen, notification, export or artifact.
- Every obligation in the scenario is affirmed by the party who undertakes it, including obligations undertaken by whoever organized the collaboration.
- Authorization holds against the wrong person, the wrong collaboration and the wrong object within a collaboration.
- Anything presented earlier is unchanged, byte for byte, by anything that happens later.
- For each party, the evidence shows the clauses and values they were shown, who they were told the counterparties were, what they affirmed, when, and with which credential (Deliverable E, section 4).
- Finalization is correct under races and retries, and is not duplicated.
- A failed render or store is recoverable without altering evidence or issuing two different artifacts for one agreement.
- Each party's artifact is delivered to them and faithfully represents the part of the agreement they are entitled to hold.
- Archiving the collaboration, or removing one party's account, leaves every other party's evidence intact.
- Record access behaves as Cory approved after each account-state change. This item waits for D9 and is completed when D9 is answered; it does not hold up the rest of the first journey, because each party already holds their delivered artifact.

**Proposed criteria that remain proposals [F].** From the previous version, to be justified in a PRD or dropped: every email and artifact within one minute; byte-stable renderer output; two presets; one affirmation control per term block; a typed legal name. Artifact integrity and faithful rendering matter. Regenerating byte-identical PDF files is a separate technical choice and is not required by any outcome above.

## 9. Coverage of the ratified evidence set

The previous version said the slice covered seven of the eight elements of the evidence set (DOCTRINE:46-53) "in full". That was overstated. What the envelope targets:

| Element | In the envelope | Depends on |
|---|---|---|
| 1. Exact clause text as presented at signing | Yes | Per-party presentation capture (D10) |
| 2. Agreed parameters as values | Yes | D4 |
| 3. Compensation terms, signed by the parties to them | Yes | D1, D4 (who owes whom) |
| 4. Deliverables and delivery timing | Yes | D1, D4 |
| 5. Usage rights and the release documents they trigger | Usage rights yes; releases only if included | D8 |
| 6. Each signature bound to the clauses it affirms | Yes | D4 (the interaction) |
| 7. Timestamps and the identity or credential used | Yes, as the credential actually used | D3 |
| 8. Final immutable PDF delivered to all parties | Yes: every party receives a portable artifact | D2a, D10 (one canonical artifact with party views, one per party, or one shared in full; contents). The singular wording is not read as deciding this. |

Coverage is claimed for a built slice only after the corresponding decisions are answered and the acceptance evidence exists.

## 10. Why this slice is first

- It is what Cory calls the product: "the consent record is the point. The workflow only exists to produce it" **[R]** (VISION:350).
- It is the part where being wrong is disqualifying: false protection is Cory's first failure mode **[R]** (VISION:499).
- It forces the foundations that are expensive to retrofit: evidence that cannot be altered, authorization on every operation, per-party privacy.

The previous version also argued that Cory and his network "can run real shoots on it with no other feature present". That is a real-use claim and is now subject to section 6.

## 11. Sequence and size

After Gate 0 (the engineering foundation in Deliverable G) and as Cory's answers arrive: parties and obligations; terms; invitation and participation; presentation; response and finalization; artifact; archival and account-change behaviour; amendments if and when settled. Each is a reviewable pull request against a PRD. The first web screens arrive with the first piece that has an approved journey.
