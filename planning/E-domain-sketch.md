# Deliverable E. Data and domain sketch (first slices)

Status: Fable proposal. Conceptual model only; not a schema. Uncertain decisions are marked **[?]** and cross-referenced to Deliverable H where Cory owns them. Revised after independent review (REVIEW-FINDINGS.md).

## 1. The seven distinctions the charge asked for

| Distinction | Model |
|---|---|
| Account vs identity | `Account` is the product's own id and status. `ExternalIdentity` rows link a provider subject to an account. Email is a claim on an external identity or a login method, never a key. |
| Account vs represented profile | `Profile` is a professional representation. In v1 every profile is a self-profile with `subject_account = holder_account`. The model allows `subject` to be a person record that is not an account (a represented adult, later a minor inside the youth partition) with `holder_account` as the manager. Nothing in v1 code branches on this; the column exists so the youth partition does not require a new identity model. |
| Collaboration vs collaboration version | `Shoot` and `TermsDraft` are mutable working state. `Version` is an immutable copy taken at presentation. A shoot has zero or more versions; the draft may differ from the latest version. |
| Participant vs account | `Participant` is a seat on a shoot with a role. The organizer holds a seat too (organizer flag plus their working role), so the organizer is a party like everyone else. A seat may be bound to a profile (and so an account) or carry only a name-and-email snapshot until claimed. Terms are per participant. Every participant listed in a version is a party to it. |
| Invitation vs authorization | `Invitation` is a participant plus a `BearerGrant`. The grant is the credential (scope, expiry, revocation); the invitation is the product event (sent, opened, claimed). A grant is never the identity of the person; claiming binds the participant to an account, and only an account whose verified email matches the invited address may claim. |
| Agreement vs artifact | Agreement is a derived state over review events and affirmations for one version. `Record` is the artifact produced when that state is reached: one common hash, and one rendered view per party (D10 decides what each view contains). |
| Mutable operational state vs immutable evidence | Left column tables may be updated and soft-archived. Right column tables are insert-only, protected by database role and trigger; their blobs live in a write-once storage class. |

```
 MUTABLE (working state)                 IMMUTABLE (evidence)
 ------------------------                ---------------------
 account, external_identity, session      version
 profile                                  presentation_event
 shoot, terms_draft                       review_event
 participant, invitation, bearer_grant    affirmation
 message (outbox), preference             record, record_view, record_access_log
```

## 2. Entities

### Identity & Access

- **Account**: id (UUIDv7), status (active | suspended | closed), adult_attestation_at **[?]** D11, verification (unverified | adult), created_at, closed_at. Closing an account never deletes it.
- **ExternalIdentity**: account_id, provider (email | google | apple ...), subject, email, email_verified, linked_at. Unique on (provider, subject).
- **Session**: id, account_id, created_at, expires_at, revoked_at.
- **BearerGrant**: id, kind (v1: invitation; later kinds added by migration), scope (a typed reference), token_hash, issued_by_account, issued_at, expires_at, revoked_at, last_used_at. One mechanism for every non-account credential.
- **AdminRole**: account_id, role, granted_by, granted_at.

### Professional Identity

- **Profile**: id, holder_account, subject (v1: same account; later a person record), display_name, roles_practised (set of Role), city, contact (email, phone, visibility flags), one_line, audience (adult in v1), archived_at. No handle in slice 1 (the link page is stage 4 and needs a Cory decision).

### Shoot (working state)

- **Shoot**: id, organizer_account, title, purpose, audience, preset_id?, shoot_date (nullable until set), created_at, archived_at. Whether the shoot is drafting, presented or agreed is computed from evidence, never stored as truth (a cached column is acceptable for lists).
- **TermsDraft**: shoot_id (1:1), structured JSON conforming to the kernel Terms schema, organized in eight term blocks: purpose and concept; when and where (date, call time, expected end, location name and address, city); who (participants and roles); compensation per participant (paid: amount, currency, deposit and its due date, payment timing, method as recorded; trade: what each side gives and receives); expenses (who covers travel, meals, consumables); deliverables and delivery (what, how many, quality, method, timing); usage (permitted uses, term, credit requirement); boundaries and safety (wardrobe levels, content levels, contact level and toggles, the off-limits statement, chaperone, closed set, private change area, breaks, emergency contact on set, wardrobe approval). The eight blocks are Fable's proposal derived from VISION:77; the values are Cory-owned vocabulary; the minimum required set for presentation is **[?]** D4.
- **Participant**: id, shoot_id, role, is_organizer, profile_id?, name_snapshot, email_snapshot, standing (invited | joined | declined | removed), joined_at. Compensation lives in TermsDraft keyed by participant id so that each person's deal is set independently (a pattern the prototype blueprint recorded; Cory's ratified text requires per-participant compensation).
- **Invitation**: id, participant_id, grant_id, sent_at, opened_at, claimed_at, claimed_by_account. Claim rule: `claimed_by_account` must hold a verified ExternalIdentity whose email equals `email_snapshot`; otherwise the claim is refused and the organizer is asked to change the participant (which is a new version if one was presented).
- **Preset**: id, name, owner (system | account), terms_template JSON, audience. Slice 1 ships two system presets (paid, trade); user presets are stage 4.

### Agreement & Evidence

- **Version**: id, shoot_id, sequence, canonical_terms (stored as text bytes, RFC 8785 canonical form, so the hash is recomputable from what is stored), rendered_clauses (text, by term block), template_version, participants_snapshot (ids, roles, names as presented; contact details excluded until agreed **[?]** D10), block_hashes (one per term block, so a changed-blocks list between versions is a comparison of eight hashes), hash, presented_by_participant, presented_at. Insert-only. The organizer's affirmation on the version they present is written in the same transaction (see Affirmation).
- **PresentationEvent**: version_id, participant_id, kind (made_available | opened), at, via (session | grant id). Insert-only.
- **ReviewEvent**: id, version_id, participant_id, kind (accept | decline | concern | withdraw **[?]** D2), concern (structured: term block, short note) when kind is concern, at, via. Insert-only, append-only series per (version, participant). The latest event counts until the freeze; the freeze fixes the set. A concern followed by an accept on the same version is therefore possible without a new version.
- **Affirmation**: id, review_event_id (an accept), or version_id when it is the organizer's presenting affirmation, actor_kind, account_id, credential_ref (session id), legal_name, adult_attestation (copied from the account at that moment **[?]** D11), term_blocks_affirmed, affirmed_at, request_meta (IP, user agent; a default Cory may veto, D4). Insert-only. Every party to an agreed version has at least one affirmation, the organizer included.
- **OrganizerConfirmation** **[?]** D2: modelled as a second organizer affirmation of kind `confirm` after every other party has accepted. Exists only if Cory keeps the double opt-in; if the last acceptance freezes, the organizer's presenting affirmation is their signature.
- **Record**: id, version_id, common_hash (over the canonical version plus the set of affirmations), frozen_at, superseded_by_record_id (set by insert of a later record's row, never by update: modelled as a separate `record_supersession` insert-only row), parties (participant ids with affirmation ids). Insert-only.
- **RecordView**: record_id, participant_id, blob_ref (PDF in the evidence storage class), pdf_hash. One per party. What each view contains beyond the common terms and the viewer's own terms is **[?]** D10. Insert-only.
- **RecordAccessLog**: record_id, actor, accessed_at. Insert-only.

### Communications

- **Message**: id, account_id or email, category (login | invitation | review_activity | agreement | record | system), template, payload, state (queued | sent | delivered | failed | suppressed), attempts, last_error, created_at, sent_at.
- **Preference**: account_id, category, enabled. Categories `login`, `invitation`, `agreement`, `record` cannot be disabled.

### Stage 2 sketch: Documents

- **DocumentTemplate**: id, name (model release, photo release, boundaries and safety, later riders), text_version, body (versioned template text with merge fields), audience, retired_at.
- **DocumentInstance**: id, version_id (the agreed shoot version it was assembled from), template_id and text_version, parties (participant ids), merged_text (frozen), hash, assembled_at. Insert-only.
- Signatures on a document are Affirmations whose `term_blocks_affirmed` names the document instance; the signing primitive is not duplicated.
- A record assembled after stage 2 includes its document instances in the common hash; records frozen before stage 2 remain valid and are not rewritten.

## 3. The agreement state machine (proposed; D2 decides three transitions)

```
 draft ---present (organizer affirms)---> v1 available to P1..Pn
                          |
          each Pi: accept (+affirmation) | decline | concern | withdraw?
          (append-only; latest counts)
                          |
   all parties accepted v1 ---[organizer confirm affirmation?]---> AGREED(v1) ---freeze---> Record(v1)
                          |                                                          |
   organizer edits draft ---present---> v2 (changed blocks listed)                   |
          [who must re-accept: Cory, D2]                                              |
                                                                      edit after freeze ---> v3, AGREED(v3) ---> Record(v3)
                                                                      Record(v1) stays retrievable, marked superseded
```

Facts the model guarantees regardless of Cory's answers:
- A review event always names the version it answers; there is no review without a version.
- Editing the draft never changes any version; presenting again creates a new version with a new hash and a list of changed blocks (block hash comparison).
- The organizer signs every version they present; there is no version without an organizer affirmation.
- A participant added after v1 was presented is not a party to v1; they become a party only to a version that lists them.
- A participant removed from the draft remains a party to any version that listed them; the record for that version still shows them.
- A decline blocks agreement on that version until the participant accepts a later event or a new version.
- An edit after a freeze produces a new version; the earlier record is never modified, only superseded once the later version is agreed.
- "Agreed" is computed from immutable rows, so it can be recomputed and audited at any time.

Policy points Cory owns (D2):
1. Whether organizer confirmation (a second organizer affirmation) is required after all acceptances, or the last acceptance freezes.
2. After a new version, who must re-accept: all listed participants, or only those whose blocks changed.
3. Whether a participant may withdraw an acceptance before the freeze.

## 4. Uncertain modeling decisions (flagged)

| # | Decision | Options | Recommendation | Owner |
|---|---|---|---|---|
| E1 | Can a participant accept via bearer grant alone, or must they hold an account? | bearer-accept with a one-time code at signing, account offered after / account required to accept, bearer to read / account required to read | See D3. A magic-link account and a bearer link both prove control of an inbox; the account's real gains are a durable home for records and binding across shoots. Either way, claiming binds to a verified matching email. | Cory (D3) |
| E2 | Organizer confirmation step | required / not required / organizer chooses per shoot | Required: one tap, and the organizer issues the record. | Cory (D2) |
| E3 | Re-acceptance after a new version | everyone / only affected | Everyone in slice 1. Safety reason: no participant's acceptance ever silently carries across a change they did not read, and no definition of "material" is needed. Revisit at stage 4 with usage data. | Cory (D2) |
| E4 | Request metadata on affirmations (IP, user agent) | store / do not store | Store, as a default Cory can veto; standard in e-signature practice; retention follows the record's. | Dustin default, Cory veto (D4) |
| E5 | Compensation shape: paid or trade only | as proposed / add collab, gifted, hybrid as kinds | Two kinds; gifted is trade, hybrid is paid plus trade lines, "equal exchange" is symmetric trade. | Cory (D4) |
| E6 | Amounts as numbers with currency vs text; ranges | numbers; ranges as two numbers with a stated basis / single amount only | Numbers. Whether a range is "explicit" is Cory's. | Cory (D4) |
| E7 | Audience on Shoot in v1 | column present with one accepted value / omit | Present. | Fable |
| E8 | Profile.subject separate from holder in v1 | present, always equal / omit | Present and always equal. | Fable |
| E9 | Versions store rendered clause text or only canonical JSON | both / JSON only | Both; doctrine requires verbatim clause text. | Fable (doctrine-driven) |
| E10 | Record PDF hash reproducibility | require byte-stable PDF / hash the stored artifact | Hash the stored artifact; reproducibility comes from canonical bytes plus rendered text. | Fable |
| E11 | Retention and purge of evidence after account closure | keep indefinitely / fixed period / party-requested | Keep; no purge command exists until Cory and counsel define one. | Cory + counsel (D9) |
| E12 | What each party's record view contains | everything / common terms plus own terms / organizer chooses per block | Common terms plus own terms, contact details only after agreement. | Cory (D10) |
| E13 | Adult attestation in v1 | attestation recorded on account and copied into affirmations / nothing until verification | Attestation. | Cory (D11) |

## 5. What is deliberately not modelled yet

Media and blobs beyond record PDFs (stage 3), comp cards, portfolios, concept posts, access requests (stage 3 to 4), availability and reminders (stage 4), reports, strikes, blocks (stage 5), entitlements and plans (stage 6), person records for represented talent and the youth partition (gated). Each is a new set of tables that references the ones above; none requires changing them.
