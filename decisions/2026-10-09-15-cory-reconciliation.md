# Cory reconciliation — 2026-10-09 and 2026-10-14/15

Status: DIRECT CORY RULINGS

- These are **direct Cory rulings** from live sessions on **2026-10-09** and **2026-10-14/15**. They answer `CORY-QUESTIONS-2026-10-08.md` (all 18 questions) and `docs/CORY-CATCH-UP.md` (Tiers A, B and C).
- They are **later than** the [2026-10-05 reconciliation](2026-10-05-cory-reconciliation.md). That note is retained unchanged as historical evidence.
- **Where they conflict, these later rulings govern.** Explicit supersessions are marked **SUPERSEDES** in Cory's text and mapped against repository text in the [supersession ledger](#repository-supersession-ledger) below.
- **Recording a ruling here authorizes no implementation.** Only an approved slice PRD may select from these rulings. Existing code is not evidence against them.
- Where Cory rejected a question as malformed, the replacement ruling is recorded rather than an answer in the old frame. Where he left something open, it stays open.
- **Two statements in the session handoff were never Cory rulings.** They are errors in the Claude-generated handoff, not changes of Cory's mind, and are corrected below in [Corrections to the session handoff](#corrections-to-the-session-handoff). They are marked inline where they appear; nothing else in the record changed.

## Corrections to the session handoff

Recorded 2026-10-15 from Cory's direct corrections, supplied by Dustin. These correct **errors in the handoff document**. They are not supersessions: Cory did not change his mind, and the erroneous statements were never his rulings.

### HC1 — There is no version history

> "There is no version history. The only thing that exists is the final contract that everyone green-lit and signed. Earlier states are not retained."

Handoff statements that were **not** Cory rulings:

- A2, row "Change history": "Held in the record, never shown."
- §3 item 2 ("Recording versus showing"): the record holds "every version".

The product model, as corrected:

- There is **one live brief** before signing. It cycles while terms are resolved (Q3).
- **Intermediate states are not retained** as evidence. A declined term disappears, and nothing preserves the fact that it was declined (Q10).
- **Ticks on the live brief are not signatures** (Q12).
- Only after everything is green is there a **signing event**. The resulting **final contract is the evidentiary document**.
- Evidence attaches to that final contract: its fingerprint, each person's affirmation and signature evidence, time, credential, device, and the other metadata Cory directly required (Q17). Exact signing UX and any hash-chain structure are not inferred here.

The participant-facing model and the evidentiary model agree: there is no retained change or version history in either.

### HC2 — No proposer identity

> "'Dropping is only ever done by whoever proposed the declined term' was never my ruling."

Handoff statement that was **not** a Cory ruling: Q9's second sentence, "Dropping is only ever done by whoever proposed the declined term."

The valid Q9 ruling is: **do not record authorship.** The actual flow is:

- a person declines a term;
- that term is gone;
- the other person either continues without it or withdraws.

There is no privileged drop action, no proposer authorization and no proposer identity, and no need to store proposer identity visibly or invisibly. Q4's "the proposer's only moves are drop the declined term and resend, or withdraw" is read through this flow: no term can be added or widened, a declined term is simply gone, and the other person continues or withdraws.

### Consequence — R1 and R2 are withdrawn

The two reconciliation questions this note previously raised (R1, R2) arose only from these handoff errors. **They are withdrawn, not answered: their premises were invalid.** They are no longer Cory questions. Their original text is kept below, marked withdrawn, as provenance.

## How this file is laid out

1. [Cory's rulings, as supplied](#corys-rulings-as-supplied) — preserved verbatim from the session record Dustin supplied. Its own section numbers (§1 to §5) are kept so cross-references inside it still resolve. Nothing in it was edited, improved or normalized, except three inline markers added on 2026-10-15 flagging the handoff errors corrected above.
2. [Repository supersession ledger](#repository-supersession-ledger) — which repository text each supersession replaces.
3. [Reconciliation questions (withdrawn)](#reconciliation-questions-withdrawn) — R1 and R2, withdrawn on 2026-10-15 because both arose from handoff errors.
4. [Cross-cutting doctrine](#cross-cutting-doctrine) — where Cory's §3 rulings are referenced from the decision files.
5. [Where each ruling now lives](#where-each-ruling-now-lives) — routing into `D01` to `D12`.

---

## Cory's rulings, as supplied

> The text below is the session record as Dustin supplied it, unchanged. "Nothing in either repository was modified" was true of the session itself; this repository note was written afterwards to record it. Section references such as "§3" or "§4" refer to sections inside this quoted record.

# Cory's answers — sessions of 2026-10-09 and 2026-10-14/15

**For:** Dustin · **Covers:** `CORY-QUESTIONS-2026-10-08.md` (all 18) and `CORY-CATCH-UP.md` (Tiers A, B, C)

**Status.** Cory answered live across two sessions. Nothing here was inferred. Where he corrected a previous ruling it is marked **SUPERSEDES**. Where a question was malformed it is marked as such rather than answered.

**Nothing in either repository was modified.** No `decisions/` edits, no commits, no PRs.

**Read §4 first if you read nothing else** — it lists things that change what is already recorded or built.

---

## 1. The eighteen questions

**Q1 — joining a project, and what proves it's them.** An account is required, created by **Google or Apple sign-in at the moment of the invitation**. Profile and portfolio sit behind the paywall; doing collaborations does not. **Sign-in is the door, not identity** — verification is separate and happens at first participation. Cory dismissed bots as a non-issue ("nothing to farm here, Instagram is infinitely more lucrative"), but **verification earns its place on ban evasion alone** — it is what makes a removal stick. Timing therefore stays at first participation.

**Q2 — what makes a term required.** **The product decides. A drafter cannot promote their own preferences into required terms.** *"The app exists to protect. It does not exist to solidify somebody's vision."* Bring-red-heels is professional communication, not a term.

Required means **anything protecting physical or emotional safety**, and Cory explicitly reframed compensation and deliverables as safety: *"someone who is not getting compensated for the work they do is in emotional distress — that falls under the same thing."* So the deal is in scope because breaking it harms people.

**Q3 — what happens to the earlier set when terms are resent.** **The whole document always returns intact.** Everything already agreed shows green; the disputed term shows a red X. Nobody re-ticks what they already approved. Same as any form that bounces you back to one missing field with the rest still filled. The form keeps cycling to whoever needs to act until everything is green for everyone.

**Q4 — what counts as escalation, and how long the delay.** **Escalation cannot happen.** After a response, the proposer's only moves are **drop the declined term and resend, or withdraw**. *[2026-10-15: read through Correction HC2 — there is no proposer role or privileged drop action; a declined term is gone and the other person continues or withdraws.]* Nothing can ever be added or widened. **There is no second version that escalates, so there is no delay to build.** → **SUPERSEDES ruling 6.**

**Q5 — more than one agreement between the same pair.** **One agreement per pair, per project.** Dual roles and extra obligations are additional terms inside it, not a second agreement. *"Everybody involved is a part of the brief, and then they are given their respective questions and things that they are required to do."*

**Q6 — who decides a term is about body or money.** **Mis-framed and rejected.** There is no taxonomy. Money is not a category, it is one field: the fee. The rule is **a short fixed list of named terms that always need their own deliberate tick** — the fee, the coverage level, physical contact, the stop rule — set by the product.

**Q7 — can a safety term be dropped or left out.** **No.** And the deeper rule Cory gave here is structural and not currently in the model:

> **The subject of a term controls it. The counterparty can only accept or walk away.**

If she declares "don't touch my hair," the other party cannot decline it. *"That's not a fucking option. No is no."* So terms are not symmetrical: some are **declarations** by the person they concern; others are **requests** about someone else, which that person may decline. Both resolve the same way — the person whose body is involved decides.

**Q8 — who counts as "on site."** **Physical proximity, not role.** In the room, you affirm the safety terms whoever you are. Never present, you sign only what concerns you.

**Q9 — who may drop a term; record who proposed.** **Do not record authorship.** *"By the time everyone's agreed to everything, everyone is accountable for what was said yes to."* Dropping is only ever done by whoever proposed the declined term. *[HANDOFF ERROR — not a Cory ruling; see Correction HC2.]*

**Q10 — is a "no" recorded.** **No.** The whitelist does the work: *"if it's not on the final contract, it's not on the final contract."* Absence is the prohibition; nothing needs preserving.

**Q11 — taking back an affirmation.** **Yes, and further than the question asked:**

> **"You're not allowed to add anything to it, but you are absolutely allowed to take away from it."**

Including on the day, mid-shoot. The agreement can only ever shrink. A term withdrawn before the shoot is simply absent; consent withdrawn during the shoot is recorded as a fact ("stopped early, called by X"), never as a failure.

**Q12 — when the presenter affirms.** **Ticking and signing are two different acts.** Everyone ticks terms until every term is green for every person. **Only then does anyone sign.** Nobody signs a document that can still change. *(Note: the slice named "per-term affirmation evidence" may currently conflate these.)*

**Q13 — the no-means-no acknowledgment.** **A safety term every person affirms individually.** The tagline — *"No is supposed to be an answer to a question, not a response to an action"* — goes on the page and into the core values. The signed acknowledgment stays on every brief. Both, not one.

**It reads differently depending on which side you are on.** For the person protected it is **a list of the tools she has** — your safe word, your guarantee, you can stop anything at any moment — not *"do you understand that no means no?"*, which treats her as someone who might break the rule. For the people bound by it, it is the acknowledgment of the obligation. Same term, two faces.

Exact wording is still Cory's to write.

**Q14 — where logistics live.** **Three layers, not two.** Universal safety (everyone on site, same terms) · **shared logistics** (schedule, call times, location — everyone involved sees it, including each other's slots) · private personal (compensation only). *"Two people work for the same company, other people can't just look up their contracts."* **The shared logistics layer is the call sheet** — and Cory wants it built as a real document the product produces, not a by-product.

**Q15 — applying versus affirming.** **The two start routes have different mechanics:**
- **Posted work: applying is wholesale acceptance.** The terms are fixed. You cannot apply with conditions — the designer is not changing the dress because one applicant wants it changed.
- **Direct send: per-term.** Personal, and she may decline individual items, which are then dropped or it stops.

Governing rule: **what is written and accepted is closed; what is absent is what remains to be settled.**

**Q16 — record group-check versus individual tick.** **No**, and it produced a general rule — see §3, the noise doctrine.

**Q17 — what else is kept with an affirmation.** **Everything.** Document fingerprint, IP, device, chained timestamps. *"Metadata is the whole foundation of cryptocurrency validity — nothing under the sheet is just text on a screen."* Confirms the critical finding from the July security review (hash-chain each signed document; retain the audit trail as long as the document) as a **decided product requirement**, not a security recommendation.

**Q18 — vocabulary.** See §2, B1.

---

## 2. The catch-up packet

### A1 — participation credential
Items 1–4 answered above. The rest:

- **Forwarded invitation: no mechanism needed.** *"That situation wouldn't come up without communication"* — nobody silently forwards a shoot invitation. If someone does, that is theirs to handle. **Humans stay accountable for being humans.**
- **Wrong address: dissolved.** **The link is the invitation; email is only one way to deliver it.** Send the link elsewhere. Nothing is reissued and nothing needs correcting.
- **Coming back / recovery:** the **archive model** (below), with **re-verification of identity** as the fallback. Recovery mechanics are Dustin's technical call, not a product decision.

**The archive (Cory's design).** Records live in an archive reachable by reference number — the airline-ticket pattern. On account closure the final email carries all their reference numbers. No files, no stored links, no dormant accounts. **Claude's amendment, accepted: make the reference long and random so it is the credential itself**, with the surname as a sanity check.

### A2 — what each party sees
| Row | Answer |
|---|---|
| **Counterparties** | **Mutually visible from the start.** *"This is a modeling and photography business, its sole purpose is visual."* Plus the vibe-check argument: you may not like someone and not be able to say why, and hiding that until the end is absurd. **Discovery stays one-directional; identity inside a collaboration is mutual.** |
| **Contact details** | **Only once both sides commit to the job.** Cory named the attack: post a job, collect fifty applicants' details, cancel, cold-call. **Socials are different** — professional presence, visible. Personal phone and email are not. |
| **Exact location** | **Whoever posts is putting themselves out there, so their information is available. The protection is against fishing for everyone else's.** Exposure follows initiative. A **general area** (nearest intersection or station) is available as an option, with the full address later; exact address up front is also fine. Location type is settled before contact; the exact address is a required term locked before signing. |
| **Who has affirmed what** | **A live document.** Both parties watch it fill in green. Not back-and-forth. |
| **Roster** | **Visible to everyone before agreeing** — follows from everyone green-lighting every person present. |
| **Compensation** | **Private. The only private thing.** |
| **Private notes** | **Do not exist** — no DM channel, all dialogue is term-bound. |
| **Concerns raised** | **Not recorded** — see Q10. |
| **Change history** | **Held in the record, never shown.** See noise doctrine. *[HANDOFF ERROR — not a Cory ruling. There is no version history; see Correction HC1.]* |
| **The final record** | **Everything jointly agreed, plus their own payment terms, and nobody else's numbers.** |

### A3 — requiredness
Answered at Q2 and Q6. Plus:

**Deliberately open versus accidentally unfinished: resolved structurally.** *"The only way to leave a section blank on creation is to mark it decide-together — otherwise they cannot complete a shareable project."* **There are no accidental blanks in anything that reaches another person.** This also answers which fields must be complete before presenting: all of them, in one state or the other.

### A4 — applying versus affirming
Answered at Q15.

### A5a — pairwise lifecycle
- **Withdrawal before finality:** yes — Q11.
- **Finality:** **no organizer confirmation step.** All green, then everyone signs. That *is* the final act.
- **Cancellation:** **no new category.** Doesn't show on the day = **DNS**. Cancels after signing = **DNF**. Anyone may cancel; it costs them the DNF, and the signed deposit terms handle the money.
- **Resent terms:** Q3.
- **Date changes:** **a changed date ends the agreement.** Terms carry over so a new one is quick, but everyone re-signs. No extension mechanism, no rolling forward. *"People change dates all the time because they're unprofessional."*

**Roster changes — the final rule, after Cory worked through several versions:**
- **Anyone onboarded can be replaced**, provided the replacement accepts all terms exactly as they stand. Model, photographer, MUA — a different person executing the same agreed terms makes no term untrue.
- **Unless they supply a variable the terms depend on.** A designer's clothes *are* the terms; swap the designer and the wardrobe terms are false. Same for whoever supplies the location or concept.
- **In that case you start again from scratch. Terms are never rewritten.** Cory's reason is a coercion vector: *"if something's totally agreed upon and then they change the designer last minute, it forces people into agreeing to last-minute changes on the same document."* **Terms either survive a change completely intact, or the agreement ends and a new one begins. Nothing in between.**
- **Additions are different from changes.** Adding a person is a new question with a clean no — she declines, they don't come, everything else stands. **Everyone green-lights every decision**, and an MUA joining is a decision.

### A5b — universal omission
**No.** A safety term can never drop off a later version.

### B1 — vocabulary
- **Brief before signing. Contract after.** The thing changes, so the word changes — and before signature it genuinely is not a contract. Satisfies "a name must not promise more than the state delivers."
- **SEO finding:** the search volume lives in the **document names** — model release, photography contract — which are unchanged, so the public pages own those regardless. **"Brief" is uncontested in this space**, so it is cheaper to own than to compete for. *"If brief isn't out there yet, we're also not competing for it."*
- **Research note:** the industry splits brief (creative plan), contract (business terms) and release (likeness). **Nobody merges them — Modeling Standard does, so the merged object has no existing name.** Also: "photo release" is genuinely ambiguous in the field, and this product has both a model release and a photo release as distinct documents.
- **Container: no blanket name.** Things are labelled by what they are — boudoir shoot, fine art shoot, video shoot — drawn from the brief. Nobody ever sees "Project 47." Internal code names do not wait on this.
- **What each person walks away holding: the contract.**
- **Still open:** words for a presented version, a response, and the archived states. **Draft these in context — on a real screen, in a real email — for Cory to react to.** He reacts far better than he generates cold.

### B2 — documents
**The question as posed was rejected** — there is no fixed essential set. *"It's absolutely case by case depending on what's checked during the creation of the brief."*

- **Documents attach automatically from what is checked.** No default bundle. A model release may not even be attached. Redundant paperwork defeats the point.
- **The toolbox stays** — every document available in a list to add manually for anything the triggers miss.
- **Releases are directional and independent.** Her using his image and him using her likeness are two separate grants; granting one never grants the other. *(The clearest thing in this section, and what the industry gets wrong constantly.)*
- **No minor release.**
- **NDAs are real and time-bounded** — shows in preparation, unreleased work, confidential until advertised.
- **The trigger table is a draft Dustin writes and Cory checks against real briefs**, not something to approve in the abstract.

### B3 — preservation and access
- **Account closure:** the archive model (A1). Records outlive the account; reference numbers in the closing email.
- **Suspension: blocks acting, never reading.** *"Of course they still need access to their records, and they don't need an account to do it."* If the suspension is ever contested, the record is exactly what they would need.

### B4 — the witness
**It is the emergency contact**, and that is the right name precisely because it is banal. Every form has one, nobody reads it as an accusation, and its presence tells everyone in the room that **a specific person outside the shoot knows exactly who she is with.** The deterrent is invisible because the field is ordinary. What it attests to: simply that *someone she trusts knows this shoot is happening* — not identity, not presence, not that terms were read.

*(The old brief builder already has an emergency-contact-on-set field. It was always there; it was never understood as doing this job.)*

### B5 — a fourth start route
**No fourth route. Three routes plus shareable links.** A referral — including an agent passing a project to their roster — is just **a shared link**. Whoever receives it applies through the normal route. No special machinery, the creator still never browses anyone, and links are a growth mechanism in their own right.

**The boundary that needs stating explicitly, because this is where someone will try to bend D12: a referrer introduces and nothing more.** No agent ever ticks a term, signs, accepts a fee or agrees to a boundary for talent.

### B6 — voluntarily exceeding a coverage ceiling
**Hard cap. The agreement caps it absolutely, and if anything is done over the contract the entire contract is void** — not just the extra frames.

Cory's reasoning is the important part: *"if that exists, then that opens the door to hearsay"* — she gets coerced, says "I didn't say that," he says "yes she did." **By refusing to record on-the-day agreement at all, there is nothing to argue about.** The all-or-nothing consequence is what gives the ceiling teeth: pushing past it costs you the legitimate work too.

**And it protects the photographer equally.** Cory: *"women are not innocent — there are very malicious humans out there"* who would offer to exceed specifically to create a claim afterwards. With the cap absolute, that setup cannot work, and the rule gives a photographer a clean non-awkward refusal: not *"I don't trust you"* but *"the agreement doesn't cover it, so neither of us is protected."*

*(Precision for the product: Modeling Standard cannot void anything by itself. "Exceeding these terms voids this agreement" is a term both parties sign — that is where its force comes from.)*

### C1 — real use before launch
**Yes, in sequence.** *"This isn't really a subjective app"* — the rules are defined, so alpha and beta are bugs, aesthetics, workflow and UX simplicity, not discovering what the product is. Therefore:

1. **Exhaustive synthetic scenario testing** — every combination worth exercising.
2. **Then real use by Cory's own network**, which doubles as warm-network seeding.

### C2, C3 — counsel
Not answered, correctly. Retention, statutory erasure, and which templates need legal review are not instinct questions.

### C4 — youth
**It is adult.** Cory rejected the question as posed: *"to ask if that's permanent is asking an unanswerable question — can you confidently say anything is a permanent shape of any product before launch?"* The deferred youth path stays deferred, neither removed nor reopened.

**And: zero UI hints.** No placeholders, no "coming soon," nothing greyed out. To a user, a youth path does not exist.

---

## 3. New material with no existing home

**1. The noise doctrine.** *"Information outside of WHAT IS BEING DISCUSSED does nothing but add unnecessary noise."* People see **what** was agreed, never **how** someone went about agreeing.

Cory's reasoning: *"humans are wired for pattern recognition to a literal fault — it's how gambling and lotteries and scammers confuse humans."* Tell her Bob bulk-checked a category and she has no choice but to do something with it, and what she does comes from every experience she has had of people taking the easy way. **The pattern is not in the data. We put it there.**

This is sharper than the no-shame copy rule, which is about tone. This is about **what data exists at all** — gentle wording does not help if the fact itself invites a verdict. It governs: response times, read receipts, revision counts, edit history, opened-and-didn't-reply.

**2. Recording versus showing — two layers that do not conflict.** What people see: only what was agreed. What the record holds: fingerprint, IP, device, chained timestamps, every version. *[HANDOFF ERROR — "every version" is not a Cory ruling. Evidence attaches to the final contract only; see Correction HC1.]* Invisible, and the thing that makes a signature survive being challenged.

**3. The new standard, not the existing one.** Cory rejected "would a real studio do this?" as the design test: ***"the exact problem with the industry is that most of these safety documents are missing on purpose to take advantage of models."*** Copying existing practice would inherit its deliberate omissions.

The studio analogy holds for **the feeling only** — signing professional paperwork should be unremarkable, a customer walking into a business, not a safety intervention. **Borrow the normality. Never borrow the contents.**

**4. Over-protection is itself a harm.** *"If we get too protective, nobody's going to use it... the more 'are you sure you want to do this?', it's going to make people paranoid."* Constant safety prompts do not make someone safer — **they manufacture a fear that was not in the room.**

**5. The app's existence does half the protection.** *"People that are going to be predatorial are just not gonna use it. So we're not trying to make the people who are using it, because they have nothing to fear, feel like they're being witch hunted."* **The filter operates at the door, by the product's reputation, before anyone signs up** — which means the population inside is disproportionately honest, and designing as though everyone inside is a suspect is both wrong and self-defeating.

**6. Pressure creates accountability; flexibility makes people lazy.** The justification for every rigid edge — no escalation, no rewriting, no easy reschedule, no amendment path. **Scope: rigidity applies to changing what you have committed to, never to using the product. Easy to enter, hard to alter.**

**7. Visitor and host.** **Whoever travels to someone else's space may always bring a chaperone — free pass, no permission needed, cannot be declined. Whoever owns the space may not add observers.** The visitor is the exposed party; the host already holds every advantage. Household members (spouse, parent) are **disclosed like anyone else and sign off on their presence, or agree to stay out of the room.**

**8. Nobody is in the room who is not in the agreement. Period.** *"If you want to get your makeup done before you go to the shoot, good for you. But they cannot be in the room if they're not in the agreement."* **Children are excluded by this rule's construction** — a child cannot be a party, therefore cannot be present — so the product never has to say anything about children at all. Cory chose this over an explicit exception.

**9. Minimize third parties, except where a specialist means we hold less.** *"I want as much of this whole process handled by us securely and easily, and only use third party when ABSOLUTELY necessary."* Every vendor is a recurring bill, a dependency, and another party touching protected data. **Payments and identity verification qualify as exceptions** — a verification provider is precisely what lets the platform hold only a boolean and a date, per "none of it belongs to us." Almost nothing else qualifies. The archive lookup needs no third party at all.

**10. Photo shoots and fashion shows are different products.** *"They're two different things, like entirely."* **The first slice is a photo shoot. Nothing in it should be generalised to shows**, and show mechanics are their own body of work for later. A model at a show has no relationship with the other models, which is untrue on a four-person shoot.

**11. Open parameters — handing a term to its subject.** A creator may say *here is the theme, I don't care about the level, what's yours? I'll work within it.* So a term has a third shape beyond accept-or-decline: **"you set this one."** Safer than either, because she declares her own ceiling rather than accepting someone else's.

---

## 4. Supersessions — things that change what is recorded or built

| What changes | From | To |
|---|---|---|
| **Ruling 6 (escalation + mandatory delay)** | escalation is logged and delayed | **Escalation cannot occur.** Only drop-or-withdraw exists. **Do not build the delay.** |
| **The private layer** | "private commercial and craft terms" on the pairwise agreement | **Money is the only private thing.** Craft terms, deliverables and usage move to the shared layer. The pairwise agreement carries the fee and little else. |
| **D04 affirmation** | "every individual field, not sections" (2026-10-09) | **Everything individually affirmed and recorded; bulk-check is a convenience** for ordinary terms; the big four sit outside it. |
| **Replaceability** | "you can never replace a photographer or a model" (earlier in session) | **Anyone onboarded is replaceable if the terms survive intact**; variable-suppliers mean starting again. |
| **Term symmetry** | terms are proposals either party may decline | **The subject of a term controls it.** Not currently in the model — a term must carry *who it is about*. |
| **Ticking vs signing** | S05 "per-term affirmation evidence" reads as if ticking is signing | **Two separate acts.** Nobody signs until every term is green for everyone. |
| **Layers** | two (universal safety, pairwise) | **Three** — universal safety, **shared logistics (the call sheet)**, private money. |
| **Start-route mechanics** | per-term affirmation everywhere | **Posted work is wholesale acceptance. Direct send is per-term.** |

---

## 5. Still open

- **Exact wording** of the no-means-no acknowledgment (Cory's to write).
- **Remaining vocabulary** — presented version, a response, archived states. Draft in context for reaction.
- **The document trigger table** — Dustin drafts, Cory checks against real briefs.
- **Counsel:** retention periods, statutory erasure, which templates need legal review.
- **Fashion show mechanics** — a separate body of work, deliberately not designed by extension from photo shoots.

---

## Repository supersession ledger

Cory's own §4 table above is preserved as he gave it. This ledger maps each supersession onto the **repository text** it replaces, so nobody builds from the older line. The older text is not deleted anywhere; each decision file carries a dated amendment.

| # | Topic | Old repository authority | Superseded by (this note) | Where amended |
|---|---|---|---|---|
| L1 | **Escalation / mandatory delay** | 2026-10-05 ruling 6: escalation requires a neutral record and a mandatory delay before acceptance | Escalation cannot occur. A declined term is gone; the other person continues without it or withdraws (Correction HC2: there is no proposer role). Nothing can be added or widened. **No delay feature is built.** (Q4) | D02 |
| L2 | **Privacy / layer topology** | 2026-10-05 D02 and D10 rulings and ruling 11: two layers — universal safety, and private pairwise "commercial and craft" terms | Three layers: universal safety; **shared logistics (the call sheet)**; **private money**. Money is the only private thing. Craft terms, deliverables and usage move to the shared layer. The pairwise agreement carries the fee and little else. (Q14, A2, §4.) Exact data topology is not decided by this language. | D02, D10, D08 |
| L3 | **Bulk-check interaction** | 2026-10-05 D04: group-check for ordinary terms, with "body and money terms" always individual. Separately, a 2026-10-09 statement that every individual field is acted on individually, not by section | Every term remains individually represented and individually recorded. Ordinary terms may use a bulk/group-check convenience. The product-owned fixed deliberate-tick terms — Cory named the **fee, coverage level, physical contact and stop rule** — stay outside it. The "body/money" framing is rejected: there is no taxonomy (Q6). | D04 |
| L4 | **Replacement** | An earlier statement in the 2026-10-14/15 session: a photographer or model can never be replaced. D02 (f) open | Anyone onboarded may be replaced if the replacement accepts every term exactly as it stands. If the person supplies a variable the terms depend on (wardrobe, location, concept), the agreement ends and a new one begins. Terms are never rewritten. Additions are separate decisions everyone green-lights. (A5a) | D02 |
| L5 | **Term subject / control** | Implicit in the 2026-10-05 response ruling: terms treated as symmetric proposals that either party may decline | **The subject of a term controls it.** The counterparty cannot override or negotiate that person's declaration; the counterparty may accept the resulting terms or walk away. A request concerning another person may be declined by that person. An open parameter may hand the value to its subject to set. (Q7, §3.11) | D04 |
| L6 | **Tick versus signature** | Possible reading of D04/S05 "per-term affirmation evidence" as signing | Ticking and signing are two acts. Everyone ticks until every term is green for every person; only then does anyone sign. Nobody signs a document that can still change. (Q12) | D04, D02 |
| L7 | **Start-route mechanics** | 2026-10-05 open seam: how "applying is acceptance" composes with per-term affirmation; a broad reading that every route uses per-term response | Posted work: applying is wholesale acceptance; no conditional applications. Direct send: per-term. What is written and accepted is closed; what is absent remains to be settled. (Q15) | D02, D04 |

Further repository statements closed or replaced by this note (not supersessions of a Cory ruling, but of open seams or framing):

- **Organizer confirmation (D02 b):** none. All green, then everyone signs. (A5a)
- **Universal omission (catch-up A5b, S04 note):** a safety term can never be dropped or left out of a later version. (Q7, A5b)
- **Duplicate pairs (S02):** one agreement per pair, per project. (Q5)
- **Verification timing (D11):** stays at first participation. (Q1)
- **Fourth start route:** none; three routes plus shareable links. (B5)
- **Voluntarily exceeding a coverage ceiling:** hard cap; exceeding voids the whole agreement through a signed term. (B6)
- **Witness:** the "witness" is the emergency contact, which attests only that someone she trusts knows the shoot is happening. It is not a proxy and not a witness of identity, presence or signing. (B4)
- **Youth permanence:** the question was rejected as posed; the deferred youth path stays deferred, neither removed nor reopened, with zero UI hints. (C4)
- **Fixed essential document set (D08):** rejected as posed; documents attach from what is checked. (B2)

---

## Reconciliation questions (withdrawn)

> **Withdrawn 2026-10-15.** Both questions below arose from handoff errors (Corrections HC1 and HC2), not from Cory's rulings. They are not answered — their premises were invalid — and they are no longer open Cory questions. The original text is kept as provenance only. Nothing may be designed from it.

### R1 — Q10 versus Q17: declined term versus retained versions (WITHDRAWN — premise was handoff error HC1)

Cory said:

- a "no" is **not recorded**: "if it's not on the final contract, it's not on the final contract" (Q10; A2 "Concerns raised");
- **everything** is kept with an affirmation, and every version is held in the record, never shown (Q17; A2 "Change history"; §3.2).

A prior presented version that contained a term later dropped may itself reveal what was declined. Not decided here:

- whether the dropped term remains in the evidentiary version history;
- whether the evidentiary record stores only successive positive whitelists;
- or whether some other representation is intended.

Both rulings stand as recorded. This exact interaction needs Cory's clarification.

### R2 — Q9 versus proposer enforcement (WITHDRAWN — premise was handoff error HC2)

Cory said:

- **do not record authorship** of terms (Q9);
- dropping is only ever done by **whoever proposed the declined term** (Q9).

Enforcing "only the proposer may drop" appears to require knowing who proposed. Separately, evidence metadata Cory requires (IP, device — Q17) may identify the actor even if authorship is never a participant-facing field.

"Do not record" is **not** reinterpreted here as "do not display". Cory is asked to distinguish, if he intends a distinction:

- not stored at all;
- stored only as invisible evidence;
- stored operationally but not shown to participants.

Until clarified, proposer authorization is not designed.

---

## Cross-cutting doctrine

Cory's §3 rulings apply across decisions. They are recorded once, above, and referenced from the decision files rather than copied into a new numbered decision.

| Doctrine (Cory §3) | Governs | Referenced from |
|---|---|---|
| 1. Noise doctrine — people see what was agreed, never how someone went about agreeing | Participant-facing information: response times, read receipts, revision counts, edit history, opened-and-didn't-reply, whether someone used a group-check | D10, D04 |
| 2. Recording versus showing | Participant experience minimizes process data; evidence attaches to the final contract — fingerprint, each person's affirmation and signature evidence, time, credential, device. No version history is kept (Correction HC1; "every version" was a handoff error) | D04, D10, D09 |
| 3. The new standard, not the existing one | Industry omissions are not a design authority. Borrow the normality, never the contents | D08, D04 |
| 4. Over-protection is itself a harm | No manufactured fear through constant safety prompts | D04, D10 |
| 5. The app's existence does half the protection | Users inside are not presumptive suspects. This is product direction, not a security guarantee | D10, D11 |
| 6. Pressure creates accountability | Easy to enter, hard to alter. Rigidity governs changing committed terms, never using the product | D02 |
| 7. Visitor and host | A visitor may always bring a chaperone; a host may not add observers; household members are disclosed and sign off or stay out | D12 |
| 8. Nobody is in the room who is not in the agreement | Presence; children excluded by construction | D12, D02 |
| 9. Minimize third parties | Only where a specialist means Modeling Standard holds less. Payments and identity verification qualify. No provider is chosen here | D11, D09 |
| 10. Photo shoots and fashion shows are different products | The first slice is a photo shoot; nothing here generalizes to shows | All |
| 11. Open parameters | A third term shape: "you set this one" | D04 |

---

## Where each ruling now lives

| Cory item | Primary decision file | Cross-reference |
|---|---|---|
| Q1 account, sign-in, verification timing | D03, D11 | — |
| Q1 profile/portfolio behind paywall | D07 | — |
| Q2 requiredness | D04 | — |
| Q3 whole document returns on resend | D02 | — |
| Q4 escalation impossible | D02 | — |
| Q5 one agreement per pair, per project | D02 | — |
| Q6 fixed deliberate-tick list | D04 | — |
| Q7 safety terms cannot drop; subject controls | D04, D02 | — |
| Q8 "on site" is physical proximity | D02 | D10, D12 |
| Q9 do not record authorship | D02 | HC2 (handoff error corrected) |
| Q10 a "no" is not recorded | D02, D10 | HC1 |
| Q11 take away, never add; mid-shoot withdrawal | D02 | — |
| Q12 tick versus sign | D04 | D02 |
| Q13 no-means-no acknowledgment | D04 | — |
| Q14 three layers; call sheet | D10, D08 | D02 |
| Q15 route-specific acceptance | D02 | D04 |
| Q16 group-check not recorded/shown | D10 | D04 |
| Q17 evidence metadata, attached to the final contract | D04 | D09, HC1 |
| Q18 / B1 vocabulary | D05 | — |
| A1 credential, archive | D03 | D09 |
| A2 visibility | D10 | — |
| A3 decide-together; no accidental blanks | D04 | — |
| A5a lifecycle, replacement, date change | D02 | — |
| A5b universal omission | D02, D04 | — |
| B2 documents | D08 | — |
| B3 closure and suspension | D09 | D03 |
| B4 emergency contact | D12 | — |
| B5 three routes plus links; referrer | D07, D12 | D03 |
| B6 coverage hard cap | D04 | D02 |
| C1 real use | D06 | — |
| C2, C3 counsel | D09, D08 | — |
| C4 youth | D12 | D11 |
