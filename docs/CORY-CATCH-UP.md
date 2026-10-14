# Cory catch-up: Stage 1 as of October 2026

> **This document summarizes and routes to the active decision files. It does not itself ratify or amend product semantics.**
> If anything here disagrees with a file in [`decisions/`](../decisions/README.md), the decision file is right and this document is wrong.

**For Cory.** Read sections 1 to 3 in about ten minutes. They cover what exists, what you have already decided, and what is still yours. Sections 4 to 7 are your homework, ordered by how much each answer unblocks. If you only have twenty minutes, go straight to [section 10](#10-if-cory-only-has-20-minutes).

**For Dustin and agents.** This is a navigator. It points at the decision files, slice PRDs and engineering notes; it never replaces them. Questions here are posed, not answered: nothing in this packet suggests which answer is better.

Contents:
1. [Five-minute orientation](#1-five-minute-orientation)
2. [Built versus decided](#2-built-versus-decided)
3. [What Cory has already decided](#3-what-cory-has-already-decided)
4. [How the homework is organized](#4-how-the-homework-is-organized)
5. [Tier A: answer next](#5-tier-a-answer-next)
6. [Tier B: answer soon](#6-tier-b-answer-soon)
7. [Tier C: later, counsel, launch](#7-tier-c-later-counsel-launch)
8. [Demo walkthrough](#8-demo-walkthrough)
9. [Build queue unlocked by answers](#9-build-queue-unlocked-by-answers)
10. [If Cory only has 20 minutes](#10-if-cory-only-has-20-minutes)
11. [Full homework checklist](#11-full-homework-checklist)
12. [Points we noticed and did not resolve](#12-points-we-noticed-and-did-not-resolve)

---

## 1. Five-minute orientation

### What exists today

The team has built the record-keeping core that your decisions so far allow, and a demonstration that shows it with invented people. In plain terms:

- **A project.** The container for one collaboration. Whoever creates it is recorded only as the creator: not as photographer, payer or anyone's representative (your D01 ruling).
- **Project-local parties.** A project can hold parties. Today a party is only an identifier inside one project. It is not linked to any person, account or email address.
- **Private pairwise agreements.** An agreement relates exactly two parties of one project. Separate pairwise agreements can sit under one project, and an unrelated participant does not hold up another pair's agreement (your D02 ruling).
- **Two layers of terms.** Shared safety and consent terms are stored on the project. Private commercial and craft terms are stored on a pairwise agreement. Each term is its own row of text.
- **Frozen presented versions.** A chosen set of terms, in a chosen order, can be frozen as a version. Once frozen, nothing in it can be changed, and a later version never alters an earlier one.
- **Per-term affirmation evidence.** The database can hold one row per party per presented term, stamped with the database's own clock.
- **Evidence protections.** The application's database role can only add and read these records, never change or delete them. Timestamps cannot be supplied by the caller. Several rules (which party may appear on which row, which version can take rows) are enforced by the database itself, not just by code.
- **A synthetic demo** that shows all of this in a browser, with invented records and an operator who stands for nobody.
- **A portable snapshot.** One file you can open on a phone or laptop, read-only and offline.
- **A simulator** inside the demo. It lets the team step through presenting terms, dropping a term and resending, and recording affirmation rows. Every simulated act is labelled as a simulation.
- **Automated checks** on every change, including a real-browser run of the whole demo.

### What does not exist

None of the above is a working product flow yet. Specifically, there is:

- no real participant identity;
- no invitation of any kind;
- no way for a real person to log in or act as a party;
- no production workflow for writing or presenting terms;
- no real signing journey;
- no view of the collaboration from any party's point of view;
- no calculation of whether an agreement is final;
- no finalized artifact, document or PDF;
- no permission for real collaborations to run on it.

The demo uses invented people and synthetic acts. When the demo records an "affirmation", the demo operator is creating a stored row naming a party. No person has affirmed anything. In the product, only a party may affirm for itself (your D12 ruling), and how a real person does that is still open (D03).

---

## 2. Built versus decided

Two rules to keep in mind while reading this table:

- **BUILT ≠ DECIDED.** Something stored by the database is a mechanism, not a product decision. Existing code is never evidence that a product question is answered ([CLAUDE.md](../CLAUDE.md)).
- **DECIDED ≠ IMPLEMENTED.** Several of your rulings have no code yet, and some cannot have code until a neighbouring question is answered.

| Area | Built mechanically? | Cory decided product semantics? | Notes |
|---|---|---|---|
| Projects | Yes (S01) | Yes, the container and creator neutrality (D01) | Production has no way to know who is calling, so no real person can create one yet. |
| Parties | Yes, as bare identifiers (S01) | Who takes part in the first scenario: yes (D01). How a person becomes a party: no (D03) | A party is not linked to a person, account or address. |
| Pairwise agreements | Yes, topology only (S02) | Structure: yes (D02) | Who may create an agreement is open. Whether the same two parties may have more than one agreement is undecided. |
| Universal safety layer | Storage yes (S03) | Shared by and affirmed by everyone on site: yes (D02, D10) | Who counts as "on site" is open. |
| Pairwise commercial/craft layer | Storage yes (S03) | Private to the named parties: yes (D02, D10) | |
| Terms | Yes, as individual rows of opaque text (S03) | Each term individually represented: yes (D04) | Required term set, wording and compensation representation are open (D04). |
| Term requiredness | **No**, deliberately | **No** (D04) | Nothing stores whether a term is required. |
| Body/money classification | **No**, deliberately | Partly: body and money terms always need their own deliberate affirmation (D04). Which terms they are: no | |
| Presented versions | Yes, sealed and frozen (S04) | Clause text frozen as presented: ratified doctrine | "Presented" means frozen. No recipient, viewing or delivery is recorded. |
| Drop-and-resend | Yes, for pairwise agreements, as a later version without the term (S04) | Yes, pairwise (D02) | Storage cannot record affirmations on a resent version yet: how a later version is affirmed is open (D02). |
| Universal omission | Storage can freeze a later universal version with a different term set | **No** | Whether a shared safety or consent term may be left out is yours to decide (A5). |
| Affirmation | Yes, per-term evidence rows (S05) | Per-term unit, and body/money individually: yes (D04) | Only a sole version 1 can take rows today. No credential is recorded. No production path writes rows. The ordinary-term group-check convenience is not built. |
| Real signer identity | **No** | No proxies (D12) and real verification required (D11): yes. How a person is bound to a party: no (D03) | |
| Finality | **No** | Partly: the necessary condition is settled. An agreement cannot be final until every named party has affirmed every required term (D02). Whether any additional confirmation step exists remains unresolved under D02 (b) | Even the necessary condition cannot be checked until requiredness is decided. |
| Visibility | **No** party views | Partly (D10) | The demo shows the whole stored record and says so. It is not any party's view. |
| Invitations | **No** | **No** (D03) | |
| Artifacts | **No** | Photo release needed for the first scenario: yes (D08). Artifact contents and shape: no (D10, D08) | |
| Preservation/retrieval | Append-only storage yes. Retrieval and retention no | Removal needs a reason and all-party approval: yes (D09). The rest: no, and partly counsel | |
| Real use | Not permitted | **No** (D06) | A working synthetic demo is not permission for real use. |
| Free tier and capacity | No billing exists | Yes: free tier completes the full loop; monetize capacity, never completion (D07) | |
| Witness | **No** | Partly: you described witness signatures as potentially useful and optional (ruling 10, D12). Their scope and evidentiary meaning remain open | |
| "No means no" acknowledgment | **No** | Yes: value stated publicly, signed acknowledgment on every brief (ruling 14) | |

---

## 3. What Cory has already decided

You do not need to answer these again. Each line links to its decision file, which holds your exact words. These are summaries only.

**[D01: first scenario](../decisions/D01-first-scenario.md)** (DECIDED)
- Two adults who already know each other. The model created the project from her own concept and sent it directly to a photographer she knew. No money. Coverage, touch and wardrobe adjustments were discussed. He shot, edited and delivered. A possible album-cover use by the model was discussed.
- Posting versus direct send is distribution, not a different product.
- Creator is role-neutral: not photographer, payer, concept author or obligation holder.

**[D02: topology and lifecycle](../decisions/D02-agreement-topology-lifecycle.md)** (OPEN, settled pieces)
- Commercial and craft agreements are private and pairwise under the project.
- Safety and consent terms are universal: shared by and affirmed by everyone on site.
- An unrelated participant does not hold up another pair's agreement.
- For an agreement, "all parties" means the parties named in it.
- An agreement cannot be final until every named party has affirmed every required term.
- No counters. If a term is not accepted, the proposer may drop it and resend, or withdraw the proposal.
- **Still open:** whether finality needs any additional confirmation step beyond those affirmations (D02 (b); see [section 12](#12-points-we-noticed-and-did-not-resolve)), a party withdrawing their own agreement before finality, cancellation, roster changes, amendments and re-acceptance, and the earlier agreement while a replacement is pending.

**[D04: terms and affirmation](../decisions/D04-terms-and-affirmation.md)** (OPEN, settled piece)
- Every term is individually represented and is the unit of the record.
- Ordinary terms may offer a tightly labelled group-check convenience; the terms underneath stay individual.
- Body and money terms are never covered by that convenience. Each needs its own deliberate affirmation.

**[D07: initiation and paywall](../decisions/D07-initiation-and-paywall.md)** (DECIDED)
- The free tier completes the full loop: project or brief, agreement, record.
- Monetization is by capacity, never completion. About two active collaborations was an example, not a fixed number.

**[D08: documents](../decisions/D08-documents.md)** (OPEN, settled piece)
- A photo release is essential for the first scenario, because the contemplated album-cover use is commercial.

**[D09: preservation](../decisions/D09-preservation-and-evidence-access.md)** (OPEN, settled piece)
- Ordinary in-product removal of a shared record needs a reason and approval by all parties to it.
- Statutory privacy and erasure follow a separate legal path, which depends on counsel.

**[D10: visibility](../decisions/D10-what-each-party-sees.md)** (OPEN, settled pieces)
- One model does not see another model's private commercial or craft agreement.
- A client may see commercial numbers where that client is entitled to them.
- Safety and consent terms for people on site are visible to, and affirmed by, everyone on site.
- Commercial and craft terms stay private to the parties they concern.
- Visibility is one-directional: people posting work do not browse talent. Talent may deliberately and temporarily share their own portfolio or comp-card material.

**[D11: adult assurance](../decisions/D11-adult-assurance.md)** (OPEN, settled piece)
- Real participation requires real verification. Self-attestation is not a substitute.
- Verification also serves identity uniqueness: anti-bot and anti-ban-evasion.

**[D12: who may act](../decisions/D12-who-may-act.md)** (DECIDED)
- No proxies. Nobody signs for another person. The person acting is the person reading and affirming.
- Being creator, organizer, client, payer or account holder never authorizes affirming for someone else.
- The current build is adult-only.

**[Additional direct rulings, 5 October](../decisions/2026-10-05-cory-reconciliation.md)** (numbered as in that file)
1. Applying is acceptance of published terms. Bargaining is removed after selection; terms and value are visible before someone raises their hand.
2. One number, one answer. Money and terms are not counter-offered. A term may be removed; it is not haggled.
3. Unfilled fields are bounded dialogue. Conversation may attach to the specific term being completed (text or voice memo). The completed brief is the output.
4. Field ordering replaces hard brief types: safety and non-negotiables first, variable creative fields later. Templates are starting structures.
5. Three field buckets: settled before contact opens; required before shooting but completable through dialogue; optional. Deliberately open and accidentally unfinished are different states.
6. Escalation requires a neutral record and a mandatory delay before acceptance. No explanation is demanded from the person whose boundary is changing.
7. Recorded term-bound dialogue is not a private, deniable DM channel.
8. Visibility is one-directional by default (see D10 above).
9. Three known starts: talent applies to posted work; someone sends a project directly to a known person; talent converts an off-platform approach into a Modeling Standard brief.
10. A witness signature may be optional.
11. Universal safety terms; pairwise commercial terms.
12. Payment has no natural direction. Any named party may owe value to any other.
13. Who asked first must not determine who pays. Value must be explicit, not inferred from who initiated.
14. No means no: "No is supposed to be an answer to a question, not a response to an action." The value is stated publicly, with a signed acknowledgment on every brief.
15. Role neutrality: creator, photographer, payer, creative author and obligation holder are independent concepts.

---

## 4. How the homework is organized

The questions are ordered by **leverage**: how much real work each answer unlocks. They are not in decision-number order.

- **Tier A, answer next.** These unblock the next real Stage 1 work.
- **Tier B, answer soon.** These are needed for the first usable collaboration, but not for the very next slice.
- **Tier C, later.** These are counsel-dependent or launch questions that can safely wait.

Every question uses the same six parts:
- **Question:** what to answer.
- **Already settled:** your relevant rulings, so you don't repeat them.
- **Why we're asking now.**
- **Smallest sufficient answer:** the least that lets engineering continue.
- **What it unlocks.**
- **What we will not infer:** things that stay open even after you answer.

Partial answers are welcome. "Not yet" is an answer too; the item simply stays open.

---

## 5. Tier A: answer next

Recommended order: **A1 → A2 → A3 → A4 → A5**.
- A1 is first because nothing a real person does can be recorded as theirs until a person is bound to a party.
- A2 and A3 decide what that person sees and what they must affirm.
- A4 ties applying to affirming.
- A5 governs what happens after the first version.

### A1. Participation credential ([D03](../decisions/D03-participation-credential.md))

**Question.** What does a real person need, at each step, to take part as a party? Each of these can be answered separately:
1. What does a person need in order to **read** a request or brief?
2. What do they need in order to **affirm** terms?
3. Must they have an **account**? If so, from which step?
4. Is a **one-time link or code** sent to them enough at any stage? If so, which?
5. What happens if an invitation is **forwarded** to, or opened by, someone other than the person named?
6. How is a **wrong email or address** corrected, and does that need the person who sent it?
7. How does a person **come back to their record** later?
8. How does **recovery** work if they lose access to their email or account?

**Already settled.**
- No proxies; the person acting is the person affirming (D12).
- Real verification is required for real participation, and self-attestation is not enough; verification also serves identity uniqueness (D11).
- Ratified doctrine: login is not verified identity, and the record captures the credential used to agree.
- Not ratified: your earlier signup remark ("I'd almost not know I signed up") is recorded as candidate evidence, said about a different context.

**Why we're asking now.** Every evidence row today names a party but no person. Until a person can be bound to a party, nothing a real person does can be recorded as theirs.

**Smallest sufficient answer.** Answers to 1 to 4 for the first scenario. Items 5 to 8 can follow, but the first participant flow cannot be offered to anyone until 7 and 8 have answers.

**What it unlocks.**
- Binding a person, account or credential to a party.
- An invitation and participation shell.
- Recording who actually performed each affirmation, and with which credential.

**What we will not infer.**
- The verification vendor, mechanism or timing: D11 timing is still open, and choosing a provider is not your question.
- What the person sees once in (A2).
- Which terms they must affirm (A3).

### A2. What each party sees ([D10](../decisions/D10-what-each-party-sees.md)), one row at a time

**Question.** For each kind of information below, who sees it at each point? These are common answer shapes, not a closed list: everyone, only the parties it concerns, only the organizer, nobody, or another rule — describe it. You do not need to fill the grid in one sitting. Each row stands alone.

| Information | Before agreeing | During review | After agreement | In the delivered artifact |
|---|---|---|---|---|
| Roster (who else is taking part) | | | | |
| Counterparties (who this person is agreeing with) | | | | |
| Compensation | | | | |
| Contact details | | | | |
| Exact location | | | | |
| Private notes | | | | |
| Concerns raised | | | | |
| Who has affirmed which term | | | | |
| Usage terms | | | | |
| Version and change history | | | | |
| The final record or artifact | | | | |

Two companion questions:
- What does the person who organized the collaboration see that others do not?
- Is the final artifact one record with a view for each party, a separate artifact per party, or one document everyone sees in full?

**Already settled.** The D10 rulings in [section 3](#3-what-cory-has-already-decided): private agreements, client numbers where entitled, shared safety terms, and one-directional visibility. Ratified doctrine: each participant reviews the terms relevant to them.

**Why we're asking now.** No screen, notification or artifact can show anything to a party until these rows are answered. The demo inspector exists precisely because no party view can be built yet.

**Smallest sufficient answer.** For the two-person first scenario, four rows: **counterparties, contact details, exact location, and who has affirmed which term**, in the "before agreeing" and "during review" columns. These block the first participant view. The other rows can follow.

**What it unlocks.**
- Party-scoped read models.
- The first participant presentation.
- Later, notifications and artifact views.

**What we will not infer.**
- The D10 file lists "contact details only on mutual acceptance" and "exact address after acceptance" as candidate evidence from July. They are not your direct rulings, so they are asked again here rather than assumed (see [section 12](#12-points-we-noticed-and-did-not-resolve)).
- The answers for projects with three or more parties.

### A3. What makes a term required, and which terms are body or money ([D04](../decisions/D04-terms-and-affirmation.md))

This is separate from clause wording.

**Question.**
1. What makes a term **required**?
2. **Who** determines that a term is required?
3. Which fields must be **complete before terms are presented**?
4. What counts as **deliberately open** versus **accidentally unfinished**?
5. Which of the first scenario's fields are **body** terms?
6. Which are **money** terms?
7. Which **ordinary** terms may use the group-check convenience?

**Already settled.**
- Each term is individually affirmable. Body and money terms always need their own affirmation, and ordinary terms may be group-checked (D04).
- An agreement cannot be final until every named party has affirmed every required term (D02). That is a necessary prerequisite for finality; whether any additional confirmation step exists remains unresolved under D02 (b).
- The three field buckets, and deliberately open being different from accidentally unfinished (ruling 5).
- Field ordering replaces brief types (ruling 4).

**Why we're asking now.** Even the necessary prerequisite for finality cannot be checked, and the group-check cannot be built, without knowing which terms are required and which are body or money. Nothing in storage records either today, on purpose.

**Smallest sufficient answer.** Answers to 1, 2, 5 and 6 for the first scenario. Items 3, 4 and 7 can follow.

**What it unlocks.**
- Requiredness metadata tied to each frozen version.
- Completeness checks.
- The prerequisites for finality.
- The group-check convenience.

**What we will not infer.**
- Verbatim clause wording.
- How value or trade is represented.
- The signing interaction beyond per-term affirmation.
- Signing timing.
- What is recorded beyond time and credential.

The team will not classify the demo's fixture terms; they are deliberately neutral placeholders.

### A4. How "applying is acceptance" composes with per-term affirmation

This is a cross-cutting question, and among the highest-leverage in the packet.

**Question.** You have said that applying is acceptance of published terms (ruling 1), that every term remains individually affirmable (D04), and that body and money terms need deliberate individual affirmation (D04). How do these fit together? For example:
- Is applying itself the affirmation of the ordinary terms that were already fixed?
- Does applying only signal interest, with affirmation happening separately?
- Are some terms accepted by applying and others affirmed explicitly later?

These examples show the ambiguity. They are not a list of preferred options, and none is assumed.

**Already settled.** Rulings 1, 2 (one number, one answer) and 14 (no means no); D04's per-term rule; D12's no proxies.

**Why we're asking now.** The response flow for posted work cannot be designed until the relationship between applying and affirming is clear. The reconciliation note preserves this as open.

**Smallest sufficient answer.** For a person applying to posted work: which terms, if any, are accepted at the moment of applying, and which still need their own affirmation afterwards.

**What it unlocks.**
- The response flow for posted work.
- What evidence the moment of applying produces.

**What we will not infer.**
- The direct-send and off-platform starts (ruling 9), which may compose differently.
- Whether any answer here changes the D04 body/money rule, which stays as you set it.

### A5. What happens after the first version ([D02](../decisions/D02-agreement-topology-lifecycle.md))

There are two separate questions here. Pairwise drop-and-resend and universal omission are deliberately kept apart.

#### A5a. Pairwise lifecycle

**Question.** Each of these is separate:
1. May a party **withdraw** their own agreement before it is final?
2. Can a finalized collaboration be **cancelled**? By whom, and what does the record say afterwards?
3. When someone is **added or removed** after others have agreed, who must agree again? Is the removed person still shown on the earlier agreement?
4. After a change, who must **review and re-accept**: everyone, or only those affected? If only those affected, who decides who they are?
5. Does the **earlier agreement stay in force** while a replacement is pending, or is nothing in force in between?
6. After a term is dropped and the rest resent, how are the **resent terms affirmed**? Do affirmations already given on the earlier version count?

**Already settled.**
- No counters (D02).
- A term may be dropped and resent, or the proposal withdrawn (D02).
- Escalation needs a neutral record and a mandatory delay (ruling 6).
- Ratified doctrine: material changes go back to those affected.

**Why we're asking now.** Drop-and-resend is your decided response path, and storage can freeze a resent version today. But nobody can affirm it: storage deliberately accepts affirmations only on a sole version 1 until you answer 5 and 6.

**Smallest sufficient answer.** Answers to 5 and 6 for the two-person first scenario. Items 1 to 4 can follow; roster changes matter only when a scenario adds or removes people.

**What it unlocks.**
- Affirming a later version.
- Withdrawal.
- Amendment and replacement states.

**What we will not infer.**
- What counts as an "escalation" for ruling 6, or how long the mandatory delay is (see the checklist).
- Cancellation, if you answer only 5 and 6.

#### A5b. Universal omission

**Question.** May a later version of the shared safety and consent terms **leave out** a safety or consent term that an earlier version presented?

**Already settled.**
- Safety and consent terms are shared by and affirmed by everyone on site (D02).
- Ratified doctrine: everyone on set has agreed to the terms or they are not on set.

**Why we're asking now.** Storage can freeze such a version, and the demo shows that this is possible. The demo labels it as undecided. Nothing should rely on it until you answer.

**Smallest sufficient answer.** Yes, no, or "only when …".

**What it unlocks.** Later universal versions in any real flow.

**What we will not infer.** That the pairwise drop-and-resend rule extends to the universal layer. It does not, unless you say so.

---

## 6. Tier B: answer soon

### B1. Vocabulary ([D05](../decisions/D05-vocabulary.md))

**Question.** Which words should a person outside the team see for each of these?
- the collaboration (internally, "project");
- the terms document (the ratified documents already use "brief");
- the terms as presented;
- a participant's response;
- the agreed or final state;
- the artifact or record each party keeps;
- the completed and archived states.

**Already settled.**
- The product name and "guardian manager".
- "Brief" is the ratified documents' word for the terms document.
- The product claims only what it does (ratified doctrine).

**Why we're asking now.** No screen, email or artifact can go in front of a real person without these words. The demo uses internal code names and says so.

**Smallest sufficient answer.** Words for the collaboration, the terms as presented, a response, and the agreed state.

**What it unlocks.** Every participant-facing screen, email and artifact.

**What we will not infer.** Words such as **signed, final, verified and agreed** each claim something. The product will use them only where the state actually proves it, whatever words are chosen. The team will not propose names.

### B2. Documents ([D08](../decisions/D08-documents.md))

**Question.**
1. Besides the photo release, which documents are essential for the first scenario?
2. Which usage-rights triggers select which document?
3. Which documents need legal review before real use? (This also appears as C3.)
4. Should a document ever be produced on its own, outside a collaboration?

**Already settled.**
- A photo release is essential for the first scenario (D08).
- Ratified doctrine: usage rights trigger release documents that the product assembles but does not invent, and safety documents are priority one.
- All consent documentation is free (ratified; see D07).

**Why we're asking now.** The first scenario's commercial use triggers at least one release. That release is part of the real-use gate, not a later extra.

**Smallest sufficient answer.** The complete essential set for the first scenario, plus the trigger for each document.

**What it unlocks.** Document design and the release part of the artifact.

**What we will not infer.** Any legal language. Drafting is out of scope for this packet.

### B3. Product intent for access and preservation ([D09](../decisions/D09-preservation-and-evidence-access.md))

**Question.** As product intent, setting aside the law, what should happen to a person's access to their records when:
1. they close their account;
2. they lose their credentials;
3. they are suspended;
4. they were removed from a collaboration after an earlier agreement;
5. time passes: who keeps historical access, and what is each person told?

**Already settled.**
- Removal of a shared record needs a reason and all-party approval (D09).
- Ratified doctrine: records are append-only, removal means archive and not destruction, and agreements outlive account deletion.
- Marked provisional in doctrine: retrieval subject to approved retention rules, and suspension blocking protected actions immediately.

**Why we're asking now.** These are part of the real-use gate (record access and recovery), and the answers interact with A1.

**Smallest sufficient answer.** Intent for 1 to 3.

**What it unlocks.** In-product record access after account changes.

**What we will not infer.** Retention periods, purge rules, legal bases or statutory erasure. Those are counsel's (C2). Each party's delivered copy of the artifact is theirs regardless.

### B4. Optional witness

**Question.**
1. What does a witness attest to: identity, presence, the act of affirming, or something else?
2. In which scenarios may a witness be used?
3. Is a witness optional everywhere, or only in certain scenarios?

**Already settled.** A witness signature may be optional (ruling 10). Witnessing is a separate evidence feature and **never creates proxy authority** (D12).

**Why we're asking now.** This is preserved as an open seam, and it affects what an affirmation record may later carry.

**Smallest sufficient answer.** Item 1.

**What it unlocks.** A witness evidence design.

**What we will not infer.** That a witness can act for anyone. They cannot.

### B5. A fourth collaboration-start route

**Question.** Three starts are known:
1. talent applies to posted work;
2. a project is sent directly to a known person;
3. talent converts an off-platform approach into a Modeling Standard brief.

Is there a **fourth** first-class start route you want modelled now? "No" is a complete answer.

**Already settled.** Rulings 9 and 1, and D01's "posting versus direct send is distribution, not a different product".

**Why we're asking now.** It is a preserved open seam, and it bounds the participation work in A1.

**Smallest sufficient answer.** Yes (and what it is) or no.

**What it unlocks.** Scoping of the participation shell.

**What we will not infer.** A fourth route from any existing code.

### B6. Voluntarily exceeding an agreed coverage ceiling

**Question.** If someone voluntarily goes beyond a coverage ceiling agreed earlier, what should the product record, or do?

**Already settled.**
- Escalation needs a neutral record and a mandatory delay, and no explanation is demanded from the person whose boundary is changing (ruling 6).
- Recorded term-bound dialogue is not a deniable private channel (ruling 7).

**Why we're asking now.** It is an explicitly preserved seam. The answer affects how boundary changes are recorded.

**Smallest sufficient answer.** What, if anything, the record should show.

**What it unlocks.** Boundary-change evidence design.

**What we will not infer.** Any consent or legal implication. This packet gives no legal advice.

---

## 7. Tier C: later, counsel, launch

### C1. Real use before public launch ([D06](../decisions/D06-real-use-and-launch-shape.md))

**Question.**
1. May your own network use the product for real collaborations before the public launch?
2. If so, for exactly which scenario?
3. What must be complete first?

**Already settled.** Ratified doctrine: the launch must arrive substantially whole.

**Why we're asking now.** It isn't urgent. It is listed so the gate is visible. **A working synthetic demo is not permission for real use.**

**Smallest sufficient answer.** Item 1.

**What it unlocks.** Gate 2, real use, for a named scenario. The candidate prerequisites are listed in [planning/F-first-slice.md](../planning/F-first-slice.md), section 6.

**What we will not infer.** That any prerequisite is met because a demo works.

### C2. Retention and statutory erasure ([D09](../decisions/D09-preservation-and-evidence-access.md)), counsel-dependent

**Question.** For counsel together with you:
- retention periods and purge policy;
- how preservation, restriction, legal-claims bases and statutory erasure interact.

**Already settled.** Statutory requests follow the legal path, not the in-product removal rule (D09).

**Why we're asking now.** It isn't urgent. It is needed before real use.

**Smallest sufficient answer.** Counsel's guidance for the first real-use scenario.

**What it unlocks.** A purge path, if any, and retention promises.

**What we will not infer.** Any legal position. Do not answer this from instinct.

### C3. Legal review of documents ([D08](../decisions/D08-documents.md)), counsel-dependent

**Question.** Which document templates need professional legal review before real use?

**Already settled.** Ratified doctrine: legal language, enforceability and counsel adoption are deferred.

**Why we're asking now.** It is needed before real use where a release is triggered.

**Smallest sufficient answer.** Review status of the photo release.

**What it unlocks.** Real use of the first scenario's release.

**What we will not infer.** Enforceability of any template.

### C4. Youth path: current boundary or permanent change?

**Question.** The current build excludes minors (D12). Older ratified direction deferred a youth path pending legal review (invariant I9 in [planning/B-product-invariants.md](../planning/B-product-invariants.md)). Is today's adult-only exclusion:
- **only the present build boundary**, or
- a decision to **permanently remove** the future youth partition from product direction?

**Already settled.** D12: the current adult path excludes minors. D12 itself says any permanent removal should be reconciled explicitly against I9.

**Why we're asking now.** Only to record your intent. Nothing is built either way.

**Smallest sufficient answer.** One of the two options.

**What it unlocks.** Keeping the canon consistent.

**What we will not infer.** Any change to canon from this packet.

---

## 8. Demo walkthrough

A script for Dustin.
- **Run it:** `npm run demo:reset`, then `npm run demo`, then open `http://127.0.0.1:3100/`.
- **Snapshot:** `npm run demo:export` writes `.demo/modeling-standard-demo.html`.
- Details are in [docs/engineering/DEMO.md](engineering/DEMO.md).

Before starting, tell Cory that **the demo operator, and every simulated act, stands for nobody**. The simulator is not a participant workflow, decided or otherwise.

| # | Stop | What Cory should look at | Real storage behaviour | Synthetic | Question to ask Cory there |
|---|---|---|---|---|---|
| 1 | Fixture 1: project and parties | One project, two parties | Parties are bare identifiers; the creator is not a party | The labels "the model" and "the photographer" are demo annotations | A1: what must a real person have to become one of these parties? |
| 2 | Fixture 1: pairwise agreement | One private agreement between the two | Exactly two parties, of this project only | Who created it (a fixture) | A2: before agreeing, may each party see who the other is? |
| 3 | Fixture 1: shared versus pairwise terms | The two term sections | Safety and consent terms on the project; commercial and craft terms on the agreement | Term text is marked `[synthetic]`, and the shared terms are neutral placeholders | A3: in your scenario, which terms are required, and which are body or money terms? |
| 4 | Fixture 1: frozen version | The "Version 1", "sealed" and "presented …" labels | Wording frozen; the database clock stamps it | Who presented it (no actor is recorded) | B1: what should this frozen thing be called? |
| 5 | Fixture 2, agreement A–C: drop-and-resend | Version 2 without term three; version 1 unchanged | Version 1 untouched; version 2 cannot take rows yet | The act of presenting | A5a: how are the resent terms affirmed, and do earlier affirmations count? |
| 6 | Simulator: a universal later version | Start a simulation, present two shared terms, then present again leaving one out | Storage can freeze it | The whole act; the panel says omission is undecided | A5b: may a shared safety or consent term be left out of a later version? |
| 7 | Fixture 1 or 2: affirmation grid | ✓ cells and empty cells | One row per party per presented term, with the database's time | Every row was written by a fixture or the simulator, not a person | A4: when someone applies, which of these terms have they accepted? |
| 8 | "Open decisions for Cory" view | The four-decision walkthrough | None | None | Confirm the order of the questions in section 10 |
| 9 | Portable snapshot | The file on a phone, offline | None (a read-only copy) | Everything | Whether this format is useful for reviewing future slices |

---

## 9. Build queue unlocked by answers

These are **candidate** next slices. Each still needs its own PRD and Dustin's approval. This table authorizes nothing.

| If Cory answers | Candidate implementation work | Still blocked by |
|---|---|---|
| A1 (D03), items 1 to 4 | Binding a person or credential to a party; an invitation and participation shell; recording the actual actor and credential on each affirmation | A2 for what they see; D11 timing for real verification; D05 for wording; real use (D06) |
| A2, the four key rows | Party-scoped reads; the first participant presentation | Remaining rows for notifications and artifacts; D05 for wording |
| A3, items 1, 2, 5 and 6 | Requiredness and body/money metadata tied to frozen versions; completeness checks; finality prerequisites | A4 for how applying counts; the signing interaction (D04) |
| A4 | The response flow for posted work, and what the act of applying records | A1 (who is applying); A3 |
| A5a, items 5 and 6 | Affirming later versions; replacement states | Items 1 to 4 for withdrawal, amendment and roster work |
| A5b | Later universal versions in a real flow | A5a for how they are affirmed |
| B1 (D05) | Participant-facing screens, emails and artifact wording | A2 |
| B2 (D08) | Document design; releases in the artifact | C3 legal review before real use |
| B3 (D09 intent) | In-product record access after account changes | A1; C2 counsel |
| B4 | Witness evidence | A1 |
| C1 (D06) | Gate 2 planning for one named scenario | Every real-use prerequisite in F section 6 |

---

## 10. If Cory only has 20 minutes

Five questions, in this order. Each can be answered in a few sentences.

1. **Participation (A1).** "In the first scenario, what must a person have in order to read the brief, what must they have in order to affirm a term, and how do they get back to their record later?"
2. **Visibility, four rows (A2).** "In the two-person first scenario, before the agreement is final, may each party see: who the other party is; the other's contact details; the exact location; and which terms the other has already affirmed?"
3. **Requiredness (A3).** "In the first scenario, which terms must every named party affirm before the agreement is final, and who decides that a term is required?"
4. **Applying versus affirming (A4).** "When someone applies to posted work, which terms, if any, have they accepted at that moment, and which still need their own separate affirmation afterwards?"
5. **After a resend (A5a).** "When a term is dropped and the rest resent, how are the resent terms affirmed, and do affirmations already given on the earlier version still count?"

No counsel questions are in this list on purpose.

---

## 11. Full homework checklist

Each item is small and can be answered on its own. References point to the full question above.

**Participation (A1, B5)**
- [ ] What does a person need to read a brief?
- [ ] What do they need to affirm a term?
- [ ] Must they have an account? From which step?
- [ ] Is a one-time link or code enough at any stage? Which?
- [ ] What happens if an invitation is forwarded or opened by someone else?
- [ ] How is a wrong email or address corrected, and does that need the sender?
- [ ] How does a person come back to their record later?
- [ ] How does recovery work after losing access to email or account?
- [ ] Is there a fourth first-class start route? (B5; "no" is fine)

**Visibility (A2)**
- [ ] Roster: who sees it, before / during / after / in the artifact
- [ ] Counterparties: before / during / after / artifact
- [ ] Compensation: before / during / after / artifact
- [ ] Contact details: before / during / after / artifact
- [ ] Exact location: before / during / after / artifact
- [ ] Private notes: before / during / after / artifact
- [ ] Concerns raised: before / during / after / artifact
- [ ] Who has affirmed which term: before / during / after / artifact
- [ ] Usage terms: before / during / after / artifact
- [ ] Version and change history: before / during / after / artifact
- [ ] Final record or artifact: who receives what
- [ ] What the organizer sees that others do not
- [ ] Artifact shape: one record with per-party views, one per party, or one shared in full

**Terms (A3, A4)**
- [ ] What makes a term required?
- [ ] Who decides a term is required?
- [ ] Which fields must be complete before presentation?
- [ ] What counts as deliberately open versus accidentally unfinished?
- [ ] Which first-scenario terms are body terms?
- [ ] Which first-scenario terms are money terms?
- [ ] Which ordinary terms may be group-checked?
- [ ] Any clause language to use verbatim? ([D04](../decisions/D04-terms-and-affirmation.md))
- [ ] How value and trade are written, and whether a range counts as explicit ([D04](../decisions/D04-terms-and-affirmation.md))
- [ ] The visible act of signing, beyond per-term affirmation ([D04](../decisions/D04-terms-and-affirmation.md))
- [ ] When each party signs: at presenting, or all at the same step ([D04](../decisions/D04-terms-and-affirmation.md))
- [ ] What may be recorded beyond time and credential ([D04](../decisions/D04-terms-and-affirmation.md))
- [ ] How applying composes with per-term affirmation (A4)

**Lifecycle (A5)**
- [ ] Withdrawal of one's own agreement before finality
- [ ] Cancellation after finality: by whom, and what the record says
- [ ] Roster additions and removals: who re-agrees; is a removed person still shown?
- [ ] Amendment: everyone re-accepts, or only those affected, and who decides
- [ ] The earlier agreement while a replacement is pending
- [ ] How resent terms are affirmed, and whether earlier affirmations count
- [ ] May a later universal version leave out a safety or consent term? (A5b)
- [ ] What counts as an "escalation" under ruling 6, and how long is the mandatory delay?
- [ ] Is affirmation of every required term by every named party by itself enough for finality, or is there a further confirming step, such as by the organizer? (D02 (b); see [section 12](#12-points-we-noticed-and-did-not-resolve))

**Vocabulary (B1)**
- [ ] Word for the collaboration
- [ ] Confirm "brief" for the terms document
- [ ] Word for the terms as presented
- [ ] Word for a participant's response
- [ ] Word for the agreed or final state
- [ ] Word for the record or artifact each party keeps
- [ ] Words for completed and archived

**Documents (B2, C3)**
- [ ] The complete essential document set for the first scenario
- [ ] Which usage-rights trigger selects which document
- [ ] Whether documents may be produced on their own
- [ ] Which templates need legal review (counsel)

**Access and preservation (B3, C2)**
- [ ] Access after account closure
- [ ] Recovery after lost credentials
- [ ] Access while suspended
- [ ] Historical access for a removed participant
- [ ] Who keeps historical access, and what each is told
- [ ] Retention periods and purge policy (counsel)
- [ ] Statutory erasure interaction (counsel)

**Launch (C1, C4)**
- [ ] May your network use it before public launch?
- [ ] For which exact scenario?
- [ ] What must be complete first?
- [ ] Does a synthetic demonstration with invented people need verification? ([D11](../decisions/D11-adult-assurance.md))
- [ ] Must verification move earlier than first participation because of its anti-bot and anti-ban-evasion role? ([D11](../decisions/D11-adult-assurance.md))
- [ ] Youth: present build boundary, or permanent removal?

**Residual seams (B4, B6)**
- [ ] What a witness attests to
- [ ] Where a witness may be used, and whether it is optional everywhere
- [ ] What the record shows if someone voluntarily goes beyond an agreed coverage ceiling

---

## 12. Points we noticed and did not resolve

These were found while reconciling this packet against the decision files. They are listed so you or Dustin can settle them. This packet does not settle them.

1. **D10 candidate rows.** D10's "Already settled" lists "contact details exchanged only on mutual acceptance" and "exact address revealed after acceptance". Both are marked **[CA]**: July candidate evidence, not your direct ruling. The same file also says contact details and location before agreement "still need an answer". This packet asks them again (A2) rather than treating them as settled.
2. **D11 timing.** D11's "Already settled" lists "age is verified never at signup; on the first act of participation" as **[CA]**. Your 5 October ruling says verification timing is open, and may move earlier for anti-bot reasons. [planning/F-first-slice.md](../planning/F-first-slice.md), section 6, still refers to "verifying at first participation". This packet treats timing as open.
3. **Finality wording.** D02 says an agreement is "not final until" every named party has affirmed every required term. That is a necessary condition. D02's original question (b) asked whether finality also needs a confirming step by the organizer. Organizer confirmation was a prototype behaviour and a provisional doctrine journey, never ratified. D02's "Still open" list no longer names (b), but its "What this unlocks" section still says (b) cannot wait. The checklist asks you to confirm; this packet does not treat the question as answered either way.
4. **Payment direction in D04.** D04 still asks "who pays whom … when the payer is not the person who set the collaboration up". Rulings 12 and 13 already say payment has no natural direction and value must be explicit. The D04 file hasn't been updated to point at those rulings. This packet does not re-ask the direction question.
5. **Youth canon.** D12 notes that a permanent removal of the youth path should be reconciled against invariant I9. That is asked once (C4) and changed nowhere.
6. **Next conversation.** [decisions/README.md](../decisions/README.md) names D10 as the strongest next conversation. This packet leads with D03 (A1), because binding a person to a party now gates the most work. Both orders are defensible, and the choice is Cory's and Dustin's.
