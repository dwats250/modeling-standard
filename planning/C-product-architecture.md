# Deliverable C. Proposed product architecture (domains)

Status: Fable proposal. Module names are working names; user-facing vocabulary is Cory's to decide (Deliverable H, D5).

## 1. The shape in one picture

```
                      +------------------------------+
                      |   Trust & Moderation (later) |
                      +---------------+--------------+
                                      | decides
        +----------------------+      v       +--------------------------+
        |  Identity & Access   |<-------------|  Communications (outbox) |
        |  account, actor,     |              +------------+-------------+
        |  bearer grants,      |                           ^ notifies
        |  suspension          |                           |
        +----------+-----------+                           |
                   | actor                                 |
                   v                                       |
  +-------------------------+     presents     +--------------------------+
  |  Shoot (working state)  |----------------->|  Agreement & Evidence    |
  |  participants, terms    |<-----------------|  versions, affirmations, |
  |  draft, lifecycle       |   agreed / not   |  records (immutable)     |
  +-----------+-------------+                  +------------+-------------+
              | who                                         | signs with
              v                                             v
  +-------------------------+                  +--------------------------+
  |  Professional Identity  |                  |  Documents (stage 2)     |
  |  profile, roles, contact|                  |  releases assembled from |
  |  (represented profiles  |                  |  an agreed version       |
  |   later)                |                  +--------------------------+
  +-----------+-------------+
              | shows
              v
  +-------------------------+     +-----------------+     +------------------+
  |  Presence & Sharing     |---->|  Media          |     |  Scheduling      |
  |  cards, portfolios,     |     |  blobs, classes,|     |  availability,   |
  |  concept posts, grants  |     |  expiry, scan   |     |  dates, reminders|
  |  (stage 3 to 4)         |     |  (stage 3)      |     |  (stage 4)       |
  +-------------------------+     +-----------------+     +------------------+
```

Dependency rule: arrows point downward or rightward only. Agreement & Evidence depends on Shoot's terms shape and on Identity's actor; nothing in Agreement & Evidence depends on Presence, Media (beyond the evidence storage class), Scheduling, Entitlements or Trust. Entitlements (stage 6) may be imported by Presence, Scheduling and, only if Cory makes initiating a shoot paid (D7), by Shoot's create command; never by Agreement & Evidence, Documents or Communications.

## 2. Shared kernel (vocabulary, not a module)

Small, versioned value types used by more than one domain:

- **Actor**: `{ kind: account | bearer | system | admin, accountId?, grantId?, verified: adult | unverified }`. Every command takes one.
- **Audience**: `adult | youth`. One value accepted in v1; the other rejected while the youth partition is disabled (invariant I9).
- **Role** on a shoot: photographer, model, makeup, hair, wardrobe, creative direction, assistant, organizer, client, other. (Cory's list plus organizer/client; the 13-role lexicon is provisional.)
- **Compensation**: `paid { amount, currency, deposit?, dueDate?, timing, method-as-recorded }` or `trade { gives, receives }` per participant. No third kind (gifted is trade; hybrid is paid plus trade lines; Cory's "equal exchange" is symmetric trade). Cory confirms the kinds in D4.
- **Usage**: a set of named permitted uses with a term and credit requirement.
- **Boundary terms**: a structured vocabulary of wardrobe, content and contact levels plus safety provisions. Values are Cory-owned; the shape is ours.
- **Term clauses**: the human-readable rendering of each term block, produced by one renderer and frozen verbatim into versions.

## 3. Domains

### 3.1 Identity & Access

- **Responsibility**: who is acting, and under what credential.
- **Entities**: Account (internal id, status, created, verification status), ExternalIdentity (provider, subject, verified email, linked-at), Session, BearerGrant (a scoped, expiring, revocable credential that is not an account: used for invitations now, share links and access grants later), AdminRole.
- **Owns**: authentication (passwordless email first), session lifecycle, actor resolution for every request, suspension enforcement, the single bearer-grant mechanism, the adult-verification seam (an adapter, unused in slice 1).
- **Does not own**: the professional profile, who is on a shoot, the decision to suspend (Trust decides, Identity enforces), any product bootstrapping on first login.
- **Relationships**: every other domain receives an Actor from here and never inspects sessions or tokens itself.
- **Invariants**: I3, I8. An account is never created as a side effect of another domain's command; "claim invitation" is an Identity command that returns an account and then a Shoot command links the participant. A claim succeeds only when the claiming account holds a verified email equal to the invited address; any other claim is refused and the organizer is told (a forwarded link is not an identity). Commands that send email (login request, invite, present) declare rate limits per address, per IP and per account, and login requests answer uniformly whether or not the address exists.

### 3.2 Professional Identity

- **Responsibility**: how a person is represented professionally.
- **Entities**: Profile (display name, roles practised, contact channels, city, one line; later: stats modules by role, comp cards, the link page), ProfileHandle (unique, reserved-word and abuse rules), later RepresentedProfile (a profile managed by an account that is not its subject: agents, and one day guardians).
- **Owns**: profile data and its visibility settings; the profile as the source of truth for what gets pre-filled into shoots.
- **Does not own**: portfolios, cards and boards (Presence), any listing of profiles (there is none), verification (Identity).
- **Relationships**: a shoot Participant references a Profile when the participant is a user, and carries a name-and-email snapshot when not. One Account may hold one self Profile in v1; the model leaves room for represented profiles.
- **Invariants**: I6 (no listing), I9 (a represented minor profile can exist in the model only inside the youth partition).

### 3.3 Shoot (the collaboration, working state)

- **Responsibility**: the mutable plan for one piece of work.
- **Entities**: Shoot (title, purpose, audience, date), Participant (role, organizer flag, profile or snapshot, standing: invited / joined / declined / removed; the organizer holds a seat and is a party like everyone else), TermsDraft (the full structured terms as currently being edited, in eight term blocks: purpose and concept; when and where; who; compensation per participant; expenses; deliverables and delivery; usage; boundaries and safety), Invitation (participant + bearer grant + sent/opened/claimed timestamps), Preset (a scenario template that pre-fills a draft; stage 4 makes them user-editable).
- **Owns**: creation and editing of the draft, the participant list, invitations, archival of the shoot, the shoot's calendar date (Scheduling reads it).
- **Does not own**: anything that has been presented (that is a Version, owned by Agreement & Evidence). The draft may be edited freely; the moment it is presented, a copy becomes immutable elsewhere.
- **Relationships**: presents drafts to Agreement & Evidence; reads the shoot's agreed state back from it; asks Communications to notify.
- **Invariants**: I5 at presentation (the presentation command validates completeness), I2 (archiving a shoot never touches Agreement & Evidence rows).

### 3.4 Agreement & Evidence (the spine)

- **Responsibility**: freeze what was proposed, prove who agreed to which version and when, and give every party the same durable record.
- **Entities**:
  - Version: an immutable copy of a TermsDraft at presentation: canonical bytes, the verbatim rendered clause text per term block, a hash per block and for the whole, sequence number, presented-by participant, presented-at. The organizer's affirmation of the version is written with it: the organizer signs what they present.
  - PresentationEvent: version × participant × made available / opened, with when and via what credential.
  - ReviewEvent: a participant's response to one version: accept, decline, concern (structured per term block with a short note; no free channel), or withdraw (if Cory allows it, D2). An append-only series per participant per version; the latest event counts until the freeze, so a concern can be followed by an acceptance without a new version.
  - Affirmation: the signature event bound to an acceptance (or to a presentation, for the organizer): the actor and credential used, the term blocks affirmed, typed legal name, adult attestation (D11), timestamp, request metadata. Immutable.
  - AgreementState: derived, not stored as truth: a shoot is agreed on version N when every participant listed in version N, organizer included, has a current acceptance of N and the organizer has confirmed with a second affirmation (D2 decides whether confirmation is required).
  - Record: the frozen evidence for an agreed version: one common hash over the canonical version and its affirmations, plus one rendered view per party (what each view contains is D10), each stored in a write-once evidence storage class with its own hash. Retrieval rights for each party forever; a later agreed version supersedes but never modifies an earlier record.
  - Amendment: when the draft changes after presentation or after a freeze, a new Version with the list of changed blocks; the rules for whose acceptance survives are Cory's (D2).
- **Owns**: the state machine, the single signing primitive (reused by Documents), rendering of the record through one renderer, integrity verification, retrieval by any party forever, retention policy hooks.
- **Does not own**: the editable draft, notifications, document templates (Documents brings templates and uses this domain's signing).
- **Relationships**: reads Actor; is called by Shoot to present; is read by everything that needs to know "is this agreed"; Documents extends it.
- **Invariants**: I1, I2, I4, I7. This domain has no UPDATE or DELETE path; it only appends.

### 3.5 Documents (stage 2)

- **Responsibility**: assemble standard documents (model release, photo release, usage licence, later riders) from an agreed version, and capture the signatures they require.
- **Entities**: DocumentTemplate (a named standard document with a versioned text), DocumentInstance (template × shoot version × parties, pre-filled), signatures via Agreement & Evidence's Affirmation.
- **Owns**: which terms trigger which documents (usage → releases), template text versions, the assembled document artifacts.
- **Does not own**: signing mechanics, storage of evidence, legal review (Cory and counsel).
- **Relationships**: reads an agreed Version from Agreement & Evidence; writes DocumentInstances that Agreement & Evidence includes in later records; asks Communications to notify signers.
- **Invariants**: I4 (never entitlement-gated), I7 (never described as legal advice or enforceability).

### 3.6 Communications

- **Responsibility**: every message the system sends, with delivery state.
- **Entities**: Message (recipient, template, payload, state: queued / sent / delivered / failed / suppressed), Preference (per account, by category; safety-critical categories cannot be switched off).
- **Owns**: an outbox in the database processed with retries; suppression logic; the rule that invitation and agreement messages are never fire-and-forget.
- **Does not own**: any in-app messaging between users. Cory's July decision **[CA]** is that there is no unstructured channel: every message is a note bound to a term, negotiation iterates per term until both sides match, the exchange is itself consent evidence, and contact details are exchanged only on mutual acceptance. Slice 1 carries the first part of that (structured concerns on named term blocks, held in ReviewEvents); per-term counter-proposals are D2's option (b).
- **Relationships**: called by Identity (login codes), Shoot (invitations), Agreement & Evidence (review activity, records); never called by the web app directly.
- **Invariants**: a queued safety-critical message that fails is visible to the sender as a failure, never silently dropped.

### 3.7 Media (stage 3)

- **Responsibility**: bytes that belong to people.
- **Entities**: Blob (owner, size class original / web / thumbnail, content type, audience, expiry, scan status), with EXIF and location metadata stripped on ingest.
- **Owns**: the storage adapter, size-class derivation, expiry and purge of transit media, the scanning hook (an adapter, required before any public upload), and a separate write-once evidence storage class (no expiry, never purged, not deletable by runtime credentials) that Agreement & Evidence uses for record views.
- **Does not own**: who may see a blob (Presence grants decide; Media enforces the grant it is handed).
- **Relationships**: serves Presence (cards, portfolios, posts) and Agreement & Evidence (record views); depends on Identity for the actor and on an external scanner behind its adapter.
- **Invariants**: I1 (evidence class is write-once), I9 (audience on every blob), I6 (no blob is reachable without a grant or ownership).

### 3.8 Presence & Sharing (stage 3 to 4, the garden)

- **Responsibility**: the things a professional deliberately shows: comp cards, portfolios, concept posts (moodboards with a mini-brief), the link page (if Cory decides it exists), and the grants that let a specific person see a specific thing for a bounded time.
- **Entities**: CompCard, Portfolio, ConceptPost, LinkPage, AccessGrant (a BearerGrant or account-bound grant scoped to one item, with expiry, owner-revocable), AccessRequest (from a posted item only).
- **Owns**: the request-and-grant loop, share-forward links, what a public link page shows.
- **Does not own**: any listing or search of people; media bytes.
- **Relationships**: reads Profile from Professional Identity; stores bytes through Media; issues grants through Identity's bearer mechanism; a reply to a concept post creates a Shoot draft.
- **Invariants**: I6 in full.

### 3.9 Scheduling (stage 4)

- **Responsibility**: when things happen.
- **Entities**: AvailabilityWindow, ShootDate (owned by Shoot, read here), Reminder, DeliveryNote (a post-shoot entry that images were delivered, recorded against the shoot).
- **Owns**: the calendar view, conflicts, reminders before a shoot, "this week" aggregation for the desk, the delivery note.
- **Does not own**: booking as a commitment (a shoot is committed by agreement, not by a calendar action).
- **Relationships**: reads Shoot dates and agreement state; asks Communications for reminders; availability visibility follows Presence grants.
- **Invariants**: I6 (availability is never listed or searched; it is shown to a person the owner has shared it with); reminders never carry other parties' terms or contact details.

### 3.10 Trust & Moderation (stage 5)

- **Responsibility**: reports, strikes, blocks, and the decision to suspend or remove.
- **Entities**: Report (structured reason, target, reporter, attached record reference if any), Strike, Block, ModerationAction (audited).
- **Owns**: the reporting surface and the moderation ledger.
- **Does not own**: enforcement (Identity enforces suspension; Presence enforces blocks), public reputation (there is none: no free-text reviews, no public strikes).
- **Relationships**: reads records from Agreement & Evidence as attachments to reports; writes suspension decisions that Identity enforces; writes blocks that Presence enforces.
- **Invariants**: I7 (no claim of adjudication), Cory's MVP posture (reactive, structural, no free-text); evidence is never altered by a moderation action.

### 3.11 Entitlements (stage 6)

- **Responsibility**: capacity and convenience limits by plan.
- **Entities**: Plan, Subscription, Allowance (per capability, per period), BillingEvent (through the Billing adapter).
- **Owns**: which plan an account holds and what its allowances are; the gate on initiating presence if Cory decides initiation is paid (D7).
- **Does not own**: anything an invitee does; documents; records; safety behaviour of any kind.
- **Relationships**: may be imported by Presence, Scheduling and (only for the initiation gate, per D7) Shoot; never by Agreement & Evidence, Documents or Communications. An import-boundary lint is added at stage 6 to enforce this.
- **Invariants**: I4; I7 (no plan feature is advertised before it is enforced).

## 4. What this decomposition deliberately changes from the prototype

- Draft and evidence are two different domains with different lifecycles (the prototype had one row).
- The organizer is a party who signs (the prototype's organizer never signed anything).
- One signing primitive for briefs and documents (the prototype had two unrelated ones).
- One bearer-credential mechanism for invitations, share links and grants (the prototype had four hand-rolled schemes).
- Communications is a domain with delivery state, not a helper.
- There is no Discovery domain. Work-first reply lives inside Presence as "concept posts that accept replies"; people are never the subject of a query.
- Audience partition is a kernel value, not a filter added later.

## 5. Slice 1 footprint

Identity & Access (accounts, sessions, bearer grants, adult attestation), Professional Identity (minimal profile), Shoot, Agreement & Evidence, Communications, and the evidence storage class of Media. Nothing else exists in the code in slice 1; later domains are added when their stage begins, not reserved in advance.
