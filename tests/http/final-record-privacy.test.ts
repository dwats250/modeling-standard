import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openLiveBrief } from '../../src/briefs/brief.ts';
import { createDemoApplication, type DemoApplication } from '../../src/demo/application.ts';
import { demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { runMigrations } from '../../src/infrastructure/database/migrate.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';
import { withClient } from '../support/sql.ts';
import { seedThreePartyFinalRecord, type SeededClause, type SeededEvidence } from '../support/three-party-final-record.ts';
import { withDatabase } from '../support/urls.ts';

/**
 * D10 over real HTTP with three people: everything jointly agreed, plus the
 * person's own payment terms, and nobody else's numbers. Sessions, cookies and
 * the route are the real demo server's; each `Browser` has its own cookie jar.
 *
 * The three-party contract is seeded past the two-party guards (see
 * `three-party-final-record.ts`), which is why this file owns a scratch
 * database: nothing else may run while those guards are off. Passing here says
 * nothing about three-party finalization, which remains refused. Everything
 * is synthetic; no participant signs anything.
 */

let scratch: string;
let scratchMigrationUrl: string;
let database: DatabaseHandle;
let demo: DemoApplication;
let operatorApp: FastifyInstance;
let server: Server;
let base: string;

beforeAll(async () => {
  scratch = `ms_final_record_test_${randomUUID().replaceAll('-', '')}`;
  await withClient(inject('adminUrl'), (c) => c.query(`CREATE DATABASE ${scratch}`));
  scratchMigrationUrl = withDatabase(inject('adminUrl'), scratch);
  await runMigrations(scratchMigrationUrl);
  const logger = createLogger('fatal');
  database = openDatabase(withDatabase(inject('runtimeUrl'), scratch), logger);
  const store = temporaryAnnotationStore();
  demo = await createDemoApplication({ db: database.db, logger, annotations: store });
  server = createDemoServer({ app: demo.app, annotations: store, testIssuer: demo.issuer });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  demo.origins.push(base);
  operatorApp = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: createDemoOperations(store) });
  await operatorApp.ready();
});

afterAll(async () => {
  server?.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await demo?.app.close();
  await operatorApp?.close();
  await database?.close();
  await withClient(inject('adminUrl'), (c) => c.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`));
});

// ---- One browser ----

interface Res {
  status: number;
  body: string;
  location: string | null;
}

class Browser {
  readonly jar = new Map<string, string>();

  async request(method: string, path: string, options: { json?: unknown; form?: Record<string, string> } = {}): Promise<Res> {
    const headers: Record<string, string> = {};
    if (this.jar.size) headers['cookie'] = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (method !== 'GET') headers['origin'] = base;
    let body: string | undefined;
    if (options.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(options.form).toString();
    } else if (method !== 'GET') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json ?? {});
    }
    const res = await fetch(new URL(path, base), { method, headers, redirect: 'manual', ...(body === undefined ? {} : { body }) });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const name = pair!.slice(0, pair!.indexOf('='));
      if (attributes.includes('Max-Age=0')) this.jar.delete(name);
      else this.jar.set(name, pair!.slice(pair!.indexOf('=') + 1));
    }
    return { status: res.status, body: await res.text(), location: res.headers.get('location') };
  }

  get = (path: string) => this.request('GET', path);
  post = (path: string, json: unknown = {}) => this.request('POST', path, { json });
}

function generic404(res: Res): string {
  expect(res.status, res.body).toBe(404);
  return res.body.replace(/"requestId":"[0-9a-f-]{36}"/, '"requestId":"…"');
}

async function signedIn(credential: string): Promise<Browser> {
  const browser = new Browser();
  const started = await browser.post('/sign-in/start', { provider: 'test', invitation: credential });
  expect(started.status, started.body).toBe(200);
  const authorization = new URL((JSON.parse(started.body) as { authorizationUrl: string }).authorizationUrl);
  expect((await browser.get(`${authorization.pathname}${authorization.search}`)).status).toBe(200);
  const p = authorization.searchParams;
  const approved = await browser.request('POST', '/test-idp/approve', {
    form: { redirect_uri: p.get('redirect_uri')!, state: p.get('state')!, nonce: p.get('nonce')!, code_challenge: p.get('code_challenge')!, name: `Person ${randomUUID().replaceAll('-', '').slice(0, 20)}` },
  });
  expect(approved.status, approved.body).toBe(303);
  const callback = new URL(approved.location!);
  const done = await browser.get(`${callback.pathname}${callback.search}`);
  expect(done.status, done.body).toBe(303);
  expect(done.location).toMatch(/^\/#\/brief\//);
  return browser;
}

async function operator(): Promise<Browser> {
  const browser = new Browser();
  expect((await browser.post('/demo/operator')).status).toBe(200);
  return browser;
}

// ---- A stored three-party final record ----

type Name = 'a' | 'b' | 'c';
const NAMES: readonly Name[] = ['a', 'b', 'c'];
const HUB: readonly (readonly [Name, Name])[] = [['a', 'c'], ['b', 'c']];
const EVERY_PAIR: readonly (readonly [Name, Name])[] = [['a', 'b'], ['a', 'c'], ['b', 'c']];

interface Clause {
  layer: string;
  between: string[] | null;
  subjectPartyId: string | null;
  shape: string | null;
  itemKey: string | null;
  content: string;
  value: string | null;
  approverPartyIds: string[];
}
interface FinalRecordBody {
  synthetic: boolean;
  record: { contractId: string; projectId: string; partyId: string; parties: { id: string; onSite: boolean }[]; clauses: Clause[] };
}

interface World {
  projectId: string;
  party: Record<Name, string>;
  browser: Record<Name, Browser>;
  account: Record<Name, string>;
  /** Each pair's fee, by the pair's key ("a-c"). */
  fee: Record<string, string>;
  feePair: Record<string, readonly [Name, Name]>;
  sharedValues: readonly string[];
  evidence: SeededEvidence;
  url: string;
}

const pairKey = (pair: readonly [Name, Name]) => pair.join('-');

async function finalThreePartyShoot(pairs: readonly (readonly [Name, Name])[]): Promise<World> {
  const created = await operatorApp.inject({ method: 'POST', url: '/projects', payload: {} });
  expect(created.statusCode).toBe(201);
  const projectId = created.json<{ id: string }>().id;
  const party = { a: (await addProjectParty(database.db, projectId)).id, b: (await addProjectParty(database.db, projectId)).id, c: (await addProjectParty(database.db, projectId)).id };
  const brief = await openLiveBrief(database.db, projectId);
  const agreements = new Map<string, string>();
  for (const pair of pairs) agreements.set(pairKey(pair), (await createPairwiseAgreement(database.db, projectId, [party[pair[0]], party[pair[1]]])).id);

  const op = await operator();
  const invited = await op.post(`/demo/shoots/${projectId}/invitations`);
  expect(invited.status, invited.body).toBe(201);
  const credentials = new Map((JSON.parse(invited.body) as { invitations: { partyId: string; credential: string }[] }).invitations.map((i) => [i.partyId, i.credential]));
  const browser = { a: await signedIn(credentials.get(party.a)!), b: await signedIn(credentials.get(party.b)!), c: await signedIn(credentials.get(party.c)!) };

  const marker = randomUUID();
  const everyone = NAMES.map((name) => party[name]);
  const sharedValues = [`[synthetic] Safety ${marker}`, `[synthetic] Call time ${marker}`, `[synthetic] Usage between a pair ${marker}`];
  const firstPair = pairs[0]!;
  const fee: Record<string, string> = {};
  const feePair: Record<string, readonly [Name, Name]> = {};
  const clauses: SeededClause[] = [
    { layer: 'universal', content: '[synthetic] Safety term', value: sharedValues[0]!, approverPartyIds: everyone },
    { layer: 'shared', content: '[synthetic] Call sheet', value: sharedValues[1]!, approverPartyIds: everyone },
    // A shared term scoped to a pair stays shared: the pair says who it is between, not who sees it.
    { layer: 'shared', pairwiseAgreementId: agreements.get(pairKey(firstPair))!, content: '[synthetic] Usage term', value: sharedValues[2]!, approverPartyIds: firstPair.map((n) => party[n]) },
  ];
  for (const [index, pair] of pairs.entries()) {
    const key = pairKey(pair);
    fee[key] = `[synthetic] PAYMENT-${key}-${1000 + index * 137}-${marker}`;
    feePair[key] = pair;
    clauses.push({ layer: 'money', pairwiseAgreementId: agreements.get(key)!, itemKey: 'fee', content: '[synthetic] Fee', value: fee[key], approverPartyIds: pair.map((n) => party[n]) });
  }
  const evidence = await seedThreePartyFinalRecord(scratchMigrationUrl, { projectId, briefId: brief.id, clauses });
  const accounts = await withClient(scratchMigrationUrl, async (c) => (await c.query<{ party_id: string; account_id: string }>('select party_id, account_id from party_account_binding where project_id = $1', [projectId])).rows);
  const accountOf = (id: string) => accounts.find((row) => row.party_id === id)!.account_id;
  return {
    projectId,
    party,
    browser,
    account: { a: accountOf(party.a), b: accountOf(party.b), c: accountOf(party.c) },
    fee,
    feePair,
    sharedValues,
    evidence,
    url: `/shoots/${projectId}/final-record`,
  };
}

async function recordOf(world: World, name: Name): Promise<{ res: Res; body: FinalRecordBody }> {
  const res = await world.browser[name].get(world.url);
  expect(res.status, res.body).toBe(200);
  return { res, body: JSON.parse(res.body) as FinalRecordBody };
}

// ---- Acceptance ----

describe.each([
  ['one person paid by each of two others (no pair between those two)', HUB],
  ['every pair with its own payment', EVERY_PAIR],
])('three people: %s', (_title, pairs) => {
  let world: World;
  beforeAll(async () => {
    world = await finalThreePartyShoot(pairs);
  });

  it.each(NAMES)('%s sees every shared term, their own payments, and nobody else\'s', async (name) => {
    const { res, body } = await recordOf(world, name);
    expect(body.synthetic).toBe(true);
    expect(body.record.partyId).toBe(world.party[name]);
    expect(body.record.projectId).toBe(world.projectId);

    // The roster is mutual (D10): everyone, on the same terms, with nothing marking an organizer.
    expect(body.record.parties.map((p) => p.id).sort()).toEqual(Object.values(world.party).sort());
    for (const p of body.record.parties) expect(Object.keys(p).sort()).toEqual(['id', 'onSite']);

    const nonMoney = body.record.clauses.filter((c) => c.layer !== 'money').map((c) => c.value);
    expect(nonMoney).toEqual(world.sharedValues);

    const ownKeys = Object.keys(world.fee).filter((key) => world.feePair[key]!.includes(name));
    const otherKeys = Object.keys(world.fee).filter((key) => !world.feePair[key]!.includes(name));
    expect(ownKeys.length).toBeGreaterThan(0);
    const money = body.record.clauses.filter((c) => c.layer === 'money');
    expect(money.map((c) => c.value)).toEqual(ownKeys.map((key) => world.fee[key]));
    for (const clause of money) expect(clause.between).toContain(world.party[name]);

    // Not filtered in the screen: another pair's payment is not in the bytes at all.
    for (const key of otherKeys) expect(res.body).not.toContain(world.fee[key]);
  });

  it('a person outside a pair is told nothing about that pair\'s payment, and two people in a pair read the same one', async () => {
    const seen = new Map<string, Name[]>();
    for (const name of NAMES) {
      const { body } = await recordOf(world, name);
      for (const clause of body.record.clauses.filter((c) => c.layer === 'money')) seen.set(clause.value!, [...(seen.get(clause.value!) ?? []), name]);
    }
    expect(Object.fromEntries(seen)).toEqual(Object.fromEntries(Object.entries(world.fee).map(([key, value]) => [value, [...world.feePair[key]!]])));
  });

  it('no response carries signature evidence, an account, change history or an organizer', async () => {
    for (const name of NAMES) {
      const { res } = await recordOf(world, name);
      for (const value of [world.evidence.fingerprint, ...world.evidence.hashes, world.evidence.ip, world.evidence.userAgent, ...Object.values(world.account)]) {
        expect({ name, value, found: res.body.includes(value) }).toEqual({ name, value, found: false });
      }
      expect(res.body).not.toMatch(/signature|signedAt|signer|accountId|providerSubject|fingerprint|recordHash|prevHash|history|version|revision|organizer|createdBy|position/i);
    }
  });
});

describe('no organizer privilege (D10)', () => {
  it('the account recorded as the shoot\'s creator sees exactly what any other person sees', async () => {
    const world = await finalThreePartyShoot(HUB);
    const before = await recordOf(world, 'a');
    await withClient(scratchMigrationUrl, (c) => c.query('update project set created_by_principal_id = $1 where id = $2', [world.account.a, world.projectId]));
    const after = await recordOf(world, 'a');
    expect(after.body).toEqual(before.body);
    expect(after.res.body).not.toContain(world.fee['b-c']);
  });
});

describe('who may read a three-party final record', () => {
  let world: World;
  beforeAll(async () => {
    world = await finalThreePartyShoot(EVERY_PAIR);
  });

  it('nobody signed in: 401', async () => {
    expect((await new Browser().get(world.url)).status).toBe(401);
  });

  it('a signed-out session: 401, including a copy of its cookie', async () => {
    const other = await finalThreePartyShoot(HUB);
    const copy = new Browser();
    for (const [name, value] of other.browser.a.jar) copy.jar.set(name, value);
    expect((await copy.get(other.url)).status).toBe(200);
    expect((await other.browser.a.post('/sign-out')).status).toBe(200);
    expect((await other.browser.a.get(other.url)).status).toBe(401);
    expect((await copy.get(other.url)).status).toBe(401);
  });

  it('the demo operator is not a person in the shoot: the generic 404, like an unknown shoot', async () => {
    const op = await operator();
    expect(generic404(await op.get(world.url))).toBe(generic404(await op.get(`/shoots/${randomUUID()}/final-record`)));
  });

  it('an account in a different shoot: the generic 404, identical to an unknown shoot', async () => {
    const elsewhere = await finalThreePartyShoot(HUB);
    const hidden = await elsewhere.browser.a.get(world.url);
    expect(generic404(hidden)).toBe(generic404(await elsewhere.browser.a.get(`/shoots/${randomUUID()}/final-record`)));
    for (const value of Object.values(world.fee)) expect(hidden.body).not.toContain(value);
    // And that person's own record is still their own.
    expect((await recordOf(elsewhere, 'a')).body.record.partyId).toBe(elsewhere.party.a);
  });

  it('an account whose only shoot is still live: the generic 404', async () => {
    const op = await operator();
    const created = await op.post('/demo/shoots/scenarios', { card: 'straightforward' });
    expect(created.status, created.body).toBe(201);
    const shoot = JSON.parse(created.body) as { projectId: string; modelPartyId: string };
    const invited = await op.post(`/demo/shoots/${shoot.projectId}/invitations`);
    const credential = (JSON.parse(invited.body) as { invitations: { partyId: string; credential: string }[] }).invitations.find((i) => i.partyId === shoot.modelPartyId)!.credential;
    const unrelated = await signedIn(credential);
    const hidden = await unrelated.get(world.url);
    expect(generic404(hidden)).toBe(generic404(await unrelated.get(`/shoots/${randomUUID()}/final-record`)));
  });

  it('no route shape selects another person\'s view', async () => {
    const { res: own } = await recordOf(world, 'a');
    const stranger = world.party.b;
    const attempts = [
      `${world.url}?partyId=${stranger}`,
      `${world.url}?party=${stranger}&as=${stranger}`,
      `/shoots/${world.projectId}/as/${stranger}/final-record`,
      `${world.url}/${stranger}`,
      `/demo/shoots/${world.projectId}/as/${stranger}`,
      `/demo/shoots/${world.projectId}/as/${stranger}/final-record`,
    ];
    for (const attempt of attempts) {
      const res = await world.browser.a.get(attempt);
      expect({ attempt, leaked: res.body.includes(world.fee['b-c']!) }).toEqual({ attempt, leaked: false });
      // A refused shape, or this person's own view with the extra input ignored: never another's.
      if (res.status === 200) expect((JSON.parse(res.body) as FinalRecordBody).record.partyId).toBe(world.party.a);
      else expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect((await recordOf(world, 'a')).res.body).toBe(own.body);
  });

  it('a differently cased shoot id is the same record, for the same person only', async () => {
    const res = await world.browser.a.get(world.url.replace(world.projectId, world.projectId.toUpperCase()));
    expect(res.status).toBe(200);
    expect((JSON.parse(res.body) as FinalRecordBody).record.partyId).toBe(world.party.a);
    expect(res.body).not.toContain(world.fee['b-c']);
  });

  it('it is read-only: no method changes a stored record, and no signing or amending route exists', async () => {
    const counts = () => withClient(scratchMigrationUrl, async (c) => (await c.query<{ n: number }>('select (select count(*) from contract_item where contract_id = $1)::int + (select count(*) from contract_signature where contract_id = $1)::int as n', [world.evidence.contractId])).rows[0]!.n);
    const before = await counts();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const path of [world.url, `${world.url}/sign`, `${world.url}/amend`, `/shoots/${world.projectId}/sign`]) {
        const res = await world.browser.a.request(method, path);
        expect({ method, path, refused: res.status === 404 || res.status === 405 }).toEqual({ method, path, refused: true });
      }
    }
    expect(await counts()).toBe(before);
  });

  it('once final, the live brief is the generic 404 for each person: only the record remains', async () => {
    for (const name of NAMES) {
      const browser = world.browser[name];
      expect(generic404(await browser.get(`/shoots/${world.projectId}`))).toBe(generic404(await browser.get(`/shoots/${randomUUID()}`)));
    }
  });
});
