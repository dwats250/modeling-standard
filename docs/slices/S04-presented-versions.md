# Slice — S04 presented versions

Status: PROPOSED. Built ahead of approval at Dustin's direction (2026-10-08), stacked on S03, and held at the merge seam: not merged until Dustin approves this PRD (and S03 before it).
Owner: Claude
Approved by: (pending: Dustin)
Date: 2026-10-08

## Outcome

The application can freeze exactly which terms were chosen for presentation, in which order and with which wording, as an immutable presented version. This works for both layers:
- a pairwise agreement's terms;
- a project's universal safety and consent terms.

For a pairwise agreement, dropping a term and resending (D02) is a new version that leaves the term out, and the earlier version stays exactly as it was. For the universal layer, this slice claims only that versions are frozen and independent. Whether a safety term may be left out of a later version is open.

"Presented" here means frozen for presentation. No recipient, viewing or delivery is recorded.

## Product decisions required

- **Ratified doctrine:**
  - clause text is frozen as presented **[R]** (DOCTRINE:46, quoted in D04's "Already settled");
  - a change cannot silently rewrite an earlier agreement **[R]** (DOCTRINE:46, DOCTRINE:56, as cited in `planning/F-first-slice.md` outcome 5).
- **`decisions/D02-agreement-topology-lifecycle.md`** (OPEN overall). This slice relies only on the 2026-10-05 partial rulings:
  - the two layers;
  - no counters;
  - "if a term is not accepted, the proposer may drop it and resend". This applies to pairwise agreements only; Cory has not ruled it for the universal layer.
- **`decisions/D04-terms-and-affirmation.md`** (OPEN overall). This slice relies only on the ruling that each term is individually represented and is the unit of the record.
- **S03, proposed:** the terms being presented.

## Invariants

- A presented version is sealed when it is created:
  - it commits holding exactly its declared number of terms, in positions 1 to that number;
  - no term can be added later;
  - nothing in it can be updated or deleted by the runtime role.
- Every presented term is a faithful copy of a term of the same container that the presenting transaction can see. The database rejects a copy whose text differs from its source, including when the source is committed by another transaction mid-presentation.
- The presentation time is the database clock time the version row was written (`clock_timestamp()`). The caller cannot supply it.
- A later version never changes an earlier one.
- Each container's versions are numbered 1, 2, 3, and so on. The database rejects gaps and back-filling, and concurrent presentations queue.
- The order of terms in a version is the order the caller chose. No presentation order (ruling 4) is decided here.

## In scope

- Tables:
  - `agreement_version` (pairwise agreement, sequence, term count, presented_at);
  - `agreement_version_term` (copy of an `agreement_term` of the same agreement, in a position);
  - `universal_version` and `universal_version_term`, the project-level equivalents.
- Composite foreign keys that tie each presented term to a version and a source term of the same container. This needs `(container, id)` unique constraints on S03's term tables.
- Database triggers (`migrations/0010`) for sealing, faithful copy, next-number sequencing and database-set time.
- Data functions:
  - present a version from a list of chosen term ids;
  - find a version with its terms;
  - list a container's versions in sequence order.
- Runtime grants: `SELECT` and `INSERT` on the four tables only. The trigger functions are not callable directly.
- Real-PostgreSQL tests covering both layers, plus the existing pins.

## Explicitly out of scope

Each of these is open, not defaulted.

- **Who presents and to whom.** No proposer or recipients are recorded (D03, D10, D12; D02 names "the proposer" but not how one is identified).
- **Supersession.** Whether a later version withdraws or replaces an earlier one, and what is "current". That is D02 lifecycle: (d) withdrawal, (g) amendments, (h) the earlier agreement while a change is pending.
- **Completeness.** Which terms must be present or complete before presenting (D04).
- **Requiredness and body/money classification** (see S03).
- **A document digest or hash.** D04 lists document hash among the evidence still parked.
- **Who is on site,** who universal versions are presented to, and whether everyone on site sees the same version (D02 f, D10).
- **Whether a universal term may be dropped or left out of a later universal version** (VISION:374, ruling 14). The caller chooses the terms of every version. No product behaviour built on this may treat leaving a safety term out as allowed.
- **Escalation (ruling 6).** A later version may raise a boundary over an earlier one, and ruling 6 then requires a neutral record and a mandatory delay before acceptance. S04 records versions only. Any slice that lets someone affirm a later version must stop on this.
- **Presentation order across layers** (ruling 4).
- **Affirmation and finality.** Finality is blocked until Cory says what makes a term required (D04, D02).
- **Any HTTP route.**

## Acceptance evidence

For each layer:

1. Presenting chosen terms freezes them in the order given, as copies carrying their source term ids. The version reads back unchanged.
2. A later version holding fewer terms leaves the earlier version unchanged, and versions list in sequence order. For pairwise versions this is drop-and-resend; for universal versions no such claim is made.
3. Terms written after presentation do not change a version.
4. Presenting a term of another container, or an unknown term, fails and leaves no version behind.
5. Presenting a term twice in one version fails. Presenting no terms fails.
6. Concurrent presentations get distinct, contiguous sequence numbers.
7. Raw SQL as the runtime role cannot:
   - add a term to a committed version;
   - commit a version row alone, or short of its declared terms;
   - copy a concurrently committed term with different text;
   - choose a sequence number other than the next one;
   - use positions outside 1..count;
   - store a copy whose text differs from its source;
   - backdate presentation, even by holding a transaction open;
   - point a presented term at another container's version or term;
   - update, delete or truncate versions or their terms.
8. No column or constraint names an actor, direction, lifecycle, supersession, requiredness, classification, affirmation or digest.
9. The trigger functions cannot be called by the runtime role, and they pin `search_path` with `pg_temp` last.
10. No HTTP operation is added, the runtime privilege pin is exact, and all prior tests stay green.

## Expected change surface

- `src/projects/tables.ts`: four tables, plus two composite uniques on the S03 tables.
- `src/projects/versions.ts`.
- `migrations/0009` (generated, hand-reordered so the uniques precede the foreign keys that need them) and `migrations/0010` (triggers and grants).
- `tests/database/versions.test.ts`, plus the pins.
- `docs/engineering/S04-PRESENTED-VERSIONS.md`.

No workflow engine, state machine or generic versioning framework is introduced.

## Change-locality check

- **If Cory decides how supersession works:** it is derived from or added beside versions (for example a lifecycle record). Versions stay as they are.
- **If a proposer or recipients are decided:** columns or adjacent rows attach to the version.
- **If a digest is decided:** it is computed over the frozen rows and added beside them.
- **If completeness rules are decided:** they are a check at presentation time in `versions.ts`.

## Stop conditions

Stop and report rather than deciding if implementation appears to require:
- recording who presented or to whom;
- deciding which version is current or in force;
- validating completeness;
- adding a digest;
- changing any presented row;
- deciding presentation order;
- deciding whether a universal term may be left out;
- letting anyone affirm a later version that changes a boundary (ruling 6).
