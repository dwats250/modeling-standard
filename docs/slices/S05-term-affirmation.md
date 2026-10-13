# Slice — S05 per-term affirmation evidence

Status: PROPOSED. Built ahead of approval at Dustin's direction (2026-10-08). Stacked on S04, which is stacked on S03. Held at the merge seam: not merged until Dustin approves this PRD and the two before it.
Owner: Claude
Approved by: (pending: Dustin)
Date: 2026-10-08

## Outcome

The application can record, as append-only evidence, that a named party affirmed a specific presented term:
- one row per party per presented term;
- bound to the exact frozen wording;
- timestamped by the database.

This works for both layers:
- **pairwise:** a row can name only one of the agreement's two parties;
- **universal:** a row can name any party of the project. That says nothing about who is on site.

This is a storage layer, not a usable signing feature.
- No runtime path may write these rows until D03 binds parties to people.
- The rows are not complete signature evidence until the credential used is recorded (DOCTRINE:52).
- The slice computes no finality, records no "no", and decides nothing about who must affirm.

## Product decisions required

- **`decisions/D04-terms-and-affirmation.md`** (OPEN overall). Relies on:
  - the 2026-10-05 partial ruling: every term is individually affirmable and is the unit of the record;
  - ratified: each signature is bound to the specific clauses it affirms **[R]** (DOCTRINE:51).
- **`decisions/D02-agreement-topology-lifecycle.md`** (OPEN overall). Relies on the structure ruling, and on "all parties" for an agreement meaning the parties named in it.
- **`decisions/D12-who-may-act.md`** (DECIDED): no proxies; the person acting is the person affirming.
  - The schema cannot enforce this. It records a party, not an actor.
  - D12 is a precondition on any future caller, which must establish that the person acting is the party.
- **Ratified and not met by this slice:** the record captures the identity or credential used to agree **[R]** (DOCTRINE:52). The credential awaits D03.
- **`decisions/2026-10-05-cory-reconciliation.md`**, ruling 6 (escalation: neutral record and mandatory delay before acceptance), which is not specified. It is one reason for the single-version rule.
- **S04, proposed:** the presented versions being affirmed.

## Invariants

- **One row is one party affirming one presented term.** There are no section, document-wide or group affirmations.
- **Pairwise:** a row names one of that agreement's two parties. The database rejects any other party, including other parties of the same project.
- **Universal:** a row names a party of that project. The database rejects parties of other projects.
- **A row points at a presented term of the stated version, and that version belongs to the stated container.**
- **A party affirms a given presented term at most once.**
- **Append-only for the runtime role (DOCTRINE:56).** No update or delete. `affirmed_at` is the database clock time the row is written. D09's approved-removal lane (reason plus all-party approval) is not built.
- **Single version only.**
  - Affirmations are accepted only against version 1 of a container, and only while no later version exists.
  - This stops short of two open questions:
    - whether an earlier version stays open once a later one exists (D02 d, g, h);
    - affirming a later version that may escalate (ruling 6).
  - It does **not** detect escalation in general. For example, a second agreement between the same two parties starts at its own version 1.
  - Drop-and-resend therefore leaves the resent version unaffirmable until those rules exist.
- **Not in the presenting transaction.** Signing timing is open (D04), so a version cannot be affirmed in the transaction that presented it.
- **The absence of an affirmation means nothing:** not "no", not "not yet", and not "not shown".
- **No principal, account, credential, IP address or device is recorded.**

## In scope

- **Tables:**
  - `agreement_affirmation`: agreement, the agreement's two parties as stored, version, presented term, party, `affirmed_at`;
  - `universal_affirmation`: project, version, presented term, party, `affirmed_at`.
- **Supporting uniques for the composite foreign keys:**
  - on `pairwise_agreement` `(id, party_one_id, party_two_id)`;
  - on each version-term table `(version, id)`.
- **A BEFORE INSERT trigger per layer** enforcing:
  - the single-version rule, under the container's advisory lock;
  - the visibility rule;
  - the presenting-transaction rule;
  - the database clock time.
- **Data functions:**
  - affirm one presented term as one party;
  - list a version's affirmations.
- **Runtime grants:** `SELECT` and `INSERT` only.
- **Tests:** real-PostgreSQL tests for both layers, plus the pins.

## Explicitly out of scope

Each of these is open, not defaulted.

- **Finality**, and any "complete", "outstanding" or "pending" view. Finality is over every *required* term, and requiredness is open (D04).
- **Who must affirm.** For universal terms that depends on who is on site, which is not defined. For pairwise terms it depends on requiredness.
- **"Not accepted."** D02's "one number, one answer: yes or no" and drop-and-resend need a "no" signal. Whether a "no" is recorded, and who sees it (D10), is open.
- **Withdrawing an affirmation before finality** (D02 d), and D09 approved removal.
- **Affirming any version other than a container's sole version 1:**
  - ruling 6 escalation;
  - supersession (D02 d, g, h);
  - carry-over between versions.
- **Escalation across containers or layers.** For example:
  - a new agreement between the same pair;
  - pairwise terms against universal safety terms;
  - terms against published terms someone applied to (ruling 1).
  
  Whether the same two parties may hold several agreements is open in S02 and interacts with ruling 6.
- **Signing timing** (D04).
- **The credential used** (DOCTRINE:52, D03), plus IP, device and other metadata (D04).
- **Group-check,** whether the record notes it, and body/money classification (D04).
- **The "No means no" acknowledgment** (ruling 14).
- **Witnesses.**
- **Visibility** of affirmations (D10).
- **Any HTTP route or other runtime caller.**

## Acceptance evidence

For each layer:

1. Each permitted party can affirm each presented term of a sole version 1 individually. Rows read back per version with term, party and a database-set time. Affirming one term affirms nothing else.
2. The database rejects:
   - a party outside the pair (pairwise) or outside the project (universal);
   - a second affirmation of the same term by the same party;
   - a term not in the stated version;
   - a version of another container;
   - a term of a later version;
   - a term of version 1 once a later version exists;
   - an affirmation in the transaction that presented the version;
   - a version another transaction has not committed, even a version 1.
3. The time cannot be supplied or backdated, even inside a transaction held open.
4. The runtime role cannot update, delete or truncate affirmations. The trigger functions are pinned by name, not callable, and not shadowable.
5. Each table's constraints are pinned exactly. No column or constraint names finality, status, decline, withdrawal, grouping, principal, credential, IP, device, signature or witness.
6. No HTTP operation is added, the privilege and table pins are exact, and all prior tests stay green.

## Expected change surface

- `src/projects/tables.ts`: two tables, plus supporting uniques.
- `src/projects/affirmations.ts`.
- `migrations/0011` (generated, reordered so uniques precede the foreign keys that need them) and `migrations/0012` (triggers and grants).
- `tests/database/affirmations.test.ts`, plus the pins.
- `docs/engineering/S05-TERM-AFFIRMATION.md`.

No state machine, signing engine or finality calculator is introduced.

## Change-locality check

- **When requiredness is decided,** finality is a read over these rows plus the requiredness source. No table here changes.
- **When supersession and ruling 6 are specified,** the single-version rule in the trigger is replaced.
- **When D03 binds parties to people,** an authorization check sits in front of the data functions, and the credential (DOCTRINE:52) is captured. Because rows are append-only, any written before then would lack it. That is why no runtime path may write them before D03.
- **When "no" or withdrawal is decided,** each is its own record beside these. Whether withdrawal removes or supersedes evidence follows D02 (d) and D09.

## Stop conditions

Stop and report rather than deciding if implementation appears to require:
- computing or exposing finality, completeness or pending status;
- deciding who must affirm;
- recording a "no" or a withdrawal;
- allowing affirmation of any version other than a sole version 1;
- recording a credential, IP or device before D03;
- grouping affirmations;
- adding an HTTP route or other runtime caller;
- detecting or permitting escalation.
