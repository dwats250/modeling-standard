# Slice — S12 participant access

Status: BUILT — integrated on `main` via PR #34 (authorized 2026-10-20: S12-A to S12-F of `planning/sprint-2026-10-21/EXECUTION-PACKAGE.md`, with Dustin's amendments taking precedence; S11 was deferred when this slice was built)
Date: 2026-10-20

## Outcome

Two distinct people, in separate browser sessions, each accept their own direct invitation, sign in, open the same shoot and perform only their own permitted actions, on the existing mobile journey.

Sign-in is a **local test identity provider** standing in for Google or Apple. Nothing here is real Google or Apple authentication, and nothing verifies anyone.

## Product decisions required

- `decisions/D03-participation-credential.md` — DECIDED (photo shoots): an account is required, created by Google or Apple sign-in at the moment of the invitation; sign-in is the door, not identity; the link is the invitation; no forwarded-link mechanism; wrong address dissolved; recovery mechanics are technical.
- `decisions/D12-who-may-act.md` — DECIDED: no proxies; the person acting acts only for themselves; a referrer introduces only.
- `decisions/D11-adult-assurance.md` — relied on only for what it excludes: verification is separate. Its one open item (synthetic-demo verification) is not answered here: no step is built.
- `decisions/D10-what-each-party-sees.md` — DECIDED (photo shoots): counterparties mutual, money the only private thing, noise doctrine.
- `decisions/D02-agreement-topology-lifecycle.md` — Q5, one agreement per pair per project: relied on to refuse one account taking a second party of the same shoot (fail closed; no database rule).
- `decisions/D07-initiation-and-paywall.md` — DECIDED: collaborating is free.
- `decisions/D06-real-use-and-launch-shape.md` — product authorization only; Gate 2 is not opened.

## Unruled seams — omitted or operator-only, no default

Who creates a project or composes a brief; who sets presence and shares; who enters a decide-together value; who creates and sends invitations; what a person sees as the other person's identity; whether a synthetic demo needs verification. No participant route does any of these. In the demo they are operator acts, labelled as such. `project.create` and the Stage-0 synthetic create refuse signed-in accounts, so existing code does not answer "who creates a project" by accident.

## Invariants

- **I-S12-1.** A principal is `account` (a valid session) or `synthetic` (tests and the demo operator). Production resolves only sessions.
- **I-S12-2.** A session stores only the SHA-256 of its token, the account and database times; it ends once and never reopens. A cookie that is malformed, duplicated, unknown, expired or ended is no principal.
- **I-S12-3.** A sign-in attempt is admitted only for a real invitation; it is bound to the starting browser by a cookie secret, lives ten minutes and is consumed atomically once. Its state, nonce, PKCE verifier and binding secret are fresh 256-bit values.
- **I-S12-4.** An ID token is accepted only if jose verifies it: RS256, the provider's issuer and audience, `exp`, `iat`, `sub`, `nonce` present, nonce equal to the attempt's, bounded skew and age.
- **I-S12-5.** Account, claim and session are created in one transaction; a refused claim creates no account and no session.
- **I-S12-6.** The participant routes take no party: the party is the account's one binding in the project. Anything else is the generic 404.
- **I-S12-7.** A POST to a browser operation, or any POST carrying a cookie, must name one exactly allowed origin; no forwarded header is read.
- **I-S12-8.** Redirects go only to fixed same-origin paths; cookies are structured, `HttpOnly`, `SameSite`, `Secure` under HTTPS.
- **I-S12-9.** No raw invitation credential, session token, code or state is stored, logged, put in a redirect, or written to browser storage or annotations.
- **I-S12-10.** The demo operator exists only through an explicit action; a browser with any session cookie is never the operator; every demo operator operation refuses accounts.
- **I-S12-11.** The test identity provider is outside the production build and registered only by the demo and tests.

## In scope

S12-A principal kinds and the boundary extension (browser response kind, origin check); S12-B sessions; S12-C sign-in from an invitation, claim, sign-out, the signed-in check, the test identity provider; S12-D the signed-in participant routes; S12-E demo integration (fail-closed resolver, operator mode, Invite, proxy, screens); S12-F tests and documents.

## Explicitly out of scope

S11 (signatures, contract, finalization). Real Google or Apple adapters. A bare sign-in that creates accounts. Account recovery, the archive, display names, surnames. Verification. Email. Any participant route that composes, invites, shares, settles or creates. Multi-party signing. Public deployment.

## Acceptance evidence

`tests/http/participant-access.test.ts` (over real HTTP through the demo server), `tests/database/sessions.test.ts`, `tests/demo-browser/participants.test.ts` (two browser contexts at 390), the restated pins, `tests/database/migration-upgrades.test.ts` (0025 → current), `tests/boot/boot.test.ts`. Detail in `docs/engineering/S12-PARTICIPANT-ACCESS.md`.

## Expected change surface

`src/authorization/access.ts`, `src/http/{operations,cookies}.ts`, `src/app/{create-app,operation-list}.ts`, `src/config/config.ts`, `src/main.ts`, `src/sessions/`, `src/identity/`, `src/participants/`, `src/infrastructure/tokens.ts`, `src/invitations/invitation.ts` (one lookup by id), `src/demo/` (application, demo, operations, participant, server, test-issuer, UI), migrations `0026`–`0027`, tests, docs.

## Change-locality check

If Cory rules who sends invitations: the operator-only Invite moves behind a participant policy. If he rules the counterparty's displayed identity: only the participant DTO's label source changes. A real provider: one `IdentityProvider` added to the list. Whether one account may be two parties: `src/identity/claim.ts` and `loadOwnParty`.

## Stop conditions

Any need for a participant to compose, invite, share or settle; any display name; Apple; a bare account-creating sign-in; an account principal through `project.create`. None was reached.
