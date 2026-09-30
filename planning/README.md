# Planning package: Modeling Standard from ground zero

**Status: REVIEW. Not implementation authority.**

Prepared 2026-09-29 by Fable 5.1, from a read-only reconnaissance of `seeravenproductions/ShootBriefGenerator` at commit `bfbf5f1` (docs dated 2026-07-15 to 2026-07-23), then checked by an independent Opus 5.5 review whose findings are included.

## Purpose

This package answers one question:

> If Cory had explained Modeling Standard this clearly before any application existed, what product should we build now?

It is a set of recommendations for Cory to read, challenge, amend and approve. Nothing in it is a product decision unless Cory has made it, and every claim carries a provenance tag.

## Provenance tags

- **[R]** ratified: in VISION.md or PRODUCT-DOCTRINE.md of the old repository, both approved by Cory.
- **[CA]** Cory-attributed but recorded only in an unratified July document. Treat as Cory's leaning until he confirms.
- **[F]** Fable's interpretation or recommendation.
- **[OPEN]** no document answers it.
- **[R-prov]** in an approved document but tagged PROVISIONAL there.

## Recommended reading path for Cory

1. `H-cory-decision-packet.md`: the eleven decisions that are his. Seven bear on the first slice.
2. `A-product-interpretation.md`: the product in Fable's words, with owner-approved direction, interpretation and open questions kept apart.
3. `B-product-invariants.md`: nine constraints, each with the test that proves it.
4. `F-first-slice.md`: the recommended first piece of the product, with acceptance criteria.
5. `I-creative-direction.md`: how it should feel and look.

The rest is there for deeper inspection and does not need to be read to make the decisions in H.

## Everything in this package

| File | What it is |
|---|---|
| `H-cory-decision-packet.md` | Eleven decisions for Cory: D1 to D5 (first slice), D6 to D9 (before stage 2, stage 3 or beta), D10 and D11 (added by the review: multi-party visibility, adult attestation). Includes the paywall boundary question (D7). |
| `A-product-interpretation.md` | Product interpretation |
| `B-product-invariants.md` | Product invariants |
| `C-product-architecture.md` | Product and domain architecture |
| `D-technical-architecture.md` | Technical architecture; decide-now versus defer |
| `E-domain-sketch.md` | Conceptual data model for the first slices; flagged modeling decisions |
| `F-first-slice.md` | First vertical slice recommendation and acceptance criteria |
| `G-development-sequence.md` | Seven stages from empty repository to adult beta, plus two gated stages |
| `I-creative-direction.md` | Experience and visual direction |
| `REVIEW-FINDINGS.md` | The independent review of the first draft; its findings were accepted with few exceptions and are reflected in the documents above |
| `REVIEW-CHARGE.md` | The assignment this package answers |
| `../research/CORY-EVIDENCE-RECON.md` | Every Cory-attributed decision in the old repository, its ratification status, open questions, conflicts |
| `../research/PRODUCT-ARCHAEOLOGY.md` | What the old app had and why; vocabulary evidence, not requirements |
| `../research/ENGINEERING-LESSONS.md` | The old app's failure patterns and the design constraints they imply |

## Five findings that shaped the package

1. The ratified layer is thin: only VISION.md and PRODUCT-DOCTRINE.md are approved. Several rulings the team treats as settled (documents-only free tier, comp cards paid, tier names, the "My Standard" page, structured-only messaging) live in unratified July documents and are tagged **[CA]**.
2. Cory's ratified doctrine is stricter than the review charge in two places: signatures are load-bearing with an eight-element evidence set, and every person on set must have agreed to the terms. The first slice is built to the doctrine (n parties including the organizer, per-block affirmation), and covers seven of the eight evidence elements; the eighth (release documents triggered by usage) arrives in stage 2.
3. The prototype's defects are almost all instances of three structural absences: no authorization choke point, no separation of working state from evidence, no application-owned boundary around anything external. The technical architecture removes those absences by structure.
4. The prototype was two products bolted together (an agreement spine and a presence layer that never met). The domain architecture makes the agreement record the centre and every other feature a view on it.
5. The single most valuable missing input is a walkthrough of one real shoot in Cory's words (decision D1).

## What the package does not do

It does not choose vendors, price anything, design youth operation, write PRDs, or produce mockups. Each of those has a named stage or a named decision.

## What happens next

Cory answers the decisions in H that bear on the first slice. Fable then writes the Stage 0 and Stage 1 PRDs against those answers. Opus implements only from an approved PRD, on a branch, through a human-reviewed pull request. No implementation exists in this repository today.
