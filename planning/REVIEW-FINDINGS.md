# Independent review: Modeling Standard ground-zero planning package

> Note: this review was performed on the first draft of the package. The files it cites as `package/00-README.md`, `package/A-` to `I-*.md`, `package/CHARGE.md` and `package/recon/*` are now `planning/README.md`, `planning/A-` to `I-*.md`, `planning/REVIEW-CHARGE.md` and `research/*` in this repository. The corrections it recommends were applied to those documents; see `planning/README.md`.

Reviewer: independent (did not see how the package was produced). Scope: `package/00-README.md`, `A-` to `I-*.md`, checked against `package/CHARGE.md`, `package/recon/A|B|C-*.md` and, for spot checks, the ShootBriefGenerator repository (commit bfbf5f1). Read-only; this file is the only output.

Severity: **blocker** (fix before Cory or Opus acts on the package), **should-fix** (fix before slice 1 starts), **nit**.

---

> **Disposition note, 2026-10-02.** This review is preserved as written. Its findings were accepted and applied to the first draft. A later adversarial review (`ASTRA-REVIEW.md`) found that several of the fixes it recommended had themselves been written into the package as settled structure. The reconciliation (`RECONCILIATION-REPORT.md`) keeps the problems this review identified and reclassifies these fixes as recommendations **[F]** pending Cory's decisions:
>
> | Finding here | Fix applied then | Status now |
> |---|---|---|
> | 1. The organizer never signs | Organizer affirms every version they present; optional second confirming affirmation | The problem stands: whoever undertakes obligations must sign them. When and how the organizer signs, and whether a confirming step exists, are open (D2, D4). |
> | 2. Per-party visibility | One version, a rendered view per party under one common hash | Visibility stays open (D10). The agreement's structure with several parties is also open (D2); a common hash is not assumed. |
> | 4. Adults claimed, not enforced | Adult self-attestation recorded on account and affirmation | Attestation departs from July direction to verify at first participation; it needs Cory's approval (D11). |
> | 5. Forwarded links | Claim only by an account whose verified email matches the invitation | Kept as a security recommendation; forwarded and mis-addressed invitations are a product question (D3). |
> | 6. State machine | Append-only review events; withdrawal; supersession after freeze | Transitions are open (D2); no state machine is fixed. |
> | 9. Evidence-set coverage | "Seven of eight elements in full" | Overstated; coverage is claimed only after the decisions it depends on (`F-first-slice.md`, section 9). |
> | 10. Record PDF outside immutability | Write-once evidence storage class from stage 0 | The outcome stands; the storage mechanism is chosen from a Stage 0 probe (`D-technical-architecture.md`, section 4). |
> | Evidence-fidelity row 24 ("six costumes") | Downstream prose corrected | The upstream research lines are now corrected too. |

## TOP 10

1. **Blocker. The organizer never signs.** `E §2` (OrganizerConfirmation = `version_id, account_id, confirmed_at`), `C §3.4`, `F §6 AC6`. Doctrine element 3 ("compensation... visible to and signed by both parties") and element 6 ("each party's signature bound to the specific clauses it affirms") are APPROVED (DOCTRINE:44-53). As drawn, the photographer or organizer's own obligations (paying, delivering, usage limits) carry no affirmation, legal name or credential. If Cory picks "last acceptance freezes" (D2a), the organizer leaves no evidence at all. **Fix:** make the organizer a `Participant` (role `organizer` plus a working role) who gives an `Affirmation` on every version they present. Organizer confirmation becomes that affirmation, or a second affirmation after everyone else accepts, depending on D2. Add to F AC6: "the record contains an affirmation from every party including the organizer."

2. **Blocker. Who sees what between participants was decided without saying so.** `F §1 story` ("one record... identical document"), `F AC2` ("the presented version in full"), `F AC6` ("same PDF (same hash)"), `E Version.participants_snapshot`, `I §4`. With n parties and terms per participant, every invitee (a MUA, an assistant) sees every other person's pay, boundary terms and whatever contact details are in the snapshot, and so does anyone holding a forwarded bearer link. That conflicts with VISION:150 [R] ("each participant reviews the terms relevant to them") and with Cory's accept-gate, which says contact is exchanged only on mutual accept (CORY-QUESTIONS:157 [CA]). It also fixes the Record shape (one record against one per participant), which F §7 says no Cory decision changes. The charge §23 "same artifact" was written for two parties. **Fix:** add **D10 (blocks slice 1)** to H: "In a shoot with several parties, which terms and contact details does each participant see, before and after agreement?" Options: everything shared / shared common terms plus own compensation (the prototype did this) / organizer chooses per block. In E, keep one Version holding all terms and add a per-participant `RecordView` (the rendered subset plus a hash) under a common record hash. Hide contact fields until the version is agreed, pending D10.

3. **Blocker. I4 and D7(b) misstate Cory's tier ruling and write the contested version into lint.** `B I4`, `H D7(b)` ("plans charge for initiating presence, capacity and convenience, exactly as Cory said in July"), `G stage 6 evidence` ("a zero-plan account runs a full shoot"). Cory [CA], COST-REALITY:84,100: "the free tier is documents-only... No hosted presence at all on free"; "The paid line is *initiating* presence: your own profile, cards, boards, **briefs**." Under that ruling, creating and presenting a shoot is paid, and only invitee review and signing plus documents are free. I4 says the opposite, marks it [R], and D0 enforces it with an import-boundary lint. The charge (§10: "core consent, boundary-setting... should not become premium") supports I4, so this is a real conflict between the charge and Cory, and the package hides it. **Fix:** narrow I4's [R] scope to what VISION:469 ratifies: documents, releases and PDFs, plus invitee review, signing and retrieval (COST-REALITY:100 [CA]). Rewrite D7(b) as an explicit conflict: "The charge says creating and presenting terms is never paywalled. Your July ruling makes initiating a brief paid. Which holds?" Delete "exactly as Cory said". Change G stage 6 evidence to "an invitee with no plan can review, agree to and retrieve a record, and generate every document."

4. **Blocker. "Adults hold accounts" (I9) is claimed and never enforced before beta.** `B I9`, `D §4` (`AgeVerifier` null, "Stage 5 or later"), `D §8`, `G stage 3` (uploads). Cory [CA], COST-REALITY Rule 3 and CORY-QUESTIONS:184: verification happens "on the first act of participation (photo upload, **joining/creating a brief**...)". CORY-QUESTIONS:195 [CA]: "'adult only' is a claim that must be enforced via age-gating... yes before ANY public uploads". Slices 1 to 4 run real shoots, and stage 3 accepts uploads, with no age check. This also breaks I7 (claims only what it enforces). H does not route it. **Fix:** add **D11 (blocks slice 1 and stage 3)**: "Until verification exists, is a recorded adult self-attestation acceptable for private use, and must verification be live before stage 3 uploads?" In slice 1, add an attestation field to the Account and the Affirmation. Reword I9's proof to "an account without an adult attestation (v1) or adult verification (stage 3+) cannot participate." Move `AgeVerifier` real implementation to the stage 3 prerequisites, next to `ImageScanner`.

5. **Should-fix (high). Anyone holding a forwarded link can claim an invitation.** `E §1` (Invitation vs authorization: "claiming binds the participant to an account"), `C §3.1`, `F AC3`. Nothing requires the account doing the claiming to own the invited email. Someone who receives a forwarded link can create an account with their own address, claim the seat and affirm. That corrupts the doctrine's element 7 ("identity/credential used to agree") for the very case D3 exists to strengthen. **Fix:** in C §3.1 and E, a claim succeeds only when the claiming account has a verified `ExternalIdentity.email` equal to `Participant.email_snapshot`. Any other claim is refused, with an option to ask the organizer, who must change the participant, which means a new version. Add a negative command test and AC3b.

6. **Should-fix. The state machine dead-ends on concerns and ignores withdrawal and changes after the freeze.** `E §2 Review` ("Unique on (version_id, participant_id)... immutable"), `E §3`. A participant who raises a concern can never accept that version. If the organizer answers without changing any terms, they must present a byte-identical v2 just to unlock acceptance. There is no transition for decline, for withdrawing an acceptance before the freeze, or for edits after AGREED(v1) (charge §23 step 9; F has no AC for it). **Fix:** model the review as an append-only sequence of `ReviewEvent`s per (version, participant). The latest event counts until the freeze, and the freeze makes the set final. State explicitly: decline blocks agreement on that version; withdraw before freeze returns the participant to pending (whether that is allowed is a Cory point, so add it to D2); an edit after the freeze creates v2 while Record(v1) stays valid and is marked superseded once v2 is agreed. Add F AC5b (concern then accept on the same version) and AC6b (amendment after the freeze keeps Record(v1) retrievable).

7. **Should-fix. F presents D2 and D3 recommendations as forced by doctrine and builds them into acceptance criteria.** `F §1`: "four changes, each forced by ratified Cory doctrine rather than by preference". Rows 3 and 4 (account to accept; organizer confirmation) rest on evidence reasoning and on "the prototype had it", and the table itself says "Cory to confirm". AC3, AC5 ("every participant's status returns to pending") and AC6 then treat them as settled. E3's reason for "everyone re-accepts" is "no diff engine", which is technical convenience answering a Cory question (charge §27). **Fix:** change the F §1 header to "two changes forced by ratified doctrine, two recommendations pending D2 and D3". Mark AC3, AC5 and AC6 "(as drafted under D2 and D3 preferred answers; rewrite if Cory differs)". In E3, lead with the safety reason (strict, no definition of "material" needed) and drop the diff-engine reason.

8. **Should-fix. The package reduces Cory's structured-communication model to "concerns" and drops contact-on-accept.** `G "What is not on this roadmap"` ("a messaging system (Cory chose structured concerns instead)"), `C §3.6`, `E Review.concerns`. Cory [CA] (CORY-QUESTIONS:157 DECIDED; FEATURE-REVIEW:91-92) describes notes bound to terms, per-term counters that iterate "as compliance %" until the parties match, where "the negotiation IS consent evidence", and contact exchanged only on mutual accept. The package's loop is: concern, then the organizer edits, then a new version for everyone. That may be the right v1, but it replaces Cory's model without saying so. **Fix:** describe Cory's model accurately in G and C. Add it to H, inside D2 or as its own item, with options: (a) concerns only in slice 1, per-term counters in stage 4; (b) per-term counters in slice 1. Carry the contact-on-accept rule into D10 (finding 2).

9. **Should-fix. The slice-1 record falls short of the 8-element evidence set, while the README and F say it is built to doctrine.** `00-README finding 2`, `F §1`, `C §2 Compensation` (`paid { amount, currency, timing, method }`), `F §4` (no releases). Element 3 requires "amount, **down payment**, and payment timing" (DOCTRINE:48). Element 5 requires "usage rights, **and the release documents they trigger**". **Fix:** add `deposit { amount, due }` to the kernel Compensation type. Say plainly in F §4 and the README: "the slice-1 record satisfies elements 1 to 4 and 6 to 8; element 5 (triggered releases) arrives in stage 2." Add to D6 or D8 whether Cory accepts real shoots on records without releases in stage 1.

10. **Should-fix. The record PDF sits outside the immutability guarantee, and the canonical form can drift.** `D §6`, `D §7`, `E Record`, `C §3.7` (Blob `expiry`, "purge of transit media"). Immutability is enforced in Postgres, but the frozen PDF lives in a bucket that the app's credentials can delete, with an expiry field and a purge job on the same adapter. Separately, "canonical JSON" stored in a `json`/`jsonb` column loses byte order, so the hash cannot be recomputed from what is stored. **Fix:** add an `evidence` blob class with no expiry, a bucket or prefix the runtime credentials can write but not delete or overwrite (object lock or versioning where the vendor supports it), and exclude evidence from purge by construction. Store canonical terms as `text`/`bytea` and hash the stored bytes. Add an invariant probe: "deleting an evidence blob with app credentials fails."

---

## 1. Completeness (charge §29)

| Deliverable | Charge bullet | Verdict | Note / fix |
|---|---|---|---|
| A | "core user problem" | substantive | §2 |
| A | "primary user groups" | substantive | §3 table |
| A | "core value loop" | substantive | §4 |
| A | "professional-suite thesis" | substantive | §5 |
| A | "safety mechanism" | substantive | §6, four layers |
| A | "acquisition thesis" | substantive | §7 |
| A | "long-term product shape" | substantive | §8 |
| A | "Explicitly distinguish: owner-approved / interpretation / open" | substantive | §9. Some [R] items are overstated (see §3). |
| B | "short set of durable product invariants" | substantive | Nine, each with a proof |
| B | "actual architectural/product constraints, not slogans" | substantive | Yes. I4 and I9 need correcting (top 3, 4). The charge's example "protection without fear-based UX" is not an invariant (it lives in I §7). Acceptable. |
| C | "responsibility" | substantive | All domains |
| C | "important entities/concepts" | substantive | All except Entitlements |
| C | "what it owns" / "what it does not own" | substantive for 3.1 to 3.10; missing for 3.11 | Add both lines to Entitlements |
| C | "relationships to other domains" | **thin** | Explicit only for 3.1 to 3.4. For 3.5 to 3.11 it appears only through "does not own". Add a Relationships line to each. |
| C | "important invariants" | **thin** | Missing for 3.9 Scheduling and 3.11 (3.11 only through the constraint). Add them. |
| D | "application topology" ... "deployment philosophy" (13 bullets) | substantive | All present (§1 to §12) |
| D | "Identify which choices should be made now versus deferred" | substantive | §13 |
| E | the seven named distinctions | substantive | §1 table |
| E | "conceptual data model required for the first product slices" (plural) | **thin** | Slice 1 only. The stage 2 documents model (DocumentTemplate/Instance, how a signature binds to a template version) is deferred, though G stage 2 depends on it. Add a half-page stage 2 sketch. |
| E | "Flag uncertain modeling decisions" | substantive | E1 to E11 |
| F | why first / Cory goals / excludes / foundations / acceptance criteria / Cory decisions | substantive | All six present. The goal "Documents free" is claimed while documents are excluded (§5 below). |
| G | "approximately 5 to 8 major stages" | substantive | Stages 0 to 7 |
| G | the five questions per stage | substantive except stage 7 | Stage 7 "Prerequisite it establishes" is **blank**. Fill it. |
| H | decision / why / options / consequences / framing / blocks | **thin for D5 to D9** | D5 and D6 have no Consequences. D7 has no Options or Consequences. D8 has no Why or Consequences. D9 has no Options or Consequences. Add a line to each. |
| H | "Aim for a small decision packet" | substantive | Nine, though two real decisions are missing (top 2, 4) |
| I | hierarchy, navigation, tone, dashboard, identity, workflows, safety, mobile, desktop, garden/walls | substantive | All ten present |

## 2. Authority discipline

**Cory-owned decisions made or assumed without a label or routing to H**

- **Blocker.** Per-party visibility of terms and contact, and the identical record (top 2).
- **Blocker.** Brief creation free versus paid (top 3). I4 is labelled [R], and D7 misquotes Cory.
- **Blocker.** Adult assurance before verification exists (top 4).
- **Should-fix.** Replacing the per-term negotiation loop with concerns (top 8).
- **Should-fix.** Participant withdrawal before the freeze and amendment after it (top 6). Both change what "agreed" means, and neither is routed.
- **Should-fix.** `G stage 4` builds the public link page `modelingstandard.com/handle` on [CA] (FEATURE-REVIEW:118) while the ratified VISION:445 says public profile URLs "need a decision: do they exist at all". This breaks the README's own rule ("does not build on [CA] where a ratified statement exists"). Fix: list it as a named stage 4 Cory decision in H's "Not in this packet" section with "must be decided before stage 4".
- **Nit.** `I §5` sets role-module contents (a photographer's gear, rate card; a model's measurements). FEATURE-REVIEW:42 says craft markers are "Claude's inference, to be validated by Cory". Label them as examples pending Cory.
- **Nit.** `I §3` fixes four navigation destinations and "no inbox". This is product IA, and I is framed "for Cory's reaction", so it is fine. Add "Cory decides" to its status line to match A.
- **Nit.** `E5` two-kind compensation (drops `collab`, `hybrid`, `gifted` from LEXICON:32) is marked "Fable, confirm with Cory" but never appears in H. Put it under D4.

**Decisions routed to Cory that are technical or already settled (flooding)**

- **Should-fix.** D1 and D5 are marked "Blocks slice 1", yet H says D1 does not change the data model and D5 blocks "screens and copy; nothing else". Blocking engineering start on them idles the team. Reclassify both as "blocks slice 1 acceptance, not start". D4(a) is similar: validation can be written against a configurable required-block list.
- **Nit.** D4(b) "whether request metadata (IP, browser) is recorded" is a privacy and technical default that belongs to Dustin and counsel. Set it as a default Cory can veto.
- **Nit.** D7(a), "confirm adult-only", is already the charge's default (§13: "Start adult-only unless Cory explicitly decides otherwise"). Keep it as an FYI line, not a decision.

## 3. Evidence fidelity (28 claims checked)

| # | Package claim | Tag | Evidence | Verdict |
|---|---|---|---|---|
| 1 | A §2 Cory "lost money and months of work to verbal terms" | [R] | VISION:352 | OK |
| 2 | A §2 "the real competitor is the status quo" inside an [R] paragraph | [R] | COMPETITIVE-LANDSCAPE:63, a web scan, NOT APPLICABLE; implications INFERRED | **Overstated** (should-fix): split into [agent] |
| 3 | A §2 two failure modes, "That tension is the actual product" | [R] | VISION:511 | OK |
| 4 | A §3 photographers "probably the larger paying segment" | [CA] | RECONCILIATION:76; recon A Q-38 "Agent" | **Overstated**: retag [agent] |
| 5 | A §3 crew are full parties | [R] | VISION:374 | OK |
| 6 | A §3 organizers and clients are free invitees | [CA] | FEATURE-REVIEW:126 | OK |
| 7 | A §4 "The consent record is the point" | [R] | VISION:350 | OK |
| 8 | A §5 priority order, comp cards "the wedge" | [R] | VISION:413-420 | OK |
| 9 | A §8 documents and PDFs free, including with non-users | [R] | VISION:469 | OK |
| 10 | A §9 "safety platform... don't want it reopened" | [R] | VISION:344 | OK |
| 11 | A §9 access "scoped and expiring" | [R] | VISION:432-436 (Cory block, approved doc) | OK |
| 12 | B I3 "server-side and tested against negative cases" | [R] | DOCTRINE:79 is **PROVISIONAL** | **Overstated**: tag [R-qual]. B's notes flag the PROVISIONAL status for I4 but not I3. |
| 13 | B I5 deliverables and usage cannot be TBD; amounts numeric | [R] | DOCTRINE:65 covers compensation only; LEXICON:241 allows "TBD" for non-compensation fields | **Overstated**: tag the extension [F] and point to D4. As written, I5 decides D4(a). |
| 14 | B I6 "no pull without a prior push" | [CA] | FEATURE-REVIEW:106 | OK |
| 15 | B I8 internal identity | [R] | VISION:46 (SP-008) | OK |
| 16 | B I4 "never behind an entitlement... creating, presenting" | [R] | VISION:469 covers documents only; COST-REALITY:100 [CA] makes initiating briefs paid | **Contradicts Cory without saying so** (top 3) |
| 17 | D §4 "I'd almost not know I signed up" | [CA] | FEATURE-REVIEW:74 | OK (the Knock mechanism around it is "Fable + Cory") |
| 18 | D §7 scanning "not deferrable by phasing" | [CA] | CORY-QUESTIONS:195 | OK, but the same Cory line's age-gating requirement is dropped (top 4) |
| 19 | E Participant: "each person's deal is set independently (a prototype-era reason Cory's docs preserve)" | none | BLUEPRINT.md:343-361, agent-authored archive | **Nit**: say "prototype blueprint", not "Cory's docs" |
| 20 | F §1 four changes "forced by ratified Cory doctrine" | [R] | Only rows 1 and 2 are | **Overstated** (top 7) |
| 21 | F §3 "Documents and records free, including for participants without prior accounts" | [R] | VISION:469 | The tag is fine, but the slice excludes documents. Change to "Records free..." |
| 22 | F §3 "must already feel like a professional standard, not a form" | [R] | Cory's garden principle; "not a form" is Fable's | **Nit**: tag [F] |
| 23 | G "Cory chose structured concerns instead" | implied CA | CORY-QUESTIONS:157: per-term compliance-% negotiation plus contact on accept | **Misstated** (top 8) |
| 24 | H D1 "Cory confirmed: one workflow, six costumes" | CA | "Six costumes" is Claude's phrase (FEATURE-REVIEW:88, a document of "Claude's recommendations"); Cory confirmed consolidation (CORY-QUESTIONS:165). Recon B §0.2 introduced the misattribution. | **Nit**: "Cory confirmed one engine plus presets" |
| 25 | H D4 "thirteen minutes (Cory's own complaint)" | CA | CORY-QUESTIONS:165: the figure sits in the decision column; Cory confirmed the *driver* ("forcing the full form every time loses users") | **Nit**: attribute the driver, not the number |
| 26 | H D4 "Cory's docs list his own eight: purpose, roles... responses" | CA | VISION:77 is vision-statement prose, not a CORY block, and "responses" is not a term block. I §4 lists a different eight (adds when/where, drops responses). | **Should-fix**: pick one list, call it Fable's proposal derived from VISION:77, and make I §4 and D4 match |
| 27 | H D2 "material changes return to the people... affected" | [R] | VISION:152 | OK |
| 28 | README "first slice is built to the doctrine" | [R] | DOCTRINE:48 (down payment), :50 (releases) | **Overstated** (top 9) |

Cory statements in recon A that the package contradicts or drops without saying so: COST-REALITY:84/100 (briefs are paid initiating presence); COST-REALITY Rule 3 (verify at the first act of participation); CORY-QUESTIONS:157 (contact on mutual accept, compliance-% negotiation); VISION:150 (each participant reviews "the terms relevant to them"); DOCTRINE:48 (down payment).

## 4. Charge prohibitions (§27)

| Prohibition | Finding |
|---|---|
| port old app / preserve schema / route parity | None found. E's TermsDraft fields echo LEXICON and the old test PDF (chaperone, closed set, private change area), but they are labelled "Cory-owned vocabulary". OK. |
| six brief builders | None. One engine plus presets. |
| document tools | None. G explicitly excludes "document tools outside a shoot". |
| Explore | None. No Discovery domain. |
| old tier model | None. Stage 6 cites Cory's July concept, not the prototype's tiers. |
| Replit abstractions | None. |
| youth / payments / referrals now | None built. The youth seams are one column and one enum value; OK. |
| microservices | None. |
| vendors before requirements | **Nit.** D commits now to headless Chromium for PDF, which is an operational choice with weight, not a library. Otherwise vendors are deferred correctly. |
| over-abstract future features | **Should-fix, near-violation.** (a) C §5 "reserved package directories" for five unbuilt domains: delete them; directories cost nothing to create later. (b) D §2 generates an OpenAPI document with no consumer: drop it. (c) BearerGrant `kind` values `share_link` and `access_grant` in slice 1: keep the table generic and add the enum values in stage 3. (d) The import-boundary lint for an Entitlements module that will not exist until stage 6 is harmless but premature; add it in stage 6. |
| technical convenience answers Cory questions | **Should-fix, near-violation.** E3 ("no diff engine") and F §1 row 4 ("the prototype... had it") (top 7). |

## 5. Internal consistency

- **Should-fix. A version diff is required but not scoped.** `I §4` and `H D2(b)` preferred answer: show each participant "what changed since the version they accepted" in stage 1. `F §4` excludes "per-participant diff" and no AC covers a changed-fields list. A version-to-version field diff is needed either way. Fix: add F AC5c ("v2 shows the list of changed term blocks relative to v1"), or drop the line from I and H.
- **Should-fix. B I4 against F AC3.** I4 makes agreeing free "for invitees without accounts"; F requires an account to accept. Reword I4 to "for invitees, including those who create an account only to respond".
- **Nit. B I1 against E Presentation.** I1 says evidence tables are insert-only and protected by a trigger, while E leaves `first_opened_at` as an update or an event table. Pick `presentation_event`.
- **Nit. E Shoot.lifecycle.** It includes `archived`, but it is described as "a cache of the agreement state". Archival is operational. Drop `archived` from lifecycle and rely on `archived_at`.
- **Nit. F excludes delivery tracking; I §6 puts "record delivery" in stage 4, and G stage 4 does not list it.** Add it to G stage 4 or remove it from I.
- **Nit. D §13 defers OAuth to "stage 3 or later"; G never schedules it.** Add it to G stage 3 or 5.
- **Nit. D9 "answered before the public launch".** G stage 6 evidence does not gate on it. Add "retention policy set with counsel (D9)".
- **Nit. D7 "confirm before stage 3".** D7(b) shapes I4, which D enforces from stage 0. After fixing top 3, move D7(b) to "before stage 0 lint", or drop the stage 0 lint (§4(d)).
- **OK.** H's blocking flags match F §7 (D1 to D5). The G stage exclusions are consistent with F §4. The C dependency rule matches D §13's import boundary.

## 6. Technical soundness (D, E)

- **Should-fix. Node 22 LTS for a greenfield started in late 2026.** `D §1, §13`. Node 22 is in maintenance and reaches end of life in April 2027. Node 24 has been Active LTS since October 2025. Recon C §4 warned against exactly this ("pick current LTS... up front"). Fix: Node 24 LTS.
- **Should-fix. No abuse throttling on commands that send email.** `D §4, §9`. Passwordless login and invitations both send mail to arbitrary addresses; without limits this enables email bombing, address enumeration and burning the sender's reputation, and a two-person team cannot absorb a deliverability incident. Fix: add to D §5 per-email, per-IP and per-account rate limits on `requestLogin` and `present`/`invite`, uniform responses to login requests, and a registry field `rateLimit` required on every command that sends mail.
- **Should-fix. Record PDF and canonical storage** (top 10).
- **Should-fix. Headless Chromium inside the single API process.** `D §8, §9`. Chromium adds hundreds of MB to the image and memory spikes during the render job. With a single-instance, in-process worker, one bad render can take the API down. Fix: either decide now on a Node PDF renderer (react-pdf or pdf-lib) behind `PdfRenderer`, keeping one shared React component tree for screen and PDF, or run Chromium in a child process with a memory cap and a timeout. Record the choice in "decide now".
- **Should-fix. The command registry risks becoming a bespoke framework.** `D §2`. Generating the route table, client types, OpenAPI and the test matrix is code generation a two-person team must maintain (charge §15: "giant generic frameworks"). Fix: registry = a typed array of `defineCommand({name, input, output, policy, handler})` objects. At boot it registers Fastify routes and fails if `policy` is missing. The web app imports the shared types from `packages/kernel` directly (no codegen). The authorization test iterates the same array. Drop OpenAPI.
- **Nit. "Bound to the requesting browser where possible"** (D §4) breaks the common flow where a phone mail app opens links in an in-app browser. Make the code the primary cross-device path.
- **Nit. "SSR or meta-framework for public pages (stage 4)".** A link page is one server-rendered HTML template from the same Fastify app. Say so, rather than leave a meta-framework migration open.
- **Sound, keep:** one deployable; Postgres with an `app` and a `migrate` role plus triggers on evidence tables; RESTRICT foreign keys plus migration lint; `createApp(deps)` with fakes; the generated negative-authorization matrix; the outbox with `SKIP LOCKED`; server sessions; UUIDv7 internal ids; the CI gate order. These map one-to-one onto recon C's ranked "do not repeat" list and are appropriately boring.

## 7. The hard questions

**Is F small enough and large enough?** It is large enough. It exercises every structural invariant that is expensive to retrofit (immutability, deny-by-default, bearer grants, outbox, renderer, n parties). It is at the upper edge of one program, and the scope risk lies in UX more than architecture. Fix: in slice 1, replace I §4's "document you edit in place" editor with a structured form beside a live document preview. Rendering the reading view as a document stays in scope; inline document editing moves to stage 3 with the design system. Also make "Cory runs three real shoots" (G stage 1 exit) a beta-readiness signal that runs in parallel with stage 2, not a gate on starting it, so the build does not wait on Cory's shoot calendar.

**Process for process's sake?** Mostly no; the package is lean for its brief. Items to cut: the reserved empty domain directories (C §5), OpenAPI generation (D §2), and the I7 "capability registry". In a greenfield build nothing simulated should ship, so replace the registry with the rule "no simulated capability exists in the production build" plus a copy review. The provenance tags are worth keeping.

**Would an excellent founding team disagree with a major call?** Yes, in four places.
1. *The D3 reasoning.* A magic-link account proves the same thing a bearer link does: control of an email inbox. The real gains from an account are a durable home for records and binding across shoots, not stronger evidence. The team would present D3 to Cory on those terms and would likely consider bearer-accept with a one-time code at signing, plus account creation offered after acceptance. That is lower friction on the acquisition path the package itself calls central (A §7).
2. *One identical record for n parties* without a visibility decision (top 2).
3. *Excluding release documents from slice 1.* Cory's priority one is safety documents (VISION:413), and element 5 ties releases to usage. A team might ship the model release inside slice 1 as a single template, assembled from the version and signed with the same affirmation, because a paid shoot with commercial usage is not usable in practice without one.
4. *The bespoke registry with codegen and Chromium in-process* (§6). Otherwise they would agree: a boring TypeScript monolith, Postgres as the single system of record, immutable versions, adult-only with seams, and no discovery until work-first posting exists.
