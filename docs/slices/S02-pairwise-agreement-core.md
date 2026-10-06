# Slice — S02 pairwise agreement topology core

Status: APPROVED
Owner: Claude
Approved by: Dustin
Date: 2026-10-05

## Outcome

The application can represent a private pairwise agreement relationship between two project-local parties under one project without deciding terms, identity, visibility, signing or lifecycle.

This slice implements only the agreement **topology** Cory has directly settled in D02.

## Product decisions required

- `decisions/D02-agreement-topology-lifecycle.md` — OPEN overall, but the **structure** subpart is directly decided: commercial and craft agreements are private and pairwise under the project; unrelated participants do not hold up one another's agreement.
- `decisions/D12-who-may-act.md` — DECIDED. A party relationship never creates proxy authority.
- `decisions/D01-first-scenario.md` — DECIDED. The project remains the common container and creator remains role-neutral.

This slice relies only on those answered subparts. It does not use the still-open D02 lifecycle questions.

## Invariants

- A pairwise agreement relates exactly two distinct project-local parties.
- Both parties belong to the same project as the agreement.
- Neither side of the pair has implied precedence, professional role, payer/payee status or obligation direction.
- Project creator is not automatically a party to an agreement.
- An agreement relationship does not imply identity verification, invitation, acceptance, affirmation, signature or proxy authority.
- The existence of an agreement relationship does not make it final, accepted or visible to anyone.
- Universal safety/consent terms are not modeled in this slice; they are a separate settled concept that requires later term and roster work.
- No public-facing vocabulary is selected by the internal name used in code.

## In scope

- Persistence for a pairwise agreement relationship under a project.
- References to exactly two existing `project_party` rows.
- Database constraints that prevent:
  - a party being paired with itself;
  - either referenced party belonging to a different project;
  - references to parties that do not exist.
- A small data-layer function to create and read the relationship for tests and later slices.
- Runtime database grants limited to the exact read/insert operations needed.
- Real-PostgreSQL tests proving the topology and constraints.
- Extension of existing Stage 0/S01 table and privilege pins without weakening them.

Internal code may call this a `pairwiseAgreement` or equivalent. D05 public vocabulary remains open.

## Explicitly out of scope

- Any HTTP route or UI for creating, listing or reading agreements.
- Who is authorized to create an agreement relationship.
- How a person becomes or is bound to a `project_party` (D03).
- Visibility of agreements or counterparties (D10).
- Agreement terms or clause content (remaining D04).
- Safety/consent terms or the universal on-site layer.
- Compensation, value, deliverables, usage rights or obligations.
- Which party proposed anything.
- Directionality between the two parties.
- Agreement status.
- Presentation, review, acceptance, decline or withdrawal.
- Finality.
- Amendment, cancellation or roster-change lifecycle.
- Affirmation, signature, witnesses or evidence artifacts.
- Limits on how many pairwise agreement records may exist between the same two parties.
- Public product wording.

## Acceptance evidence

1. A pairwise agreement can be persisted under a project between two distinct project-local parties of that project.
2. The database rejects pairing a party with itself.
3. The database rejects a pair where either party belongs to another project.
4. The database rejects references to nonexistent parties.
5. The stored relationship contains no professional role, payer/payee, obligation, term, status, signature, identity, invitation, visibility or lifecycle semantics.
6. No HTTP operation is added by S02.
7. Existing project creation/read authorization remains unchanged.
8. Runtime privileges on the new table are exact and no broader than the slice requires.
9. Existing Stage 0 and S01 tests remain green.
10. New tests run against real PostgreSQL and the production migration path.
11. CI builds and boots the artifact.
12. No unanswered D02/D03/D04/D10 question is encoded.

## Expected change surface

Expected, not mandatory filenames:

- `src/projects/tables.ts` or a small adjacent agreement-table file;
- a focused `src/projects/agreement.ts` data module;
- one reviewed migration for topology and constraints;
- one reviewed migration or grant change for exact runtime privileges;
- database tests;
- existing table/privilege pin tests.

No HTTP operation-list change should be necessary.

Do not introduce a generic relationship engine, workflow engine, agreement state machine, event log or policy framework.

## Change-locality check

If D03 later changes how parties map to people or credentials, the agreement topology should not change.

If D04 later changes the term set or compensation/value model, terms should attach to the agreement without changing which two parties it relates.

If D10 later changes who can see an agreement, visibility policy should be addable without redesigning the stored pair.

If D02 later answers cancellation/amendment/finality questions, lifecycle state should be addable without replacing the pairwise topology.

## Stop conditions

Stop and report rather than deciding if implementation appears to require:

- deciding who may create an agreement;
- binding a party to an account, identity or invitation;
- making either side of the pair a special role;
- defining payer/payee or obligation direction;
- deciding whether duplicate pairwise agreement records are allowed or forbidden;
- defining terms or safety content;
- exposing any agreement through HTTP;
- deciding visibility;
- adding agreement status or lifecycle;
- adding affirmation/signature/evidence behavior.

Builder lifecycle remains: inspect → implement → test → commit → push → handoff → stop. Do not create or modify a PR.
