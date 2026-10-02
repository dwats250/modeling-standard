# Deliverable I. Creative direction

Status: REVIEW. Reconciled 2026-10-02 (see `RECONCILIATION-REPORT.md`). Advisory: Fable direction **[F]** for Cory's reaction; Cory decides. No mockups yet. The prototype's editorial black-and-white with Playfair Display and Inter is evidence of an aspiration, not a specification; the guidelines file says so itself.

**What in this document is an example, not a decision.** The feeling, the tone and the visual direction stand on their own. The concrete screens described below are illustrations drawn under assumptions that Cory has not made, and each changes with its decision in Deliverable H:

| Illustration | Depends on |
|---|---|
| The signing controls (one control per section, a typed name, one confirming action) | D4 |
| The organizer signing when presenting and confirming with a second signature | D2, D4 |
| "One email round trip to get an account" and any account flow | D3 |
| The version line and "changed since you agreed" | D2 |
| What a participant sees of other people's terms; the record looking like what was read | D10 |
| The freeze "ceremony" and everyone receiving the record at once | D2, D10 |
| The four navigation destinations, and "Shoots" as the first of them | D5, D7, and the later stages that would fill them |
| The eight headed sections of the brief | D1, D4 |
| Presets pre-filling the terms; the organizer as the one who authors and edits | D1, D4, D2 |
| The record-page wording ("what everyone agreed to") | D2, D10, D5 |
| References to a design system, tokens or inline editing arriving in "stage 3" | Not scheduled; Deliverable G lists later stages as outline only |
| Every product word used here (brief, shoot, record, agree, confirm) | D5 |

## 1. The feeling

A well-run production office. Calm, adult, exact. The product should feel like the person who sends a clean call sheet the night before: nothing is dramatic, everything is clear, and you would rather work with them again. Confident without a raised voice; premium without a velvet rope; human because the words are plain.

Words to design toward: confident, calm, exact, warm, adult, credible.
Words to design away from: urgent, protective, alarming, playful, corporate, social.

The test for every screen: would a working photographer or model be proud to send this to a stranger they want to work with? If a screen looks like a security dashboard, a legal form, a SaaS admin panel or a social feed, it is wrong.

## 2. Hierarchy: the shoot at the centre

Fable's proposal is that the desk is organized around shoots. This is a design thesis, not a rule that every future capability must hang from a shoot (Deliverable C, section 4). The first-level objects a person owns would be: shoots (past, in flight, upcoming), records (the frozen outcomes of shoots), and themselves (identity, cards, work). Later, availability and posted concepts join at the same level. There is no "home feed"; there is a desk.

Priority of information on any screen: what needs me, then what is coming, then what is done. Never metrics first. Cory's later "Standing" and analytics ideas belong behind identity, not on the desk.

## 3. Navigation (example)

An illustration of where the product could arrive, not a specification for the first slice, which has almost nothing to navigate. Four destinations at most, in this order, and the same on every device:

- **Shoots.** The desk. In flight first, then upcoming, then archive. Each shoot is a document, not a form.
- **Records.** Every frozen agreement and its documents, searchable by person, date and title. This is the archive a professional keeps. It should feel like a filing cabinet that is always in order.
- **Me.** Identity, cards, portfolios (stage 3), the link page (stage 4), availability (stage 4).
- **Work** (stage 4). Posted concepts, and replies to them. The only place other people's things appear, and only as work.

Settings live under Me. Admin is a separate, unstyled surface. There is no inbox: things that need a person appear on the desk, and the email that brought them there deep-links to the exact item.

## 4. The brief is a document you read, not a form you fill

The single most important design idea for stage 1, applied first to reading and only later to writing. The principle is Fable's and stands on its own; the specific sections, controls and signing steps in the next two paragraphs are examples that depend on D1, D2, D4 and D10. The brief is rendered as a document with headed sections in the eight term blocks (purpose and concept; when and where; who; compensation; expenses; deliverables and delivery; usage; boundaries and safety), each a plain-language rendering of the current values. In slice 1 the organizer edits through a structured form beside a live preview of that document; presets pre-fill the whole thing so the first view is "nearly finished" (Cory's onboarding principle: ask once, appear everywhere, magically finished). Required blocks that are still empty read as a gap in the preview, not as red validation text. Editing the document in place, with inline controls, arrives in stage 3 with the design system; it is the same document either way.

The participant reads the document on a phone: the common terms and their own terms (what else they see is Cory's, D10), their own terms visibly theirs. At the end of each block, one control: agree to this section. At the end, their legal name and one confirming action. Concerns are raised on a specific block with a short note, in place, and the block shows that a concern is open. The organizer signs the document when presenting it, and confirms with a second signature when everyone has agreed. The record each party later downloads looks like the document they read, because it is the same template.

Versions appear as a quiet line at the top: "Version 2, presented Tuesday. Changed since you agreed: when and where, compensation." A list of changed blocks in words; never a diff view with strikeouts in stage 1.

## 5. How professional identity should feel

Like a press kit, not a profile. A name, what they do, where they are, how to reach them, and the work they chose to show. No follower counts, no activity, no "last active", no badges in stage 3. Role modules keep it honest, and their contents are Cory's to set (the July role-module list was flagged as inference to validate); as examples only: a photographer's identity might show gear, deliverables offered and a rate card; a model's, the measurements they choose to share and a comp card; a makeup artist's, kit and specialities. Nothing that only makes sense for one role is shown for another.

The link page (stage 4, if Cory decides it exists) is the one public face: the work first, one way to reach the person, nothing to browse further.

## 6. How the collaboration workflow should feel

Like the calm version of arranging a shoot with a professional who has done it many times. The steps named below (who confirms, when the record is issued, how an account is obtained) are examples under D2 and D3. The organizer's experience is authoring and then waiting well: the shoot page says exactly who has read, who has agreed to which version, who has raised what, and what the organizer's next action is. The participant's experience is reading and deciding on a phone in five minutes, with nothing to install and one email round trip to get an account.

The freeze is a moment worth a small ceremony: the record renders, everyone receives it, and the shoot page changes character from "in negotiation" to "agreed", with the record pinned at the top. After the shoot, the page becomes a place to record delivery (stage 4) and nothing else; the product does not follow people onto set.

## 7. How safety appears without dominating

Safety appears as clarity and as absence.

- Clarity: boundaries and safety provisions are ordinary sections of the brief, written in the same voice as deliverables and usage. "Wardrobe: fully clothed and swimwear. Contact: none beyond posing guidance. Anything not listed is off the table." No shield icons, no warning colour, no "protect yourself" copy. The off-limits statement is the last line of the boundaries section, in the same type as everything else.
- Absence: there is no directory to browse, no message box, no negotiable option, no way to change a presented version in place. The walls are the shapes of the product, not signs on it.
- The one place safety speaks in its own voice is the record page and the affirmation moment: plain, unhurried statements of what this is and is not ("This record shows what everyone agreed to, by whom, and when. It is a record, not legal advice."). Cory's voice rules apply: empowering, never fearful, and no em dashes anywhere in product copy.

Fear-based framing, "safety scores", "verified safe" badges and anything that makes the non-fearful majority feel they entered a clinic are out.

## 8. Mobile behaviour

Phone first for everything a participant does: opening an invitation, creating an account, reading a brief, agreeing, retrieving a record. These flows are designed at 375 pixels wide before anything else and tested there in CI. One column, generous line length, sticky "agree to this section" controls, no modals for the main path, and the whole brief readable without any horizontal movement.

Authoring on a phone is supported but not optimized in stage 1: the document editor works, presets make it tolerable, and the desktop is where organizers will do most authoring.

## 9. Desktop behaviour

The desk. Two columns at most: the list of shoots or records and the open item. The brief editor takes the width of a printed page and no more; wide screens get margins, not more columns. Records open in a reading view identical to the PDF. No dashboards of tiles; the "this week" view (stage 4) is a short list under a date heading.

## 10. Visual system (direction, not tokens yet)

- Type: an editorial serif for titles and section headings, a humanist sans for everything else, both with real italics and tabular figures for amounts and dates. The prototype's pairing is one acceptable answer; the tokens package in stage 3 will pick and test the final pair.
- Colour: near-monochrome with warm neutrals; one accent used only for the primary action and agreed states; no red for boundaries, no amber for warnings. State is conveyed by words and position more than colour.
- Space: generous margins, one measure for reading, consistent vertical rhythm. Density is a desktop setting later, not a default.
- Components: few. Document sections, inline controls, a single button style with one primary variant, quiet status lines, a record card. No tile grids, no badges, no avatars with rings.
- Motion: almost none; a single soft transition at the freeze.
- Imagery: the product carries no stock imagery; the only images are people's own work, shown at the size they chose.

## 11. Beautiful garden, invisible walls, in one sentence each

- The garden is the desk, the record archive, the press-kit identity and, later, the posted concepts: things a professional wants because they make the work easier and look the part.
- The walls are the shapes: only work is visible, only versions are agreed, only explicit terms are presentable, only the parties hold the record, and nothing on set is witnessed or claimed.
