# Planning package: Modeling Standard from ground zero

**Status: REVIEW. Not implementation authority.**

Prepared 2026-09-29 by Fable 5.1 from a read-only reconnaissance of `seeravenproductions/ShootBriefGenerator` at commit `bfbf5f1` (docs dated 2026-07-15 to 2026-07-23), checked by an independent Opus 5.5 review, then reconciled on 2026-10-02 after Astra's adversarial review. The reconciled package is awaiting human review. The pre-reconciliation baseline is commit `856b037` of this repository.

## Purpose

This package answers one question:

> If Cory had explained Modeling Standard this clearly before any application existed, what product should we build now?

It is a set of recommendations for Cory to read, challenge, amend and approve. Cory's vision is the sole product authority. Nothing here is a product decision unless Cory has made it, and every claim carries a provenance tag.

## Provenance tags

- **[R]** ratified: stated as approved in VISION.md or PRODUCT-DOCTRINE.md of the old repository.
- **[R-prov]** in one of those documents but marked PROVISIONAL there. It keeps that status.
- **[CA]** Cory-attributed but recorded only in an unratified July document. Treat as Cory's leaning until he confirms.
- **[F]** Fable's interpretation, recommendation or proposed mechanism.
- **[OPEN]** unresolved product decision.

No tag is upgraded because a recommendation is elegant, because an answer seems likely, or because later documents depend on it.

## Recommended reading path for Cory

1. `H-cory-decision-packet.md`: the twelve decisions that are his. Start with D1, the walkthrough of one real collaboration.
2. `A-product-interpretation.md`: the product in Fable's words, with owner-approved direction, interpretation and open questions kept apart.
3. `B-product-invariants.md`: the outcomes the product must hold, each separated from the mechanisms proposed for it.
4. `F-first-slice.md`: the envelope for the first collaboration slice and what still blocks it.
5. `I-creative-direction.md`: how it should feel and look.

For Dustin: `RECONCILIATION-REPORT.md`, then G (Stage 0), D, E and B.

## Everything in this package

| File | What it is |
|---|---|
| `RECONCILIATION-REPORT.md` | What Astra's review found, what was accepted, partly accepted or not adopted, and what changed |
| `H-cory-decision-packet.md` | Twelve decisions for Cory, with what is already settled and what each unblocks |
| `A-product-interpretation.md` | Product interpretation |
| `B-product-invariants.md` | Product outcomes, proposed mechanisms, and open exceptions, kept apart |
| `C-product-architecture.md` | Responsibility areas for the first slice; later areas as direction only |
| `D-technical-architecture.md` | Technical recommendations; what Stage 0 needs decided and what waits |
| `E-domain-sketch.md` | Concepts, not a schema: who is acting, obligations, agreement topology, the evidence chain |
| `F-first-slice.md` | Stage 1 as a conditional envelope: outcomes, proposed shape, blocking decisions, real-use gate |
| `G-development-sequence.md` | Stage 0 (product-neutral engineering foundation), Stage 1, and an outline of later stages |
| `I-creative-direction.md` | Experience and visual direction (advisory) |
| `ASTRA-REVIEW.md` | Astra's adversarial review of the package at `856b037`, as received |
| `RECONCILIATION-CHARGE.md` | The charge the reconciliation answered |
| `REVIEW-FINDINGS.md` | The first independent review (of the first draft), with a note on which of its fixes the reconciliation reclassified |
| `REVIEW-CHARGE.md` | The original assignment |
| `../research/CORY-EVIDENCE-RECON.md` | Every Cory-attributed decision in the old repository, its ratification status, open questions, conflicts |
| `../research/PRODUCT-ARCHAEOLOGY.md` | What the old app had and why; vocabulary evidence, not requirements |
| `../research/ENGINEERING-LESSONS.md` | The old app's failure patterns and the design constraints they imply |

## What shaped the package

1. **The ratified layer is thin.** Only VISION.md and PRODUCT-DOCTRINE.md are approved, and both mark parts of themselves provisional or open. Several rulings the team treats as settled (documents-only free tier, comp cards paid, tier names, the "My Standard" page, structured-only messaging) live in unratified July documents and are tagged **[CA]**.
2. **Ratified doctrine is specific about evidence.** Signatures are load-bearing and bound to the clauses they affirm; an eight-element evidence set is approved; everyone on set must have agreed to the terms. The doctrine does not say how many parties share one agreement, how signing works, or what each party sees. Those are open.
3. **The prototype's defects were structural absences**: no authorization choke point, no separation of working state from evidence, no application-owned boundary around anything external. Stage 0 exists to put those in place before any product behaviour depends on them.
4. **Two reviews found the same kind of error twice.** The first draft, and then its corrected version, each turned likely answers into structure: first in acceptance criteria, then in schemas, invariants and a product-bearing Stage 0. The reconciliation separates outcomes from mechanisms and keeps open questions open.
5. **The single most valuable missing input** is a walkthrough of one real collaboration in Cory's words (D1).

## What the package does not do

It does not choose vendors, price anything, design youth operation, write PRDs, produce mockups, or authorize implementation.

## What happens next

Human review of this reconciled package. After that, three separate gates (root `README.md`):

- **Gate 0.** Dustin may approve a Stage 0 PRD for the product-neutral engineering foundation. It needs no Cory decision.
- **Gate 1.** Each piece of the first collaboration slice starts when Cory has answered the decisions it depends on and its PRD is approved.
- **Gate 2.** Real use by real people is authorized separately by Cory.

Opus implements only from an approved PRD, on a branch, through a human-reviewed pull request. No implementation exists in this repository today.
