import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { z } from 'zod';
import { operations } from '../../src/app/operation-list.ts';
import { runMigrations } from '../../src/infrastructure/database/migrate.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { createProjectOperation, readProjectOperation } from '../../src/projects/project.ts';
import { project, projectParty } from '../../src/projects/tables.ts';
import { PRINCIPAL_HEADER, startTestApp, type TestApp } from '../support/app.ts';
import { withClient } from '../support/sql.ts';
import { withDatabase } from '../support/urls.ts';

/**
 * S01 projects through the real application boundary: the production
 * `createApp` and operation list against real PostgreSQL, with synthetic
 * principals.
 */

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

/** A principal unique to one test, so database assertions cannot see other tests' rows. */
const newPrincipal = (): string => `projects-${randomUUID()}`;
const as = (principal: string) => ({ [PRINCIPAL_HEADER]: principal });

async function createAs(principal: string): Promise<{ id: string }> {
  const res = await t.app.inject({ method: 'POST', url: '/projects', headers: as(principal), payload: {} });
  expect(res.statusCode).toBe(201);
  return res.json();
}

async function projectsCreatedBy(principal: string): Promise<number> {
  const [row] = await t.database.db
    .select({ n: count() })
    .from(project)
    .where(eq(project.createdByPrincipalId, principal));
  return row?.n ?? 0;
}

/** The keys of an operation's declared output, which registration requires to be a strict object. */
function outputKeys(schema: z.ZodType<unknown>): string[] {
  if (!(schema instanceof z.ZodObject)) throw new Error('output is not an object schema');
  return Object.keys(schema.shape);
}

/** Same words as the schema test: semantics S01 must not carry. */
const EXCLUDED_SEMANTICS = [
  'payer', 'payee', 'pay', 'photographer', 'model', 'concept', 'author', 'role',
  'compensation', 'term', 'obligation', 'usage', 'right', 'deliverable',
  'sign', 'accept', 'affirm', 'witness', 'agree',
  'youth', 'guardian', 'minor', 'proxy', 'represent',
  'posted', 'direct', 'invite', 'email', 'account', 'person', 'identity', 'verif',
];

describe('creating a project', () => {
  it('works for a synthetic principal through the protected HTTP boundary', async () => {
    const creator = newPrincipal();
    const res = await t.app.inject({ method: 'POST', url: '/projects', headers: as(creator), payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String) });
    expect(res.json().id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('records the creator as an internal fact and withholds it and the audit time from the response', async () => {
    const creator = newPrincipal();
    const res = await t.app.inject({ method: 'POST', url: '/projects', headers: as(creator), payload: {} });
    const body = res.json();
    expect(Object.keys(body)).toEqual(['id']);
    expect(res.body).not.toContain(creator);
    expect(res.body).not.toMatch(/created|principal/i);

    const [row] = await t.database.db.select().from(project).where(eq(project.id, body.id));
    expect(row?.createdByPrincipalId).toBe(creator);
  });

  it('accepts an omitted body as no fields', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/projects', headers: as(newPrincipal()) });
    expect(res.statusCode).toBe(201);
  });

  it('does not make the creator a party, or create any party', async () => {
    const created = await createAs(newPrincipal());
    const parties = await t.database.db.select().from(projectParty).where(eq(projectParty.projectId, created.id));
    expect(parties).toEqual([]);
  });

  it('rejects every field, including creator, role, payment or signature fields, writing nothing', async () => {
    const attempts: Record<string, unknown>[] = [
      { createdByPrincipalId: 'someone-else' },
      { title: 'A shoot' },
      { creatorRole: 'photographer' },
      { payer: 'creator' },
      { parties: [{ role: 'model' }] },
      { signedBy: 'creator' },
      { distribution: 'posted' },
    ];
    for (const payload of attempts) {
      const creator = newPrincipal();
      const res = await t.app.inject({ method: 'POST', url: '/projects', headers: as(creator), payload });
      expect({ payload, status: res.statusCode }).toEqual({ payload, status: 400 });
      expect(res.json().error.code).toBe('invalid_input');
      expect(res.json().error.issues[0]).toMatchObject({ location: 'body' });
      expect(await projectsCreatedBy(creator)).toBe(0);
    }
  });

  it('rejects a body that is not an object, and undeclared query parameters', async () => {
    const creator = newPrincipal();
    const array = await t.app.inject({
      method: 'POST',
      url: '/projects',
      headers: { ...as(creator), 'content-type': 'application/json' },
      payload: '[]',
    });
    expect(array.statusCode).toBe(400);
    const query = await t.app.inject({ method: 'POST', url: '/projects?asPhotographer=true', headers: as(creator), payload: {} });
    expect(query.statusCode).toBe(400);
    expect(query.json().error.issues[0]).toMatchObject({ location: 'query' });
    expect(await projectsCreatedBy(creator)).toBe(0);
  });
});

describe('reading a project', () => {
  it('lets the creator read it, with exactly the declared fields', async () => {
    const creator = newPrincipal();
    const created = await createAs(creator);
    const res = await t.app.inject({ method: 'GET', url: `/projects/${created.id}`, headers: as(creator) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: created.id });
    expect(res.body).not.toContain(creator);
  });

  it('rejects a different principal', async () => {
    const created = await createAs(newPrincipal());
    const res = await t.app.inject({ method: 'GET', url: `/projects/${created.id}`, headers: as(newPrincipal()) });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: 'forbidden', requestId: expect.any(String) } });
    expect(res.body).not.toContain(created.id);
  });

  it('distinguishes a project that does not exist', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/projects/${randomUUID()}`, headers: as(newPrincipal()) });
    expect(res.statusCode).toBe(404);
  });

  it('rejects malformed ids and undeclared query parameters', async () => {
    const malformed = await t.app.inject({ method: 'GET', url: '/projects/not-a-uuid', headers: as(newPrincipal()) });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.issues[0]).toMatchObject({ location: 'params', path: 'id' });

    const creator = newPrincipal();
    const created = await createAs(creator);
    const query = await t.app.inject({ method: 'GET', url: `/projects/${created.id}?include=parties`, headers: as(creator) });
    expect(query.statusCode).toBe(400);
    expect(query.json().error.issues[0]).toMatchObject({ location: 'query' });
  });

  it('does not expose project-local parties (roster visibility is not decided)', async () => {
    const creator = newPrincipal();
    const created = await createAs(creator);
    const first = await addProjectParty(t.database.db, created.id);
    const second = await addProjectParty(t.database.db, created.id);

    const res = await t.app.inject({ method: 'GET', url: `/projects/${created.id}`, headers: as(creator) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: created.id });
    expect(res.body).not.toContain(first.id);
    expect(res.body).not.toContain(second.id);
  });
});

describe('creating a project grants no authority over anyone else', () => {
  it('exposes no operation that acts on a party, an invitation, a signature or a payment', () => {
    const productOperations = operations.filter((op) => !op.path.startsWith('/stage0') && op.path !== '/health');
    expect(productOperations.map((op) => `${op.method} ${op.path}`).sort()).toEqual([
      'GET /projects/:id',
      'POST /projects',
    ]);
  });

  it('declares no excluded semantic in either project operation input or output', () => {
    for (const op of [createProjectOperation, readProjectOperation]) {
      const keys = [
        ...Object.keys(op.input.params.shape),
        ...Object.keys(op.input.query.shape),
        ...Object.keys(op.input.body.shape),
        ...outputKeys(op.output),
      ].map((key) => key.toLowerCase());
      const offending = keys.filter((key) => EXCLUDED_SEMANTICS.some((word) => key.includes(word)));
      expect({ op: op.name, offending }).toEqual({ op: op.name, offending: [] });
    }
    expect(Object.keys(createProjectOperation.input.body.shape)).toEqual([]);
    expect(outputKeys(createProjectOperation.output)).toEqual(['id']);
    expect(outputKeys(readProjectOperation.output)).toEqual(['id']);
  });

  it('records no party on behalf of the creator when parties exist', async () => {
    const creator = newPrincipal();
    const created = await createAs(creator);
    await addProjectParty(t.database.db, created.id);
    await addProjectParty(t.database.db, created.id);
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query('select row_to_json(p)::text as json from project_party p where project_id = $1', [created.id]),
    );
    expect(rows.rowCount).toBe(2);
    for (const row of rows.rows) expect(row.json).not.toContain(creator);
  });
});

describe('an absent principal is rejected before the body is read, with no side effects', () => {
  // A fresh, migrated database with no other writers, so "no project was
  // written" is a count that no concurrently running suite can disturb.
  let isolated: TestApp;
  let databaseName: string;

  beforeAll(async () => {
    databaseName = `ms_projects_test_${randomUUID().replaceAll('-', '')}`;
    await withClient(inject('adminUrl'), (c) => c.query(`CREATE DATABASE ${databaseName}`));
    await runMigrations(withDatabase(inject('adminUrl'), databaseName));
    isolated = await startTestApp({ databaseUrl: withDatabase(inject('runtimeUrl'), databaseName) });
  });
  afterAll(async () => {
    await isolated.close();
    await withClient(inject('adminUrl'), (c) => c.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`));
  });

  async function projectCount(): Promise<number> {
    const [row] = await isolated.database.db.select({ n: count() }).from(project);
    return row?.n ?? 0;
  }

  it('POST /projects: 401 for valid, malformed, wrongly typed and oversized bodies, and nothing is written', async () => {
    const responses = await Promise.all([
      isolated.app.inject({ method: 'POST', url: '/projects', payload: {} }),
      isolated.app.inject({ method: 'POST', url: '/projects', payload: { createdByPrincipalId: 'x' } }),
      isolated.app.inject({ method: 'POST', url: '/projects', headers: { 'content-type': 'application/json' }, payload: '{' }),
      isolated.app.inject({ method: 'POST', url: '/projects', headers: { 'content-type': 'text/plain' }, payload: 'x' }),
      isolated.app.inject({
        method: 'POST',
        url: '/projects',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ x: 'x'.repeat(2 * 1024 * 1024) }),
      }),
    ]);
    for (const res of responses) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { code: 'unauthenticated', requestId: expect.any(String) } });
    }
    expect(await projectCount()).toBe(0);
  });

  it('GET /projects/:id: 401 even for an existing project', async () => {
    const created = await isolated.app.inject({ method: 'POST', url: '/projects', headers: as(newPrincipal()), payload: {} });
    expect(created.statusCode).toBe(201);
    const res = await isolated.app.inject({ method: 'GET', url: `/projects/${created.json().id}` });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain(created.json().id);
  });
});
