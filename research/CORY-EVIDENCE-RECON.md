# Recon A: Cory Evidence (Mode A only)

Scope: extract Cory's explicit decisions, reasoning, language, and unresolved seams from the ShootBriefGenerator repository's `docs/` directory (commit bfbf5f1) (plus `CLAUDE.md`, `design_guidelines.md`). Read-only. Nothing designed here.

Citation form: `FILE:line`. All files under the ShootBriefGenerator repository's `docs/` directory (commit bfbf5f1) unless noted. Quotes are verbatim and short.

---

## 0. READ THIS FIRST: evidence-quality caveats

1. **"Cory said" is always a transcription by an agent or by Dustin, not Cory-authored text.** VISION.md:18 and PRODUCT-DOCTRINE.md:20 both say the ratification "is repository provenance, not a quotation, signature, contract, legal opinion, or implementation authorization" and was "transcribed into the canonical documentation set on 2026-07-23" from a 2026-07-17 review session. The `> **CORY - ...**` blocks read like lightly edited first-person speech, but nothing proves verbatim. Treat load-bearing lines as "recorded Cory direction", and confirm with Cory before building product law on any single sentence.
2. **Git history is not usable for authorship.** The checkout has exactly one commit: `bfbf5f1 seeravenproductions docs: track VISION Tension 3 & 4 downstream open items in CORY-QUESTIONS` (2026-07-23). `git log` shows no other authors. The "PR #8, commit 5d515388" ratification referenced in VISION/DOCTRINE/README is NOT visible in this checkout and cannot be verified here. (Inference only: `seeravenproductions` is probably Cory's or Dustin's GitHub handle; the repo has `Cory_Raven_CompCard*.pdf` in `attached_assets/`. Not confirmed.)
3. **Only two documents carry `Decision status: APPROVED` for product content: `VISION.md` and `PRODUCT-DOCTRINE.md`** (headers, both `ACTIVE / APPROVED / Product approval: Cory`). ROADMAP.md is APPROVED only for the July 27 landing/waitlist boundary (ROADMAP.md:7). `docs/README.md` and `decisions/README.md` are APPROVED as index/governance, not product. Everything else in the corpus is PROVISIONAL, REQUIRES CORY, PENDING, DRAFT, INFERRED, or NOT APPLICABLE.
4. **Inside VISION.md, approval is not uniform.** The header says APPROVED, but the ratification checklist (VISION.md:538-545) leaves this UNCHECKED: "pricing, launch youth scope, youth image hosting, legal language, and exact workflow". Sections marked PROPOSED/"NEW REQUIREMENT"/"PARTIALLY ANSWERED" inside the approved document keep those qualifiers.
5. **Several later-in-the-day Cory rulings live only in non-ratified documents** (COST-REALITY, FEATURE-REVIEW, CORY-QUESTIONS §13, LAUNCH-MILESTONES). They are attributed to Cory with a date, but their host document's header says otherwise. I list them in section 1 as "Cory-attributed, host doc not ratified" (tag `[CA]`) so the planner can see the difference from `[R]` (ratified in VISION/DOCTRINE).
6. **Several documents are stale relative to VISION/DOCTRINE** (e.g. RECONCILIATION §A says VISION is "REVIEW / REQUIRES CORY / PENDING"; `_OPEN-ITEMS.md:56` still lists "Ratify VISION + DOCTRINE"). Both are already APPROVED. Do not read stale status as current.
7. **The charge's phrases are mostly paraphrase of Cory-attributed doc text, not verbatim.** I checked: "Safety is not the upsell" does NOT appear in the docs (nearest: "The documents are the product's conscience; they are never the upsell", VISION.md:469). "A child is not an account holder" does NOT appear verbatim (nearest: "No children can make accounts, only guardians of the models", VISION.md:226). "Beautiful garden, invisible walls" (VISION.md:173), "freezes the AGREEMENT... does not witness the PERFORMANCE" (DOCTRINE:40), "TSA of the brief world" (VISION.md:247; DOCTRINE:59) are verbatim.

Tag key used below: `[R]` = ratified (in VISION/DOCTRINE, APPROVED docs). `[R-qual]` = in an approved doc but explicitly qualified/proposed. `[CA]` = Cory-attributed with date, but host document is not ratified. `[agent]` = agent-authored.

---

## 1. RATIFIED DECISIONS

### 1.1 Product identity and positioning

- `[R]` **Product name is MODELING STANDARD.** "Before the Shoot" and "brief generator" are "placeholders", "stale text to fix, not a decision to debate." VISION.md:58-67. Domain `modelingstandard.com`; Cory owns `modelingstandard.com`, `beforetheshoot.app`, `beforetheshoot.com` (VISION.md:69). "Before the shoot" survives only as lowercase copy phrase and tagline "Every great shoot starts before the shoot." VISION.md:65.
- `[R]` **Identity: professional business suite for photography and modeling collaborations, with safety embedded.** DOCTRINE:28. Externally "positioned... as a professional business suite" (VISION.md:77).
- `[R]` **Primary identity = safety platform, not a combination.** "Safety platform. Not a combination. This is settled and I don't want it reopened by inference from the code or the archived blueprint." VISION.md:344. Final shape: "safety platform, with enablement as where it grows later, and workflow as the machinery underneath. In that order." VISION.md:356.
- `[R]` **"The consent record is the point. The workflow only exists to produce it."** The product is the brief, "written ahead, agreed on both ends, and anything not in it is off the table once the shoot starts." VISION.md:350.
- `[R]` **Cuts both ways**: "The record protects the photographer exactly as much as it protects the model." VISION.md:352. Cory has "lost serious money and months of work because the terms were verbal."
- `[R]` **Homepage line (internal):** "nobody should show up to a shoot without documented boundaries." VISION.md:358. LANDING-PAGE-COPY.md:120 says it was deliberately re-voiced for public copy.
- `[R]` **Positioning keystone: "Beautiful garden, invisible walls."** "Adoption is protection... protection is the FOUNDATION, not the PITCH." Built protection-forward, must not be presented protection-forward. VISION.md:173-186. "Fear-based framing is off-brand."
- `[R]` **The all-in-one business dashboard is "a first-class value proposition, not a side feature"** and "the acquisition engine for the non-fearful majority." VISION.md:185. "If a safety mechanism makes the garden uglier or harder to use, it is being built wrong." VISION.md:186.
- `[R]` **Market position: "a freelance app for the new age of agency redundancy... an option between amateur and signed."** VISION.md:459 ("That sentence is the market... it should [be in the vision statement]").
- `[R]` **Lead with model and guardian manager ("model-forward and momager-forward"), not all roles equal.** "Everyone is respected equally. The product is not shaped equally." Majority of app exists for "irrefutable transparency about what the shoot day will entail." VISION.md:368-370.
- `[R]` **Second product surface**: "the tools to run their freelance modeling business", "downstream of safety, but... a real and intended part of what this becomes." VISION.md:378.
- `[R]` **Origin/why** (motivation evidence): model before photographer; sets "had no consent culture"; ran own shoots on "transparency and overt consent at every stage"; models say "nobody else does this." VISION.md:346-348. Product "born ~5 years ago" moving Tokyo to Vancouver after hearing repeated predatory-"GWC" stories. VISION.md:364.
- `[R]` **Multifaceted goal, stated honestly:** "generational wealth for his family and protecting everyone." VISION.md:181.
- `[R]` **Launch shape: "A rollout that is too slow kills the trust."** "The launch must arrive substantially whole." Called "a product constraint, not a preference." VISION.md:409-411. (See conflicts, section 8: tension with charge's "one slice at a time" and with LAUNCH-MILESTONES.)
- `[R]` **Priority order, Cory's words:** 1 Safety documents ("a different category"), 2 Briefs, 3 Comp cards, 4 Portfolios, 5 Moodboards. Comp cards are "the wedge." VISION.md:413-420.
- `[R]` **Greenfield: "Nobody has ever used or seen this app. All accounts were test accounts made by me."** VISION.md:36. Decision: "greenfield replacement, not a migration." "Nothing to retain" (SP-008, VISION.md:46). "This fact buys schedule, not permission." VISION.md:54.
- `[R]` **Diligence outranks the event deadline.** VISION.md:336; ROADMAP.md:24-26 (attributed Cory 2026-07-17): "The hard priority is our own safety and diligence. The 27th bends to that, never the reverse." July 27 "never a hard launch. A probable date." CORY-QUESTIONS.md:181.
- `[R]` **Sole authority:** Cory is sole project owner and product authority (GOVERNANCE.md:34-36, PROJECT-ROLES.md:22, CLAUDE.md:13). Two founders, "Cory and Dustin. Founders, not employees" (CORY-QUESTIONS.md:180); founders' agreement "remains unwritten". Company "remains 100% Cory's" (CORY-QUESTIONS.md:145, `[CA]`).
- `[R]` **Geography:** "Canada and the States don't have to be the end... but milestones. Let's walk before we fly." VISION.md:269. Adult side globalizes; youth side is jurisdiction-locked. Which markets/order is OPEN (section 3).

### 1.2 Safety philosophy

- `[R]` **Two failure modes, either disqualifying "no matter what the revenue says"** (Tension 8, VISION.md:497-503):
  - Mode one, feeding ground / honeypot: "If the protection is theatre, that isn't a neutral failure - it's a honeypot. The claim has to be true or the claim must not be made." VISION.md:499.
  - Mode two, witch hunt: "This cannot be a weapon. The record protects both sides or it protects neither." VISION.md:501.
  - "Both failure modes must be designed against simultaneously, and they pull in opposite directions. That tension is the actual product." VISION.md:511.
- `[R]` **Mechanism: the product "works partly by repelling, not only by documenting."** "Bad actors fear the record." Refusal to use a free app that does nothing but make everything transparent "is itself a red flag." VISION.md:503, 473.
- `[R]` **"Nothing is 100%. Get as close as we can."** Must never claim otherwise. VISION.md:505. Product truthfulness is APPROVED doctrine: demos/copy must not imply "operational payments, identity verification, legal enforceability, moderation staffing, encryption guarantees, or production readiness unless verified." DOCTRINE:93.
- `[R]` **Through-line principle: "when a feature creates a risk, delete the affordance rather than police it."** Applied to: negotiable rates, profile browsing, free-text reviews, user payments, deliverable storage, RAW uploads. RECONCILIATION-2026-07-17.md:128 says it "deserves to be Principle 1" (that is an agent recommendation; Cory stated the pattern for reviews at VISION.md:513: "This is the same design signature as removing 'negotiable' rates: delete the affordance rather than police it.") `[R]` for the pattern in VISION; `[agent]` for promoting it to "Principle 1".
- `[R]` **MVP moderation posture (2026-07-17):** witch-hunt surface "removed structurally, not moderated: unchecked written reviews cannot exist until further notice. There are no free-text reports." Artifact = "signed PDF, usable by any party". "Reports generate a notification, and strikes are flagged against the user until resolved." Staffed/AI adjudication "not in the MVP." VISION.md:513; CORY-QUESTIONS.md:177-178.
- `[R]` **Aftermath acceptance:** "It's not a perfect system; deterrents only work as well as we make them. People are going to get hurt by people that hurt people." CORY-QUESTIONS.md:177.
- `[R]` **Everyone gets a voice on shoot-day treatment:** "everyone gets a voice and protection. No exceptions by role." VISION.md:376.
- `[R]` **Presence requires agreement (hard rule):** MUAs, stylists, assistants "must sign off on consent of the terms or they cannot be in the room." "If you have not agreed to the terms of the shoot, you are not on set." VISION.md:374.
- `[R]` **Photographer protection is a smaller list**: "payment, deliverables, terms. Financial and contractual, not bodily." VISION.md:372. Crew (MUA/stylist/assistant) protection: "financial, deliverables, and consumables used on the shoot." VISION.md:374.
- `[R]` **Nudity structurally unavailable to any brief involving a minor** - "an architectural gate" not a validation rule. VISION.md:234. Whether a minor's brief can EVER carry nudity terms is still OPEN and legal-review-gated (CORY-QUESTIONS.md:71).
- `[R]` **"Underwear is not nudity."** Lingerie/underwear is legitimate professional work and must not be collapsed into the nudity category. VISION.md:236.
- `[R]` **SP-027 (minor/nudity gate cosmetic-only) is "the top item in the repository" and "failure mode one in miniature."** VISION.md:49, 509.
- `[CA]` **On-set safety tool, opt-in check-in / trusted-contact share:** recommendation "Yes, lightweight" is an AGENT recommendation (FEATURE-REVIEW.md:94-95; CORY-QUESTIONS.md:166; `_OPEN-ITEMS.md:48` "recommend yes"). NOT decided by Cory. Listed here only so it is not lost; see section 4.

### 1.3 Agreement / consent model (Cory's core)

- `[R]` **Keystone: "the product freezes the AGREEMENT. It does not witness the PERFORMANCE."** DOCTRINE:40. Snapshot's job: "make 'we never agreed to that' impossible to say." Cannot prove a boundary was later crossed. "This is help. This is a paper trail. This is not a lawyer. We are not judge, jury. We are peace of mind." Onus stays on the wronged party to speak up; when they do "they hold an undeniable, frozen record of exactly what was agreed, by whom, and when." DOCTRINE:42.
- `[R]` **A consent snapshot MUST capture (8-element evidence set, all APPROVED)**, DOCTRINE:44-53:
  1. Exact clause text as presented, frozen verbatim, "not a reference to a mutable template."
  2. Specific agreed parameters (nudity level, physical contact, every boundary toggle) as values.
  3. Compensation terms: amount, down payment, payment timing, visible to and signed by both parties.
  4. Deliverables and delivery timing.
  5. Usage rights and the release documents they trigger. "These are existing standard documents; the product does not invent them, it assembles and captures them."
  6. Each party's signature bound to the specific clauses it affirms, co-located in the delivered document, "not a blanket signature on a separate page."
  7. Timestamps and the identity/credential used to agree, per signature.
  8. Final immutable PDF delivered to all parties as the portable artifact each holds independently.
- `[R]` **Consent-bearing records are append-only; ordinary removal = archive, not destruction.** DOCTRINE:56. "Records of agreement outlive account deletion" (DOCTRINE:56 parenthetical). Retention period is still open (Q-04).
- `[R]` **A consent record must preserve** the complete brief version, participant-specific terms, compensation, deliverables, usage/release terms, the agreement checkpoint, timestamps, identity/credential. DOCTRINE:55.
- `[R]` **Signatures are load-bearing product behavior: "It's like the TSA of the brief world."** "They do not make the brief fully legal, and we do not want to be a legal middleman. They are a checkpoint: they document, they mark the moment of agreement, and they deter." VISION.md:247-251. "Signatures are intended product behavior. They are load-bearing." Disabling `briefDocuments.ts` is "security containment... not a decision that the product does without signatures. Rebuild it properly." VISION.md:253.
- `[R]` **Login is not verified identity.** VISION.md:317 (boundary). "Verified identity" meaning still OPEN.
- `[R]` **Material changes return to affected people** (promise-level): "Material changes return to the people whose understanding or response may be affected." VISION.md:152. Exact re-consent rules are OPEN (Q-08).
- `[R-qual]` **Core journey** (DOCTRINE:96-104) is labelled PROVISIONAL as a whole ("Core journey - provisional"). Steps: creator defines shoot/participants/comp/deliverables/usage/boundaries/safety; participant reviews the same version and accepts/declines/raises concerns; system preserves exactly what each agreed; creator reviews responses and confirms; both retrieve final package.

### 1.4 Compensation

- `[R]` **Compensation must be explicit; vague "negotiable" is not an approved direction.** DOCTRINE:65. Cory: the removal of "negotiable" rates "were not accidents and they were not incidental... Do not treat them as legacy quirks to be tidied away." VISION.md:360. Reason: "vague rates are how talent gets squeezed on shoot day." VISION.md:360.
- `[R]` **"We absolutely do not deal with payments between users."** Scope invariant. Brief documents compensation; money moves off-platform. Stripe (planned) is only users paying MS and MS paying its own obligations, "including affiliate/referral payouts (platform->user marketing spend)". VISION.md:298-300. DOCTRINE:66 repeats "no user-to-user payments" as APPROVED.
- `[R]` Swipecast-style payment handling "is rejected under this invariant, unless Cory ever explicitly reverses it." VISION.md:305.
- `[CA]` **In-kind compensation is real** (Surrey Fashion Week example is entirely non-cash). REAL-BRIEF-EXAMPLES.md:174. Confirms comp must support TFP/TFV richly. (Doc is evidence-only; the inference is an agent's.)

### 1.5 Privacy / discovery

- `[R]` **"The work is public. The people are not."** "This isn't social media. It's a professional dashboard." VISION.md:382-384. (Tension 3.)
- `[R]` **Discovery bridge = moodboards and concept briefs, not profiles.** "You browse the work and the concept, never a gallery of people." Requests (to send/receive comp cards and portfolios) begin "only from" a piece of work. VISION.md:386-388. "The inversion: conventional platforms let you browse people to find work. This product lets you browse work to reach people, by request." VISION.md:390.
- `[R]` **No profile browsing. The capability itself is removed.** "if a creep makes an account, he must not be able to browse through everyone's profiles and photos." "A logged-in account grants you nothing to look at." VISION.md:428-430. DOCTRINE:72: "There is no people directory; access begins from something deliberately shared."
- `[R]` **Comp cards and portfolios: unlimited count per user; visible "strictly on request, and temporarily."** Owner grants to a specific person for a bounded window. "There is no state in which material is simply available to whoever is logged in." VISION.md:432-434. Request mechanism direction: "narrower scope, real expiry, owner control over each grant." VISION.md:436.
- `[R]` **Existing `isDiscoverable` default-true is rejected** (SP-013 resolved): VISION.md:440. Blanket-no-expiry `share_token` is "a hole" (VISION.md:446).
- `[R]` **Adult vs youth unverified default (corrected):** an unverified account sees "the SFW slice of the adult world - never youth content." VISION.md:232.
- `[CA]` **Access invariant: "You can only request access to something posted."** FEATURE-REVIEW.md:106 (Cory, 2026-07-17). "No pull without a prior push." Host doc PENDING.
- `[CA]` **Model correction: no people-directory and no cold request of a stranger's comp card. Two directions only: share-forward (outbound) and job-board (post -> reply).** FEATURE-REVIEW.md:101-105; PLATFORM-LIABILITY:79-83. Host docs PENDING/DRAFT. Partly in tension with VISION.md:388 (see section 8, C-11).
- `[CA]` **"My Standard"**: named link-in-bio page `modelingstandard.com/username`, also QR on physical comp cards; all socials. "DECIDED (Cory, 2026-07-17)". FEATURE-REVIEW.md:118, CORY-QUESTIONS.md:160. Public link = invite link = affiliate link; "only two doors: invite, or someone's page." CORY-QUESTIONS.md:159.
- `[CA]` **Public moodboards require a mini-brief** (what / WHERE / WHEN / classification; city-level only publicly, exact address after mutual accept): "can't accidentally become Pinterest." FEATURE-REVIEW.md:122-124, 130-132. CORY-QUESTIONS.md:162 says explicitly "needs doctrine ratification at next pass." NOT yet ratified.
- `[CA]` **Location safety rule: "A public board of precise locations+dates where minors will be is a predator's calendar. City until accepted, always."** FEATURE-REVIEW.md:124 (marked "safety rule, non-negotiable on youth side").
- `[CA]` **Maps API deleted permanently** ("don't wanna pay any more APIs nor invite anything more in than I have to"); own cities dataset. FEATURE-REVIEW.md:123; CORY-QUESTIONS.md:161.
- `[CA]` **No unstructured communication** ("Cory's model, sharper than 'no DMs'"): every message is a note bound to a brief term; negotiation iterates as compliance %; contact exchanged on mutual accept then hand off. "Ungroomable by construction; negotiation = consent evidence." FEATURE-REVIEW.md:91-92; CORY-QUESTIONS.md:157 marked DECIDED. Mechanism details are agent elaboration (section 4).
- `[CA]` **Gamified analytics: three deliberate NOs** (no public leaderboards; no "who viewed you"; guardian-managed profiles get gamification OFF). FEATURE-REVIEW.md:148-151 ("ADDED 2026-07-17 (Cory)"). Details agent-authored.
- `[CA]` Onboarding law, "Tesla directive": as few clicks as possible, every fact asked once appears everywhere, first profile view "magically finished." FEATURE-REVIEW.md:128.

### 1.6 Youth / guardians

- `[R]` **Adult account holders primary; a minor requires a guardian-managed profile; adult and youth content structurally separated.** DOCTRINE:86.
- `[R]` **"No children can make accounts, only guardians of the models."** "Every account holder... is an adult, on both sides of the partition. A minor is never a user - a minor is a talent profile managed inside a guardian's (adult) account." VISION.md:226. Age verification therefore "always verifies adults."
- `[R]` **Structural rule: "no underage model runs their own career on this platform."** "A guardian manager is required, not optional, not a setting." "Guardian manager", not "momager" ("Momager is a buzzword"). VISION.md:453-455. Guardian manager "has to be real infrastructure, not a checkbox." VISION.md:457.
- `[R]` **"Two platforms on one system - not one platform with filtering"**: two ecosystems that never overlap; separate signup paths, content pools, discovery; verified adult professionals may work in both but content is classified into one world at creation. VISION.md:222-224.
- `[R]` **"No adult moodboard is ever shown to a child. Absolute."** Youth ecosystem "is not publicly browsable"; entry "by verified guardian or verified professional." VISION.md:228.
- `[R]` **Moodboards classified at creation (youth or adult), "not optional, not defaulted, and not a filter - a wall."** Never cross-shared. VISION.md:230.
- `[R]` **Aging out is gradual (Cory 2026-07-17):** under 18 guardian-managed mandatory; 18-19 grace period, switching optional; 20+ adult version required. "Roughly two years and is Cory's call to finalize." VISION.md:238-243. (So the grace length is `[R-qual]`.)
- `[R]` **Youth sub-decisions REQUIRE professional legal review "not an AI or the team"**: whether v1 ships youth, whether a minor's brief may carry nudity terms; also "Minors, likenesses, releases, guardian authority, retention of a child's data, and who may consent to what." Standing rule APPROVED. VISION.md:463.
- `[R]` **Youth launch DEFERRED** "until doctrine, professional review, and validation are complete." DOCTRINE:89. (Yet see conflicts: VISION.md:263 says the launch "includes guardian management" and Cory has "direct access to three under-17 runway companies".)
- `[R-qual]` **No-upload youth dashboard: PROPOSED, NOT default.** Cory called a template-only no-photo youth tier something that "hits different": "an Excel sheet, not a real app." VISION.md:190-194. "Cory explicitly 'doesn't want to lock it in.'" VISION.md:214. Internal inconsistency inside the section (line 192 says downgraded from default; line 214 says "should be the default assumption for the youth-tier PRD"). Treat as an open option (Q-13).
- `[CA]` **Location and referral safety constraints on youth:** referral rewards must never create incentive to pull minors (CORY-QUESTIONS.md:129).
- `[CA]` **Gamification off for guardian-managed profiles**: "Do not build the stage-parent amplifier." FEATURE-REVIEW.md:151.
- `[CA]` **Scope corrections** (Cory questions, agent conclusions): "what does this site have to do with kids working?" -> child-labor/earnings law is the employer's, not the platform's. PLATFORM-LIABILITY:85-96. Conclusions are agent reasoning; counsel has not confirmed.

### 1.7 Monetization / tiers

- `[R]` **Baseline: all consent documentation, model releases, and PDFs free, "no exceptions", "including when the user is working with people who are not on the app at all"; includes the sensitive-content documents.** "The documents are the product's conscience; they are never the upsell." VISION.md:469. The tier draft that gated art/sensitive docs behind Pro is "Rejected." VISION.md:471.
- `[R]` **Monetization lives in "volume and professional convenience, never in safety."** VISION.md:484. Cory "named that trade-off and took it anyway" (loses a photographer subscription pull), VISION.md:491.
- `[R]` **Free tier costs ~zero per user; professional dashboard is definitively not free.** VISION.md:493 (cost-discipline addendum).
- `[R]` Pricing generations, tier definitions, price points, checkout, entitlements, payment provider: **DEFERRED** in DOCTRINE:68; "No pricing is approved for the July artifact." CORY-QUESTIONS.md:85.
- `[CA]` **Later same-day tier rulings (host = COST-REALITY, decision status NOT APPLICABLE; not in VISION/DOCTRINE):**
  - Free tier = documents-only; "safety only - everyone has access to safety, nobody free is on the business side." COST-REALITY:84, 99.
  - Comp cards are PAID: "giving away the strongest asset is not good business." COST-REALITY:99. (Contradicts VISION.md:475-480 "proposed free tier", see C-2.)
  - Invitee participation FREE: "one more level of psychological protection." Paid line = initiating presence (own profile, cards, boards, briefs). COST-REALITY:100.
  - "This isn't a free service in the bigger picture. It's a professional service." COST-REALITY:102. Sales line: "to be your own professional, you need a professional dashboard." COST-REALITY:99.
  - Capacity ladder LOCKED: **Free / Standard / Gold Standard / Diamond Standard.** Manager ladder: **Guardian / Agent / Agency** (Agency = custom, consultation). COST-REALITY:291-300; CORY-QUESTIONS.md:163. Manager pricing by managed-profile count, numbers TBD.
  - "Ratified pricing" $15/$29/$59 USD, $19/$39/$79 CAD. COST-REALITY:302-309 ("Subscriptions need to jump a bit. Match them instead of severely undercutting", line 267). Price is CAD/USD by IP with native prices. VISION.md:489 still calls the older $9/$19/$49 the "draft pricing" and DOCTRINE:68 defers all pricing. Not ratified in the canonical set.
  - Rule 4, delivery is transit not storage: "It's the last standing feature that isn't on the service." Expiry windows tier-scaled (14/30/extendable days), finished images only, RAW/TIFF/PSD/video blocked. COST-REALITY:104-140. Caps "Cory's to finalize."
  - Rule 3, verify on first act of participation, never at signup; ~$0.10 facial age estimation; guardian verified not child. COST-REALITY:38-52; CORY-QUESTIONS.md:184.
- `[CA]` **Referral**: credits-first rejected by Cory ("I won't see a dime for months"). Mechanism iterated; bright line "the invite tree is for TRUST, never for money." CORY-QUESTIONS.md:134-149. Parked; do not build.
- `[CA]` **Invite-only as possible permanent feature and sales pitch** ("Raya model"), brief invitees always bypass the gate; invite capacity scales with Standing. LAUNCH-MILESTONES.md:138-158. "Not locked; recorded as strong lean." Host PROVISIONAL/PENDING.

### 1.8 Identity / accounts

- `[R]` **No external OIDC subject as primary key; nothing to retain.** SP-008 disposition, VISION.md:46 ("Do not carry the pattern forward"). (Charge already covers; here for provenance.)
- `[R]` **Age verification happens at first act of participation and verifies adults / guardians** (Cory's design; VISION.md:226 for "always verifies adults"; details at COST-REALITY:38-52 `[CA]`).
- `[CA]` **Knock-born signup (Cory, 2026-07-17): "I'd almost not know I signed up"**: four fields, magic link, no password, no card. FEATURE-REVIEW.md:74-83. Whether "Knock" itself is Cory's: "INVENTED 2026-07-17 (Fable + Cory)" (FEATURE-REVIEW.md:50). Host PENDING.
- `[CA]` **Role-adaptive profiles / role modules "LOCKED" (equity of care).** FEATURE-REVIEW.md:36-42. Explicit caveat at line 42: craft-specific credibility markers "= Claude's inference, to be validated by Cory/community."

### 1.9 Legal posture (see section 6 for detail)

- `[R]` Signatures not legal instruments; legal language / enforceability / counsel adoption DEFERRED. DOCTRINE:59-60.
- `[R]` "Agents do not author final legal positions." (rule cited in USER-CONTENT-TERMS header). Jurisdiction **British Columbia, Canada** confirmed by Cory 2026-07-17 (CORY-QUESTIONS.md:179; USER-CONTENT-TERMS:63) `[CA]`.

### 1.10 Other Cory-attributed operating decisions

- `[CA]` Governing UX principle: **"The site has so many tools that à la carte would need a university degree. Preset workflows are essential."** Scenario presets auto-include safety/consent docs; "A preset may never remove a safety step to feel simpler." À la carte is escape hatch. FEATURE-REVIEW.md:20-28. Brief consolidation (6 types -> 1 engine + presets) "CONFIRMED", driver: "forcing the full form every time loses users" (13 min full brief). CORY-QUESTIONS.md:165.
- `[CA]` Non-modeling clients (grad photos, weddings, events) are first-class free invitees; MS serves a photographer's entire business. FEATURE-REVIEW.md:126.
- `[CA]` Voice rules: "Empowering, never fearful"; "No em dashes." LANDING-PAGE-COPY.md:27-28; "Cory's voice rules ban them" (USER-CONTENT-TERMS:69).
- `[CA]` Landing content: the Model Alliance stat belongs on the page (COMPETITIVE-LANDSCAPE:59; LANDING-PAGE-COPY.md:56); July 27 audience is a model runway with parents present (ROADMAP.md:22); Stage-0 landing + waitlist "safe to ship today" (ROADMAP.md:36-43, marked Cory 2026-07-17 in the soft-start ladder heading).
- `[CA]` Success definition: "Giving it 100% and seeing what happens." Hours: "infinite hours, this is my whole life." CORY-QUESTIONS.md:182-183.
- `[CA]` Financing: Cory carries financing personally, Dustin's family not exposed. FUNDING-MEMO:118-124.
- `[CA]` Marketing: education is the marketing; "USE EVERY LESSON, OWN EVERY WORD." MARKETING-ENGINE:19-36 (PROVISIONAL doc).

---

## 2. CORY'S OWN LANGUAGE (glossary)

Terms in bold are marked as Cory's coinage, wording, or naming ruling in the docs.

| Term / phrase | Meaning / source | Status |
|---|---|---|
| **Beautiful garden, invisible walls** | Positioning keystone: attractive suite outside, protection foundational and mostly invisible. VISION.md:173 | `[R]` |
| **Adoption is protection** | "They are the same axis, not competing ones." VISION.md:175 | `[R]` |
| **Protection is the foundation, not the pitch** | VISION.md:177 | `[R]` |
| **Freeze the agreement / witness the performance** | "The product freezes the AGREEMENT. It does not witness the PERFORMANCE." DOCTRINE:40 | `[R]` |
| **Peace of mind / not judge, jury / not a lawyer** | "This is help. This is a paper trail. This is not a lawyer. We are not judge, jury. We are peace of mind." DOCTRINE:42 | `[R]` |
| **TSA of the brief world** | Signature = checkpoint. VISION.md:247 | `[R]` |
| **The consent record is the point / the workflow is machinery** | VISION.md:350 | `[R]` |
| **Nobody should show up to a shoot without documented boundaries** | Internal homepage line. VISION.md:358 | `[R]`, re-voiced publicly |
| **Anything not in [the brief] is off the table once the shoot starts** | VISION.md:350 | `[R]` |
| **The work is public. The people are not.** / **This isn't social media. It's a professional dashboard.** | VISION.md:382-384 | `[R]` |
| **Browse work to reach people, by request** | The "inversion." VISION.md:390 | `[R]` |
| **Delete the affordance rather than police it** | Design signature. RECONCILIATION:128; VISION.md:513 | `[R]` (pattern) |
| **Presence requires agreement** | Crew must sign or not on set. VISION.md:374 | `[R]` |
| **Safety platform > enablement > workflow, in that order** | VISION.md:356 | `[R]` |
| **Comp cards are the wedge** | VISION.md:420 | `[R]` |
| **Option between amateur and signed / agency redundancy** | VISION.md:459 | `[R]` |
| **Two platforms on one system** | Adult/youth. VISION.md:222 | `[R]` |
| **Guardian manager** (NOT "momager") | Role name. VISION.md:453 | `[R]` |
| **Grace period / three states (u18, 18-19, 20+)** | VISION.md:238-243 | `[R-qual]` |
| **Underwear is not nudity** | VISION.md:236 | `[R]` |
| **GWC** ("Guys With Cameras") | Industry slang for exploitative amateur photographers. Internal context term, NOT UI copy (violates "empowering not fearful"). LEXICON.md:42; VISION.md:364 | context only |
| **Failure mode one / two** (feeding ground / witch hunt) | VISION.md:499-501 | `[R]` |
| **Repelling, not only documenting** | VISION.md:503 | `[R]` |
| **Invisible walls, not visible cages** | VISION.md:192 | `[R]` |
| **Launch whole** / "a rollout that is too slow kills the trust" | VISION.md:409-411 | `[R]` |
| **Tesla law / Tesla directive** | Onboarding: signed-up-and-active in as few clicks as possible; ask once, use everywhere; "magically finished." FEATURE-REVIEW.md:128 | `[CA]` |
| **Preset workflows** | FEATURE-REVIEW.md:20 | `[CA]` |
| **My Standard** | Link-in-bio page name; "check my Standard." FEATURE-REVIEW.md:118 | `[CA]` |
| **Standing** | Brand wordplay: progression/trust score. FEATURE-REVIEW.md:144 | `[CA]`/agent (label "Fable + Cory") |
| **The Knock / Soft No / Standing Invitations / Knock Card / Information-forward** | Request system for a no-discovery platform. FEATURE-REVIEW.md:50-72 ("Governing principle (Cory's naming): INFORMATION-FORWARD") | `[CA]`/agent |
| **Tier names: Free / Standard / Gold Standard / Diamond Standard** | "Every tier name markets the company." COST-REALITY:291-294 | `[CA]` LOCKED |
| **Manager ladder: Guardian / Agent / Agency** | "manager-axis names must self-explain - use the real-world words, no decoder ring." COST-REALITY:296-300 | `[CA]` |
| **Capacity is not role** | Three axes. COST-REALITY:281 | `[CA]` |
| **First month's price, paid as they pay** / "Their first month is yours - after that, they're all mine." | Referral pitch line. CORY-QUESTIONS.md:136-137 | `[CA]` parked |
| **The invite tree is for trust, never for money** | CORY-QUESTIONS.md:141 | `[CA]` |
| **Delivery is a river, not a lake** | Rule 4. COST-REALITY:104 | `[CA]` |
| **Equity of care** | Every role's credibility markers first-class. FEATURE-REVIEW.md:36 | `[CA]` |
| **Media kit / press kit** | FEATURE-REVIEW.md:157 | `[CA]` |
| **Can't accidentally become Pinterest** | Public moodboards need mini-brief. FEATURE-REVIEW.md:130 | `[CA]`, needs ratification |
| **Every great shoot starts before the shoot** | Tagline (lowercase phrase). VISION.md:65 | `[R]` |
| **"The shoot starts when everyone's on the same page."** | Landing hero (REVIEW, REQUIRES CORY). LANDING-PAGE-COPY.md:36 | `[agent]` copy, pending |
| **Use every lesson, own every word** | MARKETING-ENGINE:32 | `[CA]`, PROVISIONAL |
| **One dashboard instead of eight apps** | COMPETITIVE-LANDSCAPE:82 | `[CA]`/agent |

### LEXICON.md (what it defines; renaming flags)

- Status: "supporting, provisional terminology reference... do not treat it as product doctrine" (LEXICON.md:3). Brief types (7-13), roles (48), nudity levels (72), contact levels (86), releases (176), art/sensitive docs (187) each carry "PROVISIONAL... REQUIRE CORY" banners.
- **Terms defined:** Brief; six brief types (Quick Collab, Paid Shoot, Casting Call, Content Creation, Fashion Show Casting, Full Brief Builder); compensation types (TFP, TFV, Paid, Hybrid, Gifted; **Negotiable = Deprecated / not current**, LEXICON.md:34); GWC; roles (Model, Photographer, MUA, Hair Stylist, Wardrobe Stylist, Creative Director, Art Director, Producer, Assistant, Collaborator, Talent, Content Creator, Participant); nudity levels (`fully_clothed`, `swimwear_lingerie`, `implied_nudity`, `artistic_nude`, `explicit`); contact levels (`none`, `minimal`, `choreographed`, `intimate`); contact toggles; safety provisions (chaperone, closed set, safe word/signal, emergency contact, private change room); break frequency; rate types (hourly, half_day, full_day, flat, show); delivery timelines; usage rights (Portfolio, Social Media, Website, Commercial, Advertisement, Editorial); document types (Model/Photo/Minor/Property Release, Nudity Rider; six art/sensitive docs; Deal Memo, Usage License, NDA, Invoice; Call Sheet, Shot List).
- **Flagged for renaming / correction:** (a) product name "Before the Shoot" -> Modeling Standard (RECONCILIATION:52-58; LEXICON now clean of the old name); (b) "Negotiable" rate (RECONCILIATION:60; LEXICON now marks deprecated, done); (c) "momager" -> "guardian manager" (VISION.md:453); (d) top individual tier "Agency" -> renamed (COST-REALITY:285), "Platinum" -> "Diamond" (COST-REALITY:294), "Roster/House" rejected (COST-REALITY:300); (e) "GWC" must not appear in UI copy.
- **Not flagged but worth noticing:** LEXICON's "Full Brief Builder" 7-step and six types conflict with Cory's confirmed "1 engine + presets" (CORY-QUESTIONS.md:165). LEXICON still lists `explicit (18+)` as a nudity level, which no ratified doc addresses. LEXICON says "TBD" is allowed for non-compensation fields (LEXICON.md:242).
- **Lexicon vs Cory's role model:** LEXICON lists 13 roles including Content Creator and Talent; Cory's ratified language recognizes model, photographer, MUA/stylist/assistant, guardian manager, plus supporting collaborators "creative directors, assistants, studios, agencies" (VISION.md:104). Client and event organizer appear in the original brief prompt (`attached_assets/Pasted-Modeling-Standard-Shoot-Brief-Generator...`: "Photographer, Model, MUA, Hair Stylist, Stylist, Designer, Client, Guardian, or Other") and in the Surrey example (organizer). Non-modeling "clients" are first-class invitees (FEATURE-REVIEW.md:126).

---

## 3. OPEN QUESTIONS

"Leaning?" = does any document record a leaning/provisional answer. "Blocks slice?" = my judgement whether it plausibly blocks a first adult collaboration slice (judgement, not doc-stated). IDs are mine (Q-xx).

### 3.1 Core to the first collaboration slice

| ID | Question / source | Summary | Leaning recorded? | Blocks first adult slice? (my judgement) |
|---|---|---|---|---|
| Q-01 | Which single journey leads: paid, TFP/TFV, casting, or full brief? CORY-QUESTIONS.md:54; VISION.md:156 | Cory has not picked the first story. Charge §24 says same. | No lean. Weak evidence only: Cory is "fitness/fashion photographer and former model" (ROADMAP.md:28); only real example is an in-kind fashion-show organizer->photographer brief (REAL-BRIEF-EXAMPLES). Roadmap demo flow is photographer->model (ROADMAP.md:72-77). | YES, decides the slice content |
| Q-02 | Is organizer confirmation after participant acceptance a required double opt-in? CORY-QUESTIONS.md:55 | Determines whether acceptance forms an agreement or a pending collaboration. Prototype had it (BLUEPRINT.md:391-393). Doctrine journey step 4 says "creator reviews responses and confirms" (PROVISIONAL). | Leaning only via prototype and provisional journey | YES (state machine) |
| Q-03 | What must happen when terms change after one participant accepted? CORY-QUESTIONS.md:62 | Versioning / invalidation / re-consent / notification. | Promise-level only: material changes "return to the people whose understanding... may be affected" (VISION.md:152). FEATURE-REVIEW proposes per-term compliance-% negotiation (agent). | YES |
| Q-04 | Can a consent-bearing brief ever be permanently deleted, by whom, after what retention period? CORY-QUESTIONS.md:38; SP-001 | Archive not destroy is APPROVED; purge and period are not. | Partial: archive-not-destroy `[R]`; "records of agreement outlive account deletion" `[R]` parenthetical. Period/purge rules OPEN, counsel item (USER-CONTENT-TERMS R2). | Partly: archive model needed; purge rules can wait |
| Q-05 | What evidence must be retained: full version, participant terms, signer identity, document hash, timestamps, IP/device, witnesses, revocation history? CORY-QUESTIONS.md:61 | Doctrine answered 8 elements. Still open: document hash, IP/device data, witnesses, revocation history. | Substantially answered (DOCTRINE:44-53). | Mostly no; the 8-element set is enough to start; hash/IP/device are design calls |
| Q-06 | What does "verified identity" mean? CORY-QUESTIONS.md:63 | OIDC login is not identity verification. Verification = facial age estimation at first participation act (COST-REALITY Rule 3, `[CA]`). What it means to users still needs "a line" (RECONCILIATION:121). | Partial. ToS must say checkpoint not vetting (PLATFORM-LIABILITY:46). | Partly: signature/"identity/credential used to agree" (DOCTRINE #7) needs some answer; can be minimal (account + verified email) |
| Q-07 | Does publishing make a brief public/discoverable, invitation-only, or configurable? CORY-QUESTIONS.md:39 | Prototype made published briefs public. Doctrine: privacy default, no directory. | VISION Tension 3: "A public concept brief... is fine" as the discovery surface; direct collaboration briefs presumably private. Not stated outright. | NO for invite-only slice; YES for any publishing feature |
| Q-08 | Brief fields and workflow steps that are genuinely standard practice vs Replit-era brainstorming. CORY-QUESTIONS.md:98 | Schema/UI "broad and internally contradictory." | Real evidence in section 5 (REAL-BRIEF-EXAMPLES, DOCTRINE 8-element set, Cory's own list VISION.md:77). Presets confirmed as mechanism. | Partly: slice needs a minimum field set; Cory has not approved one |
| Q-09 | Which document templates are operationally essential vs removed until reviewed? CORY-QUESTIONS.md:99 | Existing toolkit "creates legal/product expectations." | Cory: safety docs vital and free; usage drives Photo/Model Release; "product does not invent them, it assembles and captures them" (DOCTRINE:50). 22 documents exist (FEATURE-INVENTORY). No approved essential set. | Partly: slice needs at least model/photo release and boundaries doc decisions |
| Q-10 | Walk through one real shoot from first contact to final delivery and mark where the product replaces DMs, email, documents, payment discussion. CORY-QUESTIONS.md:112 | Explicit request for a Cory walkthrough; never answered. | No | YES (best single input for slice) |
| Q-11 | Free-tier / invitee boundary: can a no-account invitee review and sign but not create a brief? RECONCILIATION:66 | Appears answered later same day: invitee participation is FREE (COST-REALITY:100), "brief invitees always bypass the gate" (LAUNCH-MILESTONES). | Answered `[CA]`; RECONCILIATION row is stale | NO |
| Q-12 | Can a brief involving a minor carry nudity terms at all? CORY-QUESTIONS.md:71 | "Sharpest design question." Requires professional legal review. | Direction: structurally impossible (VISION.md:234) but ratification waits on counsel. | NO for adult-only slice (but architecture must keep the gate possible) |

### 3.2 Youth / guardian (not for first adult slice, but architecture must not preclude)

| ID | Question / source | Leaning? | Blocks slice? |
|---|---|---|---|
| Q-13 | Youth image hosting: no-upload template dashboard vs photo hosting. VISION.md:190-214; `_OPEN-ITEMS.md:44` ("trade, not yet chosen"); LAUNCH-MILESTONES M8 | No decision; Cory: no-upload "hits different"; explicitly "doesn't want to lock it in." | NO |
| Q-14 | Are minors in scope for the first commercial release? CORY-QUESTIONS.md:69 | Docs contradict: VISION says youth is near-term vision and launch "includes guardian management" (263); LAUNCH-BUDGET calls youth-at-launch "Cory's stated direction" (`Scenario B`, line 82) and RECONCILIATION:123 says "Ratified - yes"; CORY-QUESTIONS/DOCTRINE/VISION checklist say open/deferred; ROADMAP/MILESTONES put youth last (M8). | NO for adult slice; but big for launch definition |
| Q-15 | Who may invite/view/consent/sign, how guardian authority is verified, where youth images live. CORY-QUESTIONS.md:70 | No. Legal review required. | NO |
| Q-16 | Age establishment: self-declaration vs verification; what stops an adult claiming into youth spaces. CORY-QUESTIONS.md:194 | Partial: verify on first act of participation, facial estimation default, guardian verified not child (CORY-QUESTIONS.md:184; COST-REALITY Rule 3). Provider open. | Partly: adults-only claim needs enforcement (CORY-QUESTIONS.md:195) |
| Q-17 | Length of grace period (18-19) and whether 20+ hard requirement stands. VISION.md:243 | "roughly two years and is Cory's call to finalize" | NO |
| Q-18 | Child-performer law scope: runway (live) vs stills. RECONCILIATION:90; USER-CONTENT-TERMS:67 | Agent reframed as employer's obligation; counsel to confirm. Whether MS surfaces trust-rule guidance is "open product choice" (VISION.md:304). | NO |

### 3.3 Discovery / privacy

| ID | Question | Leaning? | Blocks slice? |
|---|---|---|---|
| Q-19 | What does a public moodboard reveal about its poster? VISION.md:407; CORY-QUESTIONS.md:45 | Only the framing: "bridge must carry the work across without carrying the person." | NO |
| Q-20 | Do public profile URLs (`/username`) exist; what does a stranger see? CORY-QUESTIONS.md:46; VISION.md:445 | FEATURE-REVIEW `[CA]`: yes, as "My Standard" link page reachable only via shared link; not discoverable inside MS. | NO |
| Q-21 | Discovery replacement: what mechanism, if any, lets collaborators find each other? CORY-QUESTIONS.md:47 | Agent proposals: share-forward + job board + Knock (FEATURE-REVIEW, PENDING). | NO (charge §12 also treats as design problem) |
| Q-22 | Public moodboards require mini-brief: ratify? CORY-QUESTIONS.md:162 | Cory stated it; awaits doctrine ratification. | NO |
| Q-23 | Link-page tier: free-lite w/ MS branding vs paid-only. CORY-QUESTIONS.md:158 | Agent lean free-lite; collides with documents-only free. | NO |

### 3.4 Moderation / safety operations

| ID | Question | Leaning? | Blocks slice? |
|---|---|---|---|
| Q-24 | What must suspension block immediately; does public content disappear? CORY-QUESTIONS.md:77 | Doctrine PROVISIONAL: "Suspension blocks protected actions immediately" (DOCTRINE:80). | Partly (auth design), no for content rules |
| Q-25 | Is moderation reactive only, or does sensitive-content publication require review? CORY-QUESTIONS.md:78 | MVP posture: reactive, strikes flagged, no free-text, no staffed adjudication (VISION.md:513). Pre-review not addressed. | NO |
| Q-26 | Who staffs moderation/support/incident response ("who reads a 2am report?") CORY-QUESTIONS.md:192 | No. "two founders" only. | NO (launch gate) |
| Q-27 | After a reported on-set violation: warn/ban/preserve/refer? CORY-QUESTIONS.md:193 | Partially answered 2026-07-17 (signed PDF as artifact, strikes flagged until resolved). Premortem #6 (agent): strikes private until resolved (needs doctrine ratification, PREMORTEM:222). | NO |
| Q-28 | Image screening / CSAM obligations. CORY-QUESTIONS.md:195; LAUNCH-BUDGET:53 | Cory: required REGARDLESS of adult-first vs youth-at-launch, "NOT deferrable by phasing." How is open (third-party integration suggested). | NO for a no-upload slice; YES before ANY public uploads |
| Q-29 | Which safety failure would make Cory choose not to launch? CORY-QUESTIONS.md:106 | Partial: the two failure modes (VISION.md:497-503). | NO |
| Q-30 | What false promise in a demo would most damage trust? CORY-QUESTIONS.md:105 | Partial: legal enforceability, identity verification, moderation staffing (DOCTRINE:93). | NO |
| Q-31 | On-set safety tool (opt-in check-in). FEATURE-REVIEW.md:94; `_OPEN-ITEMS.md:48` | Agent recommends yes. No Cory answer. | NO |
| Q-32 | Factual reputation signals (verified-collab count, badges): which? FEATURE-REVIEW.md:184; `_OPEN-ITEMS.md:49` | Agent: "facts, never opinions." No Cory answer. | NO |

### 3.5 Product/feature decisions from FEATURE-REVIEW / OPEN-ITEMS

| ID | Question | Leaning? | Blocks slice? |
|---|---|---|---|
| Q-33 | Content Creation brief: keep as preset or cut? FEATURE-REVIEW.md:168; `_OPEN-ITEMS.md:47` | Agent: preset or cut. | NO |
| Q-34 | Role-adaptive profiles: build? CORY-QUESTIONS.md:164 | Agent: small build; role modules "LOCKED" by Cory (FEATURE-REVIEW.md:36) but caveat line 42. | NO |
| Q-35 | Free-lite My Standard page, free media kit basics, Standing metrics, etc. | Agent leans. | NO |
| Q-36 | Currency default (USD vs CAD primary); delivery caps + file-type list; license field (MIT on a sellable product). `_OPEN-ITEMS.md:42-46`; RECONCILIATION:71-75 | None. (MIT: "change it.") | NO |
| Q-37 | Comp-card free artifact at all? RECONCILIATION:67 | Appears answered "PAID" (COST-REALITY:99). | NO |
| Q-38 | Segment mix / revised TAM (whole shoot ecosystem). RECONCILIATION:76 | Agent: photographers likely larger, higher-paying segment. | NO |

### 3.6 Business / legal / market (not slice-blocking)

| ID | Question | Notes |
|---|---|---|
| Q-39 | Infra: self-hosted (Authentik/MinIO/Postgres) vs Cory-owned managed services. CORY-QUESTIONS.md:32 | No lean. Provider-neutral OK. Charge §21 already provider-independent. |
| Q-40 | Markets/order; does youth path leave Canada? GDPR Art. 9 for facial estimation. CORY-QUESTIONS.md:204-205 | "North America is the starting market, not the ceiling" (VISION.md:281). |
| Q-41 | Legal entity, trademark, lawyer, budget, founders' agreement, Dustin's role/comp/equity/exit. CORY-QUESTIONS.md:197-199; `_OPEN-ITEMS.md:31-36` | Name Request lapsed, must be re-filed; incorporation not filed. |
| Q-42 | Funding: personal / CSBFP / friend loan (not equity, not Dustin). FUNDING-MEMO. | Cory's instinct: friend loan. |
| Q-43 | Model Alliance stat: keep / reframe (27.5% companion) / drop. LANDING-PAGE-COPY.md:121; RECONCILIATION:157 | Verified as 2012, n=85 survey; Cory decides. |
| Q-44 | 12-month success in numbers. CORY-QUESTIONS.md:203 | Answered qualitatively ("Giving it 100%"). No metric. |
| Q-45 | Referral: bounty amount, ambassador terms, default recurring, payout threshold, attribution window, cash trigger. CORY-QUESTIONS.md:147 | Parked; do not build. |
| Q-46 | Ratification meta: does VISION/DOCTRINE accurately preserve direction? CORY-QUESTIONS.md:24-25 | "Future Cory review." |
| Q-47 | July mockup story; local vs internet demo. CORY-QUESTIONS.md:91-92 | Landing/waitlist is the primary artifact; mockup optional. Time-boxed to July; effectively moot. |
| Q-48 | Invite-only permanent vs post-M7 review. LAUNCH-MILESTONES.md:151 | Strong lean "permanent feature + sales pitch"; not locked. |

---

## 4. PROVISIONAL / AGENT-PROPOSED MATERIAL THAT COULD BE MISTAKEN FOR CORY AUTHORITY

Everything below is written confidently. Do not treat as approved.

### 4.1 Inside the APPROVED documents (explicit qualifiers)

- DOCTRINE `PROVISIONAL` lines (each carries the tag in the file):
  - "Profiles, portfolios, discovery, availability, documents, moderation, and monetization may support the core journey; they are not automatically first-release scope." (DOCTRINE:30)
  - "The durable evidence package should be immutable and retrievable, subject to approved privacy and retention rules." (DOCTRINE:57)
  - **"Safety capabilities are never paywalled."** (DOCTRINE:67) Tagged PROVISIONAL even though Cory's Tension 6 answer (VISION.md:467-473) is explicit and APPROVED. Treat the principle as Cory-stated; treat the *phrase* as a doctrine gap. (Conflict C-1.)
  - "Sensitive contact, measurement, and private-media access is owner-controlled, scoped, revocable, logged, and time-limited." (DOCTRINE:74)
  - "Bearer share links require expiry, rotation, revocation, and narrow scope." (DOCTRINE:75)
  - "Safety-critical behavior must be enforced server-side and tested against negative cases." (DOCTRINE:79)
  - "Suspension blocks protected actions immediately." (DOCTRINE:80)
  - "Simulated prototype boundaries must be explicit." (DOCTRINE:94)
  - The entire **Core journey** (DOCTRINE:96-104) is provisional.
- DOCTRINE `DEFERRED`: legal language / enforceability / counsel (60); pricing generations, tiers, checkout, entitlements, payment provider (68); production launch of any youth path (89).
- DOCTRINE "Explicit non-doctrine" (106-119): current pricing tiers, public-by-default behavior, current document/signature implementation, OIDC/provider selection, existing retention/deletion, current minor/guardian fields, any youth image-hosting choice, any legal-signature claim, the blueprint's table/feature inventory.
- VISION `PROPOSED`: no-upload youth dashboard (190-214) and Tension 6 "PROPOSED free tier" (475-480, then overtaken).
- VISION "Vision boundaries" (310-324): does NOT approve blueprint features, tech stack, schema, build order, business rules, current screens/copy/pricing/tiers, youth launch, public-vs-private defaults for moderation, retention, hosting/identity/etc. providers.
- VISION 517-536 lists as OPEN: pricing generations, tiers; youth at launch and workflow; youth image hosting and publication; legal language; exact brief type, confirmation state machine, moderation, retention, deletion, identity verification, provider choices.

### 4.2 Confidently-written but non-ratified documents

| Document | Header status | What is dangerously confident |
|---|---|---|
| **LEXICON.md** | "supporting, provisional... do not treat it as product doctrine" | Brief types and 7-step builder; role list; nudity/contact levels; safety provision toggles; rate types; delivery timelines; usage rights; 22-document toolkit names. All "PROVISIONAL / REQUIRE CORY". |
| **FEATURE-REVIEW-2026-07-17.md** | Decision: REQUIRES CORY; Approval: PENDING; Evidence: INFERRED; "Claude's recommendations, Cory to accept/reject" | The Knock (5 mechanisms, tiered disclosure, Soft No ~7d, door controls) is "INVENTED (Fable + Cory)". Gamified analytics dashboard, Standing, the tier split for analytics, media-kit tier lean, role-module contents (craft markers = "Claude's inference"), "job board" model text, on-set safety tool, factual reputation. Inline "DECIDED (Cory...)" markers exist for messaging, My Standard, Maps, brief consolidation, tier names; those are Cory-attributed but the mechanism prose around them is agent elaboration. |
| **COST-REALITY-2026-07.md** | Decision: NOT APPLICABLE ("not itself a pricing decision"); Approval: "Cory - records Cory's ratified pricing/tier directives" | "Ratified pricing" table; three-axis tier model; Rules 1-4 (R2 as storage target "unless Dustin has a counter-argument", web-res free uploads, verification at first participation, delivery windows). The doc itself flags contradictions (RECONCILIATION:B). |
| **RECONCILIATION-2026-07-17.md** | NOT APPLICABLE working checklist, "not authority"; Evidence: INFERRED | §G table claims "Ratified" for items VISION/DOCTRINE leave open (e.g. "Minors in first release? Ratified - yes, guardian-managed, sealed partition"; "Tiers/prices/entitlements: Ratified - $15/$29/$59"). This is an agent classification, contradicted by DOCTRINE:68, 89 and VISION.md:545. Also §A header states are stale. |
| **CORY-QUESTIONS.md** | Owner Dustin; NOT APPLICABLE | Rows marked "DECIDED" and "CONFIRMED" (§13) are Cory-attributed; rows in the "Recommendation" column are agent. Growth-loop mechanics (rates, 20% of first five payments, ambassador tier) are agent design after Cory rejected credits-first; parked. |
| **LAUNCH-MILESTONES-2026-07-17.md** | PROVISIONAL / PENDING | M1-M8 ladder, "youth deliberately last," invite-gated waves, invite design rules. Youth-last contradicts VISION's launch-whole and RECONCILIATION's "yes minors in first release". |
| **ROADMAP.md** | APPROVED only for July 27 landing/waitlist boundary; later phases PROVISIONAL | The "soft-start ladder" stages 1-5 (ROADMAP.md:30-43) are labelled "(Cory, 2026-07-17)" in the heading but sit in the PROVISIONAL portion. |
| **legal/PLATFORM-LIABILITY-POSITIONING** | DRAFT; REQUIRES CORY + counsel; Approval PENDING | "Tools platform, not a service" as chosen posture; "Modeling Standard's true category is [tools/SaaS]"; job-board reframe; youth scope-down conclusions; "youth legal REVIEW shrinks to a youth legal CONFIRMATION." Cory's prompts are quoted, but conclusions are agent legal reasoning, not counsel-verified. |
| **legal/USER-CONTENT-TERMS-DRAFT** | DRAFT; "NOT ratified"; drafted by separate Claude session "without project context" | All clause text. Only the "Product-Alignment Review" (R1-R5) is project-aware; it too is agent work. |
| **LANDING-PAGE-COPY.md** | REVIEW; REQUIRES CORY (final read); Approval PENDING | Hero, mission, "Why a standard", survey. The hero "The shoot starts when everyone's on the same page." has not been approved. (Voice rules are Cory's.) |
| **MARKETING-ENGINE** | DRAFT; PROVISIONAL | All. |
| **FUNDING-MEMO / LAUNCH-BUDGET** | DRAFT / PROVISIONAL, INFERRED | Figures and financing comparison. |
| **PREMORTEM** | NOT APPLICABLE; INFERRED | "Doctrine line to ratify: strikes are private until resolved" (row 6, line 222) is a recommendation, not a Cory decision. |
| **COMPETITIVE-LANDSCAPE** | Evidence status is a web scan; "Implications (INFERRED - Cory's to accept or reject)" | All implications (119-124). |
| **archive/BLUEPRINT.md, replit.md** | ARCHIVED | Written by Replit-era AI. The archive README calls the blueprint "a record of Cory's broad product exploration", but its text is agent-authored prose, not Cory quotations. Business rules 1-18 (BLUEPRINT.md:673-694) are prototype rules, e.g. Flat/Range rate model, 30-day default access, 30-day invite token expiry, organizer double opt-in, Replit Auth. "Deprecated but kept" and "Some TBD/Negotiable wording remains intentionally" (rule 18). |
| **design_guidelines.md** | "provisional design guidelines for the July 27 presentation boundary" | Palette, typography (Playfair Display + Inter), editorial black/white. Not a visual spec for the new product. |
| **attached_assets/*.txt** | Pasted LLM chats from Replit era (Oct 2025 to Feb 2026) | Contain "locked" rules that were later superseded (e.g. "Only the comp card is requestable... Remove portfolio and moodboard access requests entirely", `Pasted-Revise-the-plan...1770150081906.txt`; "Core Rules (locked) Default portfolios are required", `Pasted-Core-Rules-locked...`). The word "locked" there is prototype-chat vocabulary, not ratification. Not in my assigned sources; noted only to prevent misreading. |
| **ARCHITECTURE-TARGET, ARCHITECTURE-CURRENT, TESTING-AND-VALIDATION, SECURITY-PRIVACY-DEBT** | Not read in this pass (out of scope for Mode A); README.md:63-65 ranks ARCHITECTURE-TARGET as "provisional technical direction" | Do not treat their statements as Cory authority. |

### 4.3 Ratification-record subtleties

- DOCTRINE:20 claims PR #8 merged the ratification at commit `5d515388`; unverifiable here (single-commit checkout).
- README.md:20-22 and VISION.md:18 both stress "repository provenance, not a quotation, signature."
- The **human merge gate** governs future changes (GOVERNANCE.md; CLAUDE.md:55). "Explicit authorization for one action does not authorize another." (CLAUDE.md:124)

---

## 5. WORKFLOWS AND INFORMATION CATEGORIES CORY CONSIDERED IMPORTANT

### 5.1 What a collaboration record carried (Cory's own list)

VISION.md:77: "purpose of a shoot, roles, explicit compensation, deliverables, image usage, boundaries, safety expectations, and responses." Problem list (VISION.md:83-91): what the shoot is and who is in it; what each person provides and receives; comp, expenses, deliverables, usage; personal and professional boundaries; changes and whether everyone saw them; what was accepted, declined, questioned, or left unresolved; where the final shared record can be found.

Cory's "How success should feel" (VISION.md:328-334): understood shoot and role before committing; could see terms that mattered and raise a concern; knew what changed and whether another response was needed; could find the final shared understanding afterward; product did not overstate guarantees.

### 5.2 Doctrine's 8-element evidence set (APPROVED)

See section 1.3 (verbatim clauses; parameter values; compensation; deliverables/timing; usage + triggered releases; signature-to-clause binding; timestamps + credential; final immutable PDF to all parties).

### 5.3 Real brief examples (primary sources) and the fields they show

`reference/REAL-BRIEF-EXAMPLES.md` contains exactly TWO items, both from ONE event organizer (Surrey Fashion Week 2026, Canadian National Fashion Show Inc.), shared by Cory 2026-07-17. No Cory-authored shoot brief and no model/photographer TFP brief is in the docs. Evidence quality: primary but narrow.

Example 1: organizer -> "Official Photographer" email brief (maps to Fashion Show Casting preset). Sections (REAL-BRIEF-EXAMPLES.md:160-168):
- Event identity and role
- Logistics: date, report/call time, show times, venue + address, check-in note ("present Media Pass at reception")
- Shot list / responsibilities (runway, designer showcases, backstage, red carpet, VIP/sponsors, awards, atmosphere; portrait + landscape)
- Deliverables + timing (edited high-res, organized labelled folders, within 2 weeks, shared via Google Drive link)
- Usage / credits (SFW platforms; fully credited to photographer)
- Compensation IN-KIND, no cash (media pass, social recognition, photo credits, networking, BTS access, participation certificate, portfolio exposure)
- Assets requested from photographer (logo, Instagram handle)
- Organizer contact (on-site)
Cory's read (agent-recorded): validates delivery-as-transit, in-kind comp being real and common, usage+credit terms being core. It is "one-directional: organizer states terms, photographer has no structured way to agree, counter, or record consent" (line 179): "Same email, but now it's an agreement with a record instead of a hopeful message."

Example 2: media-asset request -> Media Kit concept (logo, handles, bio, headshot, hi-res samples, press credits). "prepped and shared with agents" (Cory quote, line 195).

### 5.4 Prototype-era information categories (evidence, not authority)

- Test PDF `attached_assets/BeforeTheShoot-Test-Editorial-Fashion-Shoot_1769056754522.pdf` (test data): basic info (title, date, time, est. finish, location/address), creative concept, boundary toggles with wardrobe-level granularity (low-cut tops, open-back shirts, short skirts, bra/underwear preference, wardrobe approval required, private change area, closed set, hair styling, makeup application, pose guidance, wardrobe adjustments, props handling, photo review after shoot), nudity on set, photo count type, usage rights, deliverable quality. Footer: "No files are stored by the service; please retain this attachment for your records."
- Original Oct 2025 prompt (attached_assets, first file): sections Basic Information; Shoot Details (outfits, photos, delivery timing, usage rights); Payment & Terms (Paid vs TFV); Boundaries & Comfort Levels; Team & Participants (Role, name, email, social handle); Review; attachments (Model Release, Guardian Consent for minors, Photo Usage Agreement, Property...).
- BLUEPRINT.md:332-341 (archive): Team, Basics, Concept, Parameters & Consent, Details, Documents, Review. Per-member duration and compensation (BLUEPRINT.md:343-361). Reason recorded: "roles work different hours and deals; each person's comp is set independently."
- Test brief and blueprint reflect what the prototype captured, not what Cory has approved.

### 5.5 Roles Cory named

- Primary participants: photographers, models (VISION.md:99-100). Lead surfaces: model and guardian manager (VISION.md:368).
- Supporting: makeup artists, hair stylists, wardrobe stylists, creative directors, assistants, studios, agencies, "and other participants whose roles, terms, or deliverables need to be clear." VISION.md:104.
- Suite users named for dashboard: "model / photographer / MUA / stylist / designer" (VISION.md:177).
- Manager roles: guardian manager -> agent -> agency (COST-REALITY `[CA]`).
- Non-modeling clients as invitees (grad, wedding, event). FEATURE-REVIEW.md:126.
- Event organizers as brief creators (Surrey example).
- Hard rules: all crew must sign to be on set (VISION.md:374); every complaint gets a voice regardless of role (VISION.md:376).
- Role-adaptive profile axes: Talent / Works-on-talent (MUA, hair) / Brings-capability (photographer, stylist, designer, set designer). FEATURE-REVIEW.md:38-40 `[CA]`.
- Attached chat (Feb 2026, out-of-scope but informative): role groups stripped of film-crew roles into Talent / Image Maker / Video Maker / Creative-Wardrobe / Hair & Makeup / Post-Delivery / Production-Organizer / Client-Brand. Not ratified.

### 5.6 Document types that existed, and why (Cory-visible reasons)

- 22 documents in code: consent & safety forms, Nudity Rider, Implied Nudity Agreement, Couples Intimacy Release, Body Paint Release, Fine Art Nude Declaration, Boudoir Addendum, Pregnancy Release, Minor Release; Model Release, Photo Release, Property Release, Usage License; Deal Memo, Invoice, NDA, TFP Agreement, TFV Agreement, Delivery Confirmation (FEATURE-INVENTORY.md:31-39). LEXICON lists a subset plus Call Sheet, Shot List.
- Why: "The brief's usage question drives this: commercial use pulls the model release / photo release / usage license into the final package. These are existing standard documents; the product does not invent them, it assembles and captures them." (DOCTRINE:50) Minor role triggers Minor Release (FEATURE-REVIEW.md:25 "Seed already in code").
- Cory's ruling on sensitive-content documents: free; "unify the UI/generation flow, but keep as distinct named legal documents"; agent recommendation FEATURE-REVIEW.md:154. Niche docs (Pregnancy, Property, Couples Intimacy): "cheap to keep... Don't spotlight." FEATURE-REVIEW.md:172 (agent).
- Delivery Confirmation: Cory argued in-platform delivery (transit) gives it "teeth"; timestamped proof generates itself (COST-REALITY:116-118).
- Documents work "when the user is working with people who are not on the app at all" (VISION.md:469): free off-app document use is part of the safety layer.
- Cory's question on coverage: CORY-QUESTIONS §9 (Q-09) asks which are essential; unanswered.

### 5.7 Workflows Cory described

- **Brief life:** prepare -> review by each participant of "the terms relevant to them" -> questions/concerns/accept/decline recorded "without pretending unresolved issues are settled" -> material changes return -> final state -> retrieve final brief and authorized records (VISION.md:147-154).
- **Accept-gate:** contact info exchanged only on mutual accept; platform "brokers the agreement then hands off" (FEATURE-REVIEW.md:92, `[CA]`).
- **Negotiation as compliance %:** per-term counters until match (FEATURE-REVIEW.md:91, Cory's model).
- **Invitee flow as acquisition channel:** "Every brief sent to someone without an account is a warm, contextual invitation." (CORY-QUESTIONS.md:117)
- **Request flow:** starts at a piece of work, owner grants scoped temporary access (VISION.md:388, 434).
- **Delivery:** finished images passed through with mandatory expiry; RAW handled by pasting a link and recording the delivery; "The record is the product; the bytes are optional." (COST-REALITY:135)
- **Shoot-day:** the product currently "goes dark" (agent framing, FEATURE-REVIEW.md:95); Cory's line is the agreement freezes, performance is not witnessed.
- **Onboarding:** ask what work they do, configure presets; ask each fact once; first view "magically finished." (FEATURE-REVIEW.md:28, 128)
- **Pre-account:** waitlist / pre-apply with five-question survey; phone-first; QR at the runway (LANDING-PAGE-COPY.md:98-104, 114).

---

## 6. LEGAL / LIABILITY POSTURE

### 6.1 Ratified (in VISION/DOCTRINE)

- Signatures = product checkpoint, not legal instruments; "we do not want to be a legal middleman"; no claim of legal enforceability (VISION.md:249, 316; DOCTRINE:59). Not a lawyer, not judge, not jury (DOCTRINE:42).
- Login is not verified identity (VISION.md:317).
- Product does not "promise that the platform can prevent misconduct or replace professional, legal, or safety judgment." (VISION.md:322)
- Truthfulness: no implied payments, identity verification, legal enforceability, moderation staffing, encryption guarantees, production readiness unless verified (DOCTRINE:93).
- No user-to-user payments (VISION.md:298; DOCTRINE:66).
- Youth legal questions "require professional legal review, not an AI or the team." (VISION.md:463)
- Legal language, enforceability, counsel adoption: DEFERRED (DOCTRINE:60).

### 6.2 Cory-attributed

- Jurisdiction: British Columbia, Canada (confirmed 2026-07-17). CORY-QUESTIONS.md:179.
- Prompt: "Remove ourselves legally as far as possible. We are not a service provider, we are a tools platform." (PLATFORM-LIABILITY header, line 15; document status DRAFT, REQUIRES CORY + counsel.)
- "The brief is explicitly a contract BETWEEN USERS, naming them as the parties... Modeling Standard is the pen and the filing cabinet, never a party to what's written." (PLATFORM-LIABILITY:33, agent phrasing.)
- Scope invariants used to distance the platform: no payments, no matching algorithm, no lead-selling, no guarantee program (PLATFORM-LIABILITY:30-33).
- Cory's model correction: job board, not people directory; every introduction adult-to-adult; minor is the shoot's subject, guardian irrevocably embedded (PLATFORM-LIABILITY:79-83, 113-120).
- "Convergence": "garden, walls" positioning is also the correct liability posture (sell tools, never sell safety guarantees). PLATFORM-LIABILITY:60. Agent inference.
- Cory's scope correction: "what does this site have to do with kids working?" -> child-performer/earnings law is the employer's. PLATFORM-LIABILITY:85-96.

### 6.3 Agent-proposed / unratified legal positions

- Three positioning models (marketplace / networking / tools-SaaS) with MS in the third; 10 clause patterns (Thumbtack-verified only #1-4); "two duty surfaces we KEEP" (statutory duties, our own features); "checkpoint, not guarantee" for age verification; strikes private until resolved (defamation risk).
- Full draft ToS user-content clauses; product-alignment review R1-R5 (public moodboards/concept briefs are deliberately discoverable; Records of Agreement survive deletion; partition in AUP; age verification is biometric; free-tier generated documents). `USER-CONTENT-TERMS-DRAFT:21-59`.
- Counsel list (RECONCILIATION §E; OPEN-ITEMS "COUNSEL (when hired)"): youth/child-performer review; consent-record retention; age-verification biometrics (BC PIPA, GDPR Art. 9, Quebec Law 25); Records-of-Agreement vs User Content in ToS; partition into AUP; agency-licensing check (BC talent-agency definitions, especially with "agency replacement" marketing); runway (live) vs stills scope for Part 7.1 child trust rules; governing law/venue and arbitration (Seidel v. TELUS); DMCA agent, clickwrap, privacy policy; Model Alliance stat verification.
- No lawyer engaged: "Ask dad's friend his Law Society status + referral." `_OPEN-ITEMS.md:34`. Budget: launch "is a legal budget" (LAUNCH-BUDGET:107).

### 6.4 Ideas useful for the "freeze vs witness" model

- The evidence package is the platform's central legal-adjacent artifact. Doctrine wants it to survive account deletion (append-only; archive not destroy), while the ToS draft's "license ends on deletion" clause collides (R2). Retention period not decided.
- Cory's retention direction for the user: "records of agreement outlive account deletion" (DOCTRINE:56). Joint-evidence framing ("jointly held evidence belonging to every party who signed") is the agent's (USER-CONTENT-TERMS:41).

---

## 7. MARKET / ACQUISITION EVIDENCE

### 7.1 Intended users

- Whole shoot ecosystem, not only models: models, photographers, MUAs, stylists, designers, guardian managers (RECONCILIATION:76; COST-REALITY:348, "SECOND TAM CORRECTION (Cory...)"; VISION.md:177).
- Photographers' non-modeling clients (weddings, grad, events) are first-class invitees; "the largest working-photographer segments." FEATURE-REVIEW.md:126.
- Parents / guardian managers: July 27 audience is a model runway with parents; Cory has "direct access to three under-17 runway companies" (VISION.md:263; ROADMAP.md:22). "American stage-parent demographic that is a core youth market" (VISION.md:192).
- Cory himself is the warm network: "working professional fitness/fashion photographer and former model" with a client/peer base above the ~7-subscriber break-even. ROADMAP.md:28.
- Two audiences on a landing page: protection-aware (runway/parents) vs business-suite (mass market). VISION.md:184; LANDING-PAGE-COPY.md:30. "Business-suite-forward variant" needed before general launch.
- The non-fearful majority: "the model who has never had an issue and the one who likes the 'wild west'... won by the best all-in-one freelance business suite in the room." VISION.md:177.

### 7.2 Competitive landscape (COMPETITIVE-LANDSCAPE, ACTIVE evidence doc; 6-query web scan, stealth competitors possible)

- Headline: "Nobody is building Modeling Standard." Fragments: model release apps (Easy Release, SnapSign), networking directories (Model Mayhem, PurplePort, MuseCube, Swipecast), photographer CRMs (HoneyBook-class), comp card makers (Canva etc.), youth (KidsCasting, Le Management Kids). "The actual competitor: The status quo: Instagram DMs, a Canva comp card, and a paper release someone maybe brings." Lines 19, 61-63.
- Cory-attributed pieces: replaced-stack framing ("Cory, 2026-07-17: marketing source material", line 65) and "one dashboard instead of eight apps" (82); Linktree replaced (79); Cory's Tension 4 rejects the browse-people directory model (35). The comparison of MS pricing to the stack is agent computation.
- Fast-follower risk: a release app going two-sided (SnapSign) (line 29, 123).
- Model Alliance stat: 86.8% asked to pose nude without notice (2012, n=85), 27.5% posed anyway. Cory: belongs on landing page phrased to indict process (COMPETITIVE-LANDSCAPE:59; LANDING-PAGE-COPY.md:56-62).

### 7.3 Launch thinking (Cory-attributed unless marked)

- Two-sided cold start answered by Cory being the warm network and each photographer bringing their crew (CORY-QUESTIONS.md:200; ROADMAP.md:28).
- Invitee flow = "primary acquisition channel" (CORY-QUESTIONS.md:117). "Only two doors: invite, or someone's page." (CORY-QUESTIONS.md:159)
- Comp cards as wedge, based on "The number of models that have asked me how to make one... is a lot." VISION.md:420. Later pricing ruling made comp cards paid rather than free-maker.
- Socials: Instagram active under Modeling Standard; TikTok TBD; educational content is the marketing (MARKETING-ENGINE:19-24). "48 principles" curriculum idea reframed as original testimony.
- Pre-apply mailing list, no promised date (CORY-QUESTIONS.md:181).
- Invite-only permanent gate leaning (LAUNCH-MILESTONES.md:151). Bot dump detection required by Cory.
- Referral: parked, not launch feature.
- Success: qualitative only.
- Financial model (agent): break-even ~7 Standard / 4 Gold / 2 Diamond-equivalent subscribers; scale projection; no metrics accepted by Cory (Q-44).

---

## 8. CONFLICTS

`C-n` = conflict between documents or with the charge. "Charge" = `../planning/REVIEW-CHARGE.md`.

### 8.1 Document vs document

- **C-1 Safety-never-paywalled status.** VISION.md:467-473 gives Cory's explicit, approved answer (all consent/release docs free, no exceptions). DOCTRINE:67 lists "Safety capabilities are never paywalled" as PROVISIONAL. Resolution guidance: Cory's statement is unambiguous; the doctrine tag lags. The exact boundary of "safety capabilities" beyond documents (e.g. age verification cost, boundary-setting, on-set tool) is not defined.
- **C-2 Free tier contents.** VISION.md:475-480 ("CORY - PROPOSED free tier (needs a pass against the app, not final)": 1 comp card, 0 moodboards, 1 portfolio, limited responding, all consent docs) vs COST-REALITY:84-102 (later same day: free = documents-only; comp cards PAID). The approved VISION text is stale on this point; the later ruling is `[CA]` only.
- **C-3 Pricing "ratified" vs "deferred".** RECONCILIATION:126 and COST-REALITY:302 say ratified $15/$29/$59. DOCTRINE:68 and VISION.md:489, 528-530 say pricing deferred/unreviewed by Cory; VISION.md:545 leaves pricing unchecked. CORY-QUESTIONS.md:84 says "Pricing generations, tiers, and price points remain explicitly deferred."
- **C-4 Tier naming inconsistencies inside COST-REALITY.** Locked ladder "Free / Standard / Gold Standard / Diamond Standard" (293) but text refers to "Platinum Standard" (line 299 says "top individual tier is 'Platinum Standard'") and the ratified pricing table/nets still say Basic/Pro/Agency (lines 302-320). Manager ladder given as "Guardian / Agent / Agency" (296) and "Guardian / Roster / House" (311). VISION.md:489 lists "Free / Basic $9 / Pro $19 / Agency $49" as draft.
- **C-5 Minors in first release.** For "yes": VISION.md:263 ("Cory intends to launch with guardian management"), VISION.md:368 (momager-forward "deliberately" puts minors near-term), LAUNCH-BUDGET:82 (youth-at-launch is "Cory's stated direction"; "This is the real plan"), RECONCILIATION:123 ("Ratified - yes"). For "open/deferred": DOCTRINE:87-89 (DEFERRED), CORY-QUESTIONS.md:69 ("Still open; adults are primary and youth launch is not ratified"), VISION.md:531 and checklist 545, VISION.md:463 (legal review gate). For "youth last": LAUNCH-MILESTONES M8 "deliberately last," ROADMAP.md:41 stage 5. Net evidence: Cory wants youth in the launch vision, but v1 youth scope is unratified and gated on counsel.
- **C-6 "Launch whole" vs staged plan.** VISION.md:409-411 (approved doc): launch "substantially whole", not dribs. ROADMAP.md:30-43 soft-start ladder (Stage 3 private adult beta, Stage 4 public adult, Stage 5 youth) and LAUNCH-MILESTONES M6/M7/M8 stage the rollout. A private beta is not necessarily a "launch," but the constraint "should not be traded away for an earlier ship date" (VISION.md:411) is unreconciled with adult-first public launch.
- **C-7 Unverified-account default view.** CORY-QUESTIONS.md:184 says "Unverified accounts get the youth-safe view by default" (stale). VISION.md:232 and COST-REALITY:42 say this was retracted; unverified see SFW slice of the ADULT world.
- **C-8 Youth no-upload default.** VISION.md:192 ("Status downgraded from 'default'... one option, NOT default") vs VISION.md:214 ("should be the default assumption for the youth-tier PRD unless a reason to host minor images emerges"). Same section, opposite framing. CORY-QUESTIONS.md:70 and `_OPEN-ITEMS.md:44` say no option is approved.
- **C-9 Stale status lines.** RECONCILIATION:25-26 says VISION and DOCTRINE are `REVIEW / REQUIRES CORY / PENDING`; `_OPEN-ITEMS.md:56` lists "Ratify VISION + DOCTRINE (flip headers to APPROVED)". Both are already `ACTIVE / APPROVED` (VISION.md:6-7; DOCTRINE:6-7; README.md:20). RECONCILIATION:50-58 also lists old-name cleanup that LEXICON has already completed.
- **C-10 Ratified-with-cost claims vs date.** README/VISION say ratification transcribed 2026-07-23; effective date 2026-07-17; many docs "Last reviewed 2026-07-17". Fine, but all cost/tier/knock material post-dates the review only by hours and has not been through a "fresh-context" cross-reference pass (RECONCILIATION:146-150 states this explicitly: "NEW-vs-NEW not yet cross-referenced").
- **C-11 Request model.** VISION.md:388 ("requests begin - to send or receive comp cards and portfolios... starts at a piece of work") and VISION.md:432-434 vs FEATURE-REVIEW.md:101-106 ("NO cold 'request a stranger's comp card'"; only share-forward or job-board reply; access invariant "You can only request access to something posted"). Compatible if "piece of work" = a posted brief or moodboard, but the docs use different vocabulary (Explore/moodboard bridge vs My Standard page + job board + Knock). The Knock-born signup (FEATURE-REVIEW.md:74) has a stranger tap "Request portfolio" on a My Standard page, which is a request reaching a person's page, not a piece of work.
- **C-12 Public link page vs "no profile browsing".** VISION.md:445 lists "Public profile URLs (`beforetheshoot.app/username`) need a decision - do they exist at all?" (open). FEATURE-REVIEW.md:118 and CORY-QUESTIONS.md:160 mark "My Standard" `modelingstandard.com/username` DECIDED. CORY-QUESTIONS.md:46 still lists the question as open.
- **C-13 Flat/Range rates.** BLUEPRINT.md:351-358 and `replit.md`: rates are Flat or explicit Min-Max, per team member, "no TBD/Negotiable." Cory's ratified line (DOCTRINE:65) says only "explicit" and "not vague negotiable." Nowhere does Cory approve a range as explicit. An open detail.
- **C-14 Hero copy.** LANDING-PAGE-COPY.md:36 hero "The shoot starts when everyone's on the same page." vs `design_guidelines.md:109` "Make shoot planning clearer before anyone arrives on set." and its "Join the waitlist" CTA vs "Pre-apply free". Both pending; landing status REVIEW.
- **C-15 Lexicon vs brief consolidation.** LEXICON.md:9-21 lists six brief types + 7-step builder; CORY-QUESTIONS.md:165 "Brief consolidation - CONFIRMED" (1 engine + presets).
- **C-16 Journey vs Cory's multi-role rule.** DOCTRINE:98-99 core journey is creator + "a participant" (two-party). VISION.md:374 requires every crew member to sign before being "in the room". The two-party shape is a simplification, not Cory's model.
- **C-17 Tier features that conflict with "browse" removal.** VISION.md:486-487: `canHideFromExplore`, `hasPriorityExplore`, `moodboardsPublic`, `briefsPublic` are "priced around a browsable Explore" and "need rethinking"; not resolved anywhere.
- **C-18 Strike visibility.** VISION.md:513 "strikes are flagged against the user until resolved" (Cory) vs PREMORTEM:222 recommending "strikes are private until resolved" as a doctrine line to ratify. Not obviously contradictory (flagged internally vs shown publicly) but unspecified.
- **C-19 Success/metrics.** CORY-QUESTIONS.md:203 (row open) vs :182 ("Recorded as the owner's answer; no metric substituted"). Answered but row not updated.
- **C-20 Jurisdiction row.** CORY-QUESTIONS.md:196 "Unrecorded anywhere in the repository" vs :179 BC confirmed.
- **C-21 Competitive row.** CORY-QUESTIONS.md:202 "None on record" vs :188 and COMPETITIVE-LANDSCAPE closes it.
- **C-22 Gap-between-preapply-and-go-live row** (CORY-QUESTIONS.md:201) vs :181 (no promised date).
- **C-23 Sensitive docs free vs "boudoir/fine art nude" and payment processor risk.** VISION.md:467 free; PREMORTEM:217 notes Stripe adult-content risk; "request-only portfolios already keep the public surface SFW." Not a conflict, but the product's "documents for nude shoots are free at scale" choice is exposed to processor classification. Noted, agent risk analysis.

### 8.2 Document vs CHARGE

- **X-1 First slice size vs "launch whole."** Charge §22-23 advocates "one complete product slice at a time" with a first slice of one adult collaboration, "deliberately exclud[ing] most of the eventual professional suite." Cory (VISION.md:409-411) says a rollout in dribs looks unfinished and "The launch must arrive substantially whole." These operate at different levels (build sequence vs public launch), but the charge does not mention Cory's constraint. The planner should keep dev slices distinct from launch, and put the launch-whole question to Cory.
- **X-2 Adult-only start vs Cory's stated youth-at-launch direction.** Charge §13 says "Start adult-only unless Cory explicitly decides otherwise" and treats youth as later. Docs: Cory's stated direction is youth in the near-term vision (VISION.md:368, 263; LAUNCH-BUDGET:82) but launch youth scope is unratified and legal-gated (DOCTRINE:89). The charge's "future-compatible, presently disabled" posture is consistent with the docs' legal gate. It is also consistent with Cory's own soft-start ladder (ROADMAP.md stage 5 last) but that ladder is PROVISIONAL.
- **X-3 "Safety is not the upsell" phrase.** Charge §10 quotes it. Docs say documents "are never the upsell" (VISION.md:469). The stronger claim in the charge ("Core consent, boundary-setting and relevant documentation should not become premium features") is a reasonable extension but the docs' hard commitment is limited to consent/release documents and PDFs. Doctrine still labels the general form PROVISIONAL.
- **X-4 "A child is not an account holder."** Charge §13 quotes it; docs say it differently (VISION.md:226). Substance consistent.
- **X-5 Charge §27 "do not reproduce the old tier model" / "Do not design pricing."** Consistent with DOCTRINE:68 (pricing DEFERRED). But COST-REALITY records Cory's later tier rulings (free = documents-only, invitee-free, Standard/Gold/Diamond ladder, currency-by-IP) that the charge does not mention. They may matter for architecture (entitlement abstraction): Cory-attributed but not ratified.
- **X-6 Charge §8/§20 focus on versions and evidence but omits signature.** Docs treat signatures as "load-bearing" (VISION.md:251), each bound to the clause (DOCTRINE:51), with timestamp + credential (DOCTRINE:53) and a final immutable PDF to all parties (DOCTRINE:53). Charge slice step 8 says "accepts, declines or raises defined concerns" and step 11 "same durable human-readable artifact." Signature binding to clauses is part of the approved evidence set and should feed acceptance criteria.
- **X-7 Charge §23 two-party slice vs Cory's crew rule.** See C-16. The charge's "invite another adult" can be extended to multiple participants; VISION.md:374 requires each participant (including MUA/stylist/assistant) to agree.
- **X-8 Charge §12 "trusted introduction" and "controlled professional discovery."** Docs: Cory's stated discovery model is work-first (public moodboards and concept briefs), "no profile browsing." Charge is compatible. Charge does not mention the two-door rule (invite or someone's page) or Cory's lean toward permanent invite-only; those are `[CA]`/PROVISIONAL (LAUNCH-MILESTONES.md:151).
- **X-9 Charge §14 "old URL requirement unless Cory specifically wants one."** Docs: Cory owns three domains; `modelingstandard.com` is the product domain; `beforetheshoot.app`/`.com` are Cory's "to redirect or retire as he chooses" (VISION.md:69). Cory wants `modelingstandard.com/username` for My Standard pages (FEATURE-REVIEW.md:118, `[CA]`).
- **X-10 Charge §26 visual mandate vs design_guidelines.** Design guidelines are explicitly provisional (line 3) and Playfair/Inter editorial black-and-white; charge treats as evidence only. Compatible.
- **X-11 Charge §28 mode C (negative engineering evidence) not in scope here.**
- **X-12 Charge §30 roles.** Charge names Dustin as "technical integration/orchestration... repository control and human merge authority" and Fable/Opus agents; docs say Claude Code is the only planned agent interface (GOVERNANCE.md:47; PROJECT-ROLES.md:29) and Dustin is "Acting technical and migration lead", duration unresolved (PROJECT-ROLES.md:23-25). Docs say "Do not create additional agent personas... AGENTS.md, or orchestration infrastructure" (GOVERNANCE.md:50). The charge's Fable/Opus model set is not reflected; those governance docs are older than the greenfield restart (they assume migration, e.g. "migration lead"). Governance PROVISIONAL.
- **X-13 Charge §14 "old accounts were test data."** Consistent with VISION.md:36-46. The one remaining artifact: July 15 DB dump "remains the only copy of the Replit database" (VISION.md:50), Cory's own test data.
- **X-14 Charge §24 "first collaboration story not yet settled."** Consistent (Q-01).

---

## 9. Additional pointers for the planner (not requested, but material)

- **Cory's origin story is the "why" that the charge tells you to preserve** (VISION.md:346-364). If the planner needs one paragraph of Cory's reasoning, it is VISION.md:346-362 (Tension 1).
- **The single richest Cory-voice sources**, in order: VISION.md Tension blocks 344-513; DOCTRINE:40-61; CORY-QUESTIONS.md §12/§13 answers; COST-REALITY Cory rulings (99-104, 265-300); FEATURE-REVIEW Cory-added sections.
- **Things Cory explicitly said not to reopen by inference:** primary identity (safety platform) - VISION.md:344; existing tier rule that makes safety free and "negotiable" rate removal - VISION.md:360.
- **Things Cory said must be true or not claimed:** any safety claim (VISION.md:499).
- **Things that need Cory, per his own standing rule:** youth launch scope, youth nudity terms, guardian authority, minor data retention (VISION.md:463). No agent, PRD, or implementation resolves them.
- **Dustin as author of docs.** README/Register owners listed as Dustin; the Claude-authored docs ("Claude's recommendations") attribute analysis to Claude; FEATURE-REVIEW.md:50 attributes The Knock to "Fable + Cory". No document is authored solely by Cory.
- The session date context: docs are dated 2026-07-15 to 2026-07-23; today is 2026-09-29. Nothing in the repo after 2026-07-23 (single commit). Cory may have made later decisions not recorded here.
