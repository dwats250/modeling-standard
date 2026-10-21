# S13 continuation note — Google sign-in and synthetic staging

Date: 2026-10-20. Slice: `docs/slices/S13-google-staging.md`. Runbook and acceptance: `docs/engineering/S13-STAGING.md`.

## Baseline and dependency

- Branch `stage-1/s13-google-staging`, worktree `/home/dustin/Projects/modeling-standard-s13`, tmux session `ms-s13`.
- **Built on S12, not on `main`:** branched from `stage-1/s12-participant-access` at `da8003ed5683b2c6bcac5a3798d0bad6fb28ce5f` (PR #34: open, mergeable, checks `foundation` and GitGuardian passing at that head; not merged). `main` is `57f0b63`. Merge PR #34 first; this branch then contains only S13 on top of it.
- The plan commit from `planning/s13-google-staging` (`649f52a`) is carried as the branch's first commit, with its status line updated.

## Authorized technical choices (Dustin, 2026-10-20)

Google only on staging; test sign-in only in the local/LAN demo. Tailnet-only through Tailscale Serve, no Funnel. Separate staging database and service on 5435/3130 (both were free). S11, signatures, contracts, Apple and real use out of scope. Cory's questions stay open; operator acts stay labelled.

## Implementation decisions (Claude, technical)

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

**Accepted and documented:** cookie tossing from the port-80 site on the same host name (`__Host-` names recommended before anything beyond synthetic staging; `S13-STAGING.md`, Trust boundary).

## Verification in this environment (isolated test database 127.0.0.1:5436)

- `npm run check`: passed.
- `npm test`: 35 files, 536 tests passed.
- `npm run test:demo`: 4 files, 26 tests passed (Chrome, including `staging.test.ts` over HTTPS through a local TLS proxy).
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

## Running now

| What | Where | How to stop |
|---|---|---|
| S12 LAN demo (two-phone test, existing data) | `http://192.168.0.69:3120/`, tmux `ms-s12-demo` | `tmux kill-session -t ms-s12-demo` |
| Staging Postgres | 127.0.0.1:5435, `ms-staging-postgres` | `sg docker -c "docker stop ms-staging-postgres"` |
| S13 test Postgres (disposable) | 127.0.0.1:5436, `ms-s13-postgres` | `sg docker -c "docker rm -f ms-s13-postgres"` |
| S13 work shell | tmux `ms-s13` | — |

Untouched: the presentation demo (5432/3100), S10 (5433), S12's database (5434), Options Observatory on Tailscale Serve port 80, and the other worktrees.

## Next

1. Dustin: the Google and Tailscale steps in `S13-STAGING.md`, then start staging in tmux and run the external acceptance checklist.
2. Review and merge PR #34, then this branch (its PR is Dustin's and ChatGPT's to open).
3. Before anything beyond synthetic staging: `__Host-` cookie names or a dedicated host name.
