# Mode C — Negative Engineering Evidence

**Scope:** Charge §28 Mode C only. Purpose: give the greenfield design *constraints*, not a bug list. The old app is not being ported.
**Source pin:** docs reference `9c1310be…` (source pin); repo HEAD read here is `bfbf5f1` (docs-only commits on top; shallow clone). Every debt-register line reference I re-checked still matched the source, so the source has not drifted from the pin.
**Evidence tags:** **[V]** = I re-verified in code this session. **[D]** = taken from the frozen recon / debt docs, not re-run by me. **[X]** = new observation from my spot-check, not (or only obliquely) in the existing register.
**Not re-run:** `npm ci`, `tsc`, `vitest`, `npm audit`, `npm start`. Counts for those (59 TS errors, 38 advisories, 8 pass / 12 skip, Node 22 start failure) are [D]. Two docs disagree on the TS error file count (10 in SYNTHESIS/DEBT, 11 in BLIND B-002); immaterial.

Doc abbreviations: SYN = `docs/recon/RECON-SYNTHESIS-2026-07.md`; BLIND = `docs/recon/BLIND-RECON-2026-07.md` (B-xxx); CTX = `docs/recon/CONTEXTUAL-RECON-2026-07.md` (C-xxx); DEBT = `docs/SECURITY-PRIVACY-DEBT.md` (SP-xxx); REPLIT = `docs/REPLIT-DEPENDENCY-MAP.md`; TEST = `docs/TESTING-AND-VALIDATION-STRATEGY.md`; COST = `docs/COST-REALITY-2026-07.md`.

---

## 0. The one-paragraph read

The old app did not fail because TypeScript/React/Postgres are wrong. It failed because **nothing in its structure made the safe thing the default and the unsafe thing hard**: authorization was an opt-in line in each of 158 handlers; the database schema made destruction (`ON DELETE CASCADE`) the default relationship; "consent" was a JSON blob keyed by a mutable timestamp; the UI, not the server, held the youth/nudity rule; the identity primary key was whatever Replit said it was; and the test suite re-implemented the routes it claimed to test, so it could never fail for the right reason. 57,785 lines of client code (about 77% of the code by volume) sat on top of 14,460 lines of server code [D: SYN baseline table], and the policy that mattered was split between them. Almost every defect below is an instance of **one of three structural absences**: (1) no single choke point for authorization/policy, (2) no distinction between mutable working state and immutable evidence, (3) no application-owned boundary around anything external. The design constraints in this file follow from those three.

---

## 1. FAILURE PATTERN CATALOGUE

### 1.1 Frontend-only safety enforcement

| # | Instance | Evidence |
|---|---|---|
| a | **Minor + nudity exclusion is a CSS class.** The nudity section is wrapped in `className={hasMinor ? 'opacity-50 pointer-events-none' : ''}`. The nudity value is unguarded component state and is persisted verbatim; the minor-aware handler only sets `minorRelease: true` and never clears nudity. Server accepts `nudityLevel: z.string().optional().nullable()` with no age check anywhere in `server/`. Value flows into the PDF and the consent snapshot. | **[V]** `client/src/pages/BriefBuilder.tsx:2902` (CSS gate), `:1665-1671` (handler sets only `minorRelease`), `server/routes/helpers.ts:36`; **[D]** DEBT SP-027 (Critical), including `:429/:1228/pdfGenerator.ts:353/invitationResponseService.ts:52` |
| b | **Moodboards have no audience field at all**; adult moodboards can surface to youth/guardian accounts. The only related control is role-level in the client (`BriefBuilder.tsx:2225`, roles under 18 excluded from Explore). | **[D]** SP-028; `shared/schema.ts:787-815` |
| c | **Tier enforcement is a stub that returns `allowed: true`**, while a 189-line `tierLimits.ts` config and a "tier matrix" exist. The route files each carry the same commented-out import (`// tierLimits kept for future subscription implementation`, `:38-39`). Safety-adjacent limits were therefore never server-enforced, and the free tier would have blocked creation if someone had "just turned it on". | **[V]** `server/tierHelpers.ts:1-20`; boilerplate at `server/routes/{blocking,shareLinks,settings,admin,availability,publicShare,compCards,objectStorage,applications}.ts:38-39`; **[D]** SP-025 |
| d | **Suspension is written and displayed but never read by auth.** `isSuspended` appears only in `storage/admin.ts:52,66`, `routes/adminModeration.ts:69`, and `Admin.tsx` display. `isAuthenticated` never loads the user row. | **[V]** grep of `isSuspended`; `server/replitAuth.ts:178-212`; **[D]** SP-006 |

**Structural reason.** The form is the only place the product's rules were *encoded as experience*: the builder is a 4,377-line component that knows what a minor is, what nudity levels exist and which documents follow. The API was a generic CRUD surface generated from the DB schema (see 1.2/1.8), so it had no domain vocabulary in which to *refuse* anything. Rules that live in the only layer with domain knowledge end up enforced only there.

**Constraint for the greenfield build.** Every safety rule must exist first as a server-side domain function that can reject a command (with a test that tries to violate it through the HTTP API), and the UI may only *reflect* that function's result; a rule with no server-side rejecting test does not count as implemented.

### 1.2 Inconsistent authorization

| # | Instance | Evidence |
|---|---|---|
| a | **Availability update/delete: authenticated but not owner-scoped.** `PATCH`/`DELETE /api/availability/:id` call storage with only the id; storage updates/deletes `WHERE id = $1`. PATCH also passes raw `req.body` into `.set({...updates})`, so any column (including `userId`) is writable. | **[V]** `server/routes/availability.ts:133-159`; `server/storage/availability.ts:24-35`; SP-003 |
| b | **Parent-authorised, child-mutated (3 routes).** Ownership of `setId`/`briefId` is checked, then an arbitrary `imageId`/`linkId`/`applicationId` is mutated by id alone. | **[D]** SP-004: `routes/photoSets.ts:355-370`, `shareLinks.ts:89-102`, `applications.ts:80-103`; storage `photoSets.ts:113-115`, `briefs.ts:309-315,341-350` |
| c | **Brief documents: public read, wrong identity property, unauthenticated counter-sign.** `GET /api/briefs/:briefId/documents` has no middleware at all; creator routes compare `brief.userId !== req.user.id` while the session shape is `req.user.claims.sub` (so creators are locked out and nobody notices because nothing tests it); `recipient-sign` has no auth, no token, no recipient binding. | **[V]** `server/routes/briefDocuments.ts:48-55, 57-61, 84-88, 109-125`; **[V]** `req.user.id` appears exactly twice in `server/` (both here) vs 110 uses of `claims.sub`; SP-002 |
| d | **Mass-assignment on brief PATCH.** `insertBriefSchema` omits only `id/createdAt/updatedAt/archivedAt`; the owner's PATCH does `insertBriefSchema.partial().parse(req.body)` and writes it. So the request may set `userId` (transfer/orphan), `status`, `isPublic`, and every agreed term after participants have responded. | **[V] [X]** `shared/schema.ts:321-326`; `server/routes/briefs.ts:588-603`. Not itemised in DEBT. |
| e | **Access-request wildcard scope** is requester-controlled/unclear to approver; some aggregate status ignores resource id. | **[D]** SP-010 |
| f | **Suspension unenforced** (see 1.1d). | **[V]** |

**Scale of the surface (mechanism, not a claim of N bugs).** 158 handlers registered with `app.get/post/…(…)` [V: grep = 158]. A crude grep finds 21 registrations with no `isAuthenticated`/`optionalAuth`/`isAdmin` token on the registration line [V, heuristic, not audited; some are intentionally public]. 141 handlers type the request as `req: any` [V: `grep -rn 'req: any' server`], which is exactly why the `req.user.id` vs `req.user.claims.sub` mismatch compiled. Ownership checks are hand-written ad hoc (`brief.userId !== userId`, 42 occurrences [V]).

**Structural reason.** Authorization was **opt-in, per handler, on the registration line, with a hand-rolled ownership `if` inside**, against an `any`-typed request, over a "storage façade" whose mutations take a bare `id`. Every one of those is a place where a tired author (or agent) can forget and get no error. The BLIND recon's phrasing is exact: "the checked owner and mutated resource are not the same authorization object" (B-005).

**Constraint.** Authorization must be a single typed choke point that the developer cannot bypass by omission: routes are deny-by-default unless they declare a policy; repository mutations require the actor/scope as a parameter (no `update(id)`); a generated route-inventory test fails CI if any route lacks a declared policy or a negative (wrong-user, unauthenticated, suspended) test.

### 1.3 Mutable consent history

| # | Instance | Evidence |
|---|---|---|
| a | **The "consent snapshot" is 10 selected fields**, not the clause text the person read; "version" is `brief.updatedAt` (a column that changes on every edit), stored as `briefVersionId`. So there is no version, only a timestamp of the last edit at signing time. | **[V]** `server/services/invitationResponseService.ts:45-80`; `shared/schema.ts:424-425` (`consentSnapshot jsonb`, `briefVersionId varchar`); **[D]** SP-007 (doctrine now lists 8 evidence requirements; build gap is verbatim clause text + per-clause signature binding) |
| b | **The organiser can edit agreed terms in place.** Brief PATCH accepts any field after responses exist; no "material change" check, no re-review state, no new version (see 1.2d). | **[V] [X]** `routes/briefs.ts:588-603` |
| c | **Signatures are unbound blobs.** `creatorSignature`/`recipientSignature` are `jsonb` on a document row with a `status` string. No signer identity, no document hash/version, no timestamp evidence, no audit. | **[V]** `shared/schema.ts:1034-1035`; **[D]** SP-002, SYN S-003 |
| d | **The response row itself is the only evidence and is deletable** (see 1.4). Evidence and working state live in the same rows, with the same lifecycle. | **[V]** `shared/schema.ts:399-425`; `storage/briefs.ts:69-94` |

**Structural reason.** There was only one representation of a brief: the mutable row. "Consent" was bolted on as a JSON copy of *some* columns of it at one moment. No concept of "published version" or "frozen artefact" existed in the model, so no code path could be *required* to create one.

**Constraint.** Model agreement as immutable, hash-addressed versions written by a single "present-for-review" command; acceptance records reference a version id, never the mutable working row; edits after presentation create a new version and a new review state, and the table has no UPDATE/DELETE path for evidence rows (enforced by DB permissions/triggers, tested).

### 1.4 Destructive cascade behaviour

| # | Instance | Evidence |
|---|---|---|
| a | **Ordinary owner delete destroys consent evidence.** UI "Delete" (single and bulk `Promise.all` of DELETEs) → `DELETE /api/briefs/:id` → transaction deleting responses (with `consentSnapshot`), invitations, participants (with guardian fields), brief. UI copy says "permanently deleted". A soft-archive path already existed. | **[V]** `client/src/pages/MyBriefs.tsx:128-164`; `server/routes/briefs.ts:610-625`; `server/storage/briefs.ts:69-94`; SP-001 (Critical) |
| b | **Editing the participant list destroys them too.** `replaceParticipants` = `DELETE FROM brief_participants WHERE brief_id=…` then re-insert; because `brief_invitations.participant_id` and `brief_responses.invitation_id` are both `ON DELETE CASCADE`, saving the participant list wipes invitations and responses. | **[V] [X]** `server/storage/briefs.ts:107-118`; `server/routes/invitations.ts:100-118`; `shared/schema.ts:368,401`. (CTX doc table mentions "participant replacement cascade"; not a numbered debt item.) |
| c | **Account deletion cascades into other people's evidence.** 17 FKs reference `users.id` with `cascade` (2 `set null`); 7 reference `briefs.id` with `cascade`. Deleting a user deletes their briefs, and through briefs the *other* party's responses. `briefs.userId` itself is `ON DELETE CASCADE`. | **[V]** `shared/schema.ts:237` etc.; count via grep over `onDelete`; SP-014 |
| d | **Startup job deletes by heuristic.** `startPeriodicCleanup()` runs on `listen`; treats `user_profiles` as the universe of valid users and deletes photo sets/rates/testimonials for user ids not in it; deletes profiles older than 24h whose `user_id LIKE 'test_%' / 'profile_%' / 'verify-%' / 'user_a_%' …` despite `users.isTestUser` existing. In-process `setInterval`; no dry-run, no audit. | **[V]** `server/index.ts:191-195`; `server/cleanup.ts:39-104`; `shared/schema.ts:30`; SP-005 |
| e | **Hard delete is the only verb in the storage vocabulary.** `deleteBrief`, `deleteAvailabilitySlot`, etc.; archive was a separate, optional field (`archivedAt`) that the UI did not use for "delete". | **[V]** as above |

**Structural reason.** Drizzle/`createInsertSchema` defaults plus "get the demo working" produced `onDelete: 'cascade'` everywhere (24 of 32 `onDelete` clauses). Cascade is the path of least resistance because it makes deletes "just work" and tests/seeds easy to clean up, and nothing distinguished *operational rows* (safe to cascade) from *evidence rows* (must never be removed by a parent's deletion). Test-data hygiene (the `test_%` cleanup) was mixed into the production process.

**Constraint.** Foreign keys to identity/collaboration parents are `RESTRICT` by default; evidence tables have no cascade and no delete path; "delete" of a user-facing thing is archive/tombstone by construction; retention/purge is a separately-authorised, audited, dry-run-first command; test data is marked by an explicit flag on the row and never cleaned by production code.

### 1.5 Provider-owned identity

| # | Instance | Evidence |
|---|---|---|
| a | **The Replit OIDC `sub` is written directly into `users.id`** (`storage.upsertUser({ id: claims["sub"], … })`) and every other table's owner FK points at it. 110 uses of `claims.sub` across `server/`. | **[V]** `server/replitAuth.ts:58-68`; grep; SP-008 |
| b | **The schema is annotated as provider property**: `// User storage table for Replit Auth (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.` | **[V]** `shared/schema.ts:19-20` |
| c | **Email is nullable and non-unique** (`// Not unique - OIDC sub (id) is the true unique identifier`), so email cannot serve as a safe link key during any future identity change. | **[V]** `shared/schema.ts:22-23`; SP-008 |
| d | **Session = raw provider claims + tokens.** `user.claims`, `access_token`, `refresh_token`, `expires_at` stored on the session; `isAuthenticated` only checks token expiry/refresh. There is no application `Actor`/`Account` object, hence no place to attach suspension, role, or guardian scope. | **[V]** `server/replitAuth.ts:49-56, 178-212` |
| e | **First-login bootstrap embeds product policy inside the auth callback:** creates a profile with `isDiscoverable: true` ("All profiles are public by default") and default portfolios. | **[V]** `server/replitAuth.ts:70-85`; SP-013 |

**Structural reason.** Replit Auth hands you a subject and a session for free; using `sub` as the PK is the zero-effort integration and the platform template said so ("mandatory"). The auth callback was then the natural place to "also create the user's stuff".

**Constraint.** The product mints its own opaque, immutable account id; external logins are rows in an identity-link table (provider, subject, verified-email flag), linking is an explicit auditable act, sessions carry only the internal account id, and auth callbacks do nothing except resolve/link an account.

### 1.6 Provider coupling (Replit, Neon, GCS, Google Maps, email)

| # | Instance | Evidence |
|---|---|---|
| a | **Lockfile pins a Replit-internal tarball** (`package-firewall.replit.local`) for DOMPurify → clean `npm ci` fails off-Replit. | **[D]** `package-lock.json:6443`; B-009, SP-015 |
| b | **Object storage = GCS client authenticated by a Replit sidecar** at `127.0.0.1:1106` (`audience: "replit"`, token/credential URLs on the sidecar). Bucket layout from `PRIVATE_OBJECT_DIR` / `PUBLIC_OBJECT_SEARCH_PATHS`. Throws at use if unset. | **[V]** `server/objectStorage.ts:13-32, 49-60` |
| c | **Email = Resend credentials fetched at send time from a Replit connector** using `REPL_IDENTITY`/`WEB_REPL_RENEWAL` tokens; the file comment says never cache the client. | **[V]** `server/lib/resend.ts:1-40` |
| d | **DB driver is `@neondatabase/serverless` over WebSocket** (`neonConfig.webSocketConstructor = ws`), module-level `throw` if `DATABASE_URL` missing. Docs say "Neon" but source proves only "Postgres"; notes report Replit-private host `helium`. Ownership/backup state UNKNOWN. | **[V]** `server/db.ts:1-13`; **[D]** SYN "disproven" list, SP-023 |
| e | **Auth module requires `REPL_ID`/`REPLIT_DOMAINS` at setup**, `.replit` holds deployment, ports, workflows, Node version, and even a **Google Maps browser key in tracked config** (SP-021). Three `@replit/vite-plugin-*` devDeps. | **[D]** REPLIT rows 17-38; SP-021; `package.json` devDeps [V] |
| f | **Process-model coupling:** `app.set('trust proxy', 1)`; "ALWAYS serve on PORT… Other ports are firewalled" comment; in-process timer for jobs (breaks on restart/multi-instance). | **[V]** `server/index.ts:11,181-190`; REPLIT row "Scheduled/background work" |
| g | **Config is read ad hoc from `process.env` inside modules** (auth, storage, email, db), so missing config surfaces at import or first call, not at boot. | **[V]** as above; REPLIT "Environment/secrets" |
| h | **Hidden dashboard state is part of the system** (enabled login providers, DB ownership, buckets, domains, secrets, logs) and is not in git; the docs themselves list this as UNKNOWN. | **[D]** REPLIT checklist; SP-023 |

**Structural reason.** Replit is an *environment bundle* (REPLIT "Verdict"): the fastest path to a working feature was always to call the platform primitive directly from the route/service that needed it. No `Mailer`, `BlobStore` or `IdentityProvider` interface ever existed, so there was nothing to fake in tests and nothing to swap.

**Constraint.** Each external capability (identity, email, blob storage, PDF, clock/tokens, config, logging) is a small application-owned interface with an in-memory/local fake that the *tests use by default*; all config is parsed once at boot into a typed object (fail fast); no vendor SDK is imported outside its adapter directory (enforce with a lint/import rule); the repo must install, test and run on a blank machine with no account anywhere.

### 1.7 Nonrepresentative tests

| # | Instance | Evidence |
|---|---|---|
| a | **Tests build their own Express handlers** and assert on those; production route registration is never imported. `tests/integration/brief.test.ts` defines `createMockApp(userId)` with its own `mockIsAuthenticated` that injects `req.user = { claims: { sub: userId } }` and re-implements POST/GET brief handlers. | **[V]** `tests/integration/brief.test.ts:24-60`; same pattern `objects.test.ts` (B-003) |
| b | **The mocked auth fixes the very property the production code got wrong.** The test's fake session uses `claims.sub`; production `briefDocuments.ts` uses `req.user.id`. A test of the real routes would have failed on day one. | **[V]** `brief.test.ts:31-37` vs `briefDocuments.ts:60,87` |
| c | **No `test` script**; 479 lines of tests total for 158 endpoints; 8 pass (copied ACL logic), 12 skip/fail at setup (no `DATABASE_URL`). No CI at all. | **[V]** `package.json:5-11` (no `test`); `wc -l tests/integration/*` = 479; **[D]** SP-019, SP-020, SYN baseline |
| d | **Build ≠ typecheck.** `build` = `vite build && esbuild …` with no `tsc`; `check` (`tsc`) is separate and fails with 59 errors, so drift between schema, storage, PDF and pages was invisible to the only gate that ran. | **[V]** `package.json:6-10`; **[D]** SP-017 |
| e | **Production artefact can't start on Node 22** (external JSON import without import attribute) and nothing runs `npm start` after build. | **[D]** SP-018 / B-001 |

**Structural reason.** The app was not constructed through a factory that takes its dependencies (auth, db, storage, clock), so the only way to test a route without Replit was to copy it. Copying is cheap and green; nothing measured the copy against the original.

**Constraint.** One `createApp(deps)` factory used by production and tests; auth, blob store, mailer and clock are injected; the default test run uses real routes + a disposable real Postgres; CI runs install → typecheck → test → migrate-from-empty → build → boot+health smoke, with a rule that critical suites can never be skipped.

### 1.8 Enormous page components (and a fat, shapeless server)

| # | Instance | Evidence |
|---|---|---|
| a | `BriefBuilder.tsx` **4,377** lines; `Account.tsx` 3,616 (37 of the 59 TS errors); `Admin.tsx` 2,187; `PublicProfile.tsx` 1,609; `Explore.tsx` 1,511; `BriefReview.tsx` 1,141. 66 client routes; `client/src` = 57,278 lines. | **[V]** `wc -l client/src/pages/*.tsx`; **[D]** B-002, ARCHITECTURE-CURRENT |
| b | **One 2,537 kB main JS chunk (628 kB gzip)**; no route-level lazy loading. | **[D]** B-010 |
| c | **Business rules inside the component.** The builder decides minor-ness, nudity gating, which documents are required (`minorRelease: true`), and what gets persisted; 22 "tools" pages (13,641 lines) generate legal-style PDFs client-side with jsPDF and **make zero server calls** (0 of 22 contain `apiRequest`/`fetch`). A second PDF stack (pdfkit) lives on the server. Two renderers of the "same" documents can, and per `TEST` "PDF output fields and missing-field drift", do diverge. | **[V] [X]** `grep -l apiRequest\|fetch client/src/pages/tools/*.tsx` = 0; `wc -l` = 13,641; `client/src/lib/pdf/*.ts` 1,470 lines; `server/services/pdfGenerator.ts`; TEST §Characterization |
| d | **Server-side analogue:** `routes/invitations.ts` 1,011 lines, `routes/briefs.ts` 835; a broad `IStorage` façade; route files repeat a wall of imports and the same commented tier-import block. | **[V]** `wc -l server/routes/*.ts`; `storage.ts:95`; boilerplate `:38-39` |

**Structural reason.** A generated-UI, prompt-by-prompt build style (repo has 1,214 commits at base, `.agents/` memory files, `repomix-output.xml`, `codebase_for_gemini.txt`, screenshots checked in, per BLIND quarantine list) rewards adding to the file the agent already has open. A wizard-style builder with ~everything in one component state object also made partial/lenient drafts and strict publish all live in one place.

**Constraint.** Pages are thin compositions of feature modules with a hard file-size budget in CI (e.g. no page > ~300 lines); domain rules and document rendering live in one server-side, tested module and the client renders *server-produced* artefacts; route-level code-splitting and a bundle-size budget are CI gates from day one.

### 1.9 Broad, unstructured route surface

| # | Instance | Evidence |
|---|---|---|
| a | **158 endpoints** (78 GET / 47 POST / 14 DELETE / 11 PATCH / 8 PUT) in ~26 route files, 28 tables, **66 client routes**, for a product whose core loop is ~one collaboration. | **[D]** SYN baseline; **[V]** endpoint grep = 158, `ls server/routes` |
| b | **Mixed public/private/token-bearer/admin semantics** in the same files with different guard styles: `isAuthenticated`, `optionalAuth`, `isAdmin` (helper), invitation tokens in path or body, profile `share_token`, access-request grants, brief `share links`. Each is a hand-rolled mini-scheme. | **[V]** `server/routes/*.ts`; `server/accessControl.ts`; **[D]** SP-010, SP-011, SP-012 |
| c | **Errors leak internals:** 90 handlers return `error.message` to the client from `catch (error: any)` (92 catch blocks). | **[V]** `grep -rn 'error.message' server/routes` = 90 |
| d | **Response shapes are DB rows.** Invitation response returns broad participant rows possibly incl. guardian/contact data; public brief reads "return a selected payload" only where someone remembered. | **[D]** SP-009; **[V]** absence of a response-DTO layer |
| e | **Schema-derived request validators** (`createInsertSchema(...).omit({...})`) used directly as API input (1.2d) collapse DB shape = API shape = form shape. | **[V]** `shared/schema.ts:321-326` |
| f | **Legacy plaintext token column still present next to token hashes** (`token … unique // legacy - plain text` + `tokenHash`). | **[V]** `shared/schema.ts:370-371`; SP-012 |
| g | **Profile share token: broad, no first-class expiry.** | **[D]** SP-011 |

**Structural reason.** Endpoints were added per screen/feature (page-first), each with its own guard and shape, rather than per domain command. With no route inventory or generated matrix (SYN: "manual endpoint-by-endpoint confidence unrealistic"), the surface outgrew what anyone could hold in their head.

**Constraint.** The API is a small set of *domain commands and queries* (verbs from the ubiquitous language), each declared with actor scope, input schema, output DTO and error mapping in one registry from which the route table, docs and authorization test matrix are generated; DB rows are never returned directly; access to a thing by non-account bearer (invitation, share link) is one mechanism with one expiry/revocation model.

### 1.10 Simulated behaviour presented as real

| # | Instance | Evidence |
|---|---|---|
| a | **Pricing page claims card + Apple Pay + Google Pay and a 14-day free trial "no credit card required"**; no payment processor package, routes or webhooks exist. | **[V]** `client/src/pages/Pricing.tsx:349,362`; **[D]** SP-024 (the trial claim is not in the register) |
| b | **Tiers:** a full tier matrix and `subscriptionTier` column (`free/basic/pro/agency`) exist; enforcement functions return `allowed: true`. | **[V]** `server/tierHelpers.ts:1-20`; `shared/schema.ts:27`; SP-025 |
| c | **"Signatures"**: typed/drawn signature JSON, two-party `status` machine, presented in UI/PDF as a document signing flow; no identity binding, no hash, unsafe endpoints (see 1.2c, 1.3c). SYN: must not be described as legally binding. | **[V]**/**[D]** SP-002, SP-026, SYN S-003 |
| d | **Suspension "exists"** in admin UI/moderation views but is not enforced (1.1d). | **[V]** |
| e | **Privacy prose vs defaults:** doctrine says private-by-default; code makes profiles `isDiscoverable: true` on first login and briefs `isPublic` on publish. | **[V]** `replitAuth.ts:76-82`; **[D]** SP-013, SYN doctrine/implementation table |
| f | **Notifications/email** are best-effort side effects with a runtime-fetched credential; failure modes not designed (COST: silent drop on Resend free tier 100/day cap). | **[V]** `server/lib/resend.ts`; **[D]** COST §fixed-cost footnote |
| g | **Legal/moderation/youth claims exceed validated behaviour** (blueprint says minors, moderation, legal integrity; code doesn't back it). | **[D]** SP-026 |

**Structural reason.** The product was demo-driven: build the screen so it looks complete, defer the mechanism, and never mark the gap. There was no "capability status" concept (real / simulated / absent) that copy, UI and API had to respect. Documentation asserted doctrine as if implemented (SYN S-011).

**Constraint.** Every user-visible capability claim is bound to a capability flag with three states (real, simulated-labelled, absent); simulated states render an explicit label in the UI and are impossible to enable in production config; marketing/copy claims about safety, signing or payment are reviewed against the flag, and none of the three is shipped until its acceptance test passes.

---

## 2. DEBT REGISTER DIGEST

Source: `docs/SECURITY-PRIVACY-DEBT.md` (28 items; SP-001…SP-028; numbering is non-sequential in the file because 027/028 were inserted into "Immediate blockers"). Severity column reproduces the register's severity, not mine. **Kind:** **BUG** = fixable defect; **DESIGN** = a design lesson that needs a structural answer (fixing the instance doesn't help); **OPS** = process/infra gap; **PROD** = product-truthfulness/doctrine issue (Cory-owned).

| ID | One-line | Severity | Domain | Kind |
|---|---|---|---|---|
| SP-001 | Owner (single/bulk) brief delete destroys responses, consent snapshots, participants, guardian fields | Critical | Consent/retention | **DESIGN** (cascade + hard-delete default) |
| SP-002 | Brief-document reads unauthenticated; wrong identity property; unbound recipient signing | Critical | Authz / signing | **DESIGN** (identity object + signing model), also BUG |
| SP-003 | Availability update/delete not owner-scoped; broad field write | High | Authz | BUG, symptom of **DESIGN** (unscoped storage API) |
| SP-004 | Parent-authorised/child-mutated (3 routes) | High | Authz | BUG, symptom of **DESIGN** |
| SP-005 | Startup cleanup deletes on missing-profile and id-prefix heuristics | High | Data lifecycle | **DESIGN** (test data in prod paths; in-process jobs) |
| SP-006 | Suspension written/displayed, not enforced | High | Moderation/auth | **DESIGN** (no Actor object) |
| SP-007 | Consent snapshot = selected fields; `updatedAt` as "version" | High | Consent evidence | **DESIGN** (no versioned agreement) |
| SP-008 | Replit OIDC `sub` is user PK; email not a safe link key | High | Identity | **DESIGN** |
| SP-009 | Invitation response returns broad participant rows (guardian/contact) | High | Privacy | **DESIGN** (no DTO layer); INFERRED impact |
| SP-010 | Access-request wildcard scope requester-controlled/unclear | High | Access control | **DESIGN** |
| SP-011 | Profile share token broad; no expiry policy | High | Access control | **DESIGN**/PROD |
| SP-012 | Plaintext invitation-token fallback alongside hashes | Medium | Token security | BUG (migration debt) |
| SP-013 | Public/discoverable defaults contradict privacy-first prose | High | Privacy | **PROD**/DESIGN (defaults live in code) |
| SP-014 | User deletion + cascade policy can destroy consent-bearing records | Critical | Retention | **DESIGN** |
| SP-015 | Clean install depends on Replit-only DOMPurify tarball | High | Supply chain | BUG/OPS |
| SP-016 | 38 advisories (3 critical, 14 high, 17 moderate, 4 low); reachability unknown | High | Supply chain | OPS (bigger stack = more surface) |
| SP-017 | Build omits typecheck; 59 TS errors | High | Build integrity | **OPS/DESIGN** (gate ordering) |
| SP-018 | Production start fails on Node 22 (JSON import); Node 20 unverified | High | Runtime | BUG/OPS (no boot smoke test) |
| SP-019 | Tests duplicate handlers; no real authz/release protection | High | Test | **DESIGN** (no app factory) |
| SP-020 | No reviewed migrations, CI, recovery proof, branch enforcement | High | Governance | OPS |
| SP-021 | Google Maps key tracked in `.replit`/repomix | Medium | Secrets | BUG/OPS |
| SP-022 | Console-only logging; cleanup not durably scheduled/observed | Medium | Ops | OPS |
| SP-023 | Replit dashboard state and data ownership unknown | High | Ownership | OPS/**DESIGN** (state outside git) |
| SP-024 | Pricing UI claims card/wallet acceptance; no billing | Medium | Truthfulness | **PROD** |
| SP-025 | Tier doctrine exists, enforcement disabled; blind re-enable would block creation | High | Truthfulness/monetization | **DESIGN**/PROD |
| SP-026 | Legal/signature, moderation, privacy, youth claims exceed behaviour | High | Truthfulness | **PROD**/DESIGN |
| SP-027 | Minor/nudity exclusion presentational only; persists + reaches PDF/consent snapshot | Critical | Youth/adult partition | **DESIGN** (rule lives only in UI) |
| SP-028 | Moodboards carry no audience classification; adult can surface to youth | High | Youth/adult partition | **DESIGN** (no audience on content) |

**Count by kind (my classification, primarily-design first):** DESIGN or DESIGN-symptomatic ≈ 20 of 28; pure BUG/OPS ≈ 8. That ratio is the finding: **a clean start removes the instances, but only structural constraints prevent recurrence**, because most instances are the same 3 absences (choke point, evidence-vs-working-state, adapter boundary) showing up in different tables.

**Items whose "required gate" is Cory-owned** (from DEBT): SP-001, 002, 007 (doctrine set 2026-07-17), 010, 011, 013, 014, 024, 025, 026, 027, 028. Mode C does not resolve them; they are listed so the greenfield design can leave a seam for them.

**Three items not in the register that I found in code (candidates to add):**
1. Brief PATCH accepts any `insertBriefSchema` field incl. `userId`/`status`/`isPublic`, and edits agreed terms in place: `routes/briefs.ts:588-603` + `schema.ts:321-326` [V].
2. `replaceParticipants` cascades through invitations and responses: `storage/briefs.ts:107-118` [V].
3. Pricing "14-day free trial, no credit card": `Pricing.tsx:362` [V].

---

## 3. ARCHITECTURE-TARGET.md ASSESSMENT

**File:** `docs/ARCHITECTURE-TARGET.md` (122 lines). **Status (its own header):** Lifecycle ACTIVE; Decision **PROVISIONAL**; Evidence **INFERRED**; Owner Dustin; Product approval **PENDING**; effective/reviewed 2026-07-16. Supersedes a previous, provider-specific target. Change log: on 2026-07-16 it *removed* Caddy, Docker Compose, MinIO, Authentik, single-host Linux from canonical direction.

**What it proposes**
- Keep TypeScript, React, Express-compatible server, PostgreSQL, Zod, one deployable; "not approval to preserve the existing implementation".
- "What is decided": small system; product rules out of UI-only logic; auth/state/retention/evidence rules behind explicit application boundaries; separate external from internal identity; reviewed migrations not `push`; infrastructure behind replaceable interfaces; synthetic local/test implementations before real migration; no microservices/K8s/multi-DB without measured need.
- "Not decided": hosting, self-host vs managed, proxy, IdP, DB provider, object store, email, topology, backup, observability, ops model.
- A layered sketch: UI → Application/API (domain/use-case services, authorization & policy boundaries, repositories, infrastructure adapters) → PostgreSQL + external capabilities via contracts.
- 8 provisional domains: Identity/accounts; Brief planning & versioning; Participation/invitations/consent/guardians; Documents & evidence; Profiles/portfolios/discovery/availability; Access control/blocking/reports/moderation; Media; Notifications.
- 8 required seams before selecting infra (identity/sessions, config, DB+migrations, media, email, canonical URLs, logging/health, deterministic synthetic data) and a 10-item hosting evaluation gate; a 6-step "migration stance".

**Also relevant: what SYN recommends (and TARGET deliberately retracted).** SYN's "Primary architecture verdict" prescribes Docker Compose on one Cory-controlled Linux host + Caddy + self-hosted Authentik + MinIO + Mailpit (`SYN` "Infrastructure", "Self-hosting recommendation"). TARGET's changelog strips those. COST separately says the storage target is settled as R2 (zero-egress). So the docs are **internally inconsistent about infra** (SYN: MinIO; COST: R2; TARGET: undecided). Treat the infra choice as open.

**Sound reasoning worth keeping as INPUT (not as decisions)**
1. **Monolith, one DB, no distributed anything**: matches Charge §15 exactly; evidence supports it (failures were boundary/policy failures, not scale/language ones: SYN S-012).
2. **Policy below the UI; authorization/state/retention/evidence behind explicit boundaries.** This is the direct inverse of 1.1/1.2 above.
3. **External identity separated from internal account identity** (SP-008); the identity-link table idea.
4. **Reviewed migrations, not `drizzle-kit push`** (SP-020; REPLIT "Schema management").
5. **Behavior-first provider seams before vendor selection**, and the list of seams (identity/sessions, config, DB, media, email, URL generation, logging/health, synthetic data) is a good starting checklist and lines up with Charge §21.
6. **"One application factory taking config/identity/repos/storage/email/clock/logger; production and tests use the same composition"** (TEST "Test harness architecture"): this is the single most valuable technical idea in the doc set. It is in TEST, not TARGET, but TARGET's "synthetic implementations first" points at it.
7. **The hosting evaluation gate** (traffic, storage, privacy/data location, uptime, backup/recovery, operating skill/time, monthly cost, managed-OK?, exit) is a decent template for the deferred vendor decision; adopt as a checklist, not a process.
8. **Idempotent, dry-run-first scheduled commands instead of in-process timers** (REPLIT row on jobs).

**Migration-thinking to DISCARD (be blunt)**
1. **The "current migration stance" section and the "decide whether the existing application is a source to refactor, selectively reuse, or replace" framing.** Charge §14/§27: no users, no data, nothing to migrate. Discard entirely, along with REPLIT's contingency reconciliation mechanics, identity-migration policy for "ambiguous accounts", object reconciliation manifests.
2. **The eight "provisional domains" are the OLD model's tables with nicer names.** "Brief planning and versioning", "Documents and evidence", "Participation, invitations, consent and guardians" preserve the brief-builder decomposition (and "Documents" as a separate module from "Evidence" is the very split that produced two unrelated signature/consent mechanisms). Charge §17 says derive boundaries from the domain (collaboration, agreement/version, evidence). Use TARGET's list as a *checklist of concerns*, not as module boundaries. Notably absent: any explicit **agreement/version/evidence spine** as the centre. Present but backwards: "Profiles, portfolios, comp cards, moodboards, discovery, availability" grouped as one module, which repeats the old Explore/people-browsing shape.
3. **"Stage 0 authorization" / "Review trigger: Stage 0"** and the July-31 prototype thinking. Process scaffolding for a different programme.
4. **Restraint on decisions is good, but it is vague about the load-bearing ones**: it names no position on immutability of evidence, on cascade/retention defaults, on deny-by-default authorization, or on typed request context. "Put authorization behind explicit boundaries" is exactly what the old blueprint also said ("thin route handlers", "centralized access checks") while the code did the opposite (BLIND intent comparison). Statements of intent without a *mechanism that fails the build* are what got the old project here.
5. **Everything phrased as governance** (PROVISIONAL/INFERRED/PENDING status axes, "decision owner", "product approval") is outside Mode C but is overhead the Charge (§31) explicitly doesn't want.
6. **"Architecture Current → Target" gap analysis as the organising principle.** Greenfield doesn't need a delta.

**Net assessment.** As an architecture, TARGET is ~20% content: five good principles and a seams list, everything else is deferral. It is safe to treat as *evidence that the previous team reached the same TS-monolith conclusion independently and rejected microservices*, not as a design to extend.

---

## 4. STACK & DEPENDENCY REALITY

**Runtime and declared versions** (from `package.json` unless noted)
- Node: `.replit` declares **20** [D]; `@types/node` 20.16.11; host used by recon was Node 22.22.2/npm 10.9.7 where `npm start` failed [D: B-001]. Node 20 start **unverified** (SP-018). Package name `rest-express` (Replit template), `"type": "module"`.
- TypeScript 5.6.3 (`tsc` as `check`; not part of `build`).
- Client: React 18.3, Vite 5.4, Wouter 3, TanStack Query 5, React Hook Form 7 + `@hookform/resolvers`, Tailwind **3.4** with `@tailwindcss/vite ^4.1.3` also present in devDeps (version mismatch on its face: not verified whether it bites), 27 `@radix-ui/*` packages (shadcn), framer-motion, recharts, react-icons + lucide, Uppy ×8, `@react-google-maps/api`.
- Server: Express 4.21, `express-session` + `connect-pg-simple` (sessions in Postgres), `passport` + `openid-client` 6 (Replit OIDC), `passport-local` and `memorystore` listed (no import in `server/` or `client/src` [V: grep]; dead deps), Helmet, `express-rate-limit`, `ws`, `sharp` (image processing / EXIF strip), **`pdfkit` (server) and `jspdf` + `html2canvas` (client)**: two PDF stacks, `resend` + `@react-email/*` ×6, `@google-cloud/storage`.
- Data: Drizzle ORM 0.39 + `drizzle-kit` 0.31 + `drizzle-zod` 0.7; Zod 3.24; **`@neondatabase/serverless`** driver (WebSocket) even though DB host is Replit-private per notes; **no migrations directory**; schema via `drizzle-kit push`. 28 tables, `shared/schema.ts` 1,050 lines.
- Test: Vitest 4 + Supertest, **both in `dependencies` (production)** with `@types/supertest`.
- `crypto-js` and `html2canvas` are in dependencies but grep finds no import in `server/` or `client/src` [V]; dead weight.

**What fails at baseline (per docs; not re-run)**
| Check | Result | Ref |
|---|---|---|
| `npm ci` off Replit | fails (Replit tarball host) | SP-015, B-009 |
| `npm run check` | 59 TS errors / 10-11 files (37 in `Account.tsx`) | SP-017, B-002 |
| `npm run build` | passes (2,537 kB main chunk) after asset materialised | B-010 |
| `npm start` (Node 22) | fails: `ERR_IMPORT_ATTRIBUTE_MISSING` for `@dsojevic/profanity-list/en.json` (`shared/profanityFilter.ts:6` [V]) | SP-018, B-001 |
| `npm run dev` | stops at missing `DATABASE_URL` (`server/db.ts:9-13` [V]) | ARCH-CURRENT |
| `npm test` | "Missing script" | B-003 |
| `npx vitest run` | 8 pass (duplicated handlers), 12 skip/fail | SP-019 |
| `npm audit` | 38 (3 crit / 14 high / 17 mod / 4 low) full graph; 33 prod-only | SP-016 |
| Total install | 773 packages | BLIND command record |

**Replit-specific pieces and depth** (full table: REPLIT; here ordered by *depth*)
1. **Identity** (deepest): OIDC `sub` = `users.id` = FK target of 17 cascade FKs; used by ≥21 route modules [D: C-003]. Replacing it is a schema redesign, not an adapter swap.
2. **Object storage:** credentials/signing through sidecar on `127.0.0.1:1106`; ACL and path meaning stored via env dirs and object metadata (`server/objectStorage.ts`, `objectAcl.ts`).
3. **Database:** platform-provisioned Postgres; ownership/backups UNKNOWN; Neon driver.
4. **Email:** credentials fetched from Replit connector at send time.
5. **Package resolution:** one lockfile entry.
6. **Deploy/config:** `.replit` (Node, autoscale, port 5000, workflows, env incl. Maps key), three Vite plugins.
7. **Process docs:** `replit.md`, blueprint, prompt archives: agents were told Replit was the world.

**Does the stack argue for or against the Charge §16 hypothesis (TS / React / Vite / Node / Postgres / Drizzle / Zod / one deployable)?**
- **For (evidence-backed):** No failure in DEBT is attributable to language, framework, or database choice. SYN S-012 reaches the same conclusion independently; ARCH-CURRENT "Verified strengths" lists the conventional stack, shared Zod/Drizzle types, one deployable, one DB. Shared types *did* catch things (the 59 TS errors are the type system working; the problem was that no gate listened).
- **Against / cautions for the greenfield:**
  1. **`createInsertSchema` as API validator is a trap** (1.2d/1.9e). If Drizzle + drizzle-zod is kept, generated schemas may define storage types only; API input/output schemas must be hand-written per command.
  2. **Drizzle `push` vs migrations:** if kept, only reviewed SQL migrations; verify the chosen migration workflow supports what we need for append-only constraints/triggers (raw SQL migrations).
  3. **Serverless Neon WebSocket driver** buys nothing on a conventional Postgres and couples to Neon-style connections; use a standard `pg`/`postgres` driver against any Postgres.
  4. **Express 4 + `req: any`:** the failure was untyped request context, not Express. Whatever HTTP layer is chosen must give a typed `ctx.actor`; Express can do this with a wrapper, but a framework that makes typed handlers the norm (Hono/Fastify/tRPC-style) is worth a look. Do not change merely for novelty (Charge §16): the decisive requirement is *no `any` request*, not the framework.
  5. **Zod 3 → current major, Vite 5 → current, Tailwind 3/4 mismatch, Node 20 (EOL in 2026)**: pick current LTS/majors up front and pin; the old versions are simply the Replit template's snapshot.
  6. **Dependency weight:** 97 runtime + 23 dev deps incl. 27 Radix packages, 8 Uppy packages, 6 react-email packages, two PDF stacks, dead auth packages, test tools in prod. Every extra package is advisory surface (38 advisories). Start with a short list and a one-in-one-out rule.
  7. **The build must include typecheck and boot smoke**; both were absent by default.
- **Bottom line on §16:** hypothesis stands. The needed changes are in *how* the stack is assembled (factory, typed context, migrations, adapters), not *which* stack.

---

## 5. COST / OPS EVIDENCE

`docs/COST-REALITY-2026-07.md` (367 lines; Evidence status VERIFIED as of 2026-07-17; "re-verify every number at pricing time"). **Important caveat:** the doc embeds many *Cory product rulings* (tier names/prices, documents-only free tier, comp cards paid, delivery "river" with expiry) that are product decisions outside Mode C and that Charge §10/§27 says not to design in. Below I extract only the operational/engineering constraints.

**Constraints a tiny team must respect (engineering-relevant)**
1. **Founder attention is the scarce resource, not cloud spend** (COST caveat 3; "Human moderation time — the real scarce resource: two founders"). Past ~1,000 users the dominant line stops being servers and becomes humans (support, moderation, incident response). Implication: design for **low-touch operation** (no free-text review/reputation surfaces per COST, strike-based moderation, automated expiry) and minimum on-call burden.
2. **Fixed baseline is small.** Lean stack ~$240/yr (VPS ~$120, domains ~$50, backups ~$24, business ~$45); managed stack ~$1,060/yr (PaaS $240, managed Postgres $228, email $240, auth $180, …). "The managed stack can be swapped down to lean at any time; the difference is founder ops time, not capability." Direction: pick *replaceable* managed services first only if ops time is the constraint.
3. **Email is core-loop infrastructure.** Resend free tier: 3,000/month but **hard 100/day cap; excess silently dropped or queued.** The core loop is emailed invitations and signature links, so "silently dropped invitation email is a core-loop failure". Constraint: pay for email from day one live; design delivery status visibility and retry into the mailer adapter; never fire-and-forget invitations. (The old `resend.ts` had no such handling.)
4. **Object storage cost is driven by egress and originals, not storage GB.** R2-class zero-egress (S3 egress ~$0.09/GB), store web-res only where possible (30-60× difference), `sharp` server-side. A free user with ~15 compressed photos ≈ $0.0002/month. Constraint on design: **media is behind an interface; size class (original vs web) is a first-class attribute**; no dependency on provider-specific ACL/signing semantics (the old code encoded ACLs in Replit/GCS object metadata).
5. **Do not host bulk deliverables as permanent storage** (COST "Rule 4"): 300 GB/month accumulation at flat price is cash-negative by month four; Google One is ≈ $5/TB vs R2 $15/TB. If any delivery hosting is ever built, it is transit-with-mandatory-expiry (14/30/~90 day windows in COST), finished images only (JPEG/PNG/PDF/HEIC/WebP; block RAW/TIFF/PSD/video). This is Cory's product ruling; the engineering point is: **unbounded user storage is a business-model bug**, so retention/expiry must be a property of every blob class.
6. **Verification vendor selection criterion:** pay-as-you-go, **no monthly minimum** (some carry $99+/mo); facial age estimation ≈ $0.10/check, ID docs $1-3. Verify at first act of participation, not signup. (Youth/verification are deferred by Charge §13; note only that a verification adapter must be swappable and cost-per-call capped.)
7. **Payments:** Stripe fixed fee $0.30 hurts small plans; annual default blunts; Stripe subscriptions are **currency-locked at creation**; CAD/USD pricing by `CF-IPCountry` header. Charge says no payments now; only note: if entitlements ever exist, treat as an abstraction with a fake billing provider from day one, and keep **safety features out of entitlement checks by construction** (Charge §10).
8. **AI/LLM runtime cost = $0 by design** ("keep it that way on free tier"): no LLM in runtime paths; AI spend belongs in build tooling.
9. **CSAM/image moderation** will add a per-upload cost; Cloudflare offers a free CSAM scanning tool (open item, COST caveat 4). Relevant only when public media exists; flag as a media-adapter hook, not a build item.
10. **Error monitoring/logging:** Sentry-class ~$312/yr when real; old app had console-only logs (SP-022). Constraint: structured logs with request ids from the first commit; health/readiness endpoint; alerts for failed jobs and backups.
11. **Genuinely $0 items COST relies on:** Cloudflare DNS/CDN free tier, GitHub private repos, uptime monitoring, Stripe per-transaction, Google Maps **off** (autocomplete degrades to plain text; key must be restricted first: SP-021).
12. **Currency/market scale statements (100 / 1,000 / 10,000 paying users) are Cory-approved sizing intent, but the honest COST headline is "the interesting rows are 100 and 1,000"**: architecture should be right-sized for ≤ ~1k active users: one Postgres, one app process, no queues.

**Internal inconsistencies to be aware of (do not rely on COST numbers blindly):** projection tables computed at the pre-correction $720 baseline (COST itself says so); tier names appear as Standard/Gold Standard/Diamond in one place and "Platinum Standard" in another; Basic/Pro/Agency vs Standard/Gold/Diamond naming both appear; prices "$9/$19/$49" and "$15/$29/$59" both appear; COST asserts R2 settles the storage target while SYN recommends MinIO and TARGET leaves it open.

---

## 6. TEST REALITY

**What exists** [V]: `tests/integration/brief.test.ts` (299 lines) and `tests/integration/objects.test.ts` (180 lines); `vitest.config.ts` includes `server/**/*.test.ts` and `tests/**/*.test.ts` (no `server/` tests exist). 479 lines of test for 158 endpoints and ~14.5k lines of server code. No `test` script. No CI. No fixtures/factories. Client has no tests (no Playwright/RTL in deps).

**What they cover** [V]/[D]:
- `objects.test.ts` (8 tests, pass): builds a local Express app with its own object-ACL handlers and asserts on them; exercises `objectAcl` logic in isolation but not `server/routes/objectStorage.ts` [D: B-003].
- `brief.test.ts` (12 tests skip/fail at setup): imports real `storage` (so needs `DATABASE_URL`), but defines its **own** POST/GET `/api/briefs` handlers with a mock auth that sets `req.user = { claims: { sub } }` [V: lines 24-60]. It tests storage + the test's own route logic. Production `routes/briefs.ts` is never registered in the test.

**Why "nonrepresentative"** (four distinct reasons; each is a design lesson):
1. **Route copy instead of route composition**: a green test could not detect any of SP-002/003/004 (the exact defects), because none of the production route code executes. (TEST: "Production and tests must call the same route composition. Tests may replace providers, not application behavior.")
2. **The fake auth encodes the correct session shape** that production code got wrong in `briefDocuments.ts`.
3. **Negative paths absent**: no wrong-user, unauthenticated, suspended, expired-token, or blocked cases anywhere; the register's defects are all *absence of a negative check*.
4. **Environment-conditional skipping** ("12 tests skip/fail at setup" when `DATABASE_URL` absent) means the only DB-backed suite disappears silently: TEST rule 6 "No critical-path suite may be skipped in CI".
5. Gates were also *ordered wrong*: `build` doesn't typecheck, nothing boots the artefact, no migrations to apply.

**The remediation design already written in TEST is good input** and is what the greenfield should adopt (as constraints, not as governance): single `createApp(deps)` factory; injected identity/repos/blob/email/clock/token services; disposable Postgres with real migrations; generated route inventory + authz matrix (unauth, wrong-user, suspended, blocked, expired-token, valid); provider contract tests; a few browser journeys only for approved flows; CI order: clean install → lint → typecheck (zero errors) → tests (no critical skips) → migrate-from-empty → build → bundle budget → boot + `/healthz` smoke → dependency/secret/license → container build. (TEST §CI quality gates.) Its "migration/recovery tests" and "upgrade fixtures" sections are migration-thinking to drop, except **backup/restore of the new system**, which stays.

---

## 7. TOP 10 "DO NOT REPEAT" (ranked)

1. **Never let a hard delete or `ON DELETE CASCADE` reach agreement/consent evidence** (owner delete, participant replacement, account deletion, cleanup). `MyBriefs.tsx:128-164`→`routes/briefs.ts:610-625`→`storage/briefs.ts:69-94`; `storage/briefs.ts:107-118`+`schema.ts:368,401`; 17 user-cascade FKs (SP-001, SP-014, SP-005).
2. **Never treat an editable row's `updatedAt` as an agreement version**, and never allow in-place edits of presented terms. `invitationResponseService.ts:45-80`, `schema.ts:424-425`, `routes/briefs.ts:588-603` (SP-007).
3. **Never make authorization an opt-in line in each handler over an `any` request**; make deny-by-default, typed actor, scope-required repositories, and generate the negative-test matrix. 141 `req: any`; `briefDocuments.ts:48-125`, `availability.ts:133-159`, SP-003/004 (SP-002).
4. **Never put a safety rule only in the client.** `BriefBuilder.tsx:2902` CSS gate; server accepts any `nudityLevel` (`helpers.ts:36`) (SP-027, SP-028).
5. **Never use an external provider's subject as the primary key** or let the auth callback create product state. `replitAuth.ts:58-85`, `schema.ts:19-23` (SP-008, SP-013).
6. **Never test a copy of the route.** One app factory with injected providers; a test that can't fail on `req.user.id` vs `claims.sub` is not a test. `brief.test.ts:24-60` vs `briefDocuments.ts:60,87` (SP-019).
7. **Never call a vendor SDK/platform primitive from a route or service directly; never read `process.env` outside the boot-time config parser.** `objectStorage.ts:13-32`, `lib/resend.ts:1-40`, `db.ts:1-13` (REPLIT, SP-015/023).
8. **Never ship a capability claim (signing, payments, suspension, tiers, privacy defaults) that the server does not enforce**; capability states must be explicit and copy-checked. `Pricing.tsx:349,362`, `tierHelpers.ts:1-20`, `briefDocuments.ts`, `isSuspended` grep (SP-006/024/025/026).
9. **Never run destructive maintenance in-process at boot, keyed on naming heuristics, or mix test-data cleanup into production paths.** `server/index.ts:191-195`, `cleanup.ts:39-104` (SP-005).
10. **Never let the build pass without typecheck, tests, migrations-from-empty and a boot smoke test; never let one page/route file become the domain.** `package.json:6-10` (`build` omits `tsc`), 59 TS errors, `BriefBuilder.tsx` 4,377 lines, 158 endpoints/66 routes (SP-017/018/020).

*Honourable mentions:* API responses that are DB rows (SP-009) and `error.message` leaked to clients in 90 handlers; schema-derived insert schemas used as request validators; two PDF stacks and 22 client-only document tools that leave no server record; dependency sprawl (97 runtime + 23 dev deps, 38 advisories, test tools in prod, dead auth packages).

---

### Appendix: what I could not verify (so the design doesn't over-rely on it)

- Anything requiring a running environment: Node 20 start, real Replit auth providers, DB size/ownership, object inventory, email deliverability.
- Whether any `creator_signed` documents existed (SYN "unverified").
- Exploitability of the 38 advisories.
- Whether all 158 handlers are individually mis-scoped: my grep shows *mechanism*, not a per-endpoint audit.
- `tsc` error counts and Vitest results: taken from docs; I did not run them (read-only scout, no install).
