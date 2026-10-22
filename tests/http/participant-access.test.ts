import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { createDemoApplication, type DemoApplication } from '../../src/demo/application.ts';
import { demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { loadDemoFixtures, type FixtureAnnotations } from '../../src/demo/fixtures.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { TEST_AUDIENCE, TEST_ISSUER } from '../../src/demo/test-issuer.ts';
import { verifyIdToken } from '../../src/identity/provider.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { newToken, textDigest } from '../../src/infrastructure/tokens.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';
import { LogCapture } from '../support/app.ts';
import { withClient } from '../support/sql.ts';

/**
 * S12 acceptance and security, over real HTTP through the real demo server
 * (`createDemoApplication` + `createDemoServer`, as `npm run demo` serves
 * them), so cookies, origins, redirects and the proxy behave as they do for a
 * browser. Each `Client` is one browser: its own cookie jar, its own Origin.
 *
 * Sign-in goes through the local test identity provider's real pages and the
 * real verification path (jose). Nothing here is Google or Apple.
 */

let database: DatabaseHandle;
let demo: DemoApplication;
let operatorApp: FastifyInstance;
let server: Server;
let base: string;
let fixtures: FixtureAnnotations;
const logs = new LogCapture();

beforeAll(async () => {
  const logger = createLogger('info', logs);
  database = openDatabase(inject('runtimeUrl'), logger);
  const store = temporaryAnnotationStore();
  demo = await createDemoApplication({ db: database.db, logger, annotations: store });
  server = createDemoServer({ app: demo.app, annotations: store, testIssuer: demo.issuer });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  demo.origins.push(base, `http://localhost:${port}`);
  // The fixtures (Fixture 2: three people, two fees) are written as the demo
  // operator through an operator-only app on the same database, as reset does.
  operatorApp = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: createDemoOperations(store) });
  await operatorApp.ready();
  fixtures = await loadDemoFixtures(operatorApp, database.db);
});

afterAll(async () => {
  server?.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await demo.app.close();
  await operatorApp.close();
  await database.close();
});

// ---- One browser ----

interface Actions {
  tick: boolean;
  untick: boolean;
  setParameter: boolean;
  decline: boolean;
  groupCheck: boolean;
}
interface Item {
  id: string;
  layer: string;
  shape: string | null;
  pending: string | null;
  deliberate: boolean;
  tickedBy: string[];
  actions: Actions;
}
/** Every response shape these tests read, loosely: each test reads the fields its route returns. */
interface Body {
  partyId: string;
  items: Item[];
  ready?: boolean;
  error: { code: string };
  projectId: string;
  photographerPartyId: string;
  modelPartyId: string;
  invitations: { partyId: string; credential: string }[];
  authorizationUrl: string;
  brief: { id: string };
}
interface Res {
  status: number;
  body: string;
  location: string | null;
  setCookies: string[];
  json: () => Body;
}

class Client {
  readonly jar = new Map<string, { value: string; path: string }>();
  readonly origin: string | null;
  constructor(origin: string | null = base) {
    this.origin = origin;
  }

  cookieHeader(path: string): string | undefined {
    const pairs = [...this.jar].filter(([, c]) => path === c.path || path.startsWith(c.path.endsWith('/') ? c.path : `${c.path}/`) || c.path === '/');
    return pairs.length ? pairs.map(([name, c]) => `${name}=${c.value}`).join('; ') : undefined;
  }

  async request(method: 'GET' | 'POST', url: string, options: { json?: unknown; form?: Record<string, string>; headers?: Record<string, string>; origin?: string | null } = {}): Promise<Res> {
    const target = new URL(url, base);
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    const cookie = this.cookieHeader(target.pathname);
    if (cookie) headers['cookie'] = cookie;
    const origin = options.origin === undefined ? this.origin : options.origin;
    if (method === 'POST' && origin !== null) headers['origin'] = origin;
    let body: string | undefined;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form !== undefined) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(options.form).toString();
    } else if (method === 'POST') {
      headers['content-type'] = 'application/json';
      body = '{}';
    }
    const res = await fetch(target, { method, headers, redirect: 'manual', ...(body === undefined ? {} : { body }) });
    const setCookies = res.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';').map((p) => p.trim());
      const [name, value] = [pair!.slice(0, pair!.indexOf('=')), pair!.slice(pair!.indexOf('=') + 1)];
      const path = attrs.find((a) => a.startsWith('Path='))?.slice(5) ?? '/';
      if (attrs.includes('Max-Age=0')) this.jar.delete(name);
      else this.jar.set(name, { value, path });
    }
    const text = await res.text();
    return { status: res.status, body: text, location: res.headers.get('location'), setCookies, json: () => JSON.parse(text) as Body };
  }

  get = (url: string, options?: Parameters<Client['request']>[2]) => this.request('GET', url, options);
  post = (url: string, json: unknown = {}, options: Parameters<Client['request']>[2] = {}) => this.request('POST', url, { ...options, json });
}

/** The generic 404 body with its per-request id removed: what must be identical. */
function generic404(res: Res): string {
  expect(res.status).toBe(404);
  return res.body.replace(/"requestId":"[0-9a-f-]{36}"/, '"requestId":"…"');
}

// ---- Flows ----

async function operator(): Promise<Client> {
  const client = new Client();
  expect((await client.post('/demo/operator')).status).toBe(200);
  return client;
}

/** A live two-person shoot ('unresolved': an open parameter for the Model, a decide-together value) and one link per person. */
async function liveShootWithLinks(op: Client, card: 'unresolved' | 'straightforward' = 'unresolved') {
  const created = await op.post('/demo/shoots/scenarios', { card });
  expect(created.status).toBe(201);
  const shoot = created.json() as { projectId: string; photographerPartyId: string; modelPartyId: string };
  const invited = await op.post(`/demo/shoots/${shoot.projectId}/invitations`);
  expect(invited.status).toBe(201);
  const links = Object.fromEntries(invited.json().invitations.map((i) => [i.partyId, i.credential]));
  return { ...shoot, modelLink: links[shoot.modelPartyId]!, photographerLink: links[shoot.photographerPartyId]! };
}

/** The authorization step and the code, as the test provider's pages give them. Returns the callback URL. */
async function authorize(client: Client, credential: string, name: string): Promise<string> {
  const started = await client.post('/sign-in/start', { provider: 'test', invitation: credential });
  expect(started.status).toBe(200);
  const authorizationUrl = new URL(started.json().authorizationUrl);
  expect(authorizationUrl.origin).toBe(client.origin);
  const page = await client.get(`${authorizationUrl.pathname}${authorizationUrl.search}`);
  expect(page.status).toBe(200);
  expect(page.body).toContain('not Google, not Apple');
  const p = authorizationUrl.searchParams;
  const approved = await client.request('POST', '/test-idp/approve', {
    form: { redirect_uri: p.get('redirect_uri')!, state: p.get('state')!, nonce: p.get('nonce')!, code_challenge: p.get('code_challenge')!, name },
  });
  expect(approved.status).toBe(303);
  const callback = new URL(approved.location!);
  expect(callback.origin).toBe(client.origin);
  expect(callback.pathname).toBe('/sign-in/callback');
  return `${callback.pathname}${callback.search}`;
}

/** The whole test sign-in from an invitation. Returns the callback's response. */
async function signIn(client: Client, credential: string, name: string): Promise<Res> {
  return client.get(await authorize(client, credential, name));
}

async function signedIn(credential: string, name: string): Promise<{ client: Client; projectId: string }> {
  const client = new Client();
  const done = await signIn(client, credential, name);
  expect(done.status).toBe(303);
  const match = /^\/#\/brief\/([0-9a-f-]{36})$/.exec(done.location ?? '');
  expect(match).not.toBeNull();
  return { client, projectId: match![1]! };
}

const uniqueName = (prefix: string) => `${prefix} ${randomUUID().replaceAll('-', '').slice(0, 12)}`;

async function accountCount(name: string): Promise<number> {
  const subject = `test-issuer|${name.trim().toLowerCase().replace(/\s+/g, '-')}`;
  return withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from account where provider_subject = $1', [subject])).rows[0]!.n);
}

async function bindingsOf(projectId: string): Promise<{ party_id: string; account_id: string }[]> {
  return withClient(inject('migrationUrl'), async (c) => (await c.query<{ party_id: string; account_id: string }>('select party_id, account_id from party_account_binding where project_id = $1 order by party_id', [projectId])).rows);
}

async function sessionCount(): Promise<number> {
  return withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from account_session')).rows[0]!.n);
}

// ---- Acceptance ----

describe('two people, two browsers, one shoot (AC-2 to AC-6, AC-10, AC-12)', () => {
  it('each accepts their own link, signs in, lands on the same shoot, and sees it as themselves', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    const b = await signedIn(shoot.photographerLink, uniqueName('Photographer'));
    expect(a.projectId).toBe(shoot.projectId);
    expect(b.projectId).toBe(shoot.projectId);

    const bindings = await bindingsOf(shoot.projectId);
    expect(bindings).toHaveLength(2);
    expect(new Set(bindings.map((x) => x.account_id)).size).toBe(2);

    const viewA = (await a.client.get(`/shoots/${shoot.projectId}`)).json();
    const viewB = (await b.client.get(`/shoots/${shoot.projectId}`)).json();
    expect(viewA.partyId).toBe(shoot.modelPartyId);
    expect(viewB.partyId).toBe(shoot.photographerPartyId);
    expect(viewA.items.map((i: { id: string }) => i.id)).toEqual(viewB.items.map((i: { id: string }) => i.id));
    expect(typeof viewA.ready).toBe('boolean');
    // Only the Model may set the coverage level she controls.
    const parameter = (v: Body) => v.items.find((i) => i.shape === 'open_parameter')!;
    expect(parameter(viewA).actions.setParameter).toBe(true);
    expect(parameter(viewB).actions.setParameter).toBe(false);
  });

  it('returns credentials once and keeps only their digests; no credential, code or state reaches the log', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const callback = await authorize(new Client(), shoot.modelLink, uniqueName('Model'));
    const code = new URL(callback, base).searchParams.get('code')!;
    const dump = await withClient(inject('migrationUrl'), async (c) => {
      const tables = ['direct_invitation', 'sign_in_attempt', 'account_session', 'account', 'party_account_binding'];
      let text = '';
      for (const t of tables) text += JSON.stringify((await c.query<{ r: string }>(`select row_to_json(x)::text as r from ${t} x`)).rows);
      return text;
    });
    for (const secret of [shoot.modelLink, shoot.photographerLink, code]) {
      expect(dump).not.toContain(secret);
      expect(logs.text()).not.toContain(secret);
    }
  });

  it('A ticks; B sees the tick; B cannot remove it', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    const b = await signedIn(shoot.photographerLink, uniqueName('Photographer'));
    const item = (await a.client.get(`/shoots/${shoot.projectId}`)).json().items.find((i: { actions: { tick: boolean }; deliberate: boolean }) => i.actions.tick && !i.deliberate)!;
    expect((await a.client.post(`/shoots/${shoot.projectId}/items/${item.id}/tick`)).status).toBe(200);
    const seen = (await b.client.get(`/shoots/${shoot.projectId}`)).json().items.find((i: { id: string }) => i.id === item.id)!;
    expect(seen.tickedBy).toContain(shoot.modelPartyId);
    expect((await b.client.post(`/shoots/${shoot.projectId}/items/${item.id}/untick`)).status).toBe(200);
    const after = (await a.client.get(`/shoots/${shoot.projectId}`)).json().items.find((i: { id: string }) => i.id === item.id)!;
    expect(after.tickedBy).toContain(shoot.modelPartyId);
  });

  it('a copied session cookie is the same person: the cookie is the credential', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    const copy = new Client();
    copy.jar.set('ms_session', a.client.jar.get('ms_session')!);
    expect((await copy.get(`/shoots/${shoot.projectId}`)).json().partyId).toBe(shoot.modelPartyId);
  });
});

describe('invitation behaviour (AC-4, AC-5)', () => {
  it('the same person reopening their link returns to the same party; another person is refused and creates no account', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const model = uniqueName('Model');
    const first = await signedIn(shoot.modelLink, model);
    const again = await signedIn(shoot.modelLink, model);
    expect(again.projectId).toBe(first.projectId);
    expect((await again.client.get(`/shoots/${shoot.projectId}`)).json().partyId).toBe(shoot.modelPartyId);
    expect(await accountCount(model)).toBe(1);

    const intruder = uniqueName('Intruder');
    const refused = await signIn(new Client(), shoot.modelLink, intruder);
    expect(refused.status).toBe(303);
    expect(refused.location).toBe('/#/signin/already-claimed');
    expect(refused.setCookies.some((c) => c.startsWith('ms_session=') && !c.includes('Max-Age=0'))).toBe(false);
    expect(await accountCount(intruder)).toBe(0);
    expect((await bindingsOf(shoot.projectId)).filter((b) => b.party_id === shoot.modelPartyId)).toHaveLength(1);
  });

  it('a signed-in person cannot take a second person of the same shoot, through the claim or a new sign-in', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const model = uniqueName('Model');
    const a = await signedIn(shoot.modelLink, model);
    const claim = await a.client.post('/invitations/claim', { credential: shoot.photographerLink });
    expect(claim.status).toBe(409);
    expect(claim.json().error.code).toBe('already_in_shoot');
    const viaSignIn = await signIn(new Client(), shoot.photographerLink, model);
    expect(viaSignIn.location).toBe('/#/signin/already-in-shoot');
    expect(await bindingsOf(shoot.projectId)).toHaveLength(1);

    // The photographer's own claim still works afterwards.
    const b = await signedIn(shoot.photographerLink, uniqueName('Photographer'));
    expect((await b.client.get(`/shoots/${shoot.projectId}`)).json().partyId).toBe(shoot.photographerPartyId);
    // And the photographer, claiming the Model's link: already claimed.
    const taken = await b.client.post('/invitations/claim', { credential: shoot.modelLink });
    expect(taken.status).toBe(409);
  });

  it('a signed-in person accepts their own link by claim, idempotently', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    for (let i = 0; i < 2; i += 1) {
      const res = await a.client.post('/invitations/claim', { credential: shoot.modelLink });
      expect(res.status).toBe(200);
      expect(res.json()).toEqual({ projectId: shoot.projectId });
    }
  });

  it('an invitation-shaped string that is not an invitation starts nothing: no attempt, no cookie, no account', async () => {
    const client = new Client();
    const attemptsBefore = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from sign_in_attempt')).rows[0]!.n);
    const baseline = generic404(await client.post('/sign-in/start', { provider: 'test', invitation: newToken().token }));
    for (const invitation of ['x', `${newToken().token}=`, newToken().token.toUpperCase(), 'a'.repeat(43), ' '.repeat(10)]) {
      const res = await client.post('/sign-in/start', { provider: 'test', invitation });
      expect({ invitation, body: generic404(res) }).toEqual({ invitation, body: baseline });
      expect(res.setCookies).toEqual([]);
    }
    expect(generic404(await client.post('/sign-in/start', { provider: 'google', invitation: newToken().token }))).toBe(baseline);
    const attemptsAfter = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from sign_in_attempt')).rows[0]!.n);
    expect(attemptsAfter).toBe(attemptsBefore);
    expect(client.jar.size).toBe(0);
  });

  it('an unknown or malformed credential claimed by a signed-in person is the generic 404', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    const baseline = generic404(await a.client.post('/invitations/claim', { credential: newToken().token }));
    for (const credential of ['x', `${shoot.photographerLink}=`, shoot.photographerLink.slice(1)]) {
      expect(generic404(await a.client.post('/invitations/claim', { credential }))).toBe(baseline);
    }
  });
});

describe('refusal of cross-person actions (AC-7 to AC-9b)', () => {
  it('each person of the three-person shoot sees only their own fee; another pair\'s fee is the generic 404', async () => {
    const op = await operator();
    const [projectId, annotation] = Object.entries(fixtures.projects).find(([, x]) => x.title.startsWith('Fixture 2'))!;
    const byLabel = Object.fromEntries(Object.entries(annotation.parties).map(([id, label]) => [label, id]));
    const record = (await op.get(`/demo/projects/${projectId}/record`)).json();
    for (const partyId of Object.keys(annotation.parties)) expect((await op.post(`/demo/sim/briefs/${record.brief.id}/presence`, { partyId, onSite: true })).status).toBe(200);
    expect((await op.post(`/demo/sim/briefs/${record.brief.id}/share`)).status).toBe(200);
    const invited = (await op.post(`/demo/shoots/${projectId}/invitations`)).json().invitations;
    const link = (label: string) => invited.find((i) => i.partyId === byLabel[label])!.credential;

    const a = await signedIn(link('Party A'), uniqueName('A'));
    const b = await signedIn(link('Party B'), uniqueName('B'));
    const viewA = (await a.client.get(`/shoots/${projectId}`)).json();
    const viewB = (await b.client.get(`/shoots/${projectId}`)).json();
    const fees = (v: { items: { layer: string; id: string }[] }) => v.items.filter((i) => i.layer === 'money');
    expect(fees(viewA)).toHaveLength(1);
    expect(fees(viewB)).toHaveLength(1);
    const feeA = fees(viewA)[0]!;
    expect(fees(viewB)[0]!.id).not.toBe(feeA.id);
    expect(JSON.stringify(viewB)).not.toContain(feeA.id);
    expect('ready' in viewA).toBe(false);

    const baseline = generic404(await b.client.post(`/shoots/${projectId}/items/${randomUUID()}/tick`));
    for (const verb of ['tick', 'untick', 'decline']) {
      expect({ verb, body: generic404(await b.client.post(`/shoots/${projectId}/items/${feeA.id}/${verb}`)) }).toEqual({ verb, body: baseline });
    }
    expect(generic404(await b.client.post(`/shoots/${projectId}/items/${feeA.id}/parameter`, { value: '[synthetic] x' }))).toBe(baseline);
    const visible = viewB.items.find((i: { layer: string }) => i.layer !== 'money')!.id;
    expect(generic404(await b.client.post(`/shoots/${projectId}/group-check`, { itemIds: [visible, feeA.id] }))).toBe(baseline);
    const ticks = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from brief_tick where brief_item_id = $1', [feeA.id])).rows[0]!.n);
    expect(ticks).toBe(0);
  });

  it('no route shape lets one person act as the other', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    const b = await signedIn(shoot.photographerLink, uniqueName('Photographer'));
    const items = (await b.client.get(`/shoots/${shoot.projectId}`)).json().items;
    const tickable = items.find((i: { actions: { tick: boolean } }) => i.actions.tick)!;
    const parameter = items.find((i: Item) => i.shape === 'open_parameter')!;

    expect((await b.client.post(`/shoots/${shoot.projectId}/items/${tickable.id}/tick`, { partyId: shoot.modelPartyId })).status).toBe(400);
    expect((await b.client.post(`/shoots/${shoot.projectId}/items/${tickable.id}/tick?partyId=${shoot.modelPartyId}`)).status).toBe(400);
    expect((await b.client.get(`/shoots/${shoot.projectId}?partyId=${shoot.modelPartyId}`)).status).toBe(400);
    // The operator's simulation is refused to a signed-in person, whatever it names.
    expect((await b.client.post(`/demo/shoots/${shoot.projectId}/as/${shoot.modelPartyId}/items/${tickable.id}/tick`)).status).toBe(403);
    expect((await b.client.get(`/demo/shoots/${shoot.projectId}/as/${shoot.modelPartyId}`)).status).toBe(403);
    // The coverage level is the Model's to set.
    const notSubject = await b.client.post(`/shoots/${shoot.projectId}/items/${parameter.id}/parameter`, { value: '[synthetic] Fully clothed' });
    expect(notSubject.status).toBe(409);
    expect(notSubject.json().error.code).toBe('not_subject');
    const ticks = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ party_id: string }>('select party_id from brief_tick where project_id = $1', [shoot.projectId])).rows);
    expect(ticks.every((t: { party_id: string }) => t.party_id !== shoot.modelPartyId)).toBe(true);
    void a;
  });

  it('a signed-in person cannot create a project or a Stage 0 resource, and every demo operator operation refuses them', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    expect((await a.client.post('/projects')).status).toBe(403);
    expect((await a.client.post('/stage0/synthetic-resources', { label: 'from a participant' })).status).toBe(403);
    const count = await withClient(inject('migrationUrl'), async (c) => (await c.query<{ n: number }>(`select count(*)::int as n from synthetic_resource where label = 'from a participant'`)).rows[0]!.n);
    expect(count).toBe(0);

    let forbidden = 0;
    for (const operation of createDemoOperations(temporaryAnnotationStore()).filter((o) => o.access.kind === 'protected')) {
      const url = operation.path.replace(/:[A-Za-z]+/g, () => randomUUID()).replace(/\/demo\/shoots\/[0-9a-f-]{36}/, `/demo/shoots/${shoot.projectId}`);
      const res = operation.method === 'GET' ? await a.client.get(url) : await a.client.post(url, {});
      // Strict input is checked before authorization (the boundary's fixed
      // order since Stage 0, and it reads nothing), so an empty body may be a
      // 400; anything that reaches authorization is the uniform 403, before
      // any lookup: never a success and never a 404 that would say what exists.
      expect({ op: operation.name, refused: [400, 403].includes(res.status) }).toEqual({ op: operation.name, refused: true });
      if (res.status === 400) expect(res.json().error.code).toBe('invalid_input');
      if (res.status === 403) forbidden += 1;
    }
    // Every operation whose input an empty request satisfies was refused by authorization.
    expect(forbidden).toBeGreaterThanOrEqual(8);
  });
});

describe('live resolution through two sessions (AC-11)', () => {
  it('reaches READY TO SIGN with each person acting only as themselves; an untick loses it, a retick regains it', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const people = [await signedIn(shoot.modelLink, uniqueName('Model')), await signedIn(shoot.photographerLink, uniqueName('Photographer'))];
    for (let round = 0; round < 6; round += 1) {
      for (const person of people) {
        let view = (await person.client.get(`/shoots/${shoot.projectId}`)).json();
        for (const item of view.items) {
          // Entering an agreed value is the operator's (who enters it is open).
          if (item.pending === 'decide_together') expect((await op.post(`/demo/sim/items/${item.id}/settle`, { value: '[synthetic] agreed' })).status).toBe(200);
          if (item.actions.setParameter) expect((await person.client.post(`/shoots/${shoot.projectId}/items/${item.id}/parameter`, { value: '[synthetic] Implied nude' })).status).toBe(200);
        }
        view = (await person.client.get(`/shoots/${shoot.projectId}`)).json();
        const ordinary = view.items.filter((i: { actions: { groupCheck: boolean } }) => i.actions.groupCheck).map((i: { id: string }) => i.id);
        if (ordinary.length) expect((await person.client.post(`/shoots/${shoot.projectId}/group-check`, { itemIds: ordinary })).status).toBe(200);
        for (const item of view.items.filter((i: { actions: { tick: boolean }; deliberate: boolean }) => i.actions.tick && i.deliberate)) {
          expect((await person.client.post(`/shoots/${shoot.projectId}/items/${item.id}/tick`)).status).toBe(200);
        }
      }
      if ((await people[0]!.client.get(`/shoots/${shoot.projectId}`)).json().ready) break;
    }
    const [model, photographer] = [people[0]!, people[1]!];
    expect((await model.client.get(`/shoots/${shoot.projectId}`)).json().ready).toBe(true);
    expect((await photographer.client.get(`/shoots/${shoot.projectId}`)).json().ready).toBe(true);

    const anyTick = (await model.client.get(`/shoots/${shoot.projectId}`)).json().items.find((i: { actions: { untick: boolean } }) => i.actions.untick)!;
    expect((await model.client.post(`/shoots/${shoot.projectId}/items/${anyTick.id}/untick`)).json().ready).toBe(false);
    expect((await photographer.client.get(`/shoots/${shoot.projectId}`)).json().ready).toBe(false);
    expect((await model.client.post(`/shoots/${shoot.projectId}/items/${anyTick.id}/tick`)).json().ready).toBe(true);
  });
});

describe('sessions end, and fail closed (AC-13; amendment 4)', () => {
  it('sign-out ends the session: the next request, and a copy of the old cookie, are unauthenticated', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    const stolen = new Client();
    stolen.jar.set('ms_session', { ...a.client.jar.get('ms_session')! });
    const out = await a.client.post('/sign-out');
    expect(out.status).toBe(200);
    expect(out.setCookies.some((c) => c.startsWith('ms_session=;') && c.includes('Max-Age=0'))).toBe(true);
    expect((await a.client.get(`/shoots/${shoot.projectId}`)).status).toBe(401);
    expect((await stolen.get(`/shoots/${shoot.projectId}`)).status).toBe(401);
  });

  it('a participant who signs out and then opens operator screens is nobody, not the operator', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    // This browser was the operator first, then accepted an invitation.
    const browser = await operator();
    const done = await signIn(browser, shoot.modelLink, uniqueName('Model'));
    expect(done.setCookies.some((c) => c.startsWith('ms_demo_operator=;') && c.includes('Max-Age=0'))).toBe(true);
    expect(browser.jar.has('ms_demo_operator')).toBe(false);
    expect((await browser.get('/demo/projects')).status).toBe(403);
    await browser.post('/sign-out');
    for (const url of ['/demo/projects', `/demo/projects/${shoot.projectId}/record`, `/demo/shoots/${shoot.projectId}/as/${shoot.modelPartyId}`]) {
      expect({ url, status: (await browser.get(url)).status }).toEqual({ url, status: 401 });
    }
    expect((await browser.post(`/demo/shoots/${shoot.projectId}/invitations`)).status).toBe(401);
    // Returning to operator mode is the explicit action, and it works.
    expect((await browser.post('/demo/operator')).status).toBe(200);
    expect((await browser.get('/demo/projects')).status).toBe(200);
  });

  it('a session cookie that is malformed, unknown, ended or expired never becomes the operator, even beside a valid operator cookie', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const operatorCookie = op.jar.get('ms_demo_operator')!;
    const ended = await signedIn(shoot.modelLink, uniqueName('Model'));
    const endedToken = ended.client.jar.get('ms_session')!.value;
    await ended.client.post('/sign-out');
    const expiring = await signedIn(shoot.photographerLink, uniqueName('Photographer'));
    const expiredToken = expiring.client.jar.get('ms_session')!.value;
    await withClient(inject('migrationUrl'), async (c) => {
      await c.query('begin');
      await c.query('alter table account_session disable trigger account_session_end_once');
      await c.query(`update account_session set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where token_digest = $1`, [createHash('sha256').update(Buffer.from(expiredToken, 'base64url')).digest()]);
      await c.query('alter table account_session enable trigger account_session_end_once');
      await c.query('commit');
    });
    for (const sessionValue of ['', 'not-a-token', newToken().token, endedToken, expiredToken, `${endedToken}=`]) {
      const client = new Client();
      client.jar.set('ms_demo_operator', operatorCookie);
      client.jar.set('ms_session', { value: sessionValue, path: '/' });
      expect({ sessionValue, status: (await client.get('/demo/projects')).status }).toEqual({ sessionValue, status: 401 });
      expect({ sessionValue, status: (await client.get(`/shoots/${shoot.projectId}`)).status }).toEqual({ sessionValue, status: 401 });
    }
  });

  it('the operator exists only with the exact operator cookie', async () => {
    const op = await operator();
    const value = op.jar.get('ms_demo_operator')!.value;
    const cases: [string, Map<string, { value: string; path: string }>][] = [
      ['no cookie', new Map()],
      ['forged value', new Map([['ms_demo_operator', { value: newToken().token, path: '/' }]])],
      ['malformed', new Map([['ms_demo_operator', { value: `${value}x`, path: '/' }]])],
    ];
    for (const [label, jar] of cases) {
      const client = new Client();
      for (const [k, v] of jar) client.jar.set(k, v);
      expect({ label, status: (await client.get('/demo/projects')).status }).toEqual({ label, status: 401 });
    }
    const twice = await fetch(new URL('/demo/projects', base), { headers: { cookie: `ms_demo_operator=${value}; ms_demo_operator=${value}` } });
    expect(twice.status).toBe(401);
    expect((await op.get('/demo/projects')).status).toBe(200);
  });
});

// ---- Amendments 2, 3, 5, 6: browser binding, replay, origins, redirects, tokens ----

describe('a sign-in attempt belongs to the browser that started it (amendment 2)', () => {
  it('an attacker\'s otherwise valid callback cannot sign a victim\'s browser in, and is spent', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const attacker = new Client();
    const callback = await authorize(attacker, shoot.modelLink, uniqueName('Attacker'));
    const sessionsBefore = await sessionCount();

    const victim = new Client();
    const onVictim = await victim.get(callback);
    expect(onVictim.status).toBe(303);
    expect(onVictim.location).toBe('/#/signin/failed');
    expect(victim.jar.has('ms_session')).toBe(false);

    // A victim with an attempt of their own in progress fares the same.
    const busy = new Client();
    await busy.post('/sign-in/start', { provider: 'test', invitation: shoot.photographerLink });
    expect(busy.jar.has('ms_signin')).toBe(true);
    expect((await busy.get(callback)).location).toBe('/#/signin/failed');
    expect(busy.jar.has('ms_session')).toBe(false);

    // The attempt was consumed by the first try: the attacker cannot use it either.
    expect((await attacker.get(callback)).location).toBe('/#/signin/failed');
    expect(await sessionCount()).toBe(sessionsBefore);
    expect(await bindingsOf(shoot.projectId)).toHaveLength(0);
  });

  it('a callback replayed after success does nothing', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const client = new Client();
    const callback = await authorize(client, shoot.modelLink, uniqueName('Model'));
    const savedBinding = client.jar.get('ms_signin')!;
    expect((await client.get(callback)).location).toMatch(/^\/#\/brief\//);
    const sessions = await sessionCount();
    client.jar.set('ms_signin', savedBinding);
    expect((await client.get(callback)).location).toBe('/#/signin/failed');
    expect(await sessionCount()).toBe(sessions);
  });

  it('a callback without code or state, or with a state never issued, fails without writing', async () => {
    const client = new Client();
    for (const query of ['', '?code=x', `?state=${newToken().token}`, `?code=x&state=${newToken().token}`, '?error=access_denied']) {
      const res = await client.get(`/sign-in/callback${query}`);
      expect({ query, status: res.status, location: res.location }).toEqual({ query, status: 303, location: '/#/signin/failed' });
    }
  });
});

describe('exact-origin protection and pinned redirects (amendment 5)', () => {
  it('refuses state-changing browser requests from any other origin, or none, before reading them', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    const item = (await a.client.get(`/shoots/${shoot.projectId}`)).json().items[0]!;
    const forged = { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', 'x-forwarded-for': '1.2.3.4' };
    for (const origin of ['http://evil.example', 'null', `${base}.evil.example`, base.replace('127.0.0.1', '127.0.0.2'), 'https://127.0.0.1', '', null]) {
      for (const [client, url, body] of [
        [new Client(), '/sign-in/start', { provider: 'test', invitation: shoot.photographerLink }],
        [a.client, '/invitations/claim', { credential: shoot.modelLink }],
        [a.client, '/sign-out', {}],
        [a.client, `/shoots/${shoot.projectId}/items/${item.id}/tick`, {}],
        [op, '/demo/operator', {}],
        [op, `/demo/shoots/${shoot.projectId}/invitations`, {}],
      ] as const) {
        const res = await client.post(url, body, { origin, headers: forged });
        expect({ origin, url, status: res.status, setCookies: res.setCookies }).toEqual({ origin, url, status: 403, setCookies: [] });
        if (res.status === 403) expect(res.json().error.code).toBe('cross_origin');
      }
    }
    // Nothing above took effect: still signed in, nothing ticked, still the operator.
    expect((await a.client.get(`/shoots/${shoot.projectId}`)).status).toBe(200);
    expect((await a.client.get(`/shoots/${shoot.projectId}`)).json().items[0]!.tickedBy).toEqual([]);
    expect((await op.get('/demo/projects')).status).toBe(200);
    // The same requests from the page's own origins work (both loopback names are allowed).
    expect((await new Client(base.replace('127.0.0.1', 'localhost')).post('/sign-in/start', { provider: 'test', invitation: shoot.photographerLink })).status).toBe(200);
  });

  it('refuses redirect inputs: undeclared parameters, foreign callbacks, forged approvals', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const client = new Client();
    // Sign-in start takes no redirect.
    expect((await client.post('/sign-in/start', { provider: 'test', invitation: shoot.modelLink, redirect_uri: 'https://evil.example/' })).status).toBe(400);
    // The callback declares its parameters; a redirect parameter is refused with no Location.
    for (const extra of ['next=https://evil.example', 'redirect_uri=https://evil.example', 'return_to=//evil.example']) {
      const res = await client.get(`/sign-in/callback?code=x&state=${newToken().token}&${extra}`);
      expect({ extra, status: res.status, location: res.location }).toEqual({ extra, status: 400, location: null });
    }
    // The test provider issues codes only to an allowed origin's own callback.
    const started = new URL((await client.post('/sign-in/start', { provider: 'test', invitation: shoot.modelLink })).json().authorizationUrl);
    for (const redirect of ['https://evil.example/sign-in/callback', `${base}/elsewhere`, `${base}/sign-in/callback?x=1`, `http://evil.example:${new URL(base).port}/sign-in/callback`]) {
      const params = new URLSearchParams(started.search);
      params.set('redirect_uri', redirect);
      expect((await client.get(`/test-idp/authorize?${params.toString()}`)).status).toBe(400);
      const forged = await client.request('POST', '/test-idp/approve', {
        form: { redirect_uri: redirect, state: params.get('state')!, nonce: params.get('nonce')!, code_challenge: params.get('code_challenge')!, name: 'Forger' },
      });
      expect({ redirect, status: forged.status, location: forged.location }).toEqual({ redirect, status: 400, location: null });
    }
    // An approval from another origin is refused.
    const p = started.searchParams;
    const crossApprove = await client.request('POST', '/test-idp/approve', {
      form: { redirect_uri: p.get('redirect_uri')!, state: p.get('state')!, nonce: p.get('nonce')!, code_challenge: p.get('code_challenge')!, name: 'Forger' },
      origin: 'http://evil.example',
    });
    expect(crossApprove.status).toBe(400);
  });

  it('every redirect the callback gives is a fixed same-origin path, and the proxy keeps every Set-Cookie', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const browser = await operator();
    const res = await signIn(browser, shoot.modelLink, uniqueName('Model'));
    expect(res.location).toMatch(/^\/#\/brief\/[0-9a-f-]{36}$/);
    const names = res.setCookies.map((c) => c.slice(0, c.indexOf('=')));
    expect(names.sort()).toEqual(['ms_demo_operator', 'ms_session', 'ms_signin']);
    for (const cookie of res.setCookies) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toMatch(/SameSite=(Lax|Strict)/);
    }
  });
});

describe('ID tokens are verified by jose against the provider (amendment 6)', () => {
  const nonce = newToken().token;
  const verification = () => demo.issuer.provider.verification;

  it('accepts a valid token and returns only its subject', async () => {
    const token = await demo.issuer.mintIdToken({ nonce, subject: 'test-issuer|valid' });
    expect(await verifyIdToken(token, verification(), textDigest(nonce))).toBe('test-issuer|valid');
  });

  it.each([
    ['wrong nonce', { nonce: newToken().token }],
    ['wrong issuer', { nonce, issuer: 'https://accounts.google.com' }],
    ['wrong audience', { nonce, audience: 'someone-else' }],
    ['expired', { nonce, expiresIn: -120, issuedAgo: 400 }],
    ['issued too long ago', { nonce, issuedAgo: 3600, expiresIn: 60 }],
    ['signed with a key the issuer does not publish', { nonce, foreignKey: true }],
  ])('refuses a token %s', async (_label, options) => {
    const token = await demo.issuer.mintIdToken(options);
    await expect(verifyIdToken(token, verification(), textDigest(nonce))).rejects.toThrow(/ID token rejected/);
  });

  it('refuses an unsigned token, an HS256 token, and a tampered payload', async () => {
    const valid = await demo.issuer.mintIdToken({ nonce });
    const [header, payload, signature] = valid.split('.') as [string, string, string];
    const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${payload}.`;
    const hs = `${encode({ alg: 'HS256', typ: 'JWT', kid: 'test-issuer-1' })}.${payload}.${signature}`;
    const tampered = `${header}.${encode({ ...claims, sub: 'test-issuer|someone-else' })}.${signature}`;
    for (const token of [unsigned, hs, tampered, 'not.a.token', '']) {
      await expect(verifyIdToken(token, verification(), textDigest(nonce))).rejects.toThrow(/ID token rejected/);
    }
    expect(TEST_ISSUER).toMatch(/\.invalid$/);
    expect(TEST_AUDIENCE).toBe('modeling-standard-demo');
  });

  it('a callback whose token fails verification signs nobody in and creates no account', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const name = uniqueName('Model');
    // Swap the provider's exchange for one returning a token for another audience.
    const original = demo.issuer.provider.exchangeCode.bind(demo.issuer.provider);
    (demo.issuer.provider as { exchangeCode: typeof original }).exchangeCode = async () => demo.issuer.mintIdToken({ nonce, audience: 'someone-else' });
    try {
      const res = await signIn(new Client(), shoot.modelLink, name);
      expect(res.location).toBe('/#/signin/failed');
    } finally {
      (demo.issuer.provider as { exchangeCode: typeof original }).exchangeCode = original;
    }
    expect(await accountCount(name)).toBe(0);
    expect(await bindingsOf(shoot.projectId)).toHaveLength(0);
  });
});

describe('the signed-in check', () => {
  it('says only whether this browser is signed in', async () => {
    const op = await operator();
    const shoot = await liveShootWithLinks(op);
    const a = await signedIn(shoot.modelLink, uniqueName('Model'));
    expect((await new Client().get('/session')).json()).toEqual({ signedIn: false });
    expect((await op.get('/session')).json()).toEqual({ signedIn: false });
    expect((await a.client.get('/session')).body).toBe('{"signedIn":true}');
  });
});

describe('production isolation (AC-15)', () => {
  it('the production application registers no identity provider: sign-in starts nowhere', async () => {
    const prod = createApp({ db: database.db, logger: createLogger('silent'), resolvePrincipal: () => null, allowedOrigins: ['https://ms.example'] });
    await prod.ready();
    try {
      const res = await prod.inject({ method: 'POST', url: '/sign-in/start', headers: { origin: 'https://ms.example' }, payload: { provider: 'test', invitation: newToken().token } });
      expect(res.statusCode).toBe(404);
      for (const url of ['/test-idp/authorize', '/demo/operator', '/demo/projects']) {
        expect((await prod.inject({ method: url === '/demo/operator' ? 'POST' : 'GET', url, headers: { origin: 'https://ms.example' } })).statusCode).toBe(404);
      }
    } finally {
      await prod.close();
    }
  });

  it('nothing in the production entry points imports the test issuer or the demo', () => {
    const src = join(import.meta.dirname, '../../src');
    for (const file of ['main.ts', 'app/create-app.ts', 'app/operation-list.ts', 'identity/operations.ts', 'identity/provider.ts', 'participants/operations.ts', 'sessions/session.ts']) {
      expect({ file, demo: /from '.*demo\//.test(readFileSync(join(src, file), 'utf8')) }).toEqual({ file, demo: false });
    }
    const build = JSON.parse(readFileSync(join(import.meta.dirname, '../../tsconfig.build.json'), 'utf8'));
    expect(build.exclude).toContain('src/demo');
  });
});
