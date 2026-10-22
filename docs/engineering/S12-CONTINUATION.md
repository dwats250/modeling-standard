# S12 participant access — continuation note

Work item: S12-A to S12-F of `planning/sprint-2026-10-21/EXECUTION-PACKAGE.md`, as amended by Dustin's authorization of 2026-10-20 (summarized below; the amendments take precedence over the package). This note lets the work resume after a session reset. It is not a product decision.

- Base: `main` at `57f0b630603c5760580ed8320a68ff1572a570c8` (verified on `origin`).
- Branch: `stage-1/s12-participant-access`, in its own worktree (`../modeling-standard-s12`).
- Isolation: PostgreSQL 17 container `ms-s12-postgres` on `127.0.0.1:5434` (provisioned from `db/provision.sql`); demo port `3120`. The presentation demo (`5432`, `3100`) and the S10 worktree's database (`5433`) are not touched.

## Authorization amendments (take precedence over the package)

1. S11 is deferred: no contract or signature tables, no finalization, no `final` phase.
2. Each sign-in attempt is bound to the browser that started it by a browser-held secret, in addition to server-side state. State, nonce and PKCE values are unique, short-lived and single-use; attempts are consumed atomically. A test shows an attacker's otherwise-valid callback cannot establish a session in another browser.
3. A real invitation is validated before a sign-in attempt is admitted; the completed login and claim are bound to that invitation. The return flow is specified before implementation, with no raw credential in logs, redirects, annotations or unrelated browser storage. No account is created from an arbitrary invitation-shaped string. Same-account reopening works; claims by another account are refused.
4. Session resolution fails closed: no cookie may use the operator mode accidentally; a malformed, unknown, expired or ended cookie never becomes the operator; account principals stay refused on operator operations; return to operator mode is an explicit demo convenience.
5. Exact-origin protection on state-changing browser operations (sign-in start, claim, sign-out and the rest); explicit local/LAN origins; no forwarded headers trusted; pinned redirect destinations; multiple `Set-Cookie` headers preserved by the demo proxy; tests for cross-origin requests, callback replay and malicious redirect inputs.
6. A maintained token-verification library; the test issuer isolated from production and exercising the real verification path, including invalid tokens. No claim that real Google or Apple authentication is verified.
7. Isolated worktree, database and port; migration numbers from the current journal (next: `0026`).

## Implementation decisions (recorded before coding)

**Principal.** `Principal = { id, kind: 'account' | 'synthetic' }` replaces `SyntheticPrincipal`. Sessions yield `account` (id = `account.id`); the test header resolver and the demo operator yield `synthetic`. `ResolvePrincipal` becomes async; `ProtectedAccess.load` receives the principal. `project.create` and the Stage-0 synthetic create refuse `account` principals (unruled seam: who creates a project).

**Boundary extension.** An operation may declare `response: 'browser'`. Its `run` returns either `{ kind: 'json', body, cookies? }` or `{ kind: 'redirect', location, cookies? }`. Cookies are structured (`name`, `value`, `maxAge`, `path`, `sameSite`), serialized by the boundary, always `HttpOnly`, `Secure` when the app is configured for HTTPS. A redirect location must be a same-origin path (`/` followed by a non-slash, no backslash); anything else is a 500, never a redirect. A pin test lists the browser operations.

**Origin check (amendment 5).** `createApp({ allowedOrigins })`, an explicit list read at request time (the demo fills it after it knows its port). A POST to a `browser` operation, or any POST that carries a `Cookie` header, must carry an `Origin` exactly equal to one allowed origin; otherwise `403 cross_origin` before the body is read. A missing `Origin` is refused. No `X-Forwarded-*` header is read anywhere. Production: the origin of `PUBLIC_BASE_URL` (new, optional; must be `https:`, or `http:` on a loopback host). Demo: `http://<host>:<port>` for each host the demo already accepts in the Host header (loopback names, and in LAN mode the machine's own private IPv4 addresses).

**Sessions (S12-B).** Table `session(id, account_id, token_digest, created_at, expires_at, ended_at)`. Token: 32 CSPRNG bytes, base64url, only its SHA-256 stored (S07 discipline). Absolute expiry 12 hours. Runtime grants `SELECT, INSERT, UPDATE (ended_at)`. Cookie `ms_session`, `SameSite=Lax`, `Path=/`. The session holds no email, name, token or provider data.

**Fail-closed resolution (amendment 4).** Production resolver: no `ms_session` cookie → no principal; a present cookie that is malformed, duplicated, unknown, expired or ended → no principal. Demo resolver: if an `ms_session` cookie is present at all, the request is that session or nobody — never the operator. The operator exists only with an explicit `ms_demo_operator` cookie whose value is a per-process 256-bit secret, compared in constant time, and only when no session cookie is present. A browser enters operator mode only through an explicit action (`POST /demo/operator`, origin-checked, labelled a demo convenience), which also ends any session it carries. Signing in and signing out both clear the operator cookie, so a participant who signs out is nobody (401), not the operator. Every demo operator operation refuses `account` principals with a uniform 403, before any lookup.

**Sign-in attempt (amendments 2, 3).** `POST /sign-in/start { provider, invitation }` (public, browser, origin-checked):
1. resolves the invitation credential to a real invitation, or answers the generic 404 with nothing written and no cookie;
2. generates `state`, `nonce`, PKCE verifier and a browser binding secret, 32 CSPRNG bytes each;
3. stores `sign_in_attempt(state_digest UNIQUE, binding_digest, nonce_digest, code_verifier, provider, redirect_uri, invitation_id, created_at, expires_at)` with a 10-minute expiry — digests only, except the PKCE verifier, which must be sent to the token endpoint; the raw invitation credential is never stored;
4. sets `ms_signin=<binding secret>` (`HttpOnly; SameSite=Lax; Path=/sign-in; Max-Age=600`);
5. answers JSON `{ authorizationUrl }`, built server-side from the provider's constants and the validated request origin. The page navigates to it.

`GET /sign-in/callback?code&state` (public, browser):
1. always clears `ms_signin`;
2. consumes the attempt atomically (`DELETE … WHERE state_digest = $1 AND expires_at > now() RETURNING …`): a replayed or expired `state` finds nothing;
3. compares the `ms_signin` cookie's digest with the attempt's binding digest in constant time — another browser's callback fails here;
4. exchanges the code with the stored PKCE verifier and the stored `redirect_uri`, and verifies the ID token with jose (`RS256` only; issuer, audience, `exp`, `iat`, `sub`, `nonce` required; nonce compared by digest);
5. in one READ COMMITTED transaction: resolves the account, binds it to the attempt's invitation party, creates the session. A party bound to another account rolls the whole transaction back, so no account is created for a refused claim;
6. redirects only to fixed paths: `/#/brief/<projectId>` on success, `/#/signin/already-claimed` or `/#/signin/failed` otherwise.

**Return flow (amendment 3).** The invitation link is `<origin>/#/i/<credential>`: the credential is in the URL fragment, so it is never in a request line, a server log or a `Referer`. The page reads it from the fragment and sends it only in the body of `POST /invitations/claim` (when this browser already has a session) or `POST /sign-in/start`. The claim context after sign-in comes from the server-side attempt (its `invitation_id`), so `/#/brief/<projectId>` needs no credential and nothing is put in `localStorage`, `sessionStorage` or annotations. The request logger already strips query strings, so the callback's `code` and `state` are not logged. `POST /invitations/claim` (protected, account principals only): same account → 200 idempotent; another account → `409 already_claimed`; unknown or malformed → generic 404.

**Token verification (amendment 6).** `jose` 6.2.12, pinned exactly (published 2026-09-05; no dependencies; ESM; Node 24 WebCrypto). One verification function used by every provider. The test issuer (`src/demo/test-issuer.ts`, excluded from `dist/`) holds an RS256 key pair generated at start, issues single-use authorization codes (60 s, S256 PKCE checked, redirect URI checked) and signs real ID tokens that go through the same `jwtVerify` path with a local JWKS. Tests mint invalid tokens (wrong issuer, audience, nonce, signature, expired, `alg: none`, HS256) through it. Its logins are stored as `login_provider = 'google'` (the column admits only `google`/`apple`) with subject `test-issuer|<name>`; screens and docs say no Google sign-in happened. No real provider adapter is built.

**Demo integration.** The demo server forwards `cookie` and `origin` to the app and returns every `Set-Cookie` and `Location`; it serves the test issuer's two pages (`/test-idp/authorize`, `/test-idp/approve`). Operator `Invite` mints one invitation per party (any phase) and returns the credentials once; the page shows links built on its own origin. Signed-in participants use `/#/brief/<projectId>` (no "Viewing as" band, no settle control); the operator keeps `/#/shoots/<id>` and the labelled `/as/` simulation. Participant DTO and act code move to `src/participants/` with the refusal mapping, so the demo and production routes share one implementation.

## Increment status

| Increment | Status | Last passing check |
|---|---|---|
| Baseline on the isolated database | done | `npm run check`; `npm test` 30 files / 387 tests |
| S12-A principal and boundary | done | restated pins; `tests/http/*` |
| S12-B sessions | done | `tests/database/sessions.test.ts`; upgrade 0025 → current |
| S12-C sign-in and the door | done | `tests/http/participant-access.test.ts` |
| S12-D participant operations | done | same |
| S12-E demo integration | done | `tests/demo-browser/participants.test.ts`; journey and regression suites |
| S12-F verification and delivery | done | below |

## Changes to the recorded decisions, made while building

- **One account, one party per shoot**, in the S12 claim path only (advisory lock; no database rule). Found while building the invitation page: a browser signed in as one person opening another person's link would otherwise bind that party to the wrong account, leaving it unusable (the participant routes fail closed on two bindings). The page also asks before accepting with an existing sign-in.
- **`GET /session`** added (public, answers only `{ signedIn }`), for that question without a console error.
- **The test provider's page uses `Referrer-Policy: same-origin`**: under `no-referrer` a browser sends `Origin: null` with a form POST, and the approval was (correctly) refused.

Everything else was built as recorded above.

## Verification run in this environment (isolated database, 127.0.0.1:5434)

- `npm run check`: passed (typecheck, lint, `db:drift`, `db:identifiers`: 28 migration files).
- `npm test`: 32 files, 466 tests passed.
- `npm run test:demo`: 3 files, 24 browser tests passed (Chrome at `/usr/bin/google-chrome`), including the two-context participant test at 390.
- `npm run build`: passed; `dist/` contains no `src/demo`, no test issuer, no operator cookie code.
- The built artifact, booted with `PUBLIC_BASE_URL=http://127.0.0.1:3021`: `/health` ok; `/shoots/<id>` 401; `POST /sign-in/start` 404 (no provider registered); a foreign Origin 403 `cross_origin`; `/session` `{"signedIn":false}`; `/test-idp/authorize` 404.
- `npm run demo:fresh` on port 3120: reset 4 projects and served; no-mode `GET /demo/projects` 401; `POST /demo/operator` 200; then 200 with the projects.

**Not verified here:** a real phone on the LAN (`--lan` was not run in this session; the two-device flow was exercised by two browser contexts and over HTTP); real Google or Apple sign-in (not built); the presentation demo on 5432/3100 was not started or touched.

## Open seams hit (not answered)

Who sends invitations; who composes, shares, sets presence and enters agreed values; the counterparty's displayed identity; whether a synthetic demo needs verification (D11); the words for a claimed link and "already in this shoot" (D05, package Q6). All remain operator acts or proposed words.

## Handoff — open and do

From a clean checkout of `stage-1/s12-participant-access`, with Docker:

```
docker run -d --name ms-s12-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres_local_only \
  -p 127.0.0.1:5434:5432 -v "$PWD/db/provision.sql:/docker-entrypoint-initdb.d/provision.sql:ro" postgres:17
sed -e 's/127.0.0.1:5432/127.0.0.1:5434/g' .env.example > .env     # first time only
echo 'DEMO_PORT=3120' >> .env
npm ci
npm run demo:fresh -- --lan     # open the printed 192.168.x.x:3120 URL; Ctrl+C to stop
```

(With the ordinary database on 5432 and no other demo running, `cp .env.example .env` and `npm run demo:fresh -- --lan` on 3100 work the same.)

Then: **Continue as the demo operator** → Demo menu → **Shared, with values still open** (or compose your own and share it) → **Create invitation links** → open the Model link on one phone and the Photographer link on another (or a private window) → **Continue with test sign-in** → pick an invented name → each lands on their own brief → the Model sets the coverage level → on the operator screen open the brief as either person and **Enter the agreed value** → each phone ticks its terms → both show **READY TO SIGN**. Try opening the Model's link on a third device: it is refused. **Sign out** on a phone: it is in no mode, not the operator.

Checks: `npm run check`, `npm test`, `CHROME_PATH=/usr/bin/google-chrome npm run test:demo`, `npm run build`.

**Integration:** this branch was merged into `main` as PR #34. S11 was later built on the integrated S12/S13 baseline and merged as PR #36. The external provider and real-use checks remain separate gates.
