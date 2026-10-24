# Decisions

These are Cory's twelve photo-shoot product decisions, one file each, including later direct rulings. Their substantive contents and dated amendment history are preserved. For current engineering state and work authorization see the [root README](../README.md) and [agent contract](../CLAUDE.md).

## Rules

- `planning/H-cory-decision-packet.md` keeps the planning and provenance context. These files are the active answer surface.
- **OPEN** means at least one required product question in that file is still unanswered. An OPEN file may contain direct Cory rulings on some subparts. Binding implementation may rely on those explicitly answered subparts; a Dustin-authorized private synthetic prototype may also use clearly provisional choices without settling an OPEN decision. Protected real-use, legal, privacy and consent boundaries remain closed until their requirements are met.
- **DECIDED** means Cory has resolved the decision sufficiently for its stated current scope.
- Changing a decided answer does not erase it. Add a dated note under "Amendments".
- A decision file does not by itself authorize implementation.
- A bounded work order or slice PRD names the exact rulings it relies on; whole-file DECIDED status is not required when the relied-on subpart is explicitly answered.

Anything marked **[F] lean** is Fable's recommendation to Cory. It is not a default and nothing is built from it.

Direct Cory rulings are recorded in two dated notes:

- [`2026-10-05-cory-reconciliation.md`](2026-10-05-cory-reconciliation.md) — the first reconciliation session, kept as historical evidence.
- [`2026-10-09-15-cory-reconciliation.md`](2026-10-09-15-cory-reconciliation.md) — the 2026-10-09 and 2026-10-14/15 sessions. **Later; governs where they conflict.** It also holds Cory's cross-cutting doctrine (noise doctrine, recording versus showing, presence, third parties, photo shoots versus fashion shows and others), its supersession ledger, and two **handoff corrections** (HC1: there is no version history; HC2: there is no proposer-only drop). Those corrected errors in the Claude-generated session handoff; they are not Cory changing his mind. The reconciliation questions R1 and R2 rested on those errors and are withdrawn.

Both supersede conflicting older candidate evidence. Every decision in this folder covers **photo shoots**; fashion shows are a separate product, not designed by extension.

Historical provenance tags (**[R]**, **[R-prov]**, **[CA]**, **[F]**) and citations such as `VISION:374` are explained in [planning/README.md](../planning/README.md). They do not make historical recommendations binding.

## Current status

| # | Decision | Needed for | Status |
|---|---|---|---|
| [D01](D01-first-scenario.md) | First scenario, walked through | Any Stage 1 work | DECIDED |
| [D12](D12-who-may-act.md) | Who may act, and for whom | Any Stage 1 work | DECIDED |
| [D02](D02-agreement-topology-lifecycle.md) | Agreement topology and lifecycle | Response and finalization work | DECIDED (photo shoots) |
| [D10](D10-what-each-party-sees.md) | What each party sees | Presentation and artifact work | DECIDED (photo shoots) |
| [D04](D04-terms-and-affirmation.md) | Terms and affirmation | Terms and signing work | OPEN — no-means-no wording, the visible signing act |
| [D03](D03-participation-credential.md) | Participation credential | Invitation and participation work | DECIDED (photo shoots) |
| [D11](D11-adult-assurance.md) | Adult assurance | Participation work; real use | OPEN — synthetic-demo treatment only; timing decided |
| [D05](D05-vocabulary.md) | Vocabulary | Anything a person outside the team sees | OPEN — presented version, response, archived states |
| [D07](D07-initiation-and-paywall.md) | Initiation and the paywall | Before any screen calls creating free or paid; before document design | DECIDED |
| [D06](D06-real-use-and-launch-shape.md) | Real use and launch shape | Real use | DECIDED — product authorization only; Gate 2 not open |
| [D08](D08-documents.md) | Documents | Real use where a release is triggered; document design | OPEN — counsel review of templates; trigger table to draft |
| [D09](D09-preservation-and-evidence-access.md) | Preservation and evidence access | Record access after account changes; real use. Counsel-dependent | OPEN — counsel-dependent retention and erasure only |

Rows retain the packet's dependency-oriented order. If this table and a file disagree, the file's own `Status:` line is correct.

## Status changes on 2026-10-15

| Decision | Before | After | What made it sufficient |
|---|---|---|---|
| D03 | OPEN | DECIDED | Every question answered: account by Google/Apple sign-in at invitation, link is the invitation, no forwarded-link mechanism, archive by reference, re-verification fallback. What remains is technical. |
| D10 | OPEN | DECIDED (photo shoots) | Every grid row, the organizer question and the final-record contents answered. |
| D06 | OPEN | DECIDED | Cory authorized pre-launch real use in sequence. Gate 2 remains closed. |
| D02 | OPEN | OPEN (narrowed) | (a)–(h) answered. R2 is needed before drop-and-resend can serve real participants. |
| D04 | OPEN | OPEN (narrowed) | Requiredness, deliberate ticks, subject control, tick versus sign, coverage cap, evidence and no-means-no answered. Wording, signing act and R1 remain. |
| D05, D08, D09, D11 | OPEN | OPEN (narrowed) | Each narrowed to the items in its status line. |

Later on 2026-10-15, after the handoff corrections HC1 and HC2:

| Decision | Before | After | Why |
|---|---|---|---|
| D02 | OPEN (narrowed) | DECIDED (photo shoots) | Its only remaining blocker, R2, was withdrawn: it rested on a sentence Cory never ruled. (a)–(h) are answered. |
| D04 | OPEN (narrowed) | OPEN (narrowed further) | R1 withdrawn: it rested on the version-history handoff error. No-means-no wording and the signing act remain. |

## Next Cory conversation

Only genuinely open Cory-owned items:

1. **No-means-no wording** — Cory writes it (D04).
2. **What signing looks like** once everything is green (D04).
3. **Remaining vocabulary in context** — a presented version, a response, archived states — reacting to drafts on real screens and emails, not generating cold (D05).
4. **Review of Dustin's document trigger table** and the D01 required-term list, against real briefs, once drafted (D08, D04).

Not Cory homework: counsel questions (D08 template review, D09 retention and erasure); synthetic-demo verification (D11) can wait until a demo needs participants; fashion-show mechanics are deliberately later.
