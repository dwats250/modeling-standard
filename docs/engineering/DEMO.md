# Local synthetic demo

A demonstration with invented people on a developer machine: compose an invented photo shoot (one photographer, one model, sent directly), look at it as each person with server-enforced visibility and actions, and resolve it live to **READY TO SIGN**. It is not a product flow, not a credential mechanism, and not real-use approval (Gate 2). Signing is the next slice and is not built here.

## Run

From a clean checkout, with PostgreSQL 16+ up and provisioned (`npm run db:up` uses Docker and `db/provision.sql`) and `.env` copied from `.env.example`:

```
npm ci
npm run demo:fresh            # reset modeling_standard_demo, then serve: http://127.0.0.1:3100/
npm run demo:fresh -- --lan   # the same, reachable from a phone on the same Wi-Fi (prints the URL(s))
npm run demo:export           # .demo/modeling-standard-demo.html — the read-only inspector snapshot
```

`demo:fresh` is fail-fast: if anything already listens on `DEMO_PORT` (default 3100) it stops with "stop the running demo first" and touches nothing. Otherwise it validates the listener (LAN mode needs a private IPv4 address), resets the demo database, and serves exactly as `npm run demo` does. It never ends another process or database session; `demo:reset` still refuses while a demo server is connected. Stop the demo with Ctrl+C.

The individual steps remain: `npm run demo:reset`, `npm run demo`, `npm run demo:lan`.

**LAN.** `--lan` prints every private IPv4 address of the machine. Use the one on your Wi-Fi (typically `192.168.x.x`); a `172.17–31.x.x` address is usually a Docker bridge. Requests are accepted only for those exact addresses and loopback. **The simulated person is part of the address** (`/#/shoots/<shoot>/as/<person>`), not a credential: anyone on the Wi-Fi who opens the demo can act as any person by editing the address. That is acceptable only because everything is synthetic.

**Interactive demo vs snapshot.** The interactive demo is the server above (its banner says "Interactive demo on this machine — not the read-only snapshot"). The snapshot is one self-contained HTML file of the **inspector** (the whole stored record of every project, as the demo operator sees it), labelled "read-only synthetic snapshot" on every screen. It is not what any one person sees, has no participant screens, refuses every write, and makes no network request.

## What you can do

The journey follows `planning/I-creative-direction.md` §10: warm near-monochrome neutrals, one accent for the primary action and agreed states, an editorial serif for titles, state carried by words and position. Its styles are `src/demo/ui/journey.css`; the inspector keeps `styles.css`. Public words are **proposed labels** for Cory's review in context (D05).

Every screen has a top bar with the wordmark (back to the start), a discreet **Synthetic demo** indicator (opens About) and the **Demo** menu.

1. **Welcome** (`/`). A short introduction, one primary action — **Create a shoot** — a three-step "How it works", and the shoots composed or opened so far (kept until reset).
2. **Demo menu** (`/#/demo`). The ready-made examples (two-person shoot from the start; shared with values still open; after a declined request; three people, two fees — Fixture 2; empty shoot — Fixture 3), **About this demo**, the **Inspector** (engineering aid, `/inspector`: the whole stored record, not what any person sees) and the engineering-notes switch.
3. **About this demo** (`/#/about`). One place for the caveats: invented people, interactive demo not the snapshot; what is simulated (one operator plays every person; composing, presence and sharing are operator acts; who enters an agreed value is an open question for Cory; the address is not a credential, so anyone on the Wi-Fi can act as anyone); what READY TO SIGN means (structural all-green rule; the required-term list is not drafted; signing is not built; no overall readiness with more than two people); what is not shown (no-means-no, required-term completeness, sign-in, the signing act, walking away); that the words are proposed ("Live" is a candidate) and that section placement is a demo choice; the decision references.
4. **Compose** (`/#/shoots/new`). Section cards — The shoot, On set, Logistics, Creative and usage, Fee — with natural invented examples. Each value is **filled in now** or explicitly **decide together** (coverage: **Model sets it** / **set it now**; fee: **no fee** / **amount** / **decide together**) as a segmented choice; the value box appears only for a state that has a value. Blank values are refused per field ("Fill it in, or mark it decide together."); typed input is kept in the browser session across reloads until the draft is created. "You are composing as the demo operator." Nothing can be marked required; no closed-set term, physical-contact row, extra rows or no-means-no item.
5. **Draft** (`/#/shoots/<id>`). Title, Draft → Live → Ready to sign progress, cast, **Who will be on set?** (On set / Not on set per person), **Share the brief** — refused with "Every person needs an on-site answer before the brief can be shared." until each has an answer — and the draft as a read-only document.
6. **Open the brief as…** After sharing, a chooser, the Model first.
7. **Each person's brief** (`/#/shoots/<id>/as/<person>`).
   - **Viewing as** switch, sticky under the top bar, with "Demo simulation — in the product, each person signs in and acts only for themselves."
   - Title, progress and a status line ("3 of 8 terms agreed · 2 still open"); with more than two people, "overall readiness isn't shown".
   - **Your next step**, in order: set the value only you control; decide on a request about you; tick N terms (the ordinary ones together — the same as ticking each — then the fee and coverage level on their own). When nothing is left for this person: **You're done for now — Waiting on the others**, listing what the brief waits on (from what this person can see).
   - **The brief** as one document in three sections — On set (Universal · everyone on site), The shoot (Shared · everyone in the collaboration), Fee (Private money · only you and the other person) — numbered by what this person sees. Per term: wording, value or a neutral open state, quiet notes (declared by, a request about you, between, ticked on its own), ✓/○ per person who ticks it, "Agreed" when complete, and only this person's actions: **Tick**, **Untick**, **Set as Model**, **Decline as Model** (the request disappears; "Request removed.").
   - **Demo control** (dashed, after the document) for decide-together values: "Enter the value the two of them agreed — who enters it in the product is an open question for Cory."
   - **Ready to sign**: a milestone card — "Everyone has ticked every term in this brief." and "Signing comes next. It isn't part of this demo, so nothing here is signed." Readiness gained or lost by an act is announced ("No longer ready to sign."). No signing control exists anywhere.

Stored demo text keeps its `[synthetic]` mark; the journey shows it without repeating the mark on each line, and values typed on these screens are stored marked. Engineering notes (Demo menu) reveal ids and item keys.

## How it is built

- **Never in production.** Everything is in `src/demo/` and `src/scripts/demo*.ts`; `src/main.ts`, `src/app/create-app.ts` and `src/app/operation-list.ts` import nothing from it, `tsconfig.build.json` excludes it, and every demo route 404s in the production application (tested).
- **One principal.** Every request is the fixed synthetic `demo-operator`, which stands for nobody and is never a party. All demo operations are protected, strict-input, strict-output, and creator-only (S01), registered through `createApp({ additionalOperations })`.
- **Demo operations** (`createDemoOperations(annotations)`; the set is pinned in `tests/demo/simulator.test.ts`):

  | Purpose | Routes |
  |---|---|
  | Inspector reads | `GET /demo/projects`, `GET /demo/projects/:id/record` |
  | Simulator (inspector walkthrough; the journey's operator-level presence, share and settle) | `POST /demo/sim/scenarios`, `/demo/sim/briefs/:id/{presence,share,group-check}`, `/demo/sim/items/:id/{settle,parameter,decline,tick,untick}` |
  | Composer and scenario cards | `POST /demo/shoots`, `POST /demo/shoots/scenarios` |
  | Participant screens | `GET /demo/shoots/:projectId/as/:partyId`; `POST …/as/:partyId/items/:itemId/{tick,untick,decline,parameter}`; `POST …/as/:partyId/group-check` |

- **Writes** go only through the existing data functions (S01, S02, S08, S09). The composer and scenario cards run in one transaction. No rule is re-implemented in demo code; refusals are the stable 409 codes (`presence_missing`, `not_subject`, `not_request`, `deliberate_tick`, `not_an_approver`, `still_pending`, `not_open_parameter`, `not_draft`, …).
- **Participant reads** use only `listBriefItemsVisibleTo`, `getBriefGreenStateVisibleTo`, `listBriefPresence`, the project's parties, its pair records and `findLiveBriefForProject` — never the whole-brief reads.
- **Visibility pre-check.** Every `/as/` route's loader resolves the project, requires its brief to be live, requires the person to belong to the project, and checks every item id in the request (each id in a group-check) against what that person can see — before any data function or database guard runs. Any miss is the generic `404 not_found` that a nonexistent id gets (tested byte-for-byte, request id aside), so another pair's fee cannot be told from an id that never existed. An item gone between the check and the act (a concurrent decline) is the same 404.
- **The participant payload** has, per item: id, layer, `between` (the two people of a pair-scoped item), subject, shape, item key, `deliberate`, wording, value, pending state, who must tick it, who has, green, and this person's permitted actions. No position (a gap would reveal a declined request or another pair's fee), no pair-scope record id, no time, author, proposer or history. Progress counts are over the visible items. `ready` is present only when the project has exactly two parties and one pair (then each sees every item); otherwise the key is absent.
- **Demo annotations.** Labels (Photographer, Model, Party A…), shoot titles and fixture notes live in `.demo/annotations.json`, never in the database (which holds no name, role or label). The server serves them at `/annotations.json` to every browser, so a LAN phone sees the same labels. Written by reset (fixtures), the composer and the scenario starters; replaced by every reset, which also removes the old `.demo/fixture.json`.
- **Fixtures** (written by reset through the real `project.create` operation and the data functions): Fixture 1 (D01 draft, no money), Fixture 2 (A, B, C; pairs A–C and B–C; one fee each), Fixture 3 (empty), Fixture 4 (the walkthrough at READY TO SIGN). Every stored text is marked `[synthetic]`.
- **Host header.** Ordinary mode accepts only loopback names with the server's own port; LAN mode adds the machine's own private IPv4 addresses. Anything else is 421. PostgreSQL stays on TCP loopback and the database is exactly `modeling_standard_demo`.

## Limitations (stated, not hidden)

- **Simulation only.** One operator acts for every person, chosen by the address. In the product each person acts only for themselves, signed in (D03, D12); sign-in is not built.
- **Who composes, who shares, who enters a decide-together value** are open questions for Cory; here they are operator acts, labelled as such.
- **READY TO SIGN is structural.** It means everything currently in the brief is resolved and green for everyone who must tick it; the required-term catalogue is not drafted, so it does not mean the brief is complete.
- **No signing**, freeze, signatures or contract (S10–S11 are a later slice). **No no-means-no** term or placeholder (D04 wording is Cory's). **No walking away** from a collaboration.
- **Multi-party** shoots show no overall readiness (it could reveal another pair's private fee).
- The **inspector** is an engineering aid showing the whole record; its walkthrough's "Settle together" form predates the participant screens.
- The snapshot covers the inspector only.

## Regression

`npm run test:demo` (needs `CHROME_PATH`; see `.env.example`) runs two real-browser suites through `playwright-core`, each resetting `modeling_standard_demo`:

- `tests/demo-browser/journey.test.ts` — the participant journey at 1280 and 390: the welcome screen's single primary action, the demo menu and every About statement; composer fields (exactly these rows) and per-field blank refusals; share refused then shared; chooser; each person's screen with the simulation label, band and proposed-word flag; the Model's open parameter; Simulation controls; group-check and deliberate ticks to READY TO SIGN with the catalogue caveat and "signing is the next step and is not built"; untick ("No longer ready to sign.") and retick; mobile band in the first half-screen and stuck while scrolling, controls at least 44 px; reload; the decline path with no numbering gap; the three-person case (only one's own fee, no readiness); the empty shoot; a draft refused under a person's screen; labels kept across a restart and cleared by reset; no history words, no stray text, no signing control, no horizontal scroll, no browser errors.
- `tests/demo-browser/regression.test.ts` — the inspector at `/inspector`: fixtures, the walkthrough, the decisions view, the snapshot from `file://`, reset repeatability, every demo route 404 in production.

Screenshots go to `test-results/demo/` (`journey-*` per stage and width; the inspector's existing set). They are evidence, not design approval.

HTTP and database tests (`npm test`): `tests/demo/shoots.test.ts` (composer combinations, blank refusals, annotations, scenario cards, no migration), `tests/demo/participant.test.ts` (payload fields, switching, the 404 equivalence for non-members, drafts, hidden items and group-checks, the full lifecycle through participant routes, decline, production isolation), plus the existing demo suites.
