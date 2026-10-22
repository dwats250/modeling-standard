# S13 (proposed): Google sign-in and synthetic staging

Status: BUILT as S13 on `stage-1/s13-google-staging` (2026-10-20; see `docs/slices/S13-google-staging.md`). Below is the plan as written before the build; where the build differs, the slice and `docs/engineering/S13-STAGING.md` are authoritative.

Original status: PLAN. Not authorized and not built. Slice number S13 is a proposal (S11 stays deferred and keeps its number).
Base: `stage-1/s12-participant-access` at `da8003ed5683b2c6bcac5a3798d0bad6fb28ce5f` (PR #34, open). The build starts from `main` once PR #34 is merged, or from that commit if Dustin says to build on it unmerged.
Date: 2026-10-20

## Outcome

1. **Real Google sign-in.** A real Google account can open an invitation link and sign in through Google. The flow is the same one S12 already runs for the test provider: the attempt is bound to the browser, PKCE, the nonce and jose verification are unchanged, and the claim happens in the same transaction. Google is just one more `IdentityProvider`.
2. **Synthetic staging.** The synthetic demo (operator mode, invented shoots, invitations) can be reached from phones that are not on Asher's Wi-Fi, over HTTPS with a real certificate. Its operator mode is protected by a key, and it signs people in with Google instead of the test provider.

**What this does not do.** It does not open Gate 2 (D06). Everything on staging is synthetic, and Google sign-in is the door, not identity (D03, D11). Apple is not included: it needs the paid developer program and a domain. There is no public internet exposure, no paid service and no vendor choice.

## Product decisions relied on (none answered here)

- D03: an account is created by Google or Apple sign-in at the invitation, and sign-in is not identity. Exact recovery and credential mechanics are Dustin's. Apple is not built here; it is deferred as a technical prerequisite, not ruled out.
- D06: real use is authorized in sequence, and step 1 is exhaustive synthetic testing. Staging is step 1, not Gate 2.
- D11: verification stays separate. No step is built, and synthetic-demo verification stays open.
- S06: an account stores only `(login_provider, provider_subject)`. Google is asked for the `openid` scope only. No email, name or picture is requested or stored.

**Cory seams this build must not answer.** The wording of the Google button and of the staging banner (D05) will be marked as proposed. Who sends invitations, composes, shares and enters agreed values stays an operator act on staging. The counterparty's displayed identity is not taken from Google. The words for a claimed link stay as proposed in S12.

## What exists (S12) that this builds on

- `IdentityProvider` (`src/identity/provider.ts`): `authorizationUrl`, `exchangeCode` and `verification {issuer, audience, keys}`. `verifyIdToken` uses jose with RS256, the issuer, the audience, required `sub/iat/exp/nonce`, 60 s of clock skew and a maximum age of 10 min.
- Sign-in operations (`src/identity/operations.ts`): `POST /sign-in/start {provider, invitation}` and `GET /sign-in/callback?code&state`. Google's callback is a GET with `code` and `state`, so the route already fits.
- `PUBLIC_BASE_URL` (`src/config/config.ts`) accepts an https origin, or http on loopback. It sets the allowed origin and the `Secure` cookie flag.
- Production (`src/main.ts`) registers no provider and serves no screens. The only screens and the only operator are in the demo composition (`src/demo/`, which the build excludes). **So staging is a demo composition, not the production entry point.**
- The demo server pins `Host` to its allowed hosts and to the socket's local port, and the demo database must be on loopback (`src/demo/demo.ts`, `server.ts`). `POST /demo/operator` currently needs no key. That is correct on a LAN and wrong anywhere else.
- The screens hard-code `provider: 'test'` (`src/demo/ui/journey.js:1217`).

## Increments

### S13-A: Google provider (production code, in the build)

- `src/identity/google.ts` adds `createGoogleProvider({ clientId, clientSecret, fetch?, keys? })`.
  - Constants in source, never configuration: the authorization endpoint `https://accounts.google.com/o/oauth2/v2/auth`, the token endpoint `https://oauth2.googleapis.com/token`, the JWKS `https://www.googleapis.com/oauth2/v3/certs`, and the issuers `https://accounts.google.com` and `accounts.google.com` (Google documents both).
  - Authorization URL: `response_type=code`, `client_id`, `redirect_uri`, `scope=openid` only, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256` and `prompt=select_account`. The last one is so a shared phone is not silently the last account used.
  - Code exchange: a form POST with `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri` and `code_verifier`, using `AbortSignal.timeout(10 s)`. It requires a 200 JSON response with a string `id_token` and throws on anything else. It never logs the response body, the code or the secret.
  - Keys: jose `createRemoteJWKSet` (it caches keys, refreshes on an unknown `kid` and has a cooldown).
- `TokenVerification.issuer` becomes `string | readonly string[]` (jose accepts both). The test provider is unchanged.
- Config: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set together or not at all, and `PUBLIC_BASE_URL` is required when they are set. The client id is checked against `…apps.googleusercontent.com`. Neither value is ever echoed in errors or logs.
- `src/main.ts` registers Google when it is configured. Production still has no screens or operator, so this does not make production usable, and the plan does not try to.
- Tests: no test talks to Google. An injected `fetch` fakes the token endpoint, and an injected local JWKS signs tokens, so the real `verifyIdToken` path runs. The cases:
  - the exact authorization URL;
  - both issuer spellings accepted and any other refused;
  - a wrong audience, nonce or key, an expired token, `alg: none` and HS256 all refused;
  - token endpoint 400, 500, timeout, non-JSON and missing `id_token` each end at `/#/signin/failed` with nothing written;
  - the secret, code and token absent from captured logs;
  - the config combinations, without echoing values;
  - production registers Google only when configured, and still imports no demo code.

### S13-B: staging composition (outside the build)

- `npm run staging` (`src/scripts/staging.ts`) and `npm run staging:reset` reuse `createDemoApplication` with options for staging. They take these settings from the environment:
  - `STAGING_PUBLIC_ORIGIN`: https and not loopback, for example `https://asher.tail457b97.ts.net:8443`.
  - `STAGING_PORT`: for example 3130. The server listens on `127.0.0.1` only.
  - `STAGING_OPERATOR_KEY`: at least 32 random bytes, base64url.
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
  - `DATABASE_URL`: a loopback server. Staging uses its own database, `modeling_standard_staging`, a new constant, so `demo:reset` and the test suites can never touch it.
- **Host and origin.** The only host and port accepted are the public origin's own, because a TLS proxy forwards to a different local port, so the local-port rule is changed for staging only. The only allowed origin is the public origin. No forwarded header is read. The build must check what `Host` Tailscale Serve actually forwards and pin it from there.
- **Cookies.** `Secure` is on, because the origin is https. Names and `SameSite` are unchanged.
- **Operator mode needs the key.** `POST /demo/operator {key}` compares the key in constant time, and anything else gets the generic refusal. The LAN demo keeps its current one-tap entry. A 256-bit key makes rate limiting unnecessary.
- **Providers.** Staging registers Google only. `/test-idp/*` returns 404. Whether to also allow test sign-in on staging (so one person can run two phones without two Google accounts) is Dustin's choice. The default is off.
- **Screens.**
  - The invitation page asks a new public `GET /sign-in/providers` (it returns only provider ids) and offers the registered ones. The Google button text is marked as proposed wording.
  - The About screen and a banner say: synthetic staging, invented shoots, not for real collaborations, and sign-in is not verification. That wording is proposed too.
  - `/#/signin/failed` covers a refusal or cancel from Google.
- **`staging:reset`.** It requires `--confirm modeling_standard_staging`, then creates and migrates the database and seeds the same four synthetic shoots. Any Google-created accounts (which hold only a provider subject) go with it.
- Tests (HTTP, over the real staging composition with the fake Google endpoints):
  - a wrong Host, a right host on the wrong port, and a foreign origin are refused;
  - operator entry without a key, with a wrong key, or with an extra field is refused, and the right key works;
  - `/test-idp` returns 404;
  - cookies are `Secure`;
  - the providers endpoint;
  - the two-browser journey from S12 through Google-shaped sign-in with the fake endpoints;
  - the staging database guard (it refuses the demo database name and any non-loopback server).

### S13-C: runbook and acceptance (docs)

- `docs/engineering/S13-STAGING.md` covers:
  - the exact one-time setup on Asher (container, env file, migrations, Tailscale Serve command);
  - starting staging in tmux, resetting, stopping and wiping it;
  - where the logs go;
  - what to do if the certificate or Google refuses.
- **Acceptance run by Dustin, manual.** This is the only point at which "real Google sign-in verified" may be written down, and only by whoever ran it.
  1. A laptop on the tailnet enters operator mode with the key and creates invitations.
  2. Phone 1 (on the tailnet) opens the Model link, chooses Continue with Google, and signs in as test user 1.
  3. Phone 2 does the same for the Photographer as test user 2.
  4. Each phone acts only as its own party, and both reach READY TO SIGN.
  5. Signing out leaves no mode.
  6. A Google account that is not a listed test user: record what Google does (corrected 2026-10-20: with `openid` only, Google documents that such an account is expected to get through; see below).
  7. Reopening a link on another account gets `already_claimed`.

## Hosting: the smallest arrangement that fits

**Recommended: Asher itself, behind Tailscale Serve (tailnet-only HTTPS).** It costs $0, needs no new vendor, and keeps the existing server and PostgreSQL unchanged.

- Node runs `npm run staging` in tmux on `127.0.0.1:3130`. PostgreSQL 17 runs in its own container, `ms-staging-postgres`, on `127.0.0.1:5435` with a named volume. It is provisioned from `db/provision.sql` like the others, and is separate from S12's test container on 5434, the presentation container on 5432 and S10's on 5433.
- Tailscale is already installed and running on Asher, with MagicDNS on. The name is `asher.tail457b97.ts.net`. `ts.net` is on the Public Suffix List, which Google requires of redirect hosts, and Google never needs to reach the host: only the phone's browser does.
- **What is already on Asher's Tailscale Serve:** `http://asher.tail457b97.ts.net/` (port 80, tailnet-only) serves `/home/dustin/Projects/options-observatory/dashboard`. **That is another project, so staging must not take it over.** Staging uses its own HTTPS port, 8443: `tailscale serve --bg --https=8443 http://127.0.0.1:3130`. Tailnet HTTPS certificates are not enabled yet (`CertDomains` is empty).
- Cory's phone reaches it either by joining the tailnet or by having the Asher node shared with his tailnet, plus the Tailscale app.
- Limits: staging is up only while Asher is on and awake. There are no backups, which is acceptable for synthetic data only. The Wi-Fi is not involved, and traffic is TLS end to end to Asher.

Alternatives, not recommended now:

- **Tailscale Funnel**, the same setup but reachable from the public internet on 443, 8443 or 10000. It is only needed if a tester cannot install Tailscale. It exposes the staging origin publicly, so it would rely on the operator key and the invitation rules alone. That is Dustin's call.
- **A small hosted VM** running Node and PostgreSQL in Docker, with a TLS proxy and a domain. This is the later shape that `planning/D-technical-architecture.md` §8 describes (one image, managed PostgreSQL with backups, chosen when a stage needs it). It is paid, needs a domain, and belongs to the stage that chooses hosting. No vendor is named here.
- Cloudflare quick tunnels change URL on every run, so they cannot hold a registered Google redirect URI. Named tunnels need a domain.

## What can be implemented locally, and what Dustin must supply

**S13-A, S13-B and S13-C can be built and tested without any external account.** That includes every automated test above against fake Google endpoints, generating the operator key into a 0600 file outside the repository, and writing the runbook.

**Dustin must supply:**

1. **A Google Cloud project** (free). In the Google Auth Platform:
   - User type External.
   - App name and support email. **No logo**: a logo triggers brand verification.
   - Scopes: `openid` only.
   - Publishing status **Testing**.
   - Test users: the Google accounts that will sign in (Dustin's, Cory's, and a second account for two-phone runs). The limit is 100. *Corrected 2026-10-20:* Google documents that an app requesting only basic identity scopes (`openid`, `email`, `profile`) is exempt from the test-user list, shows those users no warning, and its authorizations do not expire after 7 days, so the list does not limit who can sign in to staging. Staging's boundaries are the tailnet, the invitations and the operator key (`docs/engineering/S13-STAGING.md`).
2. **An OAuth client** of type Web application, with these authorized redirect URIs:
   - `https://asher.tail457b97.ts.net:8443/sign-in/callback` (staging);
   - `http://localhost:3130/sign-in/callback` (optional, for a local check on Asher; Google exempts loopback from https).
   No JavaScript origins are needed. Google matches the redirect URI exactly.
3. **The client id and secret** on Asher only, in `~/.config/modeling-standard/staging.env` with mode 0600. They do not go in the repository or in chat.
4. **Tailscale.** In the admin console, enable HTTPS certificates (DNS page). The machine name then appears in public Certificate Transparency logs. Then run the `tailscale serve --https=8443 …` command above, or authorize that setup step. Also decide how Cory's phone joins: an invitation to the tailnet or node sharing (check your plan's user limit).
5. **Docker** for the shell that runs staging. `dustin` is in the `docker` group, but this session's process predates that and is denied the socket. A fresh login shell (the new tmux) will have it.
6. **Decisions that are Dustin's (technical):**
   - whether test sign-in is also offered on staging (default off);
   - Serve or Funnel;
   - whether to build on PR #34 before it merges;
   - the slice number.

## Risks and checks the build must make

- **Host forwarded by Tailscale Serve.** Confirm the proxy preserves `Host`, then pin it. If it does not, pin on the forwarded authority only after checking that Serve overwrites rather than appends.
- **Clock on Asher.** It is checked by `iat`/`exp` with 60 s of skew, so keep NTP on.
- **Google refusals** (wrong redirect URI, cancelled consent) all land on `/#/signin/failed`, and nothing is written.
- **Real Google subjects stored on staging.** These are testers' accounts on synthetic data. `staging:reset` wipes them. This is not Gate 2, and no real collaboration may run there.
- Do not change Tailscale Serve's existing port-80 configuration, the presentation demo (5432/3100), S10 (5433) or S12's test database (5434).

## Sources consulted (2026-10-20)

- Google OpenID Connect: issuers, endpoints, JWKS, nonce and RS256. https://developers.google.com/identity/openid-connect/openid-connect
- Google OAuth for web server apps: redirect URI rules (https except loopback, no raw IP, TLD on the Public Suffix List, exact match). https://developers.google.com/identity/protocols/oauth2/web-server
- Google Cloud help, Manage App Audience: Testing status is limited to 100 test users and test authorizations expire after 7 days, except for apps requesting only basic identity scopes (openid, email, profile), whose users need not be listed and whose authorizations do not expire after 7 days. https://support.google.com/cloud/answer/15549945 (the earlier link, answer 10311615, is now the Branding page).
- Google Identity, Using OAuth 2.0: Testing-status refresh tokens expire in 7 days unless only name, email and profile scopes are requested. https://developers.google.com/identity/protocols/oauth2
- Public Suffix List: it contains `ts.net`. https://publicsuffix.org/list/public_suffix_list.dat
- Asher, observed read-only: `tailscale status` and `tailscale serve status`.
