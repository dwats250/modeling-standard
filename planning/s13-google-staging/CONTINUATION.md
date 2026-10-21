# Continuation state, 2026-10-20 (after S12; before S13)

## Where things stand

- **S12** is on `stage-1/s12-participant-access` at `da8003ed5683b2c6bcac5a3798d0bad6fb28ce5f`, pushed. PR #34 (into `main`) is open, and its head is that commit. The worktree `/home/dustin/Projects/modeling-standard-s12` is clean. Nothing was interrupted: the test run killed mid-session (exit 137) was rerun to completion before the handoff, and the results are in `docs/engineering/S12-CONTINUATION.md`.
- **S11** is deferred and not started.
- **`main`** is at `57f0b63` (PR #33).
- **This plan** is on `planning/s13-google-staging`, branched from the S12 head and docs-only. Its worktree is `/home/dustin/Projects/modeling-standard-s13-plan`. No PR has been opened.
- **Other worktrees**, not touched: `modeling-standard-demo` (`planning/sprint-2026-10-21`), `modeling-standard-integration`, and `modeling-standard-s10`.

## Databases and ports on Asher

| What | Where | Owner |
|---|---|---|
| Presentation demo database | 127.0.0.1:5432 (`modeling-standard-demo-postgres-1`); demo port 3100 | presentation demo, do not touch |
| S10 database | 127.0.0.1:5433 (`ms-s10-postgres`) | S10 worktree, do not touch |
| S12 isolated database | 127.0.0.1:5434 (`ms-s12-postgres`): `modeling_standard` for tests, `modeling_standard_demo` for the demo (4 synthetic shoots, no accounts, at the time of writing) | S12 worktree |
| S12 LAN demo | `http://192.168.0.69:3120/` | started by the S12 session, see below |
| Tailscale Serve | `http://asher.tail457b97.ts.net/` (port 80, tailnet-only) serves `options-observatory/dashboard` | another project, do not change |
| Proposed staging | 127.0.0.1:3130, and Postgres `ms-staging-postgres` on 127.0.0.1:5435 behind `https://asher.tail457b97.ts.net:8443` | not created |

## The S12 LAN demo for the two-phone test

The S12 Claude session started it in the background, so it stops when that session ends. To run it yourself inside tmux from the S12 worktree:

```
cd /home/dustin/Projects/modeling-standard-s12
npm run demo:lan          # keeps existing data; prints http://192.168.0.69:3120/
# npm run demo:fresh -- --lan   only if you want the four shoots reset
```

Its `.env` (untracked) points at 5434 and sets `DEMO_PORT=3120`. Use Ctrl+C to stop it.

**Walkthrough:**

1. On a laptop, open `http://192.168.0.69:3120/` and choose **Continue as the demo operator**.
2. Go to **Demo** and choose **Shared, with values still open**, then **Create invitation links**.
3. Send the Model link to phone 1 and the Photographer link to phone 2. Both phones must be on the same Wi-Fi.
4. On each phone, choose **Continue with test sign-in** and pick a different invented name. Each phone lands on its own brief.
5. Phone 1 (Model) sets the coverage level.
6. On the laptop, open the brief and **Enter the agreed value** for each remaining row.
7. Each phone ticks its own terms, and both show **READY TO SIGN**.
8. Optional: open the Model link on a third browser. It is refused. **Sign out** on a phone, and it is left in no mode, not the operator.

The test sign-in is the local test provider. It is not Google, and it verifies nobody.

## Next build

See `PLAN.md`. Its prerequisites are listed under "What Dustin must supply". S13-A and S13-B can be built and fully tested before any of them exist. Only the manual acceptance run needs the Google client and the Tailscale HTTPS certificate.

## Starting the next build inside tmux

1. Open a fresh login shell in tmux, so that membership of the `docker` group applies.
2. Merge PR #34 first, or say to build on `da8003e`.
3. Create `stage-1/s13-google-staging` from that base in a new worktree. Do not build on the planning branch.
4. Read `PLAN.md` and record the build's decisions before coding, as S12 did.
5. Verify the baseline on an isolated database, so the presentation, S10 and S12 containers stay untouched.
