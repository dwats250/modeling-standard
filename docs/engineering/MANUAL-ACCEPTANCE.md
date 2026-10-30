# Manual acceptance — synthetic product review

This walkthrough is for Cory and Dustin to judge the interaction and visual quality of the private professional toolkit (B1–B4) and the synthetic collaboration/final-record preview (S14). It is not real-user, legal, provider, or production acceptance.

## Readiness and setup

- Run this only after the integration order in the current continuation checkpoint has been completed and the combined candidate is available. The PR branches alone are not a reviewer link.
- **Remote reviewer access is not ready:** current live inspection found no S13 staging listener on port 3130 and no active `ms-staging` session. Asher's only Tailscale Serve route is the unrelated Options Observatory on port 80. Do not use that route for this review.
- Until Dustin supplies a specifically authorized private reviewer URL, run the synthetic demo on loopback (`127.0.0.1`) with a task-owned demo database. Do not reuse staging, development, or another demo database. The full setup and test commands are in the [demo runbook](DEMO.md); resets are destructive to the named demo database.
- Use Chrome or Edge. Review desktop layout, then a 390px-wide mobile viewport (a browser's responsive view is sufficient). For S14 use two separate browser profiles so each synthetic participant has its own session. For B4 use two tabs in the same synthetic-professional account.
- Everything below uses invented identities and deterministic fixture media. Do not enter personal information or upload images; uploads are not part of this build.

## Track B — private profile, comp card, portfolio, captions

1. Choose synthetic professional A. Enter a display name, profession, and short biography; save the profile.
2. Arrange the five fixture-backed comp-card slots (hero, full body, profile view, lifestyle, beauty), edit the tagline, and inspect the preview on desktop and at 390px. Save, reload, and confirm the profile and arrangement persist. Replace one fixture and make sure other slots stay put.
3. Switch to synthetic professional B. Confirm A's profile and draft are not shown; return to A and confirm its saved data remains.
4. In A's portfolio, choose fixture images, order them, and add a short caption to one. Confirm the caption stays with its image after reorder and disappears when that image is removed. Save and inspect the portfolio preview at desktop and 390px. Reload and confirm order and captions persist.
5. Repeat with B using a different item/caption. Switch between A and B and confirm their profile and portfolio drafts do not cross over. Remove B's items, save, and confirm the empty state.
6. Open A's portfolio in two tabs. In both tabs, make different edits from the same saved version. Save tab 1, then save tab 2. Tab 2 must refuse the stale save, explain that its edits are kept, and show no other account's data. Choose **Review the saved version**. Compare it with the unsaved edits; only then either explicitly replace the screen with the saved version or deliberately save the reviewed tab's edits over it. There must be no automatic overwrite or loss of edits.
7. Confirm the experience makes no claim of real sign-in, uploads, public profile, directory, external sharing, or payments.

## Track A — synthetic collaboration and final-record preview

1. In the local synthetic collaboration demo, create a fresh two-person shoot and issue one invitation to each synthetic participant.
2. Open the invitations in separate browser profiles. Accept them with the local test identity provider, resolve the brief, and tick only as the participant signed into that browser. Confirm both reach “Ready to sign.”
3. Use the operator/test inspector's clearly labelled synthetic-finalize action. It acts for neither participant.
4. Return each participant to the shoot and inspect “Your final record preview.” Confirm the synthetic/no-signing notice, shared terms, and only the payment terms belonging to that participant's pair. Confirm there is no signing action or signature evidence.
5. Inspect desktop and 390px mobile widths. Confirm no horizontal overflow and that each browser remains in its own participant session.

Expected: a read-only synthetic preview after operator/test finalization. Ticking is not signing; this preview does not authorize a real collaboration.

## Acceptance gates — keep these separate

- **Cory: product/visual review.** Does the language, sequence, and presentation feel right? Record usability feedback and any proposed product-semantic change separately; do not settle a binding product question inside this walkthrough.
- **Dustin: synthetic application acceptance.** Confirm the documented behavior, responsive layout, account isolation, and conflict recovery work as described. Automated checks are supporting evidence, not visual acceptance.
- **Real Google/provider acceptance.** Separate S13 staging flow only. Google sign-in is not the toolkit sign-in, and it does not establish identity or age. This walkthrough does not test Google or require a phone/login-link session.
- **Production, legal, and real-use gates.** Not part of this review. Counsel review, consent/document review, security/privacy readiness, participant signing, and explicit real-use authorization remain separate prerequisites.

## Windows 11 preparation for Cory

No development tools are needed. Wait for Dustin to send a private reviewer link and access instructions; none is ready today.

1. Install Tailscale for Windows only when Dustin sends the approved invitation, then sign in and accept that invitation. Do not join or browse unrelated machines or services.
2. Open the private bookmark Dustin provides in Chrome or Edge. If access is not yet granted or the page does not load, stop and tell Dustin; do not try alternate IP addresses or share credentials.
3. If a separate staging link is provided for a Google journey, use Google only there. The professional toolkit uses a synthetic account chooser; it does not have professional sign-in.
4. Try the review steps above using only the clearly labelled synthetic records.
5. Send feedback to Dustin by email or text under one of three headings: **Usability** (hard to find or understand), **Bug** (what happened and the screen/device), or **Product decision** (a rule or meaning Cory needs to decide). No GitHub, terminal, or screenshots containing personal information are required.

Do not change product semantics during the technical walkthrough. See [S14 scope](../slices/S14-synthetic-final-record-view.md), the [demo runbook](DEMO.md), and the [current product status](../../README.md#current-development-focus) for implementation boundaries.
