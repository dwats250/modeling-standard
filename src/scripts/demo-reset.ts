import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { createApp } from '../app/create-app.ts';
import { createLogger } from '../app/logger.ts';
import { loadAppConfig, loadMigrationConfig } from '../config/config.ts';
import { DEMO_DATABASE, assertDemoTarget, demoDatabaseUrl, demoOperatorPrincipal } from '../demo/demo.ts';
import { loadDemoFixtures } from '../demo/fixtures.ts';
import { demoOperations } from '../demo/operations.ts';
import { openDatabase } from '../infrastructure/database/client.ts';
import { runMigrations } from '../infrastructure/database/migrate.ts';

/**
 * `npm run demo:reset`. Drops and recreates the synthetic demo database
 * (modeling_standard_demo only), migrates it, and loads the fixtures. It
 * never touches any other database.
 */

try {
  const app = loadAppConfig(process.env);
  const migration = loadMigrationConfig(process.env);
  const runtimeUrl = demoDatabaseUrl(app.databaseUrl);
  const migrationUrl = demoDatabaseUrl(migration.migrationDatabaseUrl);
  assertDemoTarget({ host: app.host, databaseUrl: runtimeUrl });
  assertDemoTarget({ host: app.host, databaseUrl: migrationUrl });

  const admin = new pg.Client({ connectionString: migration.migrationDatabaseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DEMO_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${DEMO_DATABASE}`);
  } finally {
    await admin.end();
  }
  await runMigrations(migrationUrl);

  const logger = createLogger('warn');
  const database = openDatabase(runtimeUrl, logger);
  const server = createApp({
    db: database.db,
    logger,
    resolvePrincipal: demoOperatorPrincipal,
    additionalOperations: demoOperations,
  });
  try {
    await server.ready();
    const annotations = await loadDemoFixtures(server, database.db);
    const dir = resolve(process.cwd(), '.demo');
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'fixture.json'), `${JSON.stringify(annotations, null, 2)}\n`);
    process.stdout.write(
      `Demo database ${DEMO_DATABASE} reset with ${Object.keys(annotations.projects).length} synthetic projects.\n`,
    );
  } finally {
    await server.close();
    await database.close();
  }
} catch (error) {
  process.stderr.write(`Demo reset failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
