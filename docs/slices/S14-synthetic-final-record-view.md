# S14 — Synthetic participant final-record view

**Status:** implemented in the local synthetic demo; automated HTTP and browser verification added. Not enabled in production or staging.

## Purpose

Give a participant a read-only view of the synthetic final record for a two-person photo-shoot demonstration. Reuse the existing [D10 per-party contract projection](../../decisions/D10-what-each-party-sees.md); do not create a second record model or change finalization semantics.

## Behavior

- The view is available only after the operator/test path has finalized the frozen brief.
- A signed-in account can read only a final record bound to that account's own project party. An unrelated account receives the same generic 404 as an unknown project; an unauthenticated request receives 401.
- The response contains the existing per-party projection: universal and shared terms, plus money clauses only for pairs that include the viewer. It excludes account identifiers and signature evidence.
- The local demo renders an explicit synthetic-demonstration label and says no participant performed a signing act. It offers no signing control, negotiation, version history, archive recovery, or deletion/retention behavior.
- The route is registered only by the local demo composition. It is absent from the production operation list and S13 staging.

## Boundaries and evidence

This view presents a synthetic record; it does not make a test/operator finalization a participant act or authorize real collaboration. It does not change D04, D05, D10, or any other product decision. The existing contract-projection tests cover three-party pairwise money isolation; the HTTP flow covers the current two-person photo-shoot record. Browser regression checks the synthetic disclaimer and phone-width layout.

Verification entry points:

- `tests/http/participant-access.test.ts` — account binding, generic unauthorized/not-found behavior, filtered projection, and omission of signing evidence.
- `tests/http/operation-registration.test.ts` and `tests/http/staging.test.ts` — route absent from production and staging.
- `tests/database/contracts.test.ts` — D10 per-party projection, including a three-party case.
- `tests/demo-browser/participants.test.ts` — participant preview at 390px after synthetic operator finalization.

Real Google acceptance, physical-device review, participant signing, legal review, and real-use authorization remain separate and incomplete.
