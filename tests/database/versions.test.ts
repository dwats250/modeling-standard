import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import type pg from 'pg';
import { operations } from '../../src/app/operation-list.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { addAgreementTerm, addUniversalTerm } from '../../src/projects/terms.ts';
import {
  findAgreementVersion,
  findUniversalVersion,
  listAgreementVersions,
  listUniversalVersions,
  presentAgreementVersion,
  presentUniversalVersion,
  TermNotInContainerError,
  type PresentedTerm,
} from '../../src/projects/versions.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S04 presented versions against real PostgreSQL, migrated by the production
 * migration path and used as the runtime role. Every property is checked for
 * both layers: pairwise versions (on an agreement) and universal versions
 * (on a project).
 */

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/** Words naming semantics S04 excludes from version rows. */
const EXCLUDED_SEMANTICS = [
  'author', 'owner', 'creator', 'propos', 'present_by', 'presented_by', 'sender', 'recipient', 'principal', 'person',
  'payer', 'payee', 'direction', 'obligat', 'role', 'requir', 'body', 'money',
  'status', 'state', 'final', 'accept', 'decline', 'withdraw', 'cancel', 'amend', 'supersed', 'replac',
  'current', 'latest', 'active', 'affirm', 'sign', 'witness', 'digest', 'hash', 'visib',
];

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

async function failureCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { code?: unknown; cause?: { code?: unknown } };
    const code = typeof e.code === 'string' ? e.code : e.cause?.code;
    return typeof code === 'string' ? code : 'unknown';
  }
}

/** Runs statements in one explicit transaction and returns the error code and constraint it failed with, if any. */
async function inTransaction(c: pg.Client, statements: [string, unknown[]][]): Promise<{ code: string; constraint?: string | undefined } | null> {
  try {
    await c.query('begin');
    for (const [text, params] of statements) await c.query(text, params);
    await c.query('commit');
    return null;
  } catch (error) {
    await c.query('rollback').catch(() => undefined);
    const e = error as { code?: string; constraint?: string };
    return { code: e.code ?? 'unknown', constraint: e.constraint };
  }
}

interface Layer {
  readonly name: string;
  readonly versionTable: string;
  readonly termTable: string;
  readonly containerColumn: string;
  readonly versionColumn: string;
  readonly sourceColumn: string;
  readonly sealedConstraint: string;
  readonly copyConstraint: string;
  /** A fresh container plus a second container under the same project. */
  fixture(): Promise<{ container: string; sibling: string }>;
  addTerm(container: string, content: string): Promise<{ id: string }>;
  present(container: string, termIds: readonly string[]): Promise<{ id: string; sequence: number; presentedAt: Date; terms: readonly PresentedTerm[] }>;
  find(id: string): Promise<{ terms: readonly PresentedTerm[]; sequence: number } | undefined>;
  list(container: string): Promise<{ id: string; sequence: number }[]>;
}

async function projectWithTwoAgreements(): Promise<{ projectId: string; agreements: [string, string]; otherProject: string }> {
  const created = await insertProject(database.db, { createdByPrincipalId: `s04-${randomUUID()}` });
  const parties = [];
  for (let i = 0; i < 4; i++) parties.push(await addProjectParty(database.db, created.id));
  const a = await createPairwiseAgreement(database.db, created.id, [parties[0]!.id, parties[1]!.id]);
  const b = await createPairwiseAgreement(database.db, created.id, [parties[2]!.id, parties[3]!.id]);
  const other = await insertProject(database.db, { createdByPrincipalId: `s04-${randomUUID()}` });
  return { projectId: created.id, agreements: [a.id, b.id], otherProject: other.id };
}

const layers: Layer[] = [
  {
    name: 'pairwise',
    versionTable: 'agreement_version',
    termTable: 'agreement_version_term',
    containerColumn: 'pairwise_agreement_id',
    versionColumn: 'agreement_version_id',
    sourceColumn: 'agreement_term_id',
    sealedConstraint: 'agreement_version_sealed',
    copyConstraint: 'agreement_version_term_faithful_copy',
    async fixture() {
      const f = await projectWithTwoAgreements();
      return { container: f.agreements[0], sibling: f.agreements[1] };
    },
    addTerm: (container, content) => addAgreementTerm(database.db, container, content),
    present: (container, ids) => presentAgreementVersion(database.db, container, ids),
    find: (id) => findAgreementVersion(database.db, id),
    list: (container) => listAgreementVersions(database.db, container),
  },
  {
    name: 'universal',
    versionTable: 'universal_version',
    termTable: 'universal_version_term',
    containerColumn: 'project_id',
    versionColumn: 'universal_version_id',
    sourceColumn: 'universal_term_id',
    sealedConstraint: 'universal_version_sealed',
    copyConstraint: 'universal_version_term_faithful_copy',
    async fixture() {
      const f = await projectWithTwoAgreements();
      return { container: f.projectId, sibling: f.otherProject };
    },
    addTerm: (container, content) => addUniversalTerm(database.db, container, content),
    present: (container, ids) => presentUniversalVersion(database.db, container, ids),
    find: (id) => findUniversalVersion(database.db, id),
    list: (container) => listUniversalVersions(database.db, container),
  },
];

describe.each(layers)('$name presented versions', (layer) => {
  async function withTerms(contents: string[]): Promise<{ container: string; sibling: string; termIds: string[] }> {
    const f = await layer.fixture();
    const termIds: string[] = [];
    for (const content of contents) termIds.push((await layer.addTerm(f.container, content)).id);
    return { ...f, termIds };
  }

  it('freeze the chosen terms, in the order given, as faithful copies', async () => {
    const f = await withTerms(['one', 'two', 'three']);
    const [one, two, three] = f.termIds as [string, string, string];
    const version = await layer.present(f.container, [three, one]);
    expect(version.sequence).toBe(1);
    expect(version.presentedAt).toBeInstanceOf(Date);
    expect(version.terms).toEqual([
      { id: expect.any(String), sourceTermId: three, position: 1, content: 'three' },
      { id: expect.any(String), sourceTermId: one, position: 2, content: 'one' },
    ]);
    expect(version.terms.map((t) => t.sourceTermId)).not.toContain(two);
    expect(await layer.find(version.id)).toEqual(version);
  });

  // For pairwise versions this is D02 drop-and-resend. For universal versions
  // it claims only that versions are independent: whether a safety term may
  // be left out of a later version is open (VISION:374, ruling 14).
  it('leave an earlier version untouched when a later one holds fewer terms', async () => {
    const f = await withTerms(['keep', 'drop']);
    const [keep, drop] = f.termIds as [string, string];
    const first = await layer.present(f.container, [keep, drop]);
    const resent = await layer.present(f.container, [keep]);
    expect(resent.sequence).toBe(2);
    expect(resent.terms.map((t) => t.content)).toEqual(['keep']);
    expect(await layer.find(first.id)).toEqual(first);
    expect(await layer.list(f.container)).toEqual([
      { id: first.id, sequence: 1 },
      { id: resent.id, sequence: 2 },
    ]);
  });

  it('are unaffected by terms written after presentation', async () => {
    const f = await withTerms(['original']);
    const version = await layer.present(f.container, f.termIds);
    await layer.addTerm(f.container, 'added later');
    expect(await layer.find(version.id)).toEqual(version);
  });

  it('reject a term of another container, or one that does not exist, and leave no version behind', async () => {
    const f = await withTerms(['mine']);
    const foreign = await layer.addTerm(f.sibling, 'not mine');
    await expect(layer.present(f.container, [f.termIds[0]!, foreign.id])).rejects.toBeInstanceOf(TermNotInContainerError);
    await expect(layer.present(f.container, [randomUUID()])).rejects.toBeInstanceOf(TermNotInContainerError);
    expect(await layer.list(f.container)).toEqual([]);
  });

  it('reject presenting the same term twice in one version, and an empty version', async () => {
    const f = await withTerms(['once']);
    expect(await failureCode(() => layer.present(f.container, [f.termIds[0]!, f.termIds[0]!]))).toBe(UNIQUE_VIOLATION);
    expect(await failureCode(() => layer.present(f.container, []))).toBe(CHECK_VIOLATION);
    expect(await layer.list(f.container)).toEqual([]);
  });

  it('give concurrent presentations distinct, contiguous sequence numbers', async () => {
    const f = await withTerms(['t']);
    const versions = await Promise.all(Array.from({ length: 8 }, () => layer.present(f.container, f.termIds)));
    expect(versions.map((v) => v.sequence).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  describe('are sealed by the database', () => {
    it('so no term can be added to a version after it is presented', async () => {
      const f = await withTerms(['presented', 'smuggled']);
      const version = await layer.present(f.container, [f.termIds[0]!]);
      await withClient(inject('runtimeUrl'), async (c) => {
        const failure = await inTransaction(c, [
          [
            `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
             values ($1, $2, $3, 2, 'smuggled')`,
            [f.container, version.id, f.termIds[1]],
          ],
        ]);
        expect(failure).toEqual({ code: CHECK_VIOLATION, constraint: layer.sealedConstraint });
      });
      expect(await layer.find(version.id)).toEqual(version);
    });

    it('so a version cannot commit with fewer terms than it declares', async () => {
      const f = await withTerms(['only']);
      const versionId = randomUUID();
      await withClient(inject('runtimeUrl'), async (c) => {
        const failure = await inTransaction(c, [
          [`insert into ${layer.versionTable} (id, ${layer.containerColumn}, sequence, term_count) values ($1, $2, 1, 2)`, [versionId, f.container]],
          [
            `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
             values ($1, $2, $3, 1, 'only')`,
            [f.container, versionId, f.termIds[0]],
          ],
        ]);
        expect(failure).toEqual({ code: CHECK_VIOLATION, constraint: layer.sealedConstraint });
      });
      expect(await layer.list(f.container)).toEqual([]);
    });

    it('so positions run exactly from 1 to the declared count', async () => {
      const f = await withTerms(['a', 'b']);
      await withClient(inject('runtimeUrl'), async (c) => {
        const versionId = randomUUID();
        const failure = await inTransaction(c, [
          [`insert into ${layer.versionTable} (id, ${layer.containerColumn}, sequence, term_count) values ($1, $2, 1, 2)`, [versionId, f.container]],
          [
            `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
             values ($1, $2, $3, 1, 'a'), ($1, $2, $4, 3, 'b')`,
            [f.container, versionId, f.termIds[0], f.termIds[1]],
          ],
        ]);
        expect(failure).toEqual({ code: CHECK_VIOLATION, constraint: layer.sealedConstraint });
      });
    });

    it('so a presented term must carry its source term\'s exact text', async () => {
      const f = await withTerms(['the real wording']);
      await withClient(inject('runtimeUrl'), async (c) => {
        const versionId = randomUUID();
        const failure = await inTransaction(c, [
          [`insert into ${layer.versionTable} (id, ${layer.containerColumn}, sequence, term_count) values ($1, $2, 1, 1)`, [versionId, f.container]],
          [
            `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
             values ($1, $2, $3, 1, 'different wording')`,
            [f.container, versionId, f.termIds[0]],
          ],
        ]);
        expect(failure).toEqual({ code: CHECK_VIOLATION, constraint: layer.copyConstraint });
      });
    });

    it('so a presented term cannot point at another container\'s version or term', async () => {
      const f = await withTerms(['mine']);
      const sibling = await layer.addTerm(f.sibling, 'theirs');
      const siblingVersion = await layer.present(f.sibling, [sibling.id]);
      await withClient(inject('runtimeUrl'), async (c) => {
        const versionId = randomUUID();
        // The source term belongs to the sibling container.
        const wrongSource = await inTransaction(c, [
          [`insert into ${layer.versionTable} (id, ${layer.containerColumn}, sequence, term_count) values ($1, $2, 1, 1)`, [versionId, f.container]],
          [
            `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
             values ($1, $2, $3, 1, 'theirs')`,
            [f.container, versionId, sibling.id],
          ],
        ]);
        // Rejected by the copy check before the composite foreign key, which
        // backs it up.
        expect(wrongSource).toEqual({ code: CHECK_VIOLATION, constraint: layer.copyConstraint });
        // The version belongs to the sibling container.
        const wrongVersion = await inTransaction(c, [
          [
            `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
             values ($1, $2, $3, 2, 'mine')`,
            [f.container, siblingVersion.id, f.termIds[0]],
          ],
        ]);
        expect(wrongVersion?.code).toBe(FOREIGN_KEY_VIOLATION);
      });
    });

    it('so a version row alone, with no terms, cannot commit', async () => {
      const f = await withTerms(['t']);
      await withClient(inject('runtimeUrl'), async (c) => {
        const failure = await inTransaction(c, [
          [`insert into ${layer.versionTable} (${layer.containerColumn}, sequence, term_count) values ($1, 1, 1)`, [f.container]],
        ]);
        expect(failure).toEqual({ code: CHECK_VIOLATION, constraint: layer.sealedConstraint });
      });
      expect(await layer.list(f.container)).toEqual([]);
    });

    it('so a term committed by another transaction mid-presentation cannot be copied with different text', async () => {
      const f = await layer.fixture();
      const sourceId = randomUUID();
      const versionId = randomUUID();
      const sourceTable = layer.name === 'pairwise' ? 'agreement_term' : 'universal_term';
      const sourceContainer = layer.name === 'pairwise' ? 'pairwise_agreement_id' : 'project_id';
      await withClient(inject('runtimeUrl'), async (writer) => {
        await withClient(inject('runtimeUrl'), async (presenter) => {
          // The writer's term is not yet visible to the presenter.
          await writer.query('begin');
          await writer.query(`insert into ${sourceTable} (id, ${sourceContainer}, position, content) values ($1, $2, 1, 'Payment: 500')`, [
            sourceId,
            f.container,
          ]);
          await presenter.query('begin');
          await presenter.query(
            `insert into ${layer.versionTable} (id, ${layer.containerColumn}, sequence, term_count) values ($1, $2, 1, 1)`,
            [versionId, f.container],
          );
          const forged = sqlErrorCode(
            presenter,
            `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
             values ($1, $2, $3, 1, 'Payment: 5')`,
            [f.container, versionId, sourceId],
          );
          await writer.query('commit');
          expect(await forged).toBe(CHECK_VIOLATION);
          await presenter.query('rollback');
        });
      });
      expect(await layer.list(f.container)).toEqual([]);
    });

    it('so a version must take its container\'s next sequence number: no gaps, no back-filling', async () => {
      const f = await withTerms(['t']);
      await layer.present(f.container, f.termIds);
      await layer.present(f.container, f.termIds);
      await withClient(inject('runtimeUrl'), async (c) => {
        for (const sequence of [1, 2, 4]) {
          const versionId = randomUUID();
          const failure = await inTransaction(c, [
            [`insert into ${layer.versionTable} (id, ${layer.containerColumn}, sequence, term_count) values ($1, $2, $3, 1)`, [versionId, f.container, sequence]],
          ]);
          expect({ sequence, failure }).toEqual({
            sequence,
            failure: { code: CHECK_VIOLATION, constraint: `${layer.versionTable}_sequence_next` },
          });
        }
      });
      expect((await layer.list(f.container)).map((v) => v.sequence)).toEqual([1, 2]);
    });

    it('so presentation time is the clock time the row is written, even inside a long transaction', async () => {
      const f = await withTerms(['t']);
      const versionId = randomUUID();
      await withClient(inject('runtimeUrl'), async (c) => {
        await c.query('begin');
        const started = await c.query<{ t: Date }>('select now() as t');
        await c.query('select pg_sleep(1.2)');
        await c.query(
          `insert into ${layer.versionTable} (id, ${layer.containerColumn}, sequence, term_count, presented_at)
           values ($1, $2, 1, 1, $3)`,
          [versionId, f.container, started.rows[0]!.t],
        );
        await c.query(
          `insert into ${layer.termTable} (${layer.containerColumn}, ${layer.versionColumn}, ${layer.sourceColumn}, position, content)
           values ($1, $2, $3, 1, 't')`,
          [f.container, versionId, f.termIds[0]],
        );
        await c.query('commit');
        const stored = await c.query<{ lag: number }>(
          `select extract(epoch from (presented_at - $2::timestamptz))::float8 as lag from ${layer.versionTable} where id = $1`,
          [versionId, started.rows[0]!.t],
        );
        expect(stored.rows[0]!.lag).toBeGreaterThanOrEqual(1.1);
      });
    });

    it('so the runtime role cannot update, delete or truncate a version or its terms', async () => {
      await withClient(inject('runtimeUrl'), async (c) => {
        for (const table of [layer.versionTable, layer.termTable]) {
          const column = table === layer.versionTable ? 'sequence' : 'content';
          expect(await sqlErrorCode(c, `update ${table} set ${column} = ${column}`)).toBe(INSUFFICIENT_PRIVILEGE);
          expect(await sqlErrorCode(c, `delete from ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
          expect(await sqlErrorCode(c, `truncate ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
        }
      });
    });
  });

  it('name no excluded semantic in columns or constraints', async () => {
    const names = await withClient(inject('runtimeUrl'), async (c) => {
      const res = await c.query<{ name: string }>(
        `select column_name as name from information_schema.columns
         where table_schema = 'public' and table_name = any($1)
         union all
         select conname from pg_constraint where conrelid = any($2::regclass[])`,
        [[layer.versionTable, layer.termTable], [`public.${layer.versionTable}`, `public.${layer.termTable}`]],
      );
      return res.rows.map((r) => r.name);
    });
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => EXCLUDED_SEMANTICS.some((word) => name.includes(word)))).toEqual([]);
  });

  it('hold exactly the expected columns', async () => {
    const columns = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and table_name = any($1) order by table_name, ordinal_position`,
        [[layer.versionTable, layer.termTable]],
      ),
    );
    const of = (t: string) => columns.rows.filter((r) => r.table_name === t).map((r) => r.column_name);
    expect(of(layer.versionTable)).toEqual(['id', layer.containerColumn, 'sequence', 'term_count', 'presented_at']);
    expect(of(layer.termTable)).toEqual(['id', layer.containerColumn, layer.versionColumn, layer.sourceColumn, 'position', 'content']);
  });
});

describe('presented versions', () => {
  it('are not reachable over HTTP', () => {
    expect(operations.filter((op) => /version|present/i.test(`${op.name} ${op.path}`))).toEqual([]);
  });

  it('use trigger functions that the runtime role cannot call and that cannot be shadowed by temporary objects', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'select agreement_version_stamp()')).toBe(INSUFFICIENT_PRIVILEGE);
      const functions = await c.query<{ name: string; config: string[] | null; callable: boolean }>(
        `select p.proname as name, p.proconfig as config, has_function_privilege(current_user, p.oid, 'EXECUTE') as callable
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prorettype = 'trigger'::regtype order by 1`,
      );
      // Every trigger function in the schema, including later slices', is
      // pinned by name and held to the same rule.
      expect(functions.rows.map((r) => r.name)).toEqual([
        'agreement_affirmation_stamp',
        'agreement_version_check_sealed',
        'agreement_version_stamp',
        'agreement_version_term_check_copy',
        'universal_affirmation_stamp',
        'universal_version_check_sealed',
        'universal_version_stamp',
        'universal_version_term_check_copy',
      ]);
      for (const f of functions.rows) {
        expect({ name: f.name, config: f.config, callable: f.callable }).toEqual({
          name: f.name,
          config: ['search_path=pg_catalog, public, pg_temp'],
          callable: false,
        });
      }
    });
  });
});
