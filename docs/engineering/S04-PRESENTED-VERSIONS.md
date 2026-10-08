# S04: presented versions, as built

Slice: `docs/slices/S04-presented-versions.md`. The PRD is PROPOSED, stacked on S03, and held at the merge seam.

Grounds:
- DOCTRINE:46: clause text is frozen as presented;
- the D02 pairwise drop-and-resend ruling;
- the D04 per-term ruling.

"Presented" means frozen for presentation. No recipient, viewing or delivery is recorded.

## What exists

| Piece | Where | Notes |
|---|---|---|
| `agreement_version`, `universal_version` | `src/projects/tables.ts`, `migrations/0009` | `id`, container, `sequence`, `term_count`, `presented_at` |
| `agreement_version_term`, `universal_version_term` | same | `id`, container, version, source term, `position`, `content` |
| `(container, id)` uniques on `agreement_term` and `universal_term` | same | Targets for the composite foreign keys. Add no column |
| Sealing, copy and stamp triggers | `migrations/0010` | See below |
| Runtime grants | `migrations/0010` | `SELECT, INSERT` on the four tables; `PUBLIC` revoked. No trigger function is executable by `PUBLIC` |
| Data functions | `src/projects/versions.ts` | `presentAgreementVersion`, `findAgreementVersion`, `listAgreementVersions`, and the universal equivalents. No HTTP |

## How the database guarantees a version is what was frozen

- **Same container throughout.**
  - `(container, version) → version (container, id)`
  - `(container, source term) → term (container, id)`
- **Sealed.** One deferred constraint trigger function per layer fires on inserts to both the version and its term table. At commit it requires `count(terms) = term_count`, with no position above `term_count`. Positions are unique and at least 1, so that means exactly `1..term_count`.
  - **The count covers committed rows plus the checking transaction's own.** Under READ COMMITTED each trigger statement takes a fresh snapshot. Under REPEATABLE READ the snapshot is older, but it still includes the transaction's own rows.
  - **So a term smuggled into an existing version fails at commit under any isolation level,** as does a version row with no or too few terms.
  - **Setting the constraint IMMEDIATE only makes creation fail.** It cannot skip the check.
  - **Disabling the triggers needs ownership or superuser.** The runtime role has neither.
- **Faithful copy.** A BEFORE INSERT trigger looks up the source term by `(container, id)` and rejects the row if the term is not visible or its text differs.
  - **Why "not visible" is rejected rather than deferred to the foreign key:** the review found that deferral let a term committed by another transaction mid-statement be copied with different text. A test reproduces that race and now sees it rejected.
  - The composite foreign key remains as a backstop.
- **Numbering and time.** A BEFORE INSERT trigger on the version:
  - takes the per-container advisory lock;
  - requires `sequence` to equal `max + 1`, rejecting gaps and back-filling;
  - sets `presented_at := clock_timestamp()`, the time the row is written, so holding a transaction open cannot backdate it.
- **Function hygiene.**
  - Every trigger function pins `search_path = pg_catalog, public, pg_temp` and schema-qualifies its tables, so temporary objects cannot shadow them. The runtime role also lacks `TEMPORARY` (`migrations/0002`).
  - `EXECUTE` is revoked from `PUBLIC`. Trigger firing does not check `EXECUTE`.
- **No change afterwards.** No `UPDATE`, `DELETE` or `TRUNCATE` grant.

## Non-obvious choices

- **The caller chooses which terms to present, and their order.** For pairwise versions, drop-and-resend is a new version without the term, with no deletion anywhere. For universal versions the same mechanism exists, but whether leaving a safety term out is allowed is open (VISION:374, ruling 14). Nothing should be built on it until Cory answers.
- **Text is copied, not referenced.** The copy keeps a version intact if term editing is ever added. The copy trigger proves fidelity at the time of copying.
- **Sequence orders presentations.** It does not say which version is in force (D02 d, g, h).
- **The data function's lock.** It takes the same advisory lock key as the numbering trigger, with the UUID lowercased to match `uuid::text`, before computing `max + 1`. Concurrent presentations therefore queue instead of tripping the numbering check.
- **Transactions.** Call the data functions with the database handle or inside a READ COMMITTED transaction. Inside an outer REPEATABLE READ or SERIALIZABLE transaction, a concurrent presentation to the same container fails the numbering check instead of queueing. Inside any outer transaction, sealing runs at the outer commit.
- **Term ids are passed as a JSON array** (`jsonb_array_elements_text ... with ordinality`) to keep the caller's order. If any id is not a term of the container, fewer rows are copied and `TermNotInContainerError` rolls back the whole presentation. A malformed id fails the uuid cast.
- **Migration order.** Drizzle generated the S03 composite uniques after the foreign keys that need them, so `migrations/0009` was reordered by hand, as in S02. The drift check still passes.
- **What a version deliberately does not say:**
  - who presented it, or to whom;
  - whether it is current;
  - whether it is complete;
  - a digest.

## Tests

`tests/database/versions.test.ts` runs every case for both layers:
- order-preserving faithful freezing;
- later versions leaving earlier ones intact (pairwise drop-and-resend; no claim for universal);
- immunity to later term additions;
- rejection of foreign or unknown terms with no leftover version;
- duplicate and empty presentations;
- eight concurrent presentations numbered 1 to 8;
- raw-SQL attacks as the runtime role:
  - a smuggled term after commit;
  - a version row alone;
  - a short version;
  - out-of-range positions;
  - an altered copy;
  - a two-session race copying a concurrently committed term with altered text;
  - wrong, gapped or back-filled sequence numbers;
  - a backdated time, even inside a transaction held open for over a second;
  - cross-container version or term;
  - update, delete or truncate;
- exact columns and excluded semantics;
- trigger functions' `search_path` and non-callability;
- no HTTP operation.

The table-list and privilege pins are extended.
