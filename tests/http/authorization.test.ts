import { randomUUID } from 'node:crypto';
import { count } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { operations } from '../../src/app/operations.ts';
import { resolveNoPrincipal } from '../../src/authorization/access.ts';
import { syntheticResource } from '../../src/stage0/tables.ts';
import { PRINCIPAL_HEADER, startTestApp, type TestApp } from '../support/app.ts';

/**
 * Authorization through the real application boundary (createApp + the
 * production operation list). Principals are synthetic.
 */

const protectedOperations = operations.filter((op) => op.access.kind === 'protected');

/** A concrete URL for an operation path, filling any `:param` with a UUID. */
function urlFor(path: string): string {
  return path.replace(/:[A-Za-z]+/g, () => randomUUID());
}

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

async function resourceCount(): Promise<number> {
  const [row] = await t.database.db.select({ n: count() }).from(syntheticResource);
  return row?.n ?? 0;
}

async function createAs(principal: string, label = 'fixture'): Promise<{ id: string; label: string }> {
  const res = await t.app.inject({
    method: 'POST',
    url: '/stage0/synthetic-resources',
    headers: { [PRINCIPAL_HEADER]: principal },
    payload: { label },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe('every protected operation rejects an absent principal (generated from the operation list)', () => {
  it('has protected operations to check', () => {
    expect(protectedOperations.length).toBeGreaterThan(0);
  });

  for (const op of protectedOperations) {
    it(`${op.name}: 401 with a valid-looking request and no side effects`, async () => {
      const before = await resourceCount();
      const res = await t.app.inject({ method: op.method, url: urlFor(op.path), ...(op.method === 'POST' ? { payload: { label: 'x' } } : {}) });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: { code: 'unauthenticated', requestId: expect.any(String) } });
      expect(await resourceCount()).toBe(before);
    });

    it(`${op.name}: 401 before input is examined (no validation detail leaks)`, async () => {
      const res = await t.app.inject({
        method: op.method,
        url: `${urlFor(op.path)}?unexpected=1`,
        ...(op.method === 'POST' ? { payload: { unexpected: true } } : {}),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.issues).toBeUndefined();
    });
  }
});

describe('authorization is decided on the object acted on', () => {
  it('lets the owning principal read its resource', async () => {
    const created = await createAs('principal-a', 'owned by a');
    const res = await t.app.inject({
      method: 'GET',
      url: `/stage0/synthetic-resources/${created.id}`,
      headers: { [PRINCIPAL_HEADER]: 'principal-a' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: created.id, label: 'owned by a' });
  });

  it('rejects a different principal on the same route', async () => {
    const created = await createAs('principal-a');
    const res = await t.app.inject({
      method: 'GET',
      url: `/stage0/synthetic-resources/${created.id}`,
      headers: { [PRINCIPAL_HEADER]: 'principal-b' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: 'forbidden', requestId: expect.any(String) } });
    expect(res.body).not.toContain(created.id);
  });

  it('distinguishes a target that does not exist', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/stage0/synthetic-resources/${randomUUID()}`,
      headers: { [PRINCIPAL_HEADER]: 'principal-a' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('the production principal source denies every protected operation', () => {
  let prod: TestApp;
  beforeAll(async () => {
    prod = await startTestApp({ resolvePrincipal: resolveNoPrincipal });
  });
  afterAll(async () => {
    await prod.close();
  });

  for (const op of protectedOperations) {
    it(`${op.name}: denied even when a test principal header is sent`, async () => {
      const res = await prod.app.inject({
        method: op.method,
        url: urlFor(op.path),
        headers: { [PRINCIPAL_HEADER]: 'principal-a' },
        ...(op.method === 'POST' ? { payload: { label: 'x' } } : {}),
      });
      expect(res.statusCode).toBe(401);
    });
  }

  it('still serves the public health operation', async () => {
    const res = await prod.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
