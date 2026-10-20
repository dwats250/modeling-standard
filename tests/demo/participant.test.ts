import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { findLiveBriefForProject } from '../../src/briefs/brief.ts';
import { listBriefTicks } from '../../src/briefs/live.ts';
import { demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { loadDemoFixtures, type FixtureAnnotations } from '../../src/demo/fixtures.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { participantOperations } from '../../src/demo/participant.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';
import { LogCapture, PRINCIPAL_HEADER, headerPrincipal, startTestApp, type TestApp } from '../support/app.ts';

/**
 * The participant screens' HTTP layer (`/demo/shoots/:projectId/as/:partyId…`):
 * party-filtered reads, the visibility pre-check that answers a hidden item
 * exactly as a nonexistent one, permitted actions, the S09 acts through
 * the participant routes, readiness only for two parties and one pair, and
 * production isolation. Real database, real application.
 */

let database: DatabaseHandle;
let app: FastifyInstance;
let fixtures: FixtureAnnotations;
const logs = new LogCapture();

beforeAll(async () => {
  const logger = createLogger('info', logs);
  database = openDatabase(inject('runtimeUrl'), logger);
  app = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: createDemoOperations(temporaryAnnotationStore()) });
  await app.ready();
  fixtures = await loadDemoFixtures(app, database.db);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

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
  between: [string, string] | null;
  subjectPartyId: string | null;
  shape: string | null;
  itemKey: string | null;
  deliberate: boolean;
  content: string | null;
  value: string | null;
  pending: string | null;
  approverIds: string[];
  tickedBy: string[];
  green: boolean;
  actions: Actions;
}
interface View {
  projectId: string;
  partyId: string;
  phase: 'live';
  parties: { id: string; onSite: boolean | null }[];
  items: Item[];
  progress: { green: number; total: number; open: number };
  ready?: boolean;
}
interface Res {
  status: number;
  body: string;
  json: () => unknown;
}

async function call(method: 'GET' | 'POST', url: string, payload?: object): Promise<Res> {
  const res = await app.inject({ method, url, ...(payload === undefined ? {} : { payload }) });
  return { status: res.statusCode, body: res.body, json: () => res.json() };
}
const post = (url: string, payload: object = {}) => call('POST', url, payload);
const code = (res: Res) => (res.json() as { error?: { code: string } }).error?.code;

async function view(projectId: string, partyId: string): Promise<View> {
  const res = await call('GET', `/demo/shoots/${projectId}/as/${partyId}`);
  expect(res.status).toBe(200);
  return res.json() as View;
}

/** The generic 404 body with its per-request id removed: what must be identical. */
function generic404(res: Res): string {
  expect(res.status).toBe(404);
  return res.body.replace(/"requestId":"[0-9a-f-]{36}"/, '"requestId":"…"');
}

async function briefIdOf(projectId: string): Promise<string> {
  return (await findLiveBriefForProject(database.db, projectId))!.id;
}

/** Operator-level: every party on site, then share (existing simulator routes). */
async function presenceAndShare(projectId: string, partyIds: readonly string[]): Promise<void> {
  const briefId = await briefIdOf(projectId);
  for (const partyId of partyIds) expect((await post(`/demo/sim/briefs/${briefId}/presence`, { partyId, onSite: true })).status).toBe(200);
  expect((await post(`/demo/sim/briefs/${briefId}/share`)).status).toBe(200);
}

async function card(name: 'straightforward' | 'unresolved' | 'declined') {
  const res = await post('/demo/shoots/scenarios', { card: name });
  expect(res.status).toBe(201);
  return res.json() as { projectId: string; photographerPartyId: string; modelPartyId: string };
}

function fixture(prefix: string) {
  const [projectId, annotation] = Object.entries(fixtures.projects).find(([, a]) => a.title.startsWith(prefix))!;
  const byLabel = Object.fromEntries(Object.entries(annotation.parties).map(([id, label]) => [label, id]));
  return { projectId, byLabel };
}

describe('participant read', () => {
  it('returns exactly the declared fields: no pair-scope record id, no position, no history', async () => {
    const s = await card('unresolved');
    const res = await call('GET', `/demo/shoots/${s.projectId}/as/${s.modelPartyId}`);
    expect(res.status).toBe(200);
    const body = res.json() as View;
    expect(Object.keys(body).sort()).toEqual(['items', 'parties', 'partyId', 'phase', 'progress', 'projectId', 'ready']);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['actions', 'approverIds', 'between', 'content', 'deliberate', 'green', 'id', 'itemKey', 'layer', 'pending', 'shape', 'subjectPartyId', 'tickedBy', 'value'].sort(),
      );
    }
    // (`decline` is a permitted-action key; nothing records that anything was declined.)
    expect(res.body).not.toMatch(/pairwiseAgreement|position|created|updated|_at"|author|proposer|history|declined|version|signed|required|principal/i);
  });

  it('changes content and permitted actions with the simulated party', async () => {
    const s = await card('unresolved');
    const model = await view(s.projectId, s.modelPartyId);
    const photographer = await view(s.projectId, s.photographerPartyId);
    expect(model.partyId).toBe(s.modelPartyId);
    expect(photographer.partyId).toBe(s.photographerPartyId);
    // Two parties, one pair: both see every item, in the same order.
    expect(model.items.map((i) => i.id)).toEqual(photographer.items.map((i) => i.id));
    const parameter = (v: View) => v.items.find((i) => i.shape === 'open_parameter')!;
    const request = (v: View) => v.items.find((i) => i.shape === 'request')!;
    expect(parameter(model).actions.setParameter).toBe(true);
    expect(parameter(photographer).actions.setParameter).toBe(false);
    expect(request(model).actions.decline).toBe(true);
    expect(request(photographer).actions.decline).toBe(false);
    // Pending items cannot be ticked by anyone; settled ones by their approvers.
    for (const v of [model, photographer]) {
      for (const item of v.items) {
        expect({ id: item.id, tick: item.actions.tick }).toEqual({ id: item.id, tick: item.pending === null && item.approverIds.includes(v.partyId) });
        expect(item.actions.groupCheck).toBe(item.actions.tick && !item.deliberate);
      }
    }
    expect(model.ready).toBe(false);
    expect(model.progress).toEqual({ green: 0, total: model.items.length, open: 2 });
  });

  it('answers 404 for a non-member party, a draft brief, an unknown project and an unknown party alike', async () => {
    const live = await card('unresolved');
    const draft = await card('straightforward');
    const otherShoot = await card('unresolved');
    const baseline = generic404(await call('GET', `/demo/shoots/${randomUUID()}/as/${randomUUID()}`));
    for (const url of [
      `/demo/shoots/${live.projectId}/as/${otherShoot.modelPartyId}`, // a party of another project
      `/demo/shoots/${live.projectId}/as/${randomUUID()}`,
      `/demo/shoots/${draft.projectId}/as/${draft.modelPartyId}`, // the brief is a draft
      `/demo/shoots/${randomUUID()}/as/${live.modelPartyId}`,
    ]) {
      expect({ url, body: generic404(await call('GET', url)) }).toEqual({ url, body: baseline });
    }
  });

  it('rejects malformed ids and undeclared input before anything else', async () => {
    const s = await card('unresolved');
    expect((await call('GET', `/demo/shoots/${s.projectId}/as/not-a-uuid`)).status).toBe(400);
    expect((await call('GET', `/demo/shoots/${s.projectId}/as/${s.modelPartyId}?all=true`)).status).toBe(400);
    const item = (await view(s.projectId, s.modelPartyId)).items[0]!;
    expect((await post(`/demo/shoots/${s.projectId}/as/${s.modelPartyId}/items/${item.id}/tick`, { partyId: s.photographerPartyId })).status).toBe(400);
  });
});

describe('privacy tampering on the three-person fee case (Fixture 2, driven to live)', () => {
  let projectId: string;
  let a: string;
  let b: string;
  let c: string;
  let feeAC: Item;
  let feeBC: Item;
  let baseline: string;

  beforeAll(async () => {
    const f = fixture('Fixture 2');
    projectId = f.projectId;
    [a, b, c] = [f.byLabel['Party A']!, f.byLabel['Party B']!, f.byLabel['Party C']!];
    await presenceAndShare(projectId, [a, b, c]);
    const asC = await view(projectId, c);
    const fees = asC.items.filter((i) => i.layer === 'money');
    expect(fees).toHaveLength(2);
    feeAC = fees.find((i) => i.between!.includes(a))!;
    feeBC = fees.find((i) => i.between!.includes(b))!;
    baseline = generic404(await post(`/demo/shoots/${projectId}/as/${b}/items/${randomUUID()}/tick`));
  });

  it('leaves another pair’s fee out of the payload entirely, and gives no readiness', async () => {
    const asB = await call('GET', `/demo/shoots/${projectId}/as/${b}`);
    expect(asB.body).not.toContain(feeAC.id);
    expect(asB.body).not.toContain('[synthetic] 300');
    const asA = await call('GET', `/demo/shoots/${projectId}/as/${a}`);
    expect(asA.body).not.toContain(feeBC.id);
    for (const res of [asA, asB]) {
      const body = res.json() as View;
      expect(body.items.filter((i) => i.layer === 'money')).toHaveLength(1);
      expect('ready' in body).toBe(false);
      expect(res.body).not.toMatch(/"ready"/);
      // Counts are over the visible items only.
      expect(body.progress.total).toBe(body.items.length);
    }
    const asC = await view(projectId, c);
    expect('ready' in asC).toBe(false);
  });

  it('answers every act on a hidden item with the same 404 as a nonexistent id, and changes nothing', async () => {
    const ticksBefore = await listBriefTicks(database.db, await briefIdOf(projectId));
    const visibleOrdinary = (await view(projectId, b)).items.find((i) => i.actions.groupCheck)!;
    const attempts: [string, object][] = [
      [`/demo/shoots/${projectId}/as/${b}/items/${feeAC.id}/tick`, {}],
      [`/demo/shoots/${projectId}/as/${b}/items/${feeAC.id}/untick`, {}],
      [`/demo/shoots/${projectId}/as/${b}/items/${feeAC.id}/decline`, {}],
      [`/demo/shoots/${projectId}/as/${b}/items/${feeAC.id}/parameter`, { value: '[synthetic] x' }],
      // The hidden fee is a deliberate-tick key: without the pre-check this
      // would answer deliberate_tick and reveal it.
      [`/demo/shoots/${projectId}/as/${b}/group-check`, { itemIds: [feeAC.id] }],
      [`/demo/shoots/${projectId}/as/${b}/group-check`, { itemIds: [visibleOrdinary.id, feeAC.id] }],
      [`/demo/shoots/${projectId}/as/${a}/items/${feeBC.id}/tick`, {}],
      [`/demo/shoots/${projectId}/as/${b}/group-check`, { itemIds: [randomUUID()] }],
      [`/demo/shoots/${projectId}/as/${randomUUID()}/items/${feeAC.id}/tick`, {}],
      [`/demo/shoots/${randomUUID()}/as/${b}/items/${feeAC.id}/tick`, {}],
    ];
    for (const [url, payload] of attempts) {
      expect({ url, payload, body: generic404(await post(url, payload)) }).toEqual({ url, payload, body: baseline });
    }
    expect(await listBriefTicks(database.db, await briefIdOf(projectId))).toEqual(ticksBefore);
  });

  it('lets C tick both fees and A and B each only their own', async () => {
    expect((await post(`/demo/shoots/${projectId}/as/${c}/items/${feeAC.id}/tick`)).status).toBe(200);
    expect((await post(`/demo/shoots/${projectId}/as/${a}/items/${feeAC.id}/tick`)).status).toBe(200);
    const asA = await view(projectId, a);
    expect(asA.items.find((i) => i.id === feeAC.id)!.green).toBe(true);
    // B–C is still to decide together: nobody can tick it yet.
    expect(code(await post(`/demo/shoots/${projectId}/as/${b}/items/${feeBC.id}/tick`))).toBe('still_pending');
  });
});

describe('live resolution through the participant routes', () => {
  it('goes from shared to READY TO SIGN, loses readiness on untick and regains it on retick', async () => {
    const s = await card('unresolved');
    const [p, m] = [s.photographerPartyId, s.modelPartyId];
    const as = (party: string) => `/demo/shoots/${s.projectId}/as/${party}`;
    let v = await view(s.projectId, m);
    const parameter = v.items.find((i) => i.shape === 'open_parameter')!;
    const together = v.items.find((i) => i.pending === 'decide_together')!;
    const request = v.items.find((i) => i.shape === 'request')!;
    const declaration = v.items.find((i) => i.shape === 'declaration')!;

    // Subject-only acts; stable 409s for everyone else.
    expect(code(await post(`${as(p)}/items/${parameter.id}/parameter`, { value: '[synthetic] 3' }))).toBe('not_subject');
    expect(code(await post(`${as(p)}/items/${request.id}/decline`))).toBe('not_subject');
    expect(code(await post(`${as(m)}/items/${declaration.id}/decline`))).toBe('not_request');
    expect(code(await post(`${as(m)}/items/${together.id}/tick`))).toBe('still_pending');
    expect(code(await post(`${as(m)}/items/${together.id}/parameter`, { value: '[synthetic] x' }))).toBe('not_open_parameter');
    expect((await post(`${as(m)}/items/${parameter.id}/parameter`, { value: '   ' })).status).toBe(400);

    // The model sets her open parameter; the act answers with the new view.
    const after = await post(`${as(m)}/items/${parameter.id}/parameter`, { value: '[synthetic] Level 2' });
    expect(after.status).toBe(200);
    expect((after.json() as View).items.find((i) => i.id === parameter.id)!).toMatchObject({ pending: null, value: '[synthetic] Level 2' });

    // Settling a decide-together value is not a party act: there is no
    // participant route for it, only the operator's simulation control.
    expect((await post(`${as(m)}/items/${together.id}/settle`, { value: '[synthetic] x' })).status).toBe(404);
    expect((await post(`/demo/sim/items/${together.id}/settle`, { value: '[synthetic] Within two weeks' })).status).toBe(200);

    // Group-check is all or none: a deliberate item in the selection refuses the lot.
    v = await view(s.projectId, p);
    const ordinary = v.items.filter((i) => i.actions.groupCheck).map((i) => i.id);
    const deliberate = v.items.filter((i) => i.deliberate);
    expect(deliberate.map((i) => i.itemKey).sort()).toEqual(['coverage_level', 'fee']);
    const ticksBefore = await listBriefTicks(database.db, await briefIdOf(s.projectId));
    expect(code(await post(`${as(p)}/group-check`, { itemIds: [...ordinary, deliberate[0]!.id] }))).toBe('deliberate_tick');
    expect(await listBriefTicks(database.db, await briefIdOf(s.projectId))).toEqual(ticksBefore);

    for (const party of [p, m]) {
      const mine = (await view(s.projectId, party)).items.filter((i) => i.actions.groupCheck).map((i) => i.id);
      expect((await post(`${as(party)}/group-check`, { itemIds: mine })).status).toBe(200);
      for (const item of deliberate) expect((await post(`${as(party)}/items/${item.id}/tick`)).status).toBe(200);
    }
    v = await view(s.projectId, m);
    expect(v.items.every((i) => i.green)).toBe(true);
    expect(v.ready).toBe(true);
    expect((await view(s.projectId, p)).ready).toBe(true);

    // Untick loses readiness; retick restores it. Untick is idempotent.
    const fee = deliberate.find((i) => i.itemKey === 'fee')!;
    const unticked = await post(`${as(m)}/items/${fee.id}/untick`);
    expect((unticked.json() as View).ready).toBe(false);
    expect((await post(`${as(m)}/items/${fee.id}/untick`)).status).toBe(200);
    expect((await view(s.projectId, p)).ready).toBe(false);
    expect(((await post(`${as(m)}/items/${fee.id}/tick`)).json() as View).ready).toBe(true);
  });

  it('declines: only the subject; the request and its ticks vanish, with no gap and no trace', async () => {
    const s = await card('unresolved');
    const as = (party: string) => `/demo/shoots/${s.projectId}/as/${party}`;
    const before = await view(s.projectId, s.modelPartyId);
    const request = before.items.find((i) => i.shape === 'request')!;
    expect((await post(`${as(s.photographerPartyId)}/items/${request.id}/tick`)).status).toBe(200);
    const declined = await post(`${as(s.modelPartyId)}/items/${request.id}/decline`);
    expect(declined.status).toBe(200);
    expect(declined.body).not.toContain(request.id);
    expect(declined.body).not.toMatch(/declined|removed|history/i);
    const after = (await view(s.projectId, s.photographerPartyId)).items.map((i) => i.id);
    expect(after).toEqual(before.items.map((i) => i.id).filter((id) => id !== request.id));
    expect((await listBriefTicks(database.db, await briefIdOf(s.projectId))).map((t) => t.briefItemId)).not.toContain(request.id);
    // Gone is gone: the same 404 as an id that never existed.
    const baseline = generic404(await post(`${as(s.modelPartyId)}/items/${randomUUID()}/decline`));
    expect(generic404(await post(`${as(s.modelPartyId)}/items/${request.id}/decline`))).toBe(baseline);
  });

  it('refuses a universal tick from a party who is not on site', async () => {
    const s = await card('straightforward');
    const briefId = await briefIdOf(s.projectId);
    expect((await post(`/demo/sim/briefs/${briefId}/presence`, { partyId: s.photographerPartyId, onSite: false })).status).toBe(200);
    expect((await post(`/demo/sim/briefs/${briefId}/presence`, { partyId: s.modelPartyId, onSite: true })).status).toBe(200);
    expect((await post(`/demo/sim/briefs/${briefId}/share`)).status).toBe(200);
    const v = await view(s.projectId, s.photographerPartyId);
    const universal = v.items.filter((i) => i.layer === 'universal');
    expect(universal.length).toBeGreaterThan(0);
    for (const item of universal) {
      expect(item.approverIds).toEqual([s.modelPartyId]);
      expect(item.actions.tick).toBe(false);
      expect(code(await post(`/demo/shoots/${s.projectId}/as/${s.photographerPartyId}/items/${item.id}/tick`))).toBe('not_an_approver');
    }
  });

  it('logs decline routes as request lines only, with no item content', async () => {
    const s = await card('unresolved');
    const request = (await view(s.projectId, s.modelPartyId)).items.find((i) => i.shape === 'request')!;
    expect((await post(`/demo/shoots/${s.projectId}/as/${s.modelPartyId}/items/${request.id}/decline`)).status).toBe(200);
    expect(logs.text()).not.toContain(request.content!);
  });
});

describe('separation', () => {
  it('registers the participant routes only in the demo, protected', () => {
    for (const op of participantOperations) {
      expect(op.path.startsWith('/demo/shoots/:projectId/as/:partyId')).toBe(true);
      expect(op.access.kind).toBe('protected');
    }
  });

  it('serves none of the new demo routes from the production application', async () => {
    let production: TestApp | undefined;
    try {
      production = await startTestApp();
      const id = randomUUID();
      for (const op of createDemoOperations(temporaryAnnotationStore())) {
        const url = op.path.replace(/:[a-zA-Z]+/g, id);
        const res = await production.app.inject({ method: op.method, url, headers: { [PRINCIPAL_HEADER]: 'someone' }, ...(op.method === 'POST' ? { payload: {} } : {}) });
        expect({ op: op.name, status: res.statusCode }).toEqual({ op: op.name, status: 404 });
      }
    } finally {
      await production?.close();
    }
  });

  it('is creator-only: another operator gets 403, not the shoot', async () => {
    const logger = createLogger('info', new LogCapture());
    const scoped = createApp({ db: database.db, logger, resolvePrincipal: headerPrincipal, additionalOperations: createDemoOperations(temporaryAnnotationStore()) });
    await scoped.ready();
    try {
      const s = await card('unresolved');
      const res = await scoped.inject({ method: 'GET', url: `/demo/shoots/${s.projectId}/as/${s.modelPartyId}`, headers: { [PRINCIPAL_HEADER]: `other-${randomUUID()}` } });
      expect(res.statusCode).toBe(403);
      const anonymous = await scoped.inject({ method: 'GET', url: `/demo/shoots/${s.projectId}/as/${s.modelPartyId}` });
      expect(anonymous.statusCode).toBe(401);
    } finally {
      await scoped.close();
    }
  });
});
