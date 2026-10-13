# Slice — S03 term units

Status: PROPOSED. Built ahead of approval at Dustin's direction (2026-10-08). The branch is held at the merge seam and is not merged until Dustin approves this PRD.
Owner: Claude
Approved by: (pending: Dustin)
Date: 2026-10-08

## Outcome

The application can hold terms as individually represented units in the two layers Cory has ruled:
- universal safety and consent terms, held on the project;
- private commercial and craft terms, held on a pairwise agreement.

Each term is one row of opaque text in a stored order. Nothing is classified, presented, affirmed or final in this slice.

## Product decisions required

- `decisions/D04-terms-and-affirmation.md`: OPEN overall. Relies only on the 2026-10-05 partial ruling that every term is individually represented and is the unit of the record.
- `decisions/D02-agreement-topology-lifecycle.md`: OPEN overall. Relies only on the 2026-10-05 structure ruling:
  - safety and consent terms are shared by everyone on site;
  - commercial and craft terms are private and pairwise under the project.
- `decisions/2026-10-05-cory-reconciliation.md`, additional ruling 11: universal safety terms, pairwise commercial terms.
- S02, built: the pairwise agreement a pairwise term attaches to.

## Invariants

- A term is one row, never a section or a blob of several terms.
- A universal term belongs to exactly one project. A pairwise term belongs to exactly one pairwise agreement.
- Term text is opaque and not blank. No vocabulary, clause catalog, field type, compensation shape or minimum term set is encoded.
- No term records requiredness, a body or money classification, an author, a proposer, an obligation direction, a payer or a payee.
- Terms are append-only in this slice.
- `position` is storage order within one container. It is not the presentation ordering of ruling 4.

## In scope

- Table `universal_term`: project, position, text.
- Table `agreement_term`: pairwise agreement, position, text.
- Database constraints:
  - text must contain a non-whitespace character;
  - `position >= 1`, unique per container;
  - references to an existing project or agreement.
- Data functions:
  - add a term after the container's last position, serialized per container so concurrent additions get distinct positions;
  - list a container's terms in position order.
- Runtime grants: `SELECT` and `INSERT` on both tables, nothing else.
- Real-PostgreSQL tests, plus extension of the existing table and privilege pins.

## Explicitly out of scope

Each of these is an open question, not a hidden default.

- **Requiredness.** D02 defines finality over "every required term", and D04 leaves "the exact required term set" open. What makes a term required, and who decides, is Cory's.
- **Body and money classification.** D04 says body and money terms always need their own deliberate affirmation, but not who classifies a term or how.
- **Editing, removing, reordering.** No `UPDATE` or `DELETE` is granted. D02's drop-and-resend applies to a term already sent; S04 handles it by presenting a new version that leaves the term out.
- **Classification of every term into the two layers.** Whether every term falls into one of them (for example logistics, location or schedule) is open.
- **Published value (ruling 1).** Where value on posted work lives before any pairwise agreement exists is open, as is how "applying is acceptance" composes with per-term affirmation.
- **Composition-flow concepts:**
  - presentation order across the two layers (ruling 4);
  - the three field buckets and the "deliberately open" versus "unfinished" distinction (ruling 5);
  - term-attached recorded dialogue;
  - how a brief field relates to a term.
- **Other open D04 items:** verbatim clause language, compensation or trade representation, and the "No means no" acknowledgment wording.
- **Actors and visibility:** who may write or see terms (D03, D10, D12), and who is on site.
- Presentation, versioning, affirmation and finality.
- Any HTTP route.

## Acceptance evidence

1. Universal terms can be added to a project and pairwise terms to an agreement. Both read back in position order, including when rows were stored out of position order.
2. Terms are isolated per project and per agreement.
3. Concurrent additions to one container receive distinct, contiguous positions.
4. The database rejects:
   - empty or whitespace-only text;
   - a position below 1;
   - a duplicate position in one container;
   - an unknown project or agreement.
5. Each table holds exactly an id, its container, a position and the text. Only the id has a default.
6. No column or constraint names requiredness, classification, an actor, direction, lifecycle, evidence, visibility or composition semantics.
7. The runtime role holds exactly `SELECT` and `INSERT` on both tables.
8. No HTTP operation is added, and all existing tests stay green.

## Expected change surface

- `src/projects/tables.ts`: two tables.
- `src/projects/terms.ts`: data functions.
- `migrations/0007` (generated) and `migrations/0008` (grants).
- `tests/database/terms.test.ts`, plus the pins in `migrations.test.ts` and `runtime-role.test.ts`.
- `docs/engineering/S03-TERM-UNITS.md`.

No term engine, field-type system, template system or workflow is introduced.

## Change-locality check

- **If Cory defines requiredness or body/money classification:** each lands as a column or adjacent table on the term rows, or on the presented copies (S04). Neither layer's shape moves.
- **If some terms belong to neither layer:** a further container is added beside these two. Existing terms are unaffected.
- **If ruling 4 ordering is defined across layers:** it belongs to presentation, not to storage order.
- **If D03 or D10 decide who writes or sees terms:** that lands in data functions and HTTP, not in the tables.

## Stop conditions

Stop and report rather than deciding if implementation appears to require:
- marking a term required or optional;
- classifying a term as body or money;
- recording who wrote or proposed a term;
- choosing a term vocabulary or catalog;
- placing a term whose layer is unclear;
- editing or deleting a term;
- deciding who is on site.
