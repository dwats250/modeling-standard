Modeling Standard — Ground-Zero Product & Architecture Review

Assignment

You are being asked to perform a ground-zero product and architecture review of Modeling Standard and produce the planning framework for a from-scratch implementation.

This is not a migration project.

This is not a refactor project.

This is not an attempt to reproduce the existing Replit application using cleaner technology.

The prior application should be treated as an early prototype and product-discovery artifact created before the product had matured conceptually. Its implementation, schema, routes, workflows, page structure, feature decomposition, technology decisions, and UX patterns carry no default authority.

The new application should emerge organically from Cory's actual product vision.

---

1. Authority

Sole product authority

Cory is the product owner.

His product vision, values, goals, intended users, safety philosophy, market understanding, and explicit product decisions are the controlling authority.

Everything else is subordinate.

The current repository contains substantial documentation and implementation history, but none of it should be preserved merely because it exists.

Authority hierarchy for this review

Treat sources approximately as follows:

1. Cory's explicit product vision and decisions
2. Product doctrine only where it faithfully captures Cory's stated intent
3. Current product questions that genuinely remain unresolved for Cory
4. Industry/domain reasoning that helps realize Cory's intent
5. Prior product ideas as optional evidence
6. Existing implementation as archaeological evidence only

The old application is last.

If a prior architecture decision, schema decision, UI structure, feature organization, naming convention, or workflow conflicts with a cleaner realization of Cory's vision, discard it.

Do not try to reconcile the new design back to the Replit implementation.

---

2. Ground-zero mandate

Assume we are starting with an empty repository.

Ask:

«If Cory explained Modeling Standard to an excellent product team today, with no existing application, how should they build it?»

That is the exercise.

The previous application may reveal:

- what problem Cory was exploring;
- workflows he considered important;
- categories of information that may matter;
- terminology worth discussing;
- features that indicate broader product ambition;
- mistakes and risks already discovered.

It does not tell us:

- what the database should look like;
- what the route structure should look like;
- how many brief types there should be;
- which pages should exist;
- which features should launch first;
- which frameworks or providers should be used;
- how the domain should be decomposed;
- what should be monetized;
- what should be public;
- how identity should work;
- how agreement should work;
- whether any historical abstraction deserves preservation.

Nothing is grandfathered in.

---

3. Product identity

The product is Modeling Standard.

It is not fundamentally a "shoot brief generator."

The brief is an important mechanism, but Cory's vision is substantially broader.

The product is intended to become a professional business ecosystem for independent people working in modeling, photography, and adjacent creative disciplines, particularly the large space between amateur participation and traditional agency representation.

The product should make professional self-management easier.

Potential users include:

- models;
- photographers;
- makeup artists;
- stylists;
- designers;
- other creative collaborators;
- guardian managers where youth talent is eventually supported.

The application should help people coordinate real professional work while naturally producing greater clarity, accountability, documentation, and safety.

---

4. Core vision

The central product idea can be summarized as:

«Make the clear, professional, safe, well-documented way of working easier than the fragmented informal way.»

Today, collaborations are often assembled through:

- Instagram DMs;
- texts;
- emails;
- verbal discussions;
- scattered PDFs;
- disconnected calendars;
- separate portfolio services;
- improvised rate negotiations;
- unwritten assumptions.

Modeling Standard should turn those disconnected activities into a coherent professional workflow.

The goal is not bureaucracy.

The goal is professional clarity with extremely low friction.

---

5. Cory's positioning principle

A defining concept is:

Beautiful garden, invisible walls

Safety is foundational.

Safety is not necessarily the primary acquisition message.

Cory does not want Modeling Standard to feel like a fear-driven safety product.

The ideal user should want the application because it is:

- beautiful;
- useful;
- professional;
- convenient;
- aspirational;
- better than the collection of tools they currently use.

The safety architecture should exist underneath that experience.

The user enters because the garden is attractive.

The walls protect them once they are inside.

This has important consequences.

A safety feature that makes the product unpleasant, cumbersome, humiliating, alarmist, or excessively bureaucratic may be poorly designed even if its intention is good.

Conversely, a beautiful interface that merely claims safety while failing to enforce important guarantees is unacceptable.

The product must do both.

---

6. The professional-suite thesis

Modeling Standard is intended to occupy the space between:

"I arrange everything informally myself"

and

"an agency manages my professional career."

The product may ultimately provide much of the infrastructure an agency or experienced professional normally organizes.

Examples of possible capabilities include:

- professional profile;
- portfolio;
- comp cards;
- availability;
- scheduling;
- creative planning;
- moodboards;
- collaboration briefs;
- casting/collaboration requests;
- compensation terms;
- deliverables;
- usage rights;
- releases and documents;
- collaboration records;
- final shoot packages;
- controlled professional discovery.

Do not assume this historical feature list is the correct decomposition.

Instead determine:

«What is the smallest coherent product architecture that can naturally grow into this professional suite?»

---

7. The collaboration record

One especially important product concept appears durable.

A professional collaboration needs a shared record of what everyone understood.

At minimum, real work can involve:

- purpose of the shoot;
- date/time/location;
- roles;
- participants;
- compensation;
- expenses;
- deliverables;
- delivery timing;
- usage rights;
- boundaries;
- wardrobe/content expectations;
- safety expectations;
- material changes;
- approvals/declines/questions;
- final agreed terms.

Modeling Standard should make this information natural to establish before commitment becomes costly.

This is more important than preserving any historical "brief builder."

The correct future UX might look substantially different.

Fable should explore that freely.

---

8. Agreement philosophy

Cory's important conceptual distinction is:

«The product freezes the agreement. It does not witness the performance.»

Modeling Standard cannot prove what happened in a room after people arrived.

It can provide strong evidence of:

- what was proposed;
- what was presented;
- which version somebody reviewed;
- what they agreed to;
- what they did not agree to;
- when that occurred;
- what later changed.

It should not pretend to be:

- a lawyer;
- a court;
- an enforcement authority;
- a guarantee that nothing bad will happen.

This should influence the domain model from the beginning.

Agreement history should be trustworthy.

Important historical agreement should not disappear because someone deletes a profile or cleans up an old project.

---

9. Safety philosophy

Cory has articulated two catastrophic failure modes.

Failure mode A: false protection

The product must not become somewhere people seeking safety congregate while its safeguards are mostly theatre.

A system that communicates safety but fails to enforce its important boundaries would be worse than being merely neutral.

Failure mode B: weaponized accusation

The product must not become a reputation-destruction engine based on unsupported allegations, personality conflicts, hearsay, or social pile-ons.

Protection must run both directions.

The product's strongest safety mechanism may often be the professional paper trail itself.

People intending misconduct generally prefer ambiguity.

Making professional documentation normal raises the cost of bad behaviour without requiring the platform to become judge and jury.

---

10. Safety must not be monetized

One of Cory's strongest product principles:

«Safety is not the upsell.»

Core consent, boundary-setting and relevant documentation should not become premium features.

Future monetization should come from things like:

- professional convenience;
- capacity;
- branding;
- advanced workflow;
- business tools;
- storage;
- portfolio capabilities;
- organization;
- automation;
- analytics;
- team features;

not from withholding basic protections.

Exact monetization remains a later product decision.

Do not design pricing into the ground-zero architecture unless an abstraction genuinely needs to support future entitlements.

---

11. Compensation philosophy

Compensation should be explicit.

The historical product intentionally resisted vague labels such as "negotiable" because ambiguity creates opportunities for pressure.

Do not mechanically preserve the old compensation UI.

Do preserve the underlying question:

«How should Modeling Standard encourage professional compensation terms to become explicit before the day of work?»

Modeling Standard does not currently need to handle user-to-user payments.

It can document compensation while money moves elsewhere.

---

12. Privacy and discovery

Cory does not want Modeling Standard to degenerate into a people-browsing directory.

Professional discovery should preferably begin through:

- work;
- collaboration intent;
- a deliberately shared artifact;
- an invitation;
- a trusted introduction;
- a professional context.

This remains an area where Fable should think creatively.

There is an important unresolved design problem:

«How can the platform help people find professional opportunities without turning people themselves into browsable inventory?»

Do not simply reproduce the old Explore page.

Design the answer from first principles.

---

13. Youth and guardian management

Youth participation is part of Cory's broader vision, but it should not drive the first implementation.

A critical structural principle has already emerged:

«A child is not an account holder.»

A minor would exist as talent represented and managed through an adult guardian manager's account.

Cory has also envisioned strong separation between youth and adult ecosystems.

However, youth operation involves unresolved legal and product decisions.

Therefore:

For planning

The architecture should avoid making future youth support impossible or unsafe.

For implementation

Start adult-only unless Cory explicitly decides otherwise.

Do not attempt to solve youth image hosting, youth discovery, guardian authority, youth nudity rules, child-performer law or related legal questions through agent inference.

Those require Cory and appropriate professional advice.

The right architectural posture is:

future-compatible, presently disabled.

---

14. Greenfield fact

There are no production users requiring migration.

The old accounts and records were test data.

Therefore:

- no user migration;
- no identity migration;
- no database migration;
- no object reconciliation;
- no backwards-compatible API requirement;
- no schema compatibility requirement;
- no old URL requirement unless Cory specifically wants one;
- no obligation to preserve historical runtime behaviour.

This should materially simplify the design.

---

15. Technical philosophy

The desired architecture should be boring in the good sense.

Prefer:

- understandable systems;
- strong types;
- explicit state transitions;
- centralized authorization;
- deterministic tests;
- replaceable external providers;
- one primary system of record;
- clear domain boundaries;
- simple deployment;
- low operational burden.

Avoid:

- microservices without demonstrated need;
- distributed systems;
- event-driven architecture for its own sake;
- multiple databases;
- excessive abstraction;
- giant generic frameworks;
- clever AI-agent infrastructure;
- building every future feature in advance.

We want an architecture a tiny team can understand completely.

---

16. Current technical hypothesis — challenge freely

A reasonable starting hypothesis is:

- TypeScript;
- React;
- Vite;
- Node server;
- PostgreSQL;
- Drizzle or equivalent typed database layer;
- Zod or equivalent runtime schemas;
- one deployable modular application.

This is not sacred.

Fable may recommend changes if they materially improve simplicity, maintainability, product fit or safety.

Do not change technology merely for novelty.

Likewise, do not preserve technology merely because the prototype used it.

Explain the reasoning.

---

17. Architectural principle: domain first, screen second

The old application grew through pages, routes and feature additions.

The rebuild should begin with the domain.

Candidate conceptual domains might include:

- accounts and identity;
- professional representation;
- collaboration;
- agreement/versioning;
- evidence/artifacts;
- professional presence;
- scheduling;
- media;
- access/privacy;
- trust/moderation;
- communications.

These are suggestions, not mandated module names.

Fable should derive the correct boundaries.

A healthy design should permit the UI to evolve dramatically without requiring the safety model to be rewritten.

---

18. Architectural principle: consequential policy belongs on the server

Never rely on visual disabling or UI hiding for safety-critical behaviour.

Examples of rules that must ultimately live below the UI include:

- authorization;
- audience/partition rules;
- access boundaries;
- agreement state transitions;
- immutable history;
- invitation scope;
- token expiry;
- suspension;
- retention;
- meaningful version changes;
- privacy enforcement.

The interface may explain these rules beautifully.

It must not be the only thing enforcing them.

---

19. Architectural principle: internal identity

Do not make an external OAuth/OIDC/provider subject the core user identifier.

The product should own stable internal account IDs.

External identities link to them.

Likewise, consider separating:

- account;
- professional profile;
- represented talent/person;
- organization/team;

rather than assuming one database user row represents every future concept.

Do not over-model this prematurely, but avoid foundations that make future guardian management impossible.

---

20. Architectural principle: immutable agreement versions

The collaboration model should seriously consider immutable versions.

Potential conceptual shape:

Collaboration
    ├── Working state
    ├── Version 1
    │    ├── participant review
    │    └── agreement evidence
    ├── Version 2
    │    └── re-review where required
    └── Finalized evidence package

A later edit must never silently rewrite what somebody previously agreed to.

Fable should determine the cleanest domain/state model for this.

Do not inherit the old schema.

---

21. Architectural principle: provider independence

External capabilities should live behind small application-owned boundaries.

Likely categories include:

- authentication;
- email;
- object/media storage;
- artifact/PDF rendering;
- configuration/secrets;
- logging/telemetry.

Select vendors after defining what the product actually requires.

We should not build the application around the convenience of a hosting provider again.

---

22. Product development philosophy

Do not attempt to design the entire final company before coding begins.

The preferred development model is:

«one complete product slice at a time»

Each slice should be:

- product-coherent;
- testable;
- useful;
- vertically integrated;
- approved where product decisions are involved.

Avoid parallel feature sprawl.

The goal is not to recreate the prototype's breadth quickly.

The goal is to establish a trustworthy foundation and then compound.

---

23. Candidate first vertical slice

Fable should decide whether this is the correct first slice and improve it.

A candidate is one adult professional collaboration:

1. Adult creates an account.
2. Adult establishes minimal professional identity.
3. Adult creates a collaboration/shoot.
4. They specify the relevant professional terms.
5. They invite another adult.
6. Invitee joins or claims the invitation.
7. Invitee reviews the exact version presented.
8. Invitee accepts, declines or raises defined concerns.
9. Material changes create a new review state.
10. Final agreement is frozen.
11. Both parties receive the same durable human-readable artifact.
12. Collaboration can later be archived without destroying the historical agreement.

This slice deliberately excludes most of the eventual professional suite.

Its purpose is to establish the application's trustworthy spine.

---

24. Important unresolved Cory decision

The first collaboration story itself is not yet necessarily settled.

Possible leading examples include:

- paid shoot;
- TFP/TFV collaboration;
- generic/full professional shoot;
- another scenario Cory considers more representative.

Do not silently choose this merely because one already exists in old code.

If the first slice materially depends on that choice, present Cory with a concise comparison and recommendation framework.

---

25. The second major product layer: the garden

After the collaboration spine works, the product should increasingly become something a professional wants to live in.

Likely territory:

- dashboard;
- professional identity;
- portfolio;
- comp cards;
- scheduling;
- availability;
- moodboards;
- creative planning;
- work-first professional discovery.

This is where Fable should be especially creative.

Do not simply modernize the old screens.

Ask:

«What would make an independent model or photographer open Modeling Standard every week even if they had never experienced a safety problem?»

That question is central to Cory's vision.

---

26. Visual/product design mandate

Do not treat the existing interface as a design specification.

Its general aspiration toward editorial professionalism may be useful evidence, but the new visual system should be created organically around Modeling Standard.

Desired emotional qualities include:

- confident;
- adult;
- professional;
- calm;
- premium without pretension;
- modern;
- easy;
- credible;
- human;
- beautiful enough to be desirable.

Avoid:

- security-dashboard aesthetics;
- fear messaging;
- legal-document aesthetics everywhere;
- generic startup SaaS;
- excessive cards and dashboards simply because modern component libraries make them easy;
- social-media imitation;
- visual clutter.

The application should feel like a professional standard, not merely another productivity tool.

---

27. What NOT to do

Do not:

- port the old application;
- preserve the old schema;
- preserve route parity;
- reproduce all six historical brief builders;
- reproduce all historical document tools;
- reproduce Explore;
- reproduce the old tier model;
- preserve Replit abstractions;
- treat existing features as a checklist;
- treat archived BLUEPRINT material as requirements;
- build youth now;
- build payments now;
- build referrals now;
- build microservices;
- select infrastructure vendors before requirements;
- turn every possible future feature into an abstraction;
- let technical convenience answer Cory-owned product questions.

Most importantly:

«Do not mistake previous effort for product truth.»

Sunk cost has zero authority.

---

28. How to use the existing repository

Use it in three different modes.

Mode A — Cory evidence

Extract Cory's explicit decisions, reasoning, language and unresolved seams.

This is valuable.

Mode B — product archaeology

Use the old feature set and blueprint to understand the territory Cory was exploring.

Ask why a feature existed.

Do not assume the historical solution was correct.

Mode C — negative engineering evidence

Use the reconnaissance findings to avoid repeating known mistakes:

- frontend-only safety enforcement;
- inconsistent authorization;
- mutable consent history;
- destructive cascade behaviour;
- provider-owned identity;
- provider coupling;
- nonrepresentative tests;
- enormous page components;
- broad unstructured route surfaces.

Do not spend excessive time cataloguing the old implementation.

We already know enough to justify a clean start.

---

29. Expected deliverables from Fable

Produce a planning package, not implementation yet.

Deliverable A — Product interpretation

Explain Modeling Standard in your own words.

Identify:

- core user problem;
- primary user groups;
- core value loop;
- professional-suite thesis;
- safety mechanism;
- acquisition thesis;
- long-term product shape.

Explicitly distinguish:

- owner-approved direction;
- your interpretation;
- open questions.

---

Deliverable B — Product invariants

Produce a short set of durable product invariants that should constrain future PRDs.

For example, but do not blindly copy:

- safety is not paywalled;
- agreement history is not casually mutable;
- product truthfulness;
- adult account holders;
- privacy/discovery posture;
- explicit professional terms;
- no user-to-user payments for now;
- youth requires structural separation;
- protection without fear-based UX.

Keep this set small.

These should be actual architectural/product constraints, not slogans.

---

Deliverable C — Proposed product architecture

Define the major product/domain modules.

For each:

- responsibility;
- important entities/concepts;
- what it owns;
- what it does not own;
- relationships to other domains;
- important invariants.

Prefer simple boundaries.

---

Deliverable D — Technical architecture

Propose the greenfield technical architecture.

Include:

- application topology;
- frontend/backend relationship;
- database approach;
- authentication model;
- authorization architecture;
- persistence;
- immutable/versioned evidence;
- media strategy;
- provider boundaries;
- jobs/background work if actually needed;
- testing architecture;
- CI;
- deployment philosophy.

Identify which choices should be made now versus deferred.

---

Deliverable E — Data/domain sketch

Do not produce a giant final database schema.

Produce the conceptual data model required for the first product slices.

Identify important distinctions such as:

- account vs identity;
- account vs represented profile;
- collaboration vs collaboration version;
- participant vs account;
- invitation vs authorization;
- agreement vs artifact;
- mutable operational state vs immutable evidence.

Flag uncertain modeling decisions.

---

Deliverable F — First vertical slice recommendation

Recommend the first genuinely useful product slice.

Explain:

- why it should be first;
- which Cory goals it proves;
- what it deliberately excludes;
- what technical foundations it requires;
- its acceptance criteria;
- which decisions require Cory.

The slice should be small enough for one implementation program but large enough to prove the architecture.

---

Deliverable G — Development sequence

Propose approximately 5–8 major stages from empty repository through adult beta.

Do not make a 100-item roadmap.

Each stage should answer:

- what capability becomes real;
- why that capability comes now;
- what prerequisite it establishes;
- what remains intentionally excluded;
- what evidence means the stage is complete.

---

Deliverable H — Cory decision packet

Identify only decisions that genuinely require Cory before development progresses.

Avoid flooding him with implementation choices.

For each:

- decision;
- why it matters;
- viable options;
- consequences;
- your preferred framing;
- whether it blocks immediate work.

Aim for a small decision packet.

---

Deliverable I — Creative direction

Provide a conceptual direction for the application's experience and visual identity.

Do not build mockups yet unless helpful.

Discuss:

- hierarchy;
- navigation;
- emotional tone;
- what the dashboard should feel like;
- how professional identity should feel;
- how collaboration workflows should feel;
- how safety should appear without dominating;
- mobile behaviour;
- desktop behaviour;
- how the "beautiful garden, invisible walls" concept should manifest in UX.

---

30. Model/agent operating model

The likely team structure is:

Fable 5.1

Product architecture, creative direction, high-level planning, ambiguity resolution, PRDs and decision framing.

Opus 5.5

Primary implementation agent once an approved scope exists.

Responsible for building, testing and integrating the planned slices.

Cory

Sole owner of product vision and material product decisions.

Dustin

Technical integration/orchestration, agent direction, review, repository control and human merge authority.

Agents must not convert uncertainty into product policy merely to keep moving.

---

31. Planning style

Be opinionated where technical/product reasoning supports an opinion.

Be conservative where Cory's authority is required.

We do not need elaborate governance.

We do need clarity.

Avoid producing process for process's sake.

The intended rhythm is:

Cory vision
   ↓
Fable product interpretation / PRD
   ↓
Cory decision where necessary
   ↓
approved bounded slice
   ↓
Opus implementation
   ↓
tests / review
   ↓
human merge
   ↓
next slice

The documentation should serve the product, not become a parallel product.

---

32. Final framing

The previous application proved that Cory had a meaningful product idea.

It did not prove that its implementation was the right expression of that idea.

We now have the opportunity to build Modeling Standard without inheriting prototype debt.

Approach the problem as though an excellent founding engineering/product team has just been handed Cory's vision and an empty repository.

Preserve the why.

Question the historical what.

Redesign the how.

The goal is not:

«"Modeling Standard, but cleaner than Replit."»

The goal is:

«the application Cory would have built if the product vision had been this clear on day one.»