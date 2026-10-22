# S13 continuation note — Google sign-in and synthetic staging

Date: 2026-10-20. Slice: `docs/slices/S13-google-staging.md`. Runbook and acceptance: `docs/engineering/S13-STAGING.md`.

## Baseline and dependency

- Branch `stage-1/s13-google-staging`, worktree `/home/dustin/Projects/modeling-standard-s13`, tmux session `ms-s13`.
- **Built on S12, not on `main`:** branched from `stage-1/s12-participant-access` at `da8003ed5683b2c6bcac5a3798d0bad6fb28ce5f` (PR #34: open, mergeable, checks `foundation` and GitGuardian passing at that head; not merged). `main` is `57f0b63`. Merge PR #34 first; this branch then contains only S13 on top of it.
- The plan commit from `planning/s13-google-staging` (`649f52a`) is carried as the branch's first commit, with its status line updated.

## Authorized technical choices (Dustin, 2026-10-20)

Google only on staging; test sign-in only in the local/LAN demo. Tailnet-only through Tailscale Serve, no Funnel. Separate staging database and service on 5435/3130 (both were free). S11, signatures, contracts, Apple and real use out of scope. Cory's questions stay open; operator acts stay labelled.

## Implementation decisions (technical)

- **Staging is the demo composition** (`src/demo/`, outside the build), not `src/main.ts`: production has no screens and no operator, and giving it either would answer Cory's open seams.
- **Google:** `openid` only, `prompt=select_account`, confidential client with PKCE, constants for endpoints and issuers (both documented spellings), jose remote JWKS. Production registers it when configured.
- **Config:** staging reads one owner-only env file (`~/.config/modeling-standard/staging.env`), nothing else from the environment. The database commands need only the database settings, so the database could be prepared before the Google client exists.
- **Operator key:** 32 random bytes, base64url, typed on the start screen, sent once in the POST body; the operator cookie stays the per-process secret.
- **Host pinning:** exact public authority instead of the S12 host-and-local-port rule (the proxy listens elsewhere).
- **No HSTS:** Options Observatory is served over plain HTTP on the same host name.
- **Callback:** spends the attempt when there is no code; clears the binding cookie only for the browser's own matched attempt (review finding).
- **Reset refuses while staging listens** (an idle pool holds no connection, so the database alone cannot tell; review finding).
- **Staging Postgres gets its own role passwords**, not the repository defaults (review finding).

## Adversarial review

A separate reviewer agent read the diff end to end. No high-severity defect. Fixed:

- **(medium)** The tests used staging's real database name: the library tests now use test-only names, and the command tests refuse to run if their server already has a staging database.
- **(low)** Reset while staging is idle-running.
- **(low)** A patterned operator key is now refused.
- **(low)** A cross-site visit to the callback could clear a sign-in in progress.

Speculative concerns hardened:

- The env file is opened once, without following symlinks.
- The key field no longer invites password saving.
- The database role passwords were rotated.

**Cookie tossing from the port-80 site on the same host name:** first accepted as a residual risk, then closed in the follow-up below.

## Verification in this environment (isolated test database 127.0.0.1:5436)

- `npm run check`: passed.
- `npm test`: 36 files, 545 tests passed (after the follow-up).
- `npm run test:demo`: 4 files, 26 tests passed (Chrome, including `staging.test.ts` over HTTPS through a local TLS proxy and the same-host plain-HTTP cookie test).
- `npm run build`: passed. `dist/` holds no demo, staging or test-issuer code.
- Built artifact with a Google client configured:
  - `/health` returns ok;
  - Google start for a non-invitation returns 404;
  - a foreign origin returns 403;
  - `/test-idp` returns 404;
  - the secret is not in the log.
- Staging on Asher:
  - `ms-staging-postgres` is up (127.0.0.1:5435, volume `ms-staging-pgdata`, restart `unless-stopped`, role passwords rotated, so the defaults are refused);
  - `~/.config/modeling-standard/staging.env` is written (mode 600, with the operator key);
  - `npm run staging:setup` created and migrated `modeling_standard_staging`;
  - `npm run staging:seed` loaded 4 shoots;
  - `npm run staging` refuses, as designed: the Google client is missing.

**Status:**

- **Implemented and locally verified:** everything above.
- **Not deployed:** no Tailscale Serve change, no certificate, staging not running.
- **Not verified against real Google:** the Google client does not exist yet; the callback URI is unverified until the console accepts it.
- **S12 two-phone LAN test:** still Dustin's to run on real phones.

## Follow-up (2026-10-20, after the first push)

**GitGuardian (PR #35, check "GitGuardian Security Checks", incident 38772493, "Generic High Entropy Secret").** It flags `tests/unit/google-provider.test.ts` line 21 in commit `80e4f77`. That line is the unit test's synthetic client secret: a readable phrase saying it is not real, written for the test, never a Google credential. No Google OAuth client existed then or exists now; the staging env file has no Google secret. The value was already re-represented in `06df8ff` (no Google-like prefix), and nothing in the current tree is flagged. The incident remains because GitGuardian scans every commit in the PR and `80e4f77` is shared history; it is not rewritten here. No revocation is needed. The repository has no GitGuardian configuration (no `.gitguardian.yaml`), so no established exception exists, and none was added. Closing the incident ("test credential" / false positive in the GitGuardian dashboard) is Dustin's to do; this session has no dashboard access.

**CI `foundation` failure on `06df8ff`:** the staging browser test found the invitation screen 2 px wider than 390 under CI's fonts: the staging pill ("Synthetic staging") could not wrap. It now wraps on staging only; no overflow even at 320 locally.

**`__Host-` cookies over HTTPS.** One setting (`secureCookies`: staging; production with an `https:` public origin) decides each cookie's wire form, written and read: `__Host-ms_session`, `__Host-ms_signin`, `__Host-ms_demo_operator`, `Secure`, `Path=/`, no `Domain`; bare names are never read over HTTPS. The plain-HTTP demo keeps bare names. The binding cookie's path moved from `/sign-in` to `/` (required by the prefix). Verified in Chrome: a plain-HTTP page on staging's host name cannot set the prefixed cookies, and the bare ones it does set change nothing.

**Google Testing status.** Google documents that an app asking only basic identity scopes (`openid`) is exempt from the test-user list and from the 7-day authorization expiry. The runbook, acceptance step 9 and the plan now say so; staging's boundaries are the tailnet, the invitations and the operator key. No scope and no account list was added.

**Test-isolation fix:** a participant-access test counted every sign-in attempt in the shared test database and raced the staging suite; it now counts only its own server's.

## Status check (2026-10-21)

Dustin authorized configuring tailnet-only Serve on HTTPS 8443 → 127.0.0.1:3130 once HTTPS is enabled, and starting staging in tmux `ms-staging`. Checked first; prerequisites still missing, so neither was done:

- Google client: not configured (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` still commented out in the env file).
- Tailscale HTTPS certificates: not enabled (`CertDomains` empty).
- Serve before any change (keep exactly): `TCP 80 HTTP`, `asher.tail457b97.ts.net:80` `/` → `/home/dustin/Projects/options-observatory/dashboard`; Observatory answers 200.
- Asher does not resolve its own `ts.net` name; verify from Asher with `curl --resolve asher.tail457b97.ts.net:8443:100.64.34.84 …`.
- GitGuardian incident 38772493 not yet dismissed (check still failing on `2b9fa95`).
- The repository now has a Process ownership rule (after an S12 demo was stopped by a broad `pkill`; it was restarted with its data intact).

## External setup progress (2026-10-21)

- Google console steps: done by Dustin (reported). Client credentials **not yet in the env file**. Helper for his own shell: `~/.config/modeling-standard/set-google-client.sh` (outside the repository; reads the secret without echo, validates both shapes, rewrites the file mode 600, prints no value).
- Tailscale HTTPS: enabled (`CertDomains` = `asher.tail457b97.ts.net`).
- Serve: `tailscale serve --bg --https=8443 http://127.0.0.1:3130` added. Port 80 (Options Observatory) unchanged and answering 200; 8443 tailnet only; no Funnel.
- Verified from Asher (`--resolve` to 100.64.34.84): certificate CN/SAN `asher.tail457b97.ts.net`, Let's Encrypt, valid to 2027-01-19, chain verifies. With a temporary probe of this task's own on 3130 (PID-stopped afterwards), Serve forwards `Host: asher.tail457b97.ts.net:8443` — the pinned authority — plus `X-Forwarded-*` and `Tailscale-User-*` headers, which staging does not read.
- Staging database intact: 4 shoots, 0 accounts, 0 bindings. Not reset or reseeded.
- Google credentials entered by Dustin with the helper: both present, both valid shapes, file mode 600 (values never read into output).
- **Staging started** in tmux `ms-staging` (`npm run staging`, cwd this worktree; PID 2985264 at start), listening on 127.0.0.1:3130 only. Not reset or reseeded.
- Verified from Asher through Serve (`https://asher.tail457b97.ts.net:8443`):
  - page 200, certificate verifies; no HSTS header;
  - `/demo/environment`: staging, providers `google` only, operator key required;
  - Host: anything but the pinned authority is 421 (including a forged `X-Forwarded-Host`);
  - Origin: a foreign or missing Origin on the operator POST is 403;
  - operator key: missing or wrong is 403 (logged as "operator key refused"); the right one is 200 and sets `__Host-ms_demo_operator` (`Path=/; HttpOnly; SameSite=Strict; Secure`) and clears `__Host-ms_session`;
  - the operator cookie works only under its `__Host-` name (bare name 401);
  - test identity provider absent (`/test-idp/authorize` 404, `provider: test` 404); Google start with an unknown invitation 404;
  - the log holds neither the client secret nor the operator key;
  - Options Observatory still 200 on port 80.
- **Not yet verified: real Google.** Google accepting the redirect URI and a real sign-in are exercised only by Dustin's phone run (acceptance steps in `S13-STAGING.md`).

## Phone access blocker (2026-10-21, resolved)

Resolved the same day: the Pixel loads `https://asher.tail457b97.ts.net:8443/` (first staging requests from it 19:13 UTC). No staging, Serve or Host-pin change was involved. The original notes follow.


- The Pixel (`pixel-10-pro`, 100.84.119.8) is on the tailnet and pings Asher directly. Its Chrome reports `DNS_PROBE_FINISHED_NXDOMAIN` for `https://asher.tail457b97.ts.net:8443/`, in every browser and in incognito; Dustin reports Options Observatory loads and that the phone's DNS settings are not the cause.
- On Asher: `Self.DNSName` matches `asher.tail457b97.ts.net` byte for byte. Tailscale's resolver (100.100.100.100) answers A 100.64.34.84, with empty AAAA and HTTPS answers. Public resolvers return NXDOMAIN, and the router (192.168.0.1) returns no address. Asher itself has `--accept-dns=false`, which is why checks from Asher use `curl --resolve` (that does not test DNS). The router resolves the short names `asher` and `asher.ht.home` to the LAN address 192.168.0.69.
- No request from the phone reached staging, and Serve opened no connection to 3130 while the phone retried.
- At Dustin's request the 8443 entry was removed and re-added (`tailscale serve --https=8443 off`, then `--bg --https=8443 http://127.0.0.1:3130`). Port 80 was untouched, and both answer 200 from Asher afterwards.
- Unresolved: which exact URL the phone uses for Observatory (it matters: a working lookup of the full name would not return NXDOMAIN for the same name on another port), and whether the re-added entry changes anything for the phone.

## Real-Google acceptance (2026-10-21 evening PDT = 2026-10-22 03:03–03:35 UTC)

Walkthrough by Dustin on tailnet devices (the Pixel; operator in a separate browser context). Observations are Dustin's report, cross-checked against the staging log (`tmux ms-staging`) and read-only database queries. Nothing was restarted, reset or reseeded; the records remain as synthetic test data.

| Runbook step (`S13-STAGING.md`) | Result | Evidence |
|---|---|---|
| 1 Serve 8443 → 3130, Observatory on 80 | pass | verified from Asher before the run (above) |
| 2 tmux banner | pass | `ms-staging` pane |
| 3 Page, valid certificate, staging band | pass, on the phone (no laptop is on the tailnet) | Dustin; certificate verified from Asher |
| 4 Operator key → operator mode; wrong key refused | pass | 03:03:12 `POST /demo/operator` 200; refusal 403 verified from Asher earlier |
| 5 Create invitation links | pass | 03:03:44 invitations 201 (shoot `190a09b3`); a second shoot `e4d7b382` at 03:29:36 |
| 6 Model link → real Google → own brief | **pass: Google accepted the redirect URI; callback completed** | 03:09:31 `/sign-in/start` 200 → 03:09:37 `/sign-in/callback` 303; binding created 03:09:37 |
| 7 Photographer link → second Google account | pass | 03:12:03 start 200 → 03:16:40 callback 303; binding 03:16:40 |
| 8 Open value, operator supplies the agreed value, ticks, READY TO SIGN | pass | Dustin: the Model's open value set; delivery date stayed "Decide together — still open" until the operator simulation settled it (03:34:23 `/demo/sim/…/settle` 200); both then ticked; READY TO SIGN shown; no signing control. Ticks from both parties recorded; brief phase still `live` (nothing froze or signed) |
| 9 Google account not listed as a test user; unverified-app warning | **not run** | only two Google accounts signed in; whether either is a listed test user, and whether any warning appeared, was not recorded |
| 10 Sign out, open the other person's link → already accepted | **not run** | no sign-out or 409 in the log (covered by fake-Google tests only) |
| 11 Cancel on Google's page | **not run** | both callbacks succeeded (covered by fake-Google tests only) |
| 12 Logs hold no client secret, operator key or `code=` | pass | whole pane searched by count only: 0 for each |
| 13 Cookie names in developer tools | **not inspected** | indirect: staging reads the session only under `__Host-ms_session` over HTTPS, and signed-in calls succeeded; the operator cookie's attributes were verified from Asher |
| 14 Reset | not done, by instruction | |

Database after the run: 2 accounts (`login_provider = google`), 4 bindings — each account bound to one party in each of the two shoots (`190a09b3`, `e4d7b382`); no sign-in attempts left over. On the second shoot both already-signed-in accounts accepted their links without a new Google round trip (`POST /invitations/claim` 200 ×2), as S12 specifies.

Expected refusals seen in the log: `GET /demo/projects` 401 from a browser not yet in operator mode, and 403 from a signed-in participant browser (a signed-in account is never the operator, S12-E).

**UX observation (recorded, not acted on).** Finding saved shoots was not obvious: the operator returned to the shoot list only through "Synthetic Staging → Back to start". This is demo-operator navigation; no change was made.

## Running now

| What | Where | How to stop |
|---|---|---|
| S12 LAN demo (two-phone test, existing data) | `http://192.168.0.69:3120/`, tmux `ms-s12-demo` | `tmux kill-session -t ms-s12-demo` |
| Staging Postgres | 127.0.0.1:5435, `ms-staging-postgres` | `sg docker -c "docker stop ms-staging-postgres"` |
| S13 test Postgres (disposable) | 127.0.0.1:5436, `ms-s13-postgres` | `sg docker -c "docker rm -f ms-s13-postgres"` |
| S13 work shell | tmux `ms-s13` | — |
| **Staging** | `https://asher.tail457b97.ts.net:8443/` (tailnet), 127.0.0.1:3130, tmux `ms-staging` | `tmux kill-session -t ms-staging` |
| Tailscale Serve 8443 → 3130 | tailnet only | `tailscale serve --https=8443 off` (never `reset`) |

Untouched: the presentation demo (5432/3100), S10 (5433), S12's database (5434), Options Observatory on Tailscale Serve port 80, and the other worktrees.

## Next

1. Optional, before or after merge (Dustin): the unrun runbook steps 9, 10, 11 and 13 on real Google. They are not merge blockers; 10 and 11 are covered by the fake-Google tests.
2. PR #34 (S12) and PR #35 (S13) are merged into `main`; S11 was subsequently integrated as PR #36. The remaining real-Google, Tailscale-phone and staging acceptance steps stay with Dustin and are not implied by the merges.
3. GitGuardian incident 38772493: ignored by Dustin in the dashboard as a test credential; the check passes on both PRs' current heads.
4. Staging stays up for further runs; stop with `tmux kill-session -t ms-staging` and `tailscale serve --https=8443 off` when no longer wanted.
