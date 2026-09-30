# Deliverable A. Product interpretation

Status of this document: Fable interpretation for Cory's review. Nothing here is a product decision.

Provenance tags used throughout the package:

- **[R]** ratified: appears in VISION.md or PRODUCT-DOCTRINE.md, both APPROVED by Cory (transcribed 2026-07-23 from the 2026-07-17 review; the docs themselves say this is provenance, not a quotation).
- **[CA]** Cory-attributed but recorded only in an unratified document (COST-REALITY, FEATURE-REVIEW, CORY-QUESTIONS, LAUNCH-MILESTONES). Treat as Cory's leaning until he confirms.
- **[F]** Fable interpretation or recommendation.
- **[OPEN]** a question no document answers.

Source detail for every tag is in `../research/CORY-EVIDENCE-RECON.md`.

---

## 1. Modeling Standard in one paragraph [F]

Modeling Standard is the professional operating system for independent shoot-based creative work. The unit of work is a **shoot** (a collaboration between two or more adults: photographer, model, makeup artist, stylist, organizer, client). The spine of the product is the **agreement record**: before anyone commits time, money or their body to a shoot, every participant reads the same version of the terms, agrees to exactly that version, and afterwards every participant holds a frozen copy of what was agreed, by whom, and when, under one common hash (what each party sees of the others' terms is decision D10). Around that spine grows the professional suite an independent would otherwise assemble from eight apps: identity and comp cards, portfolios, moodboards and concept posts, availability, delivery, records. Safety is the foundation of the design and mostly invisible in the experience: the product is sold as the better way to run a freelance modeling or photography business, and it protects people by making ambiguity unavailable rather than by policing behaviour.

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
| Crew: makeup artists, hair, wardrobe stylists, assistants | Full parties **[R]** | "If you have not agreed to the terms of the shoot, you are not on set." Their protection: financial, deliverables, consumables. |
| Organizers and clients | Invitees, free **[CA]** | Fashion-week organizers (the only real brief example in the docs), grad/wedding/event clients. Brief creators as well as invitees. |
| Guardian managers | Lead surface for the youth ecosystem **[R]**; youth launch DEFERRED **[R]** | A minor is never an account holder. Not built in the first implementation. |
| Agents / agencies managing several adults | Named in tier thinking **[CA]** | Later. Architecture must not preclude an account acting for a represented profile. |

## 4. Core value loop [F, built from R]

```
propose  ->  present a version  ->  each party reviews and agrees  ->  freeze
   ^                                                                     |
   |                                                                     v
next shoot  <-  records and deliverables  <-  the shoot happens (unwitnessed)
```

The loop is entered from the garden (a comp card to send, a concept to post, a client to onboard) and it exits into the garden (a record in the archive, delivered images, an updated professional presence). Every part of the professional suite either feeds a shoot or is fed by one. That is the criterion for whether a feature belongs.

**[R]** "The consent record is the point. The workflow only exists to produce it." The record protects the photographer exactly as much as the model.

## 5. Professional-suite thesis

**[R]** Market position: "a freelance app for the new age of agency redundancy, an option between amateur and signed." The all-in-one business dashboard is "a first-class value proposition, not a side feature" and "the acquisition engine for the non-fearful majority." Priority order in Cory's words: safety documents, briefs, comp cards ("the wedge"), portfolios, moodboards.

**[F]** The suite is not a bundle of tools next to a brief generator. It is one object model seen from different angles: a professional identity that can be sent, a concept that can be posted, a shoot that can be agreed, a record that can be kept, and a schedule that connects them. The old app failed this test (recon B: "two products bolted together"). The rebuild passes it only if the agreement spine is the centre of the domain model and everything else references it.

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

**[F]** The acquisition loop is the collaboration loop: the organizer is the paying professional, the invitee arrives for free through a real shoot, and the invitee becomes an organizer on their next shoot. The first slice should therefore be built so that the invitee experience is excellent on a phone and ends with a reason to keep the account.

## 8. Long-term product shape

**[R]** Two ecosystems on one system: an adult professional ecosystem that globalizes, and a youth ecosystem that is jurisdiction-locked, guardian-managed, never browsable, with content classified into one world at creation. Documents and PDFs free at every tier, including for people working with non-users; monetization in volume and professional convenience, never in safety.

**[CA]** Capacity ladder Free / Standard / Gold Standard / Diamond Standard; manager ladder Guardian / Agent / Agency; free tier documents-only; paid line is initiating presence (own profile, cards, boards, briefs).

**[F]** Shape in five years: the place a working independent keeps their professional life, where every shoot they have ever done has a record, every collaborator they have ever worked with was met through work rather than a directory, and where a guardian can run a child's early career under the same discipline without the child ever having an account.

## 9. What is owner-approved, what is my interpretation, what is open

### Owner-approved direction (do not reopen by inference)
- Primary identity: safety platform, positioned externally as a professional business suite. **[R]** (Cory: "settled and I don't want it reopened.")
- Freeze the agreement, not witness the performance; the 8-element evidence set; signatures load-bearing; append-only consent records that outlive account deletion. **[R]**
- Every participant must agree to the terms to be on set. **[R]**
- Explicit compensation; no negotiable; no user-to-user payments. **[R]**
- No people directory; the work is public, the people are not; access begins from something deliberately shared, is scoped and expiring. **[R]**
- Adults only as account holders; guardian manager as real infrastructure; youth is a sealed partition; youth launch deferred pending counsel. **[R]**
- Documents and PDFs never paywalled. **[R]**
- Greenfield replacement; diligence outranks any date. **[R]**
- "A rollout that is too slow kills the trust. The launch must arrive substantially whole." **[R]** (See Deliverable H, decision D6: this is in tension with slice-at-a-time delivery and must be reconciled by Cory, not by us.)

### My interpretation (Cory may correct)
- The agreement record is the centre of the domain model and the suite is a set of views on it (section 5).
- The invitee flow is the acquisition loop, so the first slice's phone experience matters more than the organizer's desktop authoring (section 7).
- "One engine plus presets" **[CA]** is the right reading of the six historical brief builders; the union field list is vocabulary, not a spec.
- Safety appears in the UI as clarity and defaults, never as warnings (Deliverable I).
- Slice-at-a-time is a build discipline, not a launch shape; a private beta with real shoots is compatible with "launch whole" if the public launch waits for the garden (Deliverable G).

### Open (needs Cory; see Deliverable H)
- Which collaboration story leads and a walkthrough of one real shoot (D1).
- The agreement state machine: organizer confirmation, re-acceptance after a change, withdrawal, and whether per-term counter-proposals (Cory's July model) come in slice 1 or later (D2).
- Whether agreeing requires an account or a one-time code is enough (D3).
- The minimum set of presented terms and the form of the affirmation (D4).
- User-facing vocabulary (brief, shoot, collaboration, agreement, record) (D5).
- How "launch whole" and staged delivery reconcile (D6).
- Whether initiating a shoot is free or part of paid presence: the charge and Cory's July ruling differ (D7).
- Essential document set, and whether real shoots may run on records without releases before stage 2 (D8).
- Evidence retention after account closure (D9).
- What each party sees in a multi-party shoot, before and after agreement (D10).
- Adult attestation before verification exists (D11).

## 10. Evidence limits

- Nothing in the repository post-dates 2026-07-23. Cory may have decided things since.
- The only real brief in the docs is an event organizer's email to a photographer. There is no Cory-authored model/photographer brief on file. The walkthrough Cory asked for (CORY-QUESTIONS §12) was never answered; it is the single most valuable input still missing.
- All "Cory said" text is an agent or Dustin transcription.
