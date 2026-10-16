# S09: share, live resolution and green state, as built

Slice: `docs/slices/S09-live-resolution.md` (APPROVED, authorized by Dustin). Architecture: `LIVE-BRIEF-REBUILD.md` §§3, 7, 8, 13–15. Decisions relied on: D02 and D10 (layers; only money private; no organizer confirmation), D04 (per-term ticks; ticking is not signing; the fixed deliberate-tick list, Q6; subject control, Q7), Q8 (on site is physical proximity), D12 (no proxies), HC1 and HC2 (no history, no proposer).

**What this is not.**

- Not signing. There is no `signing` phase, fingerprint, signature or contract (S10, S11).
- Not evidence. Phase, presence, item values and ticks are current state; nothing records when anything happened, who settled a value, that a request existed or was declined, or that group-check was used.
- Not real use. "Ready to sign" is the structural all-green rule over the *current* items. No required-item catalogue exists, so it does not prove a brief holds every product-required item.
- No participant surface: data functions and demo-only simulation.

## What exists

| Piece | Where |
|---|---|
| `live_brief.phase` (`draft`, `live`) | `src/briefs/tables.ts`, `migrations/0021` |
| `brief_party_presence` | `src/briefs/tables.ts`, `migrations/0021` |
| `brief_tick` | `src/briefs/tables.ts`, `migrations/0021` |
| `brief_item_id_project_unique` (tick containment target) | `migrations/0021` |
| Phase, live-item, presence, roster and tick guards; grants | `migrations/0022` |
| Data functions | `src/briefs/live.ts`; draft-only checks added to `src/briefs/brief.ts` |
| Demo walkthrough | `src/demo/walkthrough.ts`, `simulator.ts`, `operations.ts`, `fixtures.ts`, `ui/` |

## Schema

- `live_brief.phase text not null default 'draft'`, `CHECK (phase in ('draft', 'live'))` (`live_brief_phase_known`). Existing briefs become drafts.
- `brief_party_presence (brief_id uuid, project_id uuid, party_id uuid, on_site boolean)`, all `not null`; primary key `(brief_id, party_id)`; `(brief_id, project_id) → live_brief (id, project_id)`; `(project_id, party_id) → project_party (project_id, id)`; both `NO ACTION`.
- `brief_tick (brief_item_id uuid, project_id uuid, party_id uuid)`, all `not null`; primary key `(brief_item_id, party_id)`; `(brief_item_id, project_id) → brief_item (id, project_id) ON DELETE CASCADE` (the only cascading key in the schema); `(project_id, party_id) → project_party (project_id, id)`.

No timestamp, order, author, actor, role, reason, revision, history, decline, bulk or group column anywhere in the brief (tested).

## Database guards (`0022`)

All `check_violation` with a named constraint; invoker rights; `search_path = pg_catalog, public, pg_temp`; schema-qualified; `EXECUTE` revoked from `PUBLIC`. Each locks the brief row `FOR SHARE` before reading its phase.

| Trigger | Rule | Constraint name(s) |
|---|---|---|
| `live_brief_check_phase` (before insert or update) | Inserted as `draft`. The only change is `draft → live`. Sharing needs stored `content` on every item and a presence fact for every project party. | `live_brief_phase_transition`, `live_brief_share_requires_wording`, `live_brief_share_requires_presence` |
| `brief_item_guard_live` (before insert, update, delete) | Draft: unchanged. Live: no insert; content, position and identity fixed; a pending item settles once (`pending → null`, `value` null → set); nothing else changes; delete only a non-universal `request`; universal never. | `brief_item_live_no_insert`, `brief_item_live_rigid`, `brief_item_live_no_delete`, `brief_item_live_universal_kept` |
| `brief_party_presence_guard` (before insert, update, delete) | No presence change once live. | `brief_party_presence_live_fixed` |
| `project_party_guard_roster` (before insert on `project_party`) | No new party in a project whose brief is live. | `project_party_roster_closed` |
| `brief_tick_check` (before insert or update) | Live brief; item with `content` and `pending IS NULL`; party is a derived approver. Locks the item `FOR SHARE`, so a settlement or decline in flight is waited for. An item it cannot see is refused. | `brief_tick_requires_live`, `brief_tick_requires_settled`, `brief_tick_requires_approver` |

The roster guard is this slice's reading of "refuse roster mutation once shared": approvers are derived from the roster, so an added party would silently change who must green-light what. The roster-addition workflow is a later decision.

## Data functions (`src/briefs/live.ts`)

All mutations run READ COMMITTED under `pg_advisory_xact_lock(hashtextextended('live-brief:' || lower(brief id), 0))`.

| Function | Behaviour |
|---|---|
| `setDraftPartyPresence(db, briefId, partyId, onSite)` | Draft only (`not_draft`); upsert; project from the brief. |
| `listBriefPresence(db, briefId)` | By party id. |
| `shareLiveBrief(db, briefId)` | Draft only (`not_draft` on repeat); the database checks wording and presence. Pending states are allowed. |
| `settleDecideTogetherItem(db, itemId, value)` | Live; `pending = 'decide_together'`; nonblank. No actor. |
| `setOpenParameterBySubject(db, itemId, partyId, value)` | Live; open parameter awaiting its subject; `partyId` is the subject; nonblank. |
| `declineBriefRequest(db, itemId, partyId)` | Live; `request`; `partyId` is the subject; not universal. Deletes the row; its ticks cascade. |
| `tickBriefItem(db, itemId, partyId)` | Live; database checks settled and approver. Repeat is a no-op returning the same tick. |
| `untickBriefItem(db, itemId, partyId)` | Deletes only that party's tick; returns whether one was there. |
| `groupCheckBriefItems(db, briefId, partyId, itemIds)` | Validates every item first (in this brief; no deliberate key), then one insert of individual ticks: all or none. |
| `getBriefGreenState`, `getBriefGreenStateVisibleTo` | Per item: derived approvers, who ticks now, green. The party read applies D10 (money only to its pair) and carries no brief-wide readiness. |
| `isBriefReadyToSign(db, briefId)`, `isReady(phase, items)` | Live, nothing pending, every item green. |
| `listBriefTicks(db, briefId)` | Current ticks. |

`addBriefItem`, `updateDraftBriefItem` and `removeDraftBriefItem` (S08) now refuse a live brief (`not_draft`); otherwise unchanged.

**Approvers** (derived in `approversOf` and, identically, in `brief_tick_check`): universal → parties whose presence is `on_site`; pair-scoped (shared or money) → the pair; shared project-wide → every project party.

**Deliberate-tick keys:** `fee`, `coverage_level`, `physical_contact`, `stop_rule` (`DELIBERATE_TICK_KEYS`), a code-side list per LIVE-BRIEF-REBUILD §4.

## Privileges

| Table | Runtime |
|---|---|
| `live_brief` | `SELECT, INSERT, UPDATE (phase)` |
| `brief_item` | unchanged: `SELECT, INSERT, DELETE, UPDATE (content, value, pending, position)` |
| `brief_party_presence` | `SELECT, INSERT, UPDATE (on_site)`; no `DELETE` |
| `brief_tick` | `SELECT, INSERT, DELETE`; no `UPDATE` |

`PUBLIC` revoked; no `TRUNCATE`, `REFERENCES` or `TRIGGER`; trigger functions not callable by the runtime role (pinned in `trigger-functions.test.ts`).

## Concurrency (tested)

- Two concurrent shares: one transition, the other refused `not_draft`.
- Eight concurrent ticks by one party on one item: one row. Concurrent ticks by different approvers: all durable.
- Tick racing a decline (four rounds): the decline always succeeds and no orphan tick remains.
- Tick racing a settlement (four rounds): refused `brief_tick_requires_settled` while pending, or accepted after; never a tick on a pending item.
- Group-check racing single ticks: no duplicates.
- A raw item insert left open while a share starts: the share waits, then sees it and refuses (`live_brief_share_requires_wording`).

## Migrations

- `0021_live_resolution`: generated, then hand-ordered so each referenced unique precedes its foreign key.
- `0022_live_resolution_guards_and_grants`: hand-written.

**Upgrade (tested).** A database at 0020 with a project, parties, pair, account binding, invitation, brief and draft items (universal, decide-together, open parameter, fee) migrates to current: every S01–S08 row unchanged, the brief gains `phase = 'draft'`, presence and ticks empty, grants and triggers present, bookkeeping complete, catalog equal to a fresh migration, and a rerun a no-op. The pre-existing brief then takes presence, shares, settles, is ticked by both parties, and is ready to sign.

## Mutation checks

Each applied to `0022` or `live.ts`, run against the database and demo unit suites, and restored byte-for-byte.

| Mutation | Caught by |
|---|---|
| Allow live item INSERT | "refuses any new item" |
| Allow live content UPDATE | "refuses a content or position change…" |
| Allow universal live DELETE | "never deletes universal material…" |
| Allow presence mutation after share | "is fixed once live, through the function and raw SQL, and the roster is closed" |
| Remove the tick approver check | the universal-approver, approver-derivation, raw-tick refusal and group-check atomicity tests |
| Allow ticking a pending item | the tick-refusal test and the HTTP walkthrough (`still_pending`) |
| Remove `stop_rule` from the deliberate-tick refusals | "refuses each deliberate-tick key, changing nothing" |
| Ready to sign ignores one missing approver | the green/ready test, the decline-makes-ready test and the HTTP walkthrough |

## Interpretations and open points

- **Zero-approver items** (a universal item when nobody is on site; an empty live brief) are green and ready by the literal all-approvers rule. Not special-cased; for Cory.
- **Readiness is not in the party-visible read**, since in a multi-party project it could reveal another pair's outstanding fee and the multi-party signing unit is Cory-open.
- **Decide-together settlement takes no actor**, per HC2; anyone with the function can settle it. Who may enter the agreed value is a participant-surface question.
- **D05** still names "a presented version" among open words; not reconciled here.
