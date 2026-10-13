import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { connectionConfig, type DatabaseTarget } from './client.ts';

/** Repository-root `migrations/`, resolved the same way from `src/` and from `dist/`. */
export const migrationsFolder = fileURLToPath(new URL('../../../migrations', import.meta.url));

/**
 * Applies every reviewed migration in `migrations/` that has not yet been
 * applied, in journal order. Must be run with the migration credential.
 */
export async function runMigrations(migrationDatabase: DatabaseTarget): Promise<void> {
  const pool = new pg.Pool({ ...connectionConfig(migrationDatabase), max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
