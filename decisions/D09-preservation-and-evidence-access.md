# D09 — Preservation and evidence access

Status: OPEN — counsel-dependent parts only: retention periods, purge policy and statutory erasure

## Why this needs Cory

How long evidence is kept, and who can reach it when circumstances change. This decision depends on counsel.

- How long is a record kept? Is it ever purged, and at whose request?
- A party closes their account. What is kept, what is deleted, and can they still reach their record?
- A party loses their credentials. How do they get their record back?
- A party is suspended. Can they still retrieve evidence they are entitled to hold?
- A participant was removed from a collaboration after an earlier agreement. Do they keep access to that earlier record?
- A person deletes their profile or other operational data but keeps their account. Is anything in their records affected?
- Who keeps historical access, and what is each told?

## Already settled

- Consent-bearing records are append-only; removal means archive, not destruction; records of agreement outlive account deletion **[R]** (DOCTRINE:56).
- The durable evidence package should be retrievable "subject to approved privacy and retention rules" **[R-prov]** (DOCTRINE:57).
- Suspension blocks protected actions immediately **[R-prov]** (DOCTRINE:80).

Still open in the sources: retention periods and permanent deletion rules (VISION:319).

## Cory's answer

Partial direct ruling — 2026-10-05.

For ordinary in-product removal of a shared record, removal requires both a reason and approval by all parties to that record. It is not a unilateral product action.

This does not override statutory privacy or erasure rights. Legal requests follow the legal path; the interaction between preservation, restriction, legal-claims bases and erasure remains counsel-dependent.

Still open at that date: retention period and purge policy; lost-credential recovery; access after closure or suspension; removed-participant historical access; statutory-erasure implementation. *(Recovery, closure and suspension answered 2026-10-15; see below.)*

Source: `2026-10-05-cory-reconciliation.md`.

### Direct rulings — 2026-10-09 and 2026-10-14/15

Source: [`2026-10-09-15-cory-reconciliation.md`](2026-10-09-15-cory-reconciliation.md) (A1, B3, Q17, C2).

- **Records outlive the account.** On account closure the final email carries the person's reference numbers; the records stay in an archive reachable by reference number (D03). **Archive access does not require an active account**, and no dormant account is kept.
- **Suspension blocks acting, never reading.** "Of course they still need access to their records, and they don't need an account to do it." If a suspension is ever contested, the record is exactly what they would need.
- **Lost credentials: re-verification of identity is the fallback** for recovery. The exact technical recovery mechanics are Dustin's call.
- **What is preserved is the final contract** (Q17, recorded in D04): the document everyone green-lit and signed, with its fingerprint and each person's affirmation and signature evidence, time, credential, device and IP. **No negotiation or version history exists to preserve** — intermediate states of the live brief are not retained (Correction HC1). *(2026-10-15: this line previously said "every version"; that was a handoff error, not a Cory ruling.)*
- Third parties are used only where a specialist means Modeling Standard holds less; the archive lookup needs no third party (doctrine 9).

**Still open — counsel-dependent:** retention periods for the final contract and its evidence, any purge policy, and statutory erasure and how it meets preservation (catch-up item C2). These are not Cory instinct questions.

**Not directly addressed:** historical access for a participant removed or replaced after an earlier agreement, and the effect of deleting profile data while keeping the account. The archive model (each person's reference numbers reach their own records) is the governing direction; these edges should be confirmed when D09 is taken to counsel rather than queued as separate Cory homework.

## What this unlocks

- The real-data lifecycle and any retrieval promise.
- Until this is answered, the build has no purge path **[F]** and makes no promise about how long in-product access lasts. Each party's delivered copy of the artifact is theirs regardless.

## Amendments

2026-10-15 — Records the archive model, closure email with reference numbers, account-free archive access, suspension blocks acting but never reading, and re-verification as the recovery fallback. Remains OPEN only for counsel-dependent retention and erasure.

2026-10-15 — Corrects a handoff error (not Cory changing his mind): preservation concerns the final contract and its evidence, not a negotiation or version history, which does not exist (HC1 in `2026-10-09-15-cory-reconciliation.md`). Retention duration remains counsel's. Status unchanged.
