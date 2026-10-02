# Deliverable H. Cory decision packet

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Not implementation authority.

Twelve decisions. They are Cory's. Nothing in the first collaboration slice is built on an unanswered one: the previous version of this packet said engineering could "start with the preferred answers; rewrite if Cory differs", and that instruction is withdrawn. Where Fable has a lean it is marked **[F] lean**, it is a recommendation to Cory, and nothing is built from it.

Each decision says what is being decided, what Cory has already settled (with the provenance tag), the questions, and what the answer unblocks. Tags and citations are explained in `README.md`.

If a question is easier to answer by seeing it, say so. Fable can illustrate the options side by side. An illustration is not a build and decides nothing.

## How to answer this packet

**Start with D1.** One real collaboration walked through in Cory's words answers a large share of D2, D4 and D10 on its own, because most of their questions can be asked of that one shoot: who saw what, what changed, who had to agree again.

| # | Decision | What it unblocks | Needed for |
|---|---|---|---|
| D1 | First scenario, walked through | Stage 1 scope and the obligations model | Any Stage 1 work |
| D12 | Who may act, and for whom | Participant identity and signature attribution | Any Stage 1 work |
| D2 | Agreement topology and lifecycle | State transitions, what "agreed" means, evidence selection | Response and finalization work |
| D10 | What each party sees | Every presentation, notification and record view | Presentation and artifact work |
| D4 | Terms and affirmation | Terms content, validation, signing, record contents | Terms and signing work |
| D3 | Participation credential | Invitation, sign-in and retrieval journeys | Invitation and participation work |
| D11 | Adult assurance | Adult participation and what the product may claim | Participation work; real use |
| D5 | Vocabulary | Final screens, emails and artifacts | Anything a person outside the team sees |
| D7 | Initiation and the paywall | Access rules, commercial claims, the free-document path | Before any screen calls creating free or paid; before document design |
| D6 | Real use and launch shape | Whether real collaborations may run before the public launch | Real use |
| D8 | Documents | Which releases a scenario needs; templates | Real use where a release is triggered; document design |
| D9 | Preservation and evidence access | Retention, closure, suspension, recovery | In-product record access after account changes; real use. Counsel-dependent |

The stage 0 engineering foundation needs none of these (Deliverable G).

---

## D1. The first scenario, walked through

**Decide.** Which one collaboration the first slice is built for, described from first contact to delivered images.

**Already settled.** Nothing. Which journey leads has been an open question since July (CORY-QUESTIONS:54; VISION:156). The only real brief on file is an event organizer's email to a photographer.

**The walkthrough.** For one collaboration Cory has run or is about to run:

- Who organizes it?
- Who takes part, including crew and anyone who is not on set (a client, a brand)?
- Who pays? Who receives payment?
- Who delivers what? Who receives the deliverables?
- Who grants usage rights? Who receives them?
- Which documents are actually needed (a model release, a photo release, anything else)?
- What changed between the first conversation and the day, and who needed to know?
- Is there anything one person agreed with another that the rest should not see?

**Unblocks.** The scope of Stage 1 and the obligations it has to express, not only its copy. The previous version said this answer "does not change the data model"; that was wrong. A scenario with a client who pays and receives usage rights has different parties and obligations from a two-person trade.

**Removed from the previous version.** The statement that trade work is the lowest legal exposure. A trade or portfolio collaboration still creates usage rights and can still trigger a release (DOCTRINE:50); it is not exempt from D8 or D11. Also removed: the assumption that both a paid and a trade preset ship.

**[F] lean.** Choose the scenario Cory will really run soonest. If it has two people, several questions in D2 and D10 do not block the first slice and return when a third person is added. The model treats the parties as a set either way.

---

## D2. Agreement topology and lifecycle

**Decide.** What the agreement is when more than two people are involved, when it becomes final, and what happens when something changes.

**Already settled.** Everyone on set has agreed to the terms or they are not on set **[R]** (VISION:374). Each participant reviews the terms relevant to them **[R]** (VISION:150). Participants review the same relevant information rather than disconnected versions **[R]** (VISION:137). Material changes return to the people whose understanding or response may be affected **[R]** (VISION:152). The confirmation model and exact workflow are explicitly open in the ratified documents (VISION:156; DOCTRINE:104). Cory's July model of notes bound to terms and per-term counters that converge, with the exchange kept as consent evidence, is **[CA]** (CORY-QUESTIONS:157).

**Questions.**

(a) **Structure.** With several parties, is it:
- one collective agreement that every party joins;
- common terms everyone accepts, plus separate agreements between the parties each obligation concerns;
- several agreements under one collaboration, each agreed by its own parties;
- something else?

The ratified text does not choose. The doctrine speaks of "the final immutable PDF, delivered to all parties" (DOCTRINE:53) and of compensation "signed by both parties" (DOCTRINE:48); the vision speaks of terms "relevant to them" and the doctrine of "participant-specific terms" (DOCTRINE:55). The singular "PDF" is ambiguous wording written before anyone considered more than two parties; it is not taken as a decision for one shared document (see D10). The practical difference: under one collective agreement a makeup artist who has not yet responded holds up the photographer and model; under related agreements each is final on its own, and what "everyone on set has agreed" means has to be said separately.

(b) **When it is final.** When the last required person agrees, or only after a confirming step by the person who organized it? Organizer confirmation was in the prototype and appears in a doctrine journey that is marked provisional (DOCTRINE:96-104). It is not ratified, and the question was already parked (CORY-QUESTIONS:55).

(c) **Responses.** Accept, decline, or raise a concern on a named term; or the July model of per-term counter-proposals **[CA]**. If the simpler form comes first, is that acceptable as a first step?

(d) **Withdrawal.** May someone withdraw their agreement before it is final?

(e) **Cancellation.** Can a finalized collaboration be cancelled, by whom, and what does the record say afterwards?

(f) **Roster changes.** Someone is added or removed after others have agreed. Who must agree again? Is the removed person still shown on the earlier agreement?

(g) **Amendments and re-acceptance.** After a change, who must review again: everyone, or only the people the change affects? If only those affected, who decides which those are?

(h) **The earlier agreement while a change is pending.** Does it stay in force until the replacement is agreed, or is nothing in force in between?

**Unblocks.** State transitions and what the evidence selects as "the agreement". With a two-person first scenario, (a) and (f) can wait for the slice that adds a third person; (b), (c) and (d) cannot. (e) blocks cancellation work only, and (g) and (h) block amendment work only; neither is offered until answered.

**No lean on (a).** It is a product and possibly a legal question, and the evidence points both ways.

---

## D3. Participation credential

**Decide.** What a person needs in order to read, to sign, and to come back later.

**Already settled.** Login is not verified identity **[R]** (VISION:317). The record captures the identity or credential used to agree **[R]** (DOCTRINE:52). Login-method selection is not doctrine (DOCTRINE:113). Cory's signup feel, "I'd almost not know I signed up", is **[CA]** (FEATURE-REVIEW:74); it was said about signing up from a request on a link page, not about responding to a brief.

**Questions.**
- Is an account required to read the terms? To sign them? At all?
- Is a link or one-time code sent to the invited address enough to take part?
- An invitation is forwarded, or opened by someone other than the person named. What should happen?
- The invitation went to the wrong address, or the person wants to use a different one. How is that corrected, and does it need the organizer?
- Someone loses access to their email or account. How do they recover?
- If a person took part with a link or code only, how do they get back to their record after that link has expired?

**Unblocks.** Invitation, sign-in and durable retrieval journeys. The last question connects to D9.

**[F] note.** Requiring an account and sending a one-time code prove the same thing at the moment of signing: control of the invited inbox. Neither proves who the person is. The difference is afterwards: an account gives a durable place to return to. Whatever is chosen, the party's delivered copy of the artifact (I13) does not depend on it.

---

## D4. Terms and affirmation

**Decide.** What must be in the terms for the first scenario, in what words, and what signing looks like.

**Already settled.** The record captures boundary values (nudity level, physical contact, every boundary toggle), compensation (amount, down payment, timing), deliverables and delivery timing, and usage rights **[R]** (DOCTRINE:47-50). Clause text is frozen as presented **[R]** (DOCTRINE:46). Each signature is bound to the specific clauses it affirms, co-located with them, not a blanket signature divorced from the terms **[R]** (DOCTRINE:51). Compensation is explicit; "negotiable" is not acceptable **[R]** (DOCTRINE:65). What further evidence to keep (document hash, IP or device data, witnesses, revocation history) was parked in July (CORY-QUESTIONS:61).

**Questions.**
- Which terms must be complete before terms can be presented, for the scenario in D1?
- Is there clause language Cory wants used verbatim (for example the boundary clause the doctrine quotes)?
- How is compensation represented: what kinds exist, how is trade written, is a range "explicit"?
- Who pays whom, and who delivers to whom, when the payer is not the person who set the collaboration up?
- What is the act of signing: one confirmation per clause or section, a typed name, a drawn signature, something else?
- When does each party sign: the person presenting terms at the moment they present, or everyone at the same step?
- What may be recorded with a signature beyond time and credential (IP address, device)?

**Unblocks.** Terms content, validation, signing and record contents.

**Not doctrine.** Eight term blocks, eight controls, a typed legal name and the organizer signing at the moment of presenting were Fable's proposals. Ratified doctrine requires clause-bound signatures; it does not prescribe those.

---

## D5. Vocabulary

**Decide.** The words people see for: the collaboration container; the terms as presented; a participant's response; the finalized agreement; the artifact each party holds; and the statuses for archived and completed.

**Already settled.** The product name and "guardian manager" **[R]**. The ratified documents use "brief" for the terms document throughout.

**Constraint.** A name must not promise more than the state delivers (I7). "Agreed", "final", "signed" and "verified" each claim something.

**Unblocks.** Final screens, emails and artifacts. Internal code names are not product vocabulary and do not wait for this.

---

## D6. Real use and launch shape

**Decide.** Whether real collaborations may run on the product before the public launch, and on what conditions.

**Already settled.** "A rollout that is too slow kills the trust... The launch must arrive substantially whole" **[R]** (VISION:409-411).

**Questions.**
- Does "arrive substantially whole" apply to the public launch only, so that private use by Cory's own network before then is acceptable?
- If private real use is acceptable: for which scenario, with which people, and what must be true first? The candidate prerequisites are in Deliverable F (releases where triggered, adult assurance, truthful identity claims, record access and recovery, retention, legal review where flagged).

**Unblocks.** Gate 2. Nothing in this packet treats a working demonstration as permission for real use.

---

## D7. Initiation and the paywall

**Decide.** What is free, what is paid, and where exactly the line falls. Not prices.

**Already settled.** All consent documentation, model releases and their PDFs are free, with no exceptions, including when working with people who are not on the app **[R]** (VISION:469). Monetization is in volume and professional convenience, never in safety **[R]** (VISION:484). Cory's cost-discipline addendum says "the professional dashboard is definitively not free tier" (VISION:493); it sits in a monetization answer the vision marks "PARTIALLY ANSWERED" (VISION:484), and the vision keeps tiers and entitlements open (VISION:20, VISION:530), so it is direction for D7, not a ratified tier rule. Reviewing and signing a brief you were invited to is free **[CA]** (COST-REALITY:100). The paid line is initiating presence: "your own profile, cards, boards, briefs" **[CA]** (COST-REALITY:100). The free tier is documents-only, with documents usable "outside the app's system entirely" **[CA]** (COST-REALITY:84). Pricing and tiers are marked DEFERRED in doctrine (DOCTRINE:68).

These do not add up to "everything safety-related is free, therefore creating a collaboration is free". Cory's July direction points the other way on initiation. The boundary is open.

**Questions.**
- What does "initiate" mean? Creating a draft; inviting another person; presenting terms; finalizing an agreement; or another act?
- Is that act paid?
- Can a person with no plan produce a free consent document or release for a shoot with someone who is not on the app, without initiating a collaboration? If documents exist only inside a collaboration and starting one is paid, the free documents are paywalled indirectly.
- Is invited participation free without a limit on how many invitations a person may respond to? A free-tier sketch inside the ratified vision lists "responding to a limited number of moodboards and briefs" (VISION:479), under a heading that marks it "PROPOSED... not final" (VISION:475). It is a proposal, not a ratified rule. The later July ruling says invitee participation is free **[CA]**.

**Unblocks.** Product access rules, any commercial claim, and whether documents can exist outside a collaboration. Billing is not built in the first stages either way, and the absence of billing is not evidence that initiation is free.

---

## D8. Documents

**Decide.** Which documents the first scenario needs, and which templates must exist before real use.

**Already settled.** Usage rights trigger release documents: "commercial use pulls the model release / photo release / usage license into the final package"; these are existing standard documents the product assembles and captures, it does not invent them **[R]** (DOCTRINE:50). Safety documents are priority one **[R]** (VISION:413-414). Legal language, enforceability and counsel adoption are marked DEFERRED in doctrine (DOCTRINE:60). Which templates are essential was parked in July (CORY-QUESTIONS:99).

**Questions.**
- For the D1 scenario, which usage terms trigger which documents?
- Which templates are essential before any real use?
- Which of them need professional legal review first?
- Can a document be produced on its own, for a shoot with someone not on the app (see D7)?

**Unblocks.** Real use wherever the scenario triggers a release; the design of documents. If the chosen scenario triggers a release, that release is part of the real-use gate, not a later stage.

---

## D9. Preservation and evidence access

**Decide.** How long evidence is kept, and who can reach it when circumstances change. Counsel-dependent.

**Already settled.** Consent-bearing records are append-only; removal means archive, not destruction; records of agreement outlive account deletion **[R]** (DOCTRINE:56). The durable evidence package should be retrievable "subject to approved privacy and retention rules" **[R-prov]** (DOCTRINE:57). Retention periods and permanent deletion rules are not decided (VISION:319). Suspension blocks protected actions immediately **[R-prov]** (DOCTRINE:80).

**Questions.**
- How long is a record kept? Is it ever purged, and at whose request?
- A party closes their account. What is kept, what is deleted, and can they still reach their record?
- A party loses their credentials. How do they get their record back?
- A party is suspended. Can they still retrieve evidence they are entitled to hold?
- A participant was removed from a collaboration after an earlier agreement. Do they keep access to that earlier record?
- A person deletes their profile or other operational data but keeps their account. Is anything in their records affected?
- Who keeps historical access, and what is each told?

**Unblocks.** Real-data lifecycle and any retrieval promise. Until answered, the build has no purge path **[F]** and makes no promise about how long in-product access lasts. Each party's delivered copy of the artifact is theirs regardless.

---

## D10. What each party sees

**Decide.** For each kind of information, who sees it and when.

**Already settled.** Each participant reviews the terms relevant to them **[R]** (VISION:150). Contact details are exchanged only on mutual acceptance **[CA]** (CORY-QUESTIONS:157). Exact address is revealed after acceptance **[CA]** (CORY-QUESTIONS:161).

**The grid.** For each row, who sees it at each point: everyone, only the parties it concerns, only the organizer, or nobody.

| Information | Before agreeing | During review | After it is final | In the artifact |
|---|---|---|---|---|
| Who else is taking part (roster) | | | | |
| Who this person is agreeing with (counterparties) | | | | |
| Each person's compensation | | | | |
| Contact details | | | | |
| Exact location | | | | |
| Private notes | | | | |
| Concerns raised | | | | |
| Who has signed | | | | |
| Usage terms | | | | |
| What changed between versions | | | | |
| The final record | | | | |

Two more:

- What does the person who organized the collaboration see that others do not?
- **The final artifact.** Doctrine requires a portable artifact delivered to every party (DOCTRINE:53). With several parties, should there be one canonical agreement record with a view for each party showing what that party is entitled to see; a separate artifact per party; or one document every party sees in full? The doctrine's singular "the final immutable PDF" does not settle this. The answer depends on D2a as well as this grid.

**Unblocks.** Every presentation, notification, export and record view, and the evidence of what each party was shown (I11). With two parties most rows collapse, but contact details and location before agreement still need an answer.

---

## D11. Adult assurance

**Decide.** How the product is assured a participant is an adult in the first slice, before a verification provider exists, and what it may say about that.

**Already settled.** Every account holder is an adult **[R]** (VISION:226). Age is verified "never at signup; on the first act of participation", which includes joining or creating a brief **[CA]** (CORY-QUESTIONS:184). Adult-only "is a claim that must be enforced via age-gating" before any public upload **[CA]** (CORY-QUESTIONS:195). The product claims only what it does **[R]** (DOCTRINE:93).

**Questions.**
- Is a recorded self-attestation acceptable for a synthetic demonstration? For real private use?
- If attestation is used, it departs from the July direction to verify at first participation. Does Cory approve that departure, and until when?
- What may product copy say? Under attestation it can say only that the person stated they are an adult.

**Unblocks.** Adult participation and truthful assurance claims.

**For information.** The first stages are adult-only and contain no youth path, no guardian path, and no placeholder for either. The partition is designed when Cory and counsel open it (I9).

---

## D12. Who may act, and for whom

**Decide.** Whether everyone in the first slice acts only for themselves.

**Already settled.** Nothing for the adult side. Guardian-managed profiles for minors are ratified **[R]** (DOCTRINE:86), and any youth launch is marked DEFERRED in doctrine (DOCTRINE:89). Agents and agencies appear in July tier thinking **[CA]** (CORY-QUESTIONS:163).

**Questions.**
- In the D1 scenario, does every person sign only for themselves?
- If a client, brand, agency or company is involved, who signs for it, and what establishes that they may?
- May anyone commit another person?

**Unblocks.** Participant identity and what a signature is attributed to. Authority is never inferred from controlling an account or an inbox.

**[F] lean.** For the first slice, adults acting for themselves only, with organizations and representatives added when designed. This is a proposed constraint that needs Cory's approval; if the D1 scenario includes someone who signs for another party, it does not apply.

---

## Not in this packet

Technology and vendor choices (Dustin's). Prices and tier contents (deferred doctrine). Referral mechanics (parked). Moderation staffing. Discovery mechanics. Youth image hosting (counsel). Landing page copy.

Decisions needed later and not asked now: whether a public link page exists at all (VISION:445 leaves it open; the July "My Standard" decision is **[CA]**); role-specific profile contents; the on-set check-in idea from the July feature review.

## What changed from the previous version

- "Start with the preferred answers" removed. No decision has a build default.
- D1 now drives Stage 1 scope and obligations, not only copy. The claim that trade work is lowest-risk is removed.
- D2 adds agreement topology, cancellation, roster changes and the status of an earlier agreement while a change is pending.
- D3 adds forwarded and mis-addressed invitations, recovery, and retrieval after a link expires.
- D4 adds payer and payee, deliverer and recipient, and signing timing; eight blocks and typed names are labelled as proposals.
- D7 asks what "initiate" means and whether free documents can be reached without it.
- D9 adds suspension, lost credentials and removed participants.
- D10 is a grid over information kinds and moments.
- D11 states that attestation departs from July direction.
- D12 is new: who may act, and for whom.
- "Preferred framing" sections are reduced to a few labelled leans.
