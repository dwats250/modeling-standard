# October semantic impact on S01–S05

Status: READ-ONLY ANALYSIS, 2026-10-15. No code, schema, migration, test or demo behaviour was changed to produce it.

This maps Cory's 2026-10-09 and 2026-10-14/15 rulings ([`decisions/2026-10-09-15-cory-reconciliation.md`](../../decisions/2026-10-09-15-cory-reconciliation.md)) onto what is merged on `main` at `1ef4b1a`. It says where S01–S05 still match Cory, where they are neutral substrate, and where they are now semantically stale.

It states **constraints and required capabilities only**. It does not choose table structure, whether call-sheet terms get their own table, whether term subject is a column or a relation, signature or evidence structures, the hash chain, the archive token, OAuth, a verification vendor or a payment provider. Those belong in later technical PRDs after this reconciliation is reviewed.

## Classifications

- **UNCHANGED / STILL VALID** — matches the new rulings as built.
- **INCOMPLETE BUT COMPATIBLE** — correct as far as it goes; later slices add to it without undoing it.
- **TEMPORARY GUARD NOW REPLACEABLE** — a guard that existed only because a question was open; the question is answered, so a later slice may replace it.
- **SEMANTIC MISMATCH — REQUIRES NEW SLICE** — the built semantics contradict a ruling, or the ruling needs a capability whose shape the current structure does not express.
- **WORDING/DOCS STALE ONLY** — the mechanism is fine; only names, comments or prose now mislead.

Nothing here is urgent in the sense of a defect: no production path writes any of these tables, production has no principal, and no real participant exists. "Mismatch" means the next slice must not build on the old reading.

## Summary

| Slice | Overall | Main reason |
|---|---|---|
| S01 project and party core | UNCHANGED / STILL VALID, INCOMPLETE BUT COMPATIBLE | Project and bare party remain correct substrate. Identity binding, presence and roster visibility are additions. |
| S02 pairwise agreement core | INCOMPLETE BUT COMPATIBLE, with one mismatch | One agreement per pair, per project is now decided; the schema permits duplicates. |
| S03 term units | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Two layers (universal; private commercial/craft) no longer match three layers with money the only private thing. Terms do not carry a subject, open-parameter shape, decide-together state or fixed deliberate-tick identity. |
| S04 presented versions | INCOMPLETE BUT COMPATIBLE, with mismatches | Sealing and fidelity remain valid evidence. The caller may still add, widen or omit terms (including universal ones), which the rulings now forbid. |
| S05 per-term affirmation | TEMPORARY GUARD NOW REPLACEABLE, with mismatches | Rows remain valid tick evidence. The sole-version-1 guard can be replaced by approval carry-forward across shrink-only resends. Tick is not signature. Evidence metadata is now required. |
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
| No actor recorded | UNCHANGED / STILL VALID, pending R2 | Who may create an agreement is still not expressed. R2 (who may drop, given no recorded authorship) is open; do not add a proposer column on the strength of Q9's second sentence. |

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

| Aspect | Classification | Notes |
|---|---|---|
| Sealing, faithful copy, numbering, server time, no update or delete | UNCHANGED / STILL VALID | This is exactly the evidence Q17 wants kept, and it remains valid. Preserve it. |
| Caller chooses which terms to present | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Later versions may now **only shrink** (Q4, Q11). Nothing may be added or widened, and **escalation cannot occur**. Today a later version may contain any terms of the container, including ones never in version 1. A later slice must constrain a resend to a subset of the version it replaces (and define what "widen" means for valued terms). |
| Universal omission is mechanically possible | SEMANTIC MISMATCH — REQUIRES NEW SLICE | **A safety term can never be dropped or left out** (Q7, A5b). The universal layer's later versions must keep every universal term. The current docs already flag this as "open"; it is now decided the other way. |
| Whole-document resend | INCOMPLETE BUT COMPATIBLE | The whole document returns intact, with agreed terms still agreed (Q3). Versions per layer can be read together; whether a resend is one presentation across layers is a later design question. |
| Sequence says nothing about which version is current | INCOMPLETE BUT COMPATIBLE | With escalation and amendment gone, the latest version of a live agreement is the one in play. A date change or variable-supplier replacement ends the agreement rather than producing a later version (A5a). |
| Who presented, to whom | INCOMPLETE BUT COMPATIBLE, pending R2 | Still not recorded. Q9 says authorship is not recorded; R2 asks how that meets proposer-only drop. Do not add a presenter column until R2 is answered. |
| No digest | INCOMPLETE BUT COMPATIBLE | Document fingerprint and chained timestamps are now a product requirement (Q17). Additive; the chain is not designed here. |
| Version history retained | UNCHANGED / STILL VALID, pending R1 | "Change history held in the record, never shown" (A2) matches. R1 asks whether a version carrying a later-dropped term may be retained given "a no is not recorded". Nothing is removed while R1 is open. |
| Version history visible to participants | — | No participant view exists. When one is built, history is never shown (noise doctrine). |

## S05 — per-term affirmation evidence

| Aspect | Classification | Notes |
|---|---|---|
| One row per party per presented term, with database time | UNCHANGED / STILL VALID | Valid **tick** evidence. Keep it. |
| Reading rows as signature or finality | WORDING/DOCS STALE ONLY | Ticking and signing are separate acts (Q12). S05 rows never claimed finality (the tests forbid "final", "sign" and "status" names), but the slice title "per-term affirmation evidence" and some prose can be read as signing. The signature is a separate later act, only after everything is green for everyone. Not built. |
| Sole-version-1 guard (`*_single_version_only`) | TEMPORARY GUARD NOW REPLACEABLE | It existed because escalation (ruling 6) and the meaning of a resend (D02 d, g, h) were open. Escalation is now impossible and resends only shrink. A later slice can replace the guard with **carry-forward**: approvals already given stay approved across a shrink-only resend, and nobody re-ticks (Q3). Until R2 is answered the resend itself cannot be fully authorized, so replacement should be planned with R2. |
| Approvals carried forward | SEMANTIC MISMATCH — REQUIRES NEW SLICE | Rows are bound to a presented term of one version. Carry-forward needs a way to show that a term in version *n+1* is the same term already ticked in version *n* (the S04 source-term reference may serve; not decided here). |
| Taking away | SEMANTIC MISMATCH — REQUIRES NEW SLICE | A person may withdraw before finality and may withdraw consent during the shoot (Q11). Rows are append-only with no withdrawal concept. Mid-shoot withdrawal is recorded as a fact ("stopped early, called by X"), never as failure, and is distinct from DNF. How either is represented is a later PRD choice. |
| No negative row | UNCHANGED / STILL VALID | A "no" is not recorded (Q10); no decline row should be added merely because a term was declined. The current absence of decline rows matches. |
| Universal rows accept any project party | INCOMPLETE BUT COMPATIBLE | "On site" is now physical proximity (Q8): everyone in the room affirms universal safety terms; someone never present signs only what concerns them. Affirmation scope can be expressed later once presence is. |
| Group-check not built | INCOMPLETE BUT COMPATIBLE | Group-check is a convenience for ordinary terms; the fixed deliberate-tick list is outside it. Whether someone used it is never shown (Q16). Rows stay individual either way. |
| Credential, IP, device, fingerprint | INCOMPLETE BUT COMPATIBLE | Required now (Q17; DOCTRINE:52 for the credential). Additive. Evidence data structures are not chosen here. |
| Route-specific acceptance | INCOMPLETE BUT COMPATIBLE | Posted work is wholesale acceptance; direct send is per-term (Q15). Per-term rows can evidence both; how a wholesale application is evidenced is a later PRD choice. |
| Subject control in affirmations | SEMANTIC MISMATCH — REQUIRES NEW SLICE | The counterparty cannot decline the subject's declaration — only accept the whole or walk away. Depends on term subject (S03). |

## Demo

Classification: **WORDING/DOCS STALE ONLY** for labels, plus simulator abilities that now demonstrate behaviour Cory has decided against. Nothing is fixed in this task.

> **Update, Sprint 1 Phase 2:** the labels and simulator abilities below have since been corrected in the demo only (`docs/engineering/DEMO.md`, "Still stale by construction" lists what remains). The list is kept as the record of what was stale at `1ef4b1a`.

Misleading labels (file and line from the inventory at `1ef4b1a`):

- `src/demo/ui/app.js:271-272` — "Private commercial and craft terms, each agreement relating exactly two parties (S02, D02)." Superseded: money is the only private thing.
- `src/demo/ui/app.js:266-267` — "Who counts as on site is undecided." Now decided: physical proximity.
- `src/demo/ui/app.js:308-323` (`LAYER_COPY`):
  - universal presentHint and note — "whether a shared safety or consent term may be left out is undecided". Now decided: it may never be left out.
  - pairwise and universal `laterVersion` — "how a resent version is affirmed is undecided (D02)" / "What a later shared version means is undecided". Now decided: whole document returns, approvals carry forward.
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

- **Keep:** S01 project and party; S02 pair topology and canonical ordering; S04 sealing, fidelity, numbering and server time; S05 per-term rows and their time stamps; append-only grants. All of it is valid evidence under the new rulings.
- **Replace, not patch:** the S05 sole-version-1 guard, once carry-forward and shrink-only resends exist (plan with R2).
- **New capability, shape undecided:** term subject and shape (declaration, request, open parameter); decide-together; the fixed deliberate-tick identity; three-layer placement (shared logistics, private money); one-agreement-per-pair with the end-and-restart cases; shrink-only and no-universal-omission constraints on resends; withdrawal and mid-shoot stop as facts; the signature as a separate act; evidence metadata and chaining.
- **Blocked on Cory clarification:** R1 (does a dropped term persist in retained versions) before evidence retention for resends is designed; R2 (authorship versus proposer-only drop) before drop authorization is designed.
- **Not generalized:** everything above is for photo shoots. Fashion shows are a separate product.
