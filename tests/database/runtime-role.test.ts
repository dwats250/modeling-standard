import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * The runtime credential is distinct from the migration credential and holds
 * exactly the privileges Stage 0 needs. Checked as the runtime role, in SQL.
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

  it('runtime table privileges are exactly the Stage 0 set', async () => {
    const grants = await withClient(inject('runtimeUrl'), (c) =>
      c.query(`
        select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
        from information_schema.table_privileges
        where table_schema = 'public'
          and grantee in (select rolname from pg_roles where pg_has_role(current_user, oid, 'USAGE'))
        group by table_name
        order by table_name`),
    );
    expect(grants.rows).toEqual([
      { table_name: 'synthetic_evidence', privileges: 'INSERT,SELECT' },
      { table_name: 'synthetic_resource', privileges: 'INSERT,SELECT' },
    ]);
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
