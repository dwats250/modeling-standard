# October semantic impact on S01–S05

Status: READ-ONLY ANALYSIS, 2026-10-15. No code, schema, migration, test or demo behaviour was changed to produce it.

This maps Cory's 2026-10-09 and 2026-10-14/15 rulings ([`decisions/2026-10-09-15-cory-reconciliation.md`](../../decisions/2026-10-09-15-cory-reconciliation.md)) onto what is merged on `main` at `1ef4b1a`. It says where S01–S05 still match Cory, where they are neutral substrate, and where they are now semantically stale.

> **Corrected 2026-10-15 (handoff corrections HC1 and HC2).** The first version of this analysis treated S04's frozen version history and S05's per-version rows as valid evidence, and carried R1 and R2 as open questions. Both rested on errors in the session handoff, not on Cory: **there is no version history** — one live brief cycles before signing, intermediate states are not retained, and only the final contract is evidence (HC1); and **there is no proposer-only drop** — a declined term is gone and the other person continues or withdraws (HC2). S04 and S05 are reclassified below. The code is not defective: it implemented the earlier understood model correctly.

It states **constraints and required capabilities only**. It does not choose table structure, whether call-sheet terms get their own table, whether term subject is a column or a relation, signature or evidence structures, the hash chain, the archive token, OAuth, a verification vendor or a payment provider. Those belong in later technical PRDs after this reconciliation is reviewed.

## Classifications

- **UNCHANGED / STILL VALID** — matches the new rulings as built.
- **INCOMPLETE BUT COMPATIBLE** — correct as far as it goes; later slices add to it without undoing it.
- **TEMPORARY GUARD NOW REPLACEABLE** — a guard that existed only because a question was open; the question is answered, so a later slice may replace it.
- **SEMANTIC MISMATCH — REQUIRES NEW SLICE** — the built semantics contradict a ruling, or the ruling needs a capability whose shape the current structure does not express.
- **SEMANTIC MISMATCH — REQUIRES REPLACEMENT FOR PRODUCT FLOW** — the mechanism models something the product does not have; the product flow needs a different mechanism, not an addition to this one.
- **WORDING/DOCS STALE ONLY** — the mechanism is fine; only names, comments or prose now mislead.

Nothing here is urgent in the sense of a defect: no production path writes any of these tables, production has no principal, and no real participant exists. "Mismatch" means the next slice must not build on the old reading.

## Summary

| Slice | Overall | Main reason |
|---|---|---|
| S01 project and party core | UNCHANGED / STILL VALID, INCOMPLETE BUT COMPATIBLE | Project and bare party remain correct substrate. Identity binding, presence and roster visibility are additions. |
| S02 pairwise agreement core | INCOMPLETE BUT COMPATIBLE, with one mismatch | One agreement per pair, per project is now decided; the schema permits duplicates. |
| S03 term units | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Two layers (universal; private commercial/craft) no longer match three layers with money the only private thing. Terms do not carry a subject, open-parameter shape, decide-together state or fixed deliberate-tick identity. |
| S04 presented versions | SEMANTIC MISMATCH — REQUIRES REPLACEMENT FOR PRODUCT FLOW | The product has one live brief before signing; intermediate presentations are not preserved, and frozen historical versions are not part of Cory's model. Only the final contract becomes immutable evidence. S04's sealing and fidelity techniques may still be useful for that final contract. |
| S05 per-term affirmation | SEMANTIC MISMATCH — REQUIRES REPLACEMENT/REINTERPRETATION | Tick state belongs to the live brief and is not signature evidence. Ticks need not survive as independent history once the brief changes. There is no carry-forward across retained versions, because there are none. Final evidence binds each party to the single final contract. |
| Demo | WORDING/DOCS STALE ONLY, and simulator abilities that misrepresent decided rules | Labels describe two layers, open questions now answered, and an "open decisions" view that is out of date. |
| Tests | Mostly STILL VALID; a few names and comments encode superseded or now-answered framing | Listed below. None asserts a superseded rule as a product feature. |

## S01 — project and party core

| Aspect | Classification | Notes |
|---|---|---|
| Project as the container; creator role-neutral and not a party | UNCHANGED / STILL VALID | D01 unchanged. No organizer confirmation (D02) and no creator-only visibility (D10) reinforce creator neutrality. |
| Bare project-local party | INCOMPLETE BUT COMPATIBLE | D03 is now decided (account via Google/Apple sign-in at invitation; verification at first participation). Binding a party to a person is an addition to `party.ts` and the party table, as S01 anticipated. No identity change is designed here. |
| Roster withheld from responses | WORDING/DOCS STALE ONLY | Withheld because D10 was open. D10 now says the roster is visible to everyone before agreeing. Building that is a new presentation capability, not a fix. |
| No party-adding route | INCOMPLETE BUT COMPATIBLE | Still correct until invitation (D03) and additions-as-decisions (D02) are built. |
| Presence | INCOMPLETE BUT COMPATIBLE | "Nobody in the room who is not in the agreement", the visitor chaperone and household-member disclosure (D12) imply that everyone present is a party. A bare party can carry that later. No column for "present" or "role" is implied by this analysis. |

## S02 — pairwise agreement core

| Aspect | Classification | Notes |
|---|---|---|
| Two distinct parties of the same project; composite foreign keys | UNCHANGED / STILL VALID | |
| Canonical UUID ordering, no side with precedence | UNCHANGED / STILL VALID | Role neutrality still holds. Note that terms now have a **subject** (D04); that is a property of terms, not of the pair, and does not argue for ordered sides. |
| No uniqueness on the pair | SEMANTIC MISMATCH — REQUIRES NEW SLICE | **One agreement per pair, per project** (Q5). The schema currently permits duplicates, and `tests/database/pairwise-agreements.test.ts:86` creates the same pair twice (incidentally, to prove order independence). A later slice needs to enforce one per pair. **Interaction to settle in that slice's PRD, not here:** a date change or a variable-supplier replacement ends the agreement and starts a new one (A5a). Whether that new agreement lives under the same project — which would collide with a plain uniqueness rule — or under a new project is a technical modelling question that must honour both rulings. |
| What the pairwise agreement holds | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Under the three-layer ruling the pairwise agreement carries **the fee and little else**; craft terms, deliverables and usage are shared. See S03. |
| No actor recorded | UNCHANGED / STILL VALID | Authorship is not recorded (Q9), and there is no proposer role or proposer-only drop (HC2). No creator, proposer or sender column is needed for that reason. (R2, previously cited here, is withdrawn.) |

## S03 — term units

| Aspect | Classification | Notes |
|---|---|---|
| Each term is its own row and unit of evidence | UNCHANGED / STILL VALID | Reconfirmed: everything individually represented and recorded (D04). |
| Append-only, no delete | UNCHANGED / STILL VALID | Consistent with "terms are never rewritten" and shrink-only change (dropping is a new version without the term). |
| Two layers: `universal_term` (project) and `agreement_term` (pairwise, "commercial and craft") | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Now three layers: universal safety; **shared logistics, the call sheet**; **private money** (Q14, A2). Craft terms, deliverables and usage are shared, not pairwise-private. Money is the only private thing. The existing tables are not wrong storage as such — `universal_term` still fits universal safety — but the meaning "pairwise = commercial and craft" is superseded. **Do not assume the fix is adding columns to the existing tables.** Whether shared logistics needs its own container, and how the private fee relates to the pairwise agreement, is a later PRD decision. |
| No subject on a term | SEMANTIC MISMATCH — REQUIRES NEW SLICE | **The subject of a term controls it** (Q7). A term must be able to say whom it is about, so that the subject's declaration cannot be declined by a counterparty while a request about someone else can be declined by that person. Representation is not chosen here. |
| No term shape | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Terms now have at least three shapes: a declaration by its subject, a request about another person, and an **open parameter** ("you set this one") whose value its subject declares. |
| No requiredness | INCOMPLETE BUT COMPATIBLE | Requiredness is now product-owned (anything protecting physical or emotional safety, including compensation and deliverables). A drafter can never set it. The concrete required list for the D01 shoot is not yet drafted. |
| No fixed deliberate-tick identity | INCOMPLETE BUT COMPATIBLE | The product owns a fixed named list — fee, coverage level, physical contact, stop rule — that is outside group-check. Terms need a way to be recognized as one of those named items. There is no body/money classification to build; the `EXCLUDED_SEMANTICS` lists that forbid "body" and "money" names remain apt. |
| No decide-together state | INCOMPLETE BUT COMPATIBLE | No accidental blanks reach another person: every field is complete or explicitly decide-together before a project is shareable (A3). Not representable today; additive. |
| Text-only `content` | INCOMPLETE BUT COMPATIBLE | A named field such as the fee, coverage level or exact address is more than opaque text. Structure is a later PRD choice. |
| `position` as storage order | UNCHANGED / STILL VALID | |

## S04 — presented versions

Overall: **SEMANTIC MISMATCH — REQUIRES REPLACEMENT FOR PRODUCT FLOW.** S04 implemented the earlier understood model — successive frozen presentations kept as history — correctly. Cory's model has no such history (HC1).

| Aspect | Classification | Notes |
|---|---|---|
| Successive frozen versions per container, kept forever | SEMANTIC MISMATCH — REQUIRES REPLACEMENT FOR PRODUCT FLOW | There is one live brief that cycles until everything is green. Intermediate states are not retained as evidence; a declined term disappears and nothing preserves that it was declined (Q10, HC1). Keeping every presented version contradicts that. |
| Sealing, faithful copy, server time, no update or delete | INCOMPLETE BUT COMPATIBLE, as technique | These are the properties the **final contract** needs: frozen wording, database time, append-only. They may be reused for the final contract; they no longer justify retaining intermediate versions. |
| Gapless sequence numbering | SEMANTIC MISMATCH — REQUIRES REPLACEMENT FOR PRODUCT FLOW | Numbers successive presentations, which the product does not keep. |
| Caller chooses which terms to present (escalation and universal omission mechanically possible) | SEMANTIC MISMATCH — REQUIRES REPLACEMENT FOR PRODUCT FLOW | The live brief only shrinks (Q4, Q11) and never loses a safety term (Q7, A5b). The replacement must enforce both on the live brief; the demo simulator enforces them today. |
| Whole-document resend | Replacement requirement | The whole brief returns intact with agreed terms still agreed (Q3). In the live-brief model this is one document cycling, not a series of versions. |
| Who presented, to whom | UNCHANGED / STILL VALID | Not recorded, and not needed: authorship is not recorded and there is no proposer role (Q9, HC2). |
| No digest | Replacement requirement | The fingerprint and chained timestamps belong to the final contract (Q17, HC1). |

## S05 — per-term affirmation evidence

Overall: **SEMANTIC MISMATCH — REQUIRES REPLACEMENT/REINTERPRETATION.** S05 implemented per-version, per-term evidence rows correctly for the earlier model. Under HC1, ticks are live-brief state and the evidence is each party's binding to the single final contract.

| Aspect | Classification | Notes |
|---|---|---|
| One append-only row per party per presented term, bound to a version | SEMANTIC MISMATCH — REQUIRES REPLACEMENT/REINTERPRETATION | Ticks belong to the live brief. They are not signature evidence and need not survive as independent history once the brief changes. |
| Reading rows as signature or finality | WORDING/DOCS STALE ONLY | Ticking and signing are separate acts (Q12). The rows never claimed finality. The signature is a separate act once everything is green, producing the final contract. Not built. |
| Sole-version-1 guard (`*_single_version_only`) | SEMANTIC MISMATCH — REQUIRES REPLACEMENT/REINTERPRETATION | Previously classed as replaceable by carry-forward across versions. There is no carry-forward across retained versions, because there are no retained versions. Already-agreed terms simply stay green on the one live brief (Q3). |
| Taking away | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Withdrawal before finality and consent withdrawn during the shoot (Q11). Mid-shoot withdrawal is recorded as a fact ("stopped early, called by X"), never as failure, and is distinct from DNF. |
| No negative row | UNCHANGED / STILL VALID | A "no" is not recorded (Q10). |
| Universal rows accept any project party | INCOMPLETE BUT COMPATIBLE | "On site" is physical proximity (Q8). Who ticks universal terms follows presence once presence exists. |
| Group-check not built | INCOMPLETE BUT COMPATIBLE | A convenience for ordinary terms; the fixed deliberate-tick list is outside it. Never shown (Q16). |
| Final evidence: fingerprint, each person's affirmation and signature evidence, time, credential, device | Replacement requirement | Attaches to the final contract (Q17, HC1). Not built; structures not chosen here. |
| Route-specific acceptance | INCOMPLETE BUT COMPATIBLE | Posted work is wholesale acceptance; direct send is per-term (Q15). |
| Subject control | SEMANTIC MISMATCH — REQUIRES NEW SLICE | The counterparty cannot decline the subject's declaration — only accept or walk away. Depends on term subject (S03). |

## Demo

Classification: **WORDING/DOCS STALE ONLY** for labels, plus simulator abilities that now demonstrate behaviour Cory has decided against. Nothing is fixed in this task.

> **Update, Sprint 1 Phase 2:** the labels and simulator abilities below have since been corrected in the demo only (`docs/engineering/DEMO.md`, "Still stale by construction" lists what remains). The list is kept as the record of what was stale at `1ef4b1a`.
>
> **Update, 2026-10-15 handoff corrections:** the demo's version inspector (successive sealed versions, per-version tick grids) is now **historical implementation visualization**, not the current product model (HC1). The demo's open-seams view still names R1 and R2 as open Cory questions; both are withdrawn. Demo code is deliberately unchanged in this correction pass; the next term-model sprint replaces or retires that presentation.

Misleading labels (file and line from the inventory at `1ef4b1a`):

- `src/demo/ui/app.js:271-272` — "Private commercial and craft terms, each agreement relating exactly two parties (S02, D02)." Superseded: money is the only private thing.
- `src/demo/ui/app.js:266-267` — "Who counts as on site is undecided." Now decided: physical proximity.
- `src/demo/ui/app.js:308-323` (`LAYER_COPY`):
  - universal presentHint and note — "whether a shared safety or consent term may be left out is undecided". Now decided: it may never be left out.
  - pairwise and universal `laterVersion` — "how a resent version is affirmed is undecided (D02)" / "What a later shared version means is undecided". Now decided: one live brief cycles with agreed terms staying agreed; no versions are retained (HC1).
- `src/demo/ui/app.js:384` and `SIM_ERRORS.version_not_affirmable` (:577-583) — "How a later version is affirmed is undecided."
- `src/demo/ui/app.js:16-23` (`UNAVAILABLE`) — "How a person becomes a party of a project is undecided (D03)", "Participation credential and invitation are undecided (D03)", "What each party sees is mostly undecided (D10)". D03 and D10 are decided. The actions should stay unavailable (not built), but the reasons are stale.
- `src/demo/ui/app.js:420-502` (`DECISIONS`, `CAPABILITIES`, "Four open decisions") — presents D03 and D10 as open with now-answered questions; D04's open list asks "How body and money terms are identified" (framing rejected) and "Who decides that a term is required" (answered: the product). The scope note lists "D02 lifecycle, D06 real use … D11 verification timing" as open; D06 and D11 timing are decided, D02 lifecycle is answered except R2. Capability "Group-check for ordinary terms: waits on D04" is now decided as a convenience. "Show an agreement as final: D04" — finality is now ticks-then-signature with no organizer step.
- `src/demo/ui/index.html:11-14` banner — "it is not what any party would see (D10 open)". Still true that it is not a party view; "D10 open" is stale.
- `src/demo/fixtures.ts:86-140` annotations — "D02 two layers", "Private pairwise agreement", "Commercial and craft agreements are private and pairwise", "Who may see which agreement is mostly open (D10)", "reconciliation ruling 11". Fixture 2's A–C and B–C pairwise "craft" and "commercial" terms illustrate the superseded layer split.
- `docs/engineering/DEMO.md:15, 30, 37-41` — the same two-layer, open-omission and open-D10 framing.

Simulator abilities that now demonstrate decided-against behaviour:

- Presenting a later **universal** version without a term (universal omission) — forbidden by Q7/A5b.
- Presenting a later version containing **any** stored term, including one not in the previous version — an escalation, forbidden by Q4.
- Placing craft and deliverable terms in the pairwise layer — superseded by the three-layer ruling.
- Nothing in the simulator can create a duplicate pair (it creates exactly one agreement per scenario), so it does not demonstrate duplicates.

## Tests whose names or assertions encode superseded or now-answered framing

None of these is changed here. They describe the built mechanism truthfully; their *reasons* are now stale.

| Test | What is stale |
|---|---|
| `tests/database/affirmations.test.ts:254` "…escalation rules (ruling 6) do not exist yet" | Ruling 6 is superseded; escalation cannot occur. The assertion (a later version takes no rows) is the temporary guard. |
| `tests/database/affirmations.test.ts:262` "…supersession (D02 d, g, h) is open" | D02 (d), (g), (h) are answered. Same guard. |
| `tests/database/affirmations.test.ts:271` "…signing timing (D04) is open" | Signing is now a separate act after all-green; the `*_after_presentation` check is about tick timing. |
| `tests/database/versions.test.ts:163-166` comment and test "leave an earlier version untouched when a later one holds fewer terms" | For the universal layer the comment says omission is open; it is now forbidden. The assertion (earlier versions intact) remains valid. |
| `tests/database/pairwise-agreements.test.ts:86` | Creates the same pair twice; incidentally contradicts one-agreement-per-pair. |
| `tests/database/affirmations.test.ts` universal `affirmers` comment "who must affirm is open" | Answered: physical proximity. |
| `tests/http/projects.test.ts:165` "…(roster visibility is not decided)" | Decided: roster visible before agreeing. |
| `tests/demo/export.test.ts:66` | Asserts the snapshot says "whether a shared safety or consent term may be left out is undecided". |
| `tests/demo/export.test.ts:72` | Asserts the decisions view wording ("A selected walkthrough of four decisions"), which lists now-decided items as open. |
| `tests/demo/simulator.test.ts:92` and `tests/demo/demo.test.ts:182` | Assert the drop-and-resend leaves version 2 unaffirmable (409 `version_not_affirmable`) — the temporary guard. |
| `tests/demo-browser/regression.test.ts:152, 206-216` | Assert universal wording matches `/undecided/` and `/Cory/`, and that no text says "supersed", "replac" or "current". |

The `EXCLUDED_SEMANTICS` name lists (`body`, `money`, `requir`, `sign`, `final`, `decline`, `witness`, `proxy`, `minor`, `youth`) remain appropriate: they guard against the schema naming things that are not built. A later slice that builds signing or requiredness will narrow them deliberately.

## Change locality and preserving evidence

- **Keep:** S01 project and party; S02 pair topology and canonical ordering; S06 account and party binding; append-only grants and database-time techniques.
- **Replace for the product flow:** S04's retained version history and S05's per-version tick rows. The live brief, its tick state and the final contract with its evidence are the replacement; their shapes are for the next term-model PRD, not this note. S04's sealing and fidelity techniques may carry over to the final contract.
- **New capability, shape undecided:** term subject and shape (declaration, request, open parameter); decide-together; product requiredness; the fixed deliberate-tick identity; three-layer placement (shared logistics, private money); one-agreement-per-pair with the end-and-restart cases; shrink-only and no-universal-omission rules on the live brief; withdrawal and mid-shoot stop as facts; the signing event; final-contract evidence and chaining.
- **No Cory blocker remains for this work** from R1 or R2: both are withdrawn (HC1, HC2). The remaining Cory items (no-means-no wording, the signing act, vocabulary) affect content and wording, not this structure.
- **Not generalized:** everything above is for photo shoots. Fashion shows are a separate product.
