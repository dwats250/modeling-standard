# Sprint package — participant access, final contract storage, first-shoot completeness

Prepared 2026-10-20 against `main` = `57f0b630603c5760580ed8320a68ff1572a570c8` (PRs #31, #32, #33 merged; the four source branches are ancestors of `main`). This is a planning document and an implementation charge for Dustin to authorize. It is not a product decision; it selects only from decisions Cory has made, and it names every seam it leaves unanswered.

Supporting reconnaissance (read these for the detail; this document is the coordinated selection from them):

- [`WS1-IDENTITY-RECON.md`](WS1-IDENTITY-RECON.md) — accounts, sessions, invitation acceptance, participant authorization, provider requirements, local verification.
- [`WS2-S11-RECON.md`](WS2-S11-RECON.md) — settled signing requirements, technical alternatives, Cory questions, the smallest S11 slice.
- [`WS3-CATALOGUE-PROPOSAL.md`](WS3-CATALOGUE-PROPOSAL.md) — the D01 required-term catalogue and the D08 document-trigger table, **as proposals for Cory's review only**.

---

## 0. What the next build lets Dustin do

When this sprint's supported scope is built and pushed, Dustin can, on his own machine or LAN, with no external account:

1. Run `npm run demo:fresh -- --lan`, compose a two-person shoot as the operator, share it, and press **Invite**: the demo prints two invitation links, one per person, exactly once.
2. Open link 1 on his phone and link 2 on his laptop in a browser profile other than the operator's (or hand one to Cory on Cory's phone). Each device signs in as a **distinct test identity** (a local identity provider that stands in for Google, labelled as such), claims its invitation, and lands on **the same shoot**, as that person only — no "Viewing as" switch, and no address trick on the participant routes: the party comes from the session. (The operator's cookie-less `/as/` walkthrough stays as a separately labelled simulation tool; a signed-in browser cannot use it.)
3. Watch the two sessions resolve the brief live: each ticks only its own items, sees only its own fee, and reaches **READY TO SIGN** together. Any attempt by one session to act as the other person — by path, body, query or copied item id — is refused exactly as a nonexistent id is.
4. Close one session, reopen the link: the same account comes back to the same party. Sign in as a third test identity and present a claimed link: refused, the original binding untouched.
5. Later, outside this charge, configure a free Google Cloud OAuth client and repeat step 2 with two **real Google accounts** on `http://localhost` (the provider boundary is built for it; the Google adapter itself is not in this sprint). Apple stays deferred until a domain and the paid developer program exist.
6. Separately, from any synthetic READY TO SIGN two-person brief: freeze it, finalize it through an **operator/test-only call** that carries both people's bound-account signature evidence, and get back an append-only **final contract** the runtime role cannot alter, a per-person record that shows only what that person may see, and a verifiable signature chain. No participant sees a signing control, and nothing is built about one person signing before the other: both the visible act and its sequencing are Cory's (D04, §7).
7. Put two documents in front of Cory: the **D01 required-term catalogue** and the **D08 document-trigger table**, drafted against his rulings, with the questions in §7 — nothing from them implemented.

Everything in 1–6 is synthetic. Gate 2 (real people) stays closed; §5 says exactly what real-provider setup becomes necessary and when.

---

## 1. Current state, verified

| Fact | Evidence |
|---|---|
| `origin/main` = `57f0b63`; #31 (`2bca5ae`), #32 (`e5656e5`), #33 (`57f0b63`) merged 2026-10-20; `demo/participant-journey`, `demo/mobile-presentation`, `stage-1/s10-signing-freeze`, `integration/mobile-demo-s10` are all ancestors of `main`. | `git merge-base --is-ancestor`, `gh pr list --state merged` |
| 26 migration files (`0000`–`0025`); last verified run on the combined tree: `npm run check` pass; `npm test` 30 files / 387 tests; `npm run test:demo` 2 files / 22 tests. | `migrations/`, `docs/engineering/DEMO-SESSION-NOTES.md:115-122` |
| Production HTTP surface is five operations (health, two Stage-0 synthetic ops, `project.create`, `project.read`). No account, session, invitation or participant route exists in production; production resolves **no principal**, so every protected operation is refused. | `src/app/operation-list.ts:14-20`; `src/main.ts:33-35`; `src/authorization/access.ts:25-26` |
| Below the HTTP line the substrate exists: accounts (`google`/`apple` subject only), one-per-party bindings with `PartyAlreadyBoundError`, digest-only direct invitations with a transactional `claimDirectInvitation`, and party-filtered reads and acts that take a bare `partyId`. **Nothing maps an account to a party.** | `src/accounts/account.ts:70-85`; `src/accounts/binding.ts:67-83`; `src/invitations/invitation.ts:152-171`; `src/briefs/brief.ts:294-319`; WS1 F4–F8 |
| The polished mobile journey identifies the acting person by **URL** (`/#/shoots/<id>/as/<party>` → `GET /demo/shoots/:projectId/as/:partyId`), every request being the single `demo-operator`. Its visibility pre-check runs in the operation's `load` and returns a byte-identical generic 404 for anything not the person's. | `src/demo/participant.ts:71-88, 205-221`; `src/demo/ui/journey.js:1035`; `tests/demo/participant.test.ts:93-97` |
| An operation's handler can set only a status code (200/201) and must return a strict JSON object; nothing in the boundary can set `Set-Cookie`, `Location` or a 3xx. A sign-in callback needs all three. | `src/http/operations.ts:64-66, 168, 247-260` |
| `project.create` and the two Stage-0 synthetic operations are policed by `anyPrincipalMayCreate`: the moment production resolves a principal, **any signed-in account could create projects** through existing code. Who creates a project is unruled. | `src/projects/project.ts:81-85`; `src/stage0/synthetic-resource.ts:75-79` |
| The demo front door forwards only `content-type` in and `content-type`/`x-request-id` out: **a cookie would not pass**. Production serves no static files and refuses any route that is not an operation. | `src/demo/server.ts:120-132`; `src/http/operations.ts:201-208` |
| `ProtectedAccess.load` receives `(input, db)` and **not the principal**; `ResolvePrincipal` is synchronous. Both must change for a participant surface whose party derives from the session. | `src/authorization/access.ts:37-42, 59-69`; `src/http/operations.ts:219-223, 240` |
| S10 exists as data functions only: `freezeBriefForSigning`, untick-as-withdrawal, fingerprint v1 recomputed and enforced by the database; two parties, one pair. No screen enters `signing`. | `docs/engineering/S10-SIGNING-FREEZE.md`; `src/briefs/live.ts` |
| Decided and relied on here: D01, D02 (photo shoots), D03, D06 (product authorization only), D07, D10 (photo shoots), D12. OPEN and **not** answered here: D04 (no-means-no wording; the visible signing act), D05 (presented-version/response/archived words), D08 (counsel; trigger table awaiting Cory's check), D09 (counsel retention/erasure), D11 (synthetic-demo verification). | `decisions/README.md:33-46` |
| Unruled product seams the demo already names and this sprint keeps as **operator acts with no default**: who composes, who shares/sets presence, who enters a decide-together value (Q-S), and — newly load-bearing — **who creates and sends an invitation** (S07's stated stop condition). | `docs/engineering/DEMO-SESSION-NOTES.md:49-56`; `docs/slices/S07-direct-invitation-core.md:75` |
| No session, cookie, OIDC or JWT library is present; config has no auth keys and no environment concept. | `package.json:33-39`; `src/config/config.ts:37-51` |

---

## 2. Findings by workstream (condensed)

### 2.1 Participant identity and invitations (WS1)

- **The gap in one sentence:** everything below HTTP exists; missing are (a) a request → *account* principal, (b) account principal → *this project's party* before `load`, (c) the door (`/i/<credential>` → sign-in → claim), (d) a way to serve the participant screens with cookies.
- **Smallest complete path:** account id as principal id; async `ResolvePrincipal` reading a server-side `session` table (token digest only, S07 discipline); `load(input, db, principal)`; invitation acceptance as `GET /i/:credential` (public page, resolves nothing) → OIDC start/callback with server-side `state`/`nonce`/PKCE → `resolveAccountForLogin` → session → `POST /invitations/claim`; participant routes with **no party parameter** — the party is the principal's binding in that project, resolved in `load`, every miss a generic 404.
- **Providers:** Google OIDC is free and accepts `http://localhost` redirects; Apple needs the paid Developer Program, a Services ID, a `.p8` key, Team ID and **HTTPS return URLs on a registered domain**, so it cannot be exercised locally. A **local test identity provider** (same client code, fake issuer, injected through `createApp`, excluded from `dist/`) proves the milestone; real providers are needed only for Gate 2 and for an optional Google stretch.
- **Mobile reuse:** keep `journey.css`, the document/next-step/ready renderers and `api()` (already sends same-origin cookies); delete the "Viewing as" band and the settle control in the signed-in mode; teach the demo proxy to forward `Cookie`/`Set-Cookie`.
- Twelve technical risks (WS1 §5), the material ones: no `Secure` cookie over LAN http (acceptable only while synthetic); CSRF posture (`SameSite=Lax`, JSON POSTs, `Origin` check); Apple's `form_post` callback carries no Lax cookie (hence server-side `state`); production static serving is not solved (not needed for the milestone).

### 2.2 S11 signing and final record (WS2)

- **28 settled requirements** tabulated with sources (WS2 §A). Structurally everything S11's *storage* needs is decided; what is OPEN governs the participant surface and wording only. `LIVE-BRIEF-REBUILD.md:358` already says so: "Storage: no. A real signing UI: yes."
- **Affirmation evidence:** at freeze, and therefore at finalization, the set of parties who ticked each item **equals** its derived approvers by database guard (`migrations/0024_signing_guards_and_grants.sql:128-156`), and that approver list is inside the fingerprint. The two readings therefore prove the identical proposition from identical data; they differ in naming. The build compatible with both: `contract_item` carries each item's approver party ids in clear; `contract_signature` binds the fingerprint; **no** separate affirmation table and **no** `affirmed_by` column. The residual product question is only what the delivered record *shows* beside each clause (§7 Q2). Neither reading is promoted.
- **Recommendation [F]:** new append-only `contract*` tables copied verbatim at finalization; `live_brief.phase` → terminal `final`; live items and ticks deleted in the same transaction under S10's advisory lock; immutability by privilege (`SELECT, INSERT` only), as Stage 0 proved. Within-document hash chain; IP/user-agent nullable until an HTTP surface supplies them. Server-rendered per-party HTML before any PDF, labelled a proposal rendering for Cory's reaction.
- **Narrowed after the adversarial pass:** WS2 proposed a deletable `brief_signature` table so one person may sign before the other (a "pending" window discarded on withdrawal). That rests on LB-14, an engineering invariant tagged [F] (`docs/engineering/LIVE-BRIEF-REBUILD.md:87`), not on a ruling: Cory said "all green, then everyone signs" (`decisions/D02-agreement-topology-lifecycle.md:95`) and left "when does each party sign" in D04's question list. Sequencing is therefore §7 Q3, and S11 is cut to what both answers need: a finalization function that takes **both** people's signature evidence in one call. `brief_signature` and the archive reference table (no consumer yet) are deferred.
- **Cannot be built:** the archive **surname** check — no table stores a name by design.
- **Six Cory questions** (WS2 §C), carried into §7.

### 2.3 First-shoot completeness (WS3)

- 29 candidate terms evaluated against the D04 requiredness rule, each with layer, subject/shape, deliberate-tick status, D01 value, source and **wording status** (most: MISSING — Cory to write or draft in context). Rejected as terms with reasons: presence (a per-party fact), chaperone (a right plus a party), consent withdrawal (a recorded fact), DNS/DNF (a product rule), contact release and socials (product behaviour).
- The D01 brief as the draft would require it: 1 of 6 universal values, 4 of 8 shared values known from the record; fee = none (whether "no fee" must be explicit is a Cory question).
- Document-trigger table: contract (always), call sheet (always, proposed), photo release (photographer → model grant; D01 yes), model release (model → photographer; D01 not triggered), usage licence (unknown), NDA (toolbox), deposit terms (fee present; D01 no), minor release (never). **Every legal template: counsel, not yet. No template text exists or is drafted.**
- Engineering divergences listed by file:line (e.g. `src/briefs/live.ts:59` excludes `no_means_no` from the deliberate-tick set; `src/demo/shoots.ts:87-117` merges address and call time, omits the fee item on "none"). **None is to be changed from this draft.**

---

## 3. PRD — dependency-ordered

Two slices and one documentation deliverable. Build order is **S12 → S11**; the proposals are committed by this planning session and are not implementation work.

### 3.1 S12 — Participant access (sessions, invitation acceptance, participant operations)

**Outcome.** Two distinct people, in separate browser sessions, accept a direct invitation each, open the same shoot and perform only their own permitted actions, on the existing mobile journey.

**Decisions relied on (exact subparts).** D03: account required, created by Google or Apple sign-in at the moment of the invitation (`decisions/D03-participation-credential.md:31`); sign-in is the door, not identity (`:32`); the link is the invitation, delivery is not product state (`:37`); no forwarded-link mechanism (`:39`); wrong address dissolved (`:38`); recovery mechanics are technical (`:47`). D12: no proxies; the person acting acts for themselves (`decisions/D12-who-may-act.md:29-31`); referrer introduces only (`:45`). D11: verification is separate and later; sign-in proves nothing about identity (`decisions/D11-adult-assurance.md:36`). D10: counterparties mutually visible (`decisions/D10-what-each-party-sees.md:60`); money the only private thing (`:65`); noise doctrine (`:78`). D07: collaborating is free, no paywall on the loop (`decisions/D07-initiation-and-paywall.md:27-33, 43`). D06: product authorization of pre-launch real use **is not Gate 2** (`decisions/D06-real-use-and-launch-shape.md:29`).

**Unruled — omitted, or operator-only with no default.** Who composes; who shares or sets presence; who enters a decide-together value (Q-S); **who creates and sends an invitation**; **who creates a project** — `project.create` and the Stage-0 synthetic creates must refuse account principals, else existing code answers this by accident (§1); what a participant sees as the other person's identity (the demo keeps its synthetic annotation labels and says so; the product question is §7 Q5); **whether a synthetic demo with invented people needs a verification step before a test identity may claim** (D11, OPEN; the deferral condition "until a demo needs participants" is now met — §7 Q7; no step is built, and the About screen says so); any bare `/sign-in` that would create accounts without an invitation (omitted). One account holding two parties in one project fails closed (404): D02 Q5 makes dual roles extra terms inside one party's agreement, not a second party (`decisions/D02-agreement-topology-lifecycle.md:63`), so the case should not arise and is not designed. No participant route composes, invites, shares, settles or creates a shoot.

**Where this package overrides WS1, deliberately.** (a) Counterparty labels: WS1 proposed "you / the other person"; the demo keeps its synthetic annotation labels, which are demo data, not product names, so the walkthrough stays legible — the product question is §7 Q5. (b) The invitation page `/i/<credential>` is served by the demo server as part of the journey UI, not as a production operation, so the public-operation pin is {health, sign-in start, sign-in callback}. (c) The real Google adapter is out of this charge (nothing in CI can verify it); the provider boundary is built, the adapter is a later, separately verified step.

**Increments, in dependency order.**

| # | Increment | Builds | Depends on |
|---|---|---|---|
| S12-A | **Principal plumbing and boundary extension** | `ResolvePrincipal` becomes `(request) => Promise<Principal \| null>`; the principal gains `kind: 'account' \| 'synthetic'` (production sessions yield `account`; the test header resolver and the demo operator yield `synthetic`); `ProtectedAccess.load(input, db, principal)`; existing operations ignore the third argument; `anyPrincipalMayCreate` is replaced by a policy that refuses `account` principals on `project.create` and the Stage-0 synthetic creates (an unruled seam closed by refusal, not a default; generated test). **Boundary extension:** an operation may declare a `browser` response kind whose result is `{ status: 303, location, setCookie? }` or `{ status: 200, setCookie? , body }`, validated at registration exactly as strict JSON outputs are; a pin test lists which operations use it (only sign-in start, sign-in callback, sign-out). Generated 401/403/404 tests unchanged and green. `tests/support/app.ts` header resolver kept as the test substitute. | — |
| S12-B | **Sessions** | Table `session(id, account_id → account, token_digest bytea UNIQUE, created_at stamp, expires_at, ended_at)`; runtime `SELECT, INSERT, UPDATE (ended_at)`; stamp trigger; migration `0026` (generated) + `0027` (hand-written guards/grants, may be shared with S12-C). Data functions `createSession`, `resolveSession` (expired/ended → null), `endSession`. Cookie `ms_session`: `HttpOnly; SameSite=Lax; Path=/`; `Secure` iff `PUBLIC_BASE_URL` is `https:`. The session holds **only** digest, account id, times. Production resolver in `src/main.ts` reads the cookie. Operation `POST /sign-out` (protected). Semantic-guard test: no email/name/token/provider column on `session`. | A |
| S12-C | **Sign-in and the door** | Table `login_attempt(id, state_digest UNIQUE, nonce, pkce_verifier, provider, credential_digest, created_at, expires_at)` (prune on use/expiry). Provider adapter interface `IdentityProvider { name: 'google' \| 'apple'; authorizationUrl(...); exchange(code, verifier) → verified { sub } }` injected through `createApp({ identityProviders })`; issuer URLs are **constants in source**, never configuration. Operations (production list, public with stated reasons): `POST /sign-in/start { provider, invitation }` (validates the credential's **shape** only, stores its digest, redirects); `GET /sign-in/callback?code&state` (loads the attempt by `state`, exchanges, verifies the ID token — JWKS by `kid`, `iss`, `aud`, `exp`, `nonce` — `resolveAccountForLogin`, session, cookie, redirect to `/i/return`). Protected: `POST /invitations/claim { credential }` → `load` = `resolveDirectInvitation` (undefined → 404); run = `claimDirectInvitation` → `{ projectId }`; same account idempotent 200; another account **409 `already_claimed`** — a refusal code is recovery mechanics, which D03 makes Dustin's (`decisions/D03-participation-credential.md:47`), and this package rules 409; only its on-screen words are §7 Q6; unknown/malformed 404 byte-identical. **No verification step** exists before a claim; D11's synthetic-demo treatment is OPEN and asked in §7 Q7. **Test identity provider**: `src/demo/test-issuer.ts` (excluded from `dist/`), a fake OIDC issuer with a person picker, injected by the demo and by tests; `src/main.ts` never imports it (boot test). Its logins are stored with `login_provider = 'google'` because the column admits only `google`/`apple` (`src/accounts/tables.ts:44`); the inspector and About screen say that no Google login happened. **No real provider adapter in this charge**: Google is a later step verified by Dustin with a Cloud client; Apple is not built. `PUBLIC_BASE_URL` is added now (it drives redirect URIs and the `Secure` flag). ID-token verification with `node:crypto` or `jose` — the implementer chooses and states why (doctrine 9: minimize third parties). | B |
| S12-D | **Participant operations in the production list** | `GET /shoots/:projectId`; `POST /shoots/:projectId/items/:itemId/{tick,untick,decline,parameter}`; `POST /shoots/:projectId/group-check`. `load`: project → live brief → the principal's binding **in this project** (exactly one, else 404) → S09 visibility pre-check on every requested item id (as `src/demo/participant.ts:71-88`) → target carries `partyId`; policy re-asserts `target.binding.accountId === principal.id`. `run` reuses the demo DTO and act code (move `src/demo/participant.ts` DTO/act logic, together with `asConflict` and `CONSTRAINT_CODES` from `src/demo/simulator.ts:95-106`, into `src/participants/`, which is inside the build; the demo `/as/` routes and the real routes then share one implementation). No settle route. Refusals: 401 before body; 404 for every "not yours"; 400 for any extra field (a body or query `partyId`); 409 stable domain codes after the pre-check. | A, B |
| S12-E | **Demo integration and operator seed** | Demo server forwards `Cookie` in, and `Set-Cookie`, `Location` and 3xx statuses out; serves `/i/<credential>` and `/i/return` from the journey UI. Demo resolver: a request **with** a session cookie is that account, on every route; a request **without** one is the fixed `demo-operator` (**only in `src/demo/`; `src/main.ts` keeps the session-only resolver**). Consequence, stated on screen and tested: a signed-in browser gets 403 on every `/demo/*` operator route, including `/as/`; the operator works in a separate browser profile or private window, and the browser test seeds from a third, cookie-less context. Operator action **Invite**: `POST /demo/shoots/:projectId/invitations` (operator-only, labelled an operator convenience, allowed in any phase — the live-only pre-check already shows a draft to nobody) mints one `createDirectInvitation` per party, returns the raw links **once**; the UI shows them with copy and a QR for the phone. The signed-in participant screen lives at `/#/brief/<id>` (`/#/shoots/<id>` stays the operator's draft screen, `src/demo/ui/journey.js:1036`) and reuses the renderers **without** the "Viewing as" band and the settle control; the operator's cookie-less `/as/` simulation stays for walkthroughs, labelled as such. "About this demo" updated: sign-in is a **test identity provider standing in for Google/Apple**, not identity, not verification (D11 synthetic treatment OPEN, §7 Q7); who invites/composes/shares/settles remains an operator act and an open question. | C, D |
| S12-F | **Two-session verification and delivery** | HTTP acceptance tests (§4) through the real `createApp` with the production list; browser test with **two `browser.newContext()`s** at 390 px; `npm run check`, `npm test`, `npm run test:demo`, `npm run build` (no `src/demo` in `dist/`), boot test that production refuses the test issuer and refuses a non-loopback `http://` `PUBLIC_BASE_URL`; LAN run from a phone; `docs/slices/S12-participant-access.md`, `docs/engineering/S12-PARTICIPANT-ACCESS.md`, `DEMO.md` and README status updated; pins (public-operation set, table list, privileges, trigger functions, populated upgrade from 0025) updated deliberately. | E |

**Expected change surface.** `src/authorization/access.ts`, `src/http/operations.ts`, `src/app/create-app.ts`, `src/app/operation-list.ts`, `src/config/config.ts`, `src/main.ts`, new `src/sessions/`, `src/identity/` (providers, token verification), `src/participants/`, `src/invitations/` (claim operation), `src/demo/server.ts`, `src/demo/demo.ts`, `src/demo/operations.ts`, `src/demo/ui/journey.js|css|index.html`, `src/demo/test-issuer.ts`, migrations `0026`–`0027`, tests under `tests/http/`, `tests/database/`, `tests/demo/`, `tests/demo-browser/`, `tests/boot/`, `.env.example`, docs.

**Change-locality check.** If Cory rules who sends invitations, only the operator-only mint moves behind a participant policy. If Cory rules a counterparty's display identity, only the DTO's label source changes. If a provider is added, only the provider list grows (S06 change-locality holds).

**Stop conditions.** Any need to let a participant compose, invite, share or settle to reach the milestone (it should not be needed: the operator seed covers it); any need for a display name to render a screen; any need for Apple to pass a test; any temptation to add a bare account-creating `/sign-in`; any need to let an account principal through `project.create`.

### 3.2 S11 — Final contract storage and finalization (two parties, one pair; no participant surface)

Built from WS2 §D, **narrowed as below**, after S12, on a branch from S12's pushed head (so migration numbering is sequential: `0028` generated, `0029` hand-written; WS2's `0026`/`0027` names are superseded). Decisions relied on: WS2 §D "Decisions relied on".

What it builds: `contract`, `contract_party`, `contract_item` (verbatim copy with `approver_party_ids`), `contract_signature` (two rows, chained); `live_brief.phase` admits terminal `final`; data functions `finalizeBrief(db, briefId, signatures: [{ partyId, accountId, evidence? }, { … }])` — one call carrying **both** people's signature evidence, which in one READ COMMITTED transaction under S10's advisory lock verifies the phase and fingerprint, verifies each account is its party's binding, writes the contract rows, moves the brief to `final` and deletes live items and ticks — plus `getContractVisibleTo`, `renderContractHtmlFor` (labelled "proposal rendering for Cory's reaction", inspector-only) and `verifyContractChain`; refusals `not_signing`, `fingerprint_mismatch`, `not_bound_account`, `not_a_party`, `already_final`; inspector shows `final` and the record; simulator exposes an operator-only **finalize with both signatures**, labelled synthetic; **no participant route** accepts a brief in `signing` or `final`.

**Deferred from WS2 §D, and why.** `brief_signature`, `signBrief → 'pending'`, the `sequence` column's meaning as "who signed first", and "untick discards pending signatures": sequential signing is not ruled (§7 Q3); the one-call function is compatible with either answer, and a pending table can feed it later. `contract_party_reference` / `mintContractReference`: no consumer until an archive-access slice exists. WS2 tests 4, 5, 9, 10, 11 and 25 are dropped with them; the sign-vs-untick race tests (12–14) become finalize-vs-untick races with the same serialized outcomes.

**Stop conditions.** Any participant-facing signing control, typed name, drawn signature or "I agree" wording (D04 OPEN); any participant view of a `signing` brief; any first-signature-waits-for-second mechanism; any `affirmed_by`/`signed_by` naming or separate affirmation table; any surname capture; any retention/purge.

### 3.3 Proposals (documentation only — committed by this planning session)

`WS3-CATALOGUE-PROPOSAL.md` is the D01 required-term catalogue and D08 document-trigger table for Cory's review against real briefs. **Nothing in it is implemented in this sprint**: no key is added to `BriefItemKey`, no layer is pinned, no completeness gate is built, no document attaches, `DELIBERATE_TICK_KEYS` does not change. The only engineering permitted around it is the read-only inspector "completeness report" idea in WS3 §C — and that is **not** authorized here either; it waits for Cory's first pass.

---

## 4. Acceptance criteria

All HTTP criteria run through the real `createApp` with the **production** operation list against a real database (`tests/support/app.ts` pattern), sessions created through the test issuer or the session data function. Browser criteria use `playwright-core` with two `browser.newContext()`s.

| ID | Criterion | Expected |
|---|---|---|
| AC-1 | Every protected operation (generated from `operation-list.ts`) without a session, including malformed, oversized and wrong-type bodies | 401 `unauthenticated` **before body parsing**; no side effects |
| AC-2 | Operator seed: one shoot, two parties, presence set, shared, **Invite** pressed once | two invitations, raw credentials appear only in the response once; every table and the captured log hold only digests |
| AC-3 | Context A signs in as test identity "A", claims link 1; context B signs in as "B", claims link 2 | 200 `{ projectId }` each, same project; `party_account_binding` has exactly two rows **for this project**, distinct accounts, distinct parties |
| AC-4 | A re-posts her claim; A posts link 2; B posts link 1 | 200 idempotent (same binding); 409 `already_claimed`; 409 `already_claimed`; bindings unchanged |
| AC-5 | A well-formed 43-character credential matching no invitation; nine malformed spellings (as `tests/database/invitations.test.ts`) | 404 bodies byte-identical modulo `requestId`; nothing written |
| AC-6 | `GET /shoots/:projectId` as A and as B | 200 each; `partyId` differs; same item ids; `ready` present (two parties, one pair) |
| AC-7 | Fixture-2 shape (A, B, C; pairs A–C, B–C; one fee each) seeded with three links | each account sees exactly one money item, never the other pair's fee id or value; no `ready` key |
| AC-8 | Every act on a hidden item by the non-pair party (tick, untick, decline, parameter, group-check with a visible+hidden mix, random id) | 404 byte-identical to a nonexistent id; ticks unchanged |
| AC-9 | Acting as the other party by any route shape: body `partyId`; query `?partyId=`; a session-bearing request to the demo server's `/demo/shoots/:id/as/:party`; another's open parameter | 400 / 400 / 403 (the cookie-less `/as/` route is documented operator simulation) / 409 `not_subject`; `brief_tick.party_id` rows exist only for the acting account's party |
| AC-9b | A session principal on `POST /projects` and on the Stage-0 synthetic create | 403; no row written (unruled seam closed by refusal) |
| AC-10 | A ticks; B's view shows A's party in the item's ticked set; B unticks that item | B's untick removes only B's tick (A's remains) |
| AC-11 | Full resolution to READY TO SIGN through the two sessions only (operator settles any decide-together value); untick loses readiness; retick regains | as `tests/demo/participant.test.ts:261-315`, over sessions |
| AC-12 | Session cookie copied from context A into context B | B's requests are A (same `partyId`): the cookie is the bearer; documented |
| AC-13 | Sign-out; expired session; ended session reused | 401 on the next protected request; cookie cleared |
| AC-14 | `session` schema | only digest, account id, times; semantic guard rejects email/name/token/provider/subject columns |
| AC-15 | Production isolation | `dist/` contains no test-issuer module; `main.ts`, `create-app.ts`, `operation-list.ts` import none; production-shaped config with a non-loopback `http://` `PUBLIC_BASE_URL` exits 1; every `/demo/*` route 404s in production |
| AC-16 | Callback with wrong/reused `state`, wrong `nonce`, wrong `aud`, wrong `iss`, expired `exp`, bad signature | refused; **no account and no session created** |
| AC-17 | Browser: a cookie-less operator context seeds and invites; two further contexts at 390 px open their links, sign in as different test identities, land on the same shoot; no "Viewing as" band, no settle control; each ticks only its own items; the other context's screen reflects it on reload; a signed-in context opening an operator screen is refused; no console errors; no horizontal scroll; screenshots per context | pass |
| AC-18 | Public-operation pin equals exactly {health, sign-in start, sign-in callback}; the `browser` response kind is used by exactly {sign-in start, sign-in callback, sign-out}; every other operation protected and JSON | pass |
| AC-19 | S11: the ordered database tests in WS2 §D as narrowed by §3.2 (refusals, finalize-vs-untick races, runtime-role immutability, no cascade toward `contract*`, per-party view and HTML leak nothing, populated upgrade from 0025 including a frozen brief, golden fingerprint unchanged) | pass |
| AC-20 | S11 boundary | no participant route accepts `signing` or `final`; browser regression finds no signing control; no `affirmed_by`/`signed_by` identifier anywhere in `src/` or migrations; no table or function records one signature without the other |

---

## 5. External setup requirements (narrow)

| Need | Required for | Cost / who | Status |
|---|---|---|---|
| Node 24, Docker PostgreSQL 17, Chrome for `test:demo` | everything | existing | present |
| **Nothing else** | the milestone (two sessions, two test identities, same shoot, own actions only) | — | — |
| Google Cloud project + OAuth **Web** client (client id/secret), consent screen in testing mode, redirect `http://localhost:3100/sign-in/callback` | a later step, outside this charge: real Google sign-in end to end on localhost | free; Dustin creates it; secrets in `.env` only, never committed | not needed for AC-1…AC-20 |
| Apple Developer Program, App ID + Services ID, `.p8` key, Team ID, registered HTTPS return URL on a real domain | Apple sign-in at all | USD 99/year + a domain + HTTPS | **deferred**; genuinely necessary only for Gate 2 with Apple users |
| HTTPS on a real hostname | `Secure` cookies off-loopback; Apple; any non-synthetic use | domain + TLS | Gate 2 only; LAN demo runs without it, stated on screen |
| Email delivery | **not required**: the link is the invitation; email is only one delivery channel (D03) | — | links are shown to the operator and shared by hand |
| Identity verification vendor | D11 first participation | later; Gate 2 | not this sprint |
| Incorporation, app-store accounts | nothing in this sprint | — | not required |

---

## 6. Implementation charge (ready to paste)

```
You are implementing the next Modeling Standard sprint on the repository at
/home/dustin/Projects/modeling-standard-demo. Read CLAUDE.md and README.md first and obey
them; then read planning/sprint-2026-10-21/EXECUTION-PACKAGE.md and its three supporting
files in full. The package is Dustin's technical authorization for exactly the scope below.
Cory is the sole product authority; decisions/ is the only answer surface; an OPEN item is
not answered by a default, a convention, prototype behaviour or convenience. Existing code is
never evidence that a product decision is correct.

Baseline: main at 57f0b630603c5760580ed8320a68ff1572a570c8. The package lives on branch
planning/sprint-2026-10-21 (pushed); check it out or merge it into your working branch
before starting, and verify the baseline.

AUTHORIZED SCOPE
1. S12 — participant access, increments S12-A through S12-F exactly as specified in
   EXECUTION-PACKAGE.md §3.1, with the acceptance criteria AC-1..AC-18 in §4. Where §3.1
   and WS1-IDENTITY-RECON.md differ, §3.1 governs (the overrides are listed there). Branch:
   stage-1/s12-participant-access from main. Migrations 0026 and 0027.
2. S11 — final contract storage and finalization, exactly as specified in §3.2, which
   NARROWS WS2-S11-RECON.md §D (no pending signatures, no brief_signature, no archive
   reference; one finalize call carrying both signatures). Where §3.2 and WS2 differ, §3.2
   governs. AC-19 and AC-20. Branch: stage-1/s11-final-contract from the pushed head of
   stage-1/s12-participant-access (this is explicit permission to build on that unmerged
   branch; say so in the slice document). Migrations 0028 and 0029.
3. Documentation for both: docs/slices/S12-…md and docs/engineering/S12-…md,
   docs/slices/S11-…md and docs/engineering/S11-…md, DEMO.md, .env.example, the README
   status paragraph, and a continuation note in docs/engineering/ (the DEMO-SESSION-NOTES.md
   pattern) that lets the work resume after a reset.

NOT AUTHORIZED (stop and report instead)
- Any participant route that composes a shoot, creates or sends an invitation, shares, sets
  presence, or settles a decide-together value. These stay operator-only and labelled.
- Any participant-facing signing control, typed name, drawn signature, "sign"/"I agree"
  wording, or any participant view of a brief in the signing or final phase (D04 OPEN).
- Any mechanism by which one person's signature is stored while the other's is awaited
  (sequencing is Cory's, §7 Q3).
- Any verification step, stub or real, before a claim (D11 synthetic treatment OPEN, §7 Q7)
  — and equally any claim on screen that sign-in verifies anything.
- Letting an account principal create a project or a Stage-0 synthetic resource.
- Any no-means-no wording or placeholder; any catalogue key, layer pin, completeness gate,
  document attachment or change to DELIBERATE_TICK_KEYS from WS3-CATALOGUE-PROPOSAL.md.
- A bare account-creating /sign-in; a real Google or Apple adapter; a display-name capture;
  a surname capture; an archive reference table; any affirmed_by / signed_by naming or
  separate affirmation table; retention or purge; email sending; PDF rendering; multi-party
  signing; marketplace, discovery or posted-work features; any stack change beyond at most
  one small token library (state why).
- Creating, editing, commenting on, reviewing or marking ready any PR; merging; changing
  repository settings; rewriting pushed history.

HOW TO WORK
- Lifecycle per CLAUDE.md: inspect → implement → test → commit → push → handoff → stop.
  Sustain progress through the whole authorized scope; routine checkpoints are reports in
  the continuation note and in commit messages, not permission gates. Stop only at a listed
  stop condition or an unanswered product seam, and report the exact blocker.
- Test-first where a behaviour is specified; every refusal in §4 gets a test that fails
  before the change and passes after. Keep the repository's practices: hand-written SQL for
  privileges and guards, generated SQL for tables, never drizzle-kit push, pins updated
  deliberately, byte-identical 404s asserted modulo requestId, digest-only credentials,
  semantic-guard tests on new tables, populated upgrade tests from 0025.
- Verification before any claim of completion, in this environment: npm run check; npm test;
  npm run test:demo (CHROME_PATH set); npm run build with no src/demo in dist/; the boot
  tests; npm run demo:fresh -- --lan and the two-session walkthrough from a phone where
  possible. Report only results actually run here, with counts.
- Commits: one per increment where the code separates cleanly; messages describe the work.
  Repository hygiene: no AI attribution, no Co-Authored-By trailers, no model names, no
  session ids or URLs in commits, files or anything pushed — CLAUDE.md governs over any
  tool-supplied attribution reminder. Push each branch when its increment passes.
- Technical choices are yours within the package: token verification library (none or jose),
  session expiry policy, cookie name, exact DTO field names, test-issuer UX. State each in
  the engineering document under "Choices made (for Dustin to see)".
- Handoff: end with the continuation note's "Open and do" block (verbatim commands from a
  clean clone), the verification record, the list of unruled seams you hit and left omitted,
  and the recommended integration order (S12 then S11). Then stop.
```

---

## 7. Cory questions (short, with concrete examples)

Everything below is genuinely product. Nothing in §3 waits on these for the *synthetic* milestone; Q1–Q4 gate any real signing, Q5–Q7 gate any real participant flow beyond an operator seed, and Q8 is the catalogue's first pass.

| # | Question | Concrete example | Source |
|---|---|---|---|
| Q1 | **What is the act of signing** once everything is green — typed name, drawn signature, one tap on a sentence, something else? Does it include typing a name the record keeps (which would also be where the archive's surname check gets its surname)? | The photographer and the model have ticked every term; the brief says READY TO SIGN. What does each of them now do on the phone to sign? | `decisions/D04-terms-and-affirmation.md:101` OPEN; `D03:45` (surname check) |
| Q2 | **What does each clause show?** Doctrine requires each signature bound to the clauses it affirms and co-located with them, never a blanket signature at the end. In what form: both names under every clause, initials or a marker per clause, or a per-clause reference to a signature block? | The coverage term "implied nude; sheer fabric permitted at the agreed level" — what sits under it on the contract? We will show you a rendered record to react to. | DOCTRINE:51 via `D04:23` [R]; WS2 §B2 |
| Q3 | **Do both people sign in one moment, or may one sign first?** If one may sign first, does that signature wait for the other (and what does each see meanwhile — is "waiting on the other person" process data under the noise doctrine)? | She is ready Tuesday, he on Thursday. Does the product hold her signature until Thursday, or is signing something they do together once? Today nothing is built either way. | `D02:95` ("all green, then everyone signs"); `D04:13-15` question list; `D10:78`; `DEMO-SESSION-NOTES.md:133` |
| Q4 | **No-means-no wording** — the acknowledgment in its two faces. | For her: the tools she has (safe word, guarantee, stop anything at any moment). For him: the obligation. Exact text, which the record will carry verbatim. | `D04:100` OPEN |
| Q5 | **Who creates a project and who sends its invitations, and what does the invited person see about who invited them?** | In the D01 shoot the model created the project and sent it to the photographer. Is the rule "whoever creates the project sends its invitations"? When he opens the link, does he see her name — and from where: his own knowledge, the Google sign-in, or verification? The database stores no name by design. | `D01:32`; `docs/slices/S07-direct-invitation-core.md:75`; `D10:60`; WS1 §2.4 |
| Q6 | **Words for a claimed link opened by a second account.** The product refuses (no forwarded-link mechanism) and says the invitation is already taken; what should that sentence say? | He accepts with his Google account, later opens the same link signed in with his Apple ID (a different account). | `D03:39`; `D05:35` (words in context) |
| Q7 | **Does a synthetic demonstration with invented people need a verification step?** The demo now has participants who claim invitations with test identities. None, a visible stub ("verification would happen here"), or real verification before any claim? | Dustin opens link 1 on his phone, signs in as test identity "A", and lands on the shoot. Should anything about verification have appeared between sign-in and the shoot? | `decisions/D11-adult-assurance.md:44`; `decisions/README.md:71` |
| Q8 | **Catalogue, first pass** — the four questions that change the shape of the brief most: (a) do body terms (coverage, touch, stop rule) live in the universal layer everyone in the room affirms, or the shared layer only the pair approves? (b) must a brief with no money carry an explicit "no fee" line, or is omitting the fee enough? (c) who is the *subject* of a usage grant — the person whose images or likeness are used? (d) which release is which by direction? | (a) her implied-nude level: does he affirm it in the universal section? (b) the D01 shoot: "no fee" written, or nothing? (c) her album-cover use of his images: is he the subject, so he may decline? (d) confirm: photo release = he releases his photographs to her; model release = she releases her likeness to him. | WS3 §A.3 C1, C8, C9; §B.1 T1 |

The full catalogue questions (C1–C14) and trigger questions (T1–T6) are in `WS3-CATALOGUE-PROPOSAL.md`; Q8 is the first-pass selection. WS3's C4 (no-means-no as a deliberate-tick member) is **not** asked: `D04:57-58` closes the four and keeps every term individually recorded under group-check.

---

## 8. Adversarial pass — record

One independent pass was run over the first draft of this package (24 findings; the reviewer's full table is not reproduced). Material findings and how each was reconciled:

| Finding | Reconciliation |
|---|---|
| S1: the package was untracked, yet the charge told a fresh agent to read it from the clone | Committed and pushed on `planning/sprint-2026-10-21`; the charge names the branch |
| S2: operations cannot redirect or set cookies (`src/http/operations.ts:64-66, 168, 247-260`) | S12-A gains an explicit `browser` response kind, validated at registration and pinned to three operations (AC-18) |
| S2: a signed-in browser would be refused on every `/demo/*` operator route; AC-11 unreachable | S12-E states the resolver rule (cookie → account on every route; no cookie → operator), the separate operator profile, and a third cookie-less test context (AC-17) |
| S2: "no address trick" overstated while `/as/` remains on the demo server; AC-9's production `/as/` case vacuous | §0 reworded to the participant routes; AC-9 now tests a session-bearing request to `/as/` (403) |
| S2: `project.create` / Stage-0 creates are `anyPrincipalMayCreate`, opening composition to any account by default | Principal `kind`; account principals refused there (S12-A, AC-9b); recorded as an unruled seam |
| S2: pending/sequential signatures rest on LB-14 [F], not a ruling; §7 presupposed it | S11 narrowed to a one-call finalization with both signatures; `brief_signature` deferred; Q3 recast to ask sequencing |
| S2: D11 synthetic-demo verification deferred "until a demo needs participants" — now triggered | Q7 added; no step built; stated on the About screen and in the charge's refusals |
| S2: AC-5's third case contradicted AC-3 | Replaced with the S07 malformed-spelling set |
| S2: Q6 asked whether a claimed link should look dead while S12-C built a distinguishable 409 | 409 ruled technical under `D03:47`; Q6 narrowed to wording |
| S3: `contract_party_reference` has no consumer | Deferred |
| S3: package silently overrode WS1 on labels and the public pin | Overrides stated in §3.1 |
| S3: `#/shoots/<id>` hash collision; proxy must forward `Location`; `asConflict` lives in excluded `src/demo` | `#/brief/<id>`; `Location` and 3xx forwarded; `asConflict`/`CONSTRAINT_CODES` move named |
| S3: Google adapter in/out ambiguous | Out of the charge; a later step verified by Dustin |
| S3: Q7(c) already answered by `D04:57-58`; Q2 offered a doctrine-excluded blanket block; Q8 (surname) is Dustin's | Removed; recast; folded into Q1 |
| S3: two-parties-per-account seam unreported; "invite after share" was new sequencing | D02 Q5 cited for fail-closed; Invite allowed in any phase as an operator convenience |
| S4: AC-3 global row count; WS2 migration names; test logins stored as `google`; HTML rendering could read as a default | Scoped; superseded note; stated on screen; labelled proposal rendering |
| Citations: `D07:35-39`, `journey.js:1033`, `D06:30-36`, WS2 `README:227`, WS2 `D01:145`, WS1 reconciliation `:265` | Corrected |

Not adopted: nothing material. The reviewer judged the current-state table, the resolver and `load` change, the migration numbering, the decided-subpart reading, WS2's settled-requirements table and its reading-neutral `approver_party_ids` argument sound.
