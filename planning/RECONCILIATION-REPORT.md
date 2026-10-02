# Reconciliation report

Prepared 2026-10-02 by Fable 5.1 against `RECONCILIATION-CHARGE.md`, reconciling the planning package at commit `856b037` with Astra's adversarial review (`ASTRA-REVIEW.md`).

**Status: for human review. Nothing was implemented, scaffolded, provisioned or selected.**

## Summary

Astra's central claim holds: the package preserved Cory's authority in its introductions and then turned preferred answers into schemas, invariants, acceptance criteria and a Stage 0 that created shoots and signed people in. Every load-bearing claim in the review was checked against the package and against the pinned sources (`VISION.md`, `PRODUCT-DOCTRINE.md`, and the July documents at `bfbf5f1`). Of thirteen findings, ten are accepted and three are accepted in part (9, 11 and 12). Nothing was rejected outright; three points are held against the review and explained in section G.

The reconciled baseline is smaller and makes fewer promises:

- **Stage 0** is an engineering foundation with no product behaviour, which Dustin can authorize without any Cory decision.
- **Stage 1** is an outcome envelope with a table of which decision blocks which piece of work. It is not a build specification.
- **Real use** is a third, separate gate.
- **Invariants** state ratified outcomes only; every mechanism is labelled as a recommendation.
- **The decision packet** has twelve decisions and no build defaults.

Checking the sources also surfaced three things neither review had raised. They are listed at the end of section A.

---

## A. Disposition of Astra's findings

| # | Finding | Disposition | Reasoning | Documents changed |
|---|---|---|---|---|
| 1 | Stage 0 resolves product questions prematurely | **Accepted** | Confirmed. The walking skeleton signed in by code and created a shoot; "decide now" included adult attestation, the matching-email claim rule, and the version, affirmation and record model. Each depends on D2, D3, D4, D10 or D11. | G, D, F, both READMEs |
| 2 | The implementation gates contradict one another | **Accepted** | Confirmed. The root README barred starting before seams were resolved; H said to start with preferred answers; F said engineering could start on configurable defaults and that no answer would change the model. Replaced by three gates and one rule: unresolved semantics block the affected work. | READMEs, F, G, H |
| 3 | Ratified outcomes and recommended mechanisms are mixed inside invariants | **Accepted, with one precision** | Confirmed throughout B. The precision: doctrine does rule out a blanket signature divorced from the terms (DOCTRINE:51), so H was right that one unbound "I agree" fails doctrine. It was wrong to present eight per-block controls and a typed name as the doctrinal alternative. Clause binding is [R]; the interaction is open (D4). | B, D, H |
| 4 | Multi-party participation overextended into an assumed agreement structure | **Accepted** | Confirmed. "Every listed participant is a party to one version, final when all accept, under one common hash" was an inference. The ratified text points both ways (see section G, item 4), so nothing is selected. | E, A, F, H (D2a) |
| 5 | Organizer obligations underspecified | **Accepted** | Confirmed. Compensation was "per participant" with no payer named; usage had no grantor or recipient; "organizer" bundled coordination, authorship, payment, signing and finalization. Obligations are now described as who owes what to whom, and coordination is separated from obligation. | E, C, F, H (D1, D4) |
| 6 | The evidence design does not prove what each signer saw | **Accepted** | Confirmed, and the requirement is ratified: clause text is frozen as "the literal words the person saw and affirmed" (DOCTRINE:46). Per-party views were generated at record time, after signing. It is now invariant I11 and an explicit evidence chain. | B (I11), E, F |
| 7 | Preservation, retrieval and revocable sharing conflict | **Accepted** | Confirmed. "Retrievable forever" outran its source, which is provisional and subject to retention rules (DOCTRINE:57). "A suspended account cannot perform any command" assumed an answer; the doctrine line is provisional and says "protected actions" (DOCTRINE:80). The ratified expiry language is about personal material, not agreement records (VISION:434). Temporary operational access and durable party evidence rights are separated; the hard cases go to D9 and D3. | B (I3, I6, I13), E, F, H |
| 8 | The paywall correction is incomplete | **Accepted** | Confirmed. Documents were assembled only from an agreed shoot and standalone document tools were excluded, so paid initiation would have paywalled free documents indirectly. VISION:469 requires them free including with people not on the app. The free-document path is now an explicit open item and the import-lint "proof" is replaced by a traced journey. | B (I4), C, G, H (D7, D8) |
| 9 | Identity partly collapsed into accounts and email | **Partially accepted** | The earlier package did separate account, external identity and profile. Astra is right on three points: a participant led to a profile and so to an account; an affirmation assumed an account session despite D3's code-only option; and the matching-email rule treated inbox control as identity. The rule is kept as a security recommendation [F] because the problem it addresses (a forwarded link claimed by a stranger) is real; what should happen is Cory's (D3). | E, B (I8), H (D3, D12) |
| 10 | Stage 1 readiness overstated | **Accepted** | Confirmed. "Seven of eight elements in full", "real shoots with no other feature present", and trade work as the low-risk default were all unsupported. July direction is to verify age at first participation, including joining or creating a brief (CORY-QUESTIONS:184), so attestation is a departure only Cory can approve. | F, G, H (D1, D6, D8, D11) |
| 11 | Replit assumptions survived as defaults | **Accepted for the four carryovers; partially for the stack** | Organizer confirmation, inherited field vocabulary, the self-profile and the "six costumes" misattribution are all confirmed and corrected. On the stack: the criticism of the justification is fair and D now gives positive reasons. The recommendation itself is kept (section G, item 2). | E, C, D, H, research |
| 12 | The architecture is more prescriptive than the invariants require | **Accepted, with one item retained** | Eight of the nine named items are removed or postponed (section F). Retained in reduced form: an enumerable list of operations with a mandatory policy, because Stage 0's own completion evidence depends on it (section G, item 1). | D, C, G |
| 13 | A common hash is not a complete evidence model; failure semantics are missing | **Accepted** | Both confirmed. The four things Astra distinguishes (terms reviewed, clauses affirmed, accepted set, each artifact) are in the evidence chain. Races, retries and failures are listed as Stage 1 engineering obligations once D2 exists. | E, F, D |

**Astra's proposed Stage 0, Stage 1 and decision table** are adopted as the starting point for sections B, C and D below, with the additions noted there.

**Astra's recommended document changes** were all made except: `REVIEW-CHARGE.md` is untouched (it is an input); the research documents were corrected only where the "six costumes" attribution appeared.

### Found while checking the sources

1. **A proposed limit on responding.** The ratified vision contains a proposed free tier listing "responding to a limited number of moodboards and briefs" (VISION:479, marked proposed). The later July ruling says invitee participation is free. A count limit would put agreeing behind a plan. Added to D7.
2. **Element 8 is singular.** "The final immutable PDF, delivered to all parties" (DOCTRINE:53) reads as one document for everyone, while DOCTRINE:55 and VISION:150 speak of participant-specific and relevant terms. This is evidence for Cory on topology and visibility; it is recorded in D2 and I13 and not resolved.
3. **Delivery is ratified; ongoing retrieval is not.** Doctrine promises a portable artifact each participant "holds independently". That promise is met by delivering the artifact out of the product, and it survives every unanswered question about suspension, closure and retention. I13 now separates the two.

---

## B. Revised Stage 0

Full text: `G-development-sequence.md`.

**Scope.** Reproducible install, check, test, build and boot. The real application composition with validated configuration, error handling and redacted logging. A mandatory authorization boundary proven with synthetic operations and synthetic principals. Explicit input and output validation. Local transactional persistence with reviewed migrations and a runtime role separate from the migration role. A bounded evidence-mechanics probe on synthetic bytes, tested against a written threat model. Controllable seams only where exercised. CI proportional to what exists.

**Exclusions.** Login and signup, onboarding, adult attestation, invitation claiming, profiles, represented people, audience models, shoot creation, roles, compensation and terms schemas, agreement states, signatures, record views, retention periods, real email, production evidence storage, product PDF rendering, billing, navigation, presets, production copy.

**Completion evidence.** A clean machine runs everything from the lockfile. A policy-less operation cannot be registered. Wrong and missing principals are rejected on the target object. Undeclared fields cannot be written and raw rows are never returned. Migration from empty and rollback pass. The runtime role cannot alter or delete the probe's bytes. The built artifact boots and answers a health check in CI.

**Why it is product-neutral.** It contains no parties, terms, agreements, credentials, documents or copy. G walks each of D1 to D12 and shows that no answer changes any Stage 0 work. In the Stage 0 production build nobody can sign in, so every protected operation is denied; the boundary is proven before a credential exists to pass through it.

**Additions to Astra's proposal.** The decision-by-decision neutrality table, and the note that the artifact store is chosen from the probe (the database itself is the first candidate, section F).

---

## C. Revised Stage 1

Full text: `F-first-slice.md`.

**Approved outcome envelope.** Ten outcomes, each cited to a ratified line: explicit terms before the work; required participants agree to the terms relevant to them; signatures bound to the clauses affirmed; compensation, deliverables, usage and boundaries preserved; no silent rewriting; affected people return to review; each party receives an independently holdable artifact; cleanup does not destroy another party's evidence; no claim to witness the shoot; no claim of identity verification or enforceability beyond what is done.

**Proposed first-slice shape [F].** One scenario selected by Cory. Adults acting for themselves (a proposed constraint needing D12). Private. As many parties as the scenario has and no more, with parties modelled as a set. Obligations as who owes what to whom. Only the terms the scenario and the ratified evidence set require. One journey from creation to delivered artifact. Amendments only once their rules are settled. Releases included if the scenario triggers them.

**Decisions still blocking precise semantics.** F section 4 maps each piece of work to the decisions it needs. D1 and D12 block everything. If Cory's scenario has two people, the topology question and most of the visibility grid do not block the first slice; if it has more, they do.

**Synthetic demonstration boundary.** Invented people, inboxes the team controls, labelled as a demonstration. It can prove flow, authorization, versioning, evidence mechanics, privacy boundaries, concurrency and artifact creation. It is built on approved semantics like everything else.

**Real-use boundary.** Gate 2. Requires, for a named scenario: Cory's permission for private real use (D6), the releases its usage terms trigger (D8), adult assurance (D11), identity claims that match what is checked, record access and recovery (D9, D3), retention (D9, counsel), and legal review where flagged. Trade and portfolio work is not exempt.

---

## D. Revised Cory packet

Full text: `H-cory-decision-packet.md`. Twelve decisions, the smallest set that covers the seams. D1 comes first because a walkthrough of one real collaboration answers much of D2, D4 and D10 by itself.

| # | Decision | Change from the previous packet |
|---|---|---|
| D1 | First scenario, walked through | Now drives scope and obligations; a structured walkthrough; "trade is lowest risk" removed |
| D2 | Agreement topology and lifecycle | Adds topology, cancellation, roster changes, status of the earlier agreement while a change is pending; no lean on topology |
| D3 | Participation credential | Adds forwarded and mis-addressed invitations, recovery, retrieval after a link expires |
| D4 | Terms and affirmation | Adds payer and payee, deliverer and recipient, signing timing; eight blocks and typed names labelled as proposals |
| D5 | Vocabulary | Names must not promise more than the state delivers |
| D6 | Real use and launch shape | Now the real-use gate itself |
| D7 | Initiation and the paywall | Asks what "initiate" means, whether free documents are reachable without it, and whether responding is unlimited |
| D8 | Documents | Tied to the scenario; releases move into the real-use gate when triggered |
| D9 | Preservation and evidence access | Adds suspension, lost credentials, removed participants |
| D10 | What each party sees | A grid of information kinds by moment |
| D11 | Adult assurance | States that attestation departs from July direction |
| D12 | Who may act, and for whom | New |

---

## E. Deferred

Not being solved yet: public professional profiles; portfolios; comp cards; discovery; public pages; the scheduling suite; delivery transit; reputation; moderation tooling; organizations; professional representation; youth operation; billing; pricing; tiers; referrals and affiliates; production providers; hosting; infrastructure topology; media pipelines; old URLs; compatibility with the prototype; migration.

Also deferred: general sharing-grant mechanisms; age-verification and scanning adapters; a design system; inline editing; purge machinery; scheduled integrity scans.

"Deferred" does not hide a prerequisite. If the scenario Cory selects needs a release, adult assurance, record recovery or anything else on this list for real use, it moves into Gate 2.

---

## F. Architecture simplifications

Removed or postponed because no current requirement supports them (`D-technical-architecture.md`, section 5):

| Item | Disposition |
|---|---|
| Multi-package monorepo layout | Postponed until a second package has a reason to exist |
| Shared domain kernel of product types | Removed; the types depend on Cory's decisions |
| Command registry with rate-limit and mail fields | Reduced to an enumerable operation list with a mandatory policy |
| Universal bearer-grant mechanism | Postponed; Stage 1 builds an invitation credential only |
| General media and blob adapter | Removed from the first stages |
| Object store with a write-once class in Stage 0 | Replaced by a probe; the database is the first candidate for the first slice's small artifacts |
| Headless Chromium renderer subprocess | Postponed; rendering is chosen with the artifact |
| `AgeVerifier`, `ImageScanner`, `Billing` null interfaces | Removed until a real implementation is added |
| Nightly integrity scan | Postponed to beta operations; an on-demand verify command stays in Stage 1 |
| Adult/youth audience column and enum | Removed; one column does not represent Cory's three-state partition |
| Outbox and worker in Stage 0 | Postponed to the first operation that sends mail |
| Profile entity in the first slice | Removed; a party needs a name in an agreement, not a profile |
| Module import diagram for eleven domains | Replaced by four responsibility areas and one dependency rule, which also removes a cycle between working state and evidence |

Kept: one deployable; PostgreSQL as the single system of record; reviewed migrations; runtime and migration roles; restrictive foreign keys toward evidence; one composition root with real PostgreSQL in tests; deny-by-default authorization with generated negative tests; CI gates.

---

## G. Remaining disagreements and uncertainty

**Held against the review:**

1. **The operation list stays.** Astra lists a custom command-registration abstraction as not yet required. The Stage 0 evidence Astra itself proposes (a missing policy is rejected; public operations are classified explicitly) needs operations to be enumerable. The mechanism is cut to the minimum, and framework-native route metadata is an acceptable substitute. Dustin's call.
2. **The stack recommendation stays, with better reasons.** One application on PostgreSQL is not a Replit inheritance, and the database's privilege model is what the evidence mechanics rely on. D now says plainly that the choice is Dustin's and that the reviewer's own fluency is a legitimate input.
3. **A few labelled leans remain in H** (D1, D3, D12). Astra asked that "start with preferred answers" be removed, and it is; nothing is built on a lean. A product owner is usually helped by a recommendation, and these can be stripped if Cory would rather decide cold.

**Unresolved, and not for agents to resolve:**

4. **Topology evidence is mixed.** Element 8 speaks of one PDF for all parties; other ratified lines speak of terms relevant to each participant. Neither Astra's party-specific reading nor the earlier collective one is supported over the other.
5. **"Everyone on set has agreed"** requires the product to know who will be on set. How late additions are handled is in D2f, but whether the product should say anything about people it was never told about is not asked anywhere yet.
6. **Attestation may not be Cory's alone to approve** for real use; counsel may have a view.
7. **Whether a two-person first scenario is realistic.** The recommendation to take the fewest parties depends on what Cory actually shoots. If his typical shoot has crew, the topology and visibility questions block from the start.

**Technical calls left to Dustin:** whether Stage 0 includes an empty web shell (recommended: no; it arrives with the first screen); where artifacts are stored (by probe); the declared threat model; grants alone or grants plus triggers.

**Limits of this pass:**

- Stages 2 to 7 were corrected where findings touched them and were not re-derived.
- The research documents were not re-audited beyond the one attribution.
- Nothing in the sources post-dates 2026-07-23. Cory may have decided things since.
- All "Cory said" text in the sources is an agent or Dustin transcription.

---

## Operating model

The prototype repository's `GOVERNANCE.md`, `PROJECT-ROLES.md` and `CLAUDE.md` name Claude Code as the only agent interface and Dustin as an acting migration lead. Those documents are not in this repository and were not modified. Recommendation: treat them as retired history for this project, and adopt the seven-line operating rule now proposed in the root `README.md` (Cory owns product direction; Dustin owns orchestration and merges; Fable plans; Opus implements bounded slices; Astra may review adversarially; agents do not resolve Cory-owned seams; human review at product and merge boundaries). No further governance apparatus is proposed. `research/CORY-EVIDENCE-RECON.md` item X-12 already records the conflict between the old documents and the current roles.

## Verification

After the revision, an independent pass by a reviewer that had not seen the drafting checked the reconciled documents against the pinned sources and against the charge:

- **Citations.** All 172 source citations were opened. Every cited line exists and supports its claim; quotations match; no claim tagged [R] rests on a provisional, proposed or open line. Three items the doctrine marks DEFERRED had been tagged [R]; they now say "marked DEFERRED in doctrine".
- **Stage 0.** Passed the neutrality test against every decision D1 to D12 and against the charge's include and exclude lists.
- **Consistency.** Decision numbers, invariant numbers, gates and cross-references matched across documents. One contradiction was found and fixed: D9 was listed as needed only for real use while F made in-product record access a Stage 1 piece.
- **Residual defaults.** Five were found and corrected: C called two unratified positions "firm"; E and D described a party's evidence access as non-revocable, which half-answered D9; I still assumed presets and the organizer as author outside its table of examples; F said a finalized agreement "cannot be changed" until amendment rules exist, which touched D2e; H lacked two questions the charge requires (deleting a profile under D9; counterparties in the D10 grid).

The check did not re-verify the research documents or stages 2 to 7.

## Files changed

Revised: `README.md`; `planning/README.md`, `A`, `B`, `C`, `D`, `E`, `F`, `G`, `H`, `I`; `planning/REVIEW-FINDINGS.md` (disposition note added, body untouched); `research/PRODUCT-ARCHAEOLOGY.md` (two attribution lines).

Added: `planning/ASTRA-REVIEW.md`, `planning/RECONCILIATION-CHARGE.md`, `planning/RECONCILIATION-REPORT.md`.

Untouched: `planning/REVIEW-CHARGE.md`, `research/CORY-EVIDENCE-RECON.md`, `research/ENGINEERING-LESSONS.md`.

## Stop

The planning baseline is reconciled. No Stage 0 work, scaffolding, migration, vendor selection or application code was begun. No Cory decision was answered by inference. The next step is human review of this package.
