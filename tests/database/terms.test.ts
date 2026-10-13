import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { operations } from '../../src/app/operation-list.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { addAgreementTerm, addUniversalTerm, listAgreementTerms, listUniversalTerms } from '../../src/projects/terms.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S03 term units against real PostgreSQL, migrated by the production
 * migration path and used as the runtime role.
 */

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/**
 * Words naming semantics S03 excludes: requiredness and classification,
 * actors and direction, lifecycle and evidence, visibility, composition
 * buckets and templates.
 */
const EXCLUDED_SEMANTICS = [
  'requir', 'optional', 'mandatory', 'body', 'money', 'kind', 'type', 'class', 'categor', 'catalog',
  'author', 'owner', 'creator', 'propos', 'sender', 'recipient', 'principal', 'person', 'identity',
  'payer', 'payee', 'direction', 'obligat', 'role',
  'status', 'state', 'final', 'accept', 'decline', 'version', 'present', 'affirm', 'sign', 'witness',
  'visib', 'bucket', 'open', 'unfinished', 'template', 'draft',
];

const TABLES = ['universal_term', 'agreement_term'] as const;

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

async function agreementFixture(): Promise<{ projectId: string; agreementId: string }> {
  const created = await insertProject(database.db, { createdByPrincipalId: `s03-${randomUUID()}` });
  const a = await addProjectParty(database.db, created.id);
  const b = await addProjectParty(database.db, created.id);
  const agreement = await createPairwiseAgreement(database.db, created.id, [a.id, b.id]);
  return { projectId: created.id, agreementId: agreement.id };
}

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

async function columnsOf(table: string): Promise<{ name: string; hasDefault: boolean }[]> {
  const res = await withClient(inject('runtimeUrl'), (c) =>
    c.query<{ name: string; has_default: boolean }>(
      `select column_name as name, column_default is not null as has_default from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table],
    ),
  );
  return res.rows.map((r) => ({ name: r.name, hasDefault: r.has_default }));
}

describe('universal terms', () => {
  it('are added to a project as separate rows and read back in position order', async () => {
    const f = await agreementFixture();
    const first = await addUniversalTerm(database.db, f.projectId, 'First universal term');
    const second = await addUniversalTerm(database.db, f.projectId, 'Second universal term');
    expect(first).toEqual({ id: expect.any(String), projectId: f.projectId, position: 1, content: 'First universal term' });
    expect(second.position).toBe(2);
    expect(await listUniversalTerms(database.db, f.projectId)).toEqual([first, second]);
  });

  it('belong only to their own project', async () => {
    const f = await agreementFixture();
    const other = await agreementFixture();
    await addUniversalTerm(database.db, f.projectId, 'Mine');
    expect(await listUniversalTerms(database.db, other.projectId)).toEqual([]);
    expect((await addUniversalTerm(database.db, other.projectId, 'Theirs')).position).toBe(1);
  });
});

describe('pairwise terms', () => {
  it('are added to an agreement as separate rows and read back in position order', async () => {
    const f = await agreementFixture();
    const first = await addAgreementTerm(database.db, f.agreementId, 'First pairwise term');
    const second = await addAgreementTerm(database.db, f.agreementId, 'Second pairwise term');
    expect(first).toEqual({
      id: expect.any(String),
      pairwiseAgreementId: f.agreementId,
      position: 1,
      content: 'First pairwise term',
    });
    expect(second.position).toBe(2);
    expect(await listAgreementTerms(database.db, f.agreementId)).toEqual([first, second]);
  });

  it('belong only to their own agreement, even under the same project', async () => {
    const f = await agreementFixture();
    const c = await addProjectParty(database.db, f.projectId);
    const d = await addProjectParty(database.db, f.projectId);
    const otherPair = await createPairwiseAgreement(database.db, f.projectId, [c.id, d.id]);
    await addAgreementTerm(database.db, f.agreementId, 'A');
    expect(await listAgreementTerms(database.db, otherPair.id)).toEqual([]);
    expect(await listUniversalTerms(database.db, f.projectId)).toEqual([]);
  });
});

describe('ordering', () => {
  it('lists by position, not by insertion order', async () => {
    const f = await agreementFixture();
    await withClient(inject('runtimeUrl'), async (c) => {
      for (const position of [3, 1, 2]) {
        await c.query('insert into universal_term (project_id, position, content) values ($1, $2, $3)', [
          f.projectId,
          position,
          `u${position}`,
        ]);
        await c.query('insert into agreement_term (pairwise_agreement_id, position, content) values ($1, $2, $3)', [
          f.agreementId,
          position,
          `a${position}`,
        ]);
      }
    });
    expect((await listUniversalTerms(database.db, f.projectId)).map((t) => t.content)).toEqual(['u1', 'u2', 'u3']);
    expect((await listAgreementTerms(database.db, f.agreementId)).map((t) => t.content)).toEqual(['a1', 'a2', 'a3']);
  });

  it('gives concurrent additions to one container distinct, contiguous positions', async () => {
    const f = await agreementFixture();
    const n = 12;
    const universal = await Promise.all(
      Array.from({ length: n }, (_, i) => addUniversalTerm(database.db, f.projectId, `u${i}`)),
    );
    const pairwise = await Promise.all(
      Array.from({ length: n }, (_, i) => addAgreementTerm(database.db, f.agreementId, `a${i}`)),
    );
    const expected = Array.from({ length: n }, (_, i) => i + 1);
    expect(universal.map((t) => t.position).sort((a, b) => a - b)).toEqual(expected);
    expect(pairwise.map((t) => t.position).sort((a, b) => a - b)).toEqual(expected);
  });
});

describe('the database rejects', () => {
  it('empty or blank text', async () => {
    const f = await agreementFixture();
    for (const content of ['', ' ', '  \t ']) {
      expect(await failureCode(() => addUniversalTerm(database.db, f.projectId, content))).toBe(CHECK_VIOLATION);
      expect(await failureCode(() => addAgreementTerm(database.db, f.agreementId, content))).toBe(CHECK_VIOLATION);
    }
  });

  it('a position below 1', async () => {
    const f = await agreementFixture();
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(
        await sqlErrorCode(c, `insert into universal_term (project_id, position, content) values ($1, 0, 'x')`, [f.projectId]),
      ).toBe(CHECK_VIOLATION);
      expect(
        await sqlErrorCode(c, `insert into agreement_term (pairwise_agreement_id, position, content) values ($1, -1, 'x')`, [
          f.agreementId,
        ]),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it('a duplicate position within one container', async () => {
    const f = await agreementFixture();
    await addUniversalTerm(database.db, f.projectId, 'x');
    await addAgreementTerm(database.db, f.agreementId, 'x');
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(
        await sqlErrorCode(c, `insert into universal_term (project_id, position, content) values ($1, 1, 'y')`, [f.projectId]),
      ).toBe(UNIQUE_VIOLATION);
      expect(
        await sqlErrorCode(c, `insert into agreement_term (pairwise_agreement_id, position, content) values ($1, 1, 'y')`, [
          f.agreementId,
        ]),
      ).toBe(UNIQUE_VIOLATION);
    });
  });

  it('a term on a project or agreement that does not exist', async () => {
    expect(await failureCode(() => addUniversalTerm(database.db, randomUUID(), 'x'))).toBe(FOREIGN_KEY_VIOLATION);
    expect(await failureCode(() => addAgreementTerm(database.db, randomUUID(), 'x'))).toBe(FOREIGN_KEY_VIOLATION);
  });
});

describe('term tables', () => {
  it('hold exactly an id, the container, a position and the text, with no defaults but the id', async () => {
    expect(await columnsOf('universal_term')).toEqual([
      { name: 'id', hasDefault: true },
      { name: 'project_id', hasDefault: false },
      { name: 'position', hasDefault: false },
      { name: 'content', hasDefault: false },
    ]);
    expect(await columnsOf('agreement_term')).toEqual([
      { name: 'id', hasDefault: true },
      { name: 'pairwise_agreement_id', hasDefault: false },
      { name: 'position', hasDefault: false },
      { name: 'content', hasDefault: false },
    ]);
  });

  it('name no excluded semantic in their columns or constraints', async () => {
    const names = await withClient(inject('runtimeUrl'), async (c) => {
      const res = await c.query<{ name: string }>(
        `select column_name as name from information_schema.columns
         where table_schema = 'public' and table_name = any($1)
         union all
         select conname from pg_constraint where conrelid = any($2::regclass[])`,
        [TABLES, TABLES.map((t) => `public.${t}`)],
      );
      return res.rows.map((r) => r.name);
    });
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => EXCLUDED_SEMANTICS.some((word) => name.includes(word)))).toEqual([]);
  });

  it('cannot be updated, deleted or truncated by the runtime role', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      for (const table of TABLES) {
        expect(await sqlErrorCode(c, `update ${table} set content = content`)).toBe(INSUFFICIENT_PRIVILEGE);
        expect(await sqlErrorCode(c, `delete from ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
        expect(await sqlErrorCode(c, `truncate ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });
  });

  it('are not reachable over HTTP', () => {
    expect(operations.filter((op) => /term/i.test(`${op.name} ${op.path}`))).toEqual([]);
  });
});
