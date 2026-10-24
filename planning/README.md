# Planning package — historical product reconstruction

**Historical evidence, not the current product status, implementation queue, or agent instructions.** This September–October 2026 package captured the product direction during the ground-up reconstruction of Modeling Standard. The current application has since progressed through numerous implemented engineering slices.

Start with the [root README](../README.md) for the product and development focus, the [current engineering index](../docs/engineering/README.md) for implementation, and [decisions](../decisions/README.md) for Cory's later rulings. This planning package and its provenance annotations remain intact as evidence of the earlier analysis.

Prepared 2026-09-29 from the earlier repository at `seeravenproductions/ShootBriefGenerator` commit `bfbf5f1`, independently reviewed and reconciled on 2026-10-02. Earlier implementation and project setup were carried out by Dustin; the historical source repository was under Cory's GitHub account. The pre-reconciliation baseline is commit `856b037` of this repository.

## Purpose

This package answers one question:

> If Cory had explained Modeling Standard this clearly before any application existed, what product should we build now?

At the time, this was a recommendation set for Cory to review. **It is not today's approval checklist.** Later ratified decisions are in `../decisions/`; provenance tags here still identify what was known, inferred, or open at the time.

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

The rest is there for deeper inspection and does not need to be read to make the decisions in H.

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

## Current interpretation of this historical package

The original future-work instructions have been superseded by implemented slices and the current [repository operating contract](../CLAUDE.md). Follow the current work order, code, tests, [engineering index](../docs/engineering/README.md), and [latest Cory rulings](../decisions/README.md), not the stage order or gate language proposed in this package.

**Real-use authorization remains a separate protected boundary.** Synthetic demonstrations do not open it.
