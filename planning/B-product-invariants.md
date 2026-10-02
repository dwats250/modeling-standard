# Deliverable B. Product invariants

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Not implementation authority.

An invariant here is an outcome the product must hold, stated without saying how. Each one is followed by the mechanisms proposed to achieve it and by the questions it leaves open. The three are kept apart on purpose:

- **Outcome**: what must be true, with its provenance tag and source line. Only Cory changes an [R] outcome.
- **Proposed mechanisms**: how engineering might achieve it. Every mechanism is **[F]** and is Dustin's to accept, change or replace. A mechanism is never an invariant, however many later documents rely on it.
- **Open**: what the outcome does not settle. These stay open until the named decision in Deliverable H is answered.

There is no fixed number of invariants. One is added when a ratified outcome is found that the set does not state, and removed if its source turns out not to support it.

Citations are line numbers in the pinned sources (`VISION.md`, `PRODUCT-DOCTRINE.md` at `bfbf5f1`). The previous version of this document numbered nine invariants; the numbers I1 to I9 are kept for continuity and I10 to I13 state ratified outcomes that were previously folded into mechanisms.

---

## I1. What a person was shown and affirmed is never silently rewritten

**Outcome [R].** The exact clause text presented at signing is frozen verbatim, "not a reference to a mutable template", together with the agreed parameters as values (DOCTRINE:46-47). Consent-bearing records are append-only (DOCTRINE:56). Material changes are visible and reviewable, and return to the people affected (VISION:120, VISION:152). In short: finalized agreement evidence cannot be silently altered through normal application behaviour, and a later change produces something new.

**Proposed mechanisms [F].** Any of these, alone or layered; the choice is made against a declared threat model in Stage 0 (Deliverable D):
- an immutable copy taken at presentation, separate from the editable working state;
- insert-only persistence for evidence;
- a runtime database role with no UPDATE or DELETE privilege on evidence;
- database triggers that reject UPDATE and DELETE;
- hashes computed over the stored bytes so alteration is detectable;
- protected storage for rendered artifacts;
- application operations that offer no edit path for evidence.

**Open.** What counts as a material change, who must review again after one, and whether an earlier agreement stays operative while replacement terms are pending (D2).

## I2. Agreement evidence survives ordinary removal

**Outcome [R].** "Ordinary user removal means archive, not destruction"; records of agreement outlive account deletion (DOCTRINE:56).

**Proposed mechanisms [F].** Evidence does not cascade-delete with operational data (restrictive foreign keys; a migration check that fails on a cascade toward evidence). No purge path exists until a purge policy does.

**Open.** Retention period, purge, and who may request it. The ratified text makes durable retrieval "subject to approved privacy and retention rules" **[R-prov]** (DOCTRINE:57), and the vision does not decide retention periods or permanent deletion (VISION:319). Counsel-dependent (D9).

## I3. Consequential rules are enforced by the server and tested against negative cases

**Outcome [R-prov].** "Safety-critical behavior must be enforced server-side and tested against negative cases" (DOCTRINE:79, PROVISIONAL there). "Suspension blocks protected actions immediately" (DOCTRINE:80, PROVISIONAL there).

Independently of its provisional status as doctrine, this is adopted as an **engineering standard [F]** on the evidence of the prototype's failures (`../research/ENGINEERING-LESSONS.md`). As an engineering standard it is Dustin's.

**Proposed mechanisms [F].** Deny by default: an operation with no declared policy cannot be registered. Authorization checked on the object being acted on, not on a parent. A test that enumerates the real operations and fails when one lacks negative cases.

**Open.** Which actions are "protected" for a suspended person. In particular, whether retrieving evidence the suspended person is entitled to hold is blocked (D9). The previous draft's criterion that a suspended account "cannot perform any command" assumed an answer and is withdrawn.

## I4. Safety documentation is never paywalled

**Outcome [R].** "Full access to all consent documentation, all model releases, and the accompanying PDFs" at the free tier, "with no exceptions. Including when the user is working with people who are not on the app at all" (VISION:469). Monetization lives in volume and professional convenience, never in safety (VISION:484).

**Related direction, not ratified.** Reviewing and signing a brief you were invited to is free **[CA]** (COST-REALITY:100). The paid line is initiating presence: "your own profile, cards, boards, briefs" **[CA]** (COST-REALITY:100). The free tier is documents-only, with documents usable "outside the app's system entirely" **[CA]** (COST-REALITY:84). "Safety capabilities are never paywalled" is **[R-prov]** (DOCTRINE:67). A free-tier sketch inside the ratified vision lists "responding to a limited number of moodboards and briefs"; it is headed "CORY — PROPOSED free tier (needs a pass against the app, not final)" (VISION:475-480). Ratification of the vision does not promote a proposal inside it: this is an open proposal, not an [R] rule.

The ratified principle constrains monetization direction; the exact entitlement boundary for particular safety capabilities remains subject to the doctrine's provisional status and D7.

**Proposed mechanisms [F].** None in the first stages; no billing exists. When entitlements exist, the proof is a traced journey: a person with no plan obtains every safety document, including for work with someone who never joins, without performing any act that requires a plan. A code-level import restriction between modules is a useful hygiene rule but does not prove this, and the absence of billing code proves nothing about what will be free.

**Open.** What "initiating" means and whether it is paid; whether a free document can be produced without a paid act; whether invited participation is free without a count limit (D7). The architecture must not make the free-document path depend on creating a collaboration until D7 is answered.

## I5. Compensation is explicit

**Outcome [R].** "Compensation must be explicit; vague 'negotiable' compensation is not an approved product direction" (DOCTRINE:65). The record captures compensation terms (amount, down payment and payment timing) "visible to and signed by both parties" (DOCTRINE:48). There are no user-to-user payments; compensation is documented while money stays outside the product (DOCTRINE:66).

**Proposed mechanisms [F].** Terms with unspecified compensation cannot be presented; the vocabulary contains no "negotiable" value; amounts are numbers with a currency rather than text.

**Open.** The kinds of compensation and how trade is expressed; whether a range is explicit; who pays whom when there are more than two parties; which other terms must be complete before presentation (D1, D4).

## I6. No people directory; personal material is shared deliberately and for a bounded time

**Outcome [R].** There is no people directory and no profile browsing: "a logged-in account grants you nothing to look at" (VISION:426-430; DOCTRINE:72). A person's professional material (comp cards, portfolios) is seen "strictly on request, and temporarily", granted by its owner to a specific person for a bounded window (VISION:434). Related **[R-prov]**: access to sensitive contact, measurement and private media is owner-controlled, scoped, revocable, logged and time-limited; bearer share links require expiry, rotation, revocation and narrow scope (DOCTRINE:74-75).

**Scope.** This invariant governs access to a person's material and personal details. It does **not** govern a party's access to agreement evidence they are entitled to hold; that is I13. The previous wording ("every grant of access has an expiry and is revocable by its owner") read as if it covered both and is withdrawn.

**Proposed mechanisms [F].** No operation lists people. Sharing is by a grant scoped to one item, expiring, and revocable by the owner.

**Open.** What a public piece of work reveals about its poster (VISION:407); the discovery replacement (VISION:447). Neither arises in the first stages.

## I7. The product claims only what it does

**Outcome [R].** Demonstrations and public copy must not imply operational payments, identity verification, legal enforceability, moderation staffing, encryption guarantees or production readiness unless verified (DOCTRINE:93). Login is not verified identity (VISION:317). Signatures document agreement and are not presented as legal instruments (DOCTRINE:59). The product freezes the agreement and does not witness the performance (DOCTRINE:40-42). "The claim has to be true or the claim must not be made" (VISION:499).

**Proposed mechanisms [F].** No simulated capability in a production build. Copy that names signing, identity, age, payment, moderation or safety is reviewed against what the server actually does before it ships.

**Open.** What "verified identity" means for this product is an open seam in the ratified doctrine (DOCTRINE:82). What assurance the product may claim about adulthood before verification exists (D11).

## I8. Identity is the product's own

**Outcome [R].** The external login subject is not carried forward as the product's identity for a person (VISION:46, the SP-008 disposition). Login-method selection is explicitly not doctrine (DOCTRINE:113).

**Proposed mechanisms [F].** An internal identifier owned by the product; external logins recorded as links to it.

**Open.** Whether participation requires an account at all, and what a credential is taken to establish (D3). Whether anyone may act for another person or for an organization (D12). The previous draft's rule that an invitation can be claimed only by an account whose verified email matches the invited address is a security recommendation **[F]**, not an invariant; what should happen with a forwarded or mis-addressed invitation is Cory's (D3). Control of an inbox is evidence of control of an inbox. It is not verified identity, professional authority, or the right to sign for someone else.

## I9. Adults only; youth is separate and deferred

**Outcome [R].** Every account holder is an adult; a minor is never a user (VISION:226; DOCTRINE:86). Adult and youth content are structurally separated (VISION:222-230). The youth path's open sub-decisions require professional legal review, "not an AI or the team" (VISION:463).

**Deferred.** Production launch of any youth path, until doctrine, professional review and validation are complete (DOCTRINE:89, marked DEFERRED there). The vision also ratifies the deferral itself (VISION:463, VISION:531), so the deferral is **[R]**. That does not decide the eventual youth design, mechanics or operating model, which remain unresolved.

**Related direction, not ratified.** Age is verified "never at signup; on the first act of participation", which includes "joining/creating a brief" **[CA]** (CORY-QUESTIONS:184). Adult-only "is a claim that must be enforced via age-gating" before any public upload **[CA]** (CORY-QUESTIONS:195).

**Proposed mechanisms [F].** None for youth in the first stages: no youth path, no guardian path, and no placeholder for either. The previous draft carried a single adult/youth column on shoots and content as a "seam". That is withdrawn: Cory's ratified partition has three age states, classification at creation, and professionals who work in both worlds (VISION:224-243), and one column does not represent it. The partition is designed when Cory and counsel open it.

**Open.** How adulthood is assured in the first slice before a verification provider exists, given the [CA] direction to verify at first participation (D11).

## I10. A signature is bound to the clauses it affirms

**Outcome [R].** "Each party's signature bound to the specific clauses it affirms", "co-located in the delivered document, not a blanket signature on a separate page divorced from the terms" (DOCTRINE:51). Timestamps and the identity or credential used to agree are captured for every signature (DOCTRINE:52). Signatures are load-bearing product behaviour (VISION:251).

**Proposed mechanisms [F].** A stored affirmation that names the clauses it covers, the time, and the credential actually used.

**Open.** The interaction that produces the binding: how many controls, whether a name is typed, when in the flow each party signs, and what request metadata is kept (D4). Ratified doctrine rules out a blanket signature divorced from the terms; it does not prescribe eight controls, a typed name, or a signing moment.

## I11. Evidence establishes what each party actually reviewed and affirmed

**Outcome [R].** The record preserves "the complete brief version, participant-specific terms, compensation, deliverables, usage or release terms where applicable, the agreement checkpoint, timestamps, and the identity or credential used to agree" (DOCTRINE:55), with clause text frozen as "the literal words the person saw and affirmed" (DOCTRINE:46). Each participant reviews the terms relevant to them (VISION:150).

Evidence must therefore show what this party reviewed and affirmed, not merely that they were associated with a broader version of the collaboration.

**Proposed mechanisms [F].** Capture, per party, the content presented to them (clauses, substituted values, the counterparties shown) and bind the affirmation to that capture. A single hash over a whole collaboration version does not by itself establish what any one party saw.

**Open.** What each party is shown (D10) and what structure the agreement has (D2). The schema is not fixed until both are answered.

## I12. Everyone on set has agreed to the terms

**Outcome [R].** Makeup artists, stylists and assistants "must sign off on consent of the terms or they cannot be in the room... if you have not agreed to the terms of the shoot, you are not on set" (VISION:374).

**Proposed mechanisms [F].** None fixed. At minimum the product must not describe a collaboration as agreed while a person it lists as taking part has not agreed to the terms relevant to them.

**Open.** Whether this is one agreement everyone joins or related agreements per party (D2), and how a person added late is handled (D2).

## I13. Each party holds their own evidence

**Outcome [R].** "The final immutable PDF, delivered to all parties, as the portable artifact each participant holds independently" (DOCTRINE:53). What is ratified is that every party receives a portable artifact they hold independently. The sentence's singular "PDF" is ambiguous: it does not establish that one universal document, identical and fully visible to every party, is required. Participants can retrieve the final brief "and the records they are authorized to access" (VISION:154).

Two things are distinguished:

- **Delivery of a portable artifact** to each party at finalization. This is ratified. Once delivered, the party's copy does not depend on the product, their account, or anyone's permission.
- **Continued access inside the product.** Ratified only as access to "records they are authorized to access"; durable retrievability is **[R-prov]** and subject to retention rules (DOCTRINE:57).

**Proposed mechanisms [F].** Deliver the artifact out of the product at finalization. Treat a party's in-product access to their evidence as a durable right attached to having been a party, separate from temporary operational credentials such as invitation links.

**Open.** What each party's artifact contains, and whether there is one canonical artifact with party-specific views, one artifact per party, or one document everyone sees in full (D2a, D10). The singular wording of DOCTRINE:53 is an ambiguity to put to Cory inside those decisions, not evidence for any one answer; DOCTRINE:55 ("participant-specific terms") and VISION:150 ("the terms relevant to them") point the other way. Continued in-product access after suspension, account closure, lost credentials, removal from a collaboration, and retention expiry (D9, D3). The previous draft's promise of retrieval "forever" outran its source and is withdrawn.

---

## What changed from the previous version

| Previous | Now | Why |
|---|---|---|
| Mechanisms (database grants, triggers, storage class, lint rules) sat in the same row and under the same tag as the ratified outcome | Outcome, mechanisms and open questions separated; every mechanism tagged [F] | A mechanism is not doctrine because it implements doctrine |
| "Nine invariants; a tenth replaces one" | No fixed count | The ceiling was arbitrary |
| I4 proof: an import-boundary lint | A traced free-document journey; lint is hygiene only | A module rule does not prove a user can reach a free document |
| I6: every grant expires and is owner-revocable | Scoped to personal material; evidence access is I13 | The old wording conflicted with preservation |
| I8 included the matching-email claim rule | Rule is [F], routed to D3 | It answers a product question about invitations |
| I9 included adult attestation and an audience column | Attestation routed to D11; column withdrawn | Attestation deviates from [CA] direction; one column does not model the partition |
| Clause-bound signatures, per-party evidence, everyone-on-set and party-held artifacts were implied by mechanisms | Stated as I10 to I13 with their sources | They are ratified outcomes in their own right |
