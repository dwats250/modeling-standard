import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { operations } from '../../src/app/operation-list.ts';
import {
  addBriefItem,
  BriefItemNotFoundError,
  BriefNotFoundError,
  listBriefItems,
  listBriefItemsVisibleTo,
  openLiveBrief,
  removeDraftBriefItem,
  updateDraftBriefItem,
  type BriefItemSpec,
} from '../../src/briefs/brief.ts';
import { briefItem, liveBrief } from '../../src/briefs/tables.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S08 draft live brief against real PostgreSQL, migrated by the production
 * migration path and used as the runtime role.
 *
 * Draft composition only: one mutable brief per project; items with a layer,
 * optional pair scope, optional subject and shape, optional item key, exact
 * current wording and value, a pending state and a position. No phase, no
 * ticks, no requiredness, no post-share rule. Every draft item can be edited
 * and removed.
 */

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/** Names that would mean history, evidence or later-slice semantics on live state. */
const EXCLUDED_COLUMN_WORDS = ['time', '_at', 'author', 'propos', 'status', 'version', 'revision', 'history', 'declin', 'sign', 'tick', 'requir', 'phase'];

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

interface World {
  projectId: string;
  briefId: string;
  a: string;
  b: string;
  c: string;
  /** Pair A–C. */
  ac: string;
  /** Pair B–C. */
  bc: string;
}

/** A project with parties A, B and C, pairs A–C and B–C, and an open brief. */
async function world(): Promise<World> {
  const project = await insertProject(database.db, { createdByPrincipalId: `s08-creator-${randomUUID()}` });
  const [a, b, c] = [
    (await addProjectParty(database.db, project.id)).id,
    (await addProjectParty(database.db, project.id)).id,
    (await addProjectParty(database.db, project.id)).id,
  ];
  const ac = (await createPairwiseAgreement(database.db, project.id, [a, c])).id;
  const bc = (await createPairwiseAgreement(database.db, project.id, [b, c])).id;
  const brief = await openLiveBrief(database.db, project.id);
  return { projectId: project.id, briefId: brief.id, a, b, c, ac, bc };
}

/** The SQLSTATE and constraint a call failed with, or null. */
async function failure(fn: () => Promise<unknown>): Promise<{ code: string; constraint?: string } | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    const code = e.code ?? e.cause?.code ?? 'unknown';
    const constraint = e.constraint ?? e.cause?.constraint;
    return constraint ? { code, constraint } : { code };
  }
}

const shared = (content: string): BriefItemSpec => ({ layer: 'shared', content });

describe('the live brief', () => {
  it('is opened for a project, and re-opening returns the same brief', async () => {
    const project = await insertProject(database.db, { createdByPrincipalId: `s08-${randomUUID()}` });
    const first = await openLiveBrief(database.db, project.id);
    expect(first).toEqual({ id: expect.any(String), projectId: project.id });
    expect(await openLiveBrief(database.db, project.id)).toEqual(first);
  });

  it('is created exactly once when opened concurrently', async () => {
    const project = await insertProject(database.db, { createdByPrincipalId: `s08-${randomUUID()}` });
    const opened = await Promise.all(Array.from({ length: 12 }, () => openLiveBrief(database.db, project.id)));
    expect(new Set(opened.map((b) => b.id)).size).toBe(1);
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ n: number }>('select count(*)::int as n from live_brief where project_id = $1', [project.id]),
    );
    expect(rows.rows[0]!.n).toBe(1);
  });

  it('cannot be opened for an unknown project, and a second raw row for a project is refused', async () => {
    expect(await failure(() => openLiveBrief(database.db, randomUUID()))).toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    const project = await insertProject(database.db, { createdByPrincipalId: `s08-${randomUUID()}` });
    await openLiveBrief(database.db, project.id);
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'insert into live_brief (project_id) values ($1)', [project.id])).toBe(UNIQUE_VIOLATION);
    });
  });
});

describe('adding brief items', () => {
  it('stores the exact wording and value, takes the project from the brief, and appends positions', async () => {
    const w = await world();
    const one = await addBriefItem(database.db, w.briefId, shared('[synthetic] Call time 9:00, meet in the lobby.'));
    const two = await addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.ac, itemKey: 'fee', value: '[synthetic] 200' });
    expect(one).toEqual({
      id: expect.any(String),
      briefId: w.briefId,
      projectId: w.projectId,
      layer: 'shared',
      pairwiseAgreementId: null,
      subjectPartyId: null,
      shape: null,
      itemKey: null,
      content: '[synthetic] Call time 9:00, meet in the lobby.',
      value: null,
      pending: null,
      position: 1,
    });
    expect(two).toMatchObject({ layer: 'money', pairwiseAgreementId: w.ac, itemKey: 'fee', value: '[synthetic] 200', content: null, position: 2 });
    expect((await listBriefItems(database.db, w.briefId)).map((i) => i.id)).toEqual([one.id, two.id]);
  });

  it('refuses an unknown brief', async () => {
    await expect(addBriefItem(database.db, randomUUID(), shared('x'))).rejects.toBeInstanceOf(BriefNotFoundError);
  });

  it('accepts every decided shape of item', async () => {
    const w = await world();
    const accepted: BriefItemSpec[] = [
      // A universal item may have a subject (a personal safety declaration).
      { layer: 'universal', subjectPartyId: w.a, shape: 'declaration', content: '[synthetic] A personal boundary.' },
      // A universal drafter item needs no key.
      { layer: 'universal', content: '[synthetic] A shared safety term.' },
      // A universal request.
      { layer: 'universal', subjectPartyId: w.b, shape: 'request', content: '[synthetic] A safety request.' },
      // A keyed item may wait without materialized wording.
      { layer: 'universal', itemKey: 'no_means_no' },
      // A keyed item may carry wording.
      { layer: 'shared', itemKey: 'coverage_level', subjectPartyId: w.a, shape: 'declaration', content: '[synthetic] Coverage.', value: '[synthetic] level' },
      // A pair-scoped shared request with a subject in the pair.
      { layer: 'shared', pairwiseAgreementId: w.ac, subjectPartyId: w.c, shape: 'request', content: '[synthetic] Deliverables.' },
      // An open parameter awaiting its subject, and one set by them.
      { layer: 'shared', subjectPartyId: w.a, shape: 'open_parameter', pending: 'subject', content: '[synthetic] Your level?' },
      { layer: 'shared', subjectPartyId: w.b, shape: 'open_parameter', content: '[synthetic] Your level?', value: '[synthetic] set' },
      // A decide-together item.
      { layer: 'shared', pending: 'decide_together', content: '[synthetic] Location.' },
      // A fee per pair.
      { layer: 'money', pairwiseAgreementId: w.ac, itemKey: 'fee', pending: 'decide_together' },
      { layer: 'money', pairwiseAgreementId: w.bc, itemKey: 'fee', value: '[synthetic] 150' },
    ];
    for (const spec of accepted) {
      expect({ spec, failed: await failure(() => addBriefItem(database.db, w.briefId, spec)) }).toEqual({ spec, failed: null });
    }
    // Two different subjects may each have a coverage level: only the fee is unique by key.
    expect(
      await failure(() =>
        addBriefItem(database.db, w.briefId, { layer: 'shared', itemKey: 'coverage_level', subjectPartyId: w.b, shape: 'declaration', value: 'x' }),
      ),
    ).toBeNull();
    expect(await listBriefItems(database.db, w.briefId)).toHaveLength(accepted.length + 1);
  });

  it('refuses each undecided or contradictory combination, by its named constraint', async () => {
    const w = await world();
    const refused: [string, BriefItemSpec][] = [
      ['brief_item_money_is_pair_scoped', { layer: 'money', itemKey: 'fee', value: '1' }],
      ['brief_item_money_is_fee', { layer: 'money', pairwiseAgreementId: w.ac, content: '[synthetic] a private craft term' }],
      ['brief_item_fee_is_money', { layer: 'shared', itemKey: 'fee', value: '1' }],
      ['brief_item_universal_is_project_wide', { layer: 'universal', pairwiseAgreementId: w.ac, content: 'x' }],
      ['brief_item_no_means_no_is_universal', { layer: 'shared', itemKey: 'no_means_no' }],
      ['brief_item_shape_iff_subject', { layer: 'shared', shape: 'declaration', content: 'x' }],
      ['brief_item_shape_iff_subject', { layer: 'shared', subjectPartyId: w.a, content: 'x' }],
      ['brief_item_drafter_item_has_wording', { layer: 'shared' }],
      ['brief_item_decide_together_has_no_value', { layer: 'shared', pending: 'decide_together', content: 'x', value: 'y' }],
      ['brief_item_subject_pending_is_open_parameter', { layer: 'shared', subjectPartyId: w.a, shape: 'declaration', pending: 'subject', content: 'x' }],
      ['brief_item_open_parameter_state', { layer: 'shared', subjectPartyId: w.a, shape: 'open_parameter', content: 'x' }],
      ['brief_item_open_parameter_state', { layer: 'shared', subjectPartyId: w.a, shape: 'open_parameter', pending: 'subject', content: 'x', value: 'y' }],
      ['brief_item_open_parameter_state', { layer: 'shared', subjectPartyId: w.a, shape: 'open_parameter', pending: 'decide_together', content: 'x' }],
      ['brief_item_content_nonblank', { layer: 'shared', content: ' \t\n' }],
      ['brief_item_value_nonblank', { layer: 'shared', content: 'x', value: '' }],
      ['brief_item_layer_known', { layer: 'private' as never, content: 'x' }],
      ['brief_item_shape_known', { layer: 'shared', subjectPartyId: w.a, shape: 'counter' as never, content: 'x' }],
      ['brief_item_item_key_known', { layer: 'shared', itemKey: 'body' as never }],
      ['brief_item_pending_known', { layer: 'shared', pending: 'declined' as never, content: 'x' }],
    ];
    for (const [constraint, spec] of refused) {
      expect({ constraint, result: await failure(() => addBriefItem(database.db, w.briefId, spec)) }).toEqual({
        constraint,
        result: { code: CHECK_VIOLATION, constraint },
      });
    }
    expect(await listBriefItems(database.db, w.briefId)).toEqual([]);
  });

  it('allows one fee per pair, and refuses a position below 1 in raw SQL', async () => {
    const w = await world();
    await addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.ac, itemKey: 'fee', value: '1' });
    expect(await failure(() => addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.ac, itemKey: 'fee', value: '2' }))).toEqual({
      code: UNIQUE_VIOLATION,
      constraint: 'brief_item_one_fee_per_pair',
    });
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(
        await sqlErrorCode(c, `insert into brief_item (brief_id, project_id, layer, content, position) values ($1, $2, 'shared', 'x', 0)`, [w.briefId, w.projectId]),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it('refuses two concurrent fees for one pair, leaving one', async () => {
    const w = await world();
    const outcomes = await Promise.allSettled([
      addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.bc, itemKey: 'fee', value: '1' }),
      addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.bc, itemKey: 'fee', value: '2' }),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect((await listBriefItems(database.db, w.briefId)).filter((i) => i.itemKey === 'fee')).toHaveLength(1);
  });
});

describe('containment', () => {
  it('refuses a pair or subject from another project, and a pair-scoped subject outside the pair', async () => {
    const w = await world();
    const other = await world();
    expect(await failure(() => addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: other.ac, itemKey: 'fee', value: '1' }))).toEqual({
      code: FOREIGN_KEY_VIOLATION,
      constraint: 'brief_item_pair_in_project_fk',
    });
    expect(
      await failure(() => addBriefItem(database.db, w.briefId, { layer: 'shared', subjectPartyId: other.a, shape: 'declaration', content: 'x' })),
    ).toEqual({ code: FOREIGN_KEY_VIOLATION, constraint: 'brief_item_subject_in_project_fk' });
    // B is in the project but not in pair A–C.
    expect(
      await failure(() => addBriefItem(database.db, w.briefId, { layer: 'shared', pairwiseAgreementId: w.ac, subjectPartyId: w.b, shape: 'request', content: 'x' })),
    ).toEqual({ code: CHECK_VIOLATION, constraint: 'brief_item_subject_in_pair' });
  });

  it('is enforced by the database for raw SQL too, including a brief from another project', async () => {
    const w = await world();
    const other = await world();
    await withClient(inject('runtimeUrl'), async (c) => {
      const insert = (cols: string, vals: unknown[]) =>
        c.query(`insert into brief_item (brief_id, project_id, layer, position, ${cols}) values ($1, $2, $3, 1, ${vals.slice(1).map((_, i) => `$${i + 4}`).join(', ')})`, [
          w.briefId,
          w.projectId,
          ...vals,
        ]).then(
          () => null,
          (e: { code?: string; constraint?: string }) => ({ code: e.code, constraint: e.constraint }),
        );
      expect(
        await c
          .query(`insert into brief_item (brief_id, project_id, layer, position, content) values ($1, $2, 'shared', 1, 'x')`, [other.briefId, w.projectId])
          .then(
            () => null,
            (e: { code?: string; constraint?: string }) => ({ code: e.code, constraint: e.constraint }),
          ),
      ).toEqual({ code: FOREIGN_KEY_VIOLATION, constraint: 'brief_item_in_brief_fk' });
      expect(await insert('pairwise_agreement_id, item_key, value', ['money', other.ac, 'fee', '1'])).toEqual({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'brief_item_pair_in_project_fk',
      });
      expect(await insert('pairwise_agreement_id, subject_party_id, shape, content', ['shared', w.ac, w.b, 'request', 'x'])).toEqual({
        code: CHECK_VIOLATION,
        constraint: 'brief_item_subject_in_pair',
      });
    });
  });
});

describe('editing and removing draft items', () => {
  it('changes wording, value and pending state, and keeps everything else', async () => {
    const w = await world();
    const item = await addBriefItem(database.db, w.briefId, { layer: 'shared', pending: 'decide_together', content: '[synthetic] Location.' });
    const settled = await updateDraftBriefItem(database.db, item.id, { pending: null, value: '[synthetic] Studio B' });
    expect(settled).toEqual({ ...item, pending: null, value: '[synthetic] Studio B' });
    const reworded = await updateDraftBriefItem(database.db, item.id, { content: '[synthetic] Exact location.' });
    expect(reworded).toEqual({ ...settled, content: '[synthetic] Exact location.' });
    expect(await updateDraftBriefItem(database.db, item.id, {})).toEqual(reworded);
    expect(await failure(() => updateDraftBriefItem(database.db, item.id, { value: null, pending: 'subject' }))).toEqual({
      code: CHECK_VIOLATION,
      constraint: 'brief_item_subject_pending_is_open_parameter',
    });
    await expect(updateDraftBriefItem(database.db, randomUUID(), { content: 'x' })).rejects.toBeInstanceOf(BriefItemNotFoundError);
  });

  it('cannot change identity, layer, scope, subject, shape or key through the runtime role', async () => {
    const w = await world();
    const item = await addBriefItem(database.db, w.briefId, { layer: 'shared', subjectPartyId: w.a, shape: 'declaration', content: 'x' });
    await withClient(inject('runtimeUrl'), async (c) => {
      for (const column of ['id', 'brief_id', 'project_id', 'layer', 'pairwise_agreement_id', 'subject_party_id', 'shape', 'item_key']) {
        expect({ column, code: await sqlErrorCode(c, `update brief_item set ${column} = ${column} where id = $1`, [item.id]) }).toEqual({
          column,
          code: INSUFFICIENT_PRIVILEGE,
        });
      }
      for (const column of ['content', 'value', 'pending', 'position']) {
        expect({ column, code: await sqlErrorCode(c, `update brief_item set ${column} = ${column} where id = $1`, [item.id]) }).toEqual({
          column,
          code: null,
        });
      }
    });
  });

  it('removes any draft item, including universal, keyed and money ones', async () => {
    const w = await world();
    const items = [
      await addBriefItem(database.db, w.briefId, { layer: 'universal', content: '[synthetic] A safety term.' }),
      await addBriefItem(database.db, w.briefId, { layer: 'universal', itemKey: 'no_means_no' }),
      await addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.ac, itemKey: 'fee', value: '1' }),
      await addBriefItem(database.db, w.briefId, shared('[synthetic] A shared term.')),
    ];
    for (const item of items) await removeDraftBriefItem(database.db, item.id);
    expect(await listBriefItems(database.db, w.briefId)).toEqual([]);
    await expect(removeDraftBriefItem(database.db, items[0]!.id)).rejects.toBeInstanceOf(BriefItemNotFoundError);
  });
});

describe('visibility (D10)', () => {
  it('shows universal and shared items to every party, and each fee only to its pair', async () => {
    const w = await world();
    const universal = await addBriefItem(database.db, w.briefId, { layer: 'universal', content: '[synthetic] Safety.' });
    const pairShared = await addBriefItem(database.db, w.briefId, { layer: 'shared', pairwiseAgreementId: w.bc, content: '[synthetic] B–C deliverables.' });
    const projectShared = await addBriefItem(database.db, w.briefId, shared('[synthetic] Call times.'));
    const feeAC = await addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.ac, itemKey: 'fee', value: '1' });
    const feeBC = await addBriefItem(database.db, w.briefId, { layer: 'money', pairwiseAgreementId: w.bc, itemKey: 'fee', value: '2' });
    const ids = async (party: string) => (await listBriefItemsVisibleTo(database.db, w.briefId, party)).map((i) => i.id);
    expect(await ids(w.a)).toEqual([universal.id, pairShared.id, projectShared.id, feeAC.id]);
    expect(await ids(w.b)).toEqual([universal.id, pairShared.id, projectShared.id, feeBC.id]);
    expect(await ids(w.c)).toEqual([universal.id, pairShared.id, projectShared.id, feeAC.id, feeBC.id]);
    const outsider = await world();
    expect(await ids(outsider.a)).toEqual([]);
    expect(await listBriefItemsVisibleTo(database.db, randomUUID(), w.a)).toEqual([]);
  });
});

describe('positions under concurrency', () => {
  it('gives twelve concurrent additions positions 1 to 12, ordered by position then id', async () => {
    const w = await world();
    await Promise.all(Array.from({ length: 12 }, (_, i) => addBriefItem(database.db, w.briefId, shared(`[synthetic] ${i}`))));
    const items = await listBriefItems(database.db, w.briefId);
    expect(items.map((i) => i.position)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
});

describe('what the S08 tables hold', () => {
  const columnsOf = async (table: string) =>
    (
      await withClient(inject('runtimeUrl'), (c) =>
        c.query<{ column_name: string; data_type: string; is_nullable: string }>(
          `select column_name, data_type, is_nullable from information_schema.columns
           where table_schema = 'public' and table_name = $1 order by ordinal_position`,
          [table],
        ),
      )
    ).rows;

  it('live_brief holds only an id and its project', async () => {
    expect(await columnsOf('live_brief')).toEqual([
      { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'project_id', data_type: 'uuid', is_nullable: 'NO' },
    ]);
  });

  it('brief_item holds exactly the twelve S08 columns', async () => {
    expect((await columnsOf('brief_item')).map((c) => `${c.column_name}:${c.data_type}:${c.is_nullable}`)).toEqual([
      'id:uuid:NO',
      'brief_id:uuid:NO',
      'project_id:uuid:NO',
      'layer:text:NO',
      'pairwise_agreement_id:uuid:YES',
      'subject_party_id:uuid:YES',
      'shape:text:YES',
      'item_key:text:YES',
      'content:text:YES',
      'value:text:YES',
      'pending:text:YES',
      'position:integer:NO',
    ]);
  });

  it('carries exactly the expected constraints and indexes, with no cascading foreign key', async () => {
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ rel: string; name: string; type: string; ondelete: string }>(
        `select conrelid::regclass::text as rel, conname as name, contype as type, confdeltype as ondelete
         from pg_constraint where conrelid in ('public.live_brief'::regclass, 'public.brief_item'::regclass) order by 1, 2`,
      ),
    );
    expect(rows.rows.map((r) => `${r.rel}.${r.name}:${r.type}`)).toEqual([
      'brief_item.brief_item_content_nonblank:c',
      'brief_item.brief_item_decide_together_has_no_value:c',
      'brief_item.brief_item_drafter_item_has_wording:c',
      'brief_item.brief_item_fee_is_money:c',
      'brief_item.brief_item_in_brief_fk:f',
      'brief_item.brief_item_item_key_known:c',
      'brief_item.brief_item_layer_known:c',
      'brief_item.brief_item_money_is_fee:c',
      'brief_item.brief_item_money_is_pair_scoped:c',
      'brief_item.brief_item_no_means_no_is_universal:c',
      'brief_item.brief_item_open_parameter_state:c',
      'brief_item.brief_item_pair_in_project_fk:f',
      'brief_item.brief_item_pending_known:c',
      'brief_item.brief_item_pkey:p',
      'brief_item.brief_item_position_positive:c',
      'brief_item.brief_item_shape_iff_subject:c',
      'brief_item.brief_item_shape_known:c',
      'brief_item.brief_item_subject_in_project_fk:f',
      'brief_item.brief_item_subject_pending_is_open_parameter:c',
      'brief_item.brief_item_universal_is_project_wide:c',
      'brief_item.brief_item_value_nonblank:c',
      'live_brief.live_brief_id_project_unique:u',
      'live_brief.live_brief_one_per_project:u',
      'live_brief.live_brief_pkey:p',
      'live_brief.live_brief_project_id_project_id_fk:f',
    ]);
    for (const fk of rows.rows.filter((r) => r.type === 'f')) expect({ fk: fk.name, ondelete: fk.ondelete }).toEqual({ fk: fk.name, ondelete: 'a' });
    const indexes = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ def: string }>(
        `select indexdef as def from pg_indexes where schemaname = 'public' and tablename = 'brief_item' and indexname = 'brief_item_one_fee_per_pair'`,
      ),
    );
    expect(indexes.rows.map((r) => r.def)).toEqual([
      expect.stringMatching(/UNIQUE INDEX brief_item_one_fee_per_pair .*\(pairwise_agreement_id\) WHERE \(item_key = 'fee'::text\)/),
    ]);
  });

  it('names no timestamp, author, proposer, status, history, revision, decline, signature, tick, requiredness or phase', async () => {
    const names = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ name: string }>(
        `select column_name as name from information_schema.columns where table_schema = 'public' and table_name in ('live_brief', 'brief_item')`,
      ),
    );
    const definitionNames = [...Object.keys(getTableColumns(liveBrief)), ...Object.keys(getTableColumns(briefItem))].map((n) => n.toLowerCase());
    expect([...names.rows.map((r) => r.name), ...definitionNames].filter((n) => EXCLUDED_COLUMN_WORDS.some((w) => n.includes(w)))).toEqual([]);
  });
});

describe('boundaries', () => {
  it('adds no HTTP operation', () => {
    expect(operations.filter((op) => /brief|item|term|layer/i.test(`${op.name} ${op.path}`))).toEqual([]);
  });

  it('has no logging, principal, network or provider code in src/briefs', () => {
    const dir = join(import.meta.dirname, '../../src/briefs');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '');
      expect({ file, hit: /\bconsole\.|logger|pino|fetch\(|principal|Principal/.test(source) }).toEqual({ file, hit: false });
    }
  });

  it('leaves no source or test referencing the retired S03–S05 model', () => {
    const root = join(import.meta.dirname, '../..');
    const retired = /universal_term|agreement_version|_affirmation\b|universalAffirmation|agreementAffirmation|projects\/terms|projects\/versions|projects\/affirmations/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|js|html)$/.test(entry.name) && retired.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(root.length + 1));
      }
    };
    walk(join(root, 'src'));
    walk(join(root, 'tests'));
    // Only historical-migration guards may name them: the upgrade tests write
    // and inspect S03–S05 rows at historical boundaries, the identifier guard
    // lists the over-long name shipped in 0009 (fixed by 0014) and its test
    // checks it is gone, and this test names them.
    expect(offenders.sort()).toEqual([
      'src/infrastructure/database/identifier-length.ts',
      'tests/database/briefs.test.ts',
      'tests/database/identifiers.test.ts',
      'tests/database/migration-upgrades.test.ts',
    ]);
  });
});

describe('runtime role on the S08 tables', () => {
  it('cannot truncate either table, delete a live brief, or update a live brief', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'truncate live_brief')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate brief_item')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from live_brief')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update live_brief set id = id')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'select brief_item_check_scope()')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});
