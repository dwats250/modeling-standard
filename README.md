# Modeling Standard

**A professional workspace for independent models, photographers, and creative teams.**

Modeling Standard brings professional presentation, shoot coordination, clear expectations, and lasting agreement records into one coherent experience. It is designed for people whose work currently stretches across comp cards, portfolios, messages, informal arrangements, and scattered documents.

The aim is simple: help creative professionals present their work, coordinate with others, understand what they are agreeing to, and keep a reliable record. Protection belongs in the ordinary workflow through clarity, consent, and deliberate sharing, rather than fear-based messaging.

**Status:** Active development, using synthetic scenarios and test accounts. The collaboration foundation and development demonstrations exist; the complete product is **not available for real collaborations or production use**.

## What we're building

Modeling Standard is **model-forward**, while supporting the photographers, makeup artists, stylists, assistants, and other professionals who work together on a production.

Its intended capabilities include:

- **Professional identity:** profiles, comp cards, portfolios, and professional presentation.
- **Shoot coordination:** briefs that make the people, logistics, compensation, deliverables, usage, and boundaries explicit.
- **Agreements and records:** relevant terms presented to each party, a distinct signing act, and a durable final record.
- **Documents:** consent and release documentation appropriate to the work, with access to safety documents protected from paywalls.
- **Deliberate sharing:** owner-controlled access to professional material, scoped to specific recipients and bounded in time.

Moodboards, concepts, and other professional workflow tools are also part of the broader vision. **These are product directions, not claims that every feature is built.**

This is a professional workspace, **not a people directory**. Creating an account does not grant permission to browse other people's private profiles, comp cards, or portfolios.

## What exists today

The repository has progressed well beyond a planning exercise. Its implemented foundation is primarily the collaboration and agreement engine, with synthetic demos for testing its behavior.

| Area | Implemented | Important limitation |
| --- | --- | --- |
| Collaboration core | Projects, project-local parties, account bindings, direct invitation links, and pairwise agreement structure | Demonstrated primarily with synthetic two-person photo shoots |
| Live briefs | Draft/live lifecycle, participant-specific views, explicit terms, resolution actions, deliberate ticks, and readiness for signing | Ticking a term is **not** signing; some demonstrations use an operator |
| Participant access | Invitation-led account sessions and routes constrained to a person's own party | No complete production participant-facing application |
| Google and staging | Google sign-in integration and a separate synthetic HTTPS staging environment | Real-Google acceptance is partial; sign-in does not establish identity or age verification |
| Final contract records | Operator/test-only finalization of a frozen brief, append-only contract storage, and a recomputable signature chain | No actual participant signing or participant contract interface |
| Development tools | Local demo, record inspector, portable snapshot, database and HTTP tests, and browser regressions | Demo exports are not the finished document-delivery experience |

The current brief model has **one live brief before signing**, not a retained intermediate version history. Earlier presented-version and per-term evidence implementations were superseded; final agreement evidence belongs to the final contract.

See the [demo guide](docs/engineering/DEMO.md), [participant access](docs/engineering/S12-PARTICIPANT-ACCESS.md), [staging](docs/engineering/S13-STAGING.md), and [final-contract implementation](docs/engineering/S11-FINAL-CONTRACT.md).

## Current development focus

Two complementary workstreams serve **one product**:

- **Track A — Collaboration and agreement engine:** briefs, participation, agreement, and evidence.
- **Track B — Professional toolkit:** identity, presentation, and eventually other professional tools, starting with **private synthetic profiles and comp-card drafts**.

Track B is the current implementation priority. Its first slice, B1, adds a **private synthetic profile and comp-card draft** with an editor and preview in the local demo, using fixture images and two fixed synthetic professionals in place of sign-in. Sign-in for professionals, uploads, sharing and public profiles are not built. Authorized synthetic toolkit work can proceed without waiting for unrelated Track A decisions.

Participant signing, identity and adult assurance, document completion, legal prerequisites, and real-use acceptance remain incomplete. Youth and guardian workflows are deferred. **A working demo does not authorize real use.**

## Product principles

- **Clarity before participation.** Relevant compensation, expectations, and boundaries should be understood before people commit.
- **An agreement record is not a witness.** The product records what parties agreed; it does not verify what occurred on set or promise legal enforcement.
- **Private professional material is owner-controlled.** Temporary sharing of a portfolio is different from a party's right to access its own agreement evidence.
- **Final evidence must be durable.** Consent-bearing records are protected from ordinary modification and deletion; retention and erasure policy remain subject to legal review.
- **Compensation is recorded, not transferred.** User-to-user payments are outside this product.
- **Capacity, not completion, is the collaboration paywall.** Completing an allowed collaboration, including its agreement and record, is free under Cory's current direction. Profiles and portfolios have a separate paid boundary; billing and pricing are not implemented.
- **Claims follow evidence.** Synthetic operation, provider authentication, identity assurance, participant signing, and production readiness are distinct.
- **The best safeguards are built into the experience.** A calm, credible professional tool with clear boundaries, rather than a fear-based safety dashboard.

These principles describe intended behavior and binding constraints where established, not the readiness of every screen or workflow. See [current product decisions](decisions/README.md).

## Engineering and local development

The application uses **Node.js 24, TypeScript, Fastify, Zod, Pino, PostgreSQL, and Drizzle ORM**. It is built around explicit authorization policies, strict boundary validation, reviewed migrations, separate runtime/migration database roles, and automated tests. Browser regression uses Playwright with Chrome/Chromium.

Start with Node 24 and Docker Compose in a dedicated development environment:

```sh
npm ci
cp .env.example .env
npm run db:up
npm run db:migrate
```

To check, test, and build:

```sh
npm run check
npm test
npm run build
```

**Important side effects:** `npm run check` invokes Drizzle migration generation and may write migration files. `npm test` drops and recreates a named **test database**. `npm run test:demo` resets the **demo database** and needs a Chrome/Chromium executable (`CHROME_PATH`). Run these only against an isolated, task-owned database environment. **Separate Git worktrees do not isolate database resources.**

For development, run `npm run dev`; for the compiled service, `npm run build` and `npm start`. The application exposes `GET /health`; its production entry point does **not** serve demo screens.

For an interactive synthetic walkthrough, use the [local demo guide](docs/engineering/DEMO.md). For tailnet-only HTTPS staging, use the [staging runbook](docs/engineering/S13-STAGING.md). Database changes require reviewed migrations: **do not use `drizzle-kit push`**.

The [engineering index](docs/engineering/README.md) explains application composition, environment boundaries, and where to find as-built records.

## Project ownership

Cory and Dustin are equal partners. Cory has final authority over binding product vision and fundamental product semantics. Dustin leads architecture, infrastructure, engineering implementation, and delivery. Cory leads legal and compliance coordination, with Dustin's active assistance and qualified legal review where required.

Routine technical choices and authorized reversible synthetic prototypes are within Dustin's remit. Fundamental product decisions and protected legal, consent, privacy, and real-use boundaries remain explicit.

Dustin created both the earlier Replit-era repository hosted under Cory's GitHub account and this repository. The earlier application and subsequent reconstruction are part of the project's development history, not its present product identity.

## Documentation

- [Product decisions](decisions/README.md): Cory's current rulings and unresolved consequential questions.
- [Engineering index](docs/engineering/README.md): what is built, environment boundaries, validation, and implementation references.
- [Slice specifications](docs/slices/): bounded work and acceptance evidence.
- [Product invariants](planning/B-product-invariants.md): sourced outcomes distinguished from proposed mechanisms; read alongside later decisions.
- [Agent instructions](CLAUDE.md) and [Codex instructions](AGENTS.md): identical repository-level operating contracts.
- [Historical planning](planning/README.md) and [research](research/): reconstruction, provenance, exploratory designs, and engineering lessons.

The original ratified [vision](https://github.com/seeravenproductions/ShootBriefGenerator/blob/bfbf5f1/docs/VISION.md) and [product doctrine](https://github.com/seeravenproductions/ShootBriefGenerator/blob/bfbf5f1/docs/PRODUCT-DOCTRINE.md) remain traceable at their pinned commit. Later [Cory reconciliation records](decisions/2026-10-09-15-cory-reconciliation.md) govern where they explicitly supersede earlier rulings.

Previous proposals, prototypes, and development history remain evidence—not automatic authority for today's implementation.
