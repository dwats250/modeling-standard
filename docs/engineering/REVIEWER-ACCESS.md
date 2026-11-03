# Reviewer access: the synthetic demo over HTTPS, behind its own sign-in

Status: built and tested offline (2026-11-03); **not activated**. No proxy, certificate, tailnet policy or service was changed for it. Everything below the "Verified" line was checked by the automated tests against a task-owned PostgreSQL; everything under "Activation-only" is what someone running it would still have to do and observe.

**What this is.** `npm run demo:reviewer` serves the ordinary local synthetic demo (invented people, invented shoots, the local test sign-in that is not Google or Apple, the toolkit's two synthetic professionals, `modeling_standard_demo`) on loopback, so a local HTTPS reverse proxy such as Tailscale Serve can put it at one exact `https://` origin for a reviewer on another device. In front of every demo page and route sits a **reviewer gate**: the browser must first post a configured access key and receive a reviewer session.

**What this is not.** Not staging (`npm run staging`: Google sign-in, its own database, operator key), not production (`src/main.ts`), and not real use. Nothing here is in the production build; no reviewer route exists on staging or production. A reviewer session is not an account and not identity.

## Pieces

| Piece | Where |
|---|---|
| Configuration (exact origin, access key, session length; refuses Google, staging and the migration credential) and the gate (sessions, sign-in page, revocation) | `src/demo/reviewer.ts` |
| The gate's page style (no script) | `src/demo/ui/reviewer.css` |
| The gate runs after the Host check and before every page, file, test sign-in page and application request | `src/demo/server.ts` |
| The reviewer composition: the local shape at one pinned HTTPS origin with `Secure` `__Host-` cookies | `src/demo/application.ts` |
| Entry point, excluded from the production build | `src/scripts/demo-reviewer.ts`, `tsconfig.build.json` |
| Owner-only env file reader, shared with staging | `src/demo/staging.ts` (`readOwnerOnlyEnvFile`) |

## Trust boundary

```
reviewer's device ──HTTPS──▶ local TLS proxy (Tailscale Serve, :8444) ──HTTP──▶ 127.0.0.1:3140 npm run demo:reviewer ──▶ 127.0.0.1:<port> PostgreSQL, modeling_standard_demo
```

Three independent boundaries. Being inside one is not being inside the next.

1. **The network.** Who can reach the proxy at all is the proxy's and the tailnet's business. The application reads no `Tailscale-User-*`, `X-Forwarded-*` or `Forwarded` header: the demo server forwards only `content-type`, `cookie` and `origin` to the application, and the gate looks only at `Host`, `Origin`, `Cookie` and the form body. Those headers can neither widen Host or Origin nor sign anyone in (tested with every one of them forged).
2. **The reviewer gate.** `GET /reviewer` is the sign-in page. `POST /reviewer/sign-in` must carry `Origin` exactly equal to the configured origin and the key in the form body (a key in the query string is refused unread, 400). The key is compared as a SHA-256 digest in constant time; a malformed key is compared too. Success sets `__Host-ms_reviewer`: an opaque 32-byte token, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, with an absolute lifetime (default 4 h, `REVIEWER_SESSION_SECONDS` 60–43200). The server keeps only the token's digest and expiry, in memory. Without a valid session, `/`, `/inspector` and the test sign-in page redirect to `/reviewer` (303) and everything else is `401 reviewer_sign_in_required`, before any file is read or the application is asked. After ten refused keys within a minute, sign-in answers 429 without looking at the key, for the rest of that minute.
3. **The demo's own principals**, unchanged: a reviewer then chooses a synthetic professional, signs in as a test person from an invitation, or enters operator mode, exactly as on the local demo. All of those cookies are `__Host-` named, `Secure` and `HttpOnly` in this mode. Every POST to the application needs `Origin` exactly the configured origin (the S12 rule), and every POST carrying a cookie — which, behind the gate, is every POST — is refused otherwise (`403 cross_origin`).

The Host header must be exactly the configured authority (`host[:port]` as the browser sends it, case-insensitive), else 421 before the gate. No HSTS header is sent (the host name may serve other sites over plain HTTP, as on Asher).

## Revocation

- **One session:** `POST /reviewer/sign-out` from the gate's page ends it on the server; a copied cookie is dead from then on.
- **Every session:** stop or restart `npm run demo:reviewer`. Sessions live only in that process's memory; there is nothing to clean up and nothing that survives. Rotating the key is the same act: change `REVIEWER_ACCESS_KEY` in the env file and restart.
- **Expiry:** absolute, from sign-in; there is no sliding renewal.
- A reviewer session does not sign the browser out of the demo's own account or operator cookies, but without it none of them reaches the demo (tested). To end those too, use the demo's own sign-out, or restart (operator mode is per-process already).

## Runbook (activation; not done here)

1. Generate the key on the serving machine and keep it out of shell history:
   ```
   node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url") + "\n")' > /dev/tty
   ```
2. Create `~/.config/modeling-standard/reviewer.env`, `chmod 600`, owned by the user that runs the demo:
   ```
   DATABASE_URL=postgres://ms_runtime:<password>@127.0.0.1:<port>/modeling_standard
   HOST=127.0.0.1
   PORT=3140
   LOG_LEVEL=info
   REVIEWER_PUBLIC_ORIGIN=https://<name>.ts.net:8444
   REVIEWER_ACCESS_KEY=<the 43 characters from step 1>
   # REVIEWER_SESSION_SECONDS=14400
   ```
   The file must not contain `MIGRATION_DATABASE_URL`, `GOOGLE_CLIENT_*`, `PUBLIC_BASE_URL` or `STAGING_OPERATOR_KEY`; each is refused. The database name in `DATABASE_URL` is ignored in favour of `modeling_standard_demo`, and a URL naming `modeling_standard_staging` is refused. The server must be on TCP loopback.
3. Prepare the demo database as usual (`npm run demo:reset` with the repository `.env`, which is the only place the migration credential is used).
4. `npm run demo:reviewer` (or `MS_REVIEWER_ENV_FILE=<path> npm run demo:reviewer`). It prints the public gate address and never the key.
5. Point the local TLS proxy at `127.0.0.1:3140` for exactly `https://<name>.ts.net:8444`. For Tailscale Serve that is a `serve` rule on that port to that loopback target; **this record does not change any tailnet, Serve, Funnel or certificate setting**, and the port must not collide with staging's (8443). Funnel must stay off: the gate is a second lock, not a replacement for the tailnet.
6. Hand the key to the reviewer out of band (not in a URL, chat log or screenshot). They open `https://<name>.ts.net:8444/reviewer`.

Compromised-browser limits: whoever holds the reviewer cookie is a reviewer until expiry or revocation; whoever holds a demo session cookie is that synthetic account; whoever can read the env file holds the key. None of these is identity, and the demo holds nothing real.

## Threat model

| Threat | What stands in the way | Residual, honestly |
|---|---|---|
| A compromised Windows device on the tailnet, with or without the key | No key: the gate (every path 401/303; identity headers ignored). With the key: it is a reviewer of synthetic data; it can create, edit and finalize invented records in `modeling_standard_demo` and read the demo's labels. Sessions end on restart. | The device can do what a reviewer can. Revoke by restart; rotate the key. Nothing real is reachable: no uploads, no real accounts, no staging database. |
| HTTP input: malformed Host, Origin, paths, bodies | Host pinned exactly (421); Origin exact for the gate and every POST (403); bodies capped at 64 KiB (413); the application's strict schemas (400). | The static files and the test issuer are the demo's; nothing new parses input beyond the key form. |
| CSRF against the gate, the test IdP, operator mode, owner choice, toolkit writes | Exact-origin check on every one of them; `SameSite=Lax` cookies; `form-action 'self'` on the gate page. A cross-site form, a null origin or no origin is refused before the body. | A same-origin script could act: the demo pages are the only same-origin scripts, and CSP is `script-src 'self'`. |
| Session theft, replay, fixation, revocation | Opaque server-issued tokens only; a planted cookie is replaced, never adopted; duplicates, bare names, truncated or padded tokens are refused; sign-out kills the server record; restart kills all; absolute expiry. | A stolen cookie works until then. There is no device binding; the limit is the session length. |
| Authentication bypass | The gate runs before any file, page, fixture image, annotation, test IdP page or application route; only `/reviewer`, `/reviewer/sign-in`, `/reviewer/sign-out` and `/reviewer.css` precede it. Tested path by path, GET and non-GET. | `/health` is behind the gate too, so an external health check needs the proxy's own probe. |
| Cross-account access inside the demo | Unchanged from the local demo: a reviewer session is not a principal; the toolkit takes its owner from the session; two reviewers choosing A and B see only their own (tested, HTTP and browser). | A demo session cookie is a bearer credential; copying it between reviewers is possible by design of the synthetic harness (as on the local demo). |
| Lateral movement from the demo process | The process holds one database credential (`ms_runtime`, `app_runtime` group privileges only: no ownership, no DDL, grants per table from migrations) for one database; the migration credential is refused in its env file; it reads no other file than its env file and `.demo/annotations.json`. | Process and filesystem isolation (a dedicated user, a sandboxed service unit, read-only mounts) is **not** achieved by this change and is not claimed. See "Not solved here". |
| Database privilege escalation | Runtime role only; `tests/database/runtime-role.test.ts` pins what `app_runtime` can do. The reviewer server never connects as `ms_migrator` or `postgres`. | PostgreSQL itself listens on loopback for anyone with a local account on the machine, as for staging. |
| Environment, filesystem, developer credentials | Config comes only from the owner-only env file (regular file, `0600`, not a symlink, read through one descriptor); the process environment is not read for settings, so a worktree `.env` cannot redirect it; messages never echo values; the key is never logged, returned, or placed in a URL or cookie. | The env file is plain text on disk, readable by that user and root. |
| Denial of service, resource exhaustion | Sign-in throttle (10 refusals/min → 429, no key comparison); 64 KiB body cap; sessions pruned on sign-in and on count; Node's header limits. | No per-IP accounting (the proxy's address is the only one seen) and no limit on successful sessions; a key holder could create many. The demo's own operations are as cheap or costly as on the local demo. |

### Not solved here (operational limitations)

- **Process and filesystem isolation.** Code alone cannot give the process its own user, a read-only view of the repository, a private `/tmp`, or a service unit with `ProtectSystem`/`NoNewPrivileges`. Running it under a dedicated user with a dedicated env file would; that is an operations task on the serving machine and was not done.
- **The proxy.** Tailscale Serve (or any proxy) is outside this code. Its TLS configuration, its access policy and whether Funnel is off were not changed or verified by this work.
- **Rate limiting by source.** The server sees only the proxy's address and reads no forwarded address (by design), so throttling is global, not per client.

## Verified (automated, offline, task-owned database on 127.0.0.1:5461)

- `tests/unit/reviewer-config.test.ts`: exact-origin parsing (every malformed form refused), key format and entropy guard, refusal of Google, `PUBLIC_BASE_URL`, the migration credential, the staging key, the staging database name, a non-loopback `HOST`, bad session lengths; all problems reported at once; no value echoed.
- `tests/http/reviewer.test.ts`, over real HTTP through the real wiring: every protected path 303/401 before sign-in (GET, POST, PUT, DELETE); Host pinned (421) before the gate; forwarded and Tailscale identity headers (and `Authorization`, `X-Reviewer-Key`) admit nothing; wrong, malformed, oversized, empty, missing, JSON-bodied and query-string keys refused with no cookie and no key in logs; wrong, missing, `null`, plain-HTTP and portless origins refused; cookie flags exact; the session is opaque and not the key; forged, chosen, duplicated, bare-named, truncated and planted (fixation) cookies refused; sign-out kills a copied token; absolute expiry; `revokeAll` ends every session; the throttle and its recovery; inside: the local shape (toolkit, test provider, no Google), every cookie `__Host-` `Secure` `HttpOnly`, writes need the exact origin, bare-named cookies never read, two reviewers as A and B isolated, losing the reviewer session loses the demo, no HSTS, gate page CSP/`X-Frame-Options`/referrer policy, oversized sign-in body 413.
- `tests/demo-browser/reviewer.test.ts`, Chrome through a local HTTPS proxy with a per-run self-signed certificate that forges forwarding and Tailscale identity headers: a device with every header and no key is kept out and a wrong key refused on the page; two phones sign in with the key (cookie flags checked in the browser, key nowhere in page state), choose A and B, one saves a profile the other cannot see, one signs out of reviewer access and loses the demo, `revokeAll` ends the other mid-session; every request arrived at the public name; no browser errors.
- The existing suites still pass (`npm test`, `npm run test:demo`), including the pinned demo operation set (no operation was added: the gate is in the demo server, not an application route) and production's 404 for every demo route.

## Activation-only (not verified here)

- That Tailscale Serve forwards to the chosen loopback port with the exact `Host` the browser sends, on a port that does not collide with staging.
- That the reviewer's real device accepts the tailnet certificate and reaches the gate.
- The key hand-off and the reviewer's first sign-in.
- Behaviour under a real tailnet policy change; none was made.
