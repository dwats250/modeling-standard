# Slice — S05 per-term affirmation evidence

Status: PROPOSED. Built ahead of approval at Dustin's direction (2026-10-08). Stacked on S04, which is stacked on S03. Held at the merge seam: not merged until Dustin approves this PRD and the two before it.
Owner: Claude
Approved by: (pending: Dustin)
Date: 2026-10-08

## Outcome

The application can record, as permanent evidence, that a specific party affirmed a specific presented term:
- one row per party per presented term;
- bound to the exact frozen wording;
- timestamped by the database.

This works for both layers:
- **pairwise:** only the agreement's two parties can affirm its terms;
- **universal:** a party of the project can affirm its safety and consent terms.

The slice does **not** compute finality and does not decide who must affirm what. It fails closed on escalation: affirmations are accepted only against a container's first presented version.

## Product decisions required

- **`decisions/D04-terms-and-affirmation.md`** (OPEN overall). Relies on:
  - the 2026-10-05 partial ruling: every term is individually affirmable and is the unit of the record;
  - ratified: each signature is bound to the specific clauses it affirms, co-located with them **[R]** (DOCTRINE:51).
- **`decisions/D02-agreement-topology-lifecycle.md`** (OPEN overall). Relies on:
  - the structure ruling (pairwise private terms; universal terms affirmed by everyone on site);
  - "all parties" for an agreement meaning the parties named in it.
- **`decisions/D12-who-may-act.md`** (DECIDED): no proxies; the person acting is the person affirming. Here that means an affirmation is recorded for a named party and for no one else. Binding that party to a person is D03.
- **`decisions/2026-10-05-cory-reconciliation.md`**, ruling 6. Escalation requires a neutral record and a mandatory delay before acceptance. That is the reason for the first-version-only rule.
- **S04, proposed:** the presented versions being affirmed.

## Invariants

- **One affirmation is one row:** one party, one presented term. There are no section, document-wide or group affirmations.
- **A pairwise affirmation names one of that agreement's two parties.** The database rejects any other party, including other parties of the same project.
- **A universal affirmation names a party of that project.** The database rejects parties of other projects.
- **An affirmation points at a presented term of the stated version, and that version belongs to the stated container.** Enforced by composite foreign keys.
- **A party affirms a given presented term at most once.**
- **Affirmations are permanent.** The runtime role cannot update or delete them, and `affirmed_at` is the database clock time the row is written.
- **Affirmations are accepted only against a container's first presented version (sequence 1).** A later version may escalate a boundary, and ruling 6's neutral record and delay are not yet specified. This restriction fails closed and is lifted by the slice that implements ruling 6.
- **No principal, account, credential, IP address or device is recorded.** A party is not yet bound to a person (D03), and metadata beyond time and credential is parked (D04).

## In scope

- **Tables:**
  - `agreement_affirmation`: agreement, the agreement's two parties as stored, version, presented term, affirming party, `affirmed_at`;
  - `universal_affirmation`: project, version, presented term, affirming party, `affirmed_at`.
- **Supporting uniques for the composite foreign keys:**
  - on `pairwise_agreement` `(id, party_one_id, party_two_id)`;
  - on each version-term table `(version, id)`.
- **A BEFORE INSERT trigger** enforcing the first-version rule and stamping `affirmed_at`.
- **Data functions:**
  - affirm one presented term as one party;
  - list a version's affirmations.
- **Runtime grants:** `SELECT` and `INSERT` only.
- **Tests:** real-PostgreSQL tests for both layers, plus the pins.

## Explicitly out of scope

Each of these is open, not defaulted.

- **Finality**, and any derived "complete" or "outstanding" status. Finality is over every *required* term, and what makes a term required is open (D04). Nothing reports an agreement or version as final, complete or pending.
- **Who must affirm.** For universal terms that depends on who is on site (D02 f); for pairwise terms, on requiredness. Recording that a party affirmed implies nothing about who else must.
- **Declining.** "One number, one answer: yes or no" (D02). Whether a "no" is recorded, and who sees it (D10), is open.
- **Withdrawing an affirmation before finality** (D02 d). Affirmations here are permanent evidence. Any later withdrawal would be a separate record, never a deletion.
- **Affirming later versions** (ruling 6 escalation), and whether affirmations carry over between versions (D02 g, h).
- **The group-check convenience,** whether the record notes it, and body/money classification (D04).
- **Signing timing** (D04): whether the presenter affirms at presentation.
- **The "No means no" acknowledgment** (ruling 14).
- **Witnesses** (D12 notes them as a separate, optional feature).
- **Binding a party to a person or credential** (D03), and any authorization check.
- **Visibility** of affirmations (D10).
- **Any HTTP route.**

## Acceptance evidence

For each layer:

1. A party can affirm each presented term of a first version individually. Affirmations read back per version with term, party and a database-set time.
2. The database rejects:
   - an affirmation by a party outside the agreement's pair (pairwise) or outside the project (universal);
   - a second affirmation of the same term by the same party;
   - an affirmation of a term against a version it does not belong to;
   - a version of another container;
   - an affirmation of a term of a later version (sequence above 1).
3. The time cannot be supplied or backdated by the caller.
4. The runtime role cannot update, delete or truncate affirmations, and trigger functions are not callable or shadowable.
5. No column or constraint names finality, status, decline, withdrawal, group, principal, credential, IP, device, signature or witness.
6. No HTTP operation is added, the privilege and table pins are exact, and all prior tests stay green.

## Expected change surface

- `src/projects/tables.ts`: two tables, plus supporting uniques.
- `src/projects/affirmations.ts`.
- One generated migration (hand-reordered if Drizzle places uniques after the foreign keys that need them) and one hand-written trigger and grants migration.
- `tests/database/affirmations.test.ts`, plus the pins.
- `docs/engineering/S05-TERM-AFFIRMATION.md`.

No state machine, signing engine or finality calculator is introduced.

## Change-locality check

- **When requiredness is decided,** finality is a read over these rows plus the requiredness source. No table here changes.
- **When ruling 6 is specified,** the first-version restriction in the trigger is replaced by the escalation rule.
- **When D03 binds parties to people,** the authorization check sits in front of the data function. A credential reference may be added as a column.
- **When declines or withdrawals are decided,** they are their own append-only records beside these.

## Stop conditions

Stop and report rather than deciding if implementation appears to require:
- computing or exposing finality or completeness;
- deciding who must affirm;
- recording a decline or withdrawal;
- allowing affirmation of a later version;
- recording a credential, IP or device;
- grouping affirmations;
- adding an HTTP route.
