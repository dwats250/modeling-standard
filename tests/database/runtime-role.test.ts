import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * The runtime credential is distinct from the migration credential and holds
 * exactly the privileges Stage 0 and S01, S02 and S06 to S08 need. Checked as the runtime role, in SQL.
 */

describe('runtime and migration credentials', () => {
  it('are different roles', async () => {
    const runtime = await withClient(inject('runtimeUrl'), (c) => c.query('select current_user as u'));
    const migration = await withClient(inject('migrationUrl'), (c) => c.query('select current_user as u'));
    expect(runtime.rows[0].u).not.toBe(migration.rows[0].u);
  });

  it('runtime role owns nothing and is not a superuser', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      const role = await c.query(
        'select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname = current_user',
      );
      expect(role.rows[0]).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false });
      const owned = await c.query(
        `select count(*)::int as n from pg_class where relowner = (select oid from pg_roles where rolname = current_user)`,
      );
      expect(owned.rows[0].n).toBe(0);
    });
  });

  it('runtime effective table privileges are exactly the Stage 0 and S01, S02 and S06 to S09 set', async () => {
    // has_table_privilege accounts for PUBLIC and inherited roles, so a grant
    // to PUBLIC or to any role ms_runtime belongs to also shows up here.
    const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    const expected: Record<string, string[]> = {
      synthetic_resource: ['SELECT', 'INSERT'],
      synthetic_evidence: ['SELECT', 'INSERT'],
      project: ['SELECT', 'INSERT'],
      project_party: ['SELECT', 'INSERT'],
      pairwise_agreement: ['SELECT', 'INSERT'],
      account: ['SELECT', 'INSERT'],
      party_account_binding: ['SELECT', 'INSERT'],
      direct_invitation: ['SELECT', 'INSERT'],
      live_brief: ['SELECT', 'INSERT'],
      brief_item: ['SELECT', 'INSERT', 'DELETE'],
      brief_party_presence: ['SELECT', 'INSERT'],
      brief_tick: ['SELECT', 'INSERT', 'DELETE'],
    };
    // Column-level UPDATE only (S08, S09); no table may be updated wholesale.
    const columnUpdatable = new Set(['brief_item', 'live_brief', 'brief_party_presence']);
    await withClient(inject('runtimeUrl'), async (c) => {
      const tables = await c.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      );
      expect(tables.rows.map((r) => r.table_name).sort()).toEqual(Object.keys(expected).sort());

      for (const table of Object.keys(expected)) {
        const held: string[] = [];
        for (const privilege of privileges) {
          const res = await c.query<{ held: boolean }>('select has_table_privilege(current_user, $1, $2) as held', [
            `public.${table}`,
            privilege,
          ]);
          if (res.rows[0]?.held) held.push(privilege);
        }
        expect({ table, held }).toEqual({ table, held: expected[table] });

        // Column-level grants are separate from table-level ones. None may
        // allow REFERENCES; only brief_item's draft columns (S08), the brief's
        // phase and the presence fact (S09) may be updated.
        for (const privilege of ['UPDATE', 'REFERENCES']) {
          const col = await c.query<{ held: boolean }>(
            'select has_any_column_privilege(current_user, $1, $2) as held',
            [`public.${table}`, privilege],
          );
          const expectedHeld = columnUpdatable.has(table) && privilege === 'UPDATE';
          expect({ table, privilege, held: col.rows[0]?.held }).toEqual({ table, privilege, held: expectedHeld });
        }
      }
    });
  });

  it('runtime role may update exactly brief_item content, value, pending and position (S08)', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      const { rows } = await c.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'brief_item'
           and has_column_privilege(current_user, 'public.brief_item', column_name, 'UPDATE') order by column_name`,
      );
      expect(rows.map((r) => r.column_name)).toEqual(['content', 'pending', 'position', 'value']);
    });
  });

  it('runtime role may update exactly live_brief.phase and .fingerprint (S09, S10) and brief_party_presence.on_site (S09)', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      for (const [table, columns] of [
        ['live_brief', ['fingerprint', 'phase']],
        ['brief_party_presence', ['on_site']],
        ['brief_tick', []],
      ] as const) {
        const { rows } = await c.query<{ column_name: string }>(
          `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1
             and has_column_privilege(current_user, 'public.' || $1, column_name, 'UPDATE') order by column_name`,
          [table],
        );
        expect({ table, columns: rows.map((r) => r.column_name) }).toEqual({ table, columns: [...columns] });
      }
    });
  });

  it('runtime role cannot create temporary tables in the database', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'create temporary table runtime_temp (id int)')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('runtime role cannot change the schema', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'create table runtime_should_not_create (id int)')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'drop table synthetic_resource')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'alter table synthetic_resource add column x int')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('runtime role cannot read or alter the migration journal', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'select * from drizzle.__drizzle_migrations')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from drizzle.__drizzle_migrations')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('runtime role cannot update synthetic resources (no operation needs it)', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, `update synthetic_resource set label = 'x'`)).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from synthetic_resource')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});
