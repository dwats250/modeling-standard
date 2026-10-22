# S11 continuation note — final contract storage

Date: 2026-10-21. Slice: `docs/slices/S11-final-contract.md`. As built: `docs/engineering/S11-FINAL-CONTRACT.md`.

## Baseline

- Branch `stage-1/s11-final-contract`, worktree `/home/dustin/Projects/modeling-standard-s11`, from `main` at `52216b9` (S12 and S13 merged as PRs #34 and #35). Migrations `0028` (generated) and `0029` (hand-written).
- Scope: package §3.2 and AC-19/AC-20. No participant surface; the finalization is operator/test-only and labelled synthetic.
- Local database for this worktree only: a disposable Postgres 17 container `ms-s11-postgres` on `127.0.0.1:5437` (data on tmpfs, provisioned by `db/provision.sql`); the worktree's untracked `.env` points at it, with `DEMO_PORT=3150`. Nothing else (the demo on 5432/3100, S10 5433, S12 5434, staging 5435/3130, S13 5436) was touched.

## Open and do (from a clean clone)

```
git clone https://github.com/dwats250/modeling-standard.git && cd modeling-standard
git checkout stage-1/s11-final-contract
npm ci
cp .env.example .env            # set CHROME_PATH for test:demo
npm run db:up
npm run check
npm test
npm run test:demo
npm run build && test ! -e dist/demo
npm run demo:fresh -- --lan     # then, in the browser:
```

1. Operator: compose a two-person shoot, share it, **Create invitation links**.
2. Two other browser contexts (or a phone): open one link each, sign in with the test identity provider, resolve and tick to READY TO SIGN.
3. Operator: `/inspector`, pick the shoot, **Finalize as the operator (synthetic)**. The brief shows FINAL — SYNTHETIC and the stored contract: clauses, bound accounts, two chained signature records, "chain verifies", and each person's proposal rendering. The two participant screens now get the generic not-found.

## Verification record (this environment, 2026-10-21)

- `npm run check`: typecheck, lint, migration drift, identifiers — pass (drift after commit).
- `npm test`: 37 files, 581 tests, pass (baseline before S11: 36 files, 545).
- Migration upgrade (`tests/database/migration-upgrades.test.ts`, within `npm test`): a database populated at 0025 with a draft, a live ready brief and a frozen brief upgrades with every row unchanged; the frozen brief is then withdrawn, re-frozen and finalized, the live one frozen and finalized, and the draft untouched — pass.
- `npm run test:demo` (Chrome): 4 files, 26 tests, pass.
- `npm run build`: pass; `dist/` has `contracts/` and no `demo/`.
- Not run: the live LAN/phone walkthrough. The browser regression covers the inspector's finalization, and the HTTP test covers two signed-in sessions through to final.

## Unruled seams hit, left omitted

The visible signing act and no-means-no wording (D04); what each clause shows / affirmation display (package §7 Q2); signing order and any pending signature (§7 Q3); what a person sees while signing and after; participant-facing words for the record (D05); retention and erasure (D09, counsel); surname capture and archive references (D03).

## Next

Dustin reviews and owns the PR. Integration order: S11 sits directly on `main` (S12 and S13 are merged). The proposal rendering is what to show Cory with §7 Q1–Q3.
