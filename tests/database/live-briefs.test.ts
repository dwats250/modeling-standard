import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import {
  addBriefItem,
  BriefActionRefusedError,
  BriefNotFoundError,
  listBriefItems,
  openLiveBrief,
  removeDraftBriefItem,
  updateDraftBriefItem,
  type BriefItemSpec,
} from '../../src/briefs/brief.ts';
import {
  declineBriefRequest,
  DELIBERATE_TICK_KEYS,
  getBriefGreenState,
  getBriefGreenStateVisibleTo,
  groupCheckBriefItems,
  isBriefReadyToSign,
  listBriefPresence,
  listBriefTicks,
  setDraftPartyPresence,
  setOpenParameterBySubject,
  settleDecideTogetherItem,
  shareLiveBrief,
  tickBriefItem,
  untickBriefItem,
} from '../../src/briefs/live.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, withClient } from '../support/sql.ts';

/**
 * S09 live brief against real PostgreSQL, migrated by the production path and
 * used as the runtime role: phase and share, presence, post-share rigidity,
 * resolution, decline, ticks, derived approvers, group-check, green state,
 * ready to sign, concurrency and the absence of history.
 */

const FOREIGN_KEY_VIOLATION = '23503';

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

const db = () => database.db;
const runtime = <T>(fn: (c: pg.Client) => Promise<T>) => withClient(inject('runtimeUrl'), fn);
const owner = <T>(fn: (c: pg.Client) => Promise<T>) => withClient(inject('migrationUrl'), fn);

/** The SQLSTATE and constraint a call failed with, the refusal reason, or null. */
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
  /** Pair photographer–model. */
  pm: string;
}

/** A project with two parties and their pair, and an open draft brief. */
async function world(): Promise<World> {
  const project = await insertProject(db(), { createdByPrincipalId: `s09-${randomUUID()}` });
  const p = (await addProjectParty(db(), project.id)).id;
  const m = (await addProjectParty(db(), project.id)).id;
  const pm = (await createPairwiseAgreement(db(), project.id, [p, m])).id;
  const brief = await openLiveBrief(db(), project.id);
  return { projectId: project.id, briefId: brief.id, p, m, pm };
}

async function presentAll(w: World, parties: readonly string[] = [w.p, w.m]): Promise<void> {
  for (const party of parties) await setDraftPartyPresence(db(), w.briefId, party, true);
}

const item = (w: World, spec: BriefItemSpec) => addBriefItem(db(), w.briefId, spec);
const tickCount = async (itemId: string): Promise<number> =>
  runtime(async (c) => (await c.query<{ n: number }>('select count(*)::int as n from brief_tick where brief_item_id = $1', [itemId])).rows[0]!.n);
const phaseOf = async (briefId: string): Promise<string> =>
  runtime(async (c) => (await c.query<{ phase: string }>('select phase from live_brief where id = $1', [briefId])).rows[0]!.phase);

describe('phase and share', () => {
  it('a new brief starts as a draft', async () => {
    const w = await world();
    expect(await phaseOf(w.briefId)).toBe('draft');
    expect((await getBriefGreenState(db(), w.briefId)).brief.phase).toBe('draft');
  });

  it('shares a draft whose items have wording and whose parties all have presence, leaving the items as they were', async () => {
    const w = await world();
    await item(w, { layer: 'shared', content: '[s09] one' });
    await presentAll(w);
    const before = await listBriefItems(db(), w.briefId);
    expect(await shareLiveBrief(db(), w.briefId)).toEqual({ id: w.briefId, projectId: w.projectId, phase: 'live' });
    expect(await listBriefItems(db(), w.briefId)).toEqual(before);
  });

  it('refuses a repeated share, a return to draft and a brief inserted live', async () => {
    const w = await world();
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    expect(await failure(() => shareLiveBrief(db(), w.briefId))).toEqual(refused('not_draft'));
    expect(await failure(() => runtime((c) => c.query(`update live_brief set phase = 'draft' where id = $1`, [w.briefId])))).toEqual(
      violation('live_brief_phase_transition'),
    );
    const other = await insertProject(db(), { createdByPrincipalId: `s09-${randomUUID()}` });
    expect(
      await failure(() => runtime((c) => c.query(`insert into live_brief (project_id, phase) values ($1, 'live')`, [other.id]))),
    ).toEqual(violation('live_brief_phase_transition'));
    // No other phase exists in S09; the transition guard refuses before the CHECK is reached.
    expect(await failure(() => runtime((c) => c.query(`update live_brief set phase = 'signing' where id = $1`, [w.briefId])))).toEqual(
      violation('live_brief_phase_transition'),
    );
    expect(await failure(() => shareLiveBrief(db(), randomUUID()))).toEqual({ name: BriefNotFoundError.name });
    expect(await phaseOf(w.briefId)).toBe('live');
  });

  it('refuses to share an item whose keyed wording is not materialized, through the function and raw SQL', async () => {
    const w = await world();
    await item(w, { layer: 'universal', itemKey: 'no_means_no' });
    await presentAll(w);
    expect(await failure(() => shareLiveBrief(db(), w.briefId))).toEqual(violation('live_brief_share_requires_wording'));
    expect(await failure(() => runtime((c) => c.query(`update live_brief set phase = 'live' where id = $1`, [w.briefId])))).toEqual(
      violation('live_brief_share_requires_wording'),
    );
    expect(await phaseOf(w.briefId)).toBe('draft');
  });

  it('refuses to share while any party lacks an explicit presence fact; missing is never read as false', async () => {
    const w = await world();
    await item(w, { layer: 'shared', content: '[s09] one' });
    await setDraftPartyPresence(db(), w.briefId, w.p, true);
    expect(await failure(() => shareLiveBrief(db(), w.briefId))).toEqual(violation('live_brief_share_requires_presence'));
    await setDraftPartyPresence(db(), w.briefId, w.m, false);
    expect((await shareLiveBrief(db(), w.briefId)).phase).toBe('live');
  });

  it('shares with explicit pending states: decide-together and an open parameter awaiting its subject', async () => {
    const w = await world();
    await item(w, { layer: 'shared', content: '[s09] date', pending: 'decide_together' });
    await item(w, { layer: 'shared', subjectPartyId: w.m, shape: 'open_parameter', content: '[s09] level', pending: 'subject' });
    await presentAll(w);
    expect((await shareLiveBrief(db(), w.briefId)).phase).toBe('live');
  });
});

describe('presence', () => {
  it('holds one explicit fact per party, mutable while draft', async () => {
    const w = await world();
    await setDraftPartyPresence(db(), w.briefId, w.p, true);
    await setDraftPartyPresence(db(), w.briefId, w.p, false);
    await setDraftPartyPresence(db(), w.briefId, w.m, true);
    expect(await listBriefPresence(db(), w.briefId)).toEqual(
      [
        { partyId: w.p, onSite: false },
        { partyId: w.m, onSite: true },
      ].sort((a, b) => a.partyId.localeCompare(b.partyId)),
    );
    expect(
      await failure(() =>
        runtime((c) =>
          c.query('insert into brief_party_presence (brief_id, project_id, party_id, on_site) values ($1, $2, $3, true)', [
            w.briefId,
            w.projectId,
            w.p,
          ]),
        ),
      ),
    ).toEqual({ code: '23505', constraint: 'brief_party_presence_pk' });
  });

  it('refuses a party of another project', async () => {
    const w = await world();
    const elsewhere = await world();
    expect(await failure(() => setDraftPartyPresence(db(), w.briefId, elsewhere.p, true))).toEqual({
      code: FOREIGN_KEY_VIOLATION,
      constraint: 'brief_party_presence_party_in_project_fk',
    });
  });

  it('is fixed once live, through the function and raw SQL, and the roster is closed', async () => {
    const w = await world();
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    expect(await failure(() => setDraftPartyPresence(db(), w.briefId, w.p, false))).toEqual(refused('not_draft'));
    expect(
      await failure(() => runtime((c) => c.query('update brief_party_presence set on_site = false where brief_id = $1', [w.briefId]))),
    ).toEqual(violation('brief_party_presence_live_fixed'));
    // The runtime role cannot delete presence at all; the guard refuses even the owner.
    expect(await failure(() => runtime((c) => c.query('delete from brief_party_presence where brief_id = $1', [w.briefId])))).toEqual({
      code: INSUFFICIENT_PRIVILEGE,
    });
    expect(await failure(() => owner((c) => c.query('delete from brief_party_presence where brief_id = $1', [w.briefId])))).toEqual(
      violation('brief_party_presence_live_fixed'),
    );
    expect(await failure(() => addProjectParty(db(), w.projectId))).toEqual(violation('project_party_roster_closed'));
    expect(await listBriefPresence(db(), w.briefId)).toHaveLength(2);
  });

  it('allows adding a party while the brief is a draft', async () => {
    const w = await world();
    expect((await addProjectParty(db(), w.projectId)).projectId).toBe(w.projectId);
  });

  it('decides the universal approvers: on site approves, not on site does not', async () => {
    const w = await world();
    const safety = await item(w, { layer: 'universal', content: '[s09] safety' });
    await setDraftPartyPresence(db(), w.briefId, w.p, true);
    await setDraftPartyPresence(db(), w.briefId, w.m, false);
    await shareLiveBrief(db(), w.briefId);
    expect(await failure(() => tickBriefItem(db(), safety.id, w.m))).toEqual(violation('brief_tick_requires_approver'));
    await tickBriefItem(db(), safety.id, w.p);
    const state = await getBriefGreenState(db(), w.briefId);
    expect(state.items[0]).toMatchObject({ approverIds: [w.p], tickedBy: [w.p], green: true });
  });
});

describe('post-share rigidity', () => {
  async function liveWorld() {
    const w = await world();
    const plain = await item(w, { layer: 'shared', content: '[s09] plain', value: '[s09] value' });
    const together = await item(w, { layer: 'shared', content: '[s09] together', pending: 'decide_together' });
    const safetyRequest = await item(w, { layer: 'universal', subjectPartyId: w.m, shape: 'request', content: '[s09] universal request' });
    const request = await item(w, { layer: 'shared', subjectPartyId: w.m, shape: 'request', content: '[s09] request' });
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    return { w, plain, together, safetyRequest, request };
  }

  it('refuses any new item', async () => {
    const { w } = await liveWorld();
    expect(await failure(() => item(w, { layer: 'shared', content: '[s09] late' }))).toEqual(refused('not_draft'));
    expect(
      await failure(() =>
        runtime((c) =>
          c.query(`insert into brief_item (brief_id, project_id, layer, content, position) values ($1, $2, 'shared', '[s09] late', 99)`, [
            w.briefId,
            w.projectId,
          ]),
        ),
      ),
    ).toEqual(violation('brief_item_live_no_insert'));
  });

  it('refuses a content or position change, and draft edits through the composition functions', async () => {
    const { plain } = await liveWorld();
    for (const sql of [`update brief_item set content = '[s09] changed' where id = $1`, 'update brief_item set position = 50 where id = $1']) {
      expect(await failure(() => runtime((c) => c.query(sql, [plain.id])))).toEqual(violation('brief_item_live_rigid'));
    }
    expect(await failure(() => updateDraftBriefItem(db(), plain.id, { content: '[s09] changed' }))).toEqual(refused('not_draft'));
  });

  it('settles a pending value exactly once; a settled value cannot change and pending cannot reopen', async () => {
    const { plain, together } = await liveWorld();
    expect(await failure(() => runtime((c) => c.query(`update brief_item set value = '[s09] wider' where id = $1`, [plain.id])))).toEqual(
      violation('brief_item_live_rigid'),
    );
    await runtime((c) => c.query(`update brief_item set value = '[s09] agreed', pending = null where id = $1`, [together.id]));
    expect(await failure(() => runtime((c) => c.query(`update brief_item set value = '[s09] again' where id = $1`, [together.id])))).toEqual(
      violation('brief_item_live_rigid'),
    );
    expect(
      await failure(() =>
        runtime((c) => c.query(`update brief_item set value = null, pending = 'decide_together' where id = $1`, [together.id])),
      ),
    ).toEqual(violation('brief_item_live_rigid'));
    // A settled item with no value cannot gain one.
    expect(await failure(() => runtime((c) => c.query(`update brief_item set pending = 'decide_together' where id = $1`, [plain.id])))).toEqual(
      violation('brief_item_live_rigid'),
    );
  });

  it('never deletes universal material, and refuses any delete but a non-universal request', async () => {
    const { plain, safetyRequest, request } = await liveWorld();
    expect(await failure(() => runtime((c) => c.query('delete from brief_item where id = $1', [safetyRequest.id])))).toEqual(
      violation('brief_item_live_universal_kept'),
    );
    expect(await failure(() => runtime((c) => c.query('delete from brief_item where id = $1', [plain.id])))).toEqual(
      violation('brief_item_live_no_delete'),
    );
    expect(await failure(() => removeDraftBriefItem(db(), plain.id))).toEqual(refused('not_draft'));
    expect(await failure(() => removeDraftBriefItem(db(), request.id))).toEqual(refused('not_draft'));
  });

  it('leaves the draft freely mutable', async () => {
    const w = await world();
    const a = await item(w, { layer: 'universal', content: '[s09] a' });
    await updateDraftBriefItem(db(), a.id, { content: '[s09] a2' });
    await runtime((c) => c.query('update brief_item set position = 7 where id = $1', [a.id]));
    await removeDraftBriefItem(db(), a.id);
    await setDraftPartyPresence(db(), w.briefId, w.p, true);
    expect(await listBriefItems(db(), w.briefId)).toEqual([]);
  });
});

describe('resolution', () => {
  async function pending() {
    const w = await world();
    const together = await item(w, { layer: 'money', pairwiseAgreementId: w.pm, itemKey: 'fee', content: '[s09] fee', pending: 'decide_together' });
    const parameter = await item(w, {
      layer: 'shared',
      subjectPartyId: w.m,
      shape: 'open_parameter',
      itemKey: 'coverage_level',
      content: '[s09] level',
      pending: 'subject',
    });
    await presentAll(w);
    return { w, together, parameter };
  }

  it('settles a decide-together item once, and only when live and with a value', async () => {
    const { w, together } = await pending();
    expect(await failure(() => settleDecideTogetherItem(db(), together.id, '[s09] 300'))).toEqual(refused('not_live'));
    await shareLiveBrief(db(), w.briefId);
    expect(await failure(() => settleDecideTogetherItem(db(), together.id, '  '))).toEqual(refused('blank_value'));
    const settled = await settleDecideTogetherItem(db(), together.id, '[s09] 300');
    expect(settled).toMatchObject({ value: '[s09] 300', pending: null, content: '[s09] fee' });
    expect(await failure(() => settleDecideTogetherItem(db(), together.id, '[s09] 400'))).toEqual(refused('not_decide_together'));
  });

  it('lets only the subject set an open parameter, once', async () => {
    const { w, parameter } = await pending();
    await shareLiveBrief(db(), w.briefId);
    expect(await failure(() => settleDecideTogetherItem(db(), parameter.id, '[s09] x'))).toEqual(refused('not_decide_together'));
    expect(await failure(() => setOpenParameterBySubject(db(), parameter.id, w.p, '[s09] level 3'))).toEqual(refused('not_subject'));
    const set = await setOpenParameterBySubject(db(), parameter.id, w.m, '[s09] level 2');
    expect(set).toMatchObject({ value: '[s09] level 2', pending: null });
    expect(await failure(() => setOpenParameterBySubject(db(), parameter.id, w.m, '[s09] level 1'))).toEqual(refused('not_open_parameter'));
  });
});

describe('decline', () => {
  it('lets the subject decline a request: it and its ticks disappear, and nothing records it', async () => {
    const w = await world();
    const keep = await item(w, { layer: 'shared', content: '[s09] keep' });
    const request = await item(w, { layer: 'shared', pairwiseAgreementId: w.pm, subjectPartyId: w.m, shape: 'request', content: '[s09] album cover' });
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    await tickBriefItem(db(), request.id, w.p);
    expect(await tickCount(request.id)).toBe(1);

    expect(await failure(() => declineBriefRequest(db(), request.id, w.p))).toEqual(refused('not_subject'));
    expect((await listBriefItems(db(), w.briefId)).map((i) => i.id)).toContain(request.id);

    const before = await owner(async (c) => {
      // Scoped to this project: other suites write to the same database concurrently.
      const { rows } = await c.query<{ n: number }>(
        `select (select count(*) from brief_item where project_id = $1) + (select count(*) from brief_tick where project_id = $1)
                + (select count(*) from brief_party_presence where project_id = $1) + (select count(*) from live_brief where project_id = $1) as n`,
        [w.projectId],
      );
      return Number(rows[0]!.n);
    });
    await declineBriefRequest(db(), request.id, w.m);
    expect((await listBriefItems(db(), w.briefId)).map((i) => i.id)).toEqual([keep.id]);
    expect(await tickCount(request.id)).toBe(0);
    // Exactly the item and its one tick are gone; nothing was written anywhere.
    const after = await owner(async (c) => {
      // Scoped to this project: other suites write to the same database concurrently.
      const { rows } = await c.query<{ n: number }>(
        `select (select count(*) from brief_item where project_id = $1) + (select count(*) from brief_tick where project_id = $1)
                + (select count(*) from brief_party_presence where project_id = $1) + (select count(*) from live_brief where project_id = $1) as n`,
        [w.projectId],
      );
      return Number(rows[0]!.n);
    });
    expect(before - after).toBe(2);
    const declineNames = await owner(async (c) =>
      (
        await c.query<{ name: string }>(
          `select table_name || '.' || column_name as name from information_schema.columns
            where table_schema = 'public' and (table_name ~ 'declin' or column_name ~ 'declin')`,
        )
      ).rows,
    );
    expect(declineNames).toEqual([]);
  });

  it('refuses to decline a declaration, an open parameter, or anything once universal', async () => {
    const w = await world();
    const declaration = await item(w, { layer: 'shared', subjectPartyId: w.m, shape: 'declaration', content: '[s09] hair' });
    const safety = await item(w, { layer: 'universal', subjectPartyId: w.m, shape: 'request', content: '[s09] universal request' });
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    expect(await failure(() => declineBriefRequest(db(), declaration.id, w.m))).toEqual(refused('not_request'));
    expect(await failure(() => declineBriefRequest(db(), safety.id, w.m))).toEqual(refused('universal_kept'));
    expect(await listBriefItems(db(), w.briefId)).toHaveLength(2);
  });

  it('only happens on a live brief', async () => {
    const w = await world();
    const request = await item(w, { layer: 'shared', subjectPartyId: w.m, shape: 'request', content: '[s09] r' });
    expect(await failure(() => declineBriefRequest(db(), request.id, w.m))).toEqual(refused('not_live'));
  });
});

describe('ticks', () => {
  async function three() {
    const project = await insertProject(db(), { createdByPrincipalId: `s09-${randomUUID()}` });
    const [p, m, c] = [
      (await addProjectParty(db(), project.id)).id,
      (await addProjectParty(db(), project.id)).id,
      (await addProjectParty(db(), project.id)).id,
    ];
    const pm = (await createPairwiseAgreement(db(), project.id, [p, m])).id;
    const brief = await openLiveBrief(db(), project.id);
    const w: World = { projectId: project.id, briefId: brief.id, p, m, pm };
    const universal = await item(w, { layer: 'universal', content: '[s09] safety' });
    const projectWide = await item(w, { layer: 'shared', content: '[s09] call time' });
    const pairShared = await item(w, { layer: 'shared', pairwiseAgreementId: pm, content: '[s09] deliverables' });
    const money = await item(w, { layer: 'money', pairwiseAgreementId: pm, itemKey: 'fee', content: '[s09] fee', value: '[s09] 300' });
    const pendingItem = await item(w, { layer: 'shared', content: '[s09] date', pending: 'decide_together' });
    await setDraftPartyPresence(db(), brief.id, p, true);
    await setDraftPartyPresence(db(), brief.id, m, true);
    await setDraftPartyPresence(db(), brief.id, c, false);
    return { w, c, universal, projectWide, pairShared, money, pendingItem };
  }

  it('derives approvers: universal → on site; shared project-wide → everyone; pair-scoped shared and money → the pair', async () => {
    const t = await three();
    await shareLiveBrief(db(), t.w.briefId);
    const state = await getBriefGreenState(db(), t.w.briefId);
    const approvers = (id: string) => state.items.find((s) => s.item.id === id)!.approverIds;
    const sorted = (ids: string[]) => [...ids].sort();
    expect(approvers(t.universal.id)).toEqual(sorted([t.w.p, t.w.m]));
    expect(approvers(t.projectWide.id)).toEqual(sorted([t.w.p, t.w.m, t.c]));
    expect(approvers(t.pairShared.id)).toEqual(sorted([t.w.p, t.w.m]));
    expect(approvers(t.money.id)).toEqual(sorted([t.w.p, t.w.m]));
    // The database agrees: C may tick only the project-wide item.
    for (const id of [t.universal.id, t.pairShared.id, t.money.id]) {
      expect(await failure(() => tickBriefItem(db(), id, t.c))).toEqual(violation('brief_tick_requires_approver'));
    }
    await tickBriefItem(db(), t.projectWide.id, t.c);
  });

  it('refuses a tick on a draft, on a pending item, from a stranger, and through raw SQL alike', async () => {
    const t = await three();
    expect(await failure(() => tickBriefItem(db(), t.projectWide.id, t.w.p))).toEqual(refused('not_live'));
    expect(
      await failure(() =>
        runtime((c) =>
          c.query('insert into brief_tick (brief_item_id, project_id, party_id) values ($1, $2, $3)', [t.projectWide.id, t.w.projectId, t.w.p]),
        ),
      ),
    ).toEqual(violation('brief_tick_requires_live'));
    await shareLiveBrief(db(), t.w.briefId);
    expect(await failure(() => tickBriefItem(db(), t.pendingItem.id, t.w.p))).toEqual(violation('brief_tick_requires_settled'));
    const elsewhere = await world();
    expect(
      await failure(() =>
        runtime((c) =>
          c.query('insert into brief_tick (brief_item_id, project_id, party_id) values ($1, $2, $3)', [t.money.id, t.w.projectId, elsewhere.p]),
        ),
      ),
    ).toEqual(violation('brief_tick_requires_approver'));
    expect(
      await failure(() =>
        runtime((c) =>
          c.query('insert into brief_tick (brief_item_id, project_id, party_id) values ($1, $2, $3)', [t.money.id, elsewhere.projectId, elsewhere.p]),
        ),
      ),
    ).toEqual(violation('brief_tick_requires_live'));
  });

  it('cannot reach an item without stored wording: such an item cannot be shared', async () => {
    const w = await world();
    const keyed = await item(w, { layer: 'universal', itemKey: 'no_means_no' });
    await presentAll(w);
    expect(await failure(() => shareLiveBrief(db(), w.briefId))).toEqual(violation('live_brief_share_requires_wording'));
    expect(await failure(() => tickBriefItem(db(), keyed.id, w.p))).toEqual(refused('not_live'));
  });

  it('is idempotent on repeat, and an untick removes only that party’s current tick', async () => {
    const t = await three();
    await shareLiveBrief(db(), t.w.briefId);
    expect(await tickBriefItem(db(), t.money.id, t.w.p)).toEqual({ briefItemId: t.money.id, partyId: t.w.p });
    expect(await tickBriefItem(db(), t.money.id, t.w.p)).toEqual({ briefItemId: t.money.id, partyId: t.w.p });
    await tickBriefItem(db(), t.money.id, t.w.m);
    expect(await tickCount(t.money.id)).toBe(2);
    expect(await untickBriefItem(db(), t.money.id, t.w.p)).toBe(true);
    expect(await untickBriefItem(db(), t.money.id, t.w.p)).toBe(false);
    expect(await listBriefTicks(db(), t.w.briefId)).toEqual([{ briefItemId: t.money.id, partyId: t.w.m }]);
  });
});

describe('group-check', () => {
  async function eligible() {
    const w = await world();
    const ordinary = [
      await item(w, { layer: 'universal', content: '[s09] safety' }),
      await item(w, { layer: 'shared', content: '[s09] call time' }),
      await item(w, { layer: 'shared', pairwiseAgreementId: w.pm, content: '[s09] deliverables' }),
    ];
    const deliberate = {
      fee: await item(w, { layer: 'money', pairwiseAgreementId: w.pm, itemKey: 'fee', content: '[s09] fee', value: '[s09] 300' }),
      coverage_level: await item(w, { layer: 'shared', itemKey: 'coverage_level', content: '[s09] coverage', value: '[s09] level 2' }),
      physical_contact: await item(w, { layer: 'shared', itemKey: 'physical_contact', content: '[s09] contact', value: '[s09] none' }),
      stop_rule: await item(w, { layer: 'universal', itemKey: 'stop_rule', content: '[s09] stop rule' }),
    };
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    return { w, ordinary, deliberate };
  }

  it('inserts the same individual ticks as single ticks, for every selected ordinary item', async () => {
    const g = await eligible();
    const ids = g.ordinary.map((i) => i.id);
    const result = await groupCheckBriefItems(db(), g.w.briefId, g.w.p, [...ids, ids[0]!]);
    expect(result).toEqual([...ids].sort().map((briefItemId) => ({ briefItemId, partyId: g.w.p })));
    await tickBriefItem(db(), g.deliberate.fee.id, g.w.p);
    // A group-checked tick and a single tick are indistinguishable rows.
    const rows = await owner(
      async (c) => (await c.query<Record<string, string>>('select * from brief_tick where party_id = $1 order by brief_item_id', [g.w.p])).rows,
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['brief_item_id', 'party_id', 'project_id']);
  });

  it('refuses each deliberate-tick key, changing nothing', async () => {
    const g = await eligible();
    expect([...DELIBERATE_TICK_KEYS].sort()).toEqual(['coverage_level', 'fee', 'physical_contact', 'stop_rule']);
    for (const [key, deliberate] of Object.entries(g.deliberate)) {
      const outcome = await failure(() => groupCheckBriefItems(db(), g.w.briefId, g.w.p, [g.ordinary[0]!.id, deliberate.id]));
      expect({ key, outcome }).toEqual({ key, outcome: refused('deliberate_tick') });
    }
    expect(await listBriefTicks(db(), g.w.briefId)).toEqual([]);
    // Each still takes its own deliberate tick.
    for (const deliberate of Object.values(g.deliberate)) await tickBriefItem(db(), deliberate.id, g.w.p);
  });

  it('is atomic: one item the party may not tick, or one from another brief, leaves everything unticked', async () => {
    const g = await eligible();
    const elsewhere = await world();
    const other = await item(elsewhere, { layer: 'shared', content: '[s09] elsewhere' });
    expect(await failure(() => groupCheckBriefItems(db(), g.w.briefId, g.w.p, [g.ordinary[0]!.id, other.id]))).toEqual(
      refused('item_not_in_brief'),
    );
    // Not on site: the party may tick the shared items but not the universal one.
    const w = await world();
    const universal = await item(w, { layer: 'universal', content: '[s09] safety' });
    const shared = await item(w, { layer: 'shared', content: '[s09] call' });
    await setDraftPartyPresence(db(), w.briefId, w.p, true);
    await setDraftPartyPresence(db(), w.briefId, w.m, false);
    await shareLiveBrief(db(), w.briefId);
    expect(await failure(() => groupCheckBriefItems(db(), w.briefId, w.m, [shared.id, universal.id]))).toEqual(
      violation('brief_tick_requires_approver'),
    );
    expect(await listBriefTicks(db(), w.briefId)).toEqual([]);
    expect(await listBriefTicks(db(), g.w.briefId)).toEqual([]);
  });

  it('records nothing about its use', async () => {
    const names = await owner(
      async (c) =>
        (
          await c.query<{ name: string }>(
            `select table_name || '.' || column_name as name from information_schema.columns
              where table_schema = 'public' and table_name in ('live_brief', 'brief_item', 'brief_party_presence', 'brief_tick')
                and column_name ~ '(group|bulk|batch|source|method|via)'`,
          )
        ).rows,
    );
    expect(names).toEqual([]);
  });
});

describe('green state and ready to sign', () => {
  async function scenario() {
    const w = await world();
    const universal = await item(w, { layer: 'universal', content: '[s09] safety' });
    const shared = await item(w, { layer: 'shared', content: '[s09] call time' });
    const together = await item(w, { layer: 'shared', content: '[s09] delivery date', pending: 'decide_together' });
    const request = await item(w, { layer: 'shared', subjectPartyId: w.m, shape: 'request', content: '[s09] album cover' });
    const fee = await item(w, { layer: 'money', pairwiseAgreementId: w.pm, itemKey: 'fee', content: '[s09] fee', value: '[s09] 300' });
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    return { w, universal, shared, together, request, fee };
  }
  const tickAll = async (w: World, ids: string[]) => {
    for (const id of ids) for (const party of [w.p, w.m]) await tickBriefItem(db(), id, party);
  };

  it('is green only when every approver ticks, and ready only when nothing is pending and everything is green', async () => {
    const s = await scenario();
    await tickBriefItem(db(), s.shared.id, s.w.p);
    let state = await getBriefGreenState(db(), s.w.briefId);
    expect(state.items.find((i) => i.item.id === s.shared.id)).toMatchObject({ tickedBy: [s.w.p], green: false });
    await tickAll(s.w, [s.universal.id, s.shared.id, s.request.id, s.fee.id]);
    state = await getBriefGreenState(db(), s.w.briefId);
    expect(state.items.filter((i) => i.green).map((i) => i.item.id).sort()).toEqual(
      [s.universal.id, s.shared.id, s.request.id, s.fee.id].sort(),
    );
    // The decide-together item is pending: not green, not ready.
    expect(await isBriefReadyToSign(db(), s.w.briefId)).toBe(false);
    await settleDecideTogetherItem(db(), s.together.id, '[s09] the 20th');
    expect(await isBriefReadyToSign(db(), s.w.briefId)).toBe(false);
    await tickAll(s.w, [s.together.id]);
    expect(await isBriefReadyToSign(db(), s.w.briefId)).toBe(true);

    // An untick immediately removes readiness; a retick restores it.
    await untickBriefItem(db(), s.fee.id, s.w.m);
    expect(await isBriefReadyToSign(db(), s.w.briefId)).toBe(false);
    expect((await getBriefGreenState(db(), s.w.briefId)).items.find((i) => i.item.id === s.fee.id)!.green).toBe(false);
    await tickBriefItem(db(), s.fee.id, s.w.m);
    expect(await isBriefReadyToSign(db(), s.w.briefId)).toBe(true);
  });

  it('declining a permitted request can make the rest of the brief ready', async () => {
    const s = await scenario();
    await settleDecideTogetherItem(db(), s.together.id, '[s09] the 20th');
    await tickAll(s.w, [s.universal.id, s.shared.id, s.together.id, s.fee.id]);
    await tickBriefItem(db(), s.request.id, s.w.p);
    expect(await isBriefReadyToSign(db(), s.w.briefId)).toBe(false);
    await declineBriefRequest(db(), s.request.id, s.w.m);
    expect(await isBriefReadyToSign(db(), s.w.briefId)).toBe(true);
  });

  it('a draft is never ready', async () => {
    const w = await world();
    await presentAll(w);
    expect(await isBriefReadyToSign(db(), w.briefId)).toBe(false);
  });

  it('shows a party money and its tick state only for its own pair', async () => {
    const project = await insertProject(db(), { createdByPrincipalId: `s09-${randomUUID()}` });
    const [a, b, c] = [
      (await addProjectParty(db(), project.id)).id,
      (await addProjectParty(db(), project.id)).id,
      (await addProjectParty(db(), project.id)).id,
    ];
    const ac = (await createPairwiseAgreement(db(), project.id, [a, c])).id;
    const bc = (await createPairwiseAgreement(db(), project.id, [b, c])).id;
    const brief = await openLiveBrief(db(), project.id);
    const w: World = { projectId: project.id, briefId: brief.id, p: a, m: c, pm: ac };
    await item(w, { layer: 'shared', content: '[s09] call' });
    const feeAc = await item(w, { layer: 'money', pairwiseAgreementId: ac, itemKey: 'fee', content: '[s09] fee', value: '[s09] 1' });
    const feeBc = await item(w, { layer: 'money', pairwiseAgreementId: bc, itemKey: 'fee', content: '[s09] fee', value: '[s09] 2' });
    for (const party of [a, b, c]) await setDraftPartyPresence(db(), brief.id, party, true);
    await shareLiveBrief(db(), brief.id);
    await tickBriefItem(db(), feeBc.id, b);
    const seenBy = async (party: string) => (await getBriefGreenStateVisibleTo(db(), brief.id, party)).items.map((i) => i.item.id);
    expect(await seenBy(a)).not.toContain(feeBc.id);
    expect(await seenBy(a)).toContain(feeAc.id);
    expect(await seenBy(b)).toContain(feeBc.id);
    expect(await seenBy(b)).not.toContain(feeAc.id);
    expect((await seenBy(c)).sort()).toEqual((await listBriefItems(db(), brief.id)).map((i) => i.id).sort());
    const forB = await getBriefGreenStateVisibleTo(db(), brief.id, b);
    expect(forB.items.find((i) => i.item.id === feeBc.id)!.tickedBy).toEqual([b]);
    expect(Object.keys(forB).sort()).toEqual(['brief', 'items']);
  });
});

describe('concurrency', () => {
  it('two concurrent shares: one transition, one refusal', async () => {
    const w = await world();
    await item(w, { layer: 'shared', content: '[s09] one' });
    await presentAll(w);
    const outcomes = await Promise.allSettled([shareLiveBrief(db(), w.briefId), shareLiveBrief(db(), w.briefId)]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as BriefActionRefusedError).reason).toBe('not_draft');
    expect(await phaseOf(w.briefId)).toBe('live');
  });

  it('concurrent ticks: one row per party and item; different approvers all durable', async () => {
    const w = await world();
    const shared = await item(w, { layer: 'shared', content: '[s09] one' });
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    await Promise.all(Array.from({ length: 8 }, () => tickBriefItem(db(), shared.id, w.p)));
    expect(await tickCount(shared.id)).toBe(1);
    await Promise.all([...Array.from({ length: 4 }, () => tickBriefItem(db(), shared.id, w.m)), tickBriefItem(db(), shared.id, w.p)]);
    expect(await listBriefTicks(db(), w.briefId)).toEqual([w.m, w.p].sort().map((partyId) => ({ briefItemId: shared.id, partyId })));
  });

  it('a tick racing a decline never leaves an orphan tick', async () => {
    for (let round = 0; round < 4; round += 1) {
      const w = await world();
      const request = await item(w, { layer: 'shared', subjectPartyId: w.m, shape: 'request', content: '[s09] r' });
      await presentAll(w);
      await shareLiveBrief(db(), w.briefId);
      const [tick, decline] = await Promise.allSettled([tickBriefItem(db(), request.id, w.p), declineBriefRequest(db(), request.id, w.m)]);
      expect(decline.status).toBe('fulfilled');
      expect(['fulfilled', 'rejected']).toContain(tick.status);
      expect(await listBriefItems(db(), w.briefId)).toEqual([]);
      expect(await tickCount(request.id)).toBe(0);
    }
  });

  it('a tick racing a settlement serializes: refused while pending, or accepted after', async () => {
    for (let round = 0; round < 4; round += 1) {
      const w = await world();
      const together = await item(w, { layer: 'shared', content: '[s09] date', pending: 'decide_together' });
      await presentAll(w);
      await shareLiveBrief(db(), w.briefId);
      const [tick, settle] = await Promise.allSettled([
        tickBriefItem(db(), together.id, w.p),
        settleDecideTogetherItem(db(), together.id, '[s09] the 20th'),
      ]);
      expect(settle.status).toBe('fulfilled');
      expect(await tickCount(together.id)).toBe(tick.status === 'fulfilled' ? 1 : 0);
      if (tick.status === 'rejected') {
        expect((tick.reason as { constraint?: string; cause?: { constraint?: string } }).cause?.constraint ?? (tick.reason as { constraint?: string }).constraint).toBe(
          'brief_tick_requires_settled',
        );
      }
    }
  });

  it('group-check racing ordinary ticks leaves no duplicates', async () => {
    const w = await world();
    const items = [];
    for (let i = 0; i < 5; i += 1) items.push(await item(w, { layer: 'shared', content: `[s09] ${i}` }));
    await presentAll(w);
    await shareLiveBrief(db(), w.briefId);
    const ids = items.map((i) => i.id);
    await Promise.all([
      groupCheckBriefItems(db(), w.briefId, w.p, ids),
      ...ids.map((id) => tickBriefItem(db(), id, w.p)),
      groupCheckBriefItems(db(), w.briefId, w.p, ids.slice(0, 3)),
    ]);
    expect(await listBriefTicks(db(), w.briefId)).toEqual([...ids].sort().map((briefItemId) => ({ briefItemId, partyId: w.p })));
  });

  it('a raw item insert in flight is waited for by a share, which then sees it', async () => {
    const w = await world();
    await presentAll(w);
    await runtime(async (c) => {
      await c.query('begin');
      await c.query(`insert into brief_item (brief_id, project_id, layer, item_key, position) values ($1, $2, 'universal', 'no_means_no', 1)`, [
        w.briefId,
        w.projectId,
      ]);
      const sharing = failure(() => shareLiveBrief(db(), w.briefId));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await c.query('commit');
      expect(await sharing).toEqual(violation('live_brief_share_requires_wording'));
    });
    expect(await phaseOf(w.briefId)).toBe('draft');
  });
});

describe('schema and noise', () => {
  const columns = (table: string) =>
    owner(
      async (c) =>
        (
          await c.query<{ c: string }>(
            `select column_name || ':' || data_type || ':' || is_nullable as c from information_schema.columns
              where table_schema = 'public' and table_name = $1 order by ordinal_position`,
            [table],
          )
        ).rows.map((r) => r.c),
    );

  it('brief_party_presence and brief_tick hold exactly their containment and current-state columns', async () => {
    expect(await columns('brief_party_presence')).toEqual(['brief_id:uuid:NO', 'project_id:uuid:NO', 'party_id:uuid:NO', 'on_site:boolean:NO']);
    expect(await columns('brief_tick')).toEqual(['brief_item_id:uuid:NO', 'project_id:uuid:NO', 'party_id:uuid:NO']);
  });

  it('carries exactly the expected keys; only a tick cascades, with its item', async () => {
    const rows = await owner(
      async (c) =>
        (
          await c.query<{ rel: string; name: string; type: string; ondelete: string }>(
            `select conrelid::regclass::text as rel, conname as name, contype as type, confdeltype as ondelete
               from pg_constraint where conrelid in ('public.brief_party_presence'::regclass, 'public.brief_tick'::regclass) order by 1, 2`,
          )
        ).rows,
    );
    expect(rows.map((r) => `${r.rel}.${r.name}:${r.type}:${r.ondelete}`)).toEqual([
      'brief_party_presence.brief_party_presence_in_brief_fk:f:a',
      'brief_party_presence.brief_party_presence_party_in_project_fk:f:a',
      'brief_party_presence.brief_party_presence_pk:p: ',
      'brief_tick.brief_tick_item_fk:f:c',
      'brief_tick.brief_tick_party_in_project_fk:f:a',
      'brief_tick.brief_tick_pk:p: ',
    ]);
    const cascades = await owner(
      async (c) =>
        (
          await c.query<{ name: string }>(
            `select conname as name from pg_constraint where connamespace = 'public'::regnamespace and contype = 'f' and confdeltype <> 'a'`,
          )
        ).rows.map((r) => r.name),
    );
    expect(cascades).toEqual(['brief_tick_item_fk']);
  });

  it('live tables name no timestamp, order, proposer, history, revision, decline, bulk or group flag', async () => {
    const hits = await owner(
      async (c) =>
        (
          await c.query<{ name: string }>(
            `select table_name || '.' || column_name as name from information_schema.columns
              where table_schema = 'public' and table_name in ('live_brief', 'brief_item', 'brief_party_presence', 'brief_tick')
                and column_name ~ '(time|_at$|date|seq|order|propos|author|actor|history|revision|version|declin|bulk|group|withdraw|status|green|ready|approver|role|reason)'`,
          )
        ).rows,
    );
    expect(hits).toEqual([]);
  });
});
