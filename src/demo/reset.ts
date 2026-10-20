import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { createApp } from '../app/create-app.ts';
import { createLogger } from '../app/logger.ts';
import { connectionConfig, openDatabase } from '../infrastructure/database/client.ts';
import { runMigrations } from '../infrastructure/database/migrate.ts';
import { DEMO_DATABASE, assertLoopbackListenHost, demoAdminTarget, demoDatabaseTarget, demoOperatorPrincipal } from './demo.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from './annotations.ts';
import { loadDemoFixtures, type FixtureAnnotations } from './fixtures.ts';
import { createDemoOperations } from './operations.ts';

/**
 * Drops and recreates the demo database (modeling_standard_demo only),
 * migrates it, loads the fixtures and replaces the demo annotation store
 * with exactly their annotations, so labels for shoots composed before the
 * reset go with them. Used by `npm run demo:reset`, `npm run demo:fresh` and
 * the demo regression suite, so all exercise the same path.
 */
export async function resetDemoDatabase(options: {
  readonly host: string;
  /** Runtime and migration URLs as configured. Each is resolved and verified before any connection. */
  readonly databaseUrl: string;
  readonly migrationDatabaseUrl: string;
  /** The demo's local directory (`.demo/`): the annotation store lives here. */
  readonly demoDir: string;
}): Promise<FixtureAnnotations> {
  // Every target is resolved and verified first, so a bad one fails before
  // any client exists. The verified targets are what the clients receive.
  assertLoopbackListenHost(options.host);
  const runtime = demoDatabaseTarget(options.databaseUrl);
  const migration = demoDatabaseTarget(options.migrationDatabaseUrl);
  const adminTarget = demoAdminTarget(options.migrationDatabaseUrl);

  const admin = new pg.Client(connectionConfig(adminTarget));
  await admin.connect();
  try {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${DEMO_DATABASE} WITH (FORCE)`);
    } catch (error) {
      // The migration role cannot end another role's sessions, so a running
      // demo server (connected as the runtime role) blocks the drop.
      if ((error as { code?: unknown }).code === '42501') {
        throw new Error('The demo database is in use. Stop `npm run demo` (and any export) first, then reset.', { cause: error });
      }
      throw error;
    }
    await admin.query(`CREATE DATABASE ${DEMO_DATABASE}`);
  } finally {
    await admin.end();
  }
  await runMigrations(migration);

  const logger = createLogger('warn');
  const database = openDatabase(runtime, logger);
  const store = new AnnotationStore(resolve(options.demoDir, ANNOTATIONS_FILE));
  const app = createApp({
    db: database.db,
    logger,
    resolvePrincipal: demoOperatorPrincipal,
    additionalOperations: createDemoOperations(store),
  });
  try {
    await app.ready();
    const annotations = await loadDemoFixtures(app, database.db);
    await store.replace(annotations);
    // The pre-store annotation file, which went stale between resets.
    await rm(resolve(options.demoDir, 'fixture.json'), { force: true });
    return annotations;
  } finally {
    await app.close();
    await database.close();
  }
}
