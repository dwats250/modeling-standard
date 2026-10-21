# Slice — S13 Google sign-in and synthetic staging

Status: BUILT — awaiting Dustin's review and the external acceptance run (authorized 2026-10-20 by Dustin: Google sign-in support and isolated synthetic staging; Google only on staging; tailnet-only through Tailscale Serve; staging database and service on 5435/3130)
Owner: Claude
Date: 2026-10-20
Depends on: S12 (`stage-1/s12-participant-access` at `da8003e`, PR #34, not merged when this was built; this branch is built on that commit)

## Outcome

1. A real Google account can sign in from an invitation link through the S12 flow: Google is one more `IdentityProvider`, with browser binding, single-use state, PKCE, nonce and jose verification unchanged.
2. The synthetic demo can run as **synthetic staging**: reachable from tailnet phones over HTTPS through a local reverse proxy, signing people in with Google, operator mode behind a server-checked key, on its own database.

Implemented and tested locally against a fake Google. **Not deployed** (no Tailscale Serve change, no certificate, no Google client in this session) and **not verified against real Google**.

## Product decisions relied on

- `decisions/D03-participation-credential.md` — account by Google or Apple sign-in at the invitation; sign-in is the door, not identity; recovery and credential mechanics are Dustin's. Apple not built (technical prerequisite: paid program, domain).
- `decisions/D06-real-use-and-launch-shape.md` — staging is step 1 (synthetic testing); Gate 2 stays closed.
- `decisions/D11-adult-assurance.md` — verification separate; its open item untouched.
- S06 — accounts hold `(login_provider, provider_subject)` only; Google is asked for `openid` only.

## Unruled seams — unchanged, no default

Who composes, shares, invites and enters agreed values (operator acts on staging, labelled); the counterparty's displayed identity (nothing from Google is shown or kept); the words on the Google button, the staging band and the claimed-link outcomes (marked proposed, D05).

## Invariants

- **I-S13-1.** Google is registered only with a complete, valid client configuration and a public origin; anything partial or malformed stops the process, naming the setting and never its value.
- **I-S13-2.** Only `openid` is requested; only the subject is kept.
- **I-S13-3.** A Google ID token is accepted only if jose verifies it: RS256, Google's keys, issuer `https://accounts.google.com` or `accounts.google.com`, audience this client, `exp`, `iat`, `sub`, nonce equal to the attempt's, bounded skew and age (S12's `verifyIdToken`).
- **I-S13-4.** Endpoints, issuers and the JWKS location are constants in source; the client secret appears only in the token request body.
- **I-S13-5.** A callback without a code spends its attempt; the sign-in cookie is cleared only for the browser's own matched attempt.
- **I-S13-6.** Staging listens on loopback; Host must equal the pinned public authority; Origin must equal the pinned public origin; no forwarding header is read; cookies are `__Host-` named, `Secure`, `Path=/`, no `Domain`, and only those names are read (never a bare-name fallback).
- **I-S13-10.** Google's Testing status does not limit who signs in (`openid` is exempt from the test-user list); staging's boundaries are the tailnet, the invitations and the operator key. No application-level account list.
- **I-S13-7.** Staging operator mode requires the operator key in the POST body, compared in constant time; the key is never a cookie, a URL part, a log line or stored by the page.
- **I-S13-8.** Staging uses only `modeling_standard_staging` on a loopback server; starting never resets; seeding only fills an empty database; reset needs `--confirm modeling_standard_staging` and refuses while staging listens.
- **I-S13-9.** The staging composition, the test provider and every staging script are outside the production build.

## In scope

S13-A Google provider and configuration; S13-B staging composition, commands and screens; S13-C runbook, acceptance checklist and tests.

## Explicitly out of scope

S11 (signatures, contracts, finalization). Apple. Real use. Funnel or any public exposure. Paid services, cloud resources, certificates, Tailscale changes. Production screens or a production operator.

## Acceptance evidence

`tests/unit/google-provider.test.ts`, `tests/http/staging.test.ts`, `tests/database/staging-database.test.ts`, `tests/demo-browser/staging.test.ts`, `tests/boot/boot.test.ts`, `tests/unit/config.test.ts`, `tests/unit/cookies.test.ts`, `tests/database/sessions.test.ts`, the restated pins. External acceptance: `docs/engineering/S13-STAGING.md` § Acceptance. Detail and runbook: `docs/engineering/S13-STAGING.md`.

## Change-locality check

Apple: one more `IdentityProvider` (plus its form-post callback). Cookie wire form: `src/http/cookies.ts`, one `secure` setting. Real hosting instead of Asher: a new public origin in the env file and a proxy; nothing in the application.
