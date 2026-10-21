# S12: participant access, as built

Slice: `docs/slices/S12-participant-access.md`. Decisions relied on: D03, D12, D10, D07, D02 (Q5), D11 (only for what it excludes). Implementation decisions for Dustin's amendments were recorded before coding in `S12-CONTINUATION.md`.

**What this is not.** Sign-in here is the demo's local test identity provider, not Google or Apple, and no real provider authentication has been tested. Signing in is not identity and not verification (D03, D11). Production registers no provider, so production still signs nobody in.

## What exists

| Piece | Where |
|---|---|
| Principal kinds; async resolver; principal-aware loaders | `src/authorization/access.ts` |
| Browser response kind (JSON or same-origin redirect, structured cookies); exact-origin check | `src/http/operations.ts`, `src/http/cookies.ts` |
| Sessions: table, create, find, end, production resolver | `src/sessions/`, migrations `0026`, `0027` |
| Sign-in attempts; provider interface; ID-token verification (jose 6.2.12) | `src/identity/attempt.ts`, `provider.ts`, `tables.ts` |
| Guarded claim (no second party of the same shoot) | `src/identity/claim.ts` |
| Operations: `POST /sign-in/start`, `GET /sign-in/callback`, `POST /sign-out`, `POST /invitations/claim`, `GET /session` | `src/identity/operations.ts` |
| Signed-in participant routes: `GET /shoots/:projectId`, `POST …/items/:itemId/{tick,untick,decline,parameter}`, `POST …/group-check` | `src/participants/operations.ts` (view and refusals shared with the demo: `view.ts`, `refusals.ts`) |
| `PUBLIC_BASE_URL` (optional; https origin, or http on loopback) | `src/config/config.ts`, `src/main.ts` |
| Demo: fail-closed resolver, operator mode, operator-only wrapper, Invite, test identity provider, proxy, screens | `src/demo/{demo,application,operations,server,test-issuer}.ts`, `src/demo/ui/journey.{js,css}` |

## Flows

**Invitation link.** `<origin>/#/i/<credential>`: the credential is in the fragment, never in a request line, log or `Referer`. The page asks `GET /session`. Signed in: it offers "Accept the invitation" (`POST /invitations/claim`) or "Sign out". Not signed in: "Continue with test sign-in" (`POST /sign-in/start`).

**Sign-in.** Start resolves the credential (else the generic 404, nothing written, no cookie), records an attempt (digests of `state`, `nonce` and a browser-binding secret; the PKCE verifier; the redirect URI built from the validated Origin; the invitation id — never the credential), sets `ms_signin` (`Path=/sign-in`, ten minutes) and returns the authorization URL. The test provider's page checks client, response type, S256 and that the redirect URI is exactly an allowed origin's `/sign-in/callback`; its approval (same origin only) issues a single-use 60-second code. The callback clears `ms_signin`, consumes the attempt (`DELETE … RETURNING`), compares the binding cookie in constant time, exchanges the code with the verifier, verifies the token, then in one READ COMMITTED transaction resolves the account, claims the invitation's party and creates the session. It redirects only to `/#/brief/<projectId>`, `/#/signin/already-claimed`, `/#/signin/already-in-shoot` or `/#/signin/failed`, and ends any session the browser already carried.

**Participant routes.** `load` takes the account's bindings in the project; exactly one, else the generic 404 (none, or more than one — fail closed); then the existing S09 visibility pre-check. The policy re-checks the account. A synthetic principal is a 404 here.

**Demo modes.** A request with any `ms_session` cookie is that session or nobody. Without one, it is the operator only with exactly one `ms_demo_operator` cookie equal, in constant time, to the server's per-process secret, set only by `POST /demo/operator` (origin-checked, ends any session). Signing in and out clear the operator cookie. Every protected demo operation refuses an account principal with a uniform 403 before loading anything (an undeclared body is still a 400 first: strict input precedes authorization, as since Stage 0).

## Status codes

| Case | Answer |
|---|---|
| Protected operation, no or invalid session | 401 before the body is read |
| POST to a browser operation, or carrying a cookie, from a non-allowed or missing Origin | 403 `cross_origin` before the body is read |
| Unknown or malformed invitation; not the account's shoot; hidden item; nonexistent id | 404 `not_found`, byte-identical modulo `requestId` |
| Claim of a party bound to another account | 409 `already_claimed` |
| Claim by an account already a different party of the shoot | 409 `already_in_shoot` |
| Account on a demo operator operation; account creating a project | 403 `forbidden` |

## Choices made (for Dustin to see)

- **jose 6.2.12**, pinned exactly: maintained, no dependencies, Node 24 WebCrypto; 6.2.13 was one day old. Verification options checked against the installed type definitions.
- **Server-side sessions** (table, digest-only), not signed cookies: revocation and sign-out without key management. Absolute expiry 12 hours; no idle expiry.
- **Session table named `account_session`** (avoids the SQL keyword `session`).
- **`GET /session` is public** and answers only `{ signedIn }`, so the invitation page can ask before accepting with an existing sign-in without a console error. It reveals nothing about the account.
- **Sign-out is public**: it ends the session the browser names, if any, and always clears cookies.
- **409 `already_claimed`** for a claimed link (recovery mechanics are Dustin's, D03); its words are Cory's (package Q6) and marked proposed on screen.
- **One account, one party per shoot**, enforced only in the S12 claim path under an advisory lock; no database rule (S06 recorded that none was authorized). This prevents a browser signed in as one person from silently binding another person's link.
- **Test logins stored as `login_provider = 'google'`** with subject `test-issuer|<name>` (the column admits only Google and Apple); the About screen says no Google sign-in happened.
- **The test provider's page uses `Referrer-Policy: same-origin`**: under `no-referrer` a browser sends `Origin: null` with a form POST, which the approval correctly refuses.
- **Operator-mode secret per process**: restarting the demo leaves operator mode; the start screen offers it again.
- **Invite** works in any phase, mints one invitation per party each time it is pressed, and shows links on the page's own origin (open the operator screen on the LAN address to get LAN links). No QR code (it would need a client library).

## Open seams hit (not answered here)

Who sends invitations; who composes, shares and enters agreed values; the counterparty's displayed identity; whether a synthetic demo needs verification (D11); the words for a claimed link and for "already in this shoot" (D05). All are operator acts or proposed words in the demo; none is a participant default.

## Tests

- `tests/http/participant-access.test.ts` (35, real HTTP through the demo server): two browsers on one shoot; credentials once, digests only, nothing in the log; ticks visible to the other, not removable by them; copied cookie is a bearer; reopening as the same person; another account refused with no account created; no second party per account by claim or sign-in; idempotent claim; dead and malformed links write nothing; the three-person fee case and every act on a hidden fee as the generic 404; every route shape for acting as the other refused; accounts refused on project and Stage-0 creates and on every demo operator operation; full resolution to READY TO SIGN through two sessions, untick and retick; sign-out and a stolen copy of the cookie both 401; sign-out then operator screens is 401, not the operator; malformed, unknown, ended and expired session cookies beside a valid operator cookie are 401; forged and duplicated operator cookies; an attacker's callback in a victim's browser (with or without its own attempt) fails and is spent; replay after success; callbacks without code or state; seven bad origins (including `null`, empty, a look-alike host and forged `X-Forwarded-*`) on six state-changing routes; undeclared redirect parameters; foreign or altered redirect URIs at authorize and approve; cross-origin approval; fixed redirect paths and all three `Set-Cookie` headers through the proxy; jose rejection of wrong nonce, issuer, audience, expired, too old, foreign key, `alg: none`, HS256 and tampered tokens; a failing token creates no account; the signed-in check; production registers no provider and imports no demo code.
- `tests/database/sessions.test.ts` (13): digest-only storage; fail-closed resolution; end once at database time; database creation time; no reassignment, extension, delete or truncate; attempts digest-only, consumed once under eight concurrent consumers, unknown when malformed, foreign or expired, pruned; guarded claim, including a concurrent two-party race.
- `tests/demo-browser/participants.test.ts`: operator invites; two 390-wide contexts accept, sign in on the test provider's page, see the signed-in band and no switch or operator control; only the Model sets her value; the operator enters the agreed value; both reach READY TO SIGN; ticks belong to two parties; a signed-in phone is refused the operator screens; sign-out leaves no mode; no horizontal scroll; no browser errors. Screenshots `test-results/demo/participants-*`.
- The journey and regression suites now run the real demo wiring and enter operator mode through its endpoint.
- Restated pins: operation lists, public classification, browser kinds, tables, runtime privileges, trigger functions, demo operation set, configuration.
- `tests/database/migration-upgrades.test.ts`: populated 0025 → current, rows unchanged, new tables empty with exact grants, catalog equal to fresh, rerun a no-op, a pre-existing invitation and account sign in.
- `tests/boot/boot.test.ts`: production refuses a plain-HTTP `PUBLIC_BASE_URL` off loopback without echoing it.
