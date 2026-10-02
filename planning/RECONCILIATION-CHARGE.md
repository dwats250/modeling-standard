# Reconciliation charge

> Preserved as received on 2026-10-02 (plain text; section numbering as in the original). This is the assignment that `RECONCILIATION-REPORT.md` answers. It is an input, not product authority.

Modeling Standard — Fable 5.1 Reconciliation Charge

You are receiving:

1. the current greenfield Modeling Standard planning package; and
2. Astra’s adversarial review of that package.

Your task is to reconcile the planning baseline, not to implement anything.

Do not scaffold the application.
Do not select vendors.
Do not create infrastructure.
Do not write production code.
Do not begin Stage 0 implementation.
Do not convert unresolved product questions into defaults merely to keep planning moving.

The output of this pass should be the cleanest possible planning baseline for later owner review and eventual implementation by Opus 5.5.

---

1. Core authority rule

Cory’s vision is the sole product authority.

Preserve the provenance distinctions already in the planning package:

- [R] — ratified Cory direction
- [R-prov] — ratified direction that remains expressly provisional in its controlling source
- [CA] — Cory-attributed direction from a source that has not itself been ratified
- [F] — Fable recommendation, interpretation, or proposed mechanism
- [OPEN] — unresolved product decision

Do not upgrade one category into another.

In particular:

- a technically elegant solution is not automatically product doctrine;
- a likely product answer is not authority;
- a recommendation does not become an invariant merely because several later documents depend on it;
- “configurable later” does not authorize choosing a product default now.

---

2. Greenfield stance remains intact

Do not retreat from the ground-zero framing.

The prior Replit application remains historical evidence only.

There is no obligation to preserve:

- its schema;
- its API;
- its route structure;
- its page structure;
- its feature decomposition;
- its authentication model;
- its provider choices;
- its UX;
- its naming;
- its workflows;
- its technical architecture.

Reuse an idea only because it independently survives scrutiny against Cory’s vision and the new plan.

Astra found little direct Replit coupling in the proposed architecture. Preserve that success.

However, also address the subtler carryovers Astra identified, such as:

- organizer confirmation inherited from the old workflow;
- inherited field vocabulary driving schema design;
- self-profile assumptions appearing before their necessity is established;
- contaminated historical attributions such as the “six costumes” phrase.

Correct those without turning the reconciliation into another archaeology project.

---

3. Treat Astra’s review as adversarial evidence, not new authority

Astra’s findings are recommendations and critiques.

They do not become doctrine because Astra found them persuasive.

For each significant finding:

1. determine whether it identifies a genuine contradiction, unsupported promotion, hidden product assumption, or technical overreach;
2. accept and correct it where warranted;
3. preserve the existing plan where Astra is challenging a defensible technical recommendation rather than exposing an authority problem;
4. clearly explain any finding you do not adopt.

Do not mechanically patch every sentence Astra mentions.

Perform a principled reconciliation.

---

4. The most important correction: Stage 0

Astra’s strongest architectural finding is that the proposed Stage 0 is not truly product-neutral.

Rework Stage 0 accordingly.

Stage 0 purpose

Stage 0 should establish only the technical substrate required to safely build later approved product behaviour.

It should not require answers about the meaning of a collaboration, agreement, participant, organizer, identity, payment boundary, or professional representation.

Use synthetic fixtures when proving mechanisms.

Stage 0 may include

- reproducible install / check / test / build / boot;
- small, explicit dependency set;
- real application composition rather than test-local copies;
- configuration validation;
- redacted/structured logging;
- error handling;
- a mandatory authorization/policy boundary proven with synthetic operations;
- explicit input/output validation;
- local transactional persistence and reviewed migration mechanics if retained in the technical plan;
- transaction/rollback tests;
- runtime-vs-migration privilege separation if justified;
- a small evidence-mechanics probe using synthetic bytes/data;
- proof that evidence-like data can be protected against ordinary runtime mutation/deletion under the declared threat model;
- controllable clock/credential/token seams only where Stage 0 actually exercises them;
- CI proportional to the actual foundation.

Stage 0 should exclude

Unless a product-independent technical necessity can be demonstrated:

- real login/signup semantics;
- account onboarding;
- adult attestation;
- invitation claiming;
- profiles;
- represented people;
- youth/adult audience models;
- shoot creation;
- participant roles;
- compensation schema;
- collaboration terms schema;
- agreement state machines;
- signatures;
- final record views;
- product retention periods;
- real email delivery;
- production evidence buckets;
- product PDF architecture;
- billing;
- navigation;
- product presets;
- production copy.

Use this test:

«If Cory could answer an open product question differently and force this Stage 0 work to change, that work probably belongs in Stage 1 or later.»

Do not interpret this so strictly that ordinary technical choices become impossible. The goal is product-neutrality, not paralysis.

---

5. Separate invariant from mechanism

Astra correctly identified places where the planning package mixes Cory-approved outcomes with implementation proposals.

Correct this systematically.

For example:

Product invariant

Finalized agreement evidence cannot be silently altered through normal application behaviour.

Possible technical mechanisms

- append-only persistence;
- database privileges;
- triggers;
- immutable object storage;
- application command boundaries;
- hashes;
- version records;
- multiple enforcement layers.

The first may be [R].

The implementation choices are [F] unless already independently approved.

Apply this discipline throughout the package.

Particular mechanisms that should not masquerade as product invariants include:

- database grants;
- storage class choices;
- hash topology;
- exact affirmation-control counts;
- typed-name interaction;
- exact signing timing;
- generic bearer-grant architecture;
- renderer process topology;
- nightly integrity scans.

Preserve strong engineering recommendations where useful, but label them correctly.

---

6. Multi-party collaboration requires correction

Do not assume the answer is:

«one global agreement, signed by every listed participant, under one common hash.»

Cory’s direction supports meaningful agreement by relevant participants and evidence of participant-relevant terms.

That does not yet determine the legal/product topology.

The planning baseline must explicitly distinguish at least these possibilities:

- one collective agreement;
- one shared collaboration state plus related party-specific agreements;
- multiple bilateral/multilateral obligations under a common collaboration;
- another Cory-approved structure.

Do not select among them prematurely.

The model should preserve the concept that a collaboration may involve n parties without assuming every party agrees to every term or is entitled to every other party’s private information.

---

7. Organizer obligations need to become explicit

The previous correction that “the organizer must sign” solved only part of the issue.

Avoid treating “organizer” as a magical composite role containing:

- coordinator;
- author;
- payer;
- client;
- rights recipient;
- deliverables recipient;
- finalizer;
- signer;
- decision-maker for everyone else.

Model or describe obligations in terms of:

«who owes what to whom»

Examples include:

- payer → payee;
- photographer → model;
- model → client;
- rights grantor → rights recipient;
- creator → deliverables recipient;
- venue/provider → collaboration parties.

This does not mean build a generalized contract engine.

It means the first slice must not hide material obligations inside one organizer flag.

Organizer signing should occur where the organizer is actually undertaking or affirming obligations.

Whether organizer confirmation is a distinct second opt-in remains a Cory-owned decision.

---

8. Evidence must prove what each signer actually saw

Astra’s evidence critique is important.

A version ID and common hash alone are not sufficient.

The eventual evidence model must be capable of establishing:

- the exact collaboration state presented;
- the exact clauses presented;
- the values substituted into those clauses;
- the party-specific terms visible to that signer;
- the relevant counterparties;
- the specific affirmations/signatures attached to those clauses;
- timestamps and actual credential/identity context used;
- which accepted responses formed the final state;
- the resulting portable artifact(s).

Do not prematurely fix the database schema before Cory answers visibility and agreement-topology questions.

But preserve this requirement:

«Evidence should establish what this party actually reviewed and affirmed, not merely that they were associated with a broader collaboration version.»

---

9. Privacy and record access must be disentangled

The planning package currently mixes several kinds of access.

Separate conceptually:

Temporary operational access

Examples:

- invitation tokens;
- private share links;
- temporary portfolio/media grants;
- pre-agreement collaboration access.

These may expire or be revoked.

Durable party evidence rights

A person who became a party to a finalized agreement may need continuing access to the record they are entitled to hold.

Cory still needs to decide behaviour involving:

- suspension;
- account closure;
- lost credentials;
- removed participants;
- deleted operational profiles;
- retention expiry.

Do not assume “all grants expire” solves these cases.

Do not assume suspension automatically eliminates access to evidence the suspended person is entitled to retain.

Keep the exact semantics open until Cory decides them.

---

10. Correct the paywall treatment completely

Do not collapse Cory’s rulings into:

«“everything safety-related is free, therefore creating a collaboration must be free.”»

The important distinction is between:

- safety/documentation access;
- participation;
- initiation;
- professional-suite features;
- eventual subscription boundaries.

Cory’s July direction includes material suggesting initiation may be paid while safety documentation remains free.

Therefore:

- keep the precise initiation/paywall boundary open where it remains unresolved;
- ensure the architecture does not accidentally make free safety documents dependent on paid shoot initiation;
- preserve a viable path for safety/document use with people who are not Modeling Standard users, where Cory’s existing direction supports that;
- do not implement billing in Stage 0;
- do not use the absence of billing implementation as evidence that initiation is free.

Explicitly flag the exact owner decision required.

---

11. Keep identity concepts distinct

Do not collapse:

- credential;
- login method;
- account;
- person;
- professional subject/profile;
- collaboration participant;
- represented talent;
- guardian/representative;
- authority to act;
- email inbox control.

For the first slice, do not build the entire future representation system unless required.

But also do not assume that:

«email control = verified identity = legal/professional authority = account ownership = right to sign.»

D3, D4 and D11 should capture the relevant open seams.

If Stage 1 can initially restrict itself to adults acting for themselves, make that an explicit proposed constraint requiring Cory approval, not an inferred fact.

---

12. Reframe Stage 1

Stage 1 is not yet a fixed build specification.

Turn it into a conditional adult collaboration envelope.

Cory’s existing direction supports outcomes such as:

1. relevant collaborators establish explicit professional terms before work;
2. required participants agree to the terms relevant to them;
3. signatures/affirmations are bound to the specific clauses they affirm;
4. compensation, deliverables, usage and boundaries are preserved;
5. changes cannot silently rewrite prior agreement;
6. affected people return to review when Cory-approved amendment rules require it;
7. each party receives an authorized, independently holdable artifact containing the evidence they are entitled to;
8. ordinary archival/account cleanup does not destroy another party’s agreement evidence;
9. Modeling Standard does not claim to witness what happened on set;
10. the product does not claim identity verification or legal enforceability beyond what it actually performs.

Within this envelope, recommend the smallest useful first scenario.

Do not assume both paid and trade presets are required.

Do not assume a specific form vocabulary before D1.

Do not assume unlimited parties.

Do not assume a collective agreement topology.

Do not imply production readiness for real shoots until the real-use gates are resolved.

---

13. Real use versus synthetic demonstration

Make this distinction explicit.

Synthetic Stage 1 demonstration

Can prove:

- application flow;
- authorization;
- versioning;
- evidence mechanics;
- privacy boundaries;
- concurrency;
- artifact creation.

Real private collaboration

May additionally require resolution of:

- release/document requirements;
- adult assurance;
- truthful identity claims;
- record access/recovery;
- retention;
- relevant legal review;
- approved scenario scope.

Do not describe a synthetic end-to-end demonstration as equivalent to readiness for real professional use.

Likewise, do not assume trade/portfolio collaboration is inherently low-risk or exempt from usage/release concerns.

---

14. Engineering obligations once state transitions are approved

Astra correctly identified missing failure semantics.

Once Cory settles the relevant transitions, Stage 1 engineering should account for:

- concurrent edits;
- acceptance racing with edits;
- withdrawal during finalization;
- duplicate finalization;
- retries;
- artifact-rendering failure;
- artifact-storage failure;
- partial finalization;
- idempotency;
- recovery from interrupted operations.

This does not imply event sourcing.

Prefer the smallest transactional model that correctly handles the approved semantics.

---

15. Architecture simplification

Challenge prior architectural recommendations against actual demonstrated need.

One application and one primary transactional database remain reasonable recommendations.

However, do not automatically require in Stage 0:

- monorepo structure;
- shared domain kernel;
- custom universal command registry;
- universal bearer-grant abstraction;
- generalized media adapter;
- renderer subprocess;
- unused verification interfaces;
- unused scanning interfaces;
- nightly comprehensive integrity scan;
- generalized youth/audience architecture.

Some may become excellent later choices.

Do not pay their complexity cost before their requirements exist.

---

16. Cory decision packet

Keep the existing D1–D11 structure where useful, but revise the questions to reflect Astra’s findings.

At minimum, make the following decisions explicit.

D1 — First scenario

Ask Cory to walk through one actual intended collaboration.

Identify:

- who organizes;
- who participates;
- who pays;
- who receives payment;
- who delivers what;
- who receives deliverables;
- who grants usage rights;
- who receives those rights;
- which documents are actually needed.

This should drive Stage 1 semantics.

D2 — Agreement topology and lifecycle

Resolve or frame:

- collective vs party-specific agreement;
- whether organizer confirmation is required;
- when agreement becomes final;
- counter-proposals/concerns;
- withdrawal;
- cancellation;
- roster changes;
- amendments;
- re-acceptance rules;
- what happens to the prior agreement while replacement terms are pending.

D3 — Participation credential

Clarify:

- account required or not;
- account required merely to read or only to sign;
- code/token-only participation;
- forwarded invitations;
- wrong-email recovery;
- lost credential recovery;
- durable record retrieval after the invitation credential is gone.

D4 — Terms and affirmation

Clarify:

- required terms;
- required clause language;
- compensation representation;
- payer/payee relationships;
- deliverer/recipient relationships;
- affirmation interaction;
- signature timing;
- what metadata is actually needed.

Do not assume eight blocks/eight buttons or typed names are doctrine.

D5 — Vocabulary

Determine the names for:

- collaboration container;
- proposal/presentation;
- participant response;
- finalized agreement;
- final artifact;
- archival/completion statuses.

Names should accurately reflect what each state promises.

D6/D8 — Real use and documents

Clarify:

- whether Stage 1 is allowed for real private work;
- which scenarios trigger which releases/documents;
- what essential templates must exist before real use;
- whether any require professional legal review.

D7 — Paywall/initiation

Clarify exactly what “initiate” means.

Possible boundaries include:

- creating a draft;
- inviting another person;
- presenting terms;
- finalizing an agreement;
- another act.

Also ensure standalone/free documentation does not become indirectly paywalled.

D9 — Preservation and evidence access

Clarify:

- retention period;
- account closure;
- credential recovery;
- suspension;
- participant removal;
- who keeps historical access;
- what gets deleted versus retained.

D10 — Visibility

Clarify what each party can see:

- roster;
- compensation;
- contacts;
- location;
- private notes;
- concerns;
- signatures;
- counterparties;
- usage terms;
- changes;
- final records.

Distinguish before agreement, during review and after finalization.

D11 — Adult assurance / identity truthfulness

Clarify whether adult attestation is sufficient for the proposed first slice before a verification provider exists.

Ensure product copy reflects the actual assurance level.

Identity/authority extension

Also ask whether the first slice contains only adults acting for themselves, or whether organizations/representatives may commit another party.

Do not infer authority merely from account control.

---

17. Deferred scope

Preserve deliberate deferral of the wider suite unless the first scenario proves a dependency.

Examples:

- public professional profiles;
- full portfolios;
- comp cards;
- broad discovery;
- public pages;
- scheduling suite;
- delivery transit;
- reputation systems;
- full moderation tooling;
- organizations;
- professional representation;
- youth operation;
- billing implementation;
- pricing;
- tiers;
- referrals/affiliates;
- production providers;
- hosting;
- infrastructure topology;
- generalized media pipelines;
- old URLs;
- compatibility with the Replit application;
- migration.

Do not use “deferred” to hide a requirement that the chosen real-use scenario genuinely needs.

If Stage 1 requires a release, adult assurance, record recovery or some other prerequisite, promote it into the relevant gate.

---

18. Documents to revise

Reconcile the current planning package rather than replacing it wholesale.

At minimum review:

Root README / planning README

Replace contradictory implementation gates with distinct gates for:

- Stage 0 technical authorization;
- Stage 1 semantic/product authorization;
- real-use authorization.

A — Product interpretation

Preserve the strong product framing.

Remove any suggestion that every future capability necessarily hangs from a shoot/collaboration if that is only [F].

B — Product invariants

Separate:

- ratified product outcomes;
- technical mechanisms;
- open exceptions.

Do not force an arbitrary invariant count.

Resolve conflicts around revocability, suspension and evidence access.

C — Product architecture

Keep useful domain boundaries, but reduce mandatory structure that lacks a current requirement.

Avoid circular module dependencies created merely by planning diagrams.

D — Technical architecture

Move product choices out of “technical decisions.”

Reduce “decide now” to decisions truly required for Stage 0.

E — Domain model

Preserve conceptual distinctions.

Suspend concrete fields affected by open Cory seams.

Explicitly represent obligations/counterparties conceptually.

Model presentation-to-affirmation binding without prematurely locking a schema.

Remove assurances that Cory’s answers cannot materially change the model.

F — First vertical slice

Rewrite as a conditional Stage 1 envelope.

Do not claim immediate real-use readiness.

G — Development sequence

Replace the product-bearing Stage 0.

Make Stage 1 conditional on owner decisions.

H — Cory decisions

Expand the seams identified above.

Remove “start with preferred answers.”

Do not characterize trade work as inherently low-risk.

I — Creative direction

Keep it advisory.

Mark example signing UI, navigation, account flow and organizer-confirmation behaviour as dependent on the relevant decisions.

Research/review history

Correct known attribution contamination such as “six costumes.”

Preserve review history with dispositions rather than rewriting history to make it appear every issue was always understood.

---

19. Operating-model cleanup

The current greenfield project no longer needs stale migration-era restrictions that claim Claude Code is the only permissible agent interface.

Recommend a small replacement operating rule for later adoption:

- Cory owns product direction.
- Dustin owns technical orchestration and repository/merge authority.
- Fable supports planning, creative/product architecture and PRD work.
- Opus supports bounded implementation.
- Astra may perform adversarial review.
- Agents do not resolve Cory-owned product seams.
- Human review occurs at material product and merge boundaries.

Do not build a complex multi-agent governance system.

A concise rule is enough.

If the old governance documents remain in the new repository, recommend retirement/archive explicitly.

Do not modify them in this task unless specifically authorized.

---

20. Desired final output

Produce a reconciled planning package and a concise reconciliation report.

The report should include:

A. Astra findings disposition

For each major Astra finding:

- accepted;
- partially accepted;
- rejected;
- reasoning;
- documents affected.

B. Revised Stage 0

Clearly state:

- scope;
- exclusions;
- completion evidence;
- why it is product-neutral.

C. Revised Stage 1

Clearly state:

- approved outcome envelope;
- proposed first-slice shape;
- decisions still blocking precise semantics;
- synthetic-demo boundary;
- real-use boundary.

D. Revised Cory packet

Provide the smallest coherent set of owner decisions necessary to move forward.

E. Deferred list

Explicitly preserve what we are not solving yet.

F. Architecture simplifications

Identify any abstractions or mechanisms removed or postponed because Astra demonstrated they were premature.

G. Remaining disagreements

Do not hide legitimate uncertainty.

---

21. Stop condition

When the planning baseline is reconciled:

STOP.

Do not implement Stage 0.

Do not scaffold.

Do not create migrations.

Do not select production vendors.

Do not write application code.

Do not resolve Cory’s answers by inference.

The next step is human review of the reconciled package.

---

Final principle

The objective is not to make Astra happy.

The objective is not to defend Fable’s first draft.

The objective is to arrive at the smallest, clearest, most faithful planning baseline that lets us build Cory’s product without accidentally deciding it for him.

Preserve what is strong.

Remove what outran authority.

Keep technical recommendations technical.

Keep open product questions open.

Then stop.
