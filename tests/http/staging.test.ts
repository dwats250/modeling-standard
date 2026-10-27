import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { createDemoApplication, type StagingApplication } from '../../src/demo/application.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { GOOGLE_AUTHORIZATION_ENDPOINT } from '../../src/identity/google.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';
import { LogCapture } from '../support/app.ts';
import { FAKE_CLIENT_SECRET, createFakeGoogle, type FakeGoogle } from '../support/fake-google.ts';
import { withClient } from '../support/sql.ts';

/**
 * S13 synthetic staging over real HTTP, through the real staging wiring
 * (`createDemoApplication` with staging settings + `createDemoServer` with the
 * pinned public authority), as `npm run staging` serves it behind the local
 * HTTPS proxy. Each `Browser` is one browser behind that proxy: it sends the
 * public Host and its own Origin, and keeps its own cookies.
 *
 * Google is a fake (`tests/support/fake-google.ts`) behind the real provider
 * code and the real jose verification. Nothing here shows that real Google
 * accepts the client or the redirect URI.
 */

const PUBLIC_ORIGIN = 'https://staging.example.invalid:8443';
const PUBLIC_HOST = 'staging.example.invalid:8443';
const OPERATOR_KEY = newToken().token;

let database: DatabaseHandle;
let staging: StagingApplication;
let server: Server;
let port: number;
let google: FakeGoogle;
const logs = new LogCapture();

beforeAll(async () => {
  const logger = createLogger('info', logs);
  database = openDatabase(inject('runtimeUrl'), logger);
  google = await createFakeGoogle();
  const store = temporaryAnnotationStore();
  staging = await createDemoApplication({
    db: database.db,
    logger,
    annotations: store,
    staging: { publicOrigin: PUBLIC_ORIGIN, operatorKey: OPERATOR_KEY, providers: [google.provider] },
  });
  server = createDemoServer({ app: staging.app, annotations: store, publicAuthority: PUBLIC_HOST });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server?.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await staging.app.close();
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

/** One browser behind the proxy. Node's http client, so the Host header is exactly what we say. */
class Browser {
  readonly jar = new Map<string, { value: string; path: string }>();
  readonly origin: string | null;
  readonly host: string;
  constructor(origin: string | null = PUBLIC_ORIGIN, host: string = PUBLIC_HOST) {
    this.origin = origin;
    this.host = host;
  }

  cookieHeader(path: string): string | undefined {
    const pairs = [...this.jar].filter(([, c]) => c.path === '/' || path === c.path || path.startsWith(`${c.path}/`));
    return pairs.length ? pairs.map(([n, c]) => `${n}=${c.value}`).join('; ') : undefined;
  }

  request(method: 'GET' | 'POST' | 'PUT', path: string, options: { json?: unknown; headers?: Record<string, string>; origin?: string | null; raw?: string } = {}): Promise<Res> {
    const headers: Record<string, string> = { host: this.host, ...(options.headers ?? {}) };
    const cookie = this.cookieHeader(path.split('?')[0]!);
    if (cookie && headers.cookie === undefined) headers.cookie = cookie;
    const origin = options.origin === undefined ? this.origin : options.origin;
    if (method !== 'GET' && origin !== null) headers.origin = origin;
    let body: string | undefined;
    if (options.raw !== undefined) body = options.raw;
    else if (options.json !== undefined || method === 'POST') body = JSON.stringify(options.json ?? {});
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

  get = (path: string, options?: Parameters<Browser['request']>[2]) => this.request('GET', path, options);
  post = (path: string, json: unknown = {}, options: Parameters<Browser['request']>[2] = {}) => this.request('POST', path, { ...options, json });
}

async function operator(): Promise<Browser> {
  const b = new Browser();
  expect((await b.post('/demo/operator', { key: OPERATOR_KEY })).status).toBe(200);
  return b;
}

async function shootWithLinks(op: Browser) {
  const created = await op.post('/demo/shoots/scenarios', { card: 'unresolved' });
  expect(created.status).toBe(201);
  const shoot = created.json<{ projectId: string; photographerPartyId: string; modelPartyId: string }>();
  const invited = await op.post(`/demo/shoots/${shoot.projectId}/invitations`);
  expect(invited.status).toBe(201);
  const links = Object.fromEntries(invited.json<{ invitations: { partyId: string; credential: string }[] }>().invitations.map((i) => [i.partyId, i.credential]));
  return { ...shoot, modelLink: links[shoot.modelPartyId]!, photographerLink: links[shoot.photographerPartyId]! };
}

/** Starts sign-in with Google from an invitation; returns the Google URL the browser is sent to. */
async function startGoogle(b: Browser, credential: string): Promise<string> {
  const started = await b.post('/sign-in/start', { provider: 'google', invitation: credential });
  expect(started.status).toBe(200);
  return started.json<{ authorizationUrl: string }>().authorizationUrl;
}

/** The person picks an account on (fake) Google; Google sends the browser to the callback. */
async function callbackFor(b: Browser, credential: string, subject: string): Promise<string> {
  const { code, state, redirectUri } = google.approve(await startGoogle(b, credential), subject);
  expect(redirectUri).toBe(`${PUBLIC_ORIGIN}/sign-in/callback`);
  return `/sign-in/callback?${new URLSearchParams({ code, state, scope: 'openid', authuser: '0', prompt: 'consent' }).toString()}`;
}

const subjectSeq = { n: 100000000000000000000n };
const newSubject = () => String((subjectSeq.n += 1n));

async function accountsWithSubject(subject: string) {
  return withClient(inject('migrationUrl'), async (c) => (await c.query<{ login_provider: string }>('select login_provider from account where provider_subject = $1', [subject])).rows);
}

describe('staging environment and front door', () => {
  it('tells the screens it is staging, offers Google only, and requires the operator key', async () => {
    const res = await new Browser().get('/demo/environment');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ environment: 'staging', providers: ['google'], operatorKeyRequired: true });
  });

  it('pins the Host header to the public authority exactly: no other host, port or spelling', async () => {
    for (const host of ['127.0.0.1', `127.0.0.1:${port}`, 'localhost', 'staging.example.invalid', 'staging.example.invalid:443', 'staging.example.invalid:8443.evil', 'evil.example', '']) {
      const res = await new Browser(PUBLIC_ORIGIN, host).get('/demo/environment');
      expect({ host, status: res.status }).toEqual({ host, status: 421 });
    }
    // Case-insensitive, as host names are.
    expect((await new Browser(PUBLIC_ORIGIN, PUBLIC_HOST.toUpperCase()).get('/demo/environment')).status).toBe(200);
  });

  it('reads no forwarding header: a forged X-Forwarded-Host or Forwarded neither admits a wrong Host nor changes the allowed origin', async () => {
    const forged = { 'x-forwarded-host': PUBLIC_HOST, 'x-forwarded-proto': 'https', forwarded: `host=${PUBLIC_HOST};proto=https`, 'x-forwarded-for': '100.64.0.1' };
    expect((await new Browser(PUBLIC_ORIGIN, 'evil.example').get('/demo/environment', { headers: forged })).status).toBe(421);
    const b = new Browser('https://evil.example');
    const res = await b.post('/demo/operator', { key: OPERATOR_KEY }, { headers: { ...forged, 'x-forwarded-host': 'evil.example' } });
    expect(res.status).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('cross_origin');
  });

  it('serves no test identity provider: its pages are 404 and a test sign-in is refused', async () => {
    expect((await new Browser().get('/test-idp/authorize?response_type=code')).status).toBe(404);
    expect((await new Browser().post('/test-idp/approve', {})).status).toBe(404);
    const op = await operator();
    const shoot = await shootWithLinks(op);
    expect((await new Browser().post('/sign-in/start', { provider: 'test', invitation: shoot.modelLink })).status).toBe(404);
  });

  it('sends no HSTS header (the staging name may serve other sites over plain HTTP on other ports)', async () => {
    const res = await new Browser().get('/');
    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('operator mode needs the operator key, checked on the server', () => {
  it('refuses a missing, wrong, malformed or oversized key with the same 403 and sets no cookie', async () => {
    for (const body of [{}, { key: newToken().token }, { key: OPERATOR_KEY.slice(0, -1) }, { key: `${OPERATOR_KEY}=` }, { key: OPERATOR_KEY.toUpperCase() }, { key: 'x'.repeat(256) }]) {
      const res = await new Browser().post('/demo/operator', body);
      expect(res.status).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('forbidden');
      expect(res.setCookies).toEqual([]);
    }
    expect((await new Browser().post('/demo/operator', { key: 'x'.repeat(257) })).status).toBe(400);
    expect((await new Browser().post('/demo/operator', { key: OPERATOR_KEY, extra: 1 })).status).toBe(400);
  });

  it('accepts the key only in the body: in the query string it is refused before it is looked at', async () => {
    const res = await new Browser().post(`/demo/operator?key=${OPERATOR_KEY}`, {});
    expect(res.status).toBe(400);
    expect(res.setCookies).toEqual([]);
  });

  it('refuses the key from another origin, or with no origin', async () => {
    for (const origin of ['https://evil.example', 'http://staging.example.invalid:8443', 'https://staging.example.invalid', 'null', null]) {
      const res = await new Browser(origin).post('/demo/operator', { key: OPERATOR_KEY });
      expect({ origin, status: res.status }).toEqual({ origin, status: 403 });
    }
  });

  it('with the right key: a Secure, HttpOnly, SameSite=Strict operator cookie that is not the key', async () => {
    const b = new Browser();
    expect((await b.get('/demo/projects')).status).toBe(401);
    const res = await b.post('/demo/operator', { key: OPERATOR_KEY });
    expect(res.status).toBe(200);
    expect(res.setCookies.find((c) => c.startsWith('__Host-ms_demo_operator='))).toMatch(/; Path=\/; HttpOnly; SameSite=Strict; Secure$/);
    expect(res.setCookies.join('\n')).not.toContain(OPERATOR_KEY);
    expect(res.body).not.toContain(OPERATOR_KEY);
    expect((await b.get('/demo/projects')).status).toBe(200);
  });
});

describe('Google sign-in from an invitation (fake Google, real provider code and verification)', () => {
  it('two people, two browsers: each signs in with their own Google account and sees the shoot as themselves', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const model = new Browser();
    const photographer = new Browser();

    const authorizationUrl = await startGoogle(model, shoot.modelLink);
    const url = new URL(authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('redirect_uri')).toBe(`${PUBLIC_ORIGIN}/sign-in/callback`);
    // The invitation credential never goes to Google.
    expect(authorizationUrl).not.toContain(shoot.modelLink);
    expect(model.jar.get('__Host-ms_signin')).toEqual({ value: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), path: '/' });

    const modelSubject = newSubject();
    const { code, state } = google.approve(authorizationUrl, modelSubject);
    const done = await model.get(`/sign-in/callback?${new URLSearchParams({ code, state, scope: 'openid', authuser: '0', prompt: 'consent' }).toString()}`);
    expect(done.status).toBe(303);
    expect(done.location).toBe(`/#/brief/${shoot.projectId}`);
    expect(done.setCookies.find((c) => c.startsWith('__Host-ms_session='))).toMatch(/; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
    expect(done.setCookies.find((c) => c.startsWith('__Host-ms_signin='))).toMatch(/Max-Age=0; Path=\/;/);
    // Every cookie staging sets is __Host- named, Secure, Path=/ and has no Domain.
    for (const line of done.setCookies) expect(line).toMatch(/^__Host-ms_[a-z_]+=[A-Za-z0-9_-]*; Max-Age=\d+; Path=\/; HttpOnly; SameSite=(Lax|Strict); Secure$/);
    // The token request carried the PKCE verifier and the exact redirect URI.
    const sent = google.tokenRequests.at(-1)!;
    expect(sent.redirect_uri).toBe(`${PUBLIC_ORIGIN}/sign-in/callback`);
    expect(sent.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const photographerSubject = newSubject();
    const done2 = await photographer.get(await callbackFor(photographer, shoot.photographerLink, photographerSubject));
    expect(done2.location).toBe(`/#/brief/${shoot.projectId}`);

    const viewA = (await model.get(`/shoots/${shoot.projectId}`)).json<{ partyId: string }>();
    const viewB = (await photographer.get(`/shoots/${shoot.projectId}`)).json<{ partyId: string }>();
    expect(viewA.partyId).toBe(shoot.modelPartyId);
    expect(viewB.partyId).toBe(shoot.photographerPartyId);
    // Accounts hold only the provider and its subject.
    expect(await accountsWithSubject(modelSubject)).toEqual([{ login_provider: 'google' }]);
    expect(await accountsWithSubject(photographerSubject)).toEqual([{ login_provider: 'google' }]);
    const columns = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'account' order by column_name")).rows.map((r) => r.column_name));
    expect(columns).toEqual(['created_at', 'id', 'login_provider', 'provider_subject']);

    // A signed-in person is refused the operator's screens, and cannot become the operator without the key.
    expect((await model.get('/demo/projects')).status).toBe(403);
    expect((await model.post('/demo/operator', {})).status).toBe(403);
  });

  it('the same Google account reopening its own link signs back in; another Google account is refused the claimed link', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const subject = newSubject();
    const first = new Browser();
    expect((await first.get(await callbackFor(first, shoot.modelLink, subject))).location).toBe(`/#/brief/${shoot.projectId}`);
    const again = new Browser();
    expect((await again.get(await callbackFor(again, shoot.modelLink, subject))).location).toBe(`/#/brief/${shoot.projectId}`);
    const other = new Browser();
    const otherSubject = newSubject();
    expect((await other.get(await callbackFor(other, shoot.modelLink, otherSubject))).location).toBe('/#/signin/already-claimed');
    expect(await accountsWithSubject(otherSubject)).toEqual([]);
  });

  const refusals: [FakeGoogle['behaviour'], string][] = [
    ['http-400', 'the token endpoint refuses the code'],
    ['no-id-token', 'the token response has no ID token'],
    ['wrong-audience', 'the ID token is for another client'],
    ['wrong-issuer', 'the ID token is from another issuer'],
    ['wrong-nonce', 'the ID token carries another nonce'],
    ['foreign-key', 'the ID token is signed with a key Google does not publish'],
    ['expired', 'the ID token has expired'],
  ];
  for (const [behaviour, label] of refusals) {
    it(`fails closed when ${label}: no account, no session, the attempt spent`, async () => {
      const op = await operator();
      const shoot = await shootWithLinks(op);
      const b = new Browser();
      const subject = newSubject();
      const callback = await callbackFor(b, shoot.modelLink, subject);
      google.behaviour = behaviour;
      let res: Res;
      try {
        res = await b.get(callback);
      } finally {
        google.behaviour = 'ok';
      }
      expect(res.status).toBe(303);
      expect(res.location).toBe('/#/signin/failed');
      expect(res.setCookies.some((c) => c.includes('ms_session=') && !c.includes('Max-Age=0'))).toBe(false);
      expect(await accountsWithSubject(subject)).toEqual([]);
      // Spent: the same callback again fails too, even though Google would now answer.
      expect((await b.get(callback)).location).toBe('/#/signin/failed');
    });
  }

  it('a cancelled sign-in (Google sends back an error, no code) spends the attempt', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const b = new Browser();
    const subject = newSubject();
    const { code, state } = google.approve(await startGoogle(b, shoot.modelLink), subject);
    const cancelled = await b.get(`/sign-in/callback?${new URLSearchParams({ error: 'access_denied', state }).toString()}`);
    expect(cancelled.location).toBe('/#/signin/failed');
    expect((await b.get(`/sign-in/callback?${new URLSearchParams({ code, state }).toString()}`)).location).toBe('/#/signin/failed');
    expect(await accountsWithSubject(subject)).toEqual([]);
  });

  it("an attacker's valid Google callback opened in someone else's browser does not sign that browser in", async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const attacker = new Browser();
    const subject = newSubject();
    const callback = await callbackFor(attacker, shoot.modelLink, subject);
    const victim = new Browser();
    const res = await victim.get(callback);
    expect(res.location).toBe('/#/signin/failed');
    expect(victim.jar.get('__Host-ms_session')).toBeUndefined();
    expect(await accountsWithSubject(subject)).toEqual([]);
    // And it is spent for the attacker too.
    expect((await attacker.get(callback)).location).toBe('/#/signin/failed');
  });

  it('a stray or cross-site visit to the callback does not disturb a sign-in this browser has in progress', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const victim = new Browser();
    const subject = newSubject();
    const victimCallback = await callbackFor(victim, shoot.modelLink, subject);
    // Someone else's attempt, consumed in the victim's browser.
    const attacker = new Browser();
    const attackerCallback = await callbackFor(attacker, shoot.photographerLink, newSubject());
    for (const path of ['/sign-in/callback', `/sign-in/callback?state=${newToken().token}&code=x`, attackerCallback]) {
      const res = await victim.get(path);
      expect(res.location).toBe('/#/signin/failed');
      expect(res.setCookies).toEqual([]);
    }
    // The victim's own sign-in still completes.
    expect((await victim.get(victimCallback)).location).toBe(`/#/brief/${shoot.projectId}`);
  });

  it('a replayed successful callback signs nobody in again', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const b = new Browser();
    const callback = await callbackFor(b, shoot.modelLink, newSubject());
    expect((await b.get(callback)).location).toBe(`/#/brief/${shoot.projectId}`);
    const replay = new Browser();
    replay.jar.set('__Host-ms_signin', b.jar.get('__Host-ms_signin') ?? { value: 'x'.repeat(43), path: '/' });
    expect((await replay.get(callback)).location).toBe('/#/signin/failed');
  });

  it('starts no Google sign-in for a string that only looks like an invitation, and writes nothing', async () => {
    const b = new Browser();
    const before = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from sign_in_attempt where redirect_uri = $1', [`${PUBLIC_ORIGIN}/sign-in/callback`])).rows[0]!.n);
    const res = await b.post('/sign-in/start', { provider: 'google', invitation: newToken().token });
    expect(res.status).toBe(404);
    expect(res.setCookies).toEqual([]);
    const after = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from sign_in_attempt where redirect_uri = $1', [`${PUBLIC_ORIGIN}/sign-in/callback`])).rows[0]!.n);
    expect(after).toBe(before);
  });
});

describe('no B1 toolkit on staging', () => {
  it('a Google-signed-in account gets the generic 404 for every toolkit route, and nothing is written', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const subject = newSubject();
    const person = new Browser();
    expect((await person.get(await callbackFor(person, shoot.modelLink, subject))).location).toBe(`/#/brief/${shoot.projectId}`);
    // The session is real: the person's own shoot view answers.
    expect((await person.get(`/shoots/${shoot.projectId}`)).status).toBe(200);

    const profile = { displayName: 'Staging Person', profession: 'Model', biography: '' };
    for (const [method, path, json] of [['GET', '/me/profile'], ['POST', '/me/profile', profile], ['GET', '/me/comp-card'], ['POST', '/me/comp-card', { tagline: '', slots: {} }], ['GET', '/me/portfolio'], ['POST', '/me/portfolio', { items: [] }]] as const) {
      expect(staging.app.hasRoute({ method, url: path })).toBe(false);
      const res = await person.request(method, path, json === undefined ? {} : { json });
      expect({ method, path, status: res.status }).toEqual({ method, path, status: 404 });
      expect(res.json()).toEqual({ error: { code: 'not_found', requestId: expect.any(String) } });
    }
    expect((await person.post('/demo/toolkit/owner', { owner: 'a' })).status).toBe(404);
    const rows = await withClient(inject('migrationUrl'), async (c) =>
      (await c.query<{ id: string }>('select p.id from professional_profile p join account a on a.id = p.account_id where a.provider_subject = $1', [subject])).rows,
    );
    expect(rows).toEqual([]);
  });
});

describe('HTTPS cookies are __Host- named, and bare names are never read', () => {
  /** A cookie a plain-HTTP site on the same host name could set: bare name, any path. */
  const toss = (b: Browser, name: string, value: string) => b.jar.set(name, { value, path: '/' });

  it('the operator cookie under its bare name, even with the right value, is not the operator', async () => {
    const op = await operator();
    const secret = op.jar.get('__Host-ms_demo_operator')!.value;
    const b = new Browser();
    toss(b, 'ms_demo_operator', secret);
    expect((await b.get('/demo/projects')).status).toBe(401);
    expect((await b.post('/demo/shoots/scenarios', { card: 'unresolved' })).status).toBe(401);
  });

  it('a session token under the bare name signs nobody in; a tossed bare session neither overrides nor ends a real one', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const person = new Browser();
    expect((await person.get(await callbackFor(person, shoot.modelLink, newSubject()))).location).toBe(`/#/brief/${shoot.projectId}`);
    const token = person.jar.get('__Host-ms_session')!.value;

    const bare = new Browser();
    toss(bare, 'ms_session', token);
    expect((await bare.get(`/shoots/${shoot.projectId}`)).status).toBe(401);

    // Tossed into the person's browser: a session cookie the server would otherwise treat as a duplicate.
    toss(person, 'ms_session', newToken().token);
    expect((await person.get(`/shoots/${shoot.projectId}`)).json<{ partyId: string }>().partyId).toBe(shoot.modelPartyId);
    // Tossed into the operator's: a bare session cookie does not turn the operator into nobody.
    toss(op, 'ms_session', token);
    expect((await op.get('/demo/projects')).status).toBe(200);

    // Sign-out ends the real session and clears the prefixed cookie.
    const out = await person.post('/sign-out');
    expect(out.setCookies.find((c) => c.startsWith('__Host-ms_session='))).toMatch(/^__Host-ms_session=; Max-Age=0; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
    const reuse = new Browser();
    reuse.jar.set('__Host-ms_session', { value: token, path: '/' });
    expect((await reuse.get(`/shoots/${shoot.projectId}`)).status).toBe(401);
  });

  it('a sign-in binding under the bare name does not complete the callback, and spends the attempt', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const b = new Browser();
    const subject = newSubject();
    const callback = await callbackFor(b, shoot.modelLink, subject);
    const binding = b.jar.get('__Host-ms_signin')!;
    b.jar.delete('__Host-ms_signin');
    toss(b, 'ms_signin', binding.value);
    expect((await b.get(callback)).location).toBe('/#/signin/failed');
    b.jar.set('__Host-ms_signin', binding);
    expect((await b.get(callback)).location).toBe('/#/signin/failed');
    expect(await accountsWithSubject(subject)).toEqual([]);
  });

  it('a duplicated prefixed binding fails closed', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const b = new Browser();
    const subject = newSubject();
    const callback = await callbackFor(b, shoot.modelLink, subject);
    const binding = b.jar.get('__Host-ms_signin')!.value;
    const res = await b.get(callback, { headers: { cookie: `__Host-ms_signin=${binding}; __Host-ms_signin=${binding}` } });
    expect(res.location).toBe('/#/signin/failed');
    expect(await accountsWithSubject(subject)).toEqual([]);
  });
});

describe('secrets stay out of logs and responses', () => {
  it('never logs the operator key, the Google client secret, codes, ID tokens or invitation credentials', async () => {
    const op = await operator();
    const shoot = await shootWithLinks(op);
    const b = new Browser();
    const callback = await callbackFor(b, shoot.modelLink, newSubject());
    google.behaviour = 'http-400';
    try {
      await new Browser().post('/demo/operator', { key: newToken().token });
      await b.get(callback);
    } finally {
      google.behaviour = 'ok';
    }
    const code = new URLSearchParams(callback.split('?')[1]).get('code')!;
    const state = new URLSearchParams(callback.split('?')[1]).get('state')!;
    const text = logs.text();
    expect(text.length).toBeGreaterThan(0);
    for (const secret of [OPERATOR_KEY, FAKE_CLIENT_SECRET, code, state, shoot.modelLink, shoot.photographerLink]) expect(text).not.toContain(secret);
    expect(text).toContain('operator key refused');
    expect(text).toContain('sign-in callback refused');
  });
});
