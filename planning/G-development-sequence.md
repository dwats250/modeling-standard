# Deliverable G. Development sequence

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Fable proposal **[F]**. Not implementation authority.

Stage 0 and Stage 1 are reconciled in detail. Stages 2 to 7 are an outline for orientation only: they have been corrected where the reconciliation touched them and have not been re-derived. Each later stage needs its own decisions and its own planning pass before it is anything more than a direction.

A note on "launch whole" **[R]**: Cory has said a rollout in dribs looks unfinished and kills trust, and that the launch must arrive substantially whole (VISION:409-411). This sequence reads that as a constraint on the public launch rather than on the order of building. That reading is Fable's, and Cory confirms or corrects it in D6.

---

## Stage 0. Engineering foundation

**Purpose.** Show that later approved behaviour can be built and tested safely. Stage 0 contains no collaboration workflow and no product data model. It needs no answer about what a collaboration, agreement, participant, organizer, identity, payment boundary or representation means.

**Authorized by.** Gate 0: Dustin approves a Stage 0 PRD. No Cory decision is required.

### Scope

| Include | Completion evidence |
|---|---|
| Reproducible install, check, test, build and boot, from a small explicit dependency set | A clean machine with no external service accounts can run all five from the lockfile |
| The real application composition: one way to construct the app, used by production and by tests; configuration validated at boot; uniform error handling; structured, redacted logging | The tested application is the shipped application; a missing or invalid setting fails at boot with a clear message; logs carry a request id and no secrets |
| A mandatory authorization boundary | Synthetic protected operations, exercised with synthetic principals: an operation with no declared policy cannot be registered; a missing or wrong principal is rejected; the check is on the object acted on; an intentionally public operation must be classified public explicitly |
| Explicit input and output validation | A synthetic request cannot write a field it did not declare; a response is a declared shape, never a raw stored row |
| Local transactional persistence with reviewed migrations | Migration from an empty database; a transaction rollback test; a runtime database role separate from the migration role. One synthetic table for the tests; no collaboration tables |
| A bounded evidence-mechanics probe | Synthetic bytes are stored, retrieved and verified against a hash; attempts to alter or delete them with runtime credentials fail; the threat model the probe is tested against is written down. A test fixture, not the future agreement schema |
| Controllable seams only where Stage 0 exercises them | A controllable clock if the probe timestamps anything; configuration. No interface with only a null implementation |
| Continuous integration proportional to what exists | Checks run against the real artifact on every pull request; a required suite cannot be skipped silently; the built artifact boots and answers a health check |

### Exclusions

Real login or signup. Account onboarding. Adult attestation. Invitation claiming. Profiles. Represented people. Adult or youth audience models. Shoot or collaboration creation. Participant roles. Compensation and terms schemas. Agreement states. Signatures. Record views. Retention periods. Real email delivery. Production evidence storage. Product PDF rendering. Billing. Navigation. Presets. Production copy.

In Stage 0 the production build has no way to sign anyone in, so every protected operation is denied; the tests supply synthetic principals. That is deliberate: the boundary is proven before any credential exists to pass through it.

### Why it is product-neutral

The test: if Cory could answer an open product question differently and force a piece of Stage 0 work to change, that piece belongs in Stage 1 or later.

| Open decision | Does any answer change Stage 0? |
|---|---|
| D1 scenario; D12 who may act | No. Stage 0 has no parties, roles or obligations. |
| D2 topology and lifecycle | No. No agreement states or transitions exist. |
| D3 credential | No. Principals are opaque identifiers supplied by tests; whether a principal will be an account, a code holder or a representative is not decided. |
| D4 terms and affirmation | No. No terms, no signing. |
| D5 vocabulary | No. Nothing a user reads exists. |
| D7 initiation and paywall | No. Nothing can be created or charged for. |
| D8 documents; D10 visibility | No. No documents, no views. |
| D9 preservation and access | No. The probe stores synthetic bytes and proves protection mechanics; it sets no retention period and no access rule. |
| D6 real use; D11 adult assurance | No. Nothing is usable by anyone. |

What Stage 0 does decide is technical and is Dustin's: language and runtime, one application, the database, the migration discipline, the shape of the authorization boundary, test tooling and CI. Deliverable D gives the recommendations and the reasons.

### What moved out of the previous Stage 0

The previous "walking skeleton" signed in by code, created an empty shoot, and built evidence tables for versions, affirmations and records, an outbox with a real mail provider, a renderer subprocess and an object store with a write-once class. Signing in depends on D3; a shoot and its evidence tables depend on D1, D2, D4 and D10; adult attestation depends on D11. All of that moved to Stage 1, where each piece waits for its decision. Mail delivery, artifact rendering and artifact storage are built in Stage 1 when something real needs them.

---

## Stage 1. The first adult collaboration slice

**Purpose.** Deliver the outcome envelope in Deliverable F for one Cory-selected scenario.

**Authorized by.** Gate 1, piece by piece: each piece starts when Cory has answered the decisions it depends on (Deliverable F, section 4) and its PRD is approved.

**Shape.** Conditional. See Deliverable F for the envelope, the proposed shape, the exclusions, the engineering obligations and the acceptance evidence.

**Completion evidence.** The acceptance evidence in Deliverable F, section 8, demonstrated with synthetic participants.

**Real use.** Not part of Stage 1's completion. Running real collaborations is Gate 2 and has its own prerequisites (Deliverable F, section 6).

---

## Stages 2 to 7: outline only

| Stage | Direction | Depends on | Corrections made in the reconciliation |
|---|---|---|---|
| **2. Documents** | Standard documents (the essential set Cory selects) assembled and signed, free | D8, D7 | Whether a document can be produced outside a collaboration, for work with someone not on the app, is open (D7, D8). The previous exclusion of "document tools outside a shoot" is withdrawn: not rebuilding the prototype's twenty-two disconnected tools is a greenfield choice, but a standalone free-document path may be exactly what VISION:469 requires. If the Stage 1 scenario triggers a release, that release is part of the real-use gate and does not wait for this stage. |
| **3. Professional identity and media** | Profiles, a comp card and a portfolio, sharing by scoped, expiring, owner-revocable grants; media handling; image scanning and adult verification real before any upload is available to anyone **[CA]** (CORY-QUESTIONS:195) | Role-module contents; vendor choices | Scanning and verification interfaces are introduced here with real implementations, not earlier as placeholders. A general sharing-grant mechanism is designed here, when it has a real use. |
| **4. The garden** | The weekly reason to return: a desk, availability, reminders, delivery notes, concept posts that accept replies | Link-page decision (VISION:445); D2c if per-term counters were chosen for later | Unchanged in direction. |
| **5. Trust, operations, private beta** | Structured reports, private strikes, suspension with audit; backups and a restore drill; hosting chosen | Moderation posture **[R]** (VISION:513); D6 | What suspension blocks is decided in D9 before this stage, not assumed. A scheduled integrity scan over stored evidence is an operations decision made here. |
| **6. Public adult launch and plans** | Entitlements, billing, public marketing | D7; pricing (deferred doctrine); D9 with counsel | The proof that safety documentation is free is a traced journey by a person with no plan (I4), not an import rule alone. |
| **7. Represented profiles and the youth partition** (gated) | Representation for adults first; the youth partition only after counsel and Cory's explicit decision | Counsel; VISION:463 | The previous claim that "the model has carried the seams since stage 0" is withdrawn. The partition is designed here, against Cory's ratified three-state description, not prepared in advance with a column. |

---

## Sequencing rules

- Three gates, in the root `README.md`: technical authorization for Stage 0, semantic authorization for each piece of Stage 1, and a separate authorization for real use. Passing one does not open the next.
- A piece of work whose product semantics are unresolved does not start. A configurable placeholder is still a default.
- Within a stage, slices are vertical and each is a pull request with acceptance criteria.
- The outcomes in Deliverable B are re-tested on every pull request once the thing they govern exists; a stage cannot weaken one.
- No hosting, storage, mail or verification vendor is selected before the stage that needs it.
- Documentation stays in this repository: this package, one PRD per slice, a decision log. No parallel governance apparatus.

## What is not on this roadmap

Referral mechanics (parked by Cory). User-to-user payments (never; DOCTRINE:66). An unstructured messaging channel (Cory's July model **[CA]** is notes bound to terms). Migration of anything from the prototype, its URLs, or compatibility with it. An Explore page that lists people. Six separate brief builders.
