import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { operations } from '../../src/app/operation-list.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { createSimulatorOperations } from '../../src/demo/simulator.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { LogCapture, PRINCIPAL_HEADER, headerPrincipal } from '../support/app.ts';

/**
 * The demo scenario simulator: demo-only, creator-scoped, and since S09 the
 * synthetic photographer-and-model walkthrough over the S09 data functions,
 * whose refusals come back as 409s with stable codes. The S03–S05 term,
 * version and tick operations stay gone.
 */

let database: DatabaseHandle;
let app: FastifyInstance;
const annotations = temporaryAnnotationStore();
const simulatorOperations = createSimulatorOperations(annotations);

beforeAll(async () => {
  const logger = createLogger('info', new LogCapture());
  database = openDatabase(inject('runtimeUrl'), logger);
  app = createApp({ db: database.db, logger, resolvePrincipal: headerPrincipal, additionalOperations: createDemoOperations(annotations) });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const as = (principal: string): Record<string, string> => ({ [PRINCIPAL_HEADER]: principal });

interface Item {
  id: string;
  layer: string;
  shape: string | null;
  itemKey: string | null;
  pending: string | null;
  subjectPartyId: string | null;
  approverIds: string[];
  tickedBy: string[];
  green: boolean;
}
interface Rec {
  parties: { id: string }[];
  agreements: { id: string; partyIds: [string, string] }[];
  brief: { id: string; phase: string; ready: boolean; presence: { partyId: string; onSite: boolean }[]; items: Item[] } | null;
}

async function post(principal: string, url: string, payload: unknown): Promise<{ status: number; code?: string }> {
  const res = await app.inject({ method: 'POST', url, headers: as(principal), payload: payload as object });
  const body = res.json<{ error?: { code: string } }>();
  return body.error ? { status: res.statusCode, code: body.error.code } : { status: res.statusCode };
}

async function record(principal: string, projectId: string): Promise<Rec> {
  const res = await app.inject({ method: 'GET', url: `/demo/projects/${projectId}/record`, headers: as(principal) });
  expect(res.statusCode).toBe(200);
  return res.json<Rec>();
}

async function walkthrough(principal: string) {
  const res = await app.inject({ method: 'POST', url: '/demo/sim/scenarios', headers: as(principal), payload: {} });
  expect(res.statusCode).toBe(201);
  const started = res.json<{ id: string; photographerPartyId: string; modelPartyId: string }>();
  return { ...started, rec: await record(principal, started.id) };
}

const conflict = (code: string) => ({ status: 409, code });

describe('simulator separation', () => {
  it('is demo-only and protected', () => {
    const production = new Set(operations.map((op) => op.name));
    for (const op of simulatorOperations) {
      expect(production.has(op.name)).toBe(false);
      expect(op.path.startsWith('/demo/sim/')).toBe(true);
      expect(op.access.kind).toBe('protected');
    }
  });

  it('has exactly the walkthrough operations', () => {
    expect(simulatorOperations.map((op) => op.name)).toEqual([
      'demo.sim.scenario.start',
      'demo.sim.brief.presence',
      'demo.sim.brief.share',
      'demo.sim.item.settle',
      'demo.sim.item.parameter',
      'demo.sim.item.decline',
      'demo.sim.item.tick',
      'demo.sim.item.untick',
      'demo.sim.brief.group-check',
    ]);
  });

  it('is part of exactly this demo operation set (inspector, simulator, composer, participant screens, invite, operator mode)', () => {
    expect(createDemoOperations(annotations).map((op) => `${op.method} ${op.path}`)).toEqual([
      'GET /demo/projects',
      'GET /demo/projects/:id/record',
      'POST /demo/sim/scenarios',
      'POST /demo/sim/briefs/:id/presence',
      'POST /demo/sim/briefs/:id/share',
      'POST /demo/sim/items/:id/settle',
      'POST /demo/sim/items/:id/parameter',
      'POST /demo/sim/items/:id/decline',
      'POST /demo/sim/items/:id/tick',
      'POST /demo/sim/items/:id/untick',
      'POST /demo/sim/briefs/:id/group-check',
      'POST /demo/shoots',
      'POST /demo/shoots/scenarios',
      'GET /demo/shoots/:projectId/as/:partyId',
      'POST /demo/shoots/:projectId/as/:partyId/items/:itemId/tick',
      'POST /demo/shoots/:projectId/as/:partyId/items/:itemId/untick',
      'POST /demo/shoots/:projectId/as/:partyId/items/:itemId/decline',
      'POST /demo/shoots/:projectId/as/:partyId/items/:itemId/parameter',
      'POST /demo/shoots/:projectId/as/:partyId/group-check',
      'POST /demo/shoots/:projectId/invitations',
      'POST /demo/operator',
    ]);
  });

  it('rejects a missing principal before reading the body', async () => {
    for (const op of simulatorOperations) {
      const res = await app.inject({ method: 'POST', url: op.path.replace(':id', randomUUID()), payload: {} });
      expect({ op: op.name, status: res.statusCode }).toEqual({ op: op.name, status: 401 });
    }
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

describe('the walkthrough', () => {
  it('starts as a draft with a photographer, a model, their pair and every layer, and no no-means-no item', async () => {
    const w = await walkthrough(`sim-${randomUUID()}`);
    expect(w.rec.parties.map((p) => p.id).sort()).toEqual([w.photographerPartyId, w.modelPartyId].sort());
    expect(w.rec.agreements).toHaveLength(1);
    expect(w.rec.brief!.phase).toBe('draft');
    expect(w.rec.brief!.presence).toEqual([]);
    expect(new Set(w.rec.brief!.items.map((i) => i.layer))).toEqual(new Set(['universal', 'shared', 'money']));
    expect(w.rec.brief!.items.filter((i) => i.itemKey === 'no_means_no')).toEqual([]);
    expect(w.rec.brief!.items.map((i) => i.pending).filter(Boolean).sort()).toEqual(['decide_together', 'subject']);
  });

  it('goes draft → share → resolve → decline → tick → group-check → untick → retick → ready to sign', async () => {
    const me = `sim-${randomUUID()}`;
    const w = await walkthrough(me);
    const briefId = w.rec.brief!.id;
    const [p, m] = [w.photographerPartyId, w.modelPartyId];
    const find = (rec: Rec, test: (i: Item) => boolean) => rec.brief!.items.find(test)!;

    // Sharing needs every party's presence.
    expect(await post(me, `/demo/sim/briefs/${briefId}/share`, {})).toEqual(conflict('presence_missing'));
    for (const partyId of [p, m]) expect((await post(me, `/demo/sim/briefs/${briefId}/presence`, { partyId, onSite: true })).status).toBe(200);
    expect((await post(me, `/demo/sim/briefs/${briefId}/share`, {})).status).toBe(200);
    let rec = await record(me, w.id);
    expect(rec.brief!.phase).toBe('live');
    expect(await post(me, `/demo/sim/briefs/${briefId}/presence`, { partyId: p, onSite: false })).toEqual(conflict('not_draft'));

    // Resolve: decide together, and the open parameter by its subject only.
    const together = find(rec, (i) => i.pending === 'decide_together');
    const parameter = find(rec, (i) => i.pending === 'subject');
    expect(await post(me, `/demo/sim/items/${together.id}/tick`, { partyId: p })).toEqual(conflict('still_pending'));
    expect((await post(me, `/demo/sim/items/${together.id}/settle`, { value: '[synthetic] the 20th' })).status).toBe(200);
    expect(await post(me, `/demo/sim/items/${parameter.id}/parameter`, { partyId: p, value: '[synthetic] 3' })).toEqual(conflict('not_subject'));
    expect((await post(me, `/demo/sim/items/${parameter.id}/parameter`, { partyId: m, value: '[synthetic] 2' })).status).toBe(200);

    // Decline: only the subject; the request disappears.
    const request = find(rec, (i) => i.shape === 'request');
    const declaration = find(rec, (i) => i.shape === 'declaration');
    expect(await post(me, `/demo/sim/items/${request.id}/decline`, { partyId: p })).toEqual(conflict('not_subject'));
    expect(await post(me, `/demo/sim/items/${declaration.id}/decline`, { partyId: m })).toEqual(conflict('not_request'));
    expect((await post(me, `/demo/sim/items/${request.id}/decline`, { partyId: m })).status).toBe(200);
    rec = await record(me, w.id);
    expect(rec.brief!.items.map((i) => i.id)).not.toContain(request.id);

    // Group-check refuses deliberate items; ordinary ones tick individually.
    const deliberate = rec.brief!.items.filter((i) => i.itemKey === 'fee' || i.itemKey === 'coverage_level');
    const ordinary = rec.brief!.items.filter((i) => !deliberate.includes(i));
    expect(deliberate).toHaveLength(2);
    expect(await post(me, `/demo/sim/briefs/${briefId}/group-check`, { partyId: p, itemIds: rec.brief!.items.map((i) => i.id) })).toEqual(
      conflict('deliberate_tick'),
    );
    for (const partyId of [p, m]) {
      expect((await post(me, `/demo/sim/briefs/${briefId}/group-check`, { partyId, itemIds: ordinary.map((i) => i.id) })).status).toBe(200);
    }
    rec = await record(me, w.id);
    expect(rec.brief!.ready).toBe(false);
    for (const item of deliberate) for (const partyId of [p, m]) expect((await post(me, `/demo/sim/items/${item.id}/tick`, { partyId })).status).toBe(200);
    rec = await record(me, w.id);
    expect(rec.brief!.items.every((i) => i.green)).toBe(true);
    expect(rec.brief!.ready).toBe(true);

    // Untick loses readiness; retick restores it.
    const fee = deliberate.find((i) => i.itemKey === 'fee')!;
    expect((await post(me, `/demo/sim/items/${fee.id}/untick`, { partyId: m })).status).toBe(200);
    expect((await record(me, w.id)).brief!.ready).toBe(false);
    expect((await post(me, `/demo/sim/items/${fee.id}/tick`, { partyId: m })).status).toBe(200);
    expect((await record(me, w.id)).brief!.ready).toBe(true);
  });

  it('rejects undeclared fields and blank values', async () => {
    const me = `sim-${randomUUID()}`;
    const w = await walkthrough(me);
    const briefId = w.rec.brief!.id;
    const itemId = w.rec.brief!.items[0]!.id;
    for (const [url, payload] of [
      ['/demo/sim/scenarios', { parties: 3 }],
      [`/demo/sim/briefs/${briefId}/presence`, { partyId: w.modelPartyId, onSite: true, reason: 'x' }],
      [`/demo/sim/briefs/${briefId}/share`, { force: true }],
      [`/demo/sim/items/${itemId}/settle`, { value: '   ' }],
      [`/demo/sim/items/${itemId}/tick`, { partyId: w.modelPartyId, at: 'now' }],
      [`/demo/sim/briefs/${briefId}/group-check`, { partyId: w.modelPartyId, itemIds: [] }],
    ] as const) {
      expect({ url, status: (await post(me, url, payload)).status }).toEqual({ url, status: 400 });
    }
  });

  it('is scoped to the operator who created the project', async () => {
    const owner = `sim-${randomUUID()}`;
    const w = await walkthrough(owner);
    const intruder = `sim-${randomUUID()}`;
    expect((await post(intruder, `/demo/sim/briefs/${w.rec.brief!.id}/share`, {})).status).toBe(403);
    expect((await post(intruder, `/demo/sim/items/${w.rec.brief!.items[0]!.id}/tick`, { partyId: w.modelPartyId })).status).toBe(403);
    expect((await post(intruder, `/demo/sim/items/${randomUUID()}/tick`, { partyId: w.modelPartyId })).status).toBe(404);
    expect((await post(intruder, `/demo/sim/briefs/${randomUUID()}/share`, {})).status).toBe(404);
    expect((await record(owner, w.id)).brief!.phase).toBe('draft');
  });
});
