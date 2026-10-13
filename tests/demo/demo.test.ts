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
import { DEMO_OPERATOR, DemoGuardError, assertDemoTarget, demoDatabaseUrl, demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { loadDemoFixtures } from '../../src/demo/fixtures.ts';
import { demoOperations } from '../../src/demo/operations.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
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
  const demoUrl = demoDatabaseUrl('postgres://ms_runtime:pw@127.0.0.1:5432/modeling_standard');

  it('points the configured credentials at the demo database', () => {
    expect(new URL(demoUrl).pathname).toBe('/modeling_standard_demo');
    expect(new URL(demoUrl).username).toBe('ms_runtime');
  });

  it('accepts loopback and the demo database only', () => {
    for (const host of ['127.0.0.1', '::1', 'localhost']) expect(() => assertDemoTarget({ host, databaseUrl: demoUrl })).not.toThrow();
    for (const host of ['0.0.0.0', '192.168.1.10', 'example.com', '']) {
      expect(() => assertDemoTarget({ host, databaseUrl: demoUrl })).toThrow(DemoGuardError);
    }
    for (const db of ['modeling_standard', 'modeling_standard_test', 'modeling_standard_demo2', 'postgres']) {
      const url = `postgres://ms_runtime:pw@127.0.0.1:5432/${db}`;
      expect(() => assertDemoTarget({ host: '127.0.0.1', databaseUrl: url })).toThrow(DemoGuardError);
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
    const body = res.json<{ project: unknown; parties: { id: string }[]; agreements: unknown }>();
    expect(Object.keys(body).sort()).toEqual(['agreements', 'parties', 'project']);
    expect(body.project).toEqual({ id: projectId });
    expect(body.parties.map((p) => p.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(body.agreements).toEqual([{ id: ac.id, partyIds: [...ac.partyIds] }]);
    expect(res.body).not.toMatch(/created|principal|role|payer|signed/i);
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
    expect(ids).toHaveLength(3);
    const res = await demoApp.inject({ method: 'GET', url: '/demo/projects' });
    const listed = new Map(res.json<{ projects: { id: string; partyCount: number; agreementCount: number }[] }>().projects.map((p) => [p.id, p]));
    for (const id of ids) {
      const project = listed.get(id);
      const note = annotations.projects[id]!;
      expect(project).toEqual({ id, partyCount: Object.keys(note.parties).length, agreementCount: Object.keys(note.agreements).length });
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
    expect(await record.json()).toEqual({ project: { id }, parties: [], agreements: [] });
  });

  it('keep the boundary: strict input, no other methods, an empty fixture when none is written', async () => {
    const invalid = await fetch(`${base}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"role":"photographer"}' });
    expect(invalid.status).toBe(400);
    expect((await fetch(`${base}/projects`, { method: 'PUT' })).status).toBe(405);
    expect(await (await fetch(`${base}/fixture.json`)).json()).toEqual({ projects: {} });
  });
});
