> Preserved as received on 2026-10-02. Astra's adversarial review of this package at commit `856b037`. Its findings are critique and recommendation, not product authority. Each is dispositioned in `RECONCILIATION-REPORT.md`.

# Modeling Standard — Adversarial Planning Review

**The baseline is greenfield, but the proposed Stage 0 is not product-neutral, and Stage 1 is not yet an approved build specification.** The package preserves Cory’s authority in its introductions, then sometimes converts preferred answers into schemas, invariants, and acceptance criteria.

I inspected [the repository at `856b037`](https://github.com/dwats250/modeling-standard/tree/856b037d5425adf34cb47b9cfa72f9e4a4498f1d), used a lightweight model for reconnaissance, and checked load-bearing claims against the pinned historical vision, doctrine, and July decisions. The repository contains planning and research documents only. Nothing was modified, scaffolded, provisioned, or selected for deployment.

Throughout this review:

- **[R]** remains ratified Cory direction, respecting qualifications within approved documents.
- **[CA]** remains Cory-attributed direction awaiting ratification.
- **[F]** remains a recommendation.
- **[OPEN]** remains unresolved.
- Existing **[R-prov]** statements must retain their provisional status.

My proposed changes below are recommendations, not additional product authority.

**Adversarial findings**

| Finding | Evidence and consequence | Recommended correction |
|---|---|---|
| **1. Stage 0 resolves product questions prematurely.** | G’s walking skeleton includes code-based login and creating a shoot. D’s “decide now” includes adult attestation, matching-email claims, agreement entities, and per-party records. These depend on D2–D4, D10 and D11. | Remove product journeys and domain schemas from Stage 0. Prove the technical mechanisms using synthetic fixtures. |
| **2. The implementation gates contradict one another.** | The root README prohibits starting before required seams are resolved. H D2 says to start with preferred answers and rewrite if Cory differs. F says decisions will barely affect E’s model. | Establish one rule: unresolved semantics block the affected implementation. “Configurable later” does not authorize a default. Remove the assurance that the model will survive all answers. |
| **3. Ratified outcomes and recommended mechanisms are mixed inside invariants.** | B combines [R] preservation requirements with particular database grants, storage classes, matching-email rules and adult-attestation behavior. H D4 states that one affirmation cannot satisfy doctrine. | Separate each invariant’s approved outcome from its proposed implementation. Clause-bound evidence is [R]; eight blocks, eight controls, typed-name interaction and exact signing timing are [F]/[OPEN]. |
| **4. Multi-party participation has been overextended into an assumed agreement structure.** | Cory requires crew agreement and participant-relevant terms. F/E go further: every listed seat becomes a party to one globally finalized version, under one common hash. | Ask whether the collaboration comprises one collective agreement, related party-specific agreements, or another structure. Do not infer that everyone signing means everyone signs every obligation. |
| **5. Organizer signing is repaired, but organizer obligations remain underspecified.** | E records compensation per participant, but does not clearly identify every payer, recipient, deliverer, rights grantor or beneficiary. “Organizer” combines coordination, authorship, signing and finalization. | Specify who owes what to whom. Organizer signing is necessary where the organizer undertakes obligations; a second confirming signature and authority over everyone’s finalization remain D2 decisions. |
| **6. The evidence design does not yet prove what each signer actually saw.** | E binds affirmations to a version and term-block list; party-specific views appear at record generation. D10 can change what was visible before signing. | Bind each affirmation to the exact presented clauses, values, relevant parties and presentation version. Define the relationship between those presentations and final views before fixing the schema. |
| **7. Preservation, retrieval and revocable sharing conflict.** | B I6 says every access grant expires and is owner-revocable. C/D promise retrieval forever. F AC8 blocks every command for suspended accounts. Account closure and code-only participation further complicate retrieval. | Distinguish temporary invitation/share credentials from a party’s record-access rights. Cory must resolve access after suspension, closure, lost credentials and participant removal. |
| **8. The paywall correction is incomplete.** | D7 correctly leaves initiation open. However, C/G make documents depend on an agreed shoot and exclude document tools outside shoots. If initiation is paid, free documents could become indirectly paywalled. | Trace the entire free-document path, including use with non-users. Keep initiation boundaries open; neither an import restriction nor omitting billing proves free access. |
| **9. Identity is still partly collapsed into accounts and email.** | E’s participant-to-profile relationship is treated as leading to an account, even though represented professionals may not hold accounts. Affirmation assumes an account/session despite D3’s code-only option. | Keep credential, account, person/professional subject, collaboration participation and authority-to-act distinct conceptually. Do not build representation machinery yet or equate inbox control with identity or signing authority. |
| **10. Stage 1 readiness is overstated.** | F claims seven evidence elements are covered “in full” and describes real shoots as immediately useful. D8 acknowledges missing releases; D6 leaves early use unresolved; D11 leaves adult assurance unresolved. | Separate a synthetic demonstration from approval for real collaboration. Trade/portfolio work is not automatically exempt from release, usage or assurance decisions. |

Sources: [B: invariants](https://github.com/dwats250/modeling-standard/blob/856b037d5425adf34cb47b9cfa72f9e4a4498f1d/planning/B-product-invariants.md), [D: technical architecture](https://github.com/dwats250/modeling-standard/blob/856b037d5425adf34cb47b9cfa72f9e4a4498f1d/planning/D-technical-architecture.md), [E: domain sketch](https://github.com/dwats250/modeling-standard/blob/856b037d5425adf34cb47b9cfa72f9e4a4498f1d/planning/E-domain-sketch.md), [F: first slice](https://github.com/dwats250/modeling-standard/blob/856b037d5425adf34cb47b9cfa72f9e4a4498f1d/planning/F-first-slice.md), [H: decisions](https://github.com/dwats250/modeling-standard/blob/856b037d5425adf34cb47b9cfa72f9e4a4498f1d/planning/H-cory-decision-packet.md).

Three findings deserve further explanation.

**Replit assumptions survived as defaults, rather than infrastructure.** I found no proposed identity migration, route parity, Replit SDK dependency or obligation to preserve the old schema. However:

- Organizer confirmation follows the old workflow and a provisional doctrine journey; it is not ratified.
- The inherited field vocabulary still drives E’s detailed terms schema before Cory’s walkthrough.
- A self-profile remains a prerequisite-shaped entity without demonstrating that the first collaboration needs one.
- The research still calls “six costumes” Cory’s words, although REVIEW-FINDINGS explicitly identifies that phrase as an agent’s. Correcting downstream prose did not remove the contaminated upstream attribution.

Reusing a sound technical choice is acceptable. “The prototype’s defects were not caused by this stack” is insufficient justification for preserving its complete application shape.

**The architecture is more prescriptive than the invariants require.** One application and one primary transactional store are reasonable recommendations. The evidence does not yet require a monorepo, shared domain kernel, custom command-registration abstraction, universal bearer-grant model, general media adapter, renderer subprocess, unused verification/scanning interfaces, or a nightly full-record integrity scan.

Several proposals are useful eventually. Building all of them in Stage 0 is speculative work. In particular, a single `adult/youth` column does not establish Cory’s eventual separation, representation, entry and transition rules.

**A common hash is not a complete evidence model.** The plan needs to distinguish:

- The frozen terms each party reviewed.
- The clauses and obligations that party affirmed.
- The accepted set of responses at finalization.
- Each resulting portable artifact and its permitted contents.

Giving different PDFs a shared identifier does not, by itself, establish that each PDF faithfully represents the authorized portion of the agreement.

The implementation plan also needs retry, concurrency and failure behavior: competing edits and acceptances, withdrawal during finalization, duplicate finalization, rendering failure and storage failure. These are engineering obligations once Cory defines the relevant transitions. They do not require a general event-sourcing system.

The underlying authority is [PRODUCT-DOCTRINE’s evidence requirements](https://github.com/seeravenproductions/ShootBriefGenerator/blob/bfbf5f1/docs/PRODUCT-DOCTRINE.md), not the particular table arrangement proposed in E.

**Proposed Stage 0 — Engineering foundation**

Stage 0 should demonstrate that future approved behavior can be implemented and tested safely. It should contain **no real collaboration workflow and no product data model**.

| Include | Completion evidence |
|---|---|
| Reproducible development/build/test entry points and a small dependency set | A clean environment can install, check, test, build and boot without external service accounts. |
| Minimal application composition, configuration validation, error handling and redacted logging | The tested application is the real application composition; invalid configuration fails clearly. |
| A mandatory authorization boundary | Synthetic protected operations reject missing policy and wrong principals. Intentionally public operations require explicit classification. |
| Explicit input/output validation | Synthetic requests cannot write arbitrary persistence fields or receive raw internal rows. |
| Local persistence and migration mechanics, if retained in Dustin’s technical plan | Empty-database migration, transaction rollback and runtime/migration privilege separation are demonstrated. No collaboration tables. |
| A bounded evidence-mechanics probe | Synthetic bytes can be stored, retrieved and checked; runtime mutation/deletion attempts fail under the declared threat model. This is a test fixture, not the future agreement schema. |
| Minimal dependency injection where tests need it | Controllable time/credentials and replaceable external boundaries as actually exercised. No unused provider interfaces. |
| CI and boot checks proportional to what exists | Checks run against the real artifact; required suites cannot silently disappear. |

Explicitly exclude:

- Login/signup choice, account onboarding and invitation claiming.
- Profiles, represented people, audience enums and adult attestation.
- Shoot creation, participant roles, compensation and term schemas.
- Agreement states, signatures, record views and retention periods.
- Real email delivery, evidence buckets, PDF infrastructure and billing.
- UI navigation, presets and production copy.

The Stage 0 boundary test is simple: **would a different Cory answer about agreement, visibility, identity or initiation force this work to change?** If yes, move that work into the affected Stage 1 decision.

This revised scope could later be approved independently by Dustin. It is not authorization to implement it now, and the README gate would need an explicit corresponding revision.

**Proposed Stage 1 — First adult collaboration vertical slice**

The defensible scope is a **conditional product envelope**, not the current fixed workflow.

Cory’s existing decisions support these outcomes:

1. Relevant collaborators establish explicit terms before the work.
2. Every required participant, including crew, agrees to the terms relevant to them.
3. Each obligated party’s signature is bound to the specific clauses affirmed.
4. Compensation, deliverables, usage and boundaries are preserved with the required evidence.
5. Changes cannot silently rewrite earlier agreement; affected people return to review under Cory-approved rules.
6. Each party receives an authorized, independently holdable PDF containing the required evidence.
7. Ordinary archival or account removal does not destroy another party’s evidence.
8. The product makes no claim to witness performance, verify identity beyond its actual checks, or enforce the agreement.

Within that envelope, my scope recommendation is:

- **One Cory-selected scenario**, without assuming both paid and trade presets must ship.
- Direct adult collaborators, **subject to Cory confirming the self-representation restriction and assurance method**.
- A private collaboration flow, with the precise visibility and invitation rules explicitly approved.
- Multi-party support sufficient for that scenario, without assuming unlimited participants or a collective agreement topology.
- Only the fields and response mechanics that scenario and the ratified evidence requirements require.
- Required release documents included whenever the approved scenario triggers them. Otherwise the deliverable remains a clearly bounded demonstration.
- One complete create → review → agreement → artifact → archive journey, with amendment behavior included only after its semantics are resolved.

The acceptance evidence should include cross-party privacy tests, organizer obligations, wrong-target authorization tests, immutable prior versions, finalization races/retries, artifact failure recovery, and record access after approved account-state changes.

The current “every email/PDF within one minute,” byte-identical renderer output, two presets and eight affirmation controls should remain proposed criteria until justified. Artifact integrity and faithful rendering matter; identical regenerated PDF bytes are a separate technical choice.

**Cory decision dependencies**

The existing eleven decisions are useful containers, but they omit important subquestions and misclassify some as harmless defaults.

| Decision | Required clarification | Blocks |
|---|---|---|
| **D1 — Scenario** | Walk through one actual collaboration: who organizes, participates, pays, delivers, grants rights and needs which documents. | Stage 1 scope and obligations model—not merely copy. |
| **D2 — Agreement** | Collective versus related party-specific agreement; confirmation; re-acceptance; withdrawal; concerns/counters; cancellation; roster changes; amendments; whether an older agreement remains operative while replacement terms are pending. | State transitions and evidence selection. |
| **D3 — Participation credential** | Account requirement at reading/signing; forwarded invitations; wrong-address correction; recovery; code-only record access. | Invitation, authentication and durable retrieval journeys. |
| **D4 — Terms and affirmation** | Required clauses/values; compensation kinds/ranges; payer/payee and deliverer/recipient relationships; affirmation interaction; metadata collection. | Terms schema, validation, signing and record contents. |
| **D5 — Vocabulary** | Names for the container, presentation, response and final artifact, including what each status promises. | Final screens, emails and records. |
| **D6/D8 — Real use and documents** | Whether private real use is permitted; which scenarios require releases; essential templates and their approval. | Real-use acceptance, regardless of whether money changes hands. |
| **D7 — Initiation** | What “initiate” means: draft, invite, present or another act; free-document access without paid collaboration creation. | Product access rules and commercial claims. Billing implementation can remain deferred. |
| **D9 — Preservation and access** | Retention period; closure/recovery; suspended-party access; removed participants’ historical rights; separation of account data from evidence. | Real-data lifecycle and retrieval promises. Detailed purge implementation can wait. |
| **D10 — Visibility** | Common/private terms; relevant counterparties; roster, compensation, contacts, location, concerns, signatures and change notices; before/after agreement; organizer’s access. | Every presentation, notification, export and record view. |
| **D11 — Adult assurance** | Whether attestation is acceptable for the proposed private slice, given [CA] direction to verify at first participation. | Adult participation and truthful assurance claims. |
| **Identity/authority — extend D3/D4** | Whether all initial participants act only for themselves; whether organizer/client can be an organization or representative; what establishes authority to commit another party. | Participant identity and signature attribution. |

Cory owns these product choices. Dustin owns the engineering mechanism that implements the answers. Counsel-dependent questions remain explicitly counsel-dependent; they should not become technical defaults.

**Explicitly deferred**

Keep the wider suite outside these stages: professional profiles beyond proven identification needs, portfolios, comp cards, discovery, public pages, scheduling, delivery transit, reputation, full moderation tooling, organizations/representation, youth operation, billing, prices, tiers and referrals.

Also defer:

- Production vendors, hosting and infrastructure.
- Generic grant frameworks and future-domain packages.
- Media processing and unused age/scanning adapters.
- Comprehensive design-system and inline-editor work.
- Exact purge machinery and universal retention promises.
- Migration, old URLs and compatibility with the prototype.

“Deferred” must not conceal a prerequisite for real use. Triggered releases, adult assurance, authorized record access and recoverable evidence storage move earlier if the selected scenario requires them.

**Recommended document changes—without making them**

| Documents | Change |
|---|---|
| **Root README; planning README** | Replace contradictory gates with separate Stage 0 technical approval, Stage 1 semantic approval and real-use approval. Pin primary sources directly. |
| **A** | Preserve product interpretation; remove suggestions that every future feature must hang from a shoot. Keep that architecture thesis [F]. |
| **B** | Split approved outcomes, proposed mechanisms and unresolved exceptions. Remove the arbitrary nine-invariant ceiling. Reconcile grant expiry, suspension and evidence access. |
| **C/D** | Reduce mandatory architecture to demonstrated needs. Remove product decisions from “technical choices” and “decide now.” Resolve the circular Shoot/Evidence dependencies before prescribing modules. |
| **E** | Retain conceptual distinctions; suspend concrete fields affected by Cory seams. Add explicit obligation counterparties and presentation-to-affirmation binding. Remove “none requires changing” assurances. |
| **F/G** | Replace the product-bearing Stage 0. Make Stage 1 conditional on the decision matrix; remove assumed real-use permission and automatic release deferral. |
| **H** | Expand existing decisions with the missing seams above. Remove “start with preferred answers.” Remove unsupported claims that trade is lower-risk or that one model-release template establishes commercial readiness. |
| **I** | Keep creative direction advisory. Label signing controls, account flow, navigation and organizer confirmation as dependent examples. |
| **Research and review history** | Correct the surviving “six costumes” misattribution. Preserve the earlier review as history, with dispositions rather than implying every correction is settled doctrine. |

**Planning disposition:** retain the greenfield baseline and its strongest principles. Narrow Stage 0 to demonstrably product-neutral substrate. Treat Stage 1 as an owner-gated collaboration envelope until Cory resolves the agreement, visibility, obligation and participation seams. No implementation should proceed from the package as currently written.
