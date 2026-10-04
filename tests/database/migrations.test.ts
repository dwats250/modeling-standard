import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { migrationsFolder, runMigrations } from '../../src/infrastructure/database/migrate.ts';
import { withDatabase } from '../support/urls.ts';
import { withClient } from '../support/sql.ts';

/**
 * Migrations against real PostgreSQL: an empty database migrates, a second
 * run changes nothing, and the result contains only the Stage 0 synthetic
 * tables (no product schema).
 */

async function withEmptyDatabase<T>(fn: (migrationUrl: string) => Promise<T>): Promise<T> {
  const name = `ms_migration_test_${randomUUID().replaceAll('-', '')}`;
  const admin = inject('adminUrl');
  await withClient(admin, (c) => c.query(`CREATE DATABASE ${name}`));
  try {
    return await fn(withDatabase(admin, name));
  } finally {
    await withClient(admin, (c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
  }
}

const migrationFiles = readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql')).sort();

describe('migrations', () => {
  it('migrate an empty database, and a second run applies nothing', async () => {
    await withEmptyDatabase(async (url) => {
      const tablesBefore = await withClient(url, (c) =>
        c.query(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`),
      );
      expect(tablesBefore.rows[0].n).toBe(0);

      await runMigrations(url);
      const applied = await withClient(url, (c) => c.query('select hash from drizzle.__drizzle_migrations order by id'));
      expect(applied.rowCount).toBe(migrationFiles.length);

      await runMigrations(url);
      const reapplied = await withClient(url, (c) => c.query('select hash from drizzle.__drizzle_migrations order by id'));
      expect(reapplied.rows).toEqual(applied.rows);
    });
  });

  it('produce only the Stage 0 synthetic tables', async () => {
    const tables = await withClient(inject('migrationUrl'), (c) =>
      c.query(
        `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      ),
    );
    expect(tables.rows.map((r: { table_name: string }) => r.table_name)).toEqual(['synthetic_evidence', 'synthetic_resource']);
  });
});
