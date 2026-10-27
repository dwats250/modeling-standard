# Manual acceptance — local synthetic product review

This is one coordinated owner review of the Track B profile, comp-card and portfolio drafts and the Track A final-record preview. It is not real-user acceptance. Automated tests already cover persistence, owner isolation, the D10 projection, production/staging route absence, and responsive overflow; this session is for interaction and visual judgment.

## Before the session

- Use the reviewed B1 and B2 branches (B2 is stacked on B1) and the Track A branch, each with its own worktree and task-owned PostgreSQL database. Do not point any app at shared staging or ordinary development/demo databases.
- Run one local demo at a time; use separate browser profiles for synthetic owners/participants. Keep the application on loopback.
- Confirm the synthetic-professional chooser is available in B1/B2. These branches use a local harness; professional sign-in is not implemented.
- Create a fresh synthetic photo-shoot in the Track A demo. The operator/test finalization is a demonstration fixture, not a participant signing event.

## Track B — private profile, comp-card and portfolio drafts

1. Choose synthetic professional A, enter a display name, profession, and short biography, then save.
2. Arrange all five fixture-backed slots, edit the tagline, and inspect the comp-card preview at desktop width and a 390px phone viewport.
3. Reload the page and confirm the profile and arrangement persist. Replace a fixture in one slot and verify the preview updates without changing the other slots.
4. Choose synthetic professional B and confirm A's profile and draft are not shown. Return to A and confirm its data remains intact.
5. On B2, choose up to three fixture images for A's portfolio, reorder them, remove one, save, and inspect the ordered preview at desktop width and 390px phone width. Reload and confirm the order persists.
6. Switch to synthetic professional B and confirm A's portfolio is not shown. Save an item for B, return to A, and confirm A's order is unchanged. Switch back to B, remove its item, save the empty draft, and confirm the preview says there are no images yet.
7. Confirm there is no upload, public URL, external sharing, directory, payment, or sign-in claim.

Expected: polished but private synthetic profile, comp-card and portfolio drafts; no real images or real professional account. The two-owner harness is not the eventual sign-in experience.

## Track A — synthetic final-record preview

1. As the local operator, create a two-person photo shoot and issue one invitation to each person.
2. In two separate browser profiles, accept each link using the local test identity provider. Resolve the brief and tick only as the relevant signed-in person; confirm both reach “Ready to sign.”
3. Use the operator/test inspector's synthetic finalize action. This acts for neither participant.
4. Return each signed-in browser to its shoot. Confirm it shows “Your final record preview,” the synthetic/no-signing disclaimer, shared terms, and the pair's payment terms; confirm there is no signing control or signature evidence.
5. Inspect the view at desktop width and 390px. Confirm no horizontal scrolling and that each browser remains signed in as its own participant.

Expected: a read-only synthetic preview after test/operator finalization. A deliberate tick is not a signature; this preview does not authorize a real collaboration.

## Deferred gates — not part of this session

- Real Google sign-in/callback verification, real-device authentication, and any multi-device login-link workflow.
- Real participant or professional accounts, public profiles, uploads, external sharing, production/staging enablement, participant signing, counsel review, and real-use authorization.

Record visual defects and exact reproduction steps; do not change product semantics during the session. See the [current product status](../../README.md#current-development-focus) and [S14 preview scope](../slices/S14-synthetic-final-record-view.md) for implementation evidence and boundaries.
