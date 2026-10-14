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

describe('concurrent additions and UUID letter case', () => {
  /**
   * A technical invariant only: concurrent additions to one container must
   * serialize on the same application advisory lock whatever the letter case
   * of the UUID text, as PostgreSQL treats both as the same uuid. The race is
   * made deterministic: the owning role holds the container row FOR UPDATE, so
   * the first addition takes its advisory lock, inserts, and then waits in its
   * foreign-key check; the second starts only once that is so, and the row is
   * released only once the second is waiting too. Blocked calls are found by
   * who blocks them (pg_blocking_pids), so other suites' sessions do not count.
   */

  type Outcome = { ok: true; position: number } | { ok: false; code: string | null };
  const settle = (p: Promise<{ position: number }>): Promise<Outcome> =>
    p.then(
      (row) => ({ ok: true as const, position: row.position }),
      async (error: unknown) => ({ ok: false as const, code: await failureCode(() => Promise.reject(error instanceof Error ? error : new Error(String(error)))) }),
    );

  async function blockedBy(c: import('pg').Client, blocker: number): Promise<number | null> {
    const { rows } = await c.query<{ pid: number }>(
      'select pid from pg_stat_activity where $1 = any(pg_blocking_pids(pid)) order by pid limit 1',
      [blocker],
    );
    return rows[0]?.pid ?? null;
  }

  async function until<T>(read: () => Promise<T | null>, what: string): Promise<T> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const value = await read();
      if (value !== null) return value;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /** Runs `first` while the container row is held, then `second` once `first` is blocked, then releases. */
  async function race(
    table: 'project' | 'pairwise_agreement',
    containerId: string,
    first: () => Promise<{ position: number }>,
    second: () => Promise<{ position: number }>,
  ): Promise<[Outcome, Outcome]> {
    // Waits are observed from a separate connection outside any transaction:
    // pg_stat_activity is a per-transaction snapshot, so the holder cannot poll it.
    return withClient(inject('migrationUrl'), (observer) =>
      withClient(inject('migrationUrl'), async (holder) => {
        const holderPid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;
        await holder.query('begin');
        await holder.query(`select 1 from ${table} where id = $1 for update`, [containerId]);
        const one = settle(first());
        const firstPid = await until(() => blockedBy(observer, holderPid), 'the first addition to wait on the held row');
        const two = settle(second());
        // Before the fix the second waits on the first's uncommitted position;
        // after it, on the first's advisory lock. Either way, the first blocks it.
        await until(() => blockedBy(observer, firstPid), 'the second addition to wait on the first');
        await holder.query('commit');
        return [await one, await two];
      }),
    );
  }

  function positionsOf(outcomes: Outcome[]): number[] {
    return outcomes.map((o) => (o.ok ? o.position : -1)).sort((a, b) => a - b);
  }

  it('universal: lowercase and uppercase forms of one project id both succeed, at positions 1 and 2', async () => {
    const created = await insertProject(database.db, { createdByPrincipalId: `s03-${randomUUID()}` });
    const lower = created.id.toLowerCase();
    const outcomes = await race(
      'project',
      created.id,
      () => addUniversalTerm(database.db, lower, 'lowercase id'),
      () => addUniversalTerm(database.db, lower.toUpperCase(), 'uppercase id'),
    );
    expect(outcomes).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    expect(positionsOf(outcomes)).toEqual([1, 2]);
    expect((await listUniversalTerms(database.db, created.id)).map((t) => t.position)).toEqual([1, 2]);
  });

  it('pairwise: lowercase and uppercase forms of one agreement id both succeed, at positions 1 and 2', async () => {
    const { agreementId } = await agreementFixture();
    const lower = agreementId.toLowerCase();
    const outcomes = await race(
      'pairwise_agreement',
      agreementId,
      () => addAgreementTerm(database.db, lower, 'lowercase id'),
      () => addAgreementTerm(database.db, lower.toUpperCase(), 'uppercase id'),
    );
    expect(outcomes).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    expect(positionsOf(outcomes)).toEqual([1, 2]);
    expect((await listAgreementTerms(database.db, agreementId)).map((t) => t.position)).toEqual([1, 2]);
  });

  it('does not make different containers wait on each other', async () => {
    const held = await insertProject(database.db, { createdByPrincipalId: `s03-${randomUUID()}` });
    const other = await insertProject(database.db, { createdByPrincipalId: `s03-${randomUUID()}` });
    await withClient(inject('migrationUrl'), (observer) => withClient(inject('migrationUrl'), async (holder) => {
      const holderPid = (await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;
      await holder.query('begin');
      await holder.query('select 1 from project where id = $1 for update', [held.id]);
      const blocked = settle(addUniversalTerm(database.db, held.id, 'held container'));
      await until(() => blockedBy(observer, holderPid), 'the held container addition to wait');
      // A genuinely different container proceeds while the first still holds its lock.
      const free = await Promise.race([
        addUniversalTerm(database.db, other.id.toUpperCase(), 'other container'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('different container was blocked')), 5_000)),
      ]);
      expect(free.position).toBe(1);
      await holder.query('commit');
      expect(await blocked).toEqual({ ok: true, position: 1 });
    }));
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
