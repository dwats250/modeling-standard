# Slice — S01 project and party core

Status: APPROVED
Owner: Claude
Approved by: Dustin
Date: 2026-10-05

## Outcome

The application can represent a project and its project-local parties without treating the project creator as a photographer, payer, creative author, obligation holder or proxy for anyone else.

This is the first Modeling Standard product slice. It is intentionally narrower than the full collaboration journey.

## Product decisions required

- `decisions/D01-first-scenario.md` — DECIDED. Project is the common container; creator is role-neutral; posted versus direct-send is distribution, not a separate project type.
- `decisions/D12-who-may-act.md` — DECIDED. No proxy authority; an actor may not affirm or act as another person's consent authority.

No other OPEN decision is answered by this slice.

## Invariants

- Existing authorization remains deny-by-default and object-scoped.
- Account or principal, project creator and project party are not collapsed into one concept.
- Creator carries no implied payer, photographer, concept-author or obligation semantics.
- No person may be represented as having affirmed, signed or accepted anything in this slice.
- No youth, guardian or proxy model is introduced.
- No payment direction is inferred from who created the project.
- No posted or direct-send project subtype is introduced.

## In scope

- A real product `project` module, separate from `stage0` synthetic fixtures.
- Persistence for projects.
- Persistence for project-local party records sufficient to prove that multiple parties may belong to one project without fixed professional roles.
- The actor who created a project is recorded as an audit and authorization fact, not as a commercial role.
- A protected operation to create a project.
- A protected operation to read a project the current principal is authorized to see.
- The smallest internal or data operation needed to represent additional project-local parties for tests and future slices, provided it does not imply invitation, identity verification, acceptance, signing or proxy authority.
- Database migrations and exact runtime grants for the new tables.
- Negative authorization and strict input or output tests through the real application composition.
- Tests proving creator-role neutrality and the absence of accidental role, payment or signature semantics.

Internal code may use `project` and `party`. D05 public-facing vocabulary remains open.

## Explicitly out of scope

- Invitation or participation credentials (D03).
- Email, links, codes or signup.
- Identity verification or adult-verification vendor work (D11).
- Applications, public posting, discovery or direct-send UX.
- Terms, safety fields, compensation, deliverables, usage rights or obligations.
- Applying or acceptance semantics.
- Agreements, affirmation, signatures, witnesses or finalization.
- Visibility rules beyond creator authorization required to exercise this slice.
- UI or public copy.
- Releases and documents.
- Billing, entitlements or free-tier capacity enforcement.
- Cancellation, amendments or roster-change lifecycle.
- Any assumption that a party label is a verified identity.

## Acceptance evidence

1. A synthetic principal can create a project through the real protected HTTP boundary.
2. The persisted creator actor is separate from project-local party records and from any professional or commercial role.
3. The data model can represent at least two project-local parties without assigning either a fixed role such as model or photographer.
4. The schema and API contain no payer, payee, photographer, model, concept-author, compensation, term, signature, acceptance, witness, youth or guardian fields.
5. Creating a project does not imply that the creator is authorized to act for another party.
6. A missing principal is rejected before body parsing, preserving the Stage 0 boundary.
7. A wrong principal cannot read another principal's project through this slice's current authorization rule.
8. Inputs and outputs are strict; internal authorization and audit fields are not leaked in response DTOs.
9. Runtime DB privileges are widened only to the exact operations this slice needs.
10. Existing Stage 0 tests remain green and new product tests run against real PostgreSQL and the production `createApp`.
11. CI builds and boots the resulting artifact.
12. No OPEN Cory decision is silently encoded.

## Expected change surface

Expected, not mandatory filenames:

- a new `src/projects/` product module;
- product table definitions separated from `src/stage0/tables.ts`;
- a migration for project and party persistence plus exact grants;
- `src/app/operation-list.ts` for newly exposed operations;
- focused database and HTTP tests;
- a short as-built note only if something non-obvious needs preserving.

Do not introduce a generic domain framework, plugin architecture or speculative module hierarchy.

## Change-locality check

If Cory later changes what "creator" means, creator authorization and audit handling should be localized.

If D03 later changes how a person is identified or authenticated, party identity binding should be addable without redesigning the project container.

If future obligations or payment rules change, this slice should not need structural changes because it deliberately contains no obligation or payment schema.

## Stop conditions

Stop and report rather than deciding if implementation appears to require:

- binding a project party to an account, person or verified identity;
- deciding how another person joins a project;
- giving the creator authority to sign or consent for someone else;
- defining a professional role taxonomy;
- adding payment, terms, obligations or usage-right semantics;
- choosing public-posting versus direct-send workflow;
- deciding visibility beyond the creator's current access needed for this slice;
- adding a youth or representation model.

Builder lifecycle remains: inspect → implement → test → commit → push → handoff → stop. Do not create or modify a PR.
