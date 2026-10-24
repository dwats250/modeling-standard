# S13: Google sign-in and synthetic staging — as built, runbook and acceptance

> **Acceptance status:** The recorded real-Google walkthrough was partial. See [S13-CONTINUATION.md](S13-CONTINUATION.md) for observed results and remaining unverified steps. A successful staging walkthrough does not authorize real use.

Slice: `docs/slices/S13-google-staging.md`. Plan: `planning/s13-google-staging/PLAN.md`. Continuation: `docs/engineering/S13-CONTINUATION.md`.

**What this is not.** Staging is synthetic: invented shoots, operator acts labelled as such, no real collaboration (D06 step 1; Gate 2 stays closed). Google sign-in is the door, not identity, and verifies nobody (D03, D11). Apple is not built. The automated tests use a fake Google; **real Google sign-in is verified only by the manual acceptance run below**, by whoever runs it.

## What exists

| Piece | Where |
|---|---|
| Google provider: authorization URL (`openid` only, PKCE S256, state, nonce, `prompt=select_account`), code exchange (POST, 10 s timeout, no redirects, errors carry no code/secret/body), Google's JWKS (jose, cached) | `src/identity/google.ts` |
| Issuer may be several spellings (Google documents `https://accounts.google.com` and `accounts.google.com`) | `src/identity/provider.ts` |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`: both or neither; with them `PUBLIC_BASE_URL` is required; values never echoed | `src/config/config.ts` |
| Production registers Google only when configured (it still has no screens and no operator) | `src/main.ts` |
| A callback without a code (cancel, provider error) spends its attempt; the binding cookie is cleared only for the browser's own matched attempt | `src/identity/operations.ts` |
| Staging composition: Google only (no test provider), one allowed origin, `__Host-` cookies, operator key | `src/demo/application.ts`, `src/demo/operations.ts` |
| Cookie wire form, both ways: over HTTPS (staging; production with an `https:` `PUBLIC_BASE_URL`) `__Host-` names with `Secure`, `Path=/` and no `Domain`, and only those names are read; on the plain-HTTP local/LAN demo bare names | `src/http/cookies.ts` (one `secure` setting, passed to the principal resolvers and the operation boundary) |
| Host pinned to the public authority exactly; only `content-type`, `cookie`, `origin` reach the application | `src/demo/server.ts` |
| Staging config and env file (owner-only, no symlink, read through one descriptor) | `src/demo/staging.ts` |
| Setup (create if missing + migrate), seed (empty only), reset (confirmed; refuses while staging listens) | `src/demo/reset.ts`, `src/scripts/staging-*.ts` |
| Screens: staging band, operator-key form, "Continue with Google", staging wording in About and the signed-in band | `src/demo/ui/journey.{js,css}` |

All of `src/demo/` and the four staging scripts are excluded from the production build (`tsconfig.build.json`); `src/identity/google.ts` is in it.

## Trust boundary

```
phone (tailnet) ──HTTPS──▶ Tailscale Serve on Asher (TLS, :8443) ──HTTP──▶ 127.0.0.1:3130 npm run staging ──▶ 127.0.0.1:5435 ms-staging-postgres
```

- Staging listens on loopback only; the only thing in front of it is Tailscale Serve on the same machine.
- The `Host` header must be exactly the public authority (`asher.tail457b97.ts.net:8443`, case-insensitive), else 421 before anything is read. No `X-Forwarded-*`, `Forwarded` or `Tailscale-User-*` header is read; none can widen Host or Origin.
- Every state-changing browser request needs `Origin` exactly `https://asher.tail457b97.ts.net:8443` (S12 rule), else 403.
- Cookies are `__Host-ms_session`, `__Host-ms_signin` and `__Host-ms_demo_operator`: `HttpOnly`, `Secure`, `Path=/`, no `Domain`; session and sign-in `SameSite=Lax` (the return from Google is a top-level GET), operator `Strict`. Staging reads only these names: a bare `ms_session`, `ms_signin` or `ms_demo_operator` is ignored, never a fallback.
- No HSTS header: the same host name serves another site over plain HTTP on port 80 (Options Observatory), which HSTS would break.
- Anyone with a local account on Asher is inside the boundary (they can reach 127.0.0.1:3130 and 5435 directly). The staging database's role passwords are not the repository defaults (set at provisioning, held in the env file).

**Same host name over plain HTTP (closed).** Cookies are not port-isolated, so content served from `http://asher.tail457b97.ts.net/` (port 80, Options Observatory) could set cookies for staging's host if it were attacker-controlled ("cookie tossing"). Browsers accept a `__Host-` cookie only from a secure origin, with `Secure`, `Path=/` and no `Domain`, so that site can neither set nor shadow staging's cookies; the bare names it can set are never read. Verified in Chrome by `tests/demo-browser/staging.test.ts` (a plain-HTTP page on the same name tries both). The sign-in binding cookie moved from `Path=/sign-in` to `Path=/`, which `__Host-` requires.

**Who can get in.** Google decides only *which Google account* is signing in, not *whether* it may: with only `openid` requested, Google lets any Google account through a Testing-status app, listed test user or not (see Google, step 3). Staging's access boundaries are:

1. **The tailnet:** staging is reachable only from devices on this tailnet, through Tailscale Serve (no Funnel).
2. **Invitations:** a signed-in account sees nothing except a shoot whose invitation link it accepted, and an accepted link belongs to the first account that accepted it.
3. **The operator key:** only someone who types it gets operator mode.

Staging has no list of permitted Google accounts, and none is added here.

## One-time setup on Asher

Already done in this session (2026-10-20), listed so it can be repeated:

```
# Postgres for staging only: own container, own volume, loopback, restarts with Docker.
docker volume create ms-staging-pgdata
docker run -d --name ms-staging-postgres --restart unless-stopped \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$(openssl rand -hex 24)" \
  -p 127.0.0.1:5435:5432 -v ms-staging-pgdata:/var/lib/postgresql/data \
  -v "$PWD/db/provision.sql:/docker-entrypoint-initdb.d/provision.sql:ro" postgres:17
# Replace the repository's default role passwords (keep the new ones for the env file):
docker exec -i ms-staging-postgres psql -U postgres -c "ALTER ROLE ms_runtime PASSWORD '<new>'" -c "ALTER ROLE ms_migrator PASSWORD '<new>'"
```

In this tmux, Docker needs `sg docker -c "…"` (the tmux server predates the `docker` group membership).

The env file `~/.config/modeling-standard/staging.env` (mode 600, never committed) holds: `DATABASE_URL` and `MIGRATION_DATABASE_URL` (5435, the new passwords), `HOST=127.0.0.1`, `PORT=3130`, `PUBLIC_BASE_URL=https://asher.tail457b97.ts.net:8443`, `LOG_LEVEL=info`, `STAGING_OPERATOR_KEY` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`), and — once Google exists — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Another path: `MS_STAGING_ENV_FILE=/path`. Staging reads nothing else from the environment, so a worktree's `.env` never applies.

```
npm run staging:setup     # create modeling_standard_staging if missing; apply migrations. Never drops; rerun after every update.
npm run staging:seed      # load the four synthetic shoots, only into an empty database.
```

## Google (Dustin)

1. Google Cloud console → Google Auth Platform (create a project if asked, e.g. "modeling-standard-staging"; free).
2. **Branding:** app name, user support email, developer contact. No logo (a logo triggers brand verification).
3. **Audience:** user type External; publishing status **Testing**. Adding **Test users** (yours, Cory's, a second account for two-phone runs; up to 100) is harmless but does **not** restrict who can sign in: Google documents that an app asking only for basic identity scopes (`openid`, `email`, `profile` or their OpenID Connect equivalents) is exempt from the test-user list, shows no unverified-app warning for them, and its authorizations do not expire after 7 days ([Manage App Audience](https://support.google.com/cloud/answer/15549945); [Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2), refresh-token expiration). Staging asks only `openid`, so any Google account can complete Google's step; who gets in is decided by the tailnet, the invitation and the operator key (Trust boundary). Staging uses no refresh token in any case.
4. **Data access:** add no scopes (the app asks only `openid`).
5. **Clients → Create client → Web application.** Authorized redirect URI, exactly: `https://asher.tail457b97.ts.net:8443/sign-in/callback`. No JavaScript origins. Create.
6. The **client secret is shown once**: put the client id and secret straight into `~/.config/modeling-standard/staging.env` as `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=` (uncomment the two lines). Not into the repository, a chat or a ticket. Lost: add a new secret on the client page, replace it in the file, delete the old one.
7. Whether Google accepts this redirect URI is **unverified until the console accepts it**. Redirect URI changes can take minutes to hours to apply.

## Tailscale (Dustin)

1. Admin console → **DNS**: MagicDNS is on (it is). Under **HTTPS Certificates**, **Enable HTTPS**. This publishes machine names (e.g. `asher.tail457b97.ts.net`) in public Certificate Transparency logs.
2. On Asher: `tailscale serve --bg --https=8443 http://127.0.0.1:3130`. This adds port 8443 and leaves the existing port-80 Options Observatory entry as it is. Check with `tailscale serve status`. Remove later with `tailscale serve --https=8443 off`. Never `tailscale serve reset` (it would remove Options Observatory too).
3. Each phone: the Tailscale app, signed in to this tailnet (Cory: invite him to the tailnet or share the `asher` machine with him; check your plan's user limit). Staging is not on the public internet (no Funnel).

## Start, keep alive, stop

Staging must not live inside a coding-agent process. Either:

**tmux (simplest):**
```
tmux new-session -d -s ms-staging -c /home/dustin/Projects/modeling-standard-s13 'npm run staging'
tmux attach -t ms-staging      # logs; detach with Ctrl+B D
tmux kill-session -t ms-staging   # stop
```

**systemd user service (survives logout and reboot; optional):** `~/.config/systemd/user/ms-staging.service`
```
[Unit]
Description=Modeling Standard synthetic staging
After=network-online.target

[Service]
WorkingDirectory=/home/dustin/Projects/modeling-standard-s13
ExecStart=/usr/bin/env npm run staging
Restart=on-failure

[Install]
WantedBy=default.target
```
then `systemctl --user daemon-reload && systemctl --user enable --now ms-staging` and `loginctl enable-linger dustin`. Logs: `journalctl --user -u ms-staging -f`.

Starting staging never resets, migrates or seeds. It refuses to start without the complete configuration (https public origin, Google client, operator key) or without a migrated staging database. Logs are JSON on stdout: no credentials, codes, states, tokens or the operator key are logged.

**After pulling a new version:** stop staging, `npm ci`, `npm run staging:setup`, start.

**Start over (deletes every account, session and invitation on staging):** stop staging, then `npm run staging:reset -- --confirm modeling_standard_staging`. It refuses without that exact confirmation and while anything listens on port 3130. It touches only `modeling_standard_staging`.

## Acceptance — external, manual (Dustin)

Record who ran it, when, on which devices, and the outcome of each step. Only this run may be described as "verified against real Google".

1. `tailscale serve status` shows `https://asher.tail457b97.ts.net:8443` → `http://127.0.0.1:3130`; Options Observatory still on port 80.
2. `tmux attach -t ms-staging` shows the start banner with the public URL.
3. On a laptop in the tailnet, open `https://asher.tail457b97.ts.net:8443/`: valid certificate, the staging band. If the page is a `misdirected_request` (421), Serve is not forwarding the public Host: stop and report (do not loosen the Host pin).
4. Type the operator key (from the env file) → operator mode. A wrong key is refused.
5. Demo → **Shared, with values still open** → **Create invitation links**.
6. Phone 1 (tailnet) opens the Model link → **Continue with Google** → Google's account chooser → test user 1 → lands on its brief, "Signed in as Model".
7. Phone 2 opens the Photographer link → test user 2 → "Signed in as Photographer".
8. Phone 1 sets the coverage level; the laptop enters the agreed value; each phone ticks its terms; both show **READY TO SIGN**.
9. A third Google account that is **not** a listed test user, on a tailnet device, signing in from a fresh invitation link: record what Google does. Per Google's documentation of the basic-scope exception it is expected to be let through to staging, which then binds it to that link like anyone else; that is not a staging defect. Record also whether Google shows an unverified-app warning to any account.
10. Phone 2 signs out, then opens the Model link and signs in as test user 2: **already accepted** (the link belongs to test user 1).
11. Cancel on Google's page: "Sign-in didn't finish", nothing created.
12. The logs (`tmux attach`) contain no client secret, no operator key and no `code=`.
13. In the phone's or laptop's browser developer tools (Application → Cookies), staging's cookies are named `__Host-ms_session` (and `__Host-ms_demo_operator` on the laptop), `Secure`, path `/`, no domain attribute.
14. Afterwards, if wanted: `npm run staging:reset -- --confirm modeling_standard_staging` (removes the testers' Google subjects).

## Tests (fake Google; no claim about real Google)

- `tests/unit/google-provider.test.ts` (22): the exact authorization request; the token request's fields, endpoint and `redirect: error`; nine token-endpoint failures fail closed without code, secret or body in the error; both issuer spellings accepted; another issuer, a trailing-slash issuer, another audience, nonce, expired, too old, unpublished key, `alg: none`, HS256 and a tampered payload refused.
- `tests/http/staging.test.ts` (28, real HTTP through the staging wiring): environment; Host pinned (nine wrong hosts); forged forwarding headers ignored; no test provider; no HSTS; operator key refused when missing, wrong, malformed, oversized, in the query or from another origin, accepted only in the body, cookie `__Host-ms_demo_operator`, `Path=/; HttpOnly; SameSite=Strict; Secure` and not the key; two people sign in with their own Google accounts and see their own parties; only provider and subject stored; reopening as the same account, refusal for another; seven Google failures each create nothing and spend the attempt; cancel spends it; an attacker's callback in a victim's browser fails; stray callbacks leave a sign-in in progress alone; replay fails; an invitation-shaped string starts nothing; every cookie `__Host-` named with `Path=/`, no `Domain`; the operator secret, a real session token or a sign-in binding under its bare name authenticates nobody, and a tossed bare session neither overrides a real one nor demotes the operator; sign-out clears `__Host-ms_session` and ends the session; a duplicated prefixed binding fails closed; logs hold no key, secret, code, state or credential.
- `tests/database/staging-database.test.ts` (21): configuration refusals without values; env file ownership, mode, symlink, directory; loopback-only and admin-database guards; setup, seed, setup again keeps rows, seed refuses, reset; the commands: setup and seed, reset's confirmation, database commands without Google, a readable env file refused, staging serving existing data unchanged and answering only the public Host, reset refused while staging listens, start refused without a database. It refuses to run if its server already has a staging database.
- `tests/demo-browser/staging.test.ts`: Chrome over HTTPS through a local TLS proxy that keeps Host and adds forwarding and Tailscale identity headers (as Serve would); Google's pages intercepted and answered by the fake. The operator enters with the key (a wrong one refused, the field cleared, the key nowhere in the address, cookies, storage or inputs); two 390-wide phones see only "Continue with Google", sign in, have exactly one cookie each, `__Host-ms_session` (`Secure`, `HttpOnly`, `Path=/`, host-only); a plain-HTTP page on the same host name sets prefixed and bare cookies by header and by script: Chrome refuses every `__Host-` one, the bare ones (holding the other person's session and the operator secret) land but change nothing (the model is still the model; a fresh phone is nobody); they resolve to READY TO SIGN with their own ticks; sign-out leaves no mode and no session cookie, and the session token no longer works; every request reached staging under the public name. Screenshots `test-results/demo/staging-*`.
- `tests/boot/boot.test.ts`: production refuses an incomplete Google client or one without `PUBLIC_BASE_URL`, without echoing values; with a complete one it sends a real invitation to Google's authorization endpoint with `openid` only and a `__Host-ms_signin` binding cookie (`Path=/`, `Secure`), and still has no test provider, operator or demo route.
- `tests/unit/config.test.ts`: the Google configuration combinations.
- `tests/unit/cookies.test.ts`: the wire form for each setting; a `__Host-` cookie refuses any path but `/`; each setting reads only its own names.
- `tests/database/sessions.test.ts`: over HTTPS only `__Host-ms_session` resolves; bare, lower-cased, `__Secure-` and duplicated names are nobody.
