import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import {
  addBriefItem,
  BriefActionRefusedError,
  listBriefItems,
  openLiveBrief,
  removeDraftBriefItem,
  updateDraftBriefItem,
  type BriefItemSpec,
} from '../../src/briefs/brief.ts';
import {
  briefFingerprint,
  declineBriefRequest,
  freezeBriefForSigning,
  getBriefGreenState,
  getBriefSigningState,
  groupCheckBriefItems,
  isBriefReadyToSign,
  listBriefTicks,
  setDraftPartyPresence,
  setOpenParameterBySubject,
  settleDecideTogetherItem,
  shareLiveBrief,
  tickBriefItem,
  untickBriefItem,
  type FingerprintSnapshot,
} from '../../src/briefs/live.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { CHECK_VIOLATION, withClient } from '../support/sql.ts';

/**
 * S10 signing freeze and withdrawal against real PostgreSQL, migrated by the
 * production path and used as the runtime role: the freeze preconditions,
 * the fingerprint (application and database computing the same digest),
 * signing rigidity through the data functions and through direct SQL,
 * fingerprint immutability, withdrawal by untick with no residue, re-freeze,
 * and serialized outcomes under concurrency.
 */

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

const db = () => database.db;
const runtime = <T>(fn: (c: pg.Client) => Promise<T>) => withClient(inject('runtimeUrl'), fn);

async function failure(fn: () => Promise<unknown>): Promise<{ code?: string; constraint?: string; reason?: string; name?: string } | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    if (error instanceof BriefActionRefusedError) return { reason: error.reason };
    const e = error as { name?: string; code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    const code = e.code ?? e.cause?.code;
    const constraint = e.constraint ?? e.cause?.constraint;
    if (!code) return { name: e.name ?? 'Error' };
    return constraint ? { code, constraint } : { code };
  }
}
const refused = (reason: string) => ({ reason });
const violation = (constraint: string) => ({ code: CHECK_VIOLATION, constraint });

interface World {
  projectId: string;
  briefId: string;
  /** Photographer. */
  p: string;
  /** Model. */
  m: string;
  pm: string;
  items: { universal: string; shared: string; together: string; parameter: string; request: string; fee: string };
}

const item = (briefId: string, spec: BriefItemSpec) => addBriefItem(db(), briefId, spec);

/**
 * A two-party brief with one of each S09 shape, shared, resolved and ticked
 * by everyone: ready to sign. `photographerOnSite: false` leaves the
 * photographer off site, so the universal item is the model's alone.
 */
async function readyWorld({ photographerOnSite = true, content = '[s10] safety' } = {}): Promise<World> {
  const project = await insertProject(db(), { createdByPrincipalId: `s10-${randomUUID()}` });
  const p = (await addProjectParty(db(), project.id)).id;
  const m = (await addProjectParty(db(), project.id)).id;
  const pm = (await createPairwiseAgreement(db(), project.id, [p, m])).id;
  const briefId = (await openLiveBrief(db(), project.id)).id;
  const universal = (await item(briefId, { layer: 'universal', subjectPartyId: m, shape: 'declaration', content })).id;
  const shared = (await item(briefId, { layer: 'shared', content: '[s10] call time' })).id;
  const together = (await item(briefId, { layer: 'shared', content: '[s10] delivery', pending: 'decide_together' })).id;
  const parameter = (
    await item(briefId, { layer: 'shared', subjectPartyId: m, shape: 'open_parameter', itemKey: 'coverage_level', content: '[s10] coverage', pending: 'subject' })
  ).id;
  const request = (await item(briefId, { layer: 'shared', pairwiseAgreementId: pm, subjectPartyId: m, shape: 'request', content: '[s10] album cover' })).id;
  const fee = (await item(briefId, { layer: 'money', pairwiseAgreementId: pm, itemKey: 'fee', content: '[s10] fee', value: '[s10] 400' })).id;
  await setDraftPartyPresence(db(), briefId, p, photographerOnSite);
  await setDraftPartyPresence(db(), briefId, m, true);
  await shareLiveBrief(db(), briefId);
  await settleDecideTogetherItem(db(), together, '[s10] the 20th');
  await setOpenParameterBySubject(db(), parameter, m, '[s10] level two');
  await tickEverything(briefId);
  expect(await isBriefReadyToSign(db(), briefId)).toBe(true);
  return { projectId: project.id, briefId, p, m, pm, items: { universal, shared, together, parameter, request, fee } };
}

/** Every derived approver ticks every item. */
async function tickEverything(briefId: string): Promise<void> {
  for (const state of (await getBriefGreenState(db(), briefId)).items) {
    for (const party of state.approverIds) await tickBriefItem(db(), state.item.id, party);
  }
}

/** The signing-relevant state read independently, with plain SQL, as the fingerprint's input. */
async function independentSnapshot(briefId: string): Promise<FingerprintSnapshot> {
  return runtime(async (c) => {
    const brief = (await c.query<{ id: string; project_id: string }>('select id, project_id from live_brief where id = $1', [briefId])).rows[0]!;
    const parties = (
      await c.query<{ id: string; on_site: boolean | null }>(
        `select p.id, x.on_site from project_party p left join brief_party_presence x on x.brief_id = $1 and x.party_id = p.id where p.project_id = $2`,
        [briefId, brief.project_id],
      )
    ).rows;
    const pairs = (await c.query<{ id: string; one: string; two: string }>('select id, party_one_id as one, party_two_id as two from pairwise_agreement where project_id = $1', [brief.project_id])).rows;
    const items = (await c.query<Record<string, unknown>>('select * from brief_item where brief_id = $1', [briefId])).rows;
    const onSite = new Set(parties.filter((p) => p.on_site).map((p) => p.id));
    const pairOf = new Map(pairs.map((p) => [p.id, [p.one, p.two]]));
    return {
      briefId: brief.id,
      projectId: brief.project_id,
      parties: parties.map((p) => ({ id: p.id, onSite: p.on_site })),
      pairs: pairs.map((p) => ({ id: p.id, partyIds: [p.one, p.two] as const })),
      items: items.map((i) => ({
        id: i['id'] as string,
        position: i['position'] as number,
        layer: i['layer'] as 'universal' | 'shared' | 'money',
        pairwiseAgreementId: i['pairwise_agreement_id'] as string | null,
        subjectPartyId: i['subject_party_id'] as string | null,
        shape: i['shape'] as 'declaration' | 'request' | 'open_parameter' | null,
        itemKey: i['item_key'] as 'fee' | null,
        content: i['content'] as string | null,
        value: i['value'] as string | null,
        approverIds:
          i['layer'] === 'universal'
            ? [...onSite]
            : i['pairwise_agreement_id']
              ? pairOf.get(i['pairwise_agreement_id'] as string)!
              : parties.map((p) => p.id),
      })),
    };
  });
}

/** Every row S10 could leave behind or the fingerprint binds, for no-residue comparisons. */
async function rowsOf(briefId: string): Promise<Record<string, unknown[]>> {
  return runtime(async (c) => ({
    brief: (await c.query('select * from live_brief where id = $1', [briefId])).rows,
    parties: (await c.query('select p.* from project_party p join live_brief b on b.project_id = p.project_id where b.id = $1 order by p.id', [briefId])).rows,
    pairs: (await c.query('select a.* from pairwise_agreement a join live_brief b on b.project_id = a.project_id where b.id = $1 order by a.id', [briefId])).rows,
    items: (await c.query('select * from brief_item where brief_id = $1 order by id', [briefId])).rows,
    presence: (await c.query('select * from brief_party_presence where brief_id = $1 order by party_id', [briefId])).rows,
    ticks: await listBriefTicks(db(), briefId),
  }));
}

const raw = (sql: string, params: unknown[] = []) => failure(() => runtime((c) => c.query(sql, params)));

/** Waits until some backend is blocked by `blocker`'s locks: proof that a call is waiting on it, not merely late. */
async function untilBlocked(blocker: pg.Client): Promise<void> {
  const blockerPid = (await blocker.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;
  for (let i = 0; i < 250; i += 1) {
    const blocked = await runtime(async (c) =>
      (await c.query<{ n: number }>(`select count(*)::int as n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`, [blockerPid])).rows[0]!.n,
    );
    if (blocked > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('no backend became blocked on a lock');
}

describe('freeze preconditions', () => {
  it('refuses a draft and a live brief that is not ready, changing nothing', async () => {
    const project = await insertProject(db(), { createdByPrincipalId: `s10-${randomUUID()}` });
    const p = (await addProjectParty(db(), project.id)).id;
    const m = (await addProjectParty(db(), project.id)).id;
    await createPairwiseAgreement(db(), project.id, [p, m]);
    const briefId = (await openLiveBrief(db(), project.id)).id;
    const open = await item(briefId, { layer: 'shared', content: '[s10] one' });
    expect(await failure(() => freezeBriefForSigning(db(), briefId))).toEqual(refused('not_live'));
    for (const party of [p, m]) await setDraftPartyPresence(db(), briefId, party, true);
    await shareLiveBrief(db(), briefId);
    await tickBriefItem(db(), open.id, p);
    expect(await failure(() => freezeBriefForSigning(db(), briefId))).toEqual(refused('not_ready'));
    expect(await getBriefSigningState(db(), briefId)).toEqual({ phase: 'live', fingerprint: null });
  });

  it('freezes a ready two-party brief: signing, with the fingerprint of its current state', async () => {
    const w = await readyWorld();
    const before = await rowsOf(w.briefId);
    const { briefId, fingerprint } = await freezeBriefForSigning(db(), w.briefId);
    expect(briefId).toBe(w.briefId);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint).toBe(briefFingerprint(await independentSnapshot(w.briefId)));
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'signing', fingerprint });
    // Nothing but the phase and fingerprint changed; ready-to-sign is a live-phase predicate.
    const after = await rowsOf(w.briefId);
    expect({ ...after, brief: [] }).toEqual({ ...before, brief: [] });
    expect(await isBriefReadyToSign(db(), w.briefId)).toBe(false);
    expect((await getBriefGreenState(db(), w.briefId)).brief.phase).toBe('signing');
  });

  it('refuses anything but exactly two parties and one pair, even when everything is green', async () => {
    // Three parties, two pairs (Fixture 2's topology), driven to all-green first.
    const project = await insertProject(db(), { createdByPrincipalId: `s10-${randomUUID()}` });
    const [a, b, c] = [await addProjectParty(db(), project.id), await addProjectParty(db(), project.id), await addProjectParty(db(), project.id)].map((x) => x.id);
    const ac = (await createPairwiseAgreement(db(), project.id, [a!, c!])).id;
    const bc = (await createPairwiseAgreement(db(), project.id, [b!, c!])).id;
    const briefId = (await openLiveBrief(db(), project.id)).id;
    await item(briefId, { layer: 'universal', content: '[s10] safety' });
    await item(briefId, { layer: 'money', pairwiseAgreementId: ac, itemKey: 'fee', content: '[s10] fee', value: '[s10] 300' });
    await item(briefId, { layer: 'money', pairwiseAgreementId: bc, itemKey: 'fee', content: '[s10] fee', value: '[s10] 200' });
    for (const party of [a!, b!, c!]) await setDraftPartyPresence(db(), briefId, party, true);
    await shareLiveBrief(db(), briefId);
    await tickEverything(briefId);
    expect(await isBriefReadyToSign(db(), briefId)).toBe(true);
    expect(await failure(() => freezeBriefForSigning(db(), briefId))).toEqual(refused('unsupported_topology'));
    // The database refuses the same transition directly, whatever digest it is offered.
    expect(await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [briefId, 'a'.repeat(64)])).toEqual(
      violation('live_brief_signing_requires_two_party'),
    );

    // Two parties without a pair, and a single party, each ready.
    for (const parties of [2, 1]) {
      const solo = await insertProject(db(), { createdByPrincipalId: `s10-${randomUUID()}` });
      const ids = [];
      for (let i = 0; i < parties; i += 1) ids.push((await addProjectParty(db(), solo.id)).id);
      const soloBrief = (await openLiveBrief(db(), solo.id)).id;
      await item(soloBrief, { layer: 'shared', content: '[s10] one' });
      for (const party of ids) await setDraftPartyPresence(db(), soloBrief, party, true);
      await shareLiveBrief(db(), soloBrief);
      await tickEverything(soloBrief);
      expect({ parties, outcome: await failure(() => freezeBriefForSigning(db(), soloBrief)) }).toEqual({ parties, outcome: refused('unsupported_topology') });
      expect({ parties, outcome: await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [soloBrief, 'a'.repeat(64)]) }).toEqual({
        parties,
        outcome: violation('live_brief_signing_requires_two_party'),
      });
    }
    expect(await getBriefSigningState(db(), briefId)).toEqual({ phase: 'live', fingerprint: null });
  });
});

describe('the database guards the transition', () => {
  it('refuses entering signing when not ready, with a wrong or stale digest, or outside READ COMMITTED', async () => {
    const w = await readyWorld();
    const right = briefFingerprint(await independentSnapshot(w.briefId));
    expect(await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [w.briefId, 'b'.repeat(64)])).toEqual(
      violation('live_brief_signing_fingerprint_mismatch'),
    );
    expect(await raw(`update live_brief set phase = 'signing' where id = $1`, [w.briefId])).toEqual(violation('live_brief_signing_fingerprint_mismatch'));
    for (const malformed of [right.toUpperCase(), right.slice(1), `${right}0`]) {
      expect(await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [w.briefId, malformed])).toEqual(
        expect.objectContaining({ code: CHECK_VIOLATION }),
      );
    }
    expect(
      await failure(() =>
        runtime(async (c) => {
          await c.query('begin isolation level repeatable read');
          try {
            await c.query(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [w.briefId, right]);
          } finally {
            await c.query('rollback');
          }
        }),
      ),
    ).toEqual(violation('live_brief_signing_read_committed_only'));

    // Not ready: the right digest of a brief with one tick missing.
    await untickBriefItem(db(), w.items.shared, w.p);
    const notReady = briefFingerprint(await independentSnapshot(w.briefId));
    expect(await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [w.briefId, notReady])).toEqual(
      violation('live_brief_signing_requires_ready'),
    );
    await tickBriefItem(db(), w.items.shared, w.p);

    // The exact digest is admitted: the database computes the same one.
    expect(await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [w.briefId, right])).toBeNull();
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'signing', fingerprint: right });

    // Stale: withdraw, change the brief (decline the request), retick, and offer the old digest.
    await untickBriefItem(db(), w.items.shared, w.p);
    await declineBriefRequest(db(), w.items.request, w.m);
    await tickBriefItem(db(), w.items.shared, w.p);
    expect(await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [w.briefId, right])).toEqual(
      violation('live_brief_signing_fingerprint_mismatch'),
    );
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
  });

  it('computes the same digest as the application for awkward text and a party off site', async () => {
    const awkward = '[s10] "quotes" \\ back\\slash\nnew line\ttab \u0001 control — café 東京 😀 </script>';
    const w = await readyWorld({ photographerOnSite: false, content: awkward });
    const { fingerprint } = await freezeBriefForSigning(db(), w.briefId);
    expect(fingerprint).toBe(briefFingerprint(await independentSnapshot(w.briefId)));
    // The universal item was the model's alone.
    expect((await getBriefGreenState(db(), w.briefId)).items.find((s) => s.item.id === w.items.universal)!.approverIds).toEqual([w.m]);
  });
});

describe('while signing', () => {
  it('refuses every other change through the data functions', async () => {
    const w = await readyWorld();
    await freezeBriefForSigning(db(), w.briefId);
    const before = await rowsOf(w.briefId);
    const attempts: [string, () => Promise<unknown>, object][] = [
      ['freeze again', () => freezeBriefForSigning(db(), w.briefId), refused('not_live')],
      ['tick', () => tickBriefItem(db(), w.items.shared, w.p), refused('not_live')],
      ['group-check', () => groupCheckBriefItems(db(), w.briefId, w.p, [w.items.shared]), refused('not_live')],
      ['settle', () => settleDecideTogetherItem(db(), w.items.together, '[s10] x'), refused('not_live')],
      ['set parameter', () => setOpenParameterBySubject(db(), w.items.parameter, w.m, '[s10] x'), refused('not_live')],
      ['decline', () => declineBriefRequest(db(), w.items.request, w.m), refused('not_live')],
      ['presence', () => setDraftPartyPresence(db(), w.briefId, w.p, false), refused('not_draft')],
      ['share', () => shareLiveBrief(db(), w.briefId), refused('not_draft')],
      ['add item', () => item(w.briefId, { layer: 'shared', content: '[s10] new' }), refused('not_draft')],
      ['edit item', () => updateDraftBriefItem(db(), w.items.shared, { content: '[s10] changed' }), refused('not_draft')],
      ['remove item', () => removeDraftBriefItem(db(), w.items.shared), refused('not_draft')],
      ['add party', () => addProjectParty(db(), w.projectId), violation('project_party_roster_closed')],
      ['add pair', () => createPairwiseAgreement(db(), w.projectId, [w.p, w.m]), violation('pairwise_agreement_signing_fixed')],
    ];
    for (const [name, attempt, expected] of attempts) expect({ name, outcome: await failure(attempt) }).toEqual({ name, outcome: expected });
    expect(await rowsOf(w.briefId)).toEqual(before);
  });

  it('refuses direct SQL that would change signing-relevant state or the fingerprint', async () => {
    const w = await readyWorld();
    const { fingerprint } = await freezeBriefForSigning(db(), w.briefId);
    const before = await rowsOf(w.briefId);
    const other = randomUUID();
    const attempts: [string, string, unknown[], object][] = [
      ['replace fingerprint', `update live_brief set fingerprint = $2 where id = $1`, [w.briefId, 'c'.repeat(64)], violation('live_brief_fingerprint_fixed')],
      ['clear fingerprint only', `update live_brief set fingerprint = null where id = $1`, [w.briefId], violation('live_brief_fingerprint_fixed')],
      ['back to live, fingerprint kept', `update live_brief set phase = 'live' where id = $1`, [w.briefId], violation('live_brief_fingerprint_iff_signing')],
      ['back to draft', `update live_brief set phase = 'draft', fingerprint = null where id = $1`, [w.briefId], violation('live_brief_phase_transition')],
      ['item wording', `update brief_item set content = '[s10] other' where id = $1`, [w.items.shared], violation('brief_item_signing_fixed')],
      ['item position', `update brief_item set position = 99 where id = $1`, [w.items.shared], violation('brief_item_signing_fixed')],
      ['delete request', `delete from brief_item where id = $1`, [w.items.request], violation('brief_item_signing_fixed')],
      ['insert item', `insert into brief_item (brief_id, project_id, layer, content, position) values ($1, $2, 'shared', '[s10] x', 50)`, [w.briefId, w.projectId], violation('brief_item_signing_fixed')],
      ['delete tick', `delete from brief_tick where brief_item_id = $1 and party_id = $2`, [w.items.shared, w.p], violation('brief_tick_signing_fixed')],
      ['insert tick', `insert into brief_tick (brief_item_id, project_id, party_id) values ($1, $2, $3) on conflict do nothing`, [w.items.shared, w.projectId, w.p], violation('brief_tick_requires_live')],
      ['presence change', `update brief_party_presence set on_site = false where brief_id = $1 and party_id = $2`, [w.briefId, w.p], violation('brief_party_presence_live_fixed')],
      ['add party', `insert into project_party (id, project_id) values ($1, $2)`, [other, w.projectId], violation('project_party_roster_closed')],
      ['add pair', `insert into pairwise_agreement (project_id, party_one_id, party_two_id) values ($1, $2, $3)`, [w.projectId, w.p, w.m], violation('pairwise_agreement_signing_fixed')],
    ];
    for (const [name, sql, params, expected] of attempts) expect({ name, outcome: await raw(sql, params) }).toEqual({ name, outcome: expected });
    expect(await rowsOf(w.briefId)).toEqual(before);
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'signing', fingerprint });
  });
});

describe('withdrawal', () => {
  it('an untick returns the brief to live, removes exactly that tick, and leaves no residue', async () => {
    const w = await readyWorld();
    const neverFrozen = await rowsOf(w.briefId);
    await freezeBriefForSigning(db(), w.briefId);
    expect(await untickBriefItem(db(), w.items.fee, w.m)).toBe(true);
    const after = await rowsOf(w.briefId);
    expect(after).toEqual({
      ...neverFrozen,
      ticks: (neverFrozen.ticks as { briefItemId: string; partyId: string }[]).filter((t) => !(t.briefItemId === w.items.fee && t.partyId === w.m)),
    });
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
    expect(await isBriefReadyToSign(db(), w.briefId)).toBe(false);
  });

  it('an untick by a party without that tick changes nothing', async () => {
    const w = await readyWorld({ photographerOnSite: false });
    const { fingerprint } = await freezeBriefForSigning(db(), w.briefId);
    const before = await rowsOf(w.briefId);
    expect(await untickBriefItem(db(), w.items.universal, w.p)).toBe(false);
    expect(await rowsOf(w.briefId)).toEqual(before);
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'signing', fingerprint });
  });

  it('re-freezing rechecks readiness and recomputes: the same state gives the same fingerprint, a changed one a new one', async () => {
    const w = await readyWorld();
    const first = (await freezeBriefForSigning(db(), w.briefId)).fingerprint;
    await untickBriefItem(db(), w.items.shared, w.p);
    expect(await failure(() => freezeBriefForSigning(db(), w.briefId))).toEqual(refused('not_ready'));
    await tickBriefItem(db(), w.items.shared, w.p);
    expect((await freezeBriefForSigning(db(), w.briefId)).fingerprint).toBe(first);

    // Withdraw, decline the request (now possible again, live), retick, re-freeze.
    await untickBriefItem(db(), w.items.shared, w.p);
    await declineBriefRequest(db(), w.items.request, w.m);
    await tickBriefItem(db(), w.items.shared, w.p);
    const second = (await freezeBriefForSigning(db(), w.briefId)).fingerprint;
    expect(second).not.toBe(first);
    expect(second).toBe(briefFingerprint(await independentSnapshot(w.briefId)));
    expect((await listBriefItems(db(), w.briefId)).map((i) => i.id)).not.toContain(w.items.request);
  });
});

describe('fingerprint v1', () => {
  const P = '00000000-0000-4000-8000-0000000000a1';
  const M = '00000000-0000-4000-8000-0000000000b2';
  const PAIR = '00000000-0000-4000-8000-0000000000c3';
  const base: FingerprintSnapshot = {
    briefId: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    parties: [
      { id: M, onSite: true },
      { id: P, onSite: false },
    ],
    pairs: [{ id: PAIR, partyIds: [M, P] }],
    items: [
      { id: '00000000-0000-4000-8000-000000000012', position: 4, layer: 'money', pairwiseAgreementId: PAIR, subjectPartyId: null, shape: null, itemKey: 'fee', content: '[s10] Fee', value: '[s10] 400 "CAD"\n', approverIds: [P, M] },
      { id: '00000000-0000-4000-8000-000000000011', position: 1, layer: 'universal', pairwiseAgreementId: null, subjectPartyId: M, shape: 'declaration', itemKey: null, content: '[s10] Nobody touches my hair — café', value: null, approverIds: [M] },
    ],
  };

  it('matches the pinned golden vector', () => {
    expect(briefFingerprint(base)).toBe('fd2348bc065a9d76053e15e0a111150520bfdb7033ec96e00879f33844a8d50d');
  });

  it('changes with every bound field', () => {
    const golden = briefFingerprint(base);
    const fee = base.items[0]!;
    const universal = base.items[1]!;
    const variants: [string, FingerprintSnapshot][] = [
      ['brief', { ...base, briefId: randomUUID() }],
      ['project', { ...base, projectId: randomUUID() }],
      ['party id', { ...base, parties: [base.parties[0]!, { id: randomUUID(), onSite: false }] }],
      ['on site', { ...base, parties: [base.parties[0]!, { id: P, onSite: true }] }],
      ['presence missing', { ...base, parties: [base.parties[0]!, { id: P, onSite: null }] }],
      ['pair id', { ...base, pairs: [{ id: randomUUID(), partyIds: [M, P] }] }],
      ['pair parties', { ...base, pairs: [{ id: PAIR, partyIds: [M, randomUUID()] }] }],
      ['item id', { ...base, items: [{ ...fee, id: randomUUID() }, universal] }],
      ['layer', { ...base, items: [{ ...fee, layer: 'shared' }, universal] }],
      ['item pair', { ...base, items: [{ ...fee, pairwiseAgreementId: null }, universal] }],
      ['subject', { ...base, items: [fee, { ...universal, subjectPartyId: P }] }],
      ['shape', { ...base, items: [fee, { ...universal, shape: 'request' }] }],
      ['item key', { ...base, items: [{ ...fee, itemKey: null }, universal] }],
      ['wording', { ...base, items: [fee, { ...universal, content: `${universal.content} ` }] }],
      ['value', { ...base, items: [{ ...fee, value: '[s10] 401 "CAD"\n' }, universal] }],
      ['approvers', { ...base, items: [fee, { ...universal, approverIds: [M, P] }] }],
      ['order', { ...base, items: [{ ...fee, position: 0 }, universal] }],
    ];
    for (const [name, variant] of variants) expect({ name, changed: briefFingerprint(variant) !== golden }).toEqual({ name, changed: true });
  });

  it('does not depend on position gaps, input order or id case', () => {
    const golden = briefFingerprint(base);
    const fee = base.items[0]!;
    const universal = base.items[1]!;
    const same: [string, FingerprintSnapshot][] = [
      ['position gap', { ...base, items: [{ ...fee, position: 40 }, { ...universal, position: 2 }] }],
      ['input order', { ...base, parties: [...base.parties].reverse(), items: [universal, fee] }],
      ['pair party order', { ...base, pairs: [{ id: PAIR, partyIds: [P, M] }] }],
      ['approver order', { ...base, items: [{ ...fee, approverIds: [M, P] }, universal] }],
      ['id case', { ...base, briefId: base.briefId.toUpperCase(), items: [{ ...fee, id: fee.id.toUpperCase() }, universal] }],
    ];
    for (const [name, variant] of same) expect({ name, same: briefFingerprint(variant) === golden }).toEqual({ name, same: true });
  });
});

describe('serialized outcomes', () => {
  it('decline before freeze: both succeed when the rest is ready, and the fingerprint is of the brief without the request', async () => {
    const w = await readyWorld();
    await declineBriefRequest(db(), w.items.request, w.m);
    const { fingerprint } = await freezeBriefForSigning(db(), w.briefId);
    expect(fingerprint).toBe(briefFingerprint(await independentSnapshot(w.briefId)));
    expect((await listBriefItems(db(), w.briefId)).map((i) => i.id)).not.toContain(w.items.request);
  });

  it('freeze before decline: the decline is refused and the brief stays as frozen', async () => {
    const w = await readyWorld();
    const { fingerprint } = await freezeBriefForSigning(db(), w.briefId);
    expect(await failure(() => declineBriefRequest(db(), w.items.request, w.m))).toEqual(refused('not_live'));
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'signing', fingerprint });
    expect(fingerprint).toBe(briefFingerprint(await independentSnapshot(w.briefId)));
  });

  it('untick before freeze: readiness is gone and the freeze is refused', async () => {
    const w = await readyWorld();
    expect(await untickBriefItem(db(), w.items.fee, w.p)).toBe(true);
    expect(await failure(() => freezeBriefForSigning(db(), w.briefId))).toEqual(refused('not_ready'));
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
  });

  it('freeze before untick: the untick withdraws, ending live with that tick removed and no fingerprint', async () => {
    const w = await readyWorld();
    await freezeBriefForSigning(db(), w.briefId);
    expect(await untickBriefItem(db(), w.items.fee, w.p)).toBe(true);
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
    expect(await listBriefTicks(db(), w.briefId)).not.toContainEqual({ briefItemId: w.items.fee, partyId: w.p });
  });

  it('racing freeze and decline end in one of the serialized outcomes, never a stale fingerprint', async () => {
    for (let round = 0; round < 6; round += 1) {
      const w = await readyWorld();
      const freezing = () => freezeBriefForSigning(db(), w.briefId);
      const declining = () => declineBriefRequest(db(), w.items.request, w.m);
      // Alternate which call is issued first.
      const [freeze, decline] =
        round % 2 === 0
          ? await Promise.allSettled([freezing(), declining()])
          : await Promise.allSettled([declining(), freezing()]).then(([d, f]) => [f, d] as const);
      expect(freeze.status).toBe('fulfilled');
      const declined = !(await listBriefItems(db(), w.briefId)).some((i) => i.id === w.items.request);
      // Decline first: both succeed. Freeze first: the decline is refused.
      expect(decline.status).toBe(declined ? 'fulfilled' : 'rejected');
      if (decline.status === 'rejected') expect((decline.reason as BriefActionRefusedError).reason).toBe('not_live');
      const state = await getBriefSigningState(db(), w.briefId);
      expect(state.phase).toBe('signing');
      expect(state.fingerprint).toBe(briefFingerprint(await independentSnapshot(w.briefId)));
    }
  });

  it('racing freeze and untick always end live with the tick removed and no fingerprint', async () => {
    for (let round = 0; round < 6; round += 1) {
      const w = await readyWorld();
      const freezing = () => freezeBriefForSigning(db(), w.briefId);
      const unticking = () => untickBriefItem(db(), w.items.fee, w.p);
      const [freeze, untick] =
        round % 2 === 0
          ? await Promise.allSettled([freezing(), unticking()])
          : await Promise.allSettled([unticking(), freezing()]).then(([u, f]) => [f, u] as const);
      expect(untick).toEqual({ status: 'fulfilled', value: true });
      // Untick first: the freeze is refused. Freeze first: the untick withdraws.
      if (freeze.status === 'rejected') expect((freeze.reason as BriefActionRefusedError).reason).toBe('not_ready');
      expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
      expect(await listBriefTicks(db(), w.briefId)).not.toContainEqual({ briefItemId: w.items.fee, partyId: w.p });
    }
  });

  it('two concurrent freezes: one transition, one refusal', async () => {
    const w = await readyWorld();
    const outcomes = await Promise.allSettled([freezeBriefForSigning(db(), w.briefId), freezeBriefForSigning(db(), w.briefId)]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(((outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult).reason as BriefActionRefusedError).reason).toBe('not_live');
  });

  it('a raw decline in flight, bypassing the data functions, is waited for: the freeze then fingerprints the brief without it', async () => {
    const w = await readyWorld();
    await runtime(async (c) => {
      await c.query('begin');
      await c.query('delete from brief_item where id = $1', [w.items.request]);
      const freezing = freezeBriefForSigning(db(), w.briefId);
      await untilBlocked(c);
      await c.query('commit');
      const { fingerprint } = await freezing;
      expect(fingerprint).toBe(briefFingerprint(await independentSnapshot(w.briefId)));
    });
    expect((await listBriefItems(db(), w.briefId)).map((i) => i.id)).not.toContain(w.items.request);
  });

  it('a party insert begun before the brief existed is waited for by the share, which then refuses it', async () => {
    const project = await insertProject(db(), { createdByPrincipalId: `s10-${randomUUID()}` });
    const p = (await addProjectParty(db(), project.id)).id;
    const m = (await addProjectParty(db(), project.id)).id;
    await createPairwiseAgreement(db(), project.id, [p, m]);
    await runtime(async (c) => {
      await c.query('begin');
      // No brief yet: the roster guard admits this third party, uncommitted.
      await c.query('insert into project_party (project_id) values ($1)', [project.id]);
      const briefId = (await openLiveBrief(db(), project.id)).id;
      await item(briefId, { layer: 'shared', content: '[s10] one' });
      for (const party of [p, m]) await setDraftPartyPresence(db(), briefId, party, true);
      const sharing = failure(() => shareLiveBrief(db(), briefId));
      await untilBlocked(c);
      await c.query('commit');
      // The share waited for the roster lock, then saw a party without presence.
      expect(await sharing).toEqual(violation('live_brief_share_requires_presence'));
      expect(await getBriefSigningState(db(), briefId)).toEqual({ phase: 'draft', fingerprint: null });
    });
  });

  it('refuses party and pair inserts outside READ COMMITTED', async () => {
    const project = await insertProject(db(), { createdByPrincipalId: `s10-${randomUUID()}` });
    const p = (await addProjectParty(db(), project.id)).id;
    const m = (await addProjectParty(db(), project.id)).id;
    const inRepeatableRead = (sql: string, params: unknown[]) =>
      failure(() =>
        runtime(async (c) => {
          await c.query('begin isolation level repeatable read');
          try {
            await c.query(sql, params);
          } finally {
            await c.query('rollback');
          }
        }),
      );
    expect(await inRepeatableRead('insert into project_party (project_id) values ($1)', [project.id])).toEqual(violation('project_party_read_committed_only'));
    expect(
      await inRepeatableRead('insert into pairwise_agreement (project_id, party_one_id, party_two_id) values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid))', [project.id, p, m]),
    ).toEqual(violation('pairwise_agreement_read_committed_only'));
  });

  it('a raw tick removal in flight is waited for: the freeze then finds the brief not ready', async () => {
    const w = await readyWorld();
    await runtime(async (c) => {
      await c.query('begin');
      await c.query('delete from brief_tick where brief_item_id = $1 and party_id = $2', [w.items.shared, w.p]);
      const freezing = failure(() => freezeBriefForSigning(db(), w.briefId));
      await untilBlocked(c);
      await c.query('commit');
      expect(await freezing).toEqual(refused('not_ready'));
    });
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
  });
});
