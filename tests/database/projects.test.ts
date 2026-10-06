import { randomUUID } from 'node:crypto';
import { eq, getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { project, projectParty } from '../../src/projects/tables.ts';
import { INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S01 persistence against real PostgreSQL, as the runtime role: a project
 * records its creator as an audit fact, holds any number of role-free
 * project-local parties, and the schema carries none of the semantics the
 * slice excludes.
 */

const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Words that must not appear in the S01 schema. Each names a semantic S01
 * excludes: fixed roles, payment, terms, obligations, usage rights,
 * acceptance, signatures, witnesses, youth or proxy models, distribution
 * subtypes, or binding a party to an identity.
 */
const EXCLUDED_SEMANTICS = [
  'payer', 'payee', 'pay', 'photographer', 'model', 'concept', 'author', 'role',
  'compensation', 'term', 'obligation', 'usage', 'right', 'deliverable',
  'sign', 'accept', 'affirm', 'witness', 'agree',
  'youth', 'guardian', 'minor', 'proxy', 'represent',
  'posted', 'direct', 'invite', 'email', 'account', 'person', 'identity', 'verif',
];

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

async function columnsOf(table: string): Promise<string[]> {
  const res = await withClient(inject('runtimeUrl'), (c) =>
    c.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = $1 order by ordinal_position`,
      [table],
    ),
  );
  return res.rows.map((r) => r.column_name);
}

describe('project persistence', () => {
  it('records the creating principal as an audit fact, and creates no party for it', async () => {
    const creator = `db-creator-${randomUUID()}`;
    const created = await insertProject(database.db, { createdByPrincipalId: creator });
    expect(created.createdByPrincipalId).toBe(creator);
    expect(created.createdAt).toBeInstanceOf(Date);

    const parties = await database.db.select().from(projectParty).where(eq(projectParty.projectId, created.id));
    expect(parties).toEqual([]);
  });

  it('holds exactly an id, the creating principal and the creation time', async () => {
    expect(await columnsOf('project')).toEqual(['id', 'created_by_principal_id', 'created_at']);
  });
});

describe('project-local parties', () => {
  it('represent two or more parties in one project without a role', async () => {
    const created = await insertProject(database.db, { createdByPrincipalId: `db-creator-${randomUUID()}` });
    const first = await addProjectParty(database.db, created.id);
    const second = await addProjectParty(database.db, created.id);

    expect(first).toEqual({ id: expect.any(String), projectId: created.id });
    expect(second).toEqual({ id: expect.any(String), projectId: created.id });
    expect(first.id).not.toBe(second.id);

    const stored = await database.db.select().from(projectParty).where(eq(projectParty.projectId, created.id));
    expect(stored.map((p) => p.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('are scoped to their own project', async () => {
    const a = await insertProject(database.db, { createdByPrincipalId: `db-creator-${randomUUID()}` });
    const b = await insertProject(database.db, { createdByPrincipalId: `db-creator-${randomUUID()}` });
    const partyOfA = await addProjectParty(database.db, a.id);

    const partiesOfB = await database.db.select().from(projectParty).where(eq(projectParty.projectId, b.id));
    expect(partiesOfB.map((p) => p.id)).not.toContain(partyOfA.id);
  });

  it('cannot belong to a project that does not exist', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'insert into project_party (project_id) values ($1)', [randomUUID()])).toBe(
        FOREIGN_KEY_VIOLATION,
      );
    });
  });

  it('hold only an id and their project: no role, label, or link to a principal, account or person', async () => {
    expect(await columnsOf('project_party')).toEqual(['id', 'project_id']);

    // The only reference out of the party table is to its project. Read from
    // the catalog: information_schema hides constraints of tables the runtime
    // role does not own.
    const references = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ referenced: string }>(
        `select confrelid::regclass::text as referenced from pg_constraint
         where conrelid = 'public.project_party'::regclass and contype = 'f'`,
      ),
    );
    expect(references.rows.map((r) => r.referenced)).toEqual(['project']);
  });

  it('are not created with the creator recorded on them', async () => {
    // A party never carries the creating principal, so creating a project
    // cannot be read as the creator holding any party's position.
    const creator = `db-creator-${randomUUID()}`;
    const created = await insertProject(database.db, { createdByPrincipalId: creator });
    await addProjectParty(database.db, created.id);
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query('select row_to_json(p)::text as json from project_party p where project_id = $1', [created.id]),
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].json).not.toContain(creator);
  });
});

describe('S01 schema carries none of the excluded semantics', () => {
  for (const table of ['project', 'project_party']) {
    it(`${table} has no column naming an excluded semantic`, async () => {
      const columns = await columnsOf(table);
      expect(columns.length).toBeGreaterThan(0);
      const offending = columns.filter((column) => EXCLUDED_SEMANTICS.some((word) => column.includes(word)));
      expect({ table, offending }).toEqual({ table, offending: [] });
    });
  }

  it('the Drizzle definitions match: no excluded semantic in either table definition', () => {
    const names = [...Object.keys(getTableColumns(project)), ...Object.keys(getTableColumns(projectParty))].map((n) =>
      n.toLowerCase(),
    );
    const offending = names.filter((name) => EXCLUDED_SEMANTICS.some((word) => name.includes(word)));
    expect(offending).toEqual([]);
  });
});

describe('runtime role on the S01 tables', () => {
  it('cannot update or delete projects or parties (no S01 operation needs it)', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, `update project set created_by_principal_id = 'someone-else'`)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await sqlErrorCode(c, 'delete from project')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update project_party set project_id = project_id')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from project_party')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate project_party')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});
