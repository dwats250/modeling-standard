# Reviewer access: the synthetic demo over HTTPS, behind its own sign-in

Status: built and tested offline; **not activated**. No proxy, certificate, tailnet policy, service, user account or firewall rule was changed for it. Everything here is labelled by what supports it:

- **Automated:** checked by a test in this repository (commands under [Verification](#verification)).
- **OS:** depends on how the machine runs the process. Offline-parsed at most; never exercised.
- **Live:** depends on the real tailnet. Never exercised.

**What this is.** `npm run demo:reviewer` serves the ordinary local synthetic demo (invented people, invented shoots, the local test sign-in that is not Google or Apple, the toolkit's two synthetic professionals, `modeling_standard_demo`) on loopback, so a local HTTPS reverse proxy such as Tailscale Serve can put it at one exact `https://` origin for a reviewer on another device. In front of every demo page and route sits a **reviewer gate**: the browser must first post a configured access key and receive a reviewer session.

**What this is not.** Not staging (`npm run staging`: Google sign-in, its own database, operator key), not production (`src/main.ts`), and not real use. Nothing here is in the production build; no reviewer route exists on staging or production. A reviewer session is not an account and not identity.

## Pieces

| Piece | Where |
|---|---|
| Configuration (exact origin, access key, session length, state directory; refuses Google, staging and the migration credential), the gate (sessions and their limit, sign-in page, revocation), server limits | `src/demo/reviewer.ts` |
| The live database boundary: exact database, least-privilege role, exact grants | `src/demo/reviewer-database.ts` |
| Database preparation, the only reviewer path with the migration credential | `src/demo/reviewer-bootstrap.ts`, `src/scripts/demo-reviewer-bootstrap.ts` |
| Dedicated-server provisioning; hardened service template; replacement tailnet policy and its test packet | `docs/engineering/reviewer-access/` |
| The gate's page style (no script) | `src/demo/ui/reviewer.css` |
| The gate runs after the Host check and before every page, file, test sign-in page and application request | `src/demo/server.ts` |
| The reviewer composition: the local shape at one pinned HTTPS origin with `Secure` `__Host-` cookies | `src/demo/application.ts` |
| Serving entry point, excluded from the production build | `src/scripts/demo-reviewer.ts`, `tsconfig.build.json` |
| Owner-only env file reader, shared with staging | `src/demo/staging.ts` (`readOwnerOnlyEnvFile`) |

## Trust boundary

```
reviewer's device ──HTTPS──▶ Tailscale Serve (port: see the packet) ──HTTP──▶ 127.0.0.1:<port> demo-reviewer.ts ──▶ 127.0.0.1:<dedicated port> PostgreSQL, modeling_standard_demo
```

Three independent boundaries. Being inside one is not being inside the next.

1. **The network.** Who can reach the proxy at all is the proxy's and the tailnet's business. The application reads no `Tailscale-User-*`, `X-Forwarded-*` or `Forwarded` header: the demo server forwards only `content-type`, `cookie` and `origin` to the application, and the gate looks only at `Host`, `Origin`, `Cookie` and the form body. Those headers can neither widen Host or Origin nor sign anyone in (tested with every one of them forged).
2. **The reviewer gate.** `GET /reviewer` is the sign-in page. `POST /reviewer/sign-in` must carry `Origin` exactly equal to the configured origin and the key in the form body (a key in the query string is refused unread, 400). The key is compared as a SHA-256 digest in constant time; a malformed key is compared too. Success sets `__Host-ms_reviewer`: an opaque 32-byte token, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, with an absolute lifetime (default 4 h, `REVIEWER_SESSION_SECONDS` 60–43200). The server keeps only the token's digest and expiry, in memory, for at most 16 open sessions. Without a valid session, `/`, `/inspector` and the test sign-in page redirect to `/reviewer` (303) and everything else is `401 reviewer_sign_in_required`, before any file is read or the application is asked. After ten refused keys within a minute, sign-in answers 429 without looking at the key, for the rest of that minute.
3. **The demo's own principals**, unchanged: a reviewer then chooses a synthetic professional, signs in as a test person from an invitation, or enters operator mode, exactly as on the local demo. All of those cookies are `__Host-` named, `Secure` and `HttpOnly` in this mode. Every POST to the application needs `Origin` exactly the configured origin (the S12 rule), and every POST carrying a cookie — which, behind the gate, is every POST — is refused otherwise (`403 cross_origin`).

The Host header must be exactly the configured authority (`host[:port]` as the browser sends it, case-insensitive), else 421 before the gate. No HSTS header is sent (the host name may serve other sites over plain HTTP, as on Asher).

## Startup refusals

The serving process exits before listening, naming the problem and no value, if any of these holds (Automated):

- **Inherited environment:** `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `POSTGRES_PASSWORD`, `REVIEWER_ACCESS_KEY`, `STAGING_OPERATOR_KEY`, `GOOGLE_CLIENT_*` or any `PG*` variable is set. This refuses known names; it does **not** make the environment clean. Anything else the launching shell exports is still inherited, so only a service definition gives a sanitized environment.
- **Configuration:** the file is not owner-only; it contains the migration credential, Google settings, `PUBLIC_BASE_URL` or the staging key; `DATABASE_URL` does not name `modeling_standard_demo` exactly or has query parameters; `HOST` is not loopback; the origin, key or session length is invalid.
- **State directory:** `REVIEWER_STATE_DIR` is not an existing real directory, owned by this user, mode `0700`, writable, and outside the repository after symlinks resolve.
- **The live database.** Read from the server's catalogs over the serving connection, not from the URL (`src/demo/reviewer-database.ts`):
  - `current_database()` is not exactly `modeling_standard_demo`, or `current_user` is not `session_user`.
  - The role, or any role it can become, has `SUPERUSER`, `CREATEROLE`, `CREATEDB`, `BYPASSRLS` or `REPLICATION`.
  - It is a member of anything but `app_runtime` (including predefined roles such as `pg_read_all_data`), does not inherit `app_runtime`, or holds it with admin option.
  - It owns any database, schema, table or other recorded object.
  - It can create schemas, temporary tables or objects in a schema, or can connect to any other database.
  - Its table privileges differ from the expected set, on any table, including through a grant to `app_runtime` or `PUBLIC`, or it holds a sequence privilege.

The check runs once, at startup. A grant made afterwards is not noticed until the next start. Column-level lists are pinned for migrations by `tests/database/runtime-role.test.ts`; at startup the check confirms only which tables have column UPDATE.

**Why a dedicated PostgreSQL server.** Migration `0002` grants `CONNECT` to `app_runtime` on each database it migrates. A runtime role on a server shared with staging or development databases could therefore connect to them and use its grants there. The boundary refuses that case, and bootstrap refuses to run on such a server.

## Revocation

- **One session:** `POST /reviewer/sign-out` from the gate's page ends it on the server; a copied cookie is dead from then on. Signing in again from a browser holding a session replaces it, and the old token is dead too.
- **Every session:** stop or restart the process. Sessions live only in its memory; there is nothing to clean up and nothing that survives. Rotating the key is the same act: change `REVIEWER_ACCESS_KEY` in the env file and restart.
- **Expiry:** absolute, from sign-in; there is no sliding renewal.
- A reviewer session does not sign the browser out of the demo's own account or operator cookies, but without it none of them reaches the demo (tested). To end those too, use the demo's own sign-out, or restart (operator mode is per-process already).

## Runbook (activation; none of this has been done)

The order matters: **no key reaches a reviewer until the tailnet's wildcard is replaced**, because until then the reviewer's device reaches every port on Asher at least, and every device if the reviewer is a tailnet member rather than a share recipient.

**Identities.** Two, deliberately. The operator (Dustin's account) prepares the database and alone can read the migration credential. `ms-reviewer` serves, holds only the runtime credential, and cannot read anything the operator keeps.

1. **Dedicated PostgreSQL.** A new server, listening on a loopback port no other service uses, holding nothing else. Run [`provision-cluster.sql`](reviewer-access/provision-cluster.sql) once as its superuser, with new random passwords. Keep the superuser password out of every file below.
2. **Bootstrap env file**, operator-owned, `chmod 600`, at `~/.config/modeling-standard/reviewer-bootstrap.env`:
   ```
   DATABASE_URL=postgres://ms_reviewer_runtime:<password>@127.0.0.1:<port>/modeling_standard_demo
   MIGRATION_DATABASE_URL=postgres://ms_reviewer_migrator:<password>@127.0.0.1:<port>/ms_reviewer_admin
   REVIEWER_ANNOTATIONS_OUT_DIR=<operator-owned absolute path outside the repository>
   PORT=<the serving port>
   ```
3. **Prepare the database**, from a checkout, as the operator:
   ```
   node src/scripts/demo-reviewer-bootstrap.ts --confirm modeling_standard_demo
   ```
   **This drops and recreates `modeling_standard_demo`.** It reads only that file (no `.env`, no environment settings), refuses a server holding any other application database, refuses a superuser, refuses while the serving port is in use, and checks the runtime role against the serving boundary afterwards. Do not use `npm run demo:reset`: it reads the repository `.env`, and that is the ordinary demo's database.
4. **Service identity and files** (OS):
   ```
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin ms-reviewer
   sudo install -d -o root -g root -m 755 /opt/modeling-standard   # a root-owned checkout at the reviewed commit, with its dependencies
   sudo install -d -o ms-reviewer -g ms-reviewer -m 700 /etc/ms-reviewer /var/lib/ms-reviewer
   sudo install -o ms-reviewer -g ms-reviewer -m 600 <out dir>/annotations.json /var/lib/ms-reviewer/annotations.json
   ```
5. **Serving env file**, `/etc/ms-reviewer/reviewer.env`, owned by `ms-reviewer`, `chmod 600`:
   ```
   DATABASE_URL=postgres://ms_reviewer_runtime:<password>@127.0.0.1:<port>/modeling_standard_demo
   HOST=127.0.0.1
   PORT=<the serving port>
   LOG_LEVEL=info
   REVIEWER_PUBLIC_ORIGIN=https://<name>.ts.net:<port>
   REVIEWER_ACCESS_KEY=<43 characters; see below>
   REVIEWER_STATE_DIR=/var/lib/ms-reviewer
   # REVIEWER_SESSION_SECONDS=14400
   ```
   Generate the key on the serving machine, out of shell history:
   ```
   node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url") + "\n")' > /dev/tty
   ```
6. **Service.** Review and install [`ms-reviewer.service`](reviewer-access/ms-reviewer.service), then start it. Check the OS list below before going further. The service template has been parsed offline only.
7. **Tailnet.** Follow the [replacement packet](reviewer-access/TAILSCALE-PACKET.md), including its check of what answers on port 8443. Point Serve at the serving port for exactly the configured origin. Never `tailscale serve reset`: it would remove the Options entry. Funnel stays off.
8. **Hand the key** to the reviewer out of band (not in a URL, chat log or screenshot). They open `https://<name>.ts.net:<port>/reviewer`.

**Reset later:** stop the service, repeat step 3, reinstall the annotation file (step 4), start it. Every session ends.

**Without the service** (`npm run demo:reviewer`, under a developer account) it works for checking locally, with none of the isolation above: it can read everything that account can, including `~/.ssh`, cloud credentials and other projects, and it inherits that shell's environment. Do not put it in front of another person's device that way.

## Threat model

| Threat | What stands in the way | Evidence | Residual, honestly |
|---|---|---|---|
| **Compromised reviewer Windows device.** Malware has the browser profile, keystrokes and clipboard, and the device's tailnet identity | Tailnet scope limits it to one port on Asher. The key and session reach only synthetic data. Sessions end on restart | Gate and data scope: Automated. Network scope: **Live, and only after the wildcard is replaced** | It is a full reviewer until revoked: can read, create, edit and finalize invented records and act as the demo operator. It sees the key, so **rotate the key, restart and remove the device**. Under the current wildcard it reaches every port on Asher at least, and the whole tailnet if it is a member's device |
| **Malicious requests:** malformed Host, Origin, paths, bodies; CSRF | Host pinned (421); Origin exact on the gate and every POST (403); bodies capped at 64 KiB (413); strict schemas (400); `SameSite=Lax`; `form-action 'self'` on the gate | Automated | The demo's pages and test issuer are demo-grade. A same-origin script could act; CSP is `script-src 'self'` and the demo's pages are the only same-origin scripts |
| **Stolen, replayed, fixed or revoked sessions** | Opaque server-issued tokens; planted cookies replaced, never adopted; duplicates, bare names, truncated and padded tokens refused; sign-out and re-sign-in kill the old token on the server; restart kills all; absolute expiry | Automated, including across a real process restart | A stolen cookie works until expiry or revocation. No device binding; the bound is the session length |
| **Reviewer-key bypass** | The gate runs before any file, page, annotation, test IdP page or application route; only its own pages and stylesheet precede it. Key only in a same-origin POST body, constant-time, 32 random bytes; no identity header admits anyone | Automated, path by path, GET and non-GET | The key is shared by every reviewer, so nothing tells them apart, and the only way to revoke one holder's key is to rotate it for all. It sits in plain text in the env file |
| **Cross-account and cross-participant access** | Reviewer session is not a principal. The toolkit takes its owner from the session; participant routes are constrained to a person's own party | Automated (HTTP and browser), as on the local demo | **A key holder can become any demo principal:** operator mode and the synthetic professionals need no further proof, by design of the synthetic harness. This keeps honest reviewers apart; it does not contain a hostile one. All of it is invented data |
| **Lateral movement** to SSH, Options, staging or other tailnet services | From a reviewer's device: only the granted port. From the process: the service template confines its sockets to loopback, and a dedicated user holds no SSH keys or tailnet credentials | **Live** and **OS**: neither exercised. Host pin and gate: Automated | **Loopback remains open from the process.** `IPAddressAllow=localhost` does not limit ports, so a compromised process can still connect to staging, Options, `opend` and other PostgreSQL servers on 127.0.0.1, which then need their own authentication. To limit it, add a firewall rule matching the service user and allowing only the database port (`nft`, `meta skuid`). Not provided or tested here. Local users can also reach the serving port directly, where the Host pin and gate still apply |
| **Database escalation** | The startup boundary above refuses anything but the least-privilege role on the exact database; the serving process is refused the migration credential; a dedicated server means no other database to reach | Automated, against real roles (superuser, each attribute, predefined roles, each kind of owner, extra grants) | Checked at startup only. Runtime grants still allow writes to synthetic tables; a key holder can fill them. Bugs in PostgreSQL itself are out of scope |
| **Environment and filesystem secrets** | Settings only from an owner-only file, read through one descriptor, not a symlink; known credential variables refused at startup; messages never echo values; the key is never logged, returned, or placed in a URL or cookie | Those: Automated | **The process can read whatever its user can. No Node code here prevents that.** A clean environment, a read-only repository, a hidden `/home`, a private `/tmp` and one writable directory come only from the service definition (OS, not exercised). The env file is plain text, readable by that user and root, and a compromised process can read the key and the runtime password |
| **Resource exhaustion** | At most 16 open sessions, refused after the key check, recovering on sign-out, expiry or restart; refused-key record bounded by the throttle; 64 KiB body cap; connection, header and request timeouts set on the server; database pool of 10. In the service template: memory, task and file-descriptor ceilings | Session and throttle behaviour: Automated. Server limit values: Automated as set, not load-tested. Ceilings: OS, not exercised | No per-client accounting: the server sees only the proxy's address. **Anyone reaching the gate can hold sign-in at 429** with bad keys, and a key holder can fill the session limit, locking out others until a restart or expiry. A key holder can also grow the database and the annotation file without bound |

## Service prerequisites (OS; none exercised)

Node does not sandbox itself, so these come from the machine. [`ms-reviewer.service`](reviewer-access/ms-reviewer.service) expresses them; it has been parsed, never run. Check each after starting it:

- [ ] A dedicated, unprivileged `ms-reviewer` account: no shell, no home, no other credentials. `systemctl show -p User ms-reviewer` and `ps` confirm it.
- [ ] A sanitized environment: `sudo cat /proc/<pid>/environ | tr '\0' '\n'` shows nothing beyond systemd's own variables and `MS_REVIEWER_ENV_FILE`.
- [ ] A read-only repository owned by root: a write there from the service's namespace fails.
- [ ] One writable path: `/var/lib/ms-reviewer`. `/etc/ms-reviewer` is read-only to the process (`ProtectSystem=strict`).
- [ ] `/home` and `/root` hidden (`ProtectHome=yes`), so the repository must be outside them.
- [ ] Private `/tmp` (`PrivateTmp=yes`) and `NoNewPrivileges=yes`, which `systemctl show` reports.
- [ ] No outbound network but loopback: from the service, a connection to the tailnet address or the internet fails.
- [ ] The demo works under the syscall filter and `ProcSubset=pid`: pages load, a write succeeds. These have not been tried under Node in this application, and may need loosening.

## Not solved here

- **Process and filesystem isolation** is not enforced by this code. It depends on running it as above. Until that is done, nobody should claim it.
- **The proxy and tailnet.** Serve's TLS configuration, the tailnet policy and Funnel's state were not changed or verified. See the packet.
- **Per-port loopback restriction** from the process, as under lateral movement above.
- **Rate limiting by source.** The server sees only the proxy's address and reads no forwarded address (by design), so the throttle is global.
- **CI.** `tests/reviewer-security` needs a superuser on a dedicated server, so CI does not run it. CI does run the configuration, session-limit and grant-set tests and the migration-role refusal.

## Verification

Run on 2026-11-04, on a disposable PostgreSQL on `127.0.0.1:5471` created by `tests/reviewer-security/harness.sh` (data on tmpfs, credentials generated for each run). The security suite runs on a server provisioned with exactly `provision-cluster.sql`, and refuses any other. It has its own config and a `*.security.ts` name, so `npm test` never collects it.

| Command | Result |
|---|---|
| `tests/reviewer-security/harness.sh run npx vitest run --config tests/reviewer-security/vitest.config.ts` | 1 file, 35 tests passed |
| `tests/reviewer-security/harness.sh run npm test` (a fresh server) | 45 files, 688 tests passed |
| `CHROME_PATH=/usr/bin/google-chrome tests/reviewer-security/harness.sh run npm run test:demo` | 6 files, 35 tests passed |
| `npm run check` | exit 0: typecheck, lint, no schema drift, identifiers |
| After the later packet correction (Cory as an exact identity): `tests/unit/reviewer-tailscale-policy.test.ts` alone, with typecheck and lint | 9 tests passed; typecheck and lint exit 0. The full-suite counts in this table predate that correction |
| `npm run build` | exit 0; no `dist/demo`, and no file in `dist` mentions the reviewer |
| `systemd-analyze verify` and `systemd-analyze security --offline=true` on a copy of the template with the node path adjusted | verify exit 0; exposure score 1.1. These read the file: **nothing ran under it** |

What the tests cover:

- `tests/reviewer-security/boundary.security.ts`, real roles and real processes:
  - Bootstrap: exact confirmation; only its own owner-only file; refuses another database on the server, a busy port and a superuser, and drops nothing when it does; succeeds on the dedicated server.
  - The live boundary: passes the provisioned role and a fresh `app_runtime`-only role; refuses the migration role, a superuser, `SET ROLE`, another database, each elevated attribute, an elevated role it can become, predefined roles, each kind of owner, `CREATE` and `TEMPORARY`, `CONNECT` elsewhere, and extra grants directly, through `app_runtime` and through `PUBLIC`.
  - The entry point: exits 1 before listening for an untrusted state directory, the migration credential in the file or inherited, a `PG*` variable, and the migrator or superuser as `DATABASE_URL`, with no secret in its output. Otherwise it serves as the runtime role behind the gate, reading annotations from the state directory, and a real restart ends the session.
- `tests/unit/reviewer-config.test.ts`: origin parsing; key format; refusal of Google, `PUBLIC_BASE_URL`, the migration credential, the staging key, any database but the demo's, query parameters, non-loopback `HOST`, bad session lengths and bad state directories; inherited variables; the state directory on disk, including through a symlinked parent into the repository; server limits as set; each boundary decision; bootstrap settings. No value echoed.
- `tests/http/reviewer.test.ts`, over real HTTP through the real wiring: every protected path before sign-in; Host pinned before the gate; forged identity headers admit nothing; every bad key and origin refused; cookie flags exact; forged, chosen, duplicated, bare-named, truncated and planted cookies refused; sign-out, expiry and `revokeAll`; the throttle and its recovery; **the session limit, refused after the key check, with open sessions unaffected, recovery on sign-out and expiry, and re-sign-in holding one slot**; **the migrated schema's runtime grants matching the boundary's expected set**, so a migration that changes them fails here; the migration role refused by what it is; inside, the local shape, cookie rules, origin rule and two reviewers kept apart.
- `tests/unit/reviewer-tailscale-policy.test.ts`: the replacement policy's shape, and refusal of a wildcard, any widening of the reviewer's grant, Funnel, reviewer SSH, dropped tests and an unfilled copy. Offline structure only.
- `tests/demo-browser/reviewer.test.ts`, Chrome through a local HTTPS proxy with a per-run certificate that forges forwarding and Tailscale headers: kept out without the key, two phones signing in and kept apart, sign-out and revocation mid-session. It uses the gate and server directly, not the entry point.
- The existing suites still pass, including S13 staging's. `src/demo/staging.ts` was not changed.

## Live and OS checks not done

- Everything in the service prerequisites list.
- Everything in the [live test matrix](reviewer-access/TAILSCALE-PACKET.md#live-test-matrix-none-of-this-has-been-run), including Tailscale's acceptance of the policy.
- That Serve forwards the exact `Host` the browser sends on the chosen port (S13 observed this for staging's entry, not this one).
- That the reviewer's real device accepts the tailnet certificate and reaches the gate.
- The key hand-off and the reviewer's first sign-in.
