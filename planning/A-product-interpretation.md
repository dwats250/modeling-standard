# Deliverable A. Product interpretation

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Fable interpretation for Cory's review. Nothing here is a product decision.

Provenance tags used throughout the package:

- **[R]** ratified: appears in VISION.md or PRODUCT-DOCTRINE.md, both APPROVED by Cory (transcribed 2026-07-23 from the 2026-07-17 review; the docs themselves say this is provenance, not a quotation).
- **[R-prov]** appears in one of those documents but is marked PROVISIONAL there; it keeps that status.
- **[CA]** Cory-attributed but recorded only in an unratified document (COST-REALITY, FEATURE-REVIEW, CORY-QUESTIONS, LAUNCH-MILESTONES). Treat as Cory's leaning until he confirms.
- **[F]** Fable interpretation or recommendation.
- **[OPEN]** a question no document answers.

Source detail for every tag is in `../research/CORY-EVIDENCE-RECON.md`.

---

## 1. Modeling Standard in one paragraph [F]

Modeling Standard is the professional operating system for independent shoot-based creative work. The central piece of work is a **shoot**: a collaboration among adults such as a photographer, a model, a makeup artist, a stylist, and sometimes a client. The spine of the product is the **agreement record**: before anyone commits time, money or their body to a shoot, each person reviews the terms relevant to them and agrees to exactly what they were shown, and afterwards each holds a frozen record of what was agreed, by whom, and when. Whether that is one agreement or several related ones, and what each person sees of the others' terms, are Cory's decisions (D2, D10). Around that spine grows the professional suite an independent would otherwise assemble from eight apps: identity and comp cards, portfolios, moodboards and concept posts, availability, delivery, records. Safety is the foundation of the design and mostly invisible in the experience: the product is sold as the better way to run a freelance modeling or photography business, and it protects people by making ambiguity unavailable rather than by policing behaviour.

## 2. Core user problem

**[R]** Collaborations are assembled from Instagram DMs, texts, verbal discussion, scattered PDFs and unwritten assumptions. Terms that were never explicit are re-negotiated on the day, usually downward and usually against the party with less leverage. Afterwards nobody can prove what was agreed. Cory has lost money and months of work to verbal terms; models he has worked with say nobody else runs shoots with overt consent at every stage.

**[F]** The repository's competitive scan (agent-authored, not a Cory position) concludes that the real competitor is the status quo: a DM, a Canva comp card, and a paper release someone maybe brings. I agree with it.

**[R]** Cory names two catastrophic outcomes the product must design against simultaneously: false protection (a honeypot that claims safety it does not enforce) and weaponized accusation (a reputation engine built on unsupported claims). "That tension is the actual product."

**[F]** The problem is not that people lack documents. It is that producing the documents is more work than not producing them, so the informal path wins by default. The product wins only if the documented path is the easier one.

## 3. Primary user groups

| Group | Standing in the docs | Notes |
|---|---|---|
| Models (adult, independent) | Lead surface **[R]** ("model-forward") | The person the majority of the app is shaped for. |
| Photographers | Primary participant **[R]**; probably the larger paying segment **[F]** (an agent inference in the July reconciliation, not Cory's) | Cory is one; his warm network is photographers who bring their crews. Their protection is financial and contractual (payment, deliverables, terms). |
| Crew: makeup artists, hair, wardrobe stylists, assistants | Must agree to the terms to be on set **[R]** | "If you have not agreed to the terms of the shoot, you are not on set." Their protection: financial, deliverables, consumables. |
| Organizers and clients | Invitees, free **[CA]** | Fashion-week organizers (the only real brief example in the docs), grad/wedding/event clients. Brief creators as well as invitees. |
| Guardian managers | Lead surface for the youth ecosystem **[R]**; youth launch deferred pending professional legal review **[R]** (VISION:463; DOCTRINE:89); the youth design itself is unresolved | A minor is never an account holder. Not built, and not prepared for with placeholders, in the first stages. |
| Agents / agencies managing several adults | Named in tier thinking **[CA]** | Later. Representation is designed when Cory opens it; whether anyone acts for another party in the first slice is D12. |

## 4. Core value loop [F, built from R]

```
propose  ->  present terms  ->  each party reviews and responds  ->  final
   ^                                                                   |
   |                                                                   v
next shoot  <-  records and deliverables  <-  the shoot happens (unwitnessed)
```

The loop is entered from the garden (a comp card to send, a concept to post, a client to onboard) and it exits into the garden (a record in the archive, delivered images, an updated professional presence). Most of the professional suite either feeds a shoot or is fed by one. That is a useful test of coherence, and it is Fable's thesis, not Cory's rule: the ratified vision also contains things that stand on their own, such as free documents for work with people who are not on the app (VISION:469) and comp cards as an acquisition wedge (VISION:420). The exact steps of the loop (how terms are presented, what responses exist, when it becomes final) are open (D2).

**[R]** "The consent record is the point. The workflow only exists to produce it." The record protects the photographer exactly as much as the model.

## 5. Professional-suite thesis

**[R]** Market position: a "freelance app for the new age of agency redundancy"; people need "an option between amateur and signed" (VISION:459). The all-in-one business dashboard is "a first-class value proposition, not a side feature" and "the acquisition engine for the non-fearful majority." Priority order in Cory's words: safety documents, briefs, comp cards ("the wedge"), portfolios, moodboards.

**[F]** The suite should not be a bundle of tools next to a brief generator. It should read as one professional life seen from different angles: an identity that can be sent, a concept that can be posted, a shoot that can be agreed, a record that can be kept, and a schedule that connects them. The old app failed this test (recon B: "two products bolted together"). Fable's thesis is that the rebuild passes it by keeping the agreement spine central. That is an architectural preference; it does not require every future capability to hang from a shoot.

## 6. Safety mechanism

**[R]** The strongest safety mechanism is the record itself plus the removal of affordances that create risk: no negotiable rates, no profile browsing, no free-text reviews, no user-to-user payments, no unstructured messaging **[CA]**. "Bad actors fear the record." Refusing to use a free tool whose only effect is transparency "is itself a red flag." Signatures are "the TSA of the brief world": a checkpoint that documents and deters, not a legal instrument.

**[R]** The product freezes the agreement; it does not witness the performance. It is not a lawyer, a court, or an enforcement authority, and it never claims more than it enforces.

**[F]** Concretely, the mechanism has four layers, in order of strength:
1. Structural absence (the thing that enables pressure does not exist in the product).
2. Server-enforced rules that cannot be reached around through the UI.
3. The frozen, mutually held record.
4. Reactive trust operations (reports, strikes, suspension), deliberately narrow.

## 7. Acquisition thesis

**[R]** "Beautiful garden, invisible walls." Protection is the foundation, not the pitch. Fear framing is off-brand.

**[CA]** Every brief sent to someone without an account is a warm, contextual invitation; invitee participation is free. "Only two doors: invite, or someone's page" (the "My Standard" link page). Comp cards are the wedge because models keep asking Cory how to make one. Cory's own network is the cold-start answer; an invite-gated beta is a strong lean.

**[F]** The acquisition loop is the collaboration loop: a person arrives through a real shoot they were invited to, and returns to arrange their own. Under Cory's July ruling **[CA]** the person who initiates is the paying professional and the invitee takes part for free; where exactly that line falls is open (D7). Either way the invited person's experience on a phone matters more than anything else in the first slice.

## 8. Long-term product shape

**[R]** Two ecosystems on one system: an adult professional ecosystem that globalizes, and a youth ecosystem that is jurisdiction-locked, guardian-managed, never browsable, with content classified into one world at creation. Documents and PDFs free at every tier, including for people working with non-users; monetization in volume and professional convenience, never in safety.

**[CA]** Capacity ladder Free / Standard / Gold Standard / Diamond Standard; manager ladder Guardian / Agent / Agency; free tier documents-only; paid line is initiating presence (own profile, cards, boards, briefs).

**[F]** Shape in five years: the place a working independent keeps their professional life, where every shoot they have ever done has a record, every collaborator they have ever worked with was met through work rather than a directory, and where a guardian can run a child's early career under the same discipline without the child ever having an account.

## 9. What is owner-approved, what is my interpretation, what is open

### Owner-approved direction (do not reopen by inference)
- Primary identity: safety platform, positioned externally as a professional business suite. **[R]** (Cory: "settled and I don't want it reopened.")
- Freeze the agreement, not witness the performance; the 8-element evidence set; signatures load-bearing and bound to the clauses they affirm; append-only consent records that outlive account deletion. **[R]**
- Every participant must agree to the terms to be on set; each reviews the terms relevant to them. **[R]**
- Each party holds the final artifact independently. **[R]** How long records stay retrievable inside the product is subject to retention rules not yet set. **[R-prov]**
- Explicit compensation; no negotiable; no user-to-user payments. **[R]**
- No people directory; the work is public, the people are not; a person's professional material is seen only on request, from its owner, for a bounded time. **[R]**
- Adults only as account holders; guardian manager as real infrastructure; youth is a sealed partition; youth launch deferred pending professional legal review (VISION:463, VISION:531). **[R]** The [R] covers the deferral, not any future youth design, which is unresolved.
- Documents and PDFs never paywalled. **[R]**
- Greenfield replacement; diligence outranks any date. **[R]**
- "A rollout that is too slow kills the trust... The launch must arrive substantially whole." **[R]** (VISION:409-411) (See Deliverable H, decision D6: this is in tension with slice-at-a-time delivery and must be reconciled by Cory, not by us.)

### My interpretation (Cory may correct)
- The agreement record is central and the suite coheres around it (section 5). A thesis, not a requirement on every future feature.
- The invited person's flow is the acquisition loop, so the first slice's phone experience matters more than desktop authoring (section 7).
- "One engine plus presets" **[CA]** is the right reading of the six historical brief builders; the old field list is vocabulary to check against Cory's walkthrough, not a spec.
- Safety appears in the UI as clarity and defaults, never as warnings (Deliverable I).
- Slice-at-a-time is a build discipline, not a launch shape. Whether real shoots may run before the public launch is Cory's (D6).

### Open (needs Cory; see Deliverable H)
- One real collaboration walked through: who organizes, takes part, pays, delivers, grants rights, and which documents it needs (D1).
- What the agreement is with several parties, when it is final, and what happens on withdrawal, cancellation, roster change and amendment (D2).
- What a person needs in order to read, sign and return: account, code, recovery (D3).
- The terms, the clause wording, who owes what to whom, and what signing looks like (D4).
- User-facing vocabulary (D5).
- Whether real collaborations may run before the public launch (D6).
- What "initiating" means, whether it is paid, and whether free documents can be reached without it (D7).
- Which documents a scenario needs before real use (D8).
- Retention, and access to evidence after closure, suspension, lost credentials and removal (D9).
- What each party sees, before, during and after agreement (D10).
- How adulthood is assured before verification exists, and what the product may claim (D11).
- Whether everyone acts only for themselves (D12).

## 10. Evidence limits

- Nothing in the repository post-dates 2026-07-23. Cory may have decided things since.
- The only real brief in the docs is an event organizer's email to a photographer. There is no Cory-authored model/photographer brief on file. Which journey leads has been an open question since July (CORY-QUESTIONS:54); a walkthrough of one real collaboration is the single most valuable input still missing.
- All "Cory said" text is an agent or Dustin transcription.
