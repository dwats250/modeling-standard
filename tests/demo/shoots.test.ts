import { readdir } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { findLiveBriefForProject, listBriefItems } from '../../src/briefs/brief.ts';
import { listBriefPresence } from '../../src/briefs/live.ts';
import type { AnnotationStore } from '../../src/demo/annotations.ts';
import { demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { SCENARIO_CARDS, type ComposeBody } from '../../src/demo/shoots.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { listPairwiseAgreements } from '../../src/projects/agreement.ts';
import { listProjectParties } from '../../src/projects/party.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';
import { LogCapture } from '../support/app.ts';

/**
 * The demo composer (`POST /demo/shoots`) and the scenario cards
 * (`POST /demo/shoots/scenarios`): operator-level, unattributed, one
 * transaction through the existing data functions, labels in the demo
 * annotation store and never in the database, every combination admitted by
 * the S08 checks, blank values refused per field, no migration.
 */

let database: DatabaseHandle;
let app: FastifyInstance;
let annotations: AnnotationStore;

beforeAll(async () => {
  const logger = createLogger('info', new LogCapture());
  database = openDatabase(inject('runtimeUrl'), logger);
  annotations = temporaryAnnotationStore();
  app = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: createDemoOperations(annotations) });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const base: ComposeBody = {
  concept: 'A rooftop portrait session',
  declaration: 'Nobody touches my hair.',
  callTime: { mode: 'supplied', value: '9:00 at the studio' },
  deliveryDate: { mode: 'decide_together' },
  coverage: { mode: 'model_sets' },
  deliverables: 'Twenty edited images',
  request: 'Selected images may be used as an album cover.',
  fee: { mode: 'none' },
};

async function compose(body: unknown) {
  const res = await app.inject({ method: 'POST', url: '/demo/shoots', payload: body as object });
  return { status: res.statusCode, json: () => res.json<Record<string, unknown>>() };
}

async function composed(body: ComposeBody) {
  const res = await compose(body);
  expect(res.status).toBe(201);
  const ids = res.json() as { projectId: string; photographerPartyId: string; modelPartyId: string };
  const brief = (await findLiveBriefForProject(database.db, ids.projectId))!;
  return { ...ids, brief, items: await listBriefItems(database.db, brief.id) };
}

describe('the composer', () => {
  it('composes a no-fee shoot with coverage left as the Model’s open parameter', async () => {
    const s = await composed(base);
    expect(s.brief.phase).toBe('draft');
    expect((await listProjectParties(database.db, s.projectId)).map((p) => p.id).sort()).toEqual([s.photographerPartyId, s.modelPartyId].sort());
    const [pair] = await listPairwiseAgreements(database.db, s.projectId);
    expect([...pair!.partyIds].sort()).toEqual([s.photographerPartyId, s.modelPartyId].sort());
    expect(await listBriefPresence(database.db, s.brief.id)).toEqual([]);

    expect(s.items.filter((i) => i.layer === 'money')).toEqual([]);
    const coverage = s.items.find((i) => i.itemKey === 'coverage_level')!;
    expect(coverage).toMatchObject({ layer: 'shared', shape: 'open_parameter', subjectPartyId: s.modelPartyId, pending: 'subject', value: null });
    expect(s.items.find((i) => i.shape === 'declaration')).toMatchObject({ layer: 'universal', subjectPartyId: s.modelPartyId });
    expect(s.items.find((i) => i.shape === 'request')).toMatchObject({ layer: 'shared', pairwiseAgreementId: pair!.id, subjectPartyId: s.modelPartyId });
    expect(s.items.find((i) => i.content?.includes('Deliverables'))).toMatchObject({ layer: 'shared', pairwiseAgreementId: pair!.id, shape: null });
    expect(s.items.find((i) => i.content?.includes('Delivery date'))).toMatchObject({ pending: 'decide_together', value: null });
    expect(s.items.find((i) => i.content?.includes('Call time'))).toMatchObject({ pending: null, value: '[synthetic] 9:00 at the studio' });
    // The omitted terms stay omitted.
    expect(s.items.map((i) => i.itemKey).filter(Boolean)).toEqual(['coverage_level']);
    for (const text of s.items.flatMap((i) => [i.content, i.value]).filter((t) => t !== null)) expect(text).toMatch(/^\[synthetic\] /);
  });

  it('composes a shoot with the fee to decide together', async () => {
    const s = await composed({ ...base, fee: { mode: 'decide_together' }, coverage: { mode: 'set_now', value: 'Level 2' }, callTime: { mode: 'decide_together' } });
    const [pair] = await listPairwiseAgreements(database.db, s.projectId);
    expect(s.items.find((i) => i.layer === 'money')).toMatchObject({ itemKey: 'fee', pairwiseAgreementId: pair!.id, pending: 'decide_together', value: null });
    expect(s.items.find((i) => i.itemKey === 'coverage_level')).toMatchObject({ pending: null, value: '[synthetic] Level 2' });
  });

  it('admits every combination of states, and each one shares', async () => {
    const together = { mode: 'decide_together' } as const;
    let n = 0;
    for (const callTime of [{ mode: 'supplied', value: '9:00' } as const, together]) {
      for (const deliveryDate of [{ mode: 'supplied', value: 'the 20th' } as const, together]) {
        for (const coverage of [{ mode: 'model_sets' } as const, { mode: 'set_now', value: 'Level 1' } as const]) {
          for (const fee of [{ mode: 'none' } as const, { mode: 'amount', value: '300 CAD' } as const, together]) {
            const s = await composed({ ...base, callTime, deliveryDate, coverage, fee });
            const res = await app.inject({ method: 'POST', url: `/demo/sim/briefs/${s.brief.id}/presence`, payload: { partyId: s.modelPartyId, onSite: true } });
            expect(res.statusCode).toBe(200);
            await app.inject({ method: 'POST', url: `/demo/sim/briefs/${s.brief.id}/presence`, payload: { partyId: s.photographerPartyId, onSite: false } });
            expect((await app.inject({ method: 'POST', url: `/demo/sim/briefs/${s.brief.id}/share`, payload: {} })).statusCode).toBe(200);
            n += 1;
          }
        }
      }
    }
    expect(n).toBe(24);
  });

  it('refuses a blank supplied value with a field-level message, and writes nothing', async () => {
    // Other suites create projects concurrently; this suite's own store counts its compositions.
    const before = Object.keys((await annotations.read()).projects).length;
    const cases: [Partial<Record<keyof ComposeBody, unknown>>, string, string][] = [
      [{ concept: '  ' }, 'concept', 'Fill it in.'],
      [{ declaration: '' }, 'declaration', 'Fill it in.'],
      [{ deliverables: '\n' }, 'deliverables', 'Fill it in.'],
      [{ request: ' ' }, 'request', 'Fill it in.'],
      [{ callTime: { mode: 'supplied', value: ' ' } }, 'callTime.value', 'Fill it in, or mark it decide together.'],
      [{ deliveryDate: { mode: 'supplied', value: '' } }, 'deliveryDate.value', 'Fill it in, or mark it decide together.'],
      [{ fee: { mode: 'amount', value: '  ' } }, 'fee.value', 'Fill it in, or mark it decide together.'],
      [{ coverage: { mode: 'set_now', value: '' } }, 'coverage.value', 'Fill it in, or leave it for the Model to set.'],
    ];
    for (const [change, path, message] of cases) {
      const res = await compose({ ...base, ...change });
      expect(res.status).toBe(400);
      const issues = (res.json() as { error: { code: string; issues: { path: string; message: string }[] } }).error;
      expect(issues.code).toBe('invalid_input');
      expect(issues.issues).toContainEqual({ location: 'body', path, message });
    }
    // Nothing is "required": no field, state or flag says so.
    for (const extra of [{ required: true }, { concept: 'x', callTime: { mode: 'required' } }, { fee: { mode: 'amount' } }, { coverage: { mode: 'model_sets', value: 'x' } }]) {
      expect((await compose({ ...base, ...extra })).status).toBe(400);
    }
    expect(Object.keys((await annotations.read()).projects)).toHaveLength(before);
  });

  it('writes the labels and the title to the annotation store, not the database', async () => {
    const s = await composed({ ...base, concept: 'Studio test with a red backdrop' });
    const stored = (await annotations.read()).projects[s.projectId]!;
    expect(stored).toMatchObject({ title: 'Studio test with a red backdrop', kind: 'composed' });
    expect(stored.parties).toEqual({ [s.photographerPartyId]: 'Photographer', [s.modelPartyId]: 'Model' });
    const record = await app.inject({ method: 'GET', url: `/demo/projects/${s.projectId}/record` });
    expect(record.body).not.toMatch(/Photographer|Model"|"Model|role|label/);
  });

  it('adds no migration', async () => {
    const files = (await readdir('migrations')).filter((f) => f.endsWith('.sql')).sort();
    expect(files.at(-1)).toBe('0022_live_resolution_guards_and_grants.sql');
    expect(files).toHaveLength(23);
  });
});

describe('the scenario cards', () => {
  async function card(name: string) {
    const res = await app.inject({ method: 'POST', url: '/demo/shoots/scenarios', payload: { card: name } });
    expect(res.statusCode).toBe(201);
    const ids = res.json<{ projectId: string; photographerPartyId: string; modelPartyId: string }>();
    const brief = (await findLiveBriefForProject(database.db, ids.projectId))!;
    return { ...ids, brief, items: await listBriefItems(database.db, brief.id), presence: await listBriefPresence(database.db, brief.id) };
  }

  it('starts each card deterministically, with its title and cast in the annotation store', async () => {
    const straightforward = await card('straightforward');
    expect(straightforward.brief.phase).toBe('draft');
    expect(straightforward.presence).toEqual([]);

    const unresolved = await card('unresolved');
    expect(unresolved.brief.phase).toBe('live');
    expect(unresolved.items.map((i) => i.pending).filter(Boolean).sort()).toEqual(['decide_together', 'subject']);
    expect(unresolved.presence.every((p) => p.onSite)).toBe(true);

    const declined = await card('declined');
    expect(declined.brief.phase).toBe('live');
    expect(declined.items.filter((i) => i.shape === 'request')).toEqual([]);
    expect(declined.items).toHaveLength(unresolved.items.length - 1);

    const stored = (await annotations.read()).projects;
    for (const [s, name] of [[straightforward, 'straightforward'], [unresolved, 'unresolved'], [declined, 'declined']] as const) {
      expect(stored[s.projectId]).toMatchObject({ title: SCENARIO_CARDS[name], kind: 'scenario', parties: { [s.photographerPartyId]: 'Photographer', [s.modelPartyId]: 'Model' } });
    }
    for (const items of [straightforward.items, unresolved.items, declined.items]) expect(items.filter((i) => i.itemKey === 'no_means_no')).toEqual([]);
  });

  it('refuses an unknown card', async () => {
    for (const payload of [{ card: 'three-person' }, {}, { card: 'unresolved', extra: 1 }]) {
      expect((await app.inject({ method: 'POST', url: '/demo/shoots/scenarios', payload })).statusCode).toBe(400);
    }
  });
});
