> Supporting reconnaissance for [EXECUTION-PACKAGE.md](EXECUTION-PACKAGE.md). Read-only findings and recommendations ([F]); not a product decision.

# Workstream 1 — Participant identity and invitations (reconnaissance and design)

Baseline: `main` = 57f0b630603c5760580ed8320a68ff1572a570c8. Read-only reconnaissance; nothing here is a product ruling. Where a product seam is unanswered it is marked **unruled — omit**. Everything under "Design" is a recommendation for Dustin's technical authorization, not a Cory decision.

Governing rulings relied on: D03 (`decisions/D03-participation-credential.md:31-40`), D12 (`decisions/D12-who-may-act.md:29-31,45`), D11 (`decisions/D11-adult-assurance.md:36-39,44`), D07 (`decisions/D07-initiation-and-paywall.md:43-49`), D10 (`decisions/D10-what-each-party-sees.md:54-74`), reconciliation Q1 (`decisions/2026-10-09-15-cory-reconciliation.md:81`), A1 (`:139-147`), B3 (`:204-206`), B5 (`:213-216`), §3.9 (`:267`), D06 Gate 2 (`decisions/D06-real-use-and-launch-shape.md:30-36`).

---

## 1. Current-state findings

| # | Finding | Evidence |
|---|---|---|
| F1 | **Principal is an opaque `{ id }`; production resolves none.** `ResolvePrincipal` is a *synchronous* function of the Fastify request; `resolveNoPrincipal` returns `null`. The comment states the intent that an authenticated production principal represents an internal account id. | `src/authorization/access.ts:18-26`; intent `:7-12`; wired at `src/main.ts:33-35` |
| F2 | **Boundary order is fixed and tested**: `onRequest` resolves the principal and throws 401 for a protected op before the body is read; then strict params/query/body (400); then `authorize` → `load` (undefined → 404) → `policy` (false → 403); strict output (500). `load` receives `(input, db)` only — **not the principal**. | `src/http/operations.ts:219-223, 228-245`; `src/authorization/access.ts:37-42, 59-69`; tests `tests/http/authorization.test.ts:45-88` (generated 401s), `:102-121` (403 vs 404 distinguishable), `:124-143` (production resolver denies all) |
| F3 | **Production HTTP surface** is five operations: health, two Stage-0 synthetic ops, `project.create`, `project.read` (creator-only). No account, session, invitation or participant route exists in production. | `src/app/operation-list.ts:14-20`; `src/projects/project.ts:60-67, 71-109`; pins `tests/database/accounts.test.ts:379`, `tests/database/invitations.test.ts:363` |
| F4 | **Accounts (S06)**: `account(id, login_provider ∈ {google, apple}, provider_subject, created_at)`; `UNIQUE(login_provider, provider_subject)`; no email/name/token by design. `resolveAccountForLogin` is race-safe insert-or-read; `findAccountByLogin`, `findAccount`. | `src/accounts/tables.ts:31-46`; `src/accounts/account.ts:19-26, 47-54, 70-85`; invariant I-S06-5 `docs/slices/S06-account-party-binding.md:28` |
| F5 | **Bindings (S06)**: `party_account_binding(project_id, party_id, account_id, bound_at)`, `UNIQUE(party_id)`, containment FK to `project_party`. `bindPartyToAccount` is idempotent for the same account, throws `PartyAlreadyBoundError` otherwise. `findBindingForParty`, `listBindingsForAccount` (documented as "for a future authorization boundary"). No limit on parties per account (not a decided invariant). | `src/accounts/tables.ts:60-85`; `src/accounts/binding.ts:32-37, 67-83, 86-107`; `docs/engineering/S06-ACCOUNT-PARTY-BINDING.md:40-44` |
| F6 | **Invitations (S07)**: `direct_invitation(project_id, party_id, credential_digest sha256, created_at)`; credential = 32 CSPRNG bytes, 43-char base64url, returned once; `resolveDirectInvitation` returns `{id, projectId, partyId, createdAt}` or `undefined` for unknown *and* malformed; `claimDirectInvitation(db, credential, accountId)` = resolve → `InvitationNotFoundError`; account exists → `AccountNotFoundError`; bind via S06. No lifecycle, expiry, recipient or revocation state. | `src/invitations/tables.ts:37-61`; `src/invitations/invitation.ts:34-36, 38-50, 104-134, 152-171`; `docs/engineering/S07-DIRECT-INVITATION-CORE.md:37-58`; stop condition "who may create an invitation belongs to the authenticated participant flow" `docs/slices/S07-direct-invitation-core.md:75` |
| F7 | **S09 visibility functions take the viewing party as a bare `partyId`** and do their own membership check: `listBriefItemsVisibleTo(db, briefId, partyId)` returns `[]` for a non-member and filters money to the party's pairs; `getBriefGreenStateVisibleTo(db, briefId, partyId)`. Every act takes `partyId` as a plain argument (`tickBriefItem`, `untickBriefItem`, `declineBriefRequest`, `setOpenParameterBySubject`, `groupCheckBriefItems`). `settleDecideTogetherItem` takes **no actor**. | `src/briefs/brief.ts:294-319`; `src/briefs/live.ts:180, 193-202, 217-221, 235-239, 252, 281-284, 376-379`; `docs/engineering/S09-LIVE-RESOLUTION.md:50-60, 117` |
| F8 | **No operation today maps account id → party id.** The only consumer of bindings is the test suite. The demo's participant routes take the party from the **URL parameter** `:partyId`, and the policy is `creatorOnly` on the *project* (every request is the single `demo-operator`). | `src/demo/participant.ts:71-88` (`loadParticipant(db, projectId, partyId, itemIds)`), `:219-221` (policy), `:227-239, 243-260, 270-285` (routes); `src/demo/demo.ts:20-23`; `docs/engineering/DEMO.md:49`; defect noted `docs/engineering/DEMO-SESSION-NOTES.md:60` |
| F9 | **Demo refusal practice**: the visibility pre-check runs in `load`; a non-member party, a draft brief, an unknown project, a hidden item (another pair's fee) and a nonexistent id all return the framework's generic `404 not_found`, asserted byte-identical modulo `requestId`. Domain refusals after the pre-check are stable 409 codes. | `src/demo/participant.ts:44-53, 209-217`; `tests/demo/participant.test.ts:93-97, 163-176, 227-248`; 403/401 for other operator / anonymous `:382-395` |
| F10 | **Participant DTO** omits position, pair-record id, time, author, history; `ready` only for two parties and one pair. Reusable as-is for a real surface. | `src/demo/participant.ts:131-162, 189-206` |
| F11 | **Mobile UI wiring**: hash route `#/shoots/<id>/as/<party>` → `renderParticipant(root, projectId, partyId)` → `GET /demo/shoots/:id/as/:party`; the sticky "Viewing as" band links every party; the settle "Demo control" calls the operator route `/demo/sim/items/:id/settle`; `api()` uses `fetch` with default credentials (same-origin cookies would be sent). | `src/demo/ui/journey.js:7-8, 72-84, 739-742, 771, 801-813, 981-996, 1032-1034`; band styles `src/demo/ui/journey.css:303-319` |
| F12 | **Demo front door strips headers**: the demo server proxies to `app.inject` forwarding only `content-type` in, and only `content-type`/`x-request-id` out. **A cookie would not pass in either direction.** It also serves the static pages; production serves no static files and the `onRoute` guard refuses any route that is not an operation. | `src/demo/server.ts:18-25, 120-132`; `src/http/operations.ts:201-208`; "No web client" `docs/engineering/STAGE-0.md:103` |
| F13 | **No session/cookie/OAuth library and no auth config.** Dependencies: drizzle-orm, fastify, pg, pino, zod. Config schema: `DATABASE_URL`, `HOST`, `PORT`, `LOG_LEVEL` only. No `NODE_ENV`/environment concept. CI runs tests, demo browser suite, migrates, builds, boots `/health`. | `package.json:33-39`; `src/config/config.ts:37-51`; `.env.example`; `.github/workflows/ci.yml` |
| F14 | **Stage 0 explicitly deferred** sign-in mechanics, whether protected ops hide existence (per operation), rate limiting, sessions. | `docs/engineering/STAGE-0.md:70, 103, 107-108` |
| F15 | **Composition, sharing and settlement are operator acts** in the demo and documented as open: who composes, who shares, who enters a decide-together value (Q-S). | `src/demo/shoots.ts:14-21`; `docs/engineering/DEMO.md:69-70`; `docs/engineering/DEMO-SESSION-NOTES.md:49-56, 132`; `docs/engineering/S09-LIVE-RESOLUTION.md:117` |
| F16 | **Browser tests** launch Chromium via `playwright-core` and use `browser.newPage()` per test (each call gets its own context); no cookies/`storageState` used today. | `tests/demo-browser/journey.test.ts:7, 58, 87` |

**The gap in one sentence.** Everything below the HTTP line exists (account, binding, invitation, party-filtered reads and acts); what is missing is (a) something that turns a request into an *account* principal, (b) something that turns an account principal into *this project's party* before `load` runs, (c) the door (`/i/<credential>` → sign-in → claim), and (d) a way to serve the participant screens outside the demo proxy.

---

## 2. Design: the smallest complete path

### 2.1 The principal and the session

| Element | Recommendation | Why / constraint |
|---|---|---|
| Principal type | Keep the `{ id }` shape (`access.ts:18-20`); in production `id` is the `account.id` uuid. Rename to `AuthenticatedPrincipal` optionally; policies are unchanged. | Matches `access.ts:7-12` intent; `creatorOnly` and the generated 401 tests keep working. `project.created_by_principal_id` is `text` (`src/projects/tables.ts:31`) and takes a uuid string without migration (S06 chose not to migrate it, `S06-ACCOUNT-PARTY-BINDING.md:44`). |
| `ResolvePrincipal` | Becomes **async** (`Promise<Principal \| null>`): read the session cookie, look up the session row, return `{ id: accountId }` or null. | The `onRequest` hook is already `async` (`operations.ts:219`); one-line change at `:220`. The header resolver in `tests/support/app.ts:19-22` stays as the test substitute. |
| Session storage | **Server-side `session` table**, following S07's pattern: `id`, `account_id` → `account(id)`, `token_digest bytea UNIQUE (sha256 of 32 CSPRNG bytes)`, `created_at` (db stamp), `expires_at`, `ended_at nullable`. Runtime grants `SELECT, INSERT, UPDATE (ended_at)` only (column-restricted precedent: `live_brief UPDATE (phase)`, `S09-LIVE-RESOLUTION.md:75`). Cookie value = the raw token, never stored. | Over a signed cookie because: (1) logout and future suspension (B3: "suspension blocks acting, never reading", reconciliation `:206`) need server-side revocation — a signed cookie needs a denylist, which is a table anyway; (2) no HMAC key to provision/rotate in config; (3) one indexed lookup per request is cheap; (4) same digest-only discipline the repo already tests (`invitations.test.ts:381`). |
| Cookie attributes | `HttpOnly; SameSite=Lax; Path=/`; `Secure` when the configured public base URL is `https:` (new config key). No `Domain`. No `__Host-` prefix until HTTPS (it requires `Secure`). | See risks §5.1. |
| Session must NOT contain | email, name, avatar, provider id/access/refresh tokens, provider subject, party ids, project ids, IP, user agent. Only: digest, account id, times. | I-S06-5 (`docs/slices/S06-account-party-binding.md:28`); D10 noise doctrine (`D10:78`) — nothing that could later be surfaced as "how" someone behaved. |
| Expiry | Dustin's call; absolute expiry (and optionally idle) checked in the resolver; an expired or ended row → null → 401. | Not a product seam (D03:47-48: recovery mechanics are technical). |

### 2.2 Invitation acceptance (the door)

Sign-in exists only as the response to an invitation link ("created by Google or Apple sign-in at the moment of the invitation", D03:31; "the link is the invitation", D03:37). No forwarded-link handling (D03:39); no wrong-address correction (D03:38).

Sequence (OIDC authorization code + PKCE + nonce; the raw credential is never written to any table, I-S07-3):

| Step | Request | Access | Behaviour |
|---|---|---|---|
| 1 | `GET /i/:credential` | public (reason: the invitation link is the door; it reveals nothing) | Does **not** resolve or claim. Serves the invitation page. If a valid session exists, the page offers one deliberate action (step 5). Otherwise it offers "Continue with Google" / "Continue with Apple". The credential stays client-side (page state); nothing stored server-side. |
| 2 | `POST /sign-in/start { provider, invitation }` | public | Validates the credential's *shape* only (43-char base64url, `invitation.ts:36`); creates a `login_attempt` row `{ state (256-bit), nonce, pkce_verifier, provider, credential_digest, created_at, expires ~10 min }`; redirects to the provider's authorization endpoint with `state`, `nonce`, `code_challenge`, `scope=openid`. Storing the digest (not the credential) is the same discipline as S07. |
| 3 | `GET /sign-in/callback?code&state` (Google) / `POST /sign-in/callback` form-post (Apple) | public | Load attempt by `state` (unknown/expired → generic 404); exchange code; verify ID token (§3.4); `resolveAccountForLogin(db, {provider, sub})` (`account.ts:70`); create session; set cookie; delete/expire the attempt. Redirect to `/i/<credential>`? — the server no longer has the raw credential. **Therefore** the page at step 1 keeps the credential in `sessionStorage` and, after the redirect back to `/i/return`, re-posts it (step 5). This keeps the claim a deliberate POST with a session. |
| 4 | — | — | (Already signed in at step 1: skip 2–4.) |
| 5 | `POST /invitations/claim { credential }` | protected; `load` = `resolveDirectInvitation` (undefined → 404); policy = any principal | `claimDirectInvitation(db, credential, principal.id)` (`invitation.ts:152`). Response `{ projectId }`; the page navigates to `/shoots/<projectId>`. |

Outcomes of step 5:

| Case | Data-function result | HTTP | Note |
|---|---|---|---|
| Unknown or malformed credential | `InvitationNotFoundError` / `load` undefined | **404 `not_found`**, byte-identical to any nonexistent id | Matches `participant.ts:44-49` practice; 256-bit credential makes enumeration infeasible (S07:39). |
| Party unbound | binding created | 200 `{ projectId }` | First claim. |
| Party already bound to **this** account (repeat click, second invitation for the same party, returning later via the same link) | existing binding (idempotent, `binding.ts:76-82`) | 200 `{ projectId }` | **The link remains the way back** to the shoot after a session expires; no "my shoots" listing is required for the milestone. |
| Party already bound to **another** account | `PartyAlreadyBoundError` | **409 `already_claimed`** (recommended) | Technical reasoning, not a ruling: Google and Apple logins are two accounts that are never linked (I-S06-4, `S06:40`); the same human who signs in with the other provider must learn *that* a different account holds this party, or they are stranded with a 404. A1 says the forwarded case is for humans to handle; a stable 409 gives them the fact without any mechanism. The on-screen wording is D05 (Cory). If Dustin prefers indistinguishability, 404 is the alternative; flag either way. |
| Account unknown (session for a deleted account) | `AccountNotFoundError` | 401 | Cannot happen while accounts are append-only; fail closed. |
| Concurrent claims | one winner (S07:58) | one 200, others 409 | Already tested at the data layer `invitations.test.ts:274`. |

A bare `/sign-in` for an *existing* account (session expired, user did not keep the link): technically needed eventually; **recommend omitting from this sprint** — D03 places account creation at the invitation, and `resolveAccountForLogin` would create accounts for anyone. If added later, use `findAccountByLogin` (`account.ts:47`) and never create there. Not a Cory seam; Dustin's call, flagged.

Logout: `POST /sign-out` (protected) sets `ended_at`, clears the cookie.

### 2.3 Participant authorization

The party is never in the URL or body. It is derived from the principal.

| Element | Design |
|---|---|
| Routes (production list) | `GET /shoots/:projectId`; `POST /shoots/:projectId/items/:itemId/{tick,untick,decline,parameter}`; `POST /shoots/:projectId/group-check`. Same bodies and DTO as `participant.ts:122-162, 262-285`. |
| `load` needs the principal | Extend `ProtectedAccess.load` to `(input, db, principal)` (`access.ts:40`; call site `access.ts:65`; `operations.ts:240` already has the principal). This is the one framework change: the visibility pre-check is inherently principal-dependent. Existing operations ignore the third argument. |
| Resolution in `load` | project (`findProject`) → live brief (`findLiveBriefForProject`, phase `live`) → `listBindingsForAccount(db, principal.id)` filtered to `projectId` → exactly one party id → `listBriefItemsVisibleTo(db, briefId, partyId)` → every requested item id visible. Any miss → `undefined` → generic 404. Then `policy` re-asserts `target.binding.accountId === principal.id` (defence in depth). `run` is `participant.ts:167-207` unchanged. |
| More than one binding for one account in one project | Not a decided invariant (I-S06-10). **Fail closed: 404** until ruled; do not pick "first". Flag, do not default. |
| Refusal semantics | **404 for every "not yours" case** (non-member, draft, hidden item, unknown project), byte-identical to nonexistent, per `participant.ts:45-49` and `participant.test.ts:93-97`. 401 for no/expired session (before body, `operations.ts:219-223`). 403 is not used on this surface (nothing "exists but is forbidden" that may be disclosed). 400 for any extra field, e.g. a body `partyId` (`participant.test.ts:183` precedent). 409 stable codes after the pre-check, unchanged. Stage 0 allowed per-operation choice (`STAGE-0.md:70`). |
| Settle (decide-together) | **No participant route.** Q-S is unruled (`DEMO-SESSION-NOTES.md:51`; `S09:117`). The function takes no actor; exposing it to any party would be a default. Operator-only (§2.4). |

### 2.4 Unruled product seams — omit, or operator-only with no default

| Seam | Status | Treatment in the sprint |
|---|---|---|
| Who creates the project / composes the brief | D01 records that the model created it in the scenario (`D01:32`) and that creator is role-neutral (`D01:37`); no general composition permission is ruled; `shoots.ts:17-18`. | **Unruled — omit** from the participant surface. No "Create a shoot" for a signed-in account. |
| Who creates/sends an invitation | S07 stop condition `docs/slices/S07-direct-invitation-core.md:75`. | **Unruled — omit.** No participant route mints invitations. |
| Who shares the brief / sets presence | Operator act today (`DEMO.md:70`). | **Unruled — omit.** |
| Who enters a decide-together value (Q-S) | `DEMO-SESSION-NOTES.md:51`. | **Unruled — omit.** |
| Account bound to two parties in one project | I-S06-10. | Fail closed (404). |
| Display names / labels for counterparties | D10 says counterparties are mutually visible (`D10:60`) but the database stores no name by design (`S06:43`; `src/projects/tables.ts:40-41`); demo labels live in a demo-only annotation file (`DEMO.md:63`). What a real participant sees as the other person's identity (and whether it is the verified identity, D11) is not built and partly unruled. | **Omit**: the two-party screen uses "you" / "the other person". Flag for Cory/Dustin. |
| No-means-no wording, visible signing act (D04), vocabulary (D05) | OPEN | Unchanged; not touched. |

**How the sprint still reaches the milestone (recommendation, not a ruling).** An **operator seed path**, outside the participant surface and labelled as operator acts: a script (or a demo-only operation, like `src/demo/shoots.ts`) that composes a two-person shoot, sets presence, shares it, settles any decide-together values, and mints one invitation per party with `createDirectInvitation` (`invitation.ts:104`), printing the two links once. The two humans (or two browser contexts) each open their link, sign in, claim, and act only as themselves. The milestone is then satisfied without answering who composes, invites, shares or settles.

### 2.5 Mobile: reusing `src/demo/ui`

| Keep | Change | Why |
|---|---|---|
| `journey.css` whole; `renderDocument`, `renderNextStep`, `renderReady`, toast, progress, `api()` (`journey.js:72-84` already sends same-origin cookies) | `renderParticipant(root, projectId)` — party comes from `view.partyId` in the response; route regex `journey.js:1033` becomes `#/shoots/<id>`; API base `/shoots/:id` | F11 |
| — | **Delete `renderViewing` (`journey.js:801-813`) and the "Viewing as" band** (`journey.css:303-319`). A real participant has no switch: the server never accepts a party. | D12:29-31 |
| — | **Delete the settle "Demo control"** (`journey.js:981-996`) | Q-S unruled |
| — | Labels: `annotations.json` is demo-only (`server.ts:101-105`); replace `labeller` with "you"/"the other person"; remove `eng()` ids, the Synthetic-demo pill, About, Demo menu | §2.4 |
| — | Add: invitation page (`/i/<cred>`: two provider buttons, or one "Join" button when signed in), a signed-out state (401 → sign-in needed), sign-out | §2.2 |
| — | **Static serving in production** does not exist (F12). Either an operation kind that returns `text/html`/`text/javascript` (the registration validator currently requires a strict-object output, `operations.ts:168`), or a separate static front door like `src/demo/server.ts` but forwarding cookies. Decide before building. | F12 |

What breaks if ported naively: the demo proxy drops `Cookie`/`Set-Cookie` (F12); the `/as/` routes 404 in production (`participant.test.ts:367-380`); labels vanish; the band and settle control would be proxy affordances.

---

## 3. Provider configuration requirements

### 3.1 What each provider needs

| | Google (OIDC) | Apple ("Sign in with Apple", OIDC-like) |
|---|---|---|
| Account/cost | Google Cloud project; **free**. | **Apple Developer Program, paid (USD 99/year)**. |
| Registration | OAuth consent screen (external; "testing" mode admits listed test users without app verification — `openid` scope is non-sensitive; verification/branding review only when publishing; *uncertain on current thresholds*), then an OAuth client of type **Web application** → client id + client secret. | App ID with the Sign in with Apple capability; a **Services ID** (the web client id) with registered **domains and return URLs**; a **Sign in with Apple key** (`.p8`) + Key ID + **Team ID**. The client secret is a short-lived **ES256 JWT the server signs** from the `.p8` (max 6 months validity), not a static string. |
| Redirect / return URL | Authorized redirect URIs; **`http://localhost:<port>/...` is accepted for Web clients** (Google permits http for loopback; *fairly confident; verify whether `127.0.0.1` is also accepted or only `localhost`*). | **HTTPS only, on a registered domain; no localhost, no raw IP.** Apple historically required domain verification by hosting a file (*uncertain whether still required*). |
| Issuer / discovery | `https://accounts.google.com/.well-known/openid-configuration`; JWKS published. | `https://appleid.apple.com/.well-known/openid-configuration`; JWKS at `https://appleid.apple.com/auth/keys`. |
| Callback mode | `response_mode=query` (GET). | With any scope requested, Apple uses `response_mode=form_post` (**POST** callback): Fastify has no form-body parser in core; a cross-site POST **does not carry a `SameSite=Lax` cookie** — correlate the attempt by `state` server-side (§2.2 step 2 does this), not by cookie. |
| Stable subject | `sub` (stable per Google account per client project). | `sub` (stable per Apple ID per developer team). |
| Consequence | Fully exercisable locally for free. | **Cannot be exercised locally for free**: needs the paid account, a public HTTPS domain and a return URL on it. Defer. |

Config keys (new, all optional unless the provider is enabled): `PUBLIC_BASE_URL` (drives redirect URIs and the `Secure` flag), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (or a file path). Secrets never echoed (`config.ts:8-9` rule). Issuer URLs are **constants in source, not configuration** (see §3.3).

### 3.2 Local verification path

| Path | What it proves | Status |
|---|---|---|
| (a) **Test identity provider** — a local fake OIDC issuer (discovery, authorize page with a person picker, token endpoint, JWKS with a generated key) that the real client code talks to; it yields `{ provider: 'google', sub: 'test-…' }`-shaped logins. Lives in `src/demo/` or `tests/support/`, injected into `createApp` like `resolvePrincipal` is today (`tests/support/app.ts:55-59`). | The whole in-process flow: start → redirect → callback → ID-token verification → account → session cookie → claim → party-scoped acts, with **two distinct principals in two browser contexts**. | **Sufficient for the milestone.** Deterministic, offline, CI-safe. |
| (b) **Real Google OIDC against `http://localhost`** | That the client id/secret, redirect URI, discovery and token exchange work with Google's real endpoints. | Optional stretch; free; needs a Cloud project; one real Google account per tester. |
| (c) **Apple** | — | Deferred until a domain + paid account + HTTPS exist. |

**Test identities vs actual provider authentication.** A test identity is a login the fake issuer invents; it proves our code path, not that a human controls a Google/Apple login. Only (b)/(c) are "actual provider authentication". Neither is identity (D03:32; D11).

### 3.3 Making the test provider impossible in production (config-level, tested)

1. The production app has **no configuration key for an issuer URL**; Google's and Apple's issuers are constants in `src/`. The only way to point the client at the fake issuer is dependency injection through `createApp` (like `resolvePrincipal` substitution), which `src/main.ts` never does.
2. The fake issuer module lives outside the build (`tsconfig.build.json` excludes `src/demo`, `DEMO.md:48`); a boot/build test asserts `dist/` contains no test-issuer module and `src/main.ts`, `create-app.ts`, `operation-list.ts` import nothing from it (same shape as the existing demo-isolation test, `participant.test.ts:367-380`).
3. `loadAppConfig` refuses any `PUBLIC_BASE_URL` that is not `https:` **unless** its host is loopback (keeps `npm run dev` and LAN demo working; cf. `demo.ts:52-62`). Test: production-shaped config with an `http://` non-loopback base URL fails to boot (pattern: `tests/boot/boot.test.ts`).
4. The generated authorization test (`tests/http/authorization.test.ts:45`) keeps proving every protected op is 401 without a session; the public-operation pin (`STAGE-0.md:68`) is extended to exactly: health, `/i/:credential` page, sign-in start, callback.

**Where real provider setup becomes genuinely necessary.** Not for the milestone: "two sessions with distinct principals" is proven with (a), or even with the header resolver at HTTP level. It becomes necessary for **Gate 2 real use** (`D06:30-36`) and for the optional stretch "actual Google sign-in end to end" (b). Apple only when a domain and the paid account exist.

### 3.4 ID-token verification (no library chosen)

Verify: signature against the provider's JWKS by `kid` (RS256 for both); `iss` equals the constant issuer; `aud` equals our client id; `exp` in the future (small skew); `iat` sane; `nonce` equals the attempt's nonce; then take `sub`. Discard the tokens; persist nothing from them but `sub`. Also validate the PKCE round trip and that `state` matches an unexpired attempt.

Library options (§3.9: minimize third parties, `reconciliation:267`):

| Option | Pros | Cons |
|---|---|---|
| **none** (`node:crypto` `createPublicKey({format:'jwk'})` + `crypto.verify`, `fetch` for discovery/JWKS/token) | zero dependencies; the flow is two redirects and one POST | hand-written JWT parsing and Apple's ES256 client-secret signing; more tests to own |
| **`jose`** | single well-audited package, no transitive deps; JWKS cache, `jwtVerify`, `SignJWT` for Apple's secret | one dependency |
| **`openid-client`** | discovery, PKCE, token exchange and validation out of the box | larger API surface; depends on `jose`; more abstraction than two providers need |

Recommendation: `jose` or none; Dustin's call.

---

## 4. Acceptance criteria

All HTTP criteria run through the real `createApp` with the production operation list (`tests/support/app.ts` pattern) against a real database; sessions created either through the fake issuer or directly via the session data function. Browser criteria use `playwright-core` with **two `browser.newContext()`s** (today `newPage()` per test, `journey.test.ts:87`).

| ID | Criterion | Level | Expected |
|---|---|---|---|
| AC1 | Unauthenticated request to every protected participant op (generated from `operation-list.ts`), including malformed/oversized/wrong-type bodies | HTTP | 401 `unauthenticated` before body parsing; no side effects (extends `authorization.test.ts:45-88`) |
| AC2 | Operator seed: one shoot, two parties, presence, shared, two invitations minted once; raw credential appears only in the seed output; the database holds only digests | HTTP/DB | `invitations.test.ts:127` style assertion against every table and the log |
| AC3 | Context A signs in (test identity "alice"), claims invitation 1 → `{projectId}`; context B ("bob") claims invitation 2 → same `projectId`; `party_account_binding` has exactly two rows, different accounts, different parties | HTTP + browser | 200 / 200 |
| AC4 | A re-posts her claim; A posts invitation 2 (bob's); B posts invitation 1 | HTTP | 200 idempotent (same binding); 409 `already_claimed`; 409 `already_claimed`; bindings unchanged (`PartyAlreadyBoundError` mapping) |
| AC5 | Unknown credential, malformed credential, credential of another project's party for an account with no binding there — claim and page | HTTP | 404 bodies byte-identical modulo `requestId` (`participant.test.ts:93-97`) |
| AC6 | `GET /shoots/:projectId` as A and as B | HTTP | 200 each; `partyId` differs; same item ids (two parties, one pair); `ready` present (`participant.ts:189-193`) |
| AC7 | Fixture-2 shape (A, B, C; pairs A–C, B–C; one fee each) seeded with three invitations: each account sees exactly one money item, never the other pair's fee id or value, no `ready` key | HTTP | mirrors `participant.test.ts:209-225` with sessions instead of `/as/` |
| AC8 | Every act on a hidden item by its non-pair party (tick, untick, decline, parameter, group-check including a visible+hidden mix, random id) | HTTP | 404 byte-identical to a nonexistent id; ticks unchanged (`participant.test.ts:227-248`) |
| AC9 | Attempts to act as the other party by any route shape: body `partyId`; query `?partyId=`; legacy `/as/:partyId` path; the other party's item in the model-only open parameter (`not_subject` 409 is acceptable *after* the pre-check since the item is visible to both) | HTTP | 400 (strict input) / 400 / 404 / 409 — never a tick attributed to the other party; `brief_tick.party_id` rows only for the acting account's party |
| AC10 | A ticks; B's view shows A's party in `tickedBy`; B cannot untick A's tick (untick deletes only own tick, `live.ts:252-269`) | HTTP | 200; `untick` returns 200 with A's tick still present |
| AC11 | Full resolution to READY TO SIGN through the two sessions only (plus operator settle for any decide-together value), untick loses readiness, retick regains | HTTP | as `participant.test.ts:261-315` |
| AC12 | Session cookie copied from context A into context B | HTTP/browser | B's requests are A (bearer): same `partyId`; documents that the cookie is the credential |
| AC13 | Logout; expired session; ended session reused | HTTP | 401 on the next protected request; cookie cleared |
| AC14 | Session row holds only digest, account id, times; no token/email/name column (semantic-guard test like `accounts.test.ts:357`) | DB | pass |
| AC15 | Test issuer in production: `dist/` has no test-issuer module; `main.ts`/`create-app.ts`/`operation-list.ts` import none; production-shaped config with non-loopback `http://` base URL exits 1 | boot | pass |
| AC16 | Callback with wrong `state`, reused `state`, wrong `nonce`, wrong `aud`, wrong `iss`, expired `exp`, bad signature | HTTP | 404 or 400 as designed, **no account and no session created** |
| AC17 | Browser: two contexts at 390 px open their links, sign in as different test identities, land on the same shoot, see no "Viewing as" band, no settle control, each ticks only own items, the other context's screen updates on reload; no console errors; no horizontal scroll (reuse `journey.test.ts` assertions) | browser | screenshots per context |
| AC18 | Public-operation pin updated to exactly the new public set; every demo route still 404 in production | HTTP | pass |

---

## 5. Risks and open technical questions (Dustin's)

| # | Risk / question | Consequence and options |
|---|---|---|
| 5.1 | **`Secure` on LAN http.** Browsers treat `localhost`/`127.0.0.1` as secure contexts but not `192.168.x.x`; a `Secure` cookie is never set or sent over plain http from a phone on the LAN. | On LAN the session cookie must be non-`Secure`, so the bearer travels in clear on the Wi-Fi. Acceptable only while everything is synthetic (same posture as `DEMO.md:20`). Gate 2 needs HTTPS on a real hostname (Apple needs it regardless). `__Host-` prefix unavailable until then. Tie `Secure` to `PUBLIC_BASE_URL` scheme. |
| 5.2 | **CSRF.** `SameSite=Lax` blocks cookies on cross-site POST; all acts are JSON POSTs (non-simple content type → CORS preflight, and the app sets no CORS headers). `Lax` *does* send cookies on top-level GET navigations, so no GET may have side effects (claim is a POST; `GET /i/:credential` resolves nothing). Apple's form-post callback is a cross-site POST: it carries no Lax cookie, hence server-side `state` correlation (§2.2). | Add an `Origin`/`Sec-Fetch-Site` check on POST as cheap defence in depth. Fastify needs a form parser only for Apple's callback. |
| 5.3 | **Session expiry and revocation** policy (absolute vs idle; how long). | Technical; pick and document. The table design makes B3-style suspension possible later without redesign. |
| 5.4 | **Rate limiting on credential lookup.** 256-bit credentials make enumeration infeasible (`S07:39`); a lookup is one hash and one indexed read. | No limit needed for correctness. But `/sign-in/start` inserts a `login_attempt` row per call and the callback hits provider endpoints: cap rows (expire ~10 min, prune) and consider a simple per-IP limiter later; Stage 0 has none (`STAGE-0.md:103`). |
| 5.5 | **Demo database vs production database.** The demo runs `modeling_standard_demo` with a fixed operator principal and loopback/LAN guards (`demo.ts:18-23, 70-82`); production runs `modeling_standard` with no principal. The participant surface belongs in the production list (`operation-list.ts`) and the demo proxy drops cookies (F12). | Decide where the two-person milestone runs: (i) `npm run dev` on the production app + a seed script against `modeling_standard` (nothing can compose there except the seed), or (ii) the demo server with its proxy taught to forward `Cookie`/`Set-Cookie` and the operator composer minting links. (ii) preserves the polished journey and LAN phone access; (i) is closer to the real shape. Either way the seed is an operator act. |
| 5.6 | **Serving HTML/JS/CSS in production** under "every route is an operation" (`operations.ts:201-208`) and strict-object outputs (`:168`). | Needs a deliberate extension (a static operation kind with a stated public reason) or a front server like `src/demo/server.ts`. Not a product question, but it changes the boundary's invariants and tests. |
| 5.7 | **`load` signature change** (`access.ts:40`) touches the framework and every existing operation's type. | Small, mechanical; alternatively return all bindings in the target and choose in the policy, which spreads the pre-check across two places — not recommended. |
| 5.8 | **Account-creation surface.** `resolveAccountForLogin` creates on first sight. If a bare `/sign-in` ever exists, anyone with a Google login creates an account row without an invitation. | Keep account creation inside the invitation flow for now; `findAccountByLogin` for any resume path. Flagged, not ruled. |
| 5.9 | **Apple specifics**: client secret is a server-signed ES256 JWT with a 6-month maximum; keys rotate; return URLs are fixed per Services ID. | Defer; design the provider adapter so Apple is additive (`S06` change-locality: one provider list, `S06:65`). |
| 5.10 | **Clock and `exp` skew; JWKS caching and key rotation** (Google rotates frequently). | Cache JWKS by `kid` with refresh-on-miss; bound skew. |
| 5.11 | **Participant has no name to show for the counterparty** (§2.4). | Not solvable technically; omit and flag. |
| 5.12 | **Existing pins to update**: public-operation pin, table-list and privilege pins (`runtime-role.test.ts`, `migrations.test.ts`), trigger-function pin for session stamps, populated-upgrade case through the new migrations. | Routine, but each is a hand-written SQL migration plus pins. |
