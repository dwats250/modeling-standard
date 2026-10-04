# Modeling Standard

Modeling Standard is being redesigned from first principles.

This repository intentionally begins with product planning rather than application code. The previous Replit application (`seeravenproductions/ShootBriefGenerator`) is not being migrated or ported. It remains historical evidence only.

## Current state

**Planning / owner review. No product behaviour has been built.** The planning package was reconciled on 2026-10-02 after an adversarial review (`planning/RECONCILIATION-REPORT.md`). The Stage 0 engineering foundation (product-neutral, synthetic data only) is described in `docs/engineering/STAGE-0.md`.

## Product authority

Cory's vision is the sole product authority. Nothing in this repository is a product decision unless Cory has made it; the documents say so line by line.

## Operating rule

- **Cory** owns product direction.
- **Dustin** owns technical orchestration, repository control and merge authority.
- **Fable** supports planning, creative and product architecture, and PRD work.
- **Opus** supports bounded implementation from an approved PRD.
- **Astra** may perform adversarial review.
- Agents do not resolve Cory-owned product seams. An open product question stays open until Cory answers it; "configurable later" does not authorize a default now.
- Human review occurs at material product boundaries and at every merge.

This is the whole operating model. The prototype repository's `GOVERNANCE.md`, `PROJECT-ROLES.md` and `CLAUDE.md` describe a migration-era arrangement (one agent interface, an acting migration lead) and do not govern this repository; they stay where they are as history.

## Start here

1. `planning/README.md`
2. `planning/RECONCILIATION-REPORT.md` for what changed in the reconciliation and why
3. `planning/H-cory-decision-packet.md` for the decisions that are Cory's
4. The other A to I planning documents as desired
5. `planning/REVIEW-FINDINGS.md` and `planning/ASTRA-REVIEW.md` for the two reviews

## Provenance

Every claim in the planning documents carries one of five tags. A tag is never upgraded by repetition, by plausibility, or because later documents depend on it.

- **[R]** Ratified Cory direction: stated as approved in `VISION.md` or `PRODUCT-DOCTRINE.md` of the prototype repository.
- **[R-prov]** Appears in a ratified document but is marked PROVISIONAL there. It keeps that status.
- **[CA]** Cory-attributed direction recorded only in a document that was not itself ratified.
- **[F]** Fable recommendation, interpretation or proposed mechanism.
- **[OPEN]** Unresolved product decision.

Primary sources are pinned at `seeravenproductions/ShootBriefGenerator` commit `bfbf5f1`: `docs/VISION.md` and `docs/PRODUCT-DOCTRINE.md`. Citations of the form `DOCTRINE:56` or `VISION:374` are line numbers in those files at that commit. `CORY-QUESTIONS:n`, `COST-REALITY:n` and `FEATURE-REVIEW:n` are line numbers in `docs/CORY-QUESTIONS.md`, `docs/COST-REALITY-2026-07.md` and `docs/FEATURE-REVIEW-2026-07-17.md` at the same commit; none of those three is ratified, so anything cited to them is **[CA]** at most.

## Implementation gates

Three separate gates. Passing one does not open the next.

| Gate | What it authorizes | Who approves | What it requires |
|---|---|---|---|
| **Gate 0: Stage 0 technical authorization** | The product-neutral engineering foundation in `planning/G-development-sequence.md`, and nothing else | Dustin | An approved Stage 0 PRD that passes the neutrality test below. No Cory decision is needed, by construction. |
| **Gate 1: Stage 1 semantic authorization** | Building one piece of the first collaboration slice | Cory for the product decisions, then Dustin for the PRD | Cory has answered every decision that piece depends on (the dependency table is in `planning/F-first-slice.md`), and a PRD for that piece is approved. A piece whose decisions are unanswered does not start. No preferred answer is built as a stand-in. |
| **Gate 2: Real-use authorization** | Any real collaboration between real people run on the product | Cory, with counsel where a decision is marked counsel-dependent | The real-use prerequisites in `planning/F-first-slice.md` are resolved for the named scenario. A working synthetic demonstration is not real-use approval. |

**Neutrality test for Stage 0.** If Cory could answer an open product question differently and force a piece of Stage 0 work to change, that piece belongs in Stage 1 or later. Ordinary technical choices (language, database, test tooling) are not product questions and are Dustin's.

No implementation begins because a planning document proposes it. All work after this baseline happens on branches through human-reviewed pull requests.

## Development

The Stage 0 foundation is a single TypeScript application on PostgreSQL. What it contains and why: `docs/engineering/STAGE-0.md`.

**Requirements.** Node 24 (`.nvmrc`) with its bundled npm, and Docker for the local database. No external accounts.

**Setup.**

```
npm ci
cp .env.example .env
```

**Database.** `npm run db:up` starts PostgreSQL 17 on `127.0.0.1:5432` and, on first start, runs `db/provision.sql` to create the migration role, the runtime role and the database. `npm run db:down` stops it. (Any PostgreSQL 16+ works if you run `db/provision.sql` against it as a superuser.)

**Migrations.** `npm run db:migrate` applies the reviewed SQL in `migrations/` using `MIGRATION_DATABASE_URL`. To change a table, edit `src/stage0/tables.ts`, run `npm run db:generate`, and review the generated SQL. Privileges go in hand-written migrations (`npx drizzle-kit generate --custom --name=<name>`). Never `drizzle-kit push`.

**Check.** `npm run check` runs the typechecker, the linter and a drift check that fails if the table definitions and migrations disagree.

**Test.** `npm test` creates a fresh test database, migrates it, and runs every suite against it. It needs the database up; it fails rather than skips without it.

**Build and run.** `npm run build` compiles to `dist/`; `npm start` runs it with `DATABASE_URL` (runtime credential only). `npm run dev` runs from source with `.env`. Health: `GET /health`.
