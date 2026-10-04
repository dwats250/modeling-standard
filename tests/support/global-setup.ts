import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/infrastructure/database/migrate.ts';
import { TEST_DATABASE, requireEnv, withDatabase } from './urls.ts';

/**
 * Creates a fresh, empty test database, migrates it with the migration
 * credential, and hands the runtime and migration URLs to the tests.
 * Missing configuration is a failure, never a skip.
 */

async function adminQuery(migrationUrl: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const migrationUrl = requireEnv('MIGRATION_DATABASE_URL');
  const runtimeUrl = requireEnv('DATABASE_URL');

  await adminQuery(migrationUrl, `DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
  await adminQuery(migrationUrl, `CREATE DATABASE ${TEST_DATABASE}`);
  await runMigrations(withDatabase(migrationUrl, TEST_DATABASE));

  project.provide('runtimeUrl', withDatabase(runtimeUrl, TEST_DATABASE));
  project.provide('migrationUrl', withDatabase(migrationUrl, TEST_DATABASE));
  project.provide('adminUrl', migrationUrl);

  return async () => {
    await adminQuery(migrationUrl, `DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    /** Test database, runtime credential. */
    runtimeUrl: string;
    /** Test database, migration credential. */
    migrationUrl: string;
    /** The configured migration URL (its own database), for creating databases. */
    adminUrl: string;
  }
}
