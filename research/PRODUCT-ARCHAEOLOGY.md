# Recon B — Product Archaeology of the old app ("Before the Shoot" / shootbriefgenerator)

Mode B only (CHARGE §28): what territory was the old app exploring, why did each thing exist, what information did it carry. Not a quality review (Scout A's job), not a design proposal. Nothing here is a requirement; the charge (§2, §27) gives it zero authority.

Repo: `seeravenproductions/ShootBriefGenerator` at commit bfbf5f1. Paths below are relative to its root. Product name in the old UI/emails was **"Before the Shoot"** ("by Modeling Standard" in email footers, `server/routes/invitations.ts:~570`).

Evidence tags: **[code]** verified by me in source this pass; **[docs]** taken from repo docs; **[Cory]** a statement attributed to Cory in `docs/VISION.md`, `docs/FEATURE-REVIEW-2026-07-17.md`, `docs/PRODUCT-DOCTRINE.md` (Mode A material, quoted only where it explains a feature's fate).

---

## 0. Headline findings (read these first)

1. **The old app was two products bolted together.** (a) A *collaboration-agreement spine*: brief -> invite -> review -> accept/flag -> organizer confirm -> PDF. (b) A *professional-presence layer*: profile, comp cards, portfolios, moodboards, rates, testimonials, availability, Explore, request-only access. The two barely touched each other; the spine was the part Cory called "the product" [Cory, VISION Tension 1].
2. **"Six brief builders" are one workflow in six costumes** (Cory's own words, FEATURE-REVIEW "Top 3 #1"). They share a Consent & Safety block, a place/date/moodboard header, a participant/role list, a compensation choice and a public toggle. They differ in which *scenario-specific* fields they add and in how strict they are. The union field list (§2.3) is the real asset.
3. **The 22 standalone "document tools" are not connected to anything.** They are pure client-side forms: fill, typed-name "signature" (both parties on one screen), jsPDF download. No server call, nothing stored, no link to a brief or to another person [code: `grep apiRequest|fetch client/src/pages/tools` -> none]. Only 7 of the document types (model/photo/minor/property release, nudity rider, usage license, NDA) also existed as a *brief-attached, two-party* flow (`brief_documents`), and that flow is documented as unsafe/broken (SP-002).
4. **The agreement was thinner than the docs claimed.** One-shot, binary per-invitee response (approve boundaries / flag = "declined"); a partial snapshot; "version" = the brief's mutable `updatedAt`; brief `status` values `approved`/`completed` were never set by any code [code]. See §3.
5. **Several visible surfaces were shells.** In-app `notifications` table: nothing in the server ever inserts a row (`createNotification` defined, zero callers) [code]. Email preference toggles are stored but never consulted before sending [code]. `BriefConfirmation` email template imported, never sent [code]. Tiers: config only, all enforcement returns `allowed: true` [code, `server/tierHelpers.ts`]. Scheduling: availability slots exist; booking never did.
6. **Compensation "negotiable" is a contradiction in the old product.** Doctrine/lexicon say vague/negotiable is *deprecated and must not exist* (`docs/LEXICON.md`, BLUEPRINT principle 3), yet Casting Call and Fashion Show Casting both shipped a "Negotiable" button that is silently persisted as `tfv` (§2.5).
7. **Discovery: Cory's stated verdict is that browsing people is the wrong model.** "if a creep makes an account, he must not be able to browse through everyone's profiles and photos" [Cory, VISION Q4]. Work (moodboards/concept briefs) is the bridge; requests begin from a posted piece of work. The old Explore had four tabs including a profile directory, and every profile was `isDiscoverable: true` by default (§5).
8. **Youth was represented by a handful of fields and a document, not a system.** `ageCategory` + guardian columns on a brief participant, a minor-age detector on casting roles, a Minor Release template. No guardian account, no partition; a minor + any nudity level could be persisted together (SP-027) (§6.4).

---

## 1. FEATURE MAP

Status legend: **W** working as far as I could see; **P** partial (built but incomplete / unreachable / gaps); **S** stub or shell (UI without effect); **Sim** simulated/unenforced; **B** built but documented as broken/unsafe (per `docs/SECURITY-PRIVACY-DEBT.md`); **NB** never built.

### 1.1 Identity / profile

| Feature | Route / file | Purpose (what user problem) | Who | Flow, one line | Status |
|---|---|---|---|---|---|
| Sign in | `/login` `Login.tsx` (159) ; server `replitAuth.ts` | Get an account with no password work | all | Replit OIDC only; first login auto-creates user + profile (profile created `isDiscoverable: true`, per VISION Q4) | W (provider-bound) |
| Private account / dashboard | `/account`, `/profile` -> `Account.tsx` (3,616) | The user's "home": edit the professional identity and see all their stuff in one place | every user | Profile header + sections: Comp Cards, Portfolios, Rates & Packages, My Briefs, My Moodboards, Availability manager; side drawer tabs: profile / testimonials / requests / settings / plan | W |
| Profile editing | inside Account | State who you are professionally, and (for models) your stats | model, photographer, MUA, etc. | Form: display name, profession, bio, company, website, contact email/phone, genres, experience, styles, preferred shoot types (tfp/paid/both), nudity comfort, travel willingness, current/frequent locations, travel plans, measurements, hair/eye, 5 comp-card photo slots, privacy toggles (show email/phone/stats), discoverability, team type, age range, shoot types | W |
| Public profile | `/:username`, `/p/:userId` `PublicProfile.tsx` (1,609) | Shareable professional page ("beforetheshoot.app/username") - a link to hand to people | anyone with link; owner | Hero, About, Stats (gated), Comp Cards (hero free, rest via request), Portfolios (public + request-gated private), Rates & Packages, Testimonials ("What People Say"), public Briefs, public Moodboards; access buttons show none/pending/approved/expired | W |
| Orphan profile page | `Profile.tsx` (317) | (legacy) | - | Not imported by `App.tsx` | dead |
| Username system | `shared/reservedUsernames.ts`, `profanityFilter.ts`, `usernameValidation.ts`, tables `admin_reserved_usernames`, `username_rules` | Vanity URL without impersonation/abuse | users, admins | 4 layers: format, reserved words, profanity list, admin rules (exact/contains/regex, severity 1-4, category) | W |
| Testimonials | Account drawer; `testimonials` table | Social proof from past collaborators | profile owner | Owner types the author's name/title/company/quote/rating/project date themselves (self-entered, unverified, not tied to any collaboration) | W (unverified) |
| Rates & Packages | Account; `user_rates` | Publish "what I charge" so people stop DMing to ask | profile owner | Titled rate cards: price text, numeric amount, min, currency, category, duration, visibility, order | W |
| User settings | Account drawer -> `user_settings` | Email prefs + how long approved access lasts | user | 4 email booleans (invitations/responses/reminders/marketing) + `accessDurationDays` (default 30) | email flags **S** (never consulted); access days W |

### 1.2 Brief / collaboration

| Feature | Route / file | Purpose | Who | Flow | Status |
|---|---|---|---|---|---|
| New Brief hub | `/brief/new` `NewBrief.tsx` (134) | "Which kind of shoot is this?" | creator | 5 choice cards (Quick Collab, Paid, Casting, Content, Full). **Fashion Show Casting has no card** - reachable only by URL/draft | W/P |
| Six brief builders | see §2 | Capture the shoot's terms up front | creator | Stepped wizard with autosaved draft (`useBriefDraft`), Save & Continue with per-step required fields | W |
| My Briefs | `/my-briefs` `MyBriefs.tsx` (659) | Manage what I created | creator | Tabs Published / Drafts; select + bulk delete; archive exists server-side | W (delete destroys consent history - SP-001) |
| Brief detail (owner) | `/brief/:id/view` `BriefView.tsx` (1,072) | Read the brief as a document; apply to it if not the owner; list "Documents to Sign" | owner / viewers | Sections: Models & Crew, Basic Info, Concept & Moodboard, Boundaries & Safety (incl. bra/underwear specs), Payment & Deliverables, Apply to This Shoot | W |
| Invitations hub | `/brief/:id/invitations` `BriefInvitations.tsx` (247) | After creating: summary, public share link, documents | creator | Shows brief summary, a "Shareable Link" (anyone can view + apply to open roles), Documents & Releases list. **No UI here or elsewhere calls `POST /invitations` or `/send-invites`** | P (see §3) |
| Share with an existing user | `ShareBriefDialog.tsx` -> `POST /briefs/:id/invite-user` | Send a brief to someone who already has an account | creator | Creates participant + invitation, emails `BriefShareNotification`, appears in invitee's Inbox | W |
| Review & respond | `/review/:token` `BriefReview.tsx` (1,141) | Invitee reads the brief step by step, sets their answer on boundaries, leaves notes | invited participant, no login needed | 6 steps: Shoot Details, Moodboard, Team, Boundaries, Compensation (their own), Confirm; legal name + company; approve boundaries yes/no (+reason if no); optional "additional safety requirements" (chaperone, wardrobe approval, closed set, private change area, photo review); per-step free-text notes | W endpoint; **no UI in the client that hands out the tokenized link** |
| Response tracking | `/brief/:id/responses` `BriefResponses.tsx` (780) | Organizer sees who viewed/answered/flagged | creator | Status overview badges (Not Opened, Viewed, Needs Confirmation, Concerns, Confirmed), per-person response detail, organizer approve/decline, "Approve & Send Final PDF" when everyone approved; also lists Applications | W |
| My Responses | `/my-responses` `MyResponses.tsx` (~200) | Invitee sees all invitations they have answered/what happened | participant | Badge: Pending Response / Awaiting Confirmation / Confirmed / Not Selected / Declined | W |
| Public share view + apply | `/share/:token` `ShareBriefView.tsx` (442); `POST /api/share/:token/apply` | Post an open call, let strangers apply to a role | creator, applicant | Read-only brief, apply form (name/email/phone/company/website/bio/role or custom role/notes/availability/portfolio links/step acknowledgments + notes/boundaries agreed + exceptions) | W to the point of the application row; **accepting an application only sends an email - it does not create a participant, terms or consent** [code `routes/applications.ts`] |
| Inbox | `/inbox` `Inbox.tsx` | One place for "things waiting on me" | all | Two tabs: Invitations (briefs shared with me) and Contact Requests (access requests to my content) | W |
| Confirmation page | `/brief/complete` | Post-create success | creator | Static | W |
| PDF brief package | `server/services/pdfGenerator.ts` (550) | A record everyone can keep | all participants | One PDF per participant, personalised with *their* compensation: Basic Info, Team Members, Creative Concept, Boundaries (wardrobe/styling/safety/additional), Deliverables/Quality/Usage, Payment & Compensation. **No signature / acceptance record on it** | W |

### 1.3 Agreement / signing

| Feature | Route / file | Purpose | Status |
|---|---|---|---|
| Brief-attached two-party documents | `/brief/:id/document/:docType` `BriefDocumentSign.tsx` (792); `brief_documents`; `routes/briefDocuments.ts` | Get releases/riders/NDA signed *inside* the shoot, prefilled from the brief | **B** - reads unauthenticated, creator auth uses wrong identity, recipient signing not bound to recipient (SP-002); feature frozen in debt register |
| Signature capture | `SignatureCapture.tsx` | "Sign" | Typed name + "I consent" checkbox + timestamp + userAgent. No drawn signature, no identity binding |
| Response = the "agreement" | `brief_responses.consentSnapshot` | Freeze what the invitee saw when they said yes | Partial (see §3) |

### 1.4 Documents / releases / toolkit

| Feature | Route / file | Purpose | Status |
|---|---|---|---|
| Toolkit index | `/tools` `Tools.tsx` (333) | Catalogue of 22 templates + Consent & Safety | W (sign-in required) |
| 22 document tools | `/tools/*` `pages/tools/*.tsx` (22 files, ~12.5k lines total) | "Anyone can produce a professional release/agreement/on-set sheet without a lawyer or a brief" | W as client-only PDF generators; legal treatment unreviewed |
| Brief-attached picker | `DocumentsSelector.tsx`; `briefs.selectedDocuments` JSON | Choose which releases travel with the brief; casting auto-selects Minor Release if role age range <=17 | W (selection), signing B |

### 1.5 Portfolio / comp cards / profile media

| Feature | Route / file | Purpose | Who | Flow | Status |
|---|---|---|---|---|---|
| Comp card builder | `/comp-card-builder[/:id]` `CompCardBuilder.tsx` (407); `comp_cards` | "The number of models that have asked me how to make one... is a lot" [Cory] - the acquisition wedge | model | Title + 5 labeled image slots (hero, full body, profile view, lifestyle, beauty close-up); draft/published; visibility public/request_only_public/private; multiple cards allowed. **Stats (height, bust, waist...) live on the profile, not the card** | W |
| Comp card view / print | `/comp-card-view/:id`, `/comp-card/:userId` ; `CompCardDocument.tsx` | Z-card document rendering: hero + 4 photos + stats + contact | anyone with access | Renders profile stats + images; non-hero photos gated behind `comp_card` access | W |
| Portfolios (photo sets) | Account section; `/portfolio/:id` `PortfolioView.tsx` (369); `photo_sets`, `photo_set_images` | Show work in themed albums | photographer/model | Title, description, category (commercial/fashion/headshots/editorial/lifestyle/other), shoot date, cover/thumbnail, display style (square vs original ratio), sort order, `isPublic`; one undeletable default set + one always-private set | W |
| Image upload/privacy hygiene | `imageProcessor.ts`, `ProtectedImage`, `BlurredContent` | Strip GPS/EXIF from model photos; deter casual saving | all | Sharp on server + canvas on client; blur gated content | W |

### 1.6 Discovery

| Feature | Route / file | Purpose | Status |
|---|---|---|---|
| Explore | `/explore` `Explore.tsx` (1,511); `routes/explore.ts`, `publicProfile.ts`, `discovery.ts` | Find collaborators and opportunities | W - and rejected as a model by Cory (§5) |
| Access requests ("contact requests") | `contactRequests.ts`; `ContactRequestForm`, `ContactRequestsInbox` | Ask an owner to open something gated (comp card photos, contact info, private portfolio, private moodboard) | W: pending/approved/declined + expiry (default 30 days) |

### 1.7 Scheduling / availability

| Feature | File | Purpose | Status |
|---|---|---|---|
| Availability slots | `AvailabilityManager.tsx` (in Account); `availability_slots`; `routes/availability.ts` | "A huge friction point is reaching out only to learn someone's booked" | P: time ranges with timezone, title, notes, recurrence rule, visibility public/contacts/private. Not on a calendar page; no booking; a coarse `availabilityStatus` (available/limited/busy) also on profile |
| Booking / calendar | - | - | **NB** ("not yet a page", FEATURE-INVENTORY) |

### 1.8 Moodboards

| Feature | File | Purpose | Status |
|---|---|---|---|
| Moodboard builder | `/moodboard/new` `MoodboardBuilder.tsx` (453) | Creative planning + a public "look at this idea" object | W: title, description, up to 12 images (URL paste/upload), location, tags, shoot type/genre, external URL (Pinterest), public toggle, "Access Control" |
| Moodboard view | `/moodboard/:id` `MoodboardView.tsx` (211) | Show it | W; view count |
| Audience classification | - | - | **NB** (no age/audience field; SP-028) |

Brief-level moodboard is separate and lighter: up to 5 image slots + one external URL on the brief itself.

### 1.9 Notifications / email

See §8. In-app bell + inbox counts exist; server never creates notifications.

### 1.10 Guardians / youth

See §6.4. Minor Release document, participant `ageCategory` + guardian fields, minor-age detection on casting roles, marketing copy "Parent & Guardian Support". No guardian account or partition. **P (fields only)**.

### 1.11 Tiers / billing

`/pricing` `Pricing.tsx` (373), `shared/tierLimits.ts`, `server/tierHelpers.ts`. Four tiers, limits config, pricing page. Enforcement disabled; Stripe reverted (FEATURE-INVENTORY). **Sim**.

### 1.12 Admin / moderation

| Feature | Detail | Status |
|---|---|---|
| Admin console | `/admin` `Admin.tsx` (2,187): tabs Dashboard, Reports, Users, Content, Analytics, Logs; sub-tabs User management, Reserved usernames, Content rules, Block stats | W (authz reported clean) |
| Reports | `reports`: reportType (user/photo_set/brief/profile), reason (inappropriate_content, harassment, spam, underage, non_consensual, copyright, impersonation, other), status pending/reviewing/resolved/dismissed, priority low/normal/high/urgent, action_taken none/warning_issued/content_removed/user_suspended/user_banned | W |
| Blocks | `user_blocks` with reason (harassment, spam, inappropriate, unprofessional, safety, other) | W (enforcement scope not checked here) |
| Moderation audit | `moderation_logs`, `moderation_actions` (warn, remove_content, temp_ban, perm_ban, unsuspend, resolve/dismiss report) | W |
| Suspension | `users.isSuspended/suspendedReason` | written and displayed, **not enforced at login** (SP-006) |
| Cleanup tools | empty-brief and test-user dry-run + delete; startup cleanup timer | W but dangerous (SP-005) |

### 1.13 Other

Legal pages (Terms, Privacy, Cookies, Copyright, Community Guidelines, Legal Disclaimer, `/legal`), landing page `Home.tsx` (892; pain -> build/define/share -> features -> trust -> "For Models / Photographers / Parents-Guardians" -> industry -> consent-matters), template disclaimer modal, image upload/object storage endpoints.

---

## 2. THE SIX BRIEF BUILDERS

### 2.1 What each was for

| # | Brief type (`briefType`) | Route / file (lines) | Steps | Scenario it served | Distinctive fields |
|---|---|---|---|---|---|
| 1 | **Full Brief** `full` | `/brief-builder` `BriefBuilder.tsx` (**4,377**) | 7: Models & Crew, Basic Info, Concept & Moodboard, Parameters & Consent, Payment & Deliverables, Documents & Releases, Review | The maximal shoot: named crew, exact wardrobe/undergarment boundaries, deliverable specifics, documents | Participants with `ageCategory` + guardian block; "Looking For" roles (count, gender pref, age from/to, notes, list-on-Explore, Explore city); environment flags (pro studio, home studio, outdoor public, water work, elevated surfaces); estimated finish; ~60 boundary toggles (see 2.3); photo-set counts and min/max; delivery methods; deliverable quality; usage x6; documents x7 |
| 2 | **Quick Collab** `collab` | `/brief/collab` `QuickCollabBrief.tsx` (709) | 5: Basics, Concept, Team, Safety, Exchange | TFP/TFV portfolio trade between peers; "forcing a quick TFP collab through a 7-step enterprise form kills adoption" [BLUEPRINT s10] | Compensation limited to `tfp` \| `tfv` (+ required description of what each gets); usage 3 flags; **shared costs** toggle + description (the only "expenses" concept in any builder) |
| 3 | **Paid Shoot** `paid` | `/brief/paid` `PaidShootBrief.tsx` (1,043) | 6: Basics, Concept, Team and Rates, Budget, Safety, Deliverables | Client work where money is agreed *outside* the platform but *recorded* in it (LEXICON: "does not imply platform payment processing") | Client name/company; **per-participant rate** (role, name, rate, optional max, rateType hourly/half_day/full_day/flat, mode flat\|range, duration, `rateVisible`); currency (USD/CAD/EUR/GBP/AUD); total budget (required); payment method (bank transfer, PayPal, Venmo, Zelle, cash, check); deposit toggle + amount; payment due date; number of images; delivery timeline (default 2 weeks); usage x4 + usage duration (default unlimited); **cancellation policy** |
| 4 | **Casting Call** `casting` | `/brief/casting` `CastingCallBrief.tsx` (919) | 6: Basics, Concept, Roles Needed, Compensation, Safety, How to Apply | Open call: "I need talent for a project" | Project type (photoshoot, video, commercial, editorial, lookbook, ecommerce, event, other); roles (role, count, gender pref, age from/to, notes, list on Explore, Explore city); compensation paid\|tfp\|tfv\|negotiable; application deadline; what to submit (comp card, portfolio, headshot, full body, video); free instructions. Minor-age range on any role auto-selects Minor Release, forces `guardianRequired`, and blocks listing that role on Explore |
| 5 | **Content Creation** `content` | `/brief/content` `ContentCreationBrief.tsx` (930) | (steps not enumerated here) | Social/brand content collabs | Platforms (Instagram, TikTok, YouTube, X, Pinterest, Facebook, LinkedIn, other); formats (reels, static/carousel, stories, long video); brand name/product/guidelines; collaborators (role, name, **social handle**, email); number of pieces; delivery timeline (3 days...1 month); who posts (creator/brand/both); compensation paid\|gifted\|hybrid\|tfp\|tfv (+details); usage duration (3mo...unlimited); can repurpose; can boost (paid promotion) |
| 6 | **Fashion Show Casting** `fashion_casting` | `/brief/fashion-casting` `FashionShowCasting.tsx` (1,082) | 5+: Basics, Concept, Model Requirements, ... | Runway/event casting (Cory's runway-company contacts; validated by the real Surrey Fashion Week email, REAL-BRIEF-EXAMPLES) | Show name; designer/brand; description; venue; city; show date/time; **rehearsal date; fitting dates**; model requirements (gender women/men/non-binary/any, count, height min/max, size range, experience level, age min/max, notes); tattoo policy; piercing policy; runway video required; compensation paid\|unpaid\|negotiable, rate + rateType (per show/day/look/package); **travel covered; meals covered; images provided; additional perks**; application deadline; submission requirements (headshot, full body, measurements, comp card, runway video); how to apply |

Also in schema but never built: `BRIEF_TYPES.FASHION_PRODUCTION = 'fashion_production'` (`shared/schema.ts`), i.e. Cory had a *production-side* fashion show brief in mind (hiring photographers/crew for a show), evidenced by the real Surrey email ("Official Photographer" - organizer -> photographer), which the old app could only approximate with Fashion Show Casting (a *talent* casting).

Cory's own verdict [Cory, FEATURE-REVIEW 2026-07-17]: "one workflow in six costumes"; consolidate to one engine + scenario presets; Content Creation "drifts toward influencer/TikTok" (demote or cut); Fashion Show Casting "likely Casting Call + preset". Governing principle: "The site has so many tools that à la carte would need a university degree. Preset workflows are essential." Safety carve-out: presets may never remove a safety step.

### 2.2 What all six had in common

- Header: title, date + time (each with a **TBD** switch), location name + address (Google Places autocomplete) with TBD, **cities[]** (required, a discovery tag), concept/description, moodboard URL + up to 5 image slots.
- People: a list of participants (named) and/or roles sought (open).
- The **same Consent & Safety block** in every builder (`ConsentSafetySection.tsx`): see 2.3.
- Compensation choice (vocabulary differs per builder, see 2.5).
- `isPublic` toggle that also sets `isActive` (= appears on Explore).
- Draft autosave/reopen (`useBriefDraft`, `POST /api/briefs/draft`, `?id=` reopen), lenient on draft, strict on publish.
- Type-specific fields are **stored inside the `boundaries` JSON blob** on the brief row (e.g. Paid: clientName, cancellationPolicy, participantRates; Casting: roles, whatToSubmit, guardianRequired) - a data-modeling fact that shows commercial terms were riding in the "boundaries" bag.

### 2.3 UNION FIELD LIST (everything a brief could carry)

**Purpose / concept**
- shoot title; shoot type / genre (Portrait, Fashion, Editorial, Boudoir, Commercial...); project type (casting); concept/theme text; moodboard (5 image slots + external link); number of outfits; brand name/product/brand guidelines (content); show name/designer/description (fashion).

**When / where**
- date, time, estimated finish time; TBD flags for date/time/location; delivery/rehearsal/fitting dates (fashion); application deadline (casting/fashion); location name, address, environment flags (pro studio, home studio, outdoor public, water work, elevated surfaces); cities[] for discovery; venue (fashion).

**Roles / participants**
- Named participants: role, full name, email, legal name + company (filled by the participant at review), age category (adult / under18), notes, social handle / other social URL, per-person duration.
- Guardian (if under 18): name, email, phone, creator's phone, guardian present on set.
- Open roles ("looking for"): role, count, gender preference, age from/to, notes, list-on-Explore + city.
- Model requirements (fashion): gender, count, height min/max, size range, experience level, age min/max, notes; tattoo policy; piercing policy.
- Client/payer identity: client name, client company, `clientPayerId` (which participant pays).
- Creator info (pre-filled from profile, overridable): name, email, phone, company, website.
- Role vocabulary (`shared/roles.ts`): photographer, model, content_creator, videographer, mua, hair_stylist, stylist, retoucher, organizer/producer, brand_client, other (legacy map folds creative director, art director, set designer, prop stylist, assistant, designer into other/stylist/organizer).

**Compensation (see 2.5)**
- payment type (tfp, tfv, paid, collab; casting/content/fashion add negotiable, gifted, hybrid, unpaid in UI only); TFV description; currency; rate type (hourly, half_day, full_day, flat, per_set, per_day; fashion: show, day, look, package); flat vs range rate (min-max); total budget; payment method (bank transfer, PayPal, Venmo, Zelle, cash, check, other + description); deposit (fixed/percentage, amount/percent); down payment; due date (specific or relative: 1week/2weeks/1month/upon_delivery); per-participant `rateVisible` (whether others see it).

**Expenses**
- shared costs toggle + description (Quick Collab only); travel covered, meals covered, images provided, additional perks (Fashion). No general expenses ledger / who-pays-what / reimbursement anywhere.

**Deliverables & delivery timing**
- number of photo sets; photo count type (per set / total / both); min/max photos (total and per set); number of images (paid); deliverable methods (cloud storage, online album, prints, email, no preference); deliverable quality (raw, color graded, retouched light, retouched heavy, artistic freedom, other); delivery timing (specific date or 1 week / 2 weeks / 1 month / custom; content: 3 days...1 month); content-specific: platforms, formats, number of pieces, who posts (creator/brand/both).

**Usage rights**
- usage flags: portfolio, social media, website, editorial, advertisement, commercial; usage duration (3mo, 6mo, 1yr, unlimited); can repurpose; can boost; `sendPhotoReleaseForm` (send a photo release when commercial). The per-document forms add term (1/2/5 yrs/perpetual), territory (local/national/worldwide), exclusivity, license fee, credit requirement.
- credit terms appear in TFP Agreement, Usage License and (in the real example) as core, but **not** as a brief field.

**Boundaries / wardrobe / content levels**
- Simple (shared block): `nudityLevel`: fully_clothed, swimwear_lingerie, implied_nudity, artistic_nude, explicit (18+).
- Full builder detail: nudity toggles (none, lingerie, see-through, implied, partial, full, artistic); clothing levels (fully clothed, short skirts/shorts, low-cut tops, open-back shirts, swimwear one/two piece, lingerie/intimates, implied, partial, full artistic); undergarments - bra colour options + nipple covers + free-text spec; underwear colours + style request; styling elements (body paint, sheer fabrics, special effects, props handling); outfit changes (required?, count, private change area, description).
- Physical contact: overall level none / minimal / choreographed / intimate; toggles hair styling, makeup application, wardrobe adjustments, pose guidance, close-proximity work; notes.
- **Mandatory statement** (full builder): "anything not listed here is off-limits" checkbox (`agreementOffLimits`).

**Safety expectations**
- chaperone allowed (simple) / required (full); closed set (+ details); safe word / signal established; emergency contact on set; private change room/area (+ details); wardrobe approval required; photo review after shoot; break frequency (every 30 min, hourly, every 2 hours, as needed).

**Documents**
- selected documents: modelRelease, photoRelease, minorRelease, propertyRelease, nudityRider, usageLicense, nda (auto-select minorRelease for minor-age roles).

**Discovery / visibility**
- isPublic, isActive, visibility (public / request_only_public / private), shootType, teamType (solo/team), ageRange[], cities[].

**Application / casting**
- what to submit (comp card, portfolio, headshot, full body, video, measurements, runway video); additional instructions / how to apply; application deadline.

**Changes / approvals (brief-level)**
- **No change-log or amendment field of any kind.** Approvals live outside the brief (invitation rows). Cancellation policy exists in Paid only; nothing on rescheduling, weather, no-shows, or delivery dispute.

### 2.4 Required vs optional (as enforced by steps)

| Builder | Required to advance/publish |
|---|---|
| Full | Team: >=1 participant OR looking-for role; Basic: title, date, location name (time too, or TBD); Concept text; Parameters: >=1 nudity/clothing option AND the off-limits agreement; Details: compensation type (TFV needs a description), delivery timeline, >=1 delivery method, >=1 usage right. Documents/Review: nothing. Server publish gate (`routes/helpers.ts validateBriefForPublish`): title, shoot type, date or range, location, at least one content section |
| Quick Collab | title; date (or TBD); >=1 city; >=1 team member; description of what participants receive |
| Paid | title; date; >=1 city; >=1 team member; total budget |
| Casting | project title; >=1 city; >=1 role; rate range if paid / description if TFV |
| Content | project title; >=1 city; >=1 platform; >=1 collaborator |
| Fashion | show name; >=1 city; model requirements; rate if paid |

Everything else optional, including the whole Consent & Safety block (defaults: fully clothed, no contact, all toggles off) except the Full builder's explicit off-limits agreement.

### 2.5 How compensation was modelled (the "negotiable" story)

1. **Doctrine / stated design:** "There is no TBD and no Negotiable rate. Vague rates are the mechanism by which promoters... pressure talent's pay downward on the day." Rates are Flat or an explicit min-max Range, per participant (BLUEPRINT principles 3 and s11; LEXICON: Negotiable "Deprecated / not current").
2. **Stored shape:** brief-level `paymentType/currency/rateType/rate/paymentMethod/dueDate/deposit*/tfvDescription` on `briefs`, *plus* a per-participant row in `participant_compensation` (same fields), *plus* per-participant rates inside `boundaries.participantRates` JSON for the Paid builder, *plus* `rateMax/rateMode/duration/rateVisible` only in that JSON. All amounts are **text**, not numbers. Four coexisting representations of "what does this person get".
3. **`paymentType` values persisted:** `tfp`, `tfv`, `paid`, `collab` ("Equal Exchange": no one hires the other, all contribute equally). The UI vocabulary is larger than the stored vocabulary: Content's `gifted` is saved as `tfv` with the fixed text "Product/service gifted"; `hybrid` is saved as `paid`; Fashion's `unpaid` and **`negotiable`** are saved as `tfv`; Casting's **`negotiable`** falls through to `tfv` and on reopen renders as TFV. So "Negotiable" was a selectable option in 2 of 6 builders (`CastingCallBrief.tsx:728`, `FashionShowCasting.tsx:851`) that lost its meaning on save, contradicting the doctrine.
4. **What people were reaching for with "negotiable":** in casting/open-call contexts the poster often does not know the rate yet and wants to attract applicants; the old app's alternative was "Rate / Budget Range" as free text (e.g. "$200-500/day depending on experience"), a *text field* even though the doctrine wanted structured min-max.
5. **In-kind is real** [REAL-BRIEF-EXAMPLES]: the Surrey Fashion Week brief is entirely non-cash (media pass, credits, certificate, networking, BTS, exposure); "compensation must support TFP/TFV richly, not assume money".
6. **Money never moved through the product** (LEXICON: "records externally agreed paid compensation"). Deposit/payment method/due date are records.
7. **TFV definition enforced by copy:** "clearly defined non-cash benefit of measurable value"; TFP = agreed edited images; UI hint "If the value cannot be clearly defined, it cannot be valued."

---

## 3. AGREEMENT / CONSENT FLOW AS BUILT

### 3.1 Actors and paths (three entry paths; only one had the full sequence)

| Path | How the invitee arrives | Status of the path in the client I inspected |
|---|---|---|
| A. Tokenized invitation | Creator adds participants (emails), server creates a `brief_invitations` row with random token (+ SHA-256 `tokenHash`, 30-day `expiresAt`), emails `BriefInvitation` with `/review/:token`. `POST /briefs/:id/invitations`, `POST /briefs/:id/send-invites` | Server complete. **I found no client code that calls either endpoint** nor any UI that shows the tokenized link (`grep` for `send-invites`, `/invitations` apiRequest, `.token` links -> only `BriefReview`/`ShareBriefView` consume the token). Reachable only if someone already holds a link |
| B. Share to existing user | `ShareBriefDialog` -> `POST /briefs/:id/invite-user` creates participant + invitation, emails `BriefShareNotification` with login->`/inbox`; brief appears in Inbox | Working; but the Inbox links to `/brief/:id/view`, `/invitations`, `/responses` - it does not lead the invitee into the `/review/:token` respond flow either |
| C. Public share link + application | `POST /briefs/:id/share-link` -> `/share/:token` read-only; stranger applies (`brief_applications`) | Working to the application row. Accepting/declining only sets `status` and emails; **no participant, no terms, no consent record is created** |

### 3.2 The sequence (path A, as designed and implemented server-side)

1. **Draft** brief (status `draft`, lenient). **Publish** (`POST /briefs/:id/publish`) validates title, shoot type, date, location, some content; sets `status = 'sent'` **and `isPublic = true`** ("Published briefs are public by default").
2. **Invite** each participant (`brief_invitations.status`: `pending` -> `sent` -> `viewed` -> `responded`).
3. **Review**: 6 steps. Invitee sees the brief plus *their own* compensation (`GET /invitations/:token/compensation`). Provides **legal name** + company, per-step notes (shoot details, moodboard, team, compensation), one **boundaries decision** (approve = true / "concerns" = false + reason), optional **additional safety requirements** (5 booleans).
4. **Submit** (`POST /invitations/:token/response`): one response allowed per invitation ("Response already submitted"). `responseType = 'accepted'` iff `boundariesApproved`, else `'declined'` - so **flagging a concern = declining**; there is no "accept with changes", "counter", or "question" state.
5. **Consent snapshot** stored on the response: `{briefVersion, shootTitle, boundaries, nudityLevel, privateChangeArea, photoReviewAfterShoot, paymentType, rate, rateType, currency, signedAt}` and `briefVersionId`.
6. **Organizer decision** per invitee (`organizerStatus`: pending / approved / declined, `organizerApprovedAt`, `organizerNotifiedAt`); "double opt-in". Approve -> `OrganizerApproval` email "You're confirmed for {shoot}!".
7. **Finalize**: `POST /briefs/:id/send-final-pdf` allowed only when every invitation has a response and all `boundariesApproved === true`; generates a personalised PDF per participant and emails it.
8. **Dual-signature documents** are a parallel track (`brief_documents`: `draft -> creator_signed -> fully_signed`), never required for step 7.

### 3.3 Statuses / enums (all free `text` columns, no DB enums)

| Object | Values |
|---|---|
| `briefs.status` | `draft`, `sent`, `approved`, `completed` - **`approved` and `completed` are never assigned by any code** [code grep]; effectively `draft` and `sent` only. Plus `archivedAt` soft-delete |
| `brief_invitations.status` | pending, sent, viewed, responded |
| `brief_invitations.responseType` | accepted, declined |
| `brief_invitations.organizerStatus` | pending, approved, declined |
| `brief_applications.status` | new, reviewed, accepted, declined |
| `brief_documents.status` | draft, creator_signed, fully_signed |
| `brief_share_links.status` | active, revoked |
| `contact_requests.status` | pending, approved, declined (+ `expiresAt`) |

### 3.4 What "version" meant

- `briefVersionId` = `brief.updatedAt.toISOString()` at response time - a **timestamp of the last edit, i.e. mutable**, not a version number, hash or immutable copy (`services/invitationResponseService.ts:70-79`). Debt register calls this out (SP-007).
- The snapshot froze a *selection of fields* (not clause text, not deliverables, usage, dates, location, participants, documents, or participant-specific rates beyond the brief-level ones). The invitee's *own* compensation (from `participant_compensation`) was shown at review but is not in the snapshot.
- **What happened when a brief was edited after acceptance:** nothing. `PATCH /briefs/:id` (owner only) applies a partial update with no check for existing responses; responses/acceptances stay marked accepted; no re-review state, no notification, no "changed since you agreed" comparison anywhere in client or server (`grep briefVersion|changed since|snapshot` in pages -> none). The only trace is the mismatch between `updatedAt` now and the stored `briefVersionId`, which nothing reads.
- Deleting a brief (owner action, bulk-capable in My Briefs) cascades away responses, snapshots, participants and guardian fields (SP-001).

### 3.5 The "negotiation" that was reached for

- Per-step free-text notes on the response (`stepNotes`), and the `additionalSafetyRequirements` booleans were the whole counter-proposal vocabulary. Applications carry `stepAcknowledgments` (boolean per step) + `stepNotes` + `boundaryExceptions` free text - a closer precursor of "accept/counter per term".
- Cory's later model: per-term notes with compliance %, no free text channel, contact info released on mutual accept [Cory, FEATURE-REVIEW Top 3 #2] - not built.

### 3.6 What signatures were

`SignatureData = { typedName, consentGiven, timestamp, userAgent }`. Same component used by the 22 standalone tools (both "parties" typed on the same screen) and by brief documents. In the review flow, the "signature" is the submit action plus legal name text; no signature object at all.

---

## 4. DOCUMENT TOOLS

### 4.1 Inventory (22 tools + brief-attached set)

| Group | Document | What its form carried (from state fields) |
|---|---|---|
| Safety & consent (doctrine: free at every tier) | **Consent & Safety Forms** (`/tools/consent-safety`, 1,170 lines): Model Consent & Boundaries, On-Set Safety Agreement, Intimacy & Sensitive Content Rider | participant/photographer, shoot, nudity notes, contact level + notes, agreed / not-agreed activities, safe word/signal, emergency contact, private change room, closed set, intimacy coordinator (Y/N + name), chaperone, break frequency, content-type toggles (lingerie, swimwear, sheer, implied, artistic nude, couples posing, sensual expressions, body paint, water/oil), hard limits, comfort signals, wardrobe |
| | Nudity Rider; Implied Nudity Agreement; Couples Intimacy Release; Body Paint Release; Fine Art Nude Declaration; Boudoir Addendum; Pregnancy Release; **Minor Release** | per-topic consent + parties + shoot + terms; Minor: minor name/age + guardian name/email/phone |
| Releases & licensing | Model Release; Photo Release; Property Release; Usage License | parties, shoot date/location/description, usage rights list, term (1/2/5 yr/perpetual), territory (local/national/worldwide), compensation, exclusivity, licence fee, credit, restrictions |
| Business & transactional | Deal Memo; Invoice; NDA; TFP Agreement; TFV Agreement; Delivery Confirmation | Deal Memo: client + photographer, project, deliverables, total fee, deposit + due, balance due, payment method, usage, cancellation policy. Invoice: from/to, line items, due date, terms, method. TFP: print publication/formats/run quantity, territory, duration, credit. Delivery Confirmation: deliverer, recipient, project reference, delivery methods, files delivered, formats, resolution, deliverable categories, **recipient confirms receipt / confirms match**, discrepancy notes |
| Production planning | Call Sheet; Shot List; Model Lineup | Call Sheet: call/wrap time, location, parking, producer/director contacts, weather, emergency contact. Shot List: per shot description, type, angle, movement, equipment. Model Lineup: show, venue, model, designer, look numbers, quick-change notes |

### 4.2 How they related to briefs

- **Standalone tools: no relationship.** No brief ID, no persistence, no server, no second party. Output is a downloaded PDF (`jsPDF`, `client/src/lib/pdf/*`, `consentDocumentGenerator.ts` 611 lines).
- **Brief-attached:** a brief selects which of 7 documents travel with it (`selectedDocuments`); the creator opens `/brief/:id/document/:docType`, form is **prefilled from the brief** (photographer name/company/email, shoot date, location, concept as description, usage flags mapped to release usage options); creator signs; recipient counter-signs; status flow draft -> creator_signed -> fully_signed; per-type PDF generators. The seed of "documents assembled from the agreement" is here [Cory doctrine: "the product does not invent them, it assembles and captures them"].
- **Triggers that existed:** minor-age role -> Minor Release; "commercial use" -> photo release form checkbox. The doctrine expects usage answers to pull release/licence documents into the final package [PRODUCT-DOCTRINE, Consent and evidence #5].
- **PDF "package":** the brief PDF (server, pdfkit) is separate from signed-document PDFs; there is no single "final shoot package" that bundles brief + snapshot + signed documents + delivery confirmation, though that idea is in the charge (§6 "final shoot packages") and Cory's docs (delivery = "transit, not hosting").
- **Tier gating (config only):** Free = consent & safety + basic releases; Basic = full toolkit; Pro = art/sensitive docs + custom PDF branding.
- Legal status: every template carries a disclaimer (`legal-disclaimers.ts`, `TemplateDisclaimerModal`); LEXICON says these are "not approved legal instruments"; Cory question open on which are operationally essential.

---

## 5. EXPLORE / DISCOVERY

### 5.1 How it worked

- `/explore` (login required; logged-out users see only "Sign in to Explore"). Four tabs in this order: **Moodboards, Portfolios, Briefs, Profiles**.
- Data source: only items where the owner had switched on visibility: `user_profiles.isDiscoverable` (default **true**), `briefs.isActive` (set by `isPublic` at build time), `brief_roles.listOnExplore` + `exploreCity`, `moodboards.isActive`, `photo_sets.isPublic`.
- Backends: `GET /api/explore` (profiles, `publicProfile.ts`), `/api/explore/briefs`, `/roles`, `/moodboards`, `/portfolios`, plus `/api/users/search`, `/api/users/discover`.

### 5.2 What was browsable and filterable

| Tab | Item | Filters |
|---|---|---|
| Profiles | person cards | free-text (name/location/bio); role; availability (available/limited/busy); genre (shoot type); solo/team; location; age range |
| Briefs / open roles | public briefs and casting roles | role; gender preference; booking type (TFP/TFV/paid/collab); city; free-text |
| Moodboards | active public boards | location; genre |
| Portfolios | public photo sets | text search; category; booking preference |
Pagination by offset per tab; a selected brief/role/moodboard opens in a detail dialog.

### 5.3 What Cory's docs say the problem was

- Threat model: "if a creep makes an account, he must not be able to browse through everyone's profiles and photos. That is the requirement." [Cory, VISION Q4 "ANSWERED, and it removes a feature. There is no profile browsing."]
- "Every user who has ever logged in was made browsable automatically" (`replitAuth.ts upsertUser` -> `isDiscoverable: true`, comment "All profiles are public by default") - default rejected (SP-013).
- Inversion: "conventional platforms let you browse people to find work. This product lets you browse work to reach people, by request." Bridge = moodboards + concept briefs, "never a gallery of people". "This isn't social media. It's a professional dashboard." [Cory, VISION Tension 3]
- Access invariant: "You can only request access to something posted." [Cory, FEATURE-REVIEW]
- Pricing contradiction: `canHideFromExplore` was Pro-only ("privacy as a $19/month feature"); `hasPriorityExplore` priced ranking of people; both dead under the ruling.
- Explore could keep working only as a surface for *propositions*; public moodboards must carry a **mini-brief** (what / where / when / audience classification) so it "can't accidentally become Pinterest" [Cory, FEATURE-REVIEW]. Open: what a stranger sees about the poster; "discovery replacement" mechanism unresolved [CORY-QUESTIONS].
- Youth gap: moodboards have no audience field yet were the public front door (SP-028); only role-level control existed (roles with age range <= 17 not listable).

### 5.4 The request/grant mechanism (the part Cory wants kept and tightened)

`contact_requests`: requester logged-in, `requestType` in {comp_card, contact_info, portfolio, moodboard}, optional `resourceId` (one item) else all of that type, `purpose`, `message`, auto-captured requester details, owner responds (approved/declined + message), approval sets `expiresAt = now + accessDurationDays` (default 30; owner-configurable). Client-visible states: none -> pending -> approved -> expired ("Access Expired - Request Again"). Visibility enum on comp cards, moodboards, briefs: `public` / `request_only_public` (existence visible, content gated - the default) / `private`. Central check in `server/accessControl.ts`. Cory: "want it tighter... narrower scope, real expiry, owner control over each grant."

---

## 6. IDENTITY, ROLES, TIERS

### 6.1 Account and profile model

- `users` (id = **the Replit OIDC subject**, email non-unique, first/last name, profile image URL, `role`, `subscriptionTier`, suspension fields, `isTestUser`). `user_profiles` 1:1 (username unique, everything in §1.1). No org/team/studio entity; "company" is a text field. No phone/email verification, no ID/age verification. One account = one person; anyone can be both creator and participant.
- **Professional role is a profile string** (`profession`: photographer, model, mua...), not an account type and not a permission. On a brief, role is a per-participant string. `shared/roles.ts` holds the fixed list (11 values) plus a legacy alias map.
- Profession-specific data exists only for models (measurements/sizing type femme/masc/nonbinary/unspecified, hair/eye, 5 comp-card images). Cory's later ask: role-adaptive profiles (photographer: gear, deliverables offered, rate card; stylist: inventory; NO measurements for non-models) [Cory, FEATURE-REVIEW "Role-adaptive profiles"].
- System roles: `user`, `moderator`, `admin`.
- Profile privacy: `showEmail`, `showPhone`, `showCompCardStats` (default false), `shareToken` (a private link granting full comp-card + measurements), `isDiscoverable`.

### 6.2 Tier model (names and gates; config only)

| | Free $0 | Basic $9 | Pro $19 | Agency $49 |
|---|---|---|---|---|
| Create briefs | no (respond only) | yes | yes | yes |
| Briefs total / public | 0/0 | 5/2 | 25/5 | unlimited/10 |
| Moodboards total / public | 1/1 | 5/2 | 25/5 | 50/10 |
| Consent & safety forms | yes | yes | yes | yes |
| Basic releases | yes | yes | yes | yes |
| Full document toolkit | no | yes | yes | yes |
| Art/sensitive docs | no | no | yes | yes |
| Custom PDF branding | no | no | yes | yes |
| Custom username URL | no | yes | yes | yes |
| Portfolio images | 30 | 300 | 3,000 | 15,000 |
| Full comp card | no | yes | yes | yes |
| Priority on Explore / Hide from Explore | no/no | no/no | yes/yes | yes/yes |
| Analytics | no | no | yes | yes |
| Team members / shared brief library | no | no | no | yes |

Source `shared/tierLimits.ts`; enforcement `server/tierHelpers.ts` returns `allowed: true` for everything; `users.subscriptionTier` defaults 'free'; Stripe reverted. Stated intent: "Safety is never paywalled"; free users can *respond* to briefs but not create. Cory: comp cards/portfolios unlimited (owned professional material), so per-image limits and discovery-priced tiers are dead [VISION].

### 6.3 Roles-in-a-shoot vs accounts

Participants on a brief may be **non-users** (email only) - review by token requires no login; users are matched to invitations by email or userId (`getInvitationResponsesByEmailOrUserId`). An organizer is just the brief owner (`briefs.userId`); there is no co-organizer, no producer delegating, no manager acting for talent.

### 6.4 Guardians / youth as built

- Fields: `brief_participants.ageCategory` ('adult' | 'under18'), `guardianName/Email/Phone`, `creatorPhone` (for guardian to contact), `guardianPresent`. Guardian is *data on a participant row*, not an account; guardian never signs in, sees, or approves anything in-product.
- Behaviours: under-18 selection reveals guardian fields and triggers Minor Release; casting role age range that touches <= 17 auto-selects Minor Release, sets `guardianRequired`, forces `listOnExplore = false`; `underage` is a report reason; Minor Release template (`/tools/minor-release`).
- Absent: age verification, guardian-managed accounts, a youth/adult partition, any restriction of nudity/contact levels when a minor is present (SP-027: CSS-only gate; server accepts any `nudityLevel`; value flows into PDF and snapshot), audience classification on moodboards (SP-028), CSAM/image scanning. Landing copy nonetheless advertised "Parent & Guardian Support" and a "For Parents / Guardians" benefits column. Charge §13/§27: do not build youth now.

---

## 7. DOMAIN CONCEPT INVENTORY (vocabulary evidence only; not a schema recommendation)

28 tables in `shared/schema.ts` (1,050 lines). All enum-like values are free-text columns.

| Entity (table) | Concept it stands for | Notable fields / statuses |
|---|---|---|
| users | account/identity (subject = provider id) | role user/moderator/admin; subscriptionTier free/basic/pro/agency; isSuspended (+reason/at); isTestUser |
| sessions | login session store | (infrastructure) |
| user_profiles | professional identity + model stats + privacy | username, displayName, profession, bio, company, website, contact email/phone, availabilityStatus, profileViews; nudityComfort (none/implied/artistic/partial/full); willingToTravel (no/local/regional/national/international); modelingGenres[], experienceLevel (beginner/intermediate/experienced/professional), preferredStyles[], preferredShootTypes (tfp/paid/both); sizingType + 12 measurement strings; 5 comp-card photo slots; shareToken; currentLocation, frequentlyVisitedLocations[], travelPlans[{location,start,end}]; showEmail/showPhone/showCompCardStats; isDiscoverable, teamType, ageRange[], shootTypes[] |
| comp_cards | a published presentation card (many per user) | title, status draft/published, visibility public/request_only_public/private, 5 images |
| user_rates | rate card / package on profile | title, description, price text + amount, min, currency, category, duration, visibility, sort |
| testimonials | self-curated endorsements | author name/title/company/image, content, rating 1-5, projectDate |
| photo_sets / photo_set_images | portfolio albums | category, shootDate, displayStyle square/original, isPublic, isDefault, isAlwaysPrivate; image caption, order |
| moodboards | inspiration board / public "bridge" | up to 12 images, location, tags[], shootType, externalUrl, isActive, isPublic, visibility, viewCount |
| briefs | the shoot record | briefType (full/collab/paid/casting/content/fashion_casting/fashion_production); creator contact block; title/date/time/finish/location(name,address); concept; moodboard; boundaries JSON; nudityLevel; privateChangeArea; photoReviewAfterShoot; deliverables JSON; qualityDeliverables JSON; delivery date/type/relative; usage JSON; selectedDocuments JSON; payment block (payer, type, currency, rateType, rate, method, due, deposit, down payment, tfvDescription); status; isActive/isPublic/visibility; shootType, teamType, ageRange[], cities[]; archivedAt |
| brief_participants | a named person on the shoot | role, fullName (creator's entry), legalName + company (participant's), email, ageCategory, notes, guardian block |
| participant_compensation | what one participant gets | paymentType tfv/paid/collab, currency, rateType, rate (text), paymentMethod (+other), dueDateType/dueDate/relative, deposit type/percentage/down payment, tfvDescription |
| brief_roles | open "looking for" slots | role, count, genderPreference, ageFrom/To, notes, listOnExplore, exploreCity |
| brief_invitations | one invitation to one participant | token/tokenHash, status, responseType, expiresAt, organizerStatus/ApprovedAt/NotifiedAt, sentAt/viewedAt/respondedAt, confirmationSentAt |
| brief_responses | invitee's answer (one per invitation) | per-section notes, stepNotes JSON, legalName, company, boundariesApproved + reason, additionalSafetyRequirements JSON, consentSnapshot JSON, briefVersionId |
| brief_share_links | public link to a brief | token, status active/revoked, lastAccessedAt, expiresAt |
| brief_applications | stranger's application to a role | applicant contact/bio, roleId or customRole, availability, portfolioLinks[], stepAcknowledgments, stepNotes, boundariesAgreed, boundaryExceptions, status new/reviewed/accepted/declined, creatorNotes |
| brief_documents | two-party signed document on a brief | documentType, formData JSON, creatorSignature JSON, recipientSignature JSON, status draft/creator_signed/fully_signed |
| contact_requests | request for gated access | targetUser, requesterUser, requestType comp_card/contact_info/portfolio/moodboard, resourceId, purpose, message, requester snapshot, status, responseMessage, expiresAt |
| availability_slots | published availability | start/end, timezone, title, notes, visibility public/contacts/private, isRecurring, recurrenceRule |
| user_settings | prefs | 4 email booleans, accessDurationDays |
| notifications | in-app notification (never written) | type (brief_invitation, brief_response, brief_approved, contact_request, contact_approved, application_received, application_status, system), title, message, entityType/Id, actor, isRead/readAt |
| reports | user/content reports | see §1.12 |
| user_blocks | block a user | reason categories, description |
| moderation_logs / moderation_actions | audit trails (two overlapping tables) | actions listed §1.12 |
| admin_reserved_usernames / username_rules | naming policy | type reserved/unreserved; pattern, patternType exact/contains/regex, ruleType block/allow, severity, category hate/racial/sexual/religious/other |

Cross-cutting vocabulary in code/docs: TFP (Trade for Portfolio/Print), TFV (Trade for Value), Collab ("Equal Exchange"), GWC ("guys with cameras", the threat, internal only), comp card, consent snapshot, organizer, participant, invitee, applicant, "Looking For", request-only, "Knock" (Cory's later term for the request system).

---

## 8. NOTIFICATION / EMAIL EVENTS

Sender: Resend via Replit connector (`server/lib/resend.ts`); templates React Email in `server/emails/` (6 files, 1,594 lines); branded "BEFORE THE SHOOT" + BETA badge.

| Event / trigger | Recipient | Template / subject | Notes |
|---|---|---|---|
| Creator sends tokenized invitations (`POST /briefs/:id/send-invites`) | each participant | `BriefInvitation` - "{creator} invited you to review a shoot brief" (link `/review/:token`) | no client trigger found |
| Creator shares brief to existing user (`invite-user`) | that user | `BriefShareNotification` - "{creator} shared a shoot brief with you" (login -> `/inbox`) | invitation stays even if email fails |
| Invitee submits response (`POST /invitations/:token/response`) | invitee | `ResponseSubmittedConfirmation` - "Response Submitted: {title} - Awaiting Confirmation" (accepted) or plain (declined); sets `confirmationSentAt` | |
| same | creator | `ResponseReceivedNotification` (summary of response) | |
| Organizer approves a participant | participant | `OrganizerApproval` - "You're confirmed for {title}!" | sets `organizerNotifiedAt` |
| Everyone confirmed; organizer sends final PDF | each participant | inline HTML (not a template): "Final Shoot Brief: {title}" + personalised PDF attachment | |
| Stranger applies via share link / public apply | applicant | `ResponseSubmittedConfirmation` - "Application Submitted: {title}" | |
| same | creator | `ResponseReceivedNotification` - "New Application: {name} applied for..." | |
| Creator accepts application | applicant | `OrganizerApproval` - "You're Confirmed: {title}" | no participant record created |
| Creator declines application | applicant | `ResponseSubmittedConfirmation` (decline) - "Application Update: {title}" | |
| (none) | - | `BriefConfirmation` | template exists, imported, never sent |

Not emailed / not produced: access-request received/approved/declined; expiry warnings; reminders (`emailReminders` setting has no sender); brief edited; deadline approaching; delivery. In-app notification types listed in schema include contact_request, contact_approved, application_*, system - **none are ever created** (0 callers of `createNotification`), so `NotificationBell`/`/api/notifications` show an always-empty list; Inbox works because it queries invitations and contact requests directly. `user_settings.email*` flags are stored/read by the settings page only; sends don't check them.

---

## 9. SIZE

| Measure | Count |
|---|---|
| Page files in `client/src/pages/` | 40 top-level + 22 in `pages/tools/` = 62 page components (1 orphan: `Profile.tsx`) |
| Client routes in `App.tsx` | 64 `Route` entries (docs say 66) incl. 22 tool routes, 6 legal, `/:username` catch-all |
| HTTP endpoints | 158 (docs and my count agree) across 26 route modules + `replitAuth` + `index` |
| Drizzle tables | 28 (incl. `sessions`); 1,050-line `schema.ts`; no migrations |
| Email templates | 6 (1 unused) |
| TS/TSX lines excluding shadcn `components/ui` (client/src + server + shared + tests) | ~69,700; pages alone ~42,700; tests: 2 files |
| Server services | 6 files, ~1,126 lines (largest: `pdfGenerator.ts` 550) |

Top 10 largest files (lines):

| # | File | Lines |
|---|---|---|
| 1 | `client/src/pages/BriefBuilder.tsx` | 4,377 |
| 2 | `client/src/pages/Account.tsx` | 3,616 |
| 3 | `client/src/pages/Admin.tsx` | 2,187 |
| 4 | `client/src/pages/PublicProfile.tsx` | 1,609 |
| 5 | `client/src/pages/Explore.tsx` | 1,511 |
| 6 | `client/src/pages/tools/ConsentSafetyForms.tsx` | 1,170 |
| 7 | `client/src/pages/BriefReview.tsx` | 1,141 |
| 8 | `client/src/pages/FashionShowCasting.tsx` | 1,082 |
| 9 | `client/src/pages/BriefView.tsx` | 1,072 |
| 10 | `shared/schema.ts` | 1,050 |

(11th: `PaidShootBrief.tsx` 1,043; `server/routes/invitations.ts` 1,011 is the largest server file.) Effort concentration: the six builders + BriefView/BriefReview/BriefResponses/BriefDocumentSign together ~13,000 lines; the 22 tool forms ~12,500; profile/portfolio/comp card/account/explore ~9,800.

---

## 10. WHAT THE OLD APP NEVER HAD

Relative to CHARGE §6 (professional suite) and §7 (collaboration record).

**§7 collaboration record - gaps**
- **Expenses**: only a shared-costs textbox (Collab) and travel/meals toggles (Fashion). No who-pays-what, reimbursement, expense categories.
- **Material changes as a first-class event**: no amendment, no diff, no "this changed since you agreed", no re-review state, no change history. Editing a live brief silently changed the record while acceptances stood.
- **Approvals/declines/questions**: only accept-or-flag-as-decline; no "accept with conditions", no per-term counter, no question thread, no withdrawal after acceptance, no revoke.
- **Final agreed terms as a frozen, shared, human-readable artifact**: no immutable agreement version, no content hash, no verbatim clause freeze (SP-007), no single artifact both parties receive that embeds the accepted terms *and* who accepted when. The PDF had no acceptance/signature block.
- **Roles and participants as identities**: participants were email + name strings; no claim/join step tying an invitation to an authenticated identity; invitation acceptance by a bearer link.
- **Delivery timing as an event**: a planned window only; no delivered/received record except the standalone Delivery Confirmation form (which stored nothing).
- **Usage rights tied to documents**: usage flags did not reliably trigger the corresponding releases (only the minor-role case did); credit terms not a brief field; no per-participant usage terms.
- **Archiving without destroying the historical agreement**: archive existed, but ordinary delete destroyed responses, snapshots and guardian data (SP-001).

**§6 professional suite - not present or only nominal**
- **Scheduling/booking**: no calendar view, no requests-to-book, no conflict detection, no linking a brief's date to availability, no reminders, no call-time distribution (Call Sheet was a static PDF).
- **Messaging of any kind** (deliberate; Cory later chose structured per-term notes only).
- **Payments / invoicing workflow**: Invoice and Deal Memo were PDFs; no tracking of paid/unpaid; Stripe absent.
- **Reputation/reviews** tied to real collaborations (testimonials were self-typed).
- **Media kit / press kit** (surfaced from the real Surrey email), **Linktree-style share-forward**, analytics beyond `profileViews`/`viewCount`, on-set check-in/safety lifeline, onboarding/tutorial, currency by locale, expiring delivery links.
- **Agents / managers / guardians acting on behalf of talent**; team/studio entities (Agency tier promised "team members" and "shared library" with no model behind them).
- **Templates/presets by scenario** (Cory's stated need): six separate builders instead of one engine with presets; no memory of the user's defaults.
- **Dashboard as a place to live**: Account was a stack of managers; nothing summarised "what needs my attention this week" beyond Inbox; no upcoming-shoots view, no timeline, no weekly reason to return (the charge §25 question).
- **Verification/trust signals**: no identity or age verification, no verified-collaboration badge, no report-from-inside-a-shoot flow.
- **Real-work scenarios implied by the real example (Surrey Fashion Week)**: organizer -> photographer *event* brief with shot list, report time, media pass check-in, assets requested from the professional (logo, handle), in-kind credit terms, contact revealed on accept. The old fashion builder only covered talent casting, not this direction.

---

## Appendix - key file pointers

- Schema: `shared/schema.ts`; tiers `shared/tierLimits.ts`, `server/tierHelpers.ts`; roles `shared/roles.ts`
- Builders: `client/src/pages/{BriefBuilder,QuickCollabBrief,PaidShootBrief,CastingCallBrief,ContentCreationBrief,FashionShowCasting}.tsx`; shared block `client/src/components/ConsentSafetySection.tsx`; type routing `client/src/lib/briefRoutes.ts`; comp vocabulary `client/src/lib/constants.ts` (`BOOKING_PREFERENCES`)
- Agreement: `server/services/invitationResponseService.ts`, `server/routes/invitations.ts`, `routes/briefDocuments.ts`, `client/src/pages/{BriefReview,BriefResponses,BriefDocumentSign}.tsx`, `components/SignatureCapture.tsx`
- Discovery: `client/src/pages/Explore.tsx`, `server/routes/{explore,publicProfile,discovery,contactRequests}.ts`, `server/accessControl.ts`
- Emails: `server/emails/*.tsx`, `server/lib/resend.ts`
- Cory statements used: `docs/VISION.md` (Tensions 1-5, Q4, Launch Shape), `docs/FEATURE-REVIEW-2026-07-17.md` (governing UX principle, Top 3), `docs/PRODUCT-DOCTRINE.md` (Consent and evidence), `docs/SECURITY-PRIVACY-DEBT.md` (SP-001/002/005/006/007/013/027/028), `docs/reference/REAL-BRIEF-EXAMPLES.md`, `docs/LEXICON.md`
