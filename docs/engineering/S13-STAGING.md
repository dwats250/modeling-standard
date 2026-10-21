# S13: Google sign-in and synthetic staging — as built, runbook and acceptance

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
| Staging composition: Google only (no test provider), one allowed origin, `Secure` cookies, operator key | `src/demo/application.ts`, `src/demo/operations.ts` |
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
- Cookies are `HttpOnly`, `Secure`; session and sign-in `SameSite=Lax` (the return from Google is a top-level GET), operator `Strict`.
- No HSTS header: the same host name serves another site over plain HTTP on port 80 (Options Observatory), which HSTS would break.
- Anyone with a local account on Asher is inside the boundary (they can reach 127.0.0.1:3130 and 5435 directly). The staging database's role passwords are not the repository defaults (set at provisioning, held in the env file).

**Residual risk, accepted for synthetic staging (from the adversarial review):** cookies are not port-isolated, so content served from `http://asher.tail457b97.ts.net/` (port 80) could set cookies with staging's names ("cookie tossing") if that content were attacker-controlled. `__Host-` cookie names would close this and would touch S12's cookie paths; it is recommended before anything beyond synthetic staging, or move staging to its own host name.

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
3. **Audience:** user type External; publishing status **Testing**; **Test users:** the Google accounts that will sign in (yours, Cory's, a second account for two-phone runs). Up to 100; a test user's consent lasts 7 days, then the consent screen shows again.
4. **Data access:** add no scopes (the app asks only `openid`).
5. **Clients → Create client → Web application.** Authorized redirect URI, exactly: `https://asher.tail457b97.ts.net:8443/sign-in/callback`. No JavaScript origins. Create.
6. The **client secret is shown once**: put the client id and secret straight into `~/.config/modeling-standard/staging.env` as `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=` (uncomment the two lines). Not into the repository, a chat or a ticket. Lost: add a new secret on the client page, replace it in the file, delete the old one.
7. Whether Google accepts this redirect URI is **unverified until the console accepts it**. Redirect URI changes can take minutes to hours to apply.

## Tailscale (Dustin)

1. Admin console → **DNS**: MagicDNS is on (it is). Under **HTTPS Certificates**, **Enable HTTPS**. This publishes machine names (e.g. `asher.tail457b97.ts.net`) in public Certificate Transparency logs.
2. On Asher: `tailscale serve --bg --https=8443 http://127.0.0.1:3130`. This adds port 8443 and leaves the existing port-80 Options Observatory entry as it is. Check with `tailscale serve status`. Remove later with `tailscale serve --https=8443 off`. Never `tailscale serve reset` (it would remove Options Observatory too).
3. Each phone: the Tailscale app, signed in to this tailnet (Cory: invite him to the tailnet or share the `asher` machine with him; check your plan's user limit). Staging is not on the public internet (no Funnel).

## Start, keep alive, stop

Staging must not live inside a Claude process. Either:

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
9. A third Google account that is not a listed test user is refused by Google.
10. Phone 2 signs out, then opens the Model link and signs in as test user 2: **already accepted** (the link belongs to test user 1).
11. Cancel on Google's page: "Sign-in didn't finish", nothing created.
12. The logs (`tmux attach`) contain no client secret, no operator key and no `code=`.
13. Afterwards, if wanted: `npm run staging:reset -- --confirm modeling_standard_staging` (removes the testers' Google subjects).

## Tests (fake Google; no claim about real Google)

- `tests/unit/google-provider.test.ts` (22): the exact authorization request; the token request's fields, endpoint and `redirect: error`; nine token-endpoint failures fail closed without code, secret or body in the error; both issuer spellings accepted; another issuer, a trailing-slash issuer, another audience, nonce, expired, too old, unpublished key, `alg: none`, HS256 and a tampered payload refused.
- `tests/http/staging.test.ts` (24, real HTTP through the staging wiring): environment; Host pinned (nine wrong hosts); forged forwarding headers ignored; no test provider; no HSTS; operator key refused when missing, wrong, malformed, oversized, in the query or from another origin, accepted only in the body, cookie `Secure; HttpOnly; SameSite=Strict` and not the key; two people sign in with their own Google accounts and see their own parties; only provider and subject stored; reopening as the same account, refusal for another; seven Google failures each create nothing and spend the attempt; cancel spends it; an attacker's callback in a victim's browser fails; stray callbacks leave a sign-in in progress alone; replay fails; an invitation-shaped string starts nothing; logs hold no key, secret, code, state or credential.
- `tests/database/staging-database.test.ts` (21): configuration refusals without values; env file ownership, mode, symlink, directory; loopback-only and admin-database guards; setup, seed, setup again keeps rows, seed refuses, reset; the commands: setup and seed, reset's confirmation, database commands without Google, a readable env file refused, staging serving existing data unchanged and answering only the public Host, reset refused while staging listens, start refused without a database. It refuses to run if its server already has a staging database.
- `tests/demo-browser/staging.test.ts`: Chrome over HTTPS through a local TLS proxy that keeps Host and adds forwarding and Tailscale identity headers (as Serve would); Google's pages intercepted and answered by the fake. The operator enters with the key (a wrong one refused, the field cleared, the key nowhere in the address, cookies, storage or inputs); two 390-wide phones see only "Continue with Google", sign in, see only themselves with `Secure` session cookies, resolve to READY TO SIGN with their own ticks; sign-out leaves no mode; every request reached staging under the public name. Screenshots `test-results/demo/staging-*`.
- `tests/boot/boot.test.ts`: production refuses an incomplete Google client or one without `PUBLIC_BASE_URL`, without echoing values; with a complete one it sends a real invitation to Google's authorization endpoint with `openid` only and a `Secure` binding cookie, and still has no test provider, operator or demo route.
- `tests/unit/config.test.ts`: the Google configuration combinations.
