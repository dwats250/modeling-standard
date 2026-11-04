import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { createDemoApplication, type DemoApplication } from '../../src/demo/application.ts';
import { databaseBoundaryProblems, readDatabaseBoundaryFacts } from '../../src/demo/reviewer-database.ts';
import { REVIEWER_COOKIE, REVIEWER_MAX_SESSIONS, createReviewerGate, type ReviewerGate } from '../../src/demo/reviewer.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';
import { LogCapture } from '../support/app.ts';

/**
 * Reviewer mode over real HTTP, through the real wiring (`createDemoApplication`
 * with reviewer settings, `createReviewerGate`, `createDemoServer` with the
 * pinned public authority), as `npm run demo:reviewer` serves it behind the
 * local HTTPS proxy. Each `Browser` is one browser behind that proxy: it
 * sends the public Host and its own Origin, and keeps its own cookies.
 *
 * Everything here is negative unless it says otherwise: the point is what is
 * refused, before what, and with what left behind (nothing).
 */

const PUBLIC_ORIGIN = 'https://review.example.invalid:8444';
const PUBLIC_HOST = 'review.example.invalid:8444';
const ACCESS_KEY = newToken().token;
const SESSION_SECONDS = 600;
const WIRE_COOKIE = `__Host-${REVIEWER_COOKIE}`;

let database: DatabaseHandle;
let demo: DemoApplication;
let gate: ReviewerGate;
let server: Server;
let port: number;
const logs = new LogCapture();
const warnings: string[] = [];
/** The gate's clock, movable by tests. */
const clock = { offset: 0 };

beforeAll(async () => {
  const logger = createLogger('info', logs);
  database = openDatabase(inject('runtimeUrl'), logger);
  const store = temporaryAnnotationStore();
  demo = await createDemoApplication({ db: database.db, logger, annotations: store, reviewer: { publicOrigin: PUBLIC_ORIGIN } });
  gate = createReviewerGate({ publicOrigin: PUBLIC_ORIGIN, accessKey: ACCESS_KEY, sessionSeconds: SESSION_SECONDS, now: () => Date.now() + clock.offset, warn: (m) => warnings.push(m) });
  server = createDemoServer({ app: demo.app, annotations: store, publicAuthority: PUBLIC_HOST, testIssuer: demo.issuer, reviewer: gate });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
});

// Each test starts past the previous one's refusal window, so one test's
// refused keys never throttle the next.
beforeEach(() => {
  clock.offset += 61_000;
});

afterAll(async () => {
  server?.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await demo.app.close();
  await database.close();
});

interface Res {
  status: number;
  body: string;
  location: string | null;
  setCookies: string[];
  headers: Record<string, string | string[] | undefined>;
  json: <T = Record<string, unknown>>() => T;
}

type RequestOptions = { json?: unknown; form?: Record<string, string>; headers?: Record<string, string>; origin?: string | null; raw?: string };

/** One browser behind the proxy. Node's http client, so the Host header is exactly what we say. */
class Browser {
  readonly jar = new Map<string, { value: string; path: string }>();
  readonly origin: string | null;
  readonly host: string;
  constructor(origin: string | null = PUBLIC_ORIGIN, host: string = PUBLIC_HOST) {
    this.origin = origin;
    this.host = host;
  }

  cookieHeader(): string | undefined {
    return this.jar.size ? [...this.jar].map(([n, c]) => `${n}=${c.value}`).join('; ') : undefined;
  }

  request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, options: RequestOptions = {}): Promise<Res> {
    const headers: Record<string, string> = { host: this.host, ...(options.headers ?? {}) };
    const cookie = this.cookieHeader();
    if (cookie && headers.cookie === undefined) headers.cookie = cookie;
    const origin = options.origin === undefined ? this.origin : options.origin;
    if (method !== 'GET' && origin !== null) headers.origin = origin;
    let body: string | undefined;
    if (options.raw !== undefined) body = options.raw;
    else if (options.form !== undefined) {
      body = new URLSearchParams(options.form).toString();
      headers['content-type'] ??= 'application/x-www-form-urlencoded';
    } else if (options.json !== undefined || method === 'POST') body = JSON.stringify(options.json ?? {});
    if (body !== undefined && headers['content-type'] === undefined) headers['content-type'] = 'application/json';
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, method, path, headers, setHost: false }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const setCookies = res.headers['set-cookie'] ?? [];
          for (const line of setCookies) {
            const [pair, ...attrs] = line.split(';').map((p) => p.trim());
            const name = pair!.slice(0, pair!.indexOf('='));
            const value = pair!.slice(pair!.indexOf('=') + 1);
            const cpath = attrs.find((a) => a.startsWith('Path='))?.slice(5) ?? '/';
            if (attrs.includes('Max-Age=0')) this.jar.delete(name);
            else this.jar.set(name, { value, path: cpath });
          }
          resolve({
            status: res.statusCode ?? 0,
            body: text,
            location: typeof res.headers.location === 'string' ? res.headers.location : null,
            setCookies,
            headers: res.headers,
            json: <T,>() => JSON.parse(text) as T,
          });
        });
      });
      req.on('error', reject);
      if (body !== undefined) req.write(body);
      req.end();
    });
  }

  get = (path: string, options?: RequestOptions) => this.request('GET', path, options);
  post = (path: string, json: unknown = {}, options: RequestOptions = {}) => this.request('POST', path, { ...options, json });
  signIn = (key: string = ACCESS_KEY, options: RequestOptions = {}) => this.request('POST', '/reviewer/sign-in', { form: { key }, ...options });
}

/** A browser that has signed in as a reviewer. */
async function reviewer(): Promise<Browser> {
  const b = new Browser();
  const res = await b.signIn();
  expect(res.status).toBe(303);
  return b;
}

const PROTECTED_PATHS = ['/', '/inspector', '/journey.js', '/journey.css', '/app.js', '/toolkit.js', '/annotations.json', '/media/fixtures/anything.svg', '/health', '/demo/environment', '/demo/projects', '/me/profile', '/test-idp/authorize?response_type=code', '/nothing-here'];

describe('the reviewer gate: nothing before sign-in', () => {
  it('serves only its own page and stylesheet to a browser without a reviewer session', async () => {
    const b = new Browser();
    expect((await b.get('/reviewer')).status).toBe(200);
    expect((await b.get('/reviewer')).body).toContain('data-reviewer="sign-in"');
    expect((await b.get('/reviewer.css')).headers['content-type']).toMatch(/^text\/css/);
    for (const path of PROTECTED_PATHS) {
      const res = await b.get(path);
      const navigation = ['/', '/inspector', '/test-idp/authorize?response_type=code'].includes(path);
      expect({ path, status: res.status, location: res.location }).toEqual({ path, status: navigation ? 303 : 401, location: navigation ? '/reviewer' : null });
      if (!navigation) expect(res.json<{ error: { code: string } }>().error.code).toBe('reviewer_sign_in_required');
      expect(res.setCookies).toEqual([]);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    // Writes too, whatever they carry: refused by the gate, before the application sees them.
    for (const path of ['/demo/operator', '/demo/toolkit/owner', '/sign-in/start', '/test-idp/approve', '/me/profile', '/demo/shoots/scenarios']) {
      const res = await b.post(path, { owner: 'a', card: 'unresolved' });
      expect({ path, status: res.status }).toEqual({ path, status: 401 });
    }
    expect((await b.request('PUT', '/me/profile')).status).toBe(401);
    expect((await b.request('DELETE', '/me/profile')).status).toBe(401);
  });

  it('pins the Host header to the public authority exactly, before the gate', async () => {
    for (const host of ['127.0.0.1', `127.0.0.1:${port}`, 'localhost', 'review.example.invalid', 'review.example.invalid:443', 'review.example.invalid:8444.evil', 'evil.example', '', 'review.example.invalid.:8444', 'review.example.invalid:8444:8444']) {
      for (const path of ['/reviewer', '/']) {
        const res = await new Browser(PUBLIC_ORIGIN, host).get(path);
        expect({ host, path, status: res.status }).toEqual({ host, path, status: 421 });
      }
      expect((await new Browser(PUBLIC_ORIGIN, host).signIn()).status).toBe(421);
    }
    expect((await new Browser(PUBLIC_ORIGIN, PUBLIC_HOST.toUpperCase()).get('/reviewer')).status).toBe(200);
  });

  it('reads no forwarding or Tailscale identity header: none admits a wrong Host, supplies an Origin, or signs anyone in', async () => {
    const forged = {
      'x-forwarded-host': PUBLIC_HOST,
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '100.64.0.1',
      forwarded: `host=${PUBLIC_HOST};proto=https`,
      'tailscale-user-login': 'reviewer@example.com',
      'tailscale-user-name': 'A Reviewer',
      'tailscale-user-profile-pic': 'https://example.invalid/pic',
      'x-tailscale-user': 'reviewer@example.com',
      'x-reviewer': 'true',
      'x-reviewer-key': ACCESS_KEY,
      authorization: `Bearer ${ACCESS_KEY}`,
    };
    expect((await new Browser(PUBLIC_ORIGIN, 'evil.example').get('/reviewer', { headers: forged })).status).toBe(421);
    for (const path of ['/', '/demo/environment', '/me/profile']) {
      const res = await new Browser().get(path, { headers: forged });
      expect([303, 401]).toContain(res.status);
    }
    // Headers that say "already a reviewer" are not a sign-in; only the key in the form is.
    expect((await new Browser(null).signIn(ACCESS_KEY, { headers: forged })).status).toBe(403);
    expect((await new Browser().signIn('', { headers: forged })).status).toBe(403);
  });
});

describe('reviewer sign-in', () => {
  it('refuses a wrong, malformed, oversized, empty or missing key with the same 403, sets no cookie, logs no key', async () => {
    for (const key of [newToken().token, ACCESS_KEY.slice(0, -1), `${ACCESS_KEY}=`, ACCESS_KEY.toUpperCase(), ACCESS_KEY.toLowerCase(), ` ${ACCESS_KEY}`, 'x'.repeat(43), 'x'.repeat(256), 'x'.repeat(10_000), '']) {
      if (key === ACCESS_KEY) continue;
      clock.offset += 61_000; // past the refusal window: each key is judged, not throttled
      const b = new Browser();
      const res = await b.signIn(key);
      expect(res.status).toBe(403);
      expect(res.setCookies).toEqual([]);
      expect(res.body).toContain('data-reviewer="sign-in"');
      expect(res.body).not.toContain(key.trim() || 'never');
      expect(b.jar.size).toBe(0);
      expect((await b.get('/demo/environment')).status).toBe(401);
    }
    const missing = await new Browser().request('POST', '/reviewer/sign-in', { form: { other: ACCESS_KEY } });
    expect(missing.status).toBe(403);
    const asJson = await new Browser().post('/reviewer/sign-in', { key: ACCESS_KEY });
    expect(asJson.status).toBe(403);
    expect(asJson.setCookies).toEqual([]);
    expect(logs.text()).not.toContain(ACCESS_KEY);
    expect(warnings.every((w) => !w.includes(ACCESS_KEY))).toBe(true);
    warnings.length = 0;
  });

  it('accepts the key only in a same-origin POST body: query string, GET, other origin, missing origin and null origin are refused unread', async () => {
    warnings.length = 0;
    const query = await new Browser().request('POST', `/reviewer/sign-in?key=${ACCESS_KEY}`, { form: { key: ACCESS_KEY } });
    expect(query.status).toBe(400);
    expect(query.setCookies).toEqual([]);
    expect((await new Browser().get(`/reviewer/sign-in?key=${ACCESS_KEY}`)).status).toBe(405);
    expect((await new Browser().get(`/reviewer?key=${ACCESS_KEY}`)).setCookies).toEqual([]);
    for (const origin of ['https://evil.example', 'http://review.example.invalid:8444', 'https://review.example.invalid', 'https://review.example.invalid:8444/', 'https://review.example.invalid:8444.evil', 'null', '', null]) {
      const res = await new Browser(origin).signIn();
      expect({ origin, status: res.status }).toEqual({ origin, status: 403 });
      expect(res.setCookies).toEqual([]);
    }
    expect(warnings.filter((w) => w.endsWith('origin')).length).toBe(8);
    warnings.length = 0;
  });

  it('with the right key: an opaque, Secure, HttpOnly, SameSite=Lax, __Host- cookie that is not the key, and the demo opens', async () => {
    const b = new Browser();
    const res = await b.signIn();
    expect(res.status).toBe(303);
    expect(res.location).toBe('/');
    expect(res.setCookies).toHaveLength(1);
    expect(res.setCookies[0]).toMatch(new RegExp(`^${WIRE_COOKIE}=[A-Za-z0-9_-]{43}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; SameSite=Lax; Secure$`));
    expect(res.setCookies[0]).not.toContain(ACCESS_KEY);
    expect(res.body).toBe('');
    expect((await b.get('/')).status).toBe(200);
    expect((await b.get('/reviewer')).body).toContain('data-reviewer="signed-in"');
    const env = await b.get('/demo/environment');
    expect(env.status).toBe(200);
    expect(env.json()).toEqual({ environment: 'local', providers: ['test'], operatorKeyRequired: false });
    expect((await b.get('/health')).status).toBe(200);
    // Not signed in to the demo itself: the reviewer session is not a principal.
    expect((await b.get('/demo/projects')).status).toBe(401);
    expect((await b.get('/me/profile')).status).toBe(401);
    expect((await b.get('/demo/toolkit/owner')).json()).toEqual({ mode: 'none', owner: null, label: null });
  });

  it('a reviewer session cannot be forged, chosen, or fixed: only a server-issued token works, once per cookie', async () => {
    const real = await reviewer();
    const token = real.jar.get(WIRE_COOKIE)!.value;
    const attempts: Record<string, string> = {
      'a canonical token nobody issued': `${WIRE_COOKIE}=${newToken().token}`,
      'the access key as the cookie': `${WIRE_COOKIE}=${ACCESS_KEY}`,
      'the bare cookie name': `${REVIEWER_COOKIE}=${token}`,
      'the token twice': `${WIRE_COOKIE}=${token}; ${WIRE_COOKIE}=${token}`,
      'the token beside a forged one': `${WIRE_COOKIE}=${token}; ${WIRE_COOKIE}=${newToken().token}`,
      'a truncated token': `${WIRE_COOKIE}=${token.slice(0, -1)}`,
      'a padded token': `${WIRE_COOKIE}=${token}=`,
      'an empty value': `${WIRE_COOKIE}=`,
    };
    for (const [label, cookie] of Object.entries(attempts)) {
      const res = await new Browser().get('/demo/environment', { headers: { cookie } });
      expect({ label, status: res.status }).toEqual({ label, status: 401 });
    }
    // Fixation: a cookie value an attacker planted before sign-in is replaced, never adopted.
    const victim = new Browser();
    const planted = newToken().token;
    victim.jar.set(WIRE_COOKIE, { value: planted, path: '/' });
    const res = await victim.signIn();
    expect(res.status).toBe(303);
    expect(victim.jar.get(WIRE_COOKIE)!.value).not.toBe(planted);
    expect((await new Browser().get('/demo/environment', { headers: { cookie: `${WIRE_COOKIE}=${planted}` } })).status).toBe(401);
  });

  it('sign-out ends that session on the server: the token is dead even if a copy is kept', async () => {
    const b = await reviewer();
    const token = b.jar.get(WIRE_COOKIE)!.value;
    const copy = new Browser();
    copy.jar.set(WIRE_COOKIE, { value: token, path: '/' });
    expect((await copy.get('/demo/environment')).status).toBe(200);
    // Sign-out needs the same origin too.
    expect((await b.request('POST', '/reviewer/sign-out', { origin: 'https://evil.example', raw: '' })).status).toBe(403);
    expect((await copy.get('/demo/environment')).status).toBe(200);
    const out = await b.request('POST', '/reviewer/sign-out', { raw: '' });
    expect(out.status).toBe(303);
    expect(out.location).toBe('/reviewer');
    expect(out.setCookies[0]).toMatch(new RegExp(`^${WIRE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure$`));
    expect(b.jar.has(WIRE_COOKIE)).toBe(false);
    expect((await copy.get('/demo/environment')).status).toBe(401);
    expect((await copy.get('/')).location).toBe('/reviewer');
  });

  it('sessions expire absolutely, and revoking all (what a restart does) ends every session at once', async () => {
    const a = await reviewer();
    const b = await reviewer();
    expect(gate.size).toBeGreaterThanOrEqual(2);
    const base = clock.offset;
    clock.offset = base + (SESSION_SECONDS - 1) * 1000;
    expect((await a.get('/demo/environment')).status).toBe(200);
    clock.offset = base + SESSION_SECONDS * 1000;
    expect((await a.get('/demo/environment')).status).toBe(401);
    clock.offset = base;
    expect((await b.get('/demo/environment')).status).toBe(200);
    gate.revokeAll();
    expect(gate.size).toBe(0);
    expect((await b.get('/demo/environment')).status).toBe(401);
    expect((await a.get('/demo/environment')).status).toBe(401);
    // Signing in again works: revocation revokes sessions, not the key.
    expect((await reviewer()).jar.has(WIRE_COOKIE)).toBe(true);
  });

  it('after ten refused keys in a minute, sign-in answers 429 without looking at the key, then recovers', async () => {
    for (let i = 0; i < 10; i += 1) expect((await new Browser().signIn(newToken().token)).status).toBe(403);
    expect((await new Browser().signIn()).status).toBe(429);
    expect((await new Browser().signIn()).setCookies).toEqual([]);
    clock.offset += 61_000;
    expect((await new Browser().signIn()).status).toBe(303);
    expect((await new Browser().signIn()).status).toBe(303);
  });
});

describe('the limit on open reviewer sessions', () => {
  it('at the limit a right key is refused and leaves nothing behind; open sessions keep working; a sign-out frees one slot', async () => {
    gate.revokeAll();
    const open: Browser[] = [];
    for (let i = 0; i < REVIEWER_MAX_SESSIONS; i += 1) open.push(await reviewer());
    expect(gate.size).toBe(REVIEWER_MAX_SESSIONS);

    const extra = new Browser();
    const refused = await extra.signIn();
    expect(refused.status).toBe(503);
    expect(refused.setCookies).toEqual([]);
    expect(refused.body).not.toContain(ACCESS_KEY);
    expect(gate.size).toBe(REVIEWER_MAX_SESSIONS);
    expect(warnings).toContain('reviewer sign-in refused: session limit');
    // Being full says nothing to someone without the key.
    expect((await new Browser().signIn(newToken().token)).status).toBe(403);
    for (const b of open) expect((await b.get('/demo/environment')).status).toBe(200);

    expect((await open[0]!.request('POST', '/reviewer/sign-out', { raw: '' })).status).toBe(303);
    expect(gate.size).toBe(REVIEWER_MAX_SESSIONS - 1);
    expect((await extra.signIn()).status).toBe(303);
    expect((await extra.get('/demo/environment')).status).toBe(200);
    expect((await new Browser().signIn()).status).toBe(503);
    gate.revokeAll();
  });

  it('expiry frees the slots: a full gate recovers by itself and revoked tokens stay dead', async () => {
    gate.revokeAll();
    const open: Browser[] = [];
    for (let i = 0; i < REVIEWER_MAX_SESSIONS; i += 1) open.push(await reviewer());
    expect((await new Browser().signIn()).status).toBe(503);
    const base = clock.offset;
    clock.offset = base + (SESSION_SECONDS - 1) * 1000;
    expect((await new Browser().signIn()).status).toBe(503);
    clock.offset = base + SESSION_SECONDS * 1000;
    const fresh = new Browser();
    expect((await fresh.signIn()).status).toBe(303);
    expect(gate.size).toBe(1);
    expect((await fresh.get('/demo/environment')).status).toBe(200);
    for (const b of open) expect((await b.get('/demo/environment')).status).toBe(401);
    gate.revokeAll();
  });

  it('repeated sign-ins from one browser hold one slot, and end the session they replace', async () => {
    gate.revokeAll();
    const b = await reviewer();
    const first = b.jar.get(WIRE_COOKIE)!.value;
    for (let i = 0; i < REVIEWER_MAX_SESSIONS * 2; i += 1) expect((await b.signIn()).status).toBe(303);
    expect(gate.size).toBe(1);
    expect(b.jar.get(WIRE_COOKIE)!.value).not.toBe(first);
    expect((await new Browser().get('/demo/environment', { headers: { cookie: `${WIRE_COOKIE}=${first}` } })).status).toBe(401);
    expect((await b.get('/demo/environment')).status).toBe(200);
    gate.revokeAll();
  });

  it('refused keys never grow the gate: the failure record is bounded by the throttle', async () => {
    gate.revokeAll();
    for (let i = 0; i < 30; i += 1) await new Browser().signIn(newToken().token);
    expect(gate.size).toBe(0);
    expect((await new Browser().signIn()).status).toBe(429);
  });
});

describe('the reviewer database boundary on the test server', () => {
  // The full matrix of roles needs a superuser and a dedicated server, and runs
  // in tests/reviewer-security. This is the part any test server can show, with
  // real catalogs, so a migration that changes grants fails here too.
  const factsAs = async (url: string) => {
    const handle = openDatabase(url, createLogger('warn', logs));
    try {
      return await readDatabaseBoundaryFacts(handle.db);
    } finally {
      await handle.close();
    }
  };

  it('the runtime role\'s real grants are exactly the reviewer\'s expected set', async () => {
    const facts = await factsAs(inject('runtimeUrl'));
    const problems = databaseBoundaryProblems(facts, facts.database);
    // This server is shared with other databases, which only a dedicated server avoids.
    expect(problems.filter((problem) => !problem.includes('may connect to other databases'))).toEqual([]);
  });

  it('refuses this test database by name, whatever the URL says, and the migration role by what it is', async () => {
    const runtime = databaseBoundaryProblems(await factsAs(inject('runtimeUrl')));
    expect(runtime[0]).toBe('database: connected to a database other than modeling_standard_demo');
    const migrator = (await factsAs(inject('migrationUrl')));
    const joined = databaseBoundaryProblems(migrator, migrator.database).join('\n');
    expect(joined).toMatch(/CREATEDB/);
    expect(joined).toMatch(/owns a database/);
    expect(joined).toMatch(/owns a table/);
    expect(joined).not.toMatch(/ms_migrator_local_only/);
  });
});

describe('inside reviewer mode: the local demo, exactly, over HTTPS cookies', () => {
  it('registers the local shape: toolkit and participant preview routes, the test provider, no Google', async () => {
    expect(demo.app.hasRoute({ method: 'GET', url: '/me/profile' })).toBe(true);
    expect(demo.app.hasRoute({ method: 'POST', url: '/demo/toolkit/owner' })).toBe(true);
    expect(demo.app.hasRoute({ method: 'GET', url: '/shoots/:projectId/final-record' })).toBe(true);
    expect(demo.origins).toEqual([PUBLIC_ORIGIN]);
    const b = await reviewer();
    const authorize = await b.get('/test-idp/authorize?response_type=code');
    expect(authorize.status).toBe(400);
    expect(authorize.body).toContain('Test sign-in refused');
    expect((await b.post('/sign-in/start', { provider: 'google', invitation: 'x'.repeat(43) })).status).toBe(404);
  });

  it('every demo and application cookie is __Host- named, Secure and HttpOnly; writes need the exact origin, cookie or not', async () => {
    const b = await reviewer();
    const operator = await b.post('/demo/operator');
    expect(operator.status).toBe(200);
    expect(operator.setCookies.find((c) => c.startsWith('__Host-ms_demo_operator='))).toMatch(/; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
    const chosen = await b.post('/demo/toolkit/owner', { owner: 'a' });
    expect(chosen.status).toBe(200);
    for (const line of chosen.setCookies) expect(line).toMatch(/^__Host-ms_[a-z_]+=[A-Za-z0-9_-]*; Max-Age=\d+; Path=\/; HttpOnly; SameSite=(Lax|Strict); Secure$/);
    expect(chosen.setCookies.find((c) => c.startsWith('__Host-ms_session='))).toMatch(/; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
    // Signed in as A: a write from the wrong origin, no origin or a null origin is refused before the body.
    for (const origin of ['https://evil.example', 'http://review.example.invalid:8444', 'null', null]) {
      const res = await b.post('/me/profile', { displayName: 'Mallory', profession: 'Model', biography: '' }, { origin });
      expect({ origin, status: res.status, code: res.json<{ error: { code: string } }>().error.code }).toEqual({ origin, status: 403, code: 'cross_origin' });
    }
    expect((await b.get('/me/profile')).json()).toEqual({ profile: null });
    expect((await b.post('/me/profile', { displayName: 'Ana Reyes', profession: 'Model', biography: '' })).status).toBe(200);
    // A bare-named session cookie (what a plain-HTTP site on the same name could set) is never read.
    const bare = new Browser();
    bare.jar.set(WIRE_COOKIE, b.jar.get(WIRE_COOKIE)!);
    bare.jar.set('ms_session', b.jar.get('__Host-ms_session')!);
    bare.jar.set('ms_demo_operator', { value: newToken().token, path: '/' });
    expect((await bare.get('/me/profile')).status).toBe(401);
    expect((await bare.get('/demo/projects')).status).toBe(401);
  });

  it('two reviewers are two browsers: each chooses its own synthetic professional and sees only its own data', async () => {
    const one = await reviewer();
    const two = await reviewer();
    expect(one.jar.get(WIRE_COOKIE)!.value).not.toBe(two.jar.get(WIRE_COOKIE)!.value);
    expect((await one.post('/demo/toolkit/owner', { owner: 'a' })).status).toBe(200);
    expect((await two.post('/demo/toolkit/owner', { owner: 'b' })).status).toBe(200);
    expect((await one.post('/me/profile', { displayName: 'Ana Reyes', profession: 'Model', biography: 'A only' })).status).toBe(200);
    expect((await two.get('/me/profile')).json()).toEqual({ profile: null });
    expect((await two.post('/me/profile', { displayName: 'Jun Park', profession: 'Photographer', biography: 'B only' })).status).toBe(200);
    expect((await one.get('/me/profile')).json<{ profile: { biography: string } }>().profile.biography).toBe('A only');
    expect((await two.get('/me/profile')).json<{ profile: { biography: string } }>().profile.biography).toBe('B only');
    // A reviewer session is not an account: with only the reviewer cookie, the toolkit answers 401; with B's reviewer cookie and A's session cookie it is A (a session is a bearer credential, as on the local demo).
    const stranger = new Browser();
    stranger.jar.set(WIRE_COOKIE, two.jar.get(WIRE_COOKIE)!);
    expect((await stranger.get('/me/profile')).status).toBe(401);
    // Losing the reviewer session loses the demo too, whatever demo cookies remain.
    await one.request('POST', '/reviewer/sign-out', { raw: '' });
    expect(one.jar.has('__Host-ms_session')).toBe(true);
    expect((await one.get('/me/profile')).status).toBe(401);
    expect((await one.get('/me/profile')).json<{ error: { code: string } }>().error.code).toBe('reviewer_sign_in_required');
  });

  it('sends no HSTS header and keeps the demo server\'s security headers', async () => {
    const b = await reviewer();
    const res = await b.get('/');
    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['content-security-policy']).toMatch(/^default-src 'self'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const gatePage = await new Browser().get('/reviewer');
    expect(gatePage.headers['content-security-policy']).toContain("script-src 'none'");
    expect(gatePage.headers['content-security-policy']).toContain("form-action 'self'");
    expect(gatePage.headers['referrer-policy']).toBe('same-origin');
    expect(gatePage.headers['x-frame-options']).toBe('DENY');
  });

  it('refuses an oversized sign-in body before reading it all', async () => {
    const res = await new Browser().request('POST', '/reviewer/sign-in', { raw: `key=${'x'.repeat(70 * 1024)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(res.status).toBe(413);
    expect(res.setCookies).toEqual([]);
  });
});
