# S10 — Two-party signing freeze and withdrawal

A live brief that is structurally READY TO SIGN, in a project of exactly two parties and one pair, can enter an internal **signing** phase. Its contents and topology are then fixed and fingerprinted. An untick withdraws it to live resolution, with nothing kept. Freezing is an internal mechanism with no party-facing control, intended for S11 (signatures and the final contract) to call. Nothing here is signing.

## Decisions relied on

| Rule | Source |
|---|---|
| Ticking and signing are separate; nobody signs a document that can still change; sign only once every term is green for everyone | D04 (Q12) |
| No organizer confirmation step: all green, then everyone signs | D02 (A5a) |
| Withdrawal before finality is allowed; the agreement can only shrink; nothing is added | D02 (Q11, Q4) |
| No version or decline history; live state is not evidence; nothing records who or when | HC1, HC2, D02 (Q9, Q10) |
| The final contract carries a fingerprint (this one is intended for S11) | D04 (Q17) |
| The four deliberate-tick keys and the S09 ready-to-sign rule are unchanged | D04 (Q6), S09 |

## What exists

- **Phase** `live_brief.phase`: `draft` → `live` (S09) → `signing` (S10), and `signing` → `live` (withdrawal). Every other transition is refused by the database.
- **Fingerprint** `live_brief.fingerprint`: SHA-256, lowercase hex, present exactly while signing (`live_brief_fingerprint_iff_signing`). It changes only with the phase (`live_brief_fingerprint_fixed`).
- **Data functions** (`src/briefs/live.ts`), each READ COMMITTED under the per-brief advisory lock:
  - `freezeBriefForSigning(db, briefId)` → `{ briefId, fingerprint }`. Refusals: `not_live`, `not_ready`, `unsupported_topology`.
  - `untickBriefItem` — while signing, removing one's own tick is the withdrawal: in one transaction the brief returns to `live`, the fingerprint is cleared and the tick is removed. A party without that tick changes nothing (returns `false`).
  - `getBriefSigningState(db, briefId)` → `{ phase, fingerprint }`.
  - `briefFingerprint(snapshot)` — the pure v1 digest.
  - Every other S09 and S08 function keeps refusing a brief that is not in its phase (`not_live`, `not_draft`). `isReady` and `isBriefReadyToSign` stay live-phase predicates: a signing brief is reported as `signing`, not as ready.
- **Migrations**: `0023_signing_phase` (generated, hand-ordered: the column and the two checks) and `0024_signing_guards_and_grants` (hand-written: the transition and digest guard, the signing guards, the grant).

## The supported topology is an engineering boundary

S10 freezes only a project of **exactly two parties and one pair**. This is this slice's conservative engineering boundary, matching `LIVE-BRIEF-REBUILD.md` §10.2 (the signing unit with three or more parties is undecided), **not a product ruling**. In particular it says nothing about chaperones: D12 lets a visitor always bring one, and whether an on-site chaperone is a project party who affirms only the universal terms, a contracting party with a pair of their own, or something else, is a question for the later participation and signing design. In the current data model presence is recorded only for project parties, so representing a third person on site means a third project party, which S10 refuses; that is a limitation of this slice, not a decision about presence and contracting status.

## Fingerprint v1

SHA-256 (lowercase hex) of the UTF-8 text of `JSON.stringify` of this nested array (no object key order is relied on, no whitespace):

```
["modeling-standard/brief-fingerprint", 1,
 briefId, projectId,
 [[partyId, onSite | null], ...]                      sorted by partyId
 [[pairId, [partyId, partyId]], ...]                  sorted by pairId; the two party ids sorted
 [[itemId, layer, pairwiseAgreementId | null, subjectPartyId | null, shape | null,
   itemKey | null, content | null, value | null, [approverId, ...]], ...]
                                                      in canonical order: position, then itemId
]
```

- Ids are lowercase UUID text. Every sort is by code point.
- Text is hashed exactly as stored: no trimming, no Unicode normalization.
- `onSite` is the party's stored presence fact; `null` if none (impossible once shared, kept for totality).
- `approverId`s are each item's derived approvers, exactly as `brief_tick_check` and `approversOf` derive them: universal → the parties on site; pair-scoped (shared or money) → the pair's two parties; shared project-wide → every party. Presence and the pair relationships are therefore bound twice: directly, and through each item's approvers.

Deliberately **not** bound:

- **Raw positions.** They only order the items. A gap would encode that a request was declined (HC1).
- **`pending`.** Always null at freeze, by precondition.
- **Ticks.** At freeze they equal each item's approvers, by precondition. How affirmation is evidenced belongs to S11 and is unresolved (below).
- Times, actors, account bindings.

Golden vector (pinned in `tests/database/brief-signing.test.ts`): the snapshot there hashes to `fd2348bc065a9d76053e15e0a111150520bfdb7033ec96e00879f33844a8d50d`.

**Who computes it.** The application computes the digest (`briefFingerprint`). On every live → signing transition the database recomputes the same v1 digest from the rows as they are at that moment and **refuses any other value** (`live_brief_signing_fingerprint_mismatch`). The two serializations are held equal by tests over awkward text (quotes, backslashes, newlines, control characters, non-ASCII, emoji) and a party off site. So a stale or invented digest cannot enter signing, even by direct SQL.

## What the database enforces

| Guard | While | Effect |
|---|---|---|
| `live_brief_check_phase` (replaced) | live → signing | Only in READ COMMITTED (`live_brief_signing_read_committed_only`); exactly two parties and one pair (`live_brief_signing_requires_two_party`); nothing pending, every item has stored wording and every derived approver's tick (`live_brief_signing_requires_ready`); the fingerprint equals the database's own v1 digest (`live_brief_signing_fingerprint_mismatch`) |
| `live_brief_check_phase` | same phase | The fingerprint cannot be replaced or cleared in place (`live_brief_fingerprint_fixed`) |
| `live_brief_check_phase` | anything else | Only draft → live, live → signing, signing → live (`live_brief_phase_transition`); signing → live must clear the fingerprint (`live_brief_fingerprint_iff_signing`) |
| `brief_item_guard_live` (replaced) | signing | Every item insert, update and delete refused (`brief_item_signing_fixed`) |
| `brief_tick_guard_delete` (new) | signing | No tick removed (`brief_tick_signing_fixed`): withdrawal returns to live first, then removes the tick, in one transaction |
| `brief_tick_check` (S09) | signing | No tick added (`brief_tick_requires_live`) |
| `brief_party_presence_guard`, `project_party_guard_roster` (S09) | signing | Presence and roster fixed |
| `pairwise_agreement_guard_signing` (new) | signing | No pair added (`pairwise_agreement_signing_fixed`); READ COMMITTED only (`pairwise_agreement_read_committed_only`) |
| `project_party_guard_roster` (replaced) | live, signing | No party added (`project_party_roster_closed`), as in S09, now race-free; READ COMMITTED only (`project_party_read_committed_only`) |

A bare `signing → live` with the fingerprint cleared is admitted by the database: it is the withdrawal transition, and it leaves an ordinary live brief. The data functions offer it only through an untick.

These guards bind the runtime role. Pairs and parties are protected against update and delete by privilege, not by triggers: the runtime role has only SELECT and INSERT on `pairwise_agreement` and `project_party`, as in S09. The migration (owner) role is not constrained by them.

**Roster and pair races (also an S09 fix).** A party or pair insert begun before a project's brief was visible to it used to pass the roster guard (which can only lock a brief row it sees), and a share or freeze counting parties in its own snapshot missed the uncommitted row. The draft → live and live → signing transitions and the roster and pair guards now also take a per-project advisory lock and re-read after it, so whichever comes second sees the other. The guards first wait out a transition in flight on the brief row, so the two lock orders cannot deadlock. This tightens enforcement of S09's decided rule (no party is added once the brief is shared) without changing it.

**Concurrency.** Every guard on a write the fingerprint or readiness depends on locks the brief row `FOR SHARE`. `freezeBriefForSigning` takes the advisory lock and then locks the brief row `FOR UPDATE` before reading anything. So a concurrent write, even one bypassing the data functions, has either committed (and is read) or waits (and then finds the brief signing). The database's own recheck and digest comparison make any remaining race fail closed. The live → signing checks read other tables, so they accept only READ COMMITTED, as the affirmation guards in 0013 do.

**Runtime privilege.** `GRANT UPDATE (fingerprint) ON live_brief TO app_runtime`, alongside S09's `UPDATE (phase)`. New functions are not executable by PUBLIC.

## Readiness is S09's structural rule

S10 freezes exactly what S09 calls ready to sign: the brief is live, nothing is pending, and every current item is green for each of its derived approvers. That rule is structural. It is vacuously met by a brief with no items, or by universal items with nobody on site to tick them. It does not mean the brief holds every required term: the required-term catalogue is not drafted (D04), and completeness enforcement is a later gate before real use. S10 does not change or strengthen the readiness rule.

## Withdrawal and mutation rules, reconciled

- **Untick while signing = withdrawal** (D02 Q11: withdrawal before finality is allowed). The brief returns to live with the tick gone, and nothing records that it was frozen or withdrawn (HC1).
- **Every other change while signing is refused** (D04 Q12: nobody signs a document that can still change). A subject who wants to decline a request after a freeze unticks first, which withdraws, then declines in live; the shrink-only rule holds (D02).
- **Re-freezing** rechecks readiness and recomputes the fingerprint. The same state gives the same fingerprint; any change gives a different one.

## Serialized outcomes (tested)

| Order | Outcome |
|---|---|
| Decline, then freeze | Both succeed when the rest is ready; the fingerprint is of the brief without the request |
| Freeze, then decline | The decline is refused (`not_live`); the brief stays as frozen |
| Untick, then freeze | The freeze is refused (`not_ready`) |
| Freeze, then untick | The untick withdraws: live, that tick removed, no fingerprint |
| Two freezes | One transition, one `not_live` |
| Raw SQL decline or tick removal in flight, bypassing the data functions | The freeze waits for it (the test confirms it is blocked on a lock), then fingerprints the resulting brief or refuses `not_ready` |
| A party insert begun before the brief existed, still uncommitted | The share waits for the project's roster lock, then refuses (`live_brief_share_requires_presence`); the same lock serializes freeze against party and pair inserts |

Races of freeze against decline and against untick are also run repeatedly, alternating which call is issued first, asserting that only these serialized outcomes occur and that a signing brief's fingerprint always equals the digest of its current rows.

## Not in this slice

- **Signatures, pending signatures, the final contract**, evidence chains, device or IP capture, account or provider integration, any participant-facing or public signing control. All S11 or later.
- **The visible signing act** (D04, OPEN).
- **The demo.** Its visible journey is unchanged. Only the inspector record's `phase` enum admits `signing`, and the simulator maps the new constraints to refusal codes; the demo never freezes a brief.

## Open for later slices

- **S11 affirmation evidence (unresolved).** D04 requires the final contract to carry "each person's affirmation and signature evidence". One reading records, at finalization, which person affirmed which term, alongside the signatures. Another, from earlier design input outside this repository, holds that once every derived approver has ticked, the affirmation is implied by the signed fingerprint and the topology, so no separate affirmation record is needed; it leans on HC1 (intermediate states are not retained; ticks are live-brief state, not signatures) and on the engineering position in `LIVE-BRIEF-REBUILD.md` §18 that ticks are discarded at finalization, which is not a Cory ruling. Neither is decided here. S10's fingerprint binds content, topology, presence and approvers, but not ticks, so it is compatible with both.
- **The chaperone and the signing unit** (above).
- **What a party sees while a brief is signing.** No participant-facing surface in this slice shows a signing brief.

## Tests

- `tests/database/brief-signing.test.ts`:
  - freeze preconditions, including Fixture 2's topology driven to all-green before the topology refusal;
  - the database's transition guard: not ready, wrong or stale digest, malformed digest, REPEATABLE READ;
  - the application and the database computing the same digest;
  - every change refused while signing, through the data functions and through direct runtime-role SQL, with fingerprint immutability;
  - withdrawal with no residue (a full row comparison against the never-frozen brief), an untick without a tick, re-freeze;
  - the fingerprint's golden vector, its sensitivity to every bound field, and its insensitivity to position gaps, input order and id case;
  - the serialized outcomes above, deterministic and raced.
- `tests/database/migration-upgrades.test.ts`: a database populated at 0022 with a draft and a live, all-ticked brief upgrades with rows and phases unchanged and fingerprints null, matches a fresh catalog, and the pre-existing brief can be frozen.
- Schema pins updated deliberately in `briefs.test.ts` (columns, constraints), `runtime-role.test.ts` (UPDATE columns), `trigger-functions.test.ts` (the two new functions), `live-briefs.test.ts` (a raw `phase = 'signing'` now meets the digest guard) and the S08 upgrade case (the new null column).
- `live-briefs.test.ts`'s decline row count is scoped to its own project, so suites writing to the same test database concurrently cannot race it. (An identical edit exists on the unmerged demo branch `demo/participant-journey`, so the two merge cleanly.)
