import { loadMigrationConfig } from '../config/config.ts';
import { runMigrations } from '../infrastructure/database/migrate.ts';

/** `npm run db:migrate`. Reads only MIGRATION_DATABASE_URL. */
try {
  const config = loadMigrationConfig(process.env);
  await runMigrations(config.migrationDatabaseUrl);
  process.stdout.write('Migrations applied.\n');
} catch (error) {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
