# Deliverable F. First vertical slice recommendation

Status: Fable recommendation, revised after independent review. The charge's candidate (§23) is accepted with two changes forced by ratified doctrine and two recommendations that depend on Cory's answers to D2 and D3.

## 1. The slice: one adult shoot, agreed by everyone in it, with a record in every party's hands

**Story.** An adult organizer (a photographer or a model) creates a shoot from a preset, fills in the terms in a structured form beside a live document preview, adds one or more participants by name, role and email, and presents the terms, signing them as a party. Each participant receives an invitation on their phone, reads the version presented (the common terms and their own terms; what else they see is D10), and accepts with an affirmation bound to the term blocks, declines, or raises a structured concern on a specific block. If the organizer changes the terms, a new version is presented with the changed blocks listed, and acceptance starts again. When every listed party has accepted the current version and the organizer confirms, the agreement freezes: a record is rendered and every party can retrieve their view of it, under one common hash, from their own account, forever, including after the shoot is archived or an account is closed.

**Changes from the charge's §23 candidate**

| Charge §23 | This slice | Basis |
|---|---|---|
| "Invite another adult" (two parties) | Any number of listed participants, each a party, the organizer included | Forced by doctrine [R]: crew who have not agreed "are not on set"; compensation "signed by both parties". |
| "Accepts, declines or raises defined concerns" | Acceptance carries an affirmation bound to term blocks, with legal name, credential and timestamp; the organizer affirms every version they present | Forced by doctrine [R]: signatures are load-bearing; per-clause binding and credential are in the 8-element set. |
| "Invitee joins or claims the invitation" | Read by bearer link; accept with an account whose verified email matches the invitation, or by one-time code with an account offered after | Recommendation pending D3. Either way, a claim by a non-matching account is refused. |
| "Final agreement is frozen" | Frozen by the organizer's confirming affirmation after all acceptances | Recommendation pending D2. |

**What the slice-1 record covers of the ratified 8-element evidence set.** Elements 1, 2, 3 (amount, deposit, timing), 4, 6, 7 and 8 in full. Element 5 (usage rights *and the release documents they trigger*) only in part: usage terms are recorded; the documents arrive in stage 2 (D8 asks whether real shoots may run on slice-1 records before then).

## 2. Why this slice is first

- It is the spine. Every later feature either produces a shoot or consumes a record. If this is trustworthy, the garden can be built on it; if it is not, nothing else matters (Cory: false protection is disqualifying).
- It is the smallest thing that is genuinely useful. Cory and his network can run real shoots on it with no other feature present.
- It exercises every invariant except I6 (nothing browsable), which it satisfies by having nothing to browse, and it forces the technical foundations that are expensive to retrofit: immutable evidence, deny-by-default policy, the bearer-grant mechanism, the outbox, the renderer, n parties.
- It is the acquisition loop in miniature: the invitee's first contact with the product is a real shoot on a phone.

## 3. Which Cory goals it proves

- "Make 'we never agreed to that' impossible to say." [R]
- Records free, including for participants who create an account only to respond. [R] (Documents follow in stage 2.)
- Explicit compensation before the day of work, deposit included; no negotiable. [R]
- The record protects the photographer as much as the model: the organizer's obligations are signed by the organizer. [R]
- Every person on set agreed to the terms. [R]
- Nothing is browsable; a signed-in invitee sees only the shoot they were invited to. [R]
- The product freezes the agreement and claims nothing about what happens on set. [R]
- The garden principle: the reading and agreeing experience must already feel like a professional standard. [R]; "not a form" is Fable's gloss (Deliverable I).

## 4. What it deliberately excludes

No images or file uploads of any kind (so no media pipeline and no scanning obligation, and no public uploads, which is what Cory's age-verification line gates on). No standard documents (releases) yet; usage and boundary terms are recorded as terms only. No public pages, handles, comp cards, portfolios or concept posts. No discovery of any kind. No availability or calendar. No reports, strikes or admin console beyond a CLI to suspend an account. No plans, tiers or billing. No youth, guardians or represented profiles. No OAuth. No notifications other than email. No editing of presets by users. No per-participant term diff (the changed-blocks list is at block level). No per-term counter-proposal loop (Cory's compliance-percentage model is D2's option (b), stage 4 if chosen for later). No inline document editing (structured form plus live preview in slice 1; document-first editing in stage 3 with the design system). No delivery tracking after the shoot.

## 5. Technical foundations it requires (all of Deliverable D "decide now")

Monorepo and CI gates; `createApp(deps)`; Fastify with a typed command array and deny-by-default policy; Postgres with reviewed migrations, two roles, evidence triggers; evidence blob storage class; internal account, passwordless login with rate limits, adult attestation; bearer grants and the matching-email claim rule; Shoot and TermsDraft with eight term blocks; Version, PresentationEvent, ReviewEvent, Affirmation, Record, RecordView; renderer with one HTML template for screen and PDF in an isolated child process; Communications outbox with a real mail provider; structured logging and health endpoints; Playwright at phone viewport.

## 6. Acceptance criteria

Product (each is a Playwright journey or a command test). Criteria marked (D2), (D3), (D10), (D11) are drafted under the preferred answers in Deliverable H and are rewritten if Cory decides otherwise.

1. An organizer can create a shoot from a preset, edit terms, add three participants with different roles and different compensation (one paid with a deposit, two trade), record their adult attestation (D11), and present. Presenting writes the organizer's affirmation. Presentation is refused while any participant's compensation is unspecified, or while any block Cory has made mandatory (D4) is empty.
2. Each participant receives an email within one minute; opening the link on a phone shows the common terms and their own terms (D10), readable without horizontal scroll, with their own terms clearly marked. Contact details of other parties are not shown before agreement (D10).
3. (D3) A participant accepts only from an account whose verified email matches the invitation; creating one takes one email round trip and no password. 3b. A claim from an account with a different verified email is refused with a plain explanation, and the organizer is told.
4. Accepting requires affirming each term block and typing a legal name; the affirmation row records actor, credential, adult attestation (D11), timestamp and blocks. Declining and raising a concern (on a named block, with a short note) are recorded and visible to the organizer. 4b. A participant who raised a concern can accept the same version afterwards without a new version.
5. (D2) Editing any term after presentation and presenting again produces version 2 with a new hash and a new organizer affirmation; version 1 is byte-identical to before; every participant's standing returns to pending for version 2; each participant sees the list of blocks that changed since the version they last accepted; the organizer sees who accepted which version.
6. (D2) When every listed party has accepted the current version, the organizer confirms with a second affirmation; the record is rendered within one minute; every party can download their view; all views carry the same common hash; the record contains an affirmation from every party, the organizer included. 6b. An edit after the freeze produces version 3; when it is agreed, record 3 is issued and record 1 remains retrievable and is marked superseded.
7. The organizer archives the shoot; the participants can still retrieve the record. A participant's account is closed; the organizer can still retrieve the record and it still names that participant.
8. A suspended account cannot perform any command. An expired bearer link is refused with a plain explanation.
9. Nothing about any person is reachable except through a shoot the actor is party to. There is no command that lists accounts or profiles.

Engineering (CI gates):

10. Every command in the registry has a policy and passes the authorization matrix (unauthenticated, wrong account, suspended, expired or revoked bearer, non-matching claim).
11. Attempts to UPDATE or DELETE any evidence row through the API return 4xx; through SQL as the `app` role they fail; deleting or overwriting a record PDF with runtime credentials fails.
12. Renderer golden tests are byte-stable; a changed template version is recorded on new versions; the version hash recomputes from the stored canonical bytes.
13. Clean install, typecheck, migrate-from-empty, tests, build, boot smoke all pass on a machine with no accounts anywhere; the mail provider is faked.
14. No page component exceeds the size budget; the main bundle is under budget; no `any` in server code; every command that sends email declares a rate limit.

## 7. Decisions that require Cory

Block acceptance of slice 1 (engineering can start; copy, presets and validation lists are configurable until answered): D1 (leading story and walkthrough), D4 (required blocks, affirmation form, compensation kinds and ranges), D5 (vocabulary).

Block the state machine and screens as drafted: D2 (confirmation, re-acceptance, withdrawal, counter-proposals), D3 (account or one-time code to accept), D10 (per-party visibility), D11 (adult attestation).

None of them changes the data model in Deliverable E beyond the flagged rows.

## 8. Size

One implementation program for Opus 5.5 under Dustin's review, in the order: walking skeleton (Deliverable G, stage 0), then the organizer authoring flow, then the participant flow, then versioning, then freeze and record, then archival and closure tests. Each of those is a reviewable PR against the acceptance criteria above. The independent review judged the slice large enough to prove the architecture and at the upper edge of one program, with the risk in UX rather than architecture; the structured-form-plus-preview choice for authoring is the scope control.
