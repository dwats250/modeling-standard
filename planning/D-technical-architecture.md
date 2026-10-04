# Deliverable D. Technical architecture

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Fable recommendation **[F]** throughout. Every choice here is Dustin's to accept or change. None is a Cory decision, and none is product doctrine. Not implementation authority.

The previous version mixed product choices into this document (how people sign in, adult attestation, who may claim an invitation, when the organizer signs, what a signature records, how long records are retrievable). Those are Cory's and have moved to Deliverable H. What remains is technical.

## 1. Recommended stack, and why

TypeScript on Node (current LTS), one deployable application, PostgreSQL, SQL migrations that are generated and then reviewed, a schema-validation library at the boundary, and a web client added when the first screen exists.

The previous justification was that the prototype's defects were not caused by its stack. That is the absence of a reason. The reasons for the recommendation:

- **One language across server, client and shared types**, which keeps a small team's review surface small.
- **PostgreSQL gives the evidence mechanics natively**: transactions, role-based privileges that can deny UPDATE and DELETE to the runtime role, and constraints that hold whatever the application does. The mechanism this plan leans on hardest is a database feature.
- **Mature and unremarkable.** Nothing here needs novel infrastructure, and nothing in it is specific to the prototype's host.

The stack is a recommendation, not an inheritance. The reviewer's own fluency is a legitimate input: every merge passes through Dustin, and a stack he reviews confidently is worth more than one that is merely conventional. If he prefers another that keeps PostgreSQL's guarantees, nothing in the product plan depends on this one.

## 2. Decisions needed for Stage 0

These are the only technical decisions required now.

| Decision | Recommendation | Why it is needed in Stage 0 |
|---|---|---|
| Language and runtime | TypeScript, strict; Node current LTS | Everything is written in it |
| Application shape | One server application, one process | The composition root and boot checks need a shape |
| Composition | One constructor for the app, taking its dependencies; production and tests both use it | So that what is tested is what ships |
| Configuration | Parsed and validated once at boot into a typed object | Fail at boot, never at first use |
| Logging and errors | Structured logs with a request id and redaction; one error-handling path | Needed before the first operation exists |
| Authorization boundary | Operations are declared in one enumerable list; each declares a policy or is explicitly public; registration fails otherwise; the check runs on the loaded target | The Stage 0 completion evidence tests exactly this |
| Input and output validation | Each operation declares its input and output shapes; stored rows are never returned directly | Same |
| Database | PostgreSQL; a plain driver; migrations as reviewed SQL, never schema push | The probe and the rollback test need it |
| Privilege separation | A runtime role and a migration role | Justified by the evidence probe: the runtime role is what must be unable to alter evidence |
| Evidence-mechanics probe | See section 4 | Proves the protection approach before any product evidence exists |
| Tests | Real disposable PostgreSQL in tests; no critical suite skipped for missing environment | The rollback, privilege and probe tests are meaningless against a fake |
| CI | Clean install, lint, typecheck, migrate from empty, test, build, boot and health check, on every pull request | Proportional to what exists |

**On the authorization boundary.** The adversarial review listed a "custom command-registration abstraction" among things the evidence does not yet require. The outcome is required in Stage 0: no operation reachable without a declared policy, and a test that enumerates the real operations. Something must make operations enumerable for that to be structural rather than a convention. The recommendation is the smallest thing that does it: a typed list of operation definitions that the server registers at boot and the test iterates. No code generation, no client generation, no rate-limit or mail fields until something sends mail. If Dustin prefers framework-native route metadata that gives the same two guarantees, that is equally acceptable.

## 3. Technical decisions deferred to Stage 1 or later

Each waits for the thing that needs it. Most also wait for a Cory decision, shown where it applies.

| Decision | When | Waits for |
|---|---|---|
| Sign-in mechanics, sessions, cookies | With the first piece that signs someone in | D3 |
| Invitation credential (scoped, expiring) | With the invitation piece | D3 |
| Mail delivery; whether an outbox with retries is needed; rate limits on operations that send mail | With the first operation that sends mail | D3 |
| Web client toolchain and layout | With the first approved screen | D5 for anything a user reads |
| Repository layout beyond a single package | When a second package has a reason to exist | A web client or shared types |
| Artifact rendering (how a PDF is produced) | With the artifact piece | D10, D4 |
| Artifact storage (in the database or in an object store) | Informed by the Stage 0 probe; chosen with the artifact piece | The probe result |
| Background work | When something must run outside a request | Rendering or mail |
| Hosting, mail, storage, verification, scanning, error-tracking vendors | The stage that needs each | Requirements |

## 4. Protecting evidence: outcome, threat model, mechanisms

**Outcome (Deliverable B, I1 and I2) [R].** Finalized agreement evidence cannot be silently altered or destroyed through normal application behaviour.

**Threat model, to be declared in the Stage 0 PRD [F].** Proposed: evidence must survive ordinary application behaviour, application bugs, and a compromised runtime credential. A database administrator or infrastructure owner acting deliberately is out of scope for Stage 0 and is addressed later by backups and audit. Dustin sets the threat model; the probe is tested against whatever is declared.

**Mechanisms [F].** None of these is an invariant. They can be layered, and the probe shows which are worth their cost:

| Mechanism | What it gives | Cost |
|---|---|---|
| Insert-only tables with no application edit path | Removes the ordinary route to alteration | Discipline only; a bug can still issue an UPDATE |
| Runtime role without UPDATE or DELETE on evidence | Holds against application bugs and a compromised runtime credential | A second role and privilege statements in migrations |
| Triggers rejecting UPDATE and DELETE | A second layer if privileges are ever misconfigured | More SQL to maintain; overlaps the previous row |
| Hash over the stored bytes | Detects alteration after the fact | Requires storing exact bytes, not a re-serializable form |
| Restrictive foreign keys and a migration check against cascades toward evidence | Removal of operational data cannot remove evidence | A small lint script |
| Protected storage for rendered artifacts | Extends the guarantee to the PDF | Depends on where artifacts are stored |

**Where artifact bytes live.** The previous version put an object store with a write-once class into the first stage. The first slice's artifacts are small documents, few in number. The first candidate to evaluate in the probe is the database itself, which is already present and already carries the privilege separation; an object store with object lock is the alternative and arrives naturally with media in a later stage. Dustin decides from the probe.

**Hash topology** (one hash, per-clause hashes, per-party hashes, a hash over the accepted set) is a mechanism and is not fixed until the evidence chain in Deliverable E, section 4 has a schema, which waits for D2 and D10.

**Integrity checking.** A command that recomputes hashes from stored bytes is cheap and worth having in Stage 1 because it tests the mechanism. A scheduled scan over all evidence is an operations decision for the beta stage.

## 5. Abstractions removed or postponed

| Previous proposal | Disposition | Revisit when |
|---|---|---|
| Monorepo with `apps/web`, `apps/server`, `packages/kernel` | Postponed. Stage 0 is one package. | A web client or shared types exist |
| Shared domain kernel (Actor, Audience, Role, Compensation, Usage, Boundary terms) | Removed. These are product types and depend on D1, D4, D12. | Their decisions are answered |
| Command registry with policy, rate limit and handler | Reduced to an enumerable operation list with a mandatory policy (section 2) | Rate limits when mail exists |
| One bearer-grant mechanism for invitations, share links and access grants | Postponed. Stage 1 builds an invitation credential only. A party's continued access to their evidence is kept out of any sharing-grant mechanism (Deliverable E, section 6); what limits that access is D9. | A second kind of grant has a real use (stage 3) |
| General blob store with owner, audience, storage class, size class, scan status | Removed from the first stages | Media (stage 3) |
| Headless Chromium renderer in a child process | Postponed. How artifacts are rendered is chosen with the artifact piece. | D10 and D4 are answered |
| `AgeVerifier`, `ImageScanner`, `Billing` interfaces with null implementations | Removed. An interface with only a null implementation is a placeholder, not a seam. | A real implementation is being added |
| Nightly integrity scan over all records | Postponed | Beta operations |
| Audience (adult / youth) as a kernel value and a column | Removed | The partition is designed with Cory and counsel |
| Outbox table and in-process worker | Postponed to the first operation that sends mail | Stage 1 |
| Object store with write-once class from Stage 0 | Replaced by the probe (section 4) | Probe result |
| Request metadata (IP, user agent) on signatures; typed legal name | Moved to Deliverable H as product questions | D4 |

Kept, because the engineering evidence from the prototype supports them and no Cory decision touches them: one deployable; PostgreSQL as the single system of record; reviewed migrations; runtime and migration roles; restrictive foreign keys toward evidence; one composition root with real PostgreSQL in tests; deny-by-default authorization with a generated negative test; no stored row returned directly; CI gates in a fixed order.

## 6. Failure semantics

Once Cory has settled the state transitions (D2), the Stage 1 PRDs specify behaviour for concurrent edits, an acceptance racing an edit, a withdrawal during finalization, duplicate finalization, retries, artifact rendering failure, artifact storage failure, partial finalization, idempotency, and recovery from an interrupted operation (Deliverable F, section 7).

The approach is the smallest transactional design that is correct for the approved transitions: database transactions, uniqueness constraints that make duplicate finalization impossible rather than unlikely, and idempotency keys on retried operations. Event sourcing is not implied and is not recommended.

## 7. Testing

- The app is constructed one way; tests pass fakes for external boundaries and a real, disposable PostgreSQL.
- Stage 0 layers: operation tests through the real composition (the positive case and the generated negative authorization cases); the rollback test; privilege tests run as the runtime role in raw SQL; the evidence probe.
- Later layers arrive with what they test: pure tests for state transitions once D2 exists; rendering tests once an artifact exists; a few phone-viewport journeys once screens exist.
- No critical suite is skippable for missing environment.

## 8. Deployment philosophy

One immutable image per commit; configuration by environment; migrations applied as a release step. One managed PostgreSQL with backups and a restore drill before real data exists. Vendor selection follows requirements, stage by stage. Founder time is the scarce resource, so the lean is toward small managed services, chosen when needed.

## 9. Dependency discipline

Start from a short list; add one when something needs it. Specifically not repeated from the prototype: two PDF stacks, eight upload packages, test tools in production dependencies, dead authentication packages, a serverless database driver on a conventional database, generated insert schemas used as API validators. Stage 0's runtime dependencies should fit on one screen.
