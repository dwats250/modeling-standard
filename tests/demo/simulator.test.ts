import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { operations } from '../../src/app/operation-list.ts';
import { demoOperations } from '../../src/demo/operations.ts';
import { simulatorOperations } from '../../src/demo/simulator.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { LogCapture, PRINCIPAL_HEADER, headerPrincipal } from '../support/app.ts';

/**
 * The demo scenario simulator: demo-only, creator-scoped, and since S08 one
 * operation, starting a scenario. The S03–S05 term, version and tick
 * operations are gone.
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

describe('simulator separation', () => {
  it('is demo-only and protected', () => {
    const production = new Set(operations.map((op) => op.name));
    for (const op of simulatorOperations) {
      expect(production.has(op.name)).toBe(false);
      expect(op.path.startsWith('/demo/sim/')).toBe(true);
      expect(op.access.kind).toBe('protected');
    }
  });

  it('has exactly one operation: start a scenario', () => {
    expect(simulatorOperations.map((op) => op.name)).toEqual(['demo.sim.scenario.start']);
  });

  it('rejects a missing principal before reading the body', async () => {
    const res = await app.inject({ method: 'POST', url: '/demo/sim/scenarios', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('no longer serves the retired S03–S05 operations', async () => {
    const id = randomUUID();
    for (const url of [
      `/demo/sim/projects/${id}/terms`,
      `/demo/sim/projects/${id}/versions`,
      `/demo/sim/projects/${id}/affirmations`,
      `/demo/sim/agreements/${id}/terms`,
      `/demo/sim/agreements/${id}/versions`,
      `/demo/sim/agreements/${id}/affirmations`,
    ]) {
      const res = await app.inject({ method: 'POST', url, headers: as(`sim-${randomUUID()}`), payload: {} });
      expect({ url, status: res.statusCode }).toEqual({ url, status: 404 });
    }
  });
});

describe('a simulated scenario', () => {
  it('starts with two parties and one pair between them, and no live brief', async () => {
    const me = `sim-${randomUUID()}`;
    const started = await app.inject({ method: 'POST', url: '/demo/sim/scenarios', headers: as(me), payload: {} });
    expect(started.statusCode).toBe(201);
    const { id } = started.json<{ id: string }>();
    const res = await app.inject({ method: 'GET', url: `/demo/projects/${id}/record`, headers: as(me) });
    const rec = res.json<{ parties: { id: string }[]; agreements: { partyIds: [string, string] }[]; brief: unknown }>();
    expect(rec.parties).toHaveLength(2);
    expect(rec.agreements).toHaveLength(1);
    expect([...rec.agreements[0]!.partyIds].sort()).toEqual(rec.parties.map((p) => p.id).sort());
    expect(rec.brief).toBeNull();
  });

  it('rejects undeclared fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/demo/sim/scenarios', headers: as(`sim-${randomUUID()}`), payload: { parties: 3 } });
    expect(res.statusCode).toBe(400);
  });

  it('is scoped to the operator who created the project', async () => {
    const owner = `sim-${randomUUID()}`;
    const started = await app.inject({ method: 'POST', url: '/demo/sim/scenarios', headers: as(owner), payload: {} });
    const { id } = started.json<{ id: string }>();
    const res = await app.inject({ method: 'GET', url: `/demo/projects/${id}/record`, headers: as(`sim-${randomUUID()}`) });
    expect(res.statusCode).toBe(403);
  });
});
