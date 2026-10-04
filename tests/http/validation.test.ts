import Fastify, { type FastifyBaseLogger } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { publicAccess } from '../../src/authorization/access.ts';
import { defineOperation, registerOperations } from '../../src/http/operations.ts';
import { syntheticResource } from '../../src/stage0/tables.ts';
import { headerPrincipal, LogCapture, PRINCIPAL_HEADER, startTestApp, type TestApp } from '../support/app.ts';

/**
 * Input and output discipline through the real application. Requests can
 * only write declared fields; responses are declared shapes, never rows.
 */

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

const asA = { [PRINCIPAL_HEADER]: 'validation-principal' };

async function rowsWithLabel(label: string): Promise<number> {
  return (await t.database.db.select().from(syntheticResource).where(eq(syntheticResource.label, label))).length;
}

describe('input', () => {
  it('rejects an undeclared field instead of writing or ignoring it', async () => {
    const label = `mass-assignment-${Date.now()}`;
    const res = await t.app.inject({
      method: 'POST',
      url: '/stage0/synthetic-resources',
      headers: asA,
      payload: { label, ownerPrincipalId: 'someone-else' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: {
        code: 'invalid_input',
        requestId: expect.any(String),
        issues: [{ location: 'body', path: '', message: 'Unrecognized key: "ownerPrincipalId"' }],
      },
    });
    expect(await rowsWithLabel(label)).toBe(0);
  });

  it('rejects invalid values with the same error shape', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/stage0/synthetic-resources',
      headers: asA,
      payload: { label: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_input');
    expect(res.json().error.issues[0]).toMatchObject({ location: 'body', path: 'label' });
  });

  it('rejects a value the database cannot store as a 400, not a 500', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/stage0/synthetic-resources',
      headers: asA,
      payload: { label: 'a\u0000b' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.issues[0]).toMatchObject({ location: 'body', path: 'label' });
  });

  it('rejects a missing required field', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/stage0/synthetic-resources', headers: asA, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.issues[0]).toMatchObject({ location: 'body', path: 'label' });
  });

  it('rejects undeclared query parameters', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health?verbose=true' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.issues[0]).toMatchObject({ location: 'query' });
  });

  it('rejects malformed path parameters', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/stage0/synthetic-resources/not-a-uuid', headers: asA });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.issues[0]).toMatchObject({ location: 'params', path: 'id' });
  });

  it('rejects a body that is not an object', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/stage0/synthetic-resources',
      headers: { ...asA, 'content-type': 'application/json' },
      payload: '["label"]',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_input');
  });

  it('rejects malformed JSON with the uniform error shape', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/stage0/synthetic-resources',
      headers: { ...asA, 'content-type': 'application/json' },
      payload: '{"label":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'bad_request', requestId: expect.any(String) } });
  });
});

describe('output', () => {
  it('returns exactly the declared fields; internal fields stay internal', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/stage0/synthetic-resources',
      headers: asA,
      payload: { label: 'shape check' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['id', 'label']);
    expect(res.body).not.toContain('validation-principal');
    expect(res.body).not.toContain('owner');

    // The stored row does hold the internal field: it is withheld, not absent.
    const [row] = await t.database.db.select().from(syntheticResource).where(eq(syntheticResource.id, body.id));
    expect(row?.ownerPrincipalId).toBe('validation-principal');
  });

  it('turns a result that does not match the declared output into a 500, without leaking it', async () => {
    // A deliberately faulty operation that returns a whole stored row. It is
    // registered with the real registration function on a bare instance.
    const logs = new LogCapture();
    const loggerInstance: FastifyBaseLogger = createLogger('info', logs);
    const app = Fastify({ loggerInstance });
    app.setErrorHandler((error: { statusCode?: number }, _request, reply) =>
      reply.code(error.statusCode ?? 500).send({ error: 'failed' }),
    );
    registerOperations(
      app,
      [
        defineOperation({
          name: 'leaky',
          method: 'GET',
          path: '/leaky',
          access: publicAccess('output-shape test fixture'),
          output: z.strictObject({ id: z.string(), label: z.string() }),
          run: async () =>
            ({ id: 'r1', label: 'visible', ownerPrincipalId: 'internal-owner-value' }) as unknown as {
              id: string;
              label: string;
            },
        }),
      ],
      { db: {} as never, resolvePrincipal: headerPrincipal },
    );

    const res = await app.inject({ method: 'GET', url: '/leaky' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('internal-owner-value');
    expect(logs.text()).not.toContain('internal-owner-value');
    expect(logs.text()).toContain('operation result does not match its declared output');
    await app.close();
  });
});
