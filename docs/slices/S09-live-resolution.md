# Slice — S09 share, live resolution and green state

Status: APPROVED — authorized by Dustin for implementation
Owner: Claude
Date: 2026-10-15
Source: Dustin's S09 implementation charge (2026-10-15) and the merged architecture `docs/engineering/LIVE-BRIEF-REBUILD.md` (sections 3, 7, 8, 13, 14, 15).
Base: `main` at `0803d6b` (S01, S02, S06, S07, S08).

## 1. Objective

Make the S08 draft brief become a live shared brief:

draft → share → live → resolve pending items → decline removable requests → tick / untick → items fill green → **ready to sign**.

Not in S09: fingerprint, `signing` phase, signatures, final contract, production authentication, real participants (S10+).

## 2. Governing model

One current live brief. No version history, change history, record of a decline, proposer identity, or audit trail (HC1, HC2). Once shared: nothing is added; settled wording and values do not change; a pending value settles once; a permitted declined request disappears; universal safety material cannot disappear; ticks are current green state only. Only the final contract (S11) is evidence; live state is not.

## 3. Scope

### 3.1 Phase

`live_brief.phase text not null default 'draft'`, `CHECK (phase IN ('draft', 'live'))`. Only `draft → live` is allowed; `live → draft` and every other change are refused by a trigger. No timestamp, actor or revision. Runtime: `UPDATE (phase)` only.

### 3.2 Share

`shareLiveBrief(db, briefId)`, READ COMMITTED, under the per-brief advisory lock. It requires the brief to exist and be `draft`. The database's phase trigger, the final authority, then requires:

- every current item has stored `content` (a keyed item whose wording is not materialized blocks sharing);
- every current project party has an explicit presence fact (missing is never read as `false`).

Every item already satisfies the S08 constraints, which the database enforces on every row. Explicit pending states (`decide_together`, `subject`) do not block sharing. No catalogue, requiredness or no-means-no item is required or created. A second share is refused (`BriefNotDraftError`).

### 3.3 Presence

`brief_party_presence (brief_id, project_id, party_id, on_site boolean not null)`, primary key `(brief_id, party_id)`, contained by `(brief_id, project_id) → live_brief` and `(project_id, party_id) → project_party`. No timestamp, role, reason, author or history.

`setDraftPartyPresence(db, briefId, partyId, onSite)`: draft only, upsert. Once live, presence cannot be inserted, changed or deleted. S09 also refuses adding a new project party while live as a temporary fail-closed implementation guard: Cory has already decided that additions are a new clean decision that everyone green-lights, but that live-addition workflow is not built in this slice.

### 3.4 Post-share rigidity (database)

Once live: no item insert; `content` and `position` immutable; a pending item may move once to settled (`pending → null` with `value` from null to nonblank), and a settled item cannot change or reopen. Identity columns stay immutable by grant. Delete is refused except for a non-universal `request` (the decline mechanism); a universal item can never be deleted while live. Draft behaviour is unchanged from S08.

### 3.5 Resolution

- `settleDecideTogetherItem(db, itemId, value)`: live, `pending = 'decide_together'`, nonblank value. No actor is taken or stored (HC2): acceptance is the ticks on the resulting item.
- `setOpenParameterBySubject(db, itemId, partyId, value)`: live, `shape = 'open_parameter'`, `pending = 'subject'`, `partyId` equals the subject, nonblank value. No counteroffer.

### 3.6 Decline

`declineBriefRequest(db, itemId, partyId)`: live, `shape = 'request'`, `partyId` is the subject, layer not universal. The item is deleted; its ticks cascade. Nothing records that it existed, was declined, by whom or when. The database permits a live delete only of a non-universal request; who may decline is checked by the function, because the database holds no actor.

### 3.7 Ticks

`brief_tick (brief_item_id, project_id, party_id)`, primary key `(brief_item_id, party_id)`; `(brief_item_id, project_id) → brief_item ON DELETE CASCADE`; `(project_id, party_id) → project_party`. No time, sequence, source, bulk flag, device, credential or version. Runtime: `SELECT, INSERT, DELETE`.

A trigger (final authority) admits a tick only when the brief is live, the item has `content`, `pending IS NULL`, and the party is a derived approver.

- `tickBriefItem(db, itemId, partyId)`: idempotent; a repeat returns the existing tick.
- `untickBriefItem(db, itemId, partyId)`: deletes only that party's tick; no record.

### 3.8 Approvers (derived, never stored)

| Item | Approvers |
|---|---|
| Universal | every project party whose presence says `on_site = true` |
| Shared, project-wide | every party of the project |
| Shared, pair-scoped | the pair's two parties (visibility stays shared) |
| Money | the pair's two parties |

No organizer, creator or proxy privilege.

### 3.9 Group-check

`groupCheckBriefItems(db, briefId, partyId, itemIds)`: validates every selected item before changing anything, inserts the same individual ticks as `tickBriefItem` in one statement, all or nothing. It refuses the fixed deliberate-tick keys `fee`, `coverage_level`, `physical_contact`, `stop_rule` (a code-side set, LIVE-BRIEF-REBUILD §4). Nothing records that it was used.

### 3.10 Green state and ready to sign

- `getBriefGreenState(db, briefId)`: per item, its derived approvers, which of them currently tick it, and `green` (every approver ticks). Developer/complete read.
- `getBriefGreenStateVisibleTo(db, briefId, partyId)`: the same for the items that party may see (D10): money items and their tick state only to the pair.
- `isBriefReadyToSign(db, briefId)`: true only when the brief is live, no current item is pending, and every current item is green for all of its derived approvers. Nothing is stored.

**Boundary.** Ready to sign means every *current* item satisfies the structural all-green rule. Until the D01 required-item catalogue exists it does not prove the brief holds every product-required item. Real use remains gated.

### 3.11 Concurrency

Every live mutation (share, settle, set parameter, decline, tick, untick, group-check, presence) runs READ COMMITTED under `pg_advisory_xact_lock(hashtextextended('live-brief:' || lower(brief id), 0))`. The database triggers lock the brief row `FOR SHARE` before reading its phase, so raw writes serialize against a phase change and fail closed. No version counter.

### 3.12 Privileges

| Table | Runtime |
|---|---|
| `live_brief` | `SELECT, INSERT, UPDATE (phase)` |
| `brief_item` | unchanged from S08; the live guard constrains it |
| `brief_party_presence` | `SELECT, INSERT, UPDATE (on_site)`; the live guard refuses all mutation once shared |
| `brief_tick` | `SELECT, INSERT, DELETE` |

`PUBLIC` revoked. No `TRUNCATE`. Trigger functions pin `search_path`, schema-qualify tables, fail closed and are not executable by `PUBLIC`.

### 3.13 Migrations

- `0021_live_resolution`: generated, hand-reviewed — phase column, `brief_item_id_project_unique`, presence and tick tables with their keys.
- `0022_live_resolution_guards_and_grants`: hand-written — phase, item, presence, roster and tick guards; grants.

Historical migrations are not edited. Populated 0020 → current upgrade is tested.

### 3.14 Demo

A two-person synthetic walkthrough (Photographer, Model) on the loopback demo: start, inspect draft, set presence, share, go live, settle a decide-together value, set an open parameter as its subject, decline a request (it disappears), tick as each party, group-check ordinary items, see deliberate items refuse group-check, watch items go green, untick and lose readiness, retick, reach **READY TO SIGN**. Stop there. Three layers visually distinct; money private to its pair; current state only (no activity feed, timestamps, revision count, "declined by", version number or audit trail). Demo-only operations, never in production. A deterministic desktop screenshot of READY TO SIGN, plus mobile coverage.

## 4. Exclusions

Fingerprint; canonical serialization; `signing` phase; pending signatures; final contract or evidence; signing UX; no-means-no wording; required-term catalogue; document trigger table; call sheet; OAuth, sessions, production participant routes; identity verification; archive or recovery; date-change or replacement restart; mid-shoot stop; DNS/DNF; multi-party finalization; the roster-addition workflow. No S10 work.

## 5. Interpretations recorded (not product decisions)

- **Live roster additions are not implemented in S09.** The database therefore refuses a new `project_party` row while the brief is live so approvers cannot change silently. This is a temporary fail-closed guard, not a new product rule: Cory has already decided that an addition is a new clean decision that everyone green-lights; that capability belongs to a later slice.
- **Zero-approver items** (a universal item when no party is on site; an empty live brief) are green by the literal all-approvers rule. S09 does not special-case this structural edge case. `READY TO SIGN` is not a real-use completeness guarantee, and S10 separately requires exactly two parties and one pair.
- **Readiness is not exposed in the party-visible read.** In a project with several pairs it could reveal that another pair's private fee is outstanding, and the multi-party signing unit is Cory-open (LIVE-BRIEF-REBUILD §10.2).

## 6. Acceptance

The charge's test list (sections 23, 24 and 30), real PostgreSQL, mutation checks restored, `npm run check`, `npm test`, `npm run test:demo`, `npm run build`.
