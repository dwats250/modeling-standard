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
 * The demo scenario simulator: demo-only, creator-scoped, and held to the
 * S03–S05 database rules, which it reports as 409s rather than bypassing.
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

interface Version {
  id: string;
  sequence: number;
  terms: { id: string; sourceTermId: string; content: string }[];
  affirmations: { presentedTermId: string; partyId: string }[];
}
interface SimRecord {
  parties: { id: string }[];
  universal: { terms: { id: string; content: string }[]; versions: Version[] };
  agreements: { id: string; partyIds: [string, string]; terms: { id: string; content: string }[]; versions: Version[] }[];
}

async function post(principal: string, url: string, payload: unknown): Promise<{ status: number; body: { id?: string; error?: { code: string } } }> {
  const res = await app.inject({ method: 'POST', url, headers: as(principal), payload: payload as object });
  return { status: res.statusCode, body: res.json() };
}

async function record(principal: string, projectId: string): Promise<SimRecord> {
  const res = await app.inject({ method: 'GET', url: `/demo/projects/${projectId}/record`, headers: as(principal) });
  expect(res.statusCode).toBe(200);
  return res.json<SimRecord>();
}

async function scenario(principal: string): Promise<{ projectId: string; rec: SimRecord }> {
  const started = await post(principal, '/demo/sim/scenarios', {});
  expect(started.status).toBe(201);
  const projectId = started.body.id!;
  return { projectId, rec: await record(principal, projectId) };
}

describe('simulator separation', () => {
  it('is demo-only and protected', () => {
    const production = new Set(operations.map((op) => op.name));
    for (const op of simulatorOperations) {
      expect(production.has(op.name)).toBe(false);
      expect(op.path.startsWith('/demo/sim/')).toBe(true);
      expect(op.access.kind).toBe('protected');
    }
  });

  it('rejects a missing principal before reading the body', async () => {
    for (const op of simulatorOperations) {
      const res = await app.inject({ method: 'POST', url: op.path.replace(':id', randomUUID()), payload: {} });
      expect({ op: op.name, status: res.statusCode }).toEqual({ op: op.name, status: 401 });
    }
  });
});

describe('a simulated scenario', () => {
  it('starts with two parties and one pairwise agreement between them, and nothing else', async () => {
    const { rec } = await scenario(`sim-${randomUUID()}`);
    expect(rec.parties).toHaveLength(2);
    expect(rec.agreements).toHaveLength(1);
    expect([...rec.agreements[0]!.partyIds].sort()).toEqual(rec.parties.map((p) => p.id).sort());
    expect(rec.universal).toEqual({ terms: [], versions: [] });
    expect(rec.agreements[0]!.terms).toEqual([]);
  });

  it('presents, records rows, drops and resends — preserving the earlier version and its rows', async () => {
    const me = `sim-${randomUUID()}`;
    const { projectId, rec } = await scenario(me);
    const agreementId = rec.agreements[0]!.id;
    const [p1, p2] = rec.agreements[0]!.partyIds;

    // Universal layer: two terms, version 1, a row for each party on term 1.
    const u1 = (await post(me, `/demo/sim/projects/${projectId}/terms`, { content: '[synthetic] shared one' })).body.id!;
    const u2 = (await post(me, `/demo/sim/projects/${projectId}/terms`, { content: '[synthetic] shared two' })).body.id!;
    expect((await post(me, `/demo/sim/projects/${projectId}/versions`, { termIds: [u1, u2] })).status).toBe(201);
    let r = await record(me, projectId);
    const uTerm1 = r.universal.versions[0]!.terms[0]!.id;
    for (const party of [p1, p2]) {
      expect((await post(me, `/demo/sim/projects/${projectId}/affirmations`, { presentedTermId: uTerm1, partyId: party })).status).toBe(201);
    }

    // Pairwise layer: three terms, version 1, one row, then drop term three and resend.
    const a = [];
    for (const text of ['pairwise one', 'pairwise two', 'three, to drop']) {
      a.push((await post(me, `/demo/sim/agreements/${agreementId}/terms`, { content: `[synthetic] ${text}` })).body.id!);
    }
    expect((await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: a })).status).toBe(201);
    r = await record(me, projectId);
    const v1Term1 = r.agreements[0]!.versions[0]!.terms[0]!.id;
    expect((await post(me, `/demo/sim/agreements/${agreementId}/affirmations`, { presentedTermId: v1Term1, partyId: p1 })).status).toBe(201);
    expect((await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: [a[0], a[1]] })).status).toBe(201);

    r = await record(me, projectId);
    const [v1, v2] = r.agreements[0]!.versions;
    expect(v1!.terms.map((t) => t.content)).toEqual(['[synthetic] pairwise one', '[synthetic] pairwise two', '[synthetic] three, to drop']);
    expect(v1!.affirmations).toEqual([{ presentedTermId: v1Term1, partyId: p1, affirmedAt: expect.any(String) }]);
    expect(v2!.terms.map((t) => t.sourceTermId)).toEqual([a[0], a[1]]);
    expect(r.universal.versions[0]!.affirmations).toHaveLength(2);

    // After the resend neither version can take rows (S05), reported as a 409.
    for (const presentedTermId of [v1!.terms[1]!.id, v2!.terms[0]!.id]) {
      const res = await post(me, `/demo/sim/agreements/${agreementId}/affirmations`, { presentedTermId, partyId: p2 });
      expect(res).toEqual({ status: 409, body: { error: { code: 'version_not_affirmable', requestId: expect.any(String) } } });
    }
  });

  it('refuses a resend that adds a term (no escalation) or leaves out a shared safety term, writing nothing', async () => {
    const me = `sim-${randomUUID()}`;
    const { projectId, rec } = await scenario(me);
    const agreementId = rec.agreements[0]!.id;
    const conflict = (code: string) => ({ status: 409, body: { error: { code, requestId: expect.any(String) } } });

    // Pairwise: v1 = [a, b]; c is stored later and cannot be added to a resend.
    const a = (await post(me, `/demo/sim/agreements/${agreementId}/terms`, { content: '[synthetic] a' })).body.id!;
    const b = (await post(me, `/demo/sim/agreements/${agreementId}/terms`, { content: '[synthetic] b' })).body.id!;
    expect((await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: [a, b] })).status).toBe(201);
    const c = (await post(me, `/demo/sim/agreements/${agreementId}/terms`, { content: '[synthetic] c' })).body.id!;
    expect(await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: [a, b, c] })).toEqual(
      conflict('term_added_after_presentation'),
    );
    expect(await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: [a, c] })).toEqual(
      conflict('term_added_after_presentation'),
    );
    // Keeping or leaving out terms of the previous version is allowed.
    expect((await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: [a] })).status).toBe(201);
    // And the resend after that is measured against version 2, not version 1.
    expect(await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: [a, b] })).toEqual(
      conflict('term_added_after_presentation'),
    );

    // Universal: v1 = [s1, s2]; no later version may omit either or add s3.
    const s1 = (await post(me, `/demo/sim/projects/${projectId}/terms`, { content: '[synthetic] safety one' })).body.id!;
    const s2 = (await post(me, `/demo/sim/projects/${projectId}/terms`, { content: '[synthetic] safety two' })).body.id!;
    expect((await post(me, `/demo/sim/projects/${projectId}/versions`, { termIds: [s1, s2] })).status).toBe(201);
    const s3 = (await post(me, `/demo/sim/projects/${projectId}/terms`, { content: '[synthetic] safety three' })).body.id!;
    expect(await post(me, `/demo/sim/projects/${projectId}/versions`, { termIds: [s1] })).toEqual(conflict('universal_term_omitted'));
    expect(await post(me, `/demo/sim/projects/${projectId}/versions`, { termIds: [s1, s2, s3] })).toEqual(
      conflict('term_added_after_presentation'),
    );

    const r = await record(me, projectId);
    expect(r.agreements[0]!.versions.map((v) => v.terms.map((t) => t.sourceTermId))).toEqual([[a, b], [a]]);
    expect(r.universal.versions.map((v) => v.terms.map((t) => t.sourceTermId))).toEqual([[s1, s2]]);
  });

  it('reports the database rules as 409s: duplicate row, party outside the pair, term from elsewhere', async () => {
    const me = `sim-${randomUUID()}`;
    const first = await scenario(me);
    const second = await scenario(me);
    const agreementId = first.rec.agreements[0]!.id;
    const [p1] = first.rec.agreements[0]!.partyIds;
    const t = (await post(me, `/demo/sim/agreements/${agreementId}/terms`, { content: '[synthetic] t' })).body.id!;
    await post(me, `/demo/sim/agreements/${agreementId}/versions`, { termIds: [t] });
    const presented = (await record(me, first.projectId)).agreements[0]!.versions[0]!.terms[0]!.id;

    expect((await post(me, `/demo/sim/agreements/${agreementId}/affirmations`, { presentedTermId: presented, partyId: p1 })).status).toBe(201);
    const again = await post(me, `/demo/sim/agreements/${agreementId}/affirmations`, { presentedTermId: presented, partyId: p1 });
    expect(again.body.error?.code).toBe('already_affirmed');

    const outsider = second.rec.parties[0]!.id;
    const wrongParty = await post(me, `/demo/sim/agreements/${agreementId}/affirmations`, { presentedTermId: presented, partyId: outsider });
    expect({ status: wrongParty.status, code: wrongParty.body.error?.code }).toEqual({ status: 409, code: 'party_not_in_agreement' });

    // A presented term of this agreement, sent to the other scenario's agreement.
    const elsewhere = await post(me, `/demo/sim/agreements/${second.rec.agreements[0]!.id}/affirmations`, { presentedTermId: presented, partyId: p1 });
    expect(elsewhere.body.error?.code).toBe('presented_term_not_found');
    // A stored term of this agreement, presented in the other agreement.
    const foreignTerm = await post(me, `/demo/sim/agreements/${second.rec.agreements[0]!.id}/versions`, { termIds: [t] });
    expect(foreignTerm.body.error?.code).toBe('term_not_in_container');
  });

  it('rejects blank text, empty or repeated term lists, and undeclared fields', async () => {
    const me = `sim-${randomUUID()}`;
    const { projectId } = await scenario(me);
    const t = (await post(me, `/demo/sim/projects/${projectId}/terms`, { content: 'x' })).body.id!;
    for (const [url, payload] of [
      [`/demo/sim/projects/${projectId}/terms`, { content: ' \t\n' }],
      [`/demo/sim/projects/${projectId}/versions`, { termIds: [] }],
      [`/demo/sim/projects/${projectId}/versions`, { termIds: [t, t] }],
      [`/demo/sim/projects/${projectId}/terms`, { content: 'x', required: true }],
      [`/demo/sim/projects/${projectId}/affirmations`, { presentedTermId: t, partyId: t, signedAt: 'now' }],
    ] as const) {
      expect({ url, status: (await post(me, url, payload)).status }).toEqual({ url, status: 400 });
    }
  });

  it('is scoped to the operator who created the project', async () => {
    const owner = `sim-${randomUUID()}`;
    const { projectId, rec } = await scenario(owner);
    const intruder = `sim-${randomUUID()}`;
    expect((await post(intruder, `/demo/sim/projects/${projectId}/terms`, { content: 'x' })).status).toBe(403);
    expect((await post(intruder, `/demo/sim/agreements/${rec.agreements[0]!.id}/terms`, { content: 'x' })).status).toBe(403);
    expect((await post(intruder, `/demo/sim/agreements/${randomUUID()}/terms`, { content: 'x' })).status).toBe(404);
    expect((await record(owner, projectId)).universal.terms).toEqual([]);
  });
});
