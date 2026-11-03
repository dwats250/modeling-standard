import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { ConfigError, loadAppConfig, type AppConfig } from '../config/config.ts';
import { clearCookie, cookieValues, serializeCookie } from '../http/cookies.ts';
import { newToken, sameDigest, tokenDigest } from '../infrastructure/tokens.ts';
import { DEMO_DATABASE, isLoopbackHost } from './demo.ts';
import { STAGING_DATABASE, readOwnerOnlyEnvFile } from './staging.ts';

/**
 * Reviewer mode: the local synthetic demo, reachable over HTTPS through a
 * local TLS reverse proxy (Tailscale Serve, or any proxy on the same
 * machine), behind its own sign-in. It exists so a reviewer on another
 * device can see what is built. It is not staging, not production, and not
 * a product flow: the same invented records, the same local test identity
 * provider, the same `modeling_standard_demo` database as `npm run demo`.
 *
 * Three boundaries, each independent of the others:
 *
 * 1. **The network** (outside this code): who can reach the proxy at all.
 *    Nothing here reads a `Tailscale-User-*`, `X-Forwarded-*` or `Forwarded`
 *    header; the demo server forwards none to the application, and this
 *    module never looks at them. Being on the tailnet is not being signed in.
 * 2. **The reviewer gate** (this module): before any demo page, static file,
 *    test sign-in page or application route is served, the browser must hold
 *    a reviewer session, obtained by posting the configured access key to
 *    the gate's own page. The key is a high-entropy token compared in
 *    constant time; it is accepted only in a same-origin POST body, never a
 *    query string, and is never stored, logged or echoed.
 * 3. **The demo's own principals** (unchanged): a reviewer session says only
 *    that this browser may see the demo. Which synthetic professional,
 *    signed-in test person or operator the browser then is comes from the
 *    demo's own cookies, exactly as on the local demo.
 *
 * Reviewer sessions are opaque 32-byte tokens held only in an `HttpOnly`,
 * `Secure`, `SameSite=Lax`, `__Host-` cookie; the server keeps only their
 * digests, in memory, with an absolute expiry. Revocation: signing out ends
 * one; restarting the process ends all (there is no persistent store to
 * leak or to forget). Rotating the key means restarting with the new key,
 * which also ends every session issued under the old one.
 */

export const REVIEWER_COOKIE = 'ms_reviewer';
export const DEFAULT_REVIEWER_ENV_FILE = join(homedir(), '.config', 'modeling-standard', 'reviewer.env');
const DEFAULT_SESSION_SECONDS = 4 * 60 * 60;
const MIN_SESSION_SECONDS = 60;
const MAX_SESSION_SECONDS = 12 * 60 * 60;
/** After this many refused keys within the window, sign-in answers 429 without looking at the key. */
const FAILURE_LIMIT = 10;
const FAILURE_WINDOW_MS = 60_000;
const MAX_KEY_LENGTH = 256;

export interface ReviewerConfig {
  readonly app: AppConfig;
  /** The exact public origin (`https://host[:port]`), as a browser spells it. */
  readonly publicOrigin: string;
  /** The exact Host header the proxy forwards for that origin (`host[:port]`). */
  readonly publicAuthority: string;
  readonly accessKey: string;
  readonly sessionSeconds: number;
}

/**
 * Validates reviewer mode's settings. Everything that matters is required and
 * exact; anything that would make this staging or production is refused.
 * Messages name the setting and the problem, never a value.
 */
export function loadReviewerConfig(env: Readonly<Record<string, string | undefined>>): ReviewerConfig {
  const problems: string[] = [];
  let app: AppConfig | undefined;
  try {
    app = loadAppConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    problems.push(...error.problems);
  }
  if (app) {
    if (!isLoopbackHost(app.host)) problems.push('HOST: reviewer mode listens on loopback only (the HTTPS proxy is in front of it)');
    if (app.google !== null) problems.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: must not be set in reviewer mode (local test sign-in only)');
    if (app.publicOrigin !== null) problems.push('PUBLIC_BASE_URL: must not be set in reviewer mode; set REVIEWER_PUBLIC_ORIGIN');
    if (namesDatabase(app.databaseUrl, STAGING_DATABASE)) problems.push(`DATABASE_URL: must not name ${STAGING_DATABASE}; reviewer mode uses ${DEMO_DATABASE} only`);
  }
  if (env.MIGRATION_DATABASE_URL !== undefined && env.MIGRATION_DATABASE_URL !== '') {
    problems.push('MIGRATION_DATABASE_URL: must not be set in reviewer mode (the serving process never holds the migration credential)');
  }
  if (env.STAGING_OPERATOR_KEY !== undefined && env.STAGING_OPERATOR_KEY !== '') problems.push('STAGING_OPERATOR_KEY: must not be set in reviewer mode');

  let publicOrigin = '';
  let publicAuthority = '';
  const origin = parseExactHttpsOrigin(env.REVIEWER_PUBLIC_ORIGIN);
  if (origin === null) problems.push('REVIEWER_PUBLIC_ORIGIN: must be an exact https:// origin (scheme, host and optional port; no path, query, fragment or credentials)');
  else ({ publicOrigin, publicAuthority } = origin);

  const accessKey = env.REVIEWER_ACCESS_KEY ?? '';
  // The format is checked exactly; randomness cannot be, but a hand-typed or
  // patterned value (few distinct characters) is refused.
  if (tokenDigest(accessKey) === null || new Set(accessKey).size < 16) {
    problems.push('REVIEWER_ACCESS_KEY: must be 32 random bytes as unpadded base64url (43 characters); generate it as the runbook says');
  }

  let sessionSeconds = DEFAULT_SESSION_SECONDS;
  const configuredSeconds = env.REVIEWER_SESSION_SECONDS;
  if (configuredSeconds !== undefined && configuredSeconds !== '') {
    if (!/^\d{1,6}$/.test(configuredSeconds) || Number(configuredSeconds) < MIN_SESSION_SECONDS || Number(configuredSeconds) > MAX_SESSION_SECONDS) {
      problems.push(`REVIEWER_SESSION_SECONDS: must be a whole number of seconds between ${MIN_SESSION_SECONDS} and ${MAX_SESSION_SECONDS}`);
    } else {
      sessionSeconds = Number(configuredSeconds);
    }
  }

  if (problems.length > 0 || !app) throw new ConfigError(problems);
  return { app, publicOrigin, publicAuthority, accessKey, sessionSeconds };
}

/** `https://host[:port]` exactly, or null. */
export function parseExactHttpsOrigin(value: string | undefined): { publicOrigin: string; publicAuthority: string } | null {
  if (typeof value !== 'string' || value === '') return null;
  // No whitespace, no wildcard, nothing the URL parser would quietly repair.
  if (/[\s*\\]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (value.endsWith('?') || value.endsWith('#')) return null;
  if (url.hostname === '' || url.origin !== value.replace(/\/$/, '')) return null;
  return { publicOrigin: url.origin, publicAuthority: url.host };
}

function namesDatabase(url: string, database: string): boolean {
  try {
    return new URL(url).pathname === `/${database}`;
  } catch {
    return false;
  }
}

/** Reads and validates reviewer mode's owner-only env file. */
export function loadReviewerConfigFromFile(path: string | undefined): ReviewerConfig {
  return loadReviewerConfig(readOwnerOnlyEnvFile(path || DEFAULT_REVIEWER_ENV_FILE, 'reviewer env file'));
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

const PAGE_HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'none'; img-src 'self' data:; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  // Not no-referrer: under it a browser sends `Origin: null` with the form's
  // POST and the sign-in would be refused. same-origin sends nothing elsewhere.
  'referrer-policy': 'same-origin',
  'cache-control': 'no-store',
};

/** Pages whose unauthenticated GET is sent to the gate instead of answered 401 (top-level navigations). */
const NAVIGATION_PATHS = new Set(['/', '/inspector', '/test-idp/authorize']);

export interface ReviewerGateOptions {
  readonly publicOrigin: string;
  readonly accessKey: string;
  readonly sessionSeconds?: number;
  /** For tests: the clock. */
  readonly now?: () => number;
  /** Where refusals are counted (no key, no token, no cookie value is ever logged). */
  readonly warn?: (message: string) => void;
}

interface ReviewerSession {
  readonly expiresAt: number;
}

export interface ReviewerGate {
  /** True if the request carries exactly one valid, unexpired reviewer session. */
  isSignedIn(request: IncomingMessage): boolean;
  /** Serves `/reviewer`, `/reviewer/sign-in` and `/reviewer/sign-out`. False if the path is not the gate's. */
  handle(request: IncomingMessage, response: ServerResponse, body: Buffer | null): Promise<boolean>;
  /** Refuses a request that is not signed in: a redirect to the gate for a page, 401 otherwise. */
  refuse(request: IncomingMessage, response: ServerResponse): void;
  /** Ends every reviewer session (what a restart does). */
  revokeAll(): void;
  /** Open sessions (for tests and the runbook's accounting). */
  readonly size: number;
}

export function createReviewerGate(options: ReviewerGateOptions): ReviewerGate {
  const expectedDigest = tokenDigest(options.accessKey);
  if (expectedDigest === null) throw new Error('the reviewer access key must be a canonical token');
  const expected: Buffer = expectedDigest;
  const sessionSeconds = options.sessionSeconds ?? DEFAULT_SESSION_SECONDS;
  const now = options.now ?? Date.now;
  const warn = options.warn ?? (() => {});
  const sessions = new Map<string, ReviewerSession>();
  const failures: number[] = [];

  const prune = (): void => {
    const at = now();
    for (const [digest, session] of sessions) if (session.expiresAt <= at) sessions.delete(digest);
  };

  /** The session a Cookie header names, if exactly one valid cookie names an open one. */
  const sessionFor = (header: string | undefined): string | null => {
    const values = cookieValues(header, REVIEWER_COOKIE, true);
    if (values.length !== 1) return null;
    const digest = tokenDigest(values[0]);
    if (digest === null) return null;
    const key = digest.toString('hex');
    const session = sessions.get(key);
    if (!session) return null;
    if (session.expiresAt <= now()) {
      sessions.delete(key);
      return null;
    }
    return key;
  };

  const sameOrigin = (request: IncomingMessage): boolean => request.headers.origin === options.publicOrigin;

  const throttled = (): boolean => {
    const since = now() - FAILURE_WINDOW_MS;
    while (failures.length > 0 && failures[0]! < since) failures.shift();
    return failures.length >= FAILURE_LIMIT;
  };

  function page(response: ServerResponse, status: number, title: string, body: string, cookies: string[] = []): void {
    response.writeHead(status, { ...PAGE_HEADERS, 'content-type': 'text/html; charset=utf-8', ...(cookies.length ? { 'set-cookie': cookies } : {}) });
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${escape(title)}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/reviewer.css"></head>` +
        `<body class="reviewer"><main class="reviewer-main">${body}</main></body></html>`,
    );
  }

  const signInForm = (notice: string | null) =>
    `<section class="reviewer-card" data-reviewer="sign-in">` +
      `<p class="reviewer-eyebrow">Modeling Standard — synthetic demo, reviewer access</p>` +
      `<h1>Reviewer sign-in</h1>` +
      (notice ? `<p class="reviewer-notice" role="alert">${escape(notice)}</p>` : '') +
      `<p class="reviewer-muted">Everything behind this page is invented: synthetic people, synthetic shoots, a local test sign-in that is not Google or Apple. Nothing here is real use.</p>` +
      `<form method="post" action="/reviewer/sign-in" class="reviewer-form">` +
      `<label for="reviewer-key">Reviewer access key</label>` +
      `<input id="reviewer-key" name="key" type="password" autocomplete="off" spellcheck="false" maxlength="${MAX_KEY_LENGTH}" required>` +
      `<button type="submit">Continue</button>` +
      `</form></section>`;

  const signedInPage = () =>
    `<section class="reviewer-card" data-reviewer="signed-in">` +
      `<p class="reviewer-eyebrow">Modeling Standard — synthetic demo, reviewer access</p>` +
      `<h1>Signed in as a reviewer</h1>` +
      `<p class="reviewer-muted">This browser may open the synthetic demo until the reviewer session expires or you sign out. Who you are inside the demo (a synthetic professional, a test person, the operator) is chosen separately, on the demo's own screens.</p>` +
      `<p><a class="reviewer-link" href="/">Open the demo</a></p>` +
      `<form method="post" action="/reviewer/sign-out" class="reviewer-form"><button type="submit" class="reviewer-secondary">Sign out of reviewer access</button></form>` +
      `</section>`;

  function refusedSignIn(response: ServerResponse, status: number, notice: string): void {
    page(response, status, 'Reviewer sign-in refused', signInForm(notice));
  }

  async function handle(request: IncomingMessage, response: ServerResponse, body: Buffer | null): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'https://reviewer.invalid');
    const method = request.method ?? 'GET';
    if (url.pathname === '/reviewer') {
      if (method !== 'GET') {
        page(response, 405, 'Method not allowed', signInForm('That request is not one this page accepts.'));
        return true;
      }
      if (sessionFor(request.headers.cookie) !== null) page(response, 200, 'Reviewer access', signedInPage());
      else page(response, 200, 'Reviewer sign-in', signInForm(null));
      return true;
    }
    if (url.pathname === '/reviewer/sign-in') {
      if (method !== 'POST') {
        page(response, 405, 'Method not allowed', signInForm(null));
        return true;
      }
      // Same origin, exactly, before the body is looked at: a cross-site
      // form or a request with no Origin never reaches the key check.
      if (!sameOrigin(request)) {
        warn('reviewer sign-in refused: origin');
        refusedSignIn(response, 403, 'This sign-in did not come from the demo’s own page. Open the demo address directly and try again.');
        return true;
      }
      // The key travels only in the body. One in the query string is refused unread.
      if (url.search !== '') {
        refusedSignIn(response, 400, 'Enter the key in the form, not the address.');
        return true;
      }
      if (throttled()) {
        warn('reviewer sign-in refused: too many attempts');
        refusedSignIn(response, 429, 'Too many refused attempts. Wait a minute and try again.');
        return true;
      }
      const form = new URLSearchParams(body?.toString('utf8') ?? '');
      const presentedKey = form.get('key') ?? '';
      // Constant-time on the digest; a malformed key is compared too (against
      // a digest it cannot equal), so its shape leaks nothing by timing.
      const presented = presentedKey.length <= MAX_KEY_LENGTH ? (tokenDigest(presentedKey) ?? Buffer.alloc(expected.length)) : Buffer.alloc(expected.length);
      if (!sameDigest(presented, expected)) {
        failures.push(now());
        warn('reviewer sign-in refused: key');
        refusedSignIn(response, 403, 'That key was not accepted.');
        return true;
      }
      failures.length = 0;
      prune();
      const { token, digest } = newToken();
      sessions.set(digest.toString('hex'), { expiresAt: now() + sessionSeconds * 1000 });
      response.writeHead(303, {
        ...PAGE_HEADERS,
        location: '/',
        'set-cookie': [serializeCookie({ name: REVIEWER_COOKIE, value: token, maxAge: sessionSeconds, path: '/', sameSite: 'Lax' }, true)],
      });
      response.end();
      return true;
    }
    if (url.pathname === '/reviewer/sign-out') {
      if (method !== 'POST') {
        page(response, 405, 'Method not allowed', signInForm(null));
        return true;
      }
      if (!sameOrigin(request)) {
        page(response, 403, 'Reviewer access', signedInPage());
        return true;
      }
      const key = sessionFor(request.headers.cookie);
      if (key !== null) sessions.delete(key);
      response.writeHead(303, { ...PAGE_HEADERS, location: '/reviewer', 'set-cookie': [serializeCookie(clearCookie(REVIEWER_COOKIE), true)] });
      response.end();
      return true;
    }
    return false;
  }

  function refuse(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? '/', 'https://reviewer.invalid');
    if ((request.method ?? 'GET') === 'GET' && NAVIGATION_PATHS.has(url.pathname)) {
      response.writeHead(303, { ...PAGE_HEADERS, location: '/reviewer' });
      response.end();
      return;
    }
    response.writeHead(401, { ...PAGE_HEADERS, 'content-type': 'application/json; charset=utf-8' });
    response.end('{"error":{"code":"reviewer_sign_in_required"}}');
  }

  return {
    isSignedIn: (request) => sessionFor(request.headers.cookie) !== null,
    handle,
    refuse,
    revokeAll: () => sessions.clear(),
    get size() {
      prune();
      return sessions.size;
    },
  };
}
