# D03 — Participation credential

Status: DECIDED — for the first photo-shoot scope (2026-10-15). Recovery mechanics and credential formats are Dustin's technical decisions, not open product questions.

## Why this needs Cory

What a person needs in order to read the terms, to sign them, and to come back to their record later.

- Is an account required to read the terms? To sign them? At all?
- Is a link or one-time code sent to the invited address enough to take part?
- An invitation is forwarded, or opened by someone other than the person named. What should happen?
- The invitation went to the wrong address, or the person wants to use a different one. How is that corrected, and does it need the organizer?
- Someone loses access to their email or account. How do they recover?
- If a person took part with a link or code only, how do they get back to their record after that link has expired?

**[F] note — information, not a default.** Requiring an account and sending a one-time code prove the same thing at the moment of signing: control of the invited inbox. Neither proves who the person is. The difference comes afterwards: an account gives a durable place to return to. Whatever is chosen, each party's delivered copy of the artifact does not depend on it.

## Already settled

- Login is not verified identity **[R]** (VISION:317).
- The record captures the identity or credential used to agree **[R]** (DOCTRINE:52).
- Login-method selection is not doctrine (DOCTRINE:113).
- Cory's signup feel, "I'd almost not know I signed up" **[CA]** (FEATURE-REVIEW:74). It was said about signing up from a request on a link page, not about responding to a brief.

## Cory's answer

Direct rulings — 2026-10-09 and 2026-10-14/15. Source: [`2026-10-09-15-cory-reconciliation.md`](2026-10-09-15-cory-reconciliation.md) (Q1, A1, B3, B5).

**Account.**

- **An account is required.** It is created by **Google or Apple sign-in at the moment of the invitation.** (Q1)
- **Sign-in is the door, not identity.** Verification is separate and happens at first participation (D11). (Q1)
- **Verification earns its place on ban evasion alone** — it is what makes a removal stick. Bots are not the justification. (Q1; see D11.)

**Invitation.**

- **The link is the invitation; email is only one way to deliver it.** (A1)
- **Wrong address: dissolved.** Send the link elsewhere. Nothing is reissued and no product state needs correcting. (A1)
- **Forwarded invitation: no mechanism.** "That situation wouldn't come up without communication." If someone forwards one, that is theirs to handle — humans stay accountable for being humans. Special forwarded-link handling is deliberately not a product feature. (A1)
- **Referral is a shared link.** Whoever receives it applies through the ordinary route; a referrer introduces and nothing more (B5; recorded in D07 and D12).

**Coming back to a record.**

- **The archive model (Cory's design).** Records live in an archive reachable by reference number — the airline-ticket pattern. On account closure the final email carries all of the person's reference numbers. No files, no stored links, **no dormant account is needed** for archive access. (A1, B3)
- **The reference is long and random so it is the retrieval credential itself**, with the **surname as a sanity check.** (A1; Claude's amendment, accepted by Cory.)
- **Recovery: re-verification of identity is the fallback.** (A1)
- **Exact recovery mechanics are Dustin's technical call, not a product decision.** (A1)

Not chosen here, and not Cory questions: OAuth libraries, identity vendors, archive reference format or cryptography.

Answers every question above: account (required, created at invitation); link sufficiency (the link is the invitation, delivered by any channel, with sign-in); forwarded and wrong-address invitations; recovery; return to a record (archive by reference). Scope: photo shoots; fashion shows are a separate product.

## What this unlocks

- Invitation, sign-in and durable retrieval journeys.
- The last question connects to D09.

## Amendments

2026-10-15 — Records the 2026-10-09 and 2026-10-14/15 rulings (account by Google/Apple sign-in at invitation; sign-in is not identity; link is the invitation; no forwarded-link mechanism; archive by long random reference with surname check; re-verification fallback). Status OPEN → DECIDED for the first photo-shoot scope: every question in this file is answered, and what remains is technical.
