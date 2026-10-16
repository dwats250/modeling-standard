import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { operations } from '../../src/app/operation-list.ts';
import { DEMO_OPERATOR, DemoGuardError, assertLoopbackListenHost, demoDatabaseTarget, demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { loadDemoFixtures } from '../../src/demo/fixtures.ts';
import { demoOperations } from '../../src/demo/operations.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { addBriefItem, openLiveBrief } from '../../src/briefs/brief.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { LogCapture, PRINCIPAL_HEADER, headerPrincipal } from '../support/app.ts';

/**
 * The local synthetic demo: it never reaches production, it runs only on
 * loopback against the demo database, its operations hold the same boundary
 * as production ones, and its fixtures go through the real create operation.
 */

let database: DatabaseHandle;
let app: FastifyInstance;

beforeAll(async () => {
  const logger = createLogger('info', new LogCapture());
  database = openDatabase(inject('runtimeUrl'), logger);
  app = createApp({ db: database.db, logger, resolvePrincipal: headerPrincipal, additionalOperations: demoOperations });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const as = (principal: string): Record<string, string> => ({ [PRINCIPAL_HEADER]: principal });
const newPrincipal = (): string => `principal-${randomUUID()}`;

async function createProjectAs(principal: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/projects', headers: as(principal), payload: {} });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

describe('separation from production', () => {
  it('keeps every demo operation out of the production operation list', () => {
    const productionNames = new Set(operations.map((op) => op.name));
    for (const op of demoOperations) expect(productionNames.has(op.name)).toBe(false);
    expect(operations.some((op) => op.path.startsWith('/demo'))).toBe(false);
  });

  it('never imports demo code from the production entry point or composition', async () => {
    for (const file of ['src/main.ts', 'src/app/create-app.ts', 'src/app/operation-list.ts']) {
      const source = await readFile(file, 'utf8');
      expect({ file, importsDemo: /from ['"][^'"]*demo\//.test(source) }).toEqual({ file, importsDemo: false });
    }
  });

  it('excludes demo code from the production build', async () => {
    const build = JSON.parse(await readFile('tsconfig.build.json', 'utf8')) as { exclude?: string[] };
    expect(build.exclude).toEqual(expect.arrayContaining(['src/demo', 'src/scripts/demo.ts', 'src/scripts/demo-reset.ts']));
  });

  it('declares every demo operation as protected', () => {
    for (const op of demoOperations) expect({ name: op.name, kind: op.access.kind }).toEqual({ name: op.name, kind: 'protected' });
  });
});

describe('demo guards', () => {
  it('serves on loopback only', () => {
    for (const host of ['127.0.0.1', '::1', 'localhost']) expect(() => assertLoopbackListenHost(host)).not.toThrow();
    for (const host of ['0.0.0.0', '192.168.1.10', 'example.com', '']) expect(() => assertLoopbackListenHost(host)).toThrow(DemoGuardError);
  });

  it('points the configured credentials at the demo database, whatever database the URL names', () => {
    for (const db of ['modeling_standard', 'postgres', 'modeling_standard_demo']) {
      const target = demoDatabaseTarget(`postgres://ms_runtime:pw@127.0.0.1:5432/${db}?database=other`);
      expect(target).toEqual({ host: '127.0.0.1', port: 5432, database: 'modeling_standard_demo', user: 'ms_runtime', password: 'pw' });
    }
  });

  it('uses one fixed operator for every request', () => {
    expect(demoOperatorPrincipal({} as never)).toBe(DEMO_OPERATOR);
  });
});

describe('demo inspector operations', () => {
  it('reject a missing principal', async () => {
    for (const url of ['/demo/projects', `/demo/projects/${randomUUID()}/record`]) {
      const res = await app.inject({ method: 'GET', url });
      expect({ url, status: res.statusCode }).toEqual({ url, status: 401 });
    }
  });

  it("list only the requesting principal's own projects, with counts", async () => {
    const me = newPrincipal();
    const other = newPrincipal();
    const mine = await createProjectAs(me);
    await createProjectAs(other);
    const [p1, p2] = [await addProjectParty(database.db, mine), await addProjectParty(database.db, mine)];
    await createPairwiseAgreement(database.db, mine, [p1.id, p2.id]);

    const res = await app.inject({ method: 'GET', url: '/demo/projects', headers: as(me) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ projects: [{ id: mine, partyCount: 2, agreementCount: 1 }] });
    expect(res.body).not.toContain(me);
  });

  it('read the stored record for the creator, with exactly the declared fields', async () => {
    const me = newPrincipal();
    const projectId = await createProjectAs(me);
    const a = await addProjectParty(database.db, projectId);
    const b = await addProjectParty(database.db, projectId);
    const c = await addProjectParty(database.db, projectId);
    const ac = await createPairwiseAgreement(database.db, projectId, [a.id, c.id]);

    const res = await app.inject({ method: 'GET', url: `/demo/projects/${projectId}/record`, headers: as(me) });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ project: unknown; parties: { id: string }[]; agreements: unknown; brief: unknown }>();
    expect(Object.keys(body).sort()).toEqual(['agreements', 'brief', 'parties', 'project']);
    expect(body.project).toEqual({ id: projectId });
    expect(body.parties.map((p) => p.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(body.agreements).toEqual([{ id: ac.id, partyIds: [...ac.partyIds] }]);
    expect(body.brief).toBeNull();
    expect(res.body).not.toMatch(/created|principal|role|payer|signed/i);
  });

  it('read the brief with exactly the stored item fields and their derived green state, in display order', async () => {
    const me = newPrincipal();
    const projectId = await createProjectAs(me);
    const a = await addProjectParty(database.db, projectId);
    const b = await addProjectParty(database.db, projectId);
    const pair = await createPairwiseAgreement(database.db, projectId, [a.id, b.id]);
    const brief = await openLiveBrief(database.db, projectId);
    const shared = await addBriefItem(database.db, brief.id, { layer: 'shared', content: '[synthetic] shared' });
    const fee = await addBriefItem(database.db, brief.id, { layer: 'money', pairwiseAgreementId: pair.id, itemKey: 'fee', value: '[synthetic] 1' });

    const res = await app.inject({ method: 'GET', url: `/demo/projects/${projectId}/record`, headers: as(me) });
    expect(res.statusCode).toBe(200);
    const { brief: dto } = res.json<{ brief: unknown }>();
    const fields = (item: typeof shared) => ({
      id: item.id,
      layer: item.layer,
      pairwiseAgreementId: item.pairwiseAgreementId,
      subjectPartyId: item.subjectPartyId,
      shape: item.shape,
      itemKey: item.itemKey,
      content: item.content,
      value: item.value,
      pending: item.pending,
      position: item.position,
      approverIds: [a.id, b.id].sort(),
      tickedBy: [],
      green: false,
    });
    expect(dto).toEqual({ id: brief.id, phase: 'draft', ready: false, presence: [], items: [fields(shared), fields(fee)] });
    // Current state only: nothing about time, authorship, history, finality or signatures.
    expect(res.body).not.toMatch(/created|updated|_at"|At"|author|proposer|affirm|version|final|required|signed|declin|history/i);
  });

  it('refuse another principal and an unknown project', async () => {
    const projectId = await createProjectAs(newPrincipal());
    const forbidden = await app.inject({ method: 'GET', url: `/demo/projects/${projectId}/record`, headers: as(newPrincipal()) });
    expect(forbidden.statusCode).toBe(403);
    const missing = await app.inject({ method: 'GET', url: `/demo/projects/${randomUUID()}/record`, headers: as(newPrincipal()) });
    expect(missing.statusCode).toBe(404);
  });

  it('reject undeclared input', async () => {
    const res = await app.inject({ method: 'GET', url: '/demo/projects?all=true', headers: as(newPrincipal()) });
    expect(res.statusCode).toBe(400);
    const bad = await app.inject({ method: 'GET', url: '/demo/projects/not-a-uuid/record', headers: as(newPrincipal()) });
    expect(bad.statusCode).toBe(400);
  });
});

describe('demo fixtures and server', () => {
  let demoApp: FastifyInstance;
  let server: Server;
  let base: string;
  let annotations: Awaited<ReturnType<typeof loadDemoFixtures>>;
  const fixturePath = join(tmpdir(), `ms-demo-fixture-${randomUUID()}.json`);

  beforeAll(async () => {
    const logger = createLogger('info', new LogCapture());
    demoApp = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: demoOperations });
    await demoApp.ready();
    annotations = await loadDemoFixtures(demoApp, database.db);
    server = createDemoServer({ app: demoApp, fixturePath });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await demoApp.close();
  });

  it('load three annotated projects through the real create operation', async () => {
    const ids = Object.keys(annotations.projects);
    expect(ids).toHaveLength(4);
    const res = await demoApp.inject({ method: 'GET', url: '/demo/projects' });
    const listed = new Map(res.json<{ projects: { id: string; partyCount: number; agreementCount: number }[] }>().projects.map((p) => [p.id, p]));
    for (const id of ids) {
      const project = listed.get(id);
      const note = annotations.projects[id]!;
      expect(project).toEqual({ id, partyCount: Object.keys(note.parties).length, agreementCount: Object.keys(note.agreements).length });
    }
  });

  it('build a brief per fixture project, by layer, with no fake no-means-no item', async () => {
    type Item = {
      layer: string;
      pairwiseAgreementId: string | null;
      subjectPartyId: string | null;
      shape: string | null;
      itemKey: string | null;
      content: string | null;
      value: string | null;
      pending: string | null;
    };
    type Rec = {
      parties: { id: string }[];
      agreements: { id: string; partyIds: [string, string] }[];
      brief: { phase: string; ready: boolean; items: (Item & { green: boolean })[] } | null;
    };
    const entries = Object.entries(annotations.projects);
    const recordOf = async (prefix: string): Promise<Rec> => {
      const [id] = entries.find(([, a]) => a.title.startsWith(prefix))!;
      return (await demoApp.inject({ method: 'GET', url: `/demo/projects/${id}/record` })).json<Rec>();
    };

    const d01 = await recordOf('Fixture 1');
    const items = d01.brief!.items;
    // A shared project-wide item; a universal item with a subject; a
    // pair-scoped shared request with a subject; an open parameter awaiting
    // its subject; a decide-together item. D01 had no money, so no fee.
    expect(items.some((i) => i.layer === 'shared' && !i.pairwiseAgreementId && !i.subjectPartyId && !i.pending)).toBe(true);
    expect(items.some((i) => i.layer === 'universal' && i.subjectPartyId && i.shape === 'declaration')).toBe(true);
    expect(items.some((i) => i.layer === 'shared' && i.pairwiseAgreementId && i.subjectPartyId && i.shape === 'request')).toBe(true);
    expect(items.some((i) => i.shape === 'open_parameter' && i.pending === 'subject' && i.value === null)).toBe(true);
    expect(items.some((i) => i.pending === 'decide_together' && i.value === null)).toBe(true);
    expect(items.filter((i) => i.layer === 'money')).toEqual([]);

    const topo = await recordOf('Fixture 2');
    const fees = topo.brief!.items.filter((i) => i.layer === 'money');
    // One fee per pair, each private to its pair.
    expect(fees.map((f) => f.pairwiseAgreementId).sort()).toEqual(topo.agreements.map((a) => a.id).sort());
    expect(fees.every((f) => f.itemKey === 'fee')).toBe(true);

    const empty = await recordOf('Fixture 3');
    expect(empty.brief).toEqual({ id: expect.any(String), phase: 'draft', ready: false, presence: [], items: [] });

    // Fixture 4: the walkthrough finished — live, resolved, the request gone, everything green.
    const done = (await recordOf('Fixture 4')).brief!;
    expect(done.phase).toBe('live');
    expect(done.ready).toBe(true);
    expect(done.items.every((i) => i.green && i.pending === null)).toBe(true);
    expect(done.items.filter((i) => i.shape === 'request')).toEqual([]);
    expect(done.items.filter((i) => i.layer === 'money')).toHaveLength(1);

    const all = [...items, ...topo.brief!.items, ...done.items];
    // There is no no-means-no item, and every stored text is marked synthetic.
    expect(all.filter((i) => i.itemKey === 'no_means_no')).toEqual([]);
    for (const text of all.flatMap((i) => [i.content, i.value]).filter((t) => t !== null)) {
      expect(text).toMatch(/^\[synthetic\] /);
    }
  });

  it('serve the inspector with restrictive headers', async () => {
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await page.text()).toContain('Synthetic demo');
    for (const asset of ['/app.js', '/styles.css']) expect((await fetch(`${base}${asset}`)).status).toBe(200);
  });

  it('pass API requests to the application as the demo operator', async () => {
    const created = await fetch(`${base}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const record = await fetch(`${base}/demo/projects/${id}/record`);
    expect(record.status).toBe(200);
    expect(await record.json()).toEqual({ project: { id }, parties: [], agreements: [], brief: null });
  });

  it('refuse a Host header that is not this loopback server (DNS rebinding)', async () => {
    const { request } = await import('node:http');
    const port = (server.address() as AddressInfo).port;
    const statusFor = (host: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: '/demo/projects', headers: { host } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
    expect(await statusFor('evil.example.com')).toBe(421);
    expect(await statusFor(`evil.example.com:${port}`)).toBe(421);
    expect(await statusFor(`127.0.0.1:${port + 1}`)).toBe(421);
    // Malformed authorities that a URL parser would have read as loopback (Astra B01).
    for (const host of [`evil@127.0.0.1:${port}`, `127.0.0.1:${port}/evil`, `127.0.0.1:${port}?x=1`, `127.0.0.1:${port}#x`, `127.0.0.1:0${port}`]) {
      expect({ host, status: await statusFor(host) }).toEqual({ host, status: 421 });
    }
    expect(await statusFor(`localhost:${port}`)).toBe(200);
    expect(await statusFor(`127.0.0.1:${port}`)).toBe(200);
    expect(await statusFor(`[::1]:${port}`)).toBe(200);
  });

  it('keep the boundary: strict input, no other methods, an empty fixture when none is written', async () => {
    const invalid = await fetch(`${base}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"role":"photographer"}' });
    expect(invalid.status).toBe(400);
    expect((await fetch(`${base}/projects`, { method: 'PUT' })).status).toBe(405);
    expect(await (await fetch(`${base}/fixture.json`)).json()).toEqual({ projects: {} });
  });
});
