# Deliverable E. Domain sketch

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Fable proposal **[F]** throughout unless tagged otherwise. Concepts only; **not a schema**. Not implementation authority.

The previous version of this document listed entities with fields and said that no Cory decision would change the model "beyond the flagged rows". That assurance is withdrawn. Several of Cory's open decisions change what the entities are, not just their values. This version keeps the conceptual distinctions, states what the model must be able to express under any answer, and suspends every concrete structure that depends on an unanswered decision.

## 1. Who is acting: nine things that are not the same thing

| Concept | What it is | What it is not |
|---|---|---|
| **Credential** | Something presented to the product at one moment: a session, a one-time code, an invitation link | A person, or proof of who the person is |
| **Login method** | A way of obtaining a credential (email code, later an external login) | The account. Login-method selection is not doctrine (DOCTRINE:113). |
| **Account** | The product's own durable identifier for someone who signs in. External subjects are never its key **[R]** (VISION:46). | A person's professional identity; a party to any agreement |
| **Person** | A human being with a name they are known by and a name they sign with | An account. A person may take part in a collaboration without one, if Cory allows it (D3). |
| **Professional subject / profile** | How a person is presented professionally | A prerequisite for the first collaboration, unless Cory's scenario shows a need (D1). Nothing in the ratified evidence set requires a profile; a party needs to be named in the agreement, and a name does that. |
| **Collaboration participant** | A person's part in one collaboration, with a role in it | An account, a profile, or a party to every term in the collaboration |
| **Represented talent** | A person whose professional affairs are managed by someone else | Built in the first stages |
| **Representative / guardian** | Someone acting for another person or for an organization | Built in the first stages |
| **Authority to act** | The basis on which a signature commits someone: acting for oneself, or for another with a stated basis | Inferred from holding an account or controlling an inbox |

**Inbox control.** Receiving a code or link at an address shows control of that inbox at that moment. The product may record exactly that and claim exactly that (I7). It is not verified identity (VISION:317; DOCTRINE:82 leaves "verified identity" open), not professional authority, and not a right to sign for anyone else.

**Proposed first-slice constraint [F], requires Cory's approval (D12).** Every participant in the first slice is an adult acting only for themselves. No organizations, agents, clients-as-companies or guardians as signers. This is a proposal to keep the first slice small; it is not a fact about Cory's first scenario, and if his scenario includes someone who commits another party, the constraint does not hold and representation has to be designed first.

## 2. The collaboration, its parties, and who owes what to whom

A **collaboration** involves a set of parties. The model treats the parties as a set of any size from the start and never as "both sides", even if the first scenario has two.

"**Organizer**" was doing too much work in the previous version. It bundled nine things that can belong to different people:

| Capability or relationship | Could be held by |
|---|---|
| Coordinates (creates the collaboration, invites people) | Anyone taking part, or someone who is not otherwise a party |
| Authors the terms | The coordinator, or several people |
| Pays | A photographer, a model hiring a photographer, a client, a brand |
| Is the client | Someone who may not be on set at all |
| Receives deliverables | A model, a client, a designer |
| Receives usage rights | A photographer, a client, a publication |
| Finalizes | Open: possibly nobody in particular (D2) |
| Signs | Every party, for the obligations that bind them |
| Decides for others | Nobody, unless authority is established (D12) |

So the model separates two things:

- **Coordination capabilities**: who may create, edit, invite and present. These are permissions on the working state.
- **Obligations**: what each party undertakes. Each obligation names **who owes what to whom**.

Examples of obligations, to show the shape rather than to fix a list:

| From | To | What |
|---|---|---|
| Payer | Payee | An amount, a down payment, by a date |
| Photographer | Model | Edited images, a number, by a date |
| Model | Client | Attendance and the agreed work on the day |
| Rights grantor | Rights recipient | Permitted uses, for a term, with credit |
| Creator | Deliverables recipient | Files, in a format, by a method |
| Venue or provider | The parties | A space, a change area, on the day |
| Each party | The others | Staying within the agreed boundaries |

This is not a general contract engine. It is the minimum needed so that the first slice does not hide a material obligation inside an "organizer" flag, and so that the ratified requirement that compensation is "visible to and signed by both parties" (DOCTRINE:48) can be met when the payer is not the person who created the collaboration.

**A party signs where they undertake or affirm something.** A coordinator who undertakes obligations signs them like anyone else. Whether a coordinator also gives a separate confirming signature after everyone has responded is Cory's (D2); it came from the prototype's workflow and from a doctrine journey that is itself marked provisional (DOCTRINE:96-104), and it is not ratified. Who presented which terms, when, and with what credential is recorded as authorship in any case; that is provenance, not a signature.

Which obligations exist in the first slice, and between whom, comes from Cory's walkthrough (D1).

## 3. Agreement topology is open

Cory's ratified direction is that everyone on set has agreed to the terms (VISION:374), that each participant reviews the terms relevant to them (VISION:150), and that participants review "the same relevant shoot information rather than disconnected versions" (VISION:137). That does not determine the structure of the agreement. At least these are possible:

| Shape | What it means |
|---|---|
| **One collective agreement** | Every party agrees to one set of terms; it is final when all have agreed |
| **One shared collaboration state plus related party-specific agreements** | Common terms everyone accepts (the day, the place, the boundaries), plus separate agreements between the parties each obligation concerns |
| **Several bilateral or multilateral agreements under one collaboration** | Each obligation set is agreed by its own parties; the collaboration groups them |
| **Another structure Cory approves** | |

The previous version assumed the first: every listed participant a party to one version, final when all accept, under one common hash. That was an inference and is withdrawn. Nothing is selected here (D2).

**What the model must hold under any shape:**

- A collaboration has n parties.
- Not every party agrees to every term.
- Not every party is entitled to see every other party's private terms or details (D10).
- For every term that was agreed, the evidence shows which parties agreed to it.

## 4. The evidence chain

Under any topology, evidence has to establish the following (I1, I10, I11, I13). This is the requirement the eventual schema is judged against:

1. **The collaboration state presented**: exactly which state of the terms was put in front of people.
2. **The clauses presented to this party**: the literal text, frozen (DOCTRINE:46).
3. **The values substituted into those clauses**: captured as values, not implied (DOCTRINE:47).
4. **The party-specific terms visible to this signer** (DOCTRINE:55).
5. **The relevant counterparties**: who this party was told they were agreeing with.
6. **The affirmations or signatures attached to those clauses** (DOCTRINE:51).
7. **When, and with what credential** (DOCTRINE:52). The credential recorded is the one actually used; the model does not assume it is an account session.
8. **Which accepted responses formed the final state**: the set that made the agreement final.
9. **The resulting portable artifact or artifacts**, and what each is permitted to contain (DOCTRINE:53; D10).

Conceptually this is a chain:

```
collaboration state  ->  presentation to a party  ->  that party's response and affirmation
                                                              |
                         final state = the accepted responses that completed it
                                                              |
                                     portable artifact(s), each traceable to the above
```

A **presentation** is what one party was actually shown: clauses, values, counterparties, and the version of the wording used. An **affirmation** binds to a presentation and names the clauses it covers. A version identifier and one hash over the whole collaboration are not enough, because they show that a party was associated with a version, not what was put in front of them. The previous design generated each party's view only when the record was rendered, after signing; if the visibility rule or the wording changed in between, the record could not show what was seen.

How presentations relate to the final artifact (one canonical artifact with party-specific views, one artifact per party, one document shared in full, or something else) is not fixed here. It depends on D2a and D10. The doctrine's singular "the final immutable PDF" (DOCTRINE:53) is treated as ambiguous wording, not as a choice among these. Whatever the answer, giving different documents a shared identifier does not by itself establish that each faithfully represents the part of the agreement its holder is entitled to; the link from artifact back to presentation and affirmation has to exist.

## 5. Working state and evidence

This distinction survives every open decision and is the centre of the model:

| Working state (mutable) | Evidence (never altered) |
|---|---|
| The collaboration as it is being arranged | What was presented |
| Terms as currently drafted | What each party responded and affirmed |
| Who is invited, and where each invitation stands | What made the agreement final |
| Operational credentials and notifications | The delivered artifacts |

Editing working state never changes evidence. Archiving or removing working state never removes evidence (I2). How evidence is protected is a set of mechanisms proposed in Deliverable D.

## 6. Access: two different kinds

| Kind | Examples | Lifetime |
|---|---|---|
| **Temporary operational access** | Invitation links and codes; access to a collaboration before agreement; later, share links and grants for portfolios or media | May expire and be revoked. That is the point of them. |
| **Durable party evidence rights** | A person who became a party to a finalized agreement, and their access to the record they are entitled to hold | **[F]** Attached to having been a party, and not removable through another user's sharing controls. What does end or limit it is Cory's (D9). |

The previous version ran both through one bearer-grant mechanism and one rule ("all grants expire"). They are separated. Keeping them separate is a recommendation **[F]**; it does not decide how long a durable right lasts. What happens to it in each of the following cases is Cory's (D9, D3), and no behaviour is assumed:

- the person is suspended;
- the person closes their account;
- the person loses their credentials;
- the person was removed from the collaboration after an earlier agreement;
- their operational profile is deleted;
- a retention period ends.

In particular, suspension is not assumed to end access to evidence the suspended person is entitled to keep. Whatever Cory decides, the delivered portable artifact (I13) is already in the party's hands and is unaffected.

## 7. Terms: ratified topics, open vocabulary

**Ratified topics [R].** The record must capture nudity level, physical contact and every boundary toggle as values (DOCTRINE:47); compensation amount, down payment and payment timing (DOCTRINE:48); deliverables and delivery timing (DOCTRINE:49); usage rights and the release documents they trigger (DOCTRINE:50). The vision names purpose, roles, explicit compensation, deliverables, image usage, boundaries and safety expectations (VISION:77).

**Suspended.** The previous version organized terms into eight blocks with a detailed field list (wardrobe levels, chaperone, closed set, private change area and so on). The block structure was Fable's and the field vocabulary was inherited from the prototype. Both are suspended until Cory's walkthrough (D1) and terms decision (D4). The first slice carries only the terms its scenario and the ratified topics require.

## 8. What holds regardless of Cory's answers

Deliberately short. Each of these follows from a ratified outcome rather than from a design preference:

- A response always refers to a specific presented state. There is no response to "the collaboration" in general.
- Editing the working terms never changes anything that was presented.
- What a party affirmed remains on record after it is superseded.
- "Agreed" is derived from evidence, so it can be recomputed and checked.

Removed from this list because they assumed answers: that the coordinator signs every version they present; that every listed participant is a party to the whole version; that a decline by one participant blocks agreement for all; that an edit after finalization supersedes the earlier record. Each depends on D2.

## 9. Suspended structures and what unblocks them

| Structure in the previous version | Status | Unblocked by |
|---|---|---|
| Version with one hash and per-block hashes; Record with one common hash; RecordView per party | Suspended | D2 (topology), D10 (visibility) |
| ReviewEvent kinds (accept, decline, concern, withdraw) and "latest event counts" | Suspended | D2 (responses, withdrawal, concerns or counter-proposals) |
| Affirmation fields: account id, session id, typed legal name, adult attestation, term blocks, IP and user agent | Suspended | D3 (credential), D4 (affirmation and metadata), D11 (assurance) |
| OrganizerConfirmation | Suspended | D2 |
| Participant bound to a Profile and so to an Account; `is_organizer` flag; `organizer_account` on the collaboration | Withdrawn in that form | D1, D3, D12; replaced conceptually by sections 1 and 2 |
| Profile, with `subject` separate from `holder` "so the youth partition does not require a new identity model" | Withdrawn from the first slice | Not needed for a first collaboration; representation is designed when Cory opens it |
| Audience (adult / youth) on collaborations and content | Withdrawn | Designed with the partition, by Cory and counsel (I9) |
| BearerGrant as one mechanism for invitations, share links and access grants | Reduced to an invitation credential, designed after D3 | A second use, in a later stage |
| Invitation claim rule: verified email must match the invited address | Kept as a recommendation [F] | D3 (forwarded and mis-addressed invitations) |
| Eight term blocks and their field lists | Suspended | D1, D4 |
| Two compensation kinds (paid, trade); ranges as two numbers | Suspended | D4 |
| Two system presets (paid, trade) | Withdrawn | D1 selects one scenario |
| Documents sketch (template, instance, signatures via the same affirmation) | Suspended | D8, and D7 for whether a document can exist outside a collaboration |
| Retrieval "forever"; no purge command | "No purge path until a policy exists" kept [F]; "forever" withdrawn | D9 |

## 10. Deliberately not modelled

Media, comp cards, portfolios, concept posts, access requests, availability, reminders, reports, strikes, blocks, entitlements, plans, represented talent, organizations, and the youth partition. No claim is made that adding them later will leave the first slice's model untouched.
