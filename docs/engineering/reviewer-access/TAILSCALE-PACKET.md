# Tailscale replacement packet for reviewer access

Status: **prepared offline; nothing applied.** No policy save, validate call, device share, Serve, certificate, Funnel or other tailnet command was run to prepare this. The live policy was not seen. The work order records the tailnet as a confirmed wildcard allow-all; nothing else about it is known here.

**This is a replacement, not an addition.** Under `src: *, dst: *` every narrower rule is redundant, so adding a grant for Cory limits nothing. Cory is scoped only once the wildcard is gone. With the wildcard in place, Cory's exposure depends on what kind of identity Cory has: a tailnet member reaches every device and port, and a share recipient reaches every port on the shared machine, because `*` as a source includes `autogroup:shared`. Either is too much, so no key is handed over before this is finished.

Files: [`tailscale-policy.replacement.hujson`](tailscale-policy.replacement.hujson) (the template) and `tests/reviewer-security/tailscale-policy.ts` (an offline shape check).

## Open before activation

### To verify at activation: what answers on 8443

The packet scopes Cory to **Asher TCP 8443**, as assigned. A network grant cannot tell services apart, so whatever answers on that port is what Cory reaches. What is known about it, by kind of evidence:

- **Observed:** a read-only `tailscale serve status` on Asher during independent review (2026-11-04) showed only the existing tailnet-only Options route on port 80, and no 8443 entry. This preparation did not repeat it.
- **Historical, not current:** the S13 records (`S13-STAGING.md`, `S13-CONTINUATION.md`) describe Serve mapping `:8443` to staging on `127.0.0.1:3130`, and PR #48's runbook first put reviewer mode on 8444 to avoid that.
- **Not known:** who owns 8443 at activation. Serve status shows Serve's entries only, so something else could still be bound to that port on the tailnet address. Staging's pinned origin in its own env file was not inspected either.

So do not assume 8443 belongs to staging, and do not assume it is free. Immediately before activation, confirm with `tailscale serve status` and `ss -ltn` on Asher, and stop if anything but the reviewer would answer there. If staging is expected to return to 8443, Dustin chooses: move staging (which changes its pinned origin and Google redirect URI), or use another reviewer port and change `tcp:8443` and `asher:8443` in the template, the checker constants and the tests.

### Prerequisites only the live tailnet can answer

Nothing in the template has been guessed. Each is a `__PLACEHOLDER__` or a `PREFLIGHT` comment.

| # | Inspect (read-only) | Why |
|---|---|---|
| 1 | The **complete** live policy, saved verbatim as the rollback copy | Only the wildcard is known. `groups`, `tagOwners`, `autoApprovers`, `nodeAttrs`, `ssh`, `postures` and any others must be merged in by hand and reviewed: the template replaces only the access rules it shows |
| 2 | Cory's **exact** identity, and its kind: tailnet member, or external recipient of a machine share | Decides `__CORY_IDENTITY__`, and whether activation needs a share at all (Tailscale describes sharing as what lets external users reach a machine; members get access through policy). This packet makes no share. If one is needed, it is a separate step for Dustin to approve |
| 3 | Dustin's exact identity, and whether Asher is owned by it or tagged | Decides `__DUSTIN_IDENTITY__`, and whether `autogroup:self` and the `ssh` rule cover Asher |
| 4 | Asher's tailnet address, from Asher (`tailscale ip -4`). S13 recorded `100.64.x.x`; that is history, not confirmation | `__ASHER_TAILNET_IP__`, one address |
| 5 | Every device: owner, tags, advertised routes, exit-node use | The wildcard allowed all of it silently. Each thing still needed gets an explicit grant, or it **breaks on save** |
| 6 | The Options route: `tailscale serve status` on Asher. Independent review observed it on port 80, tailnet-only, and S13 recorded the same. Check it is not also a subnet route or on another device | Decides whether `asher:80` preserves it. The test `accept` list must name the real destination |
| 7 | `ss -ltn` on Asher: everything listening beyond loopback | Add those ports to the reviewer's `deny` list. Tailscale tests cannot express "all other ports" |
| 8 | How Dustin reaches Asher: Tailscale SSH or OpenSSH over the tailnet | Tailscale SSH needs the live `ssh` rule copied, or Dustin can be locked out of Asher |
| 9 | Funnel: `tailscale funnel status`, and `nodeAttrs` in the live policy | Must be off for this service. The policy must not grant `funnel` beyond what is confirmed needed |

## Decisions in the template

- **Dustin gets `autogroup:self` and `asher`, not `dst: *`.** `*` also names Cory's devices. Whether a one-way rule puts a peer in the other side's device list could not be confirmed from Tailscale's documentation, so the template avoids depending on it, and check L4 below observes it.
- **Cory is an exact identity selector, not a group,** in the grant, `tests` and `sshTests`. Tailscale's sharing documentation shows a recipient's email as a grant `src` for a shared machine, and says sharing strips groups from the recipient's tailnet. Nothing establishes that an external recipient can be a member of a group in this policy, so the template does not depend on it. The form of the identity is not assumed: it is whatever preflight item 2 finds.
- **Unconfirmed: a share recipient's identity in `tests`.** The sharing documentation does not mention policy `tests`, and the policy syntax page lists a user as a valid `src` without addressing recipients. Only Tailscale's validation can settle this. If it rejects those entries, stop and revise; do not delete the deny tests to get past it. The live matrix below applies either way.
- **Grants only, no `acls`.** A legacy rule would combine with the grants.
- **No `*`, `autogroup:member` or `autogroup:shared` source anywhere**, including `ssh`: if Cory is a member or a shared user, each of those would include them. Tailscale documents `*` as a source covering `autogroup:shared`.

## Steps, for whoever activates it

Offline:

1. Complete the inspection above, and confirm what answers on 8443.
2. Copy the template outside the repository, fill it, merge the sections from the live policy. Do not commit a filled copy: it holds real identities.
3. `node tests/reviewer-security/tailscale-policy.ts <filled copy> --filled --reviewer=<Cory's exact identity>` must report the shape as intended. **This is not validation:** it checks structure only, and knows nothing of what Tailscale will evaluate.
4. A second person reviews the diff between the saved live policy and the filled copy, looking for anything removed by accident.

Live, each step only with Dustin's explicit go-ahead for that step:

5. Validate without saving: Tailscale's policy-validate API call runs the file's `tests` without applying it. Confirm the current endpoint and request format in Tailscale's API reference first.
6. Save the filled policy in the admin console, with Dustin connected over a path that stays allowed. Tailscale rejects a save whose `tests` fail.
7. Run the live matrix below at once.

**Rollback:** paste the saved live policy back into the admin console. That restores the wildcard, so **revoke Cory's access first if rollback lasts more than a moment**: stop reviewer mode or remove their device.

## Live test matrix (none of this has been run)

Expected results from **Cory's device**:

| # | Check | Expected |
|---|---|---|
| L1 | `https://<asher name>:8443/reviewer` | The reviewer gate, with a valid certificate. Not staging's band; if staging appears, stop |
| L2 | TCP to Asher on 22, 80, 443, 3130, 3140, 5432 and every other port from item 7 | Times out or refused |
| L3 | `tailscale ssh` to Asher, as any user | Refused |
| L4 | `tailscale status` | Lists only Asher and Cory's own devices. **Any other device means this requirement failed**, even if unreachable |
| L5 | TCP 8443 and 22 to another tailnet device's address | Times out |
| L6 | Choosing an exit node; reaching a subnet route | Unavailable |
| L7 | From outside the tailnet: `https://<asher name>:8443/` | Unreachable (Funnel off) |

From **Dustin's devices**:

| # | Check | Expected |
|---|---|---|
| L8 | SSH to Asher | Works as before |
| L9 | Options Observatory, at its existing address | Works as before |
| L10 | Dustin's other devices, each listed in item 5 | Work as needed |

A failed L2 to L7 means take reviewer mode down first and then diagnose.

## What the offline evidence does and does not show

`tests/unit/reviewer-tailscale-policy.test.ts` runs in `npm test`. It proves that the template has the intended shape, that a wildcard added back, any widening of Cory's grant, or putting Cory in a group is refused, and that a copy with an unfilled value, or checked against anything but one exact identity, is refused. It does not show that the policy is accepted by Tailscale, that its `tests` pass, or anything about real traffic.

## Sources

Read 2026-11-04. Tailscale's own validation is what counts if these differ.

- [Policy file syntax](https://tailscale.com/kb/1337/policy-syntax): `tests`, `sshTests`, `*` as a source, `autogroup:self`, `hosts`, `ssh`.
- [Grants](https://tailscale.com/kb/1324/grants): grant syntax, `ip` with `tcp:` ports, grants and legacy ACLs coexisting.
- [Sharing](https://tailscale.com/kb/1084/sharing): a recipient's email as a grant `src`, `autogroup:shared`, groups stripped from the recipient's tailnet, what a recipient can see and reach.
- [Tailscale changelog](https://tailscale.com/changelog): the validate API call running tests without saving.
