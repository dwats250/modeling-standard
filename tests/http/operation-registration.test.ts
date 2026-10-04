import Fastify from 'fastify';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { operations } from '../../src/app/operation-list.ts';
import { publicAccess, resolveNoPrincipal } from '../../src/authorization/access.ts';
import {
  defineOperation,
  OperationDefinitionError,
  registerOperations,
  validateOperations,
  type AnyOperation,
} from '../../src/http/operations.ts';
import { startTestApp, type TestApp } from '../support/app.ts';

/**
 * Invariant: protected behaviour cannot accidentally exist without policy.
 * These tests use the real registration function and the real operation list.
 */

const okOutput = z.strictObject({ ok: z.literal(true) });

function validOperation(): AnyOperation {
  return defineOperation({
    name: 'probe',
    method: 'GET',
    path: '/probe',
    access: publicAccess('registration test fixture'),
    output: okOutput,
    run: async () => ({ ok: true as const }),
  });
}

function rejectionOf(op: AnyOperation): string {
  try {
    validateOperations([op]);
  } catch (error) {
    expect(error).toBeInstanceOf(OperationDefinitionError);
    return (error as Error).message;
  }
  throw new Error('expected the definition to be rejected');
}

describe('operation registration', () => {
  it('accepts a fully declared operation', () => {
    expect(() => validateOperations([validOperation()])).not.toThrow();
  });

  it('rejects an operation with no access declaration', () => {
    const { access: _omitted, ...rest } = validOperation();
    expect(rejectionOf(rest as unknown as AnyOperation)).toMatch(/no access declared/);
  });

  it('rejects an access declaration that is neither public nor protected', () => {
    const op = { ...validOperation(), access: { kind: 'internal' } } as unknown as AnyOperation;
    expect(rejectionOf(op)).toMatch(/access kind must be "public" or "protected"/);
  });

  it('rejects a protected operation without a policy', () => {
    const op = { ...validOperation(), access: { kind: 'protected', load: async () => ({}) } } as unknown as AnyOperation;
    expect(rejectionOf(op)).toMatch(/must declare a policy/);
  });

  it('rejects a public operation without a reason', () => {
    const op = { ...validOperation(), access: { kind: 'public', reason: ' ' } } as unknown as AnyOperation;
    expect(rejectionOf(op)).toMatch(/must state a reason/);
  });

  it('refuses to construct publicAccess without a reason', () => {
    expect(() => publicAccess('')).toThrow(/must state why/);
  });

  it('rejects input schemas that would silently accept or strip undeclared fields', () => {
    const base = validOperation();
    const loose = { ...base, input: { ...base.input, body: z.object({ a: z.string() }) } } as AnyOperation;
    expect(rejectionOf(loose)).toMatch(/input.body must be a strict object schema/);
  });

  it('rejects an output schema that is not a strict object', () => {
    const op = { ...validOperation(), output: z.object({ ok: z.boolean() }) } as AnyOperation;
    expect(rejectionOf(op)).toMatch(/output must be a strict object schema/);
  });

  it('rejects duplicate routes', () => {
    const a = validOperation();
    const b = { ...validOperation(), name: 'probe2' };
    expect(() => validateOperations([a, b])).toThrow(/duplicate route GET \/probe/);
  });

  it('fails the whole registration (and therefore boot) on one bad definition', () => {
    const app = Fastify();
    const bad = { ...validOperation(), access: undefined } as unknown as AnyOperation;
    expect(() => registerOperations(app, [validOperation(), bad], { db: {} as never, resolvePrincipal: resolveNoPrincipal })).toThrow(
      OperationDefinitionError,
    );
  });
});

describe('the production operation list', () => {
  it('passes registration validation', () => {
    expect(() => validateOperations(operations)).not.toThrow();
  });

  it('classifies every operation explicitly, and only health is public', () => {
    // Adding a public operation must be a deliberate, reviewed change to this list.
    const classification = Object.fromEntries(operations.map((op) => [op.name, op.access.kind]));
    expect(classification).toEqual({
      health: 'public',
      'stage0.syntheticResource.create': 'protected',
      'stage0.syntheticResource.read': 'protected',
    });
  });
});

describe('the real application exposes nothing outside the operation list', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('registers a route for every operation', () => {
    for (const op of operations) {
      expect(t.app.hasRoute({ method: op.method, url: op.path })).toBe(true);
    }
  });

  it('does not answer HEAD or other implicit routes', async () => {
    const res = await t.app.inject({ method: 'HEAD', url: '/health' });
    expect(res.statusCode).toBe(404);
  });
});

describe('a route added outside registerOperations is refused', () => {
  it('throws on the shipped composition, before it is ready', async () => {
    const logger = createLogger('silent');
    const app = createApp({ db: {} as never, logger, resolvePrincipal: resolveNoPrincipal });
    expect(() => app.get('/sneaky', async () => ({ leaked: true }))).toThrow(/was not registered as an operation/);
    await app.register(async (child) => {
      expect(() => child.post('/nested-sneaky', async () => ({}))).toThrow(/was not registered as an operation/);
    });
    await app.close();
  });
});
