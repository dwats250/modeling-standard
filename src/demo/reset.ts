import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { createApp } from '../app/create-app.ts';
import { createLogger } from '../app/logger.ts';
import { connectionConfig, openDatabase, type ExplicitDatabaseTarget } from '../infrastructure/database/client.ts';
import { runMigrations } from '../infrastructure/database/migrate.ts';
import { DEMO_DATABASE, assertLoopbackListenHost, demoOperatorPrincipal, syntheticAdminTarget, syntheticDatabaseTarget } from './demo.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from './annotations.ts';
import { loadDemoFixtures, type FixtureAnnotations } from './fixtures.ts';
import { createDemoOperations } from './operations.ts';

/**
 * The synthetic databases' lifecycle: the local demo's
 * (`modeling_standard_demo`) and staging's (`modeling_standard_staging`, S13).
 * Every function takes the database by name, resolves and verifies every
 * target (TCP loopback only) before any client exists, and touches no other
 * database.
 */

export interface SyntheticDatabaseOptions {
  /** The synthetic database, by its fixed name. */
  readonly database: string;
  /** Runtime and migration URLs as configured. Each is resolved and verified before any connection. */
  readonly databaseUrl: string;
  readonly migrationDatabaseUrl: string;
  /** Where this database's annotation store lives (`.demo/`, staging's state directory). */
  readonly annotationsDir: string;
  /** The command whose server must be stopped before a reset (for the refusal message). */
  readonly serverCommand?: string;
}

interface Targets {
  readonly runtime: ExplicitDatabaseTarget;
  readonly migration: ExplicitDatabaseTarget;
  readonly admin: ExplicitDatabaseTarget;
}

function targets(options: SyntheticDatabaseOptions): Targets {
  return {
    runtime: syntheticDatabaseTarget(options.databaseUrl, options.database),
    migration: syntheticDatabaseTarget(options.migrationDatabaseUrl, options.database),
    admin: syntheticAdminTarget(options.migrationDatabaseUrl, options.database),
  };
}

async function withAdmin<T>(admin: ExplicitDatabaseTarget, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(connectionConfig(admin));
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Writes the fixtures as the synthetic operator and replaces the annotation store with exactly theirs. */
async function seed(runtime: ExplicitDatabaseTarget, annotationsDir: string): Promise<FixtureAnnotations> {
  const logger = createLogger('warn');
  const database = openDatabase(runtime, logger);
  const store = new AnnotationStore(resolve(annotationsDir, ANNOTATIONS_FILE));
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
    await rm(resolve(annotationsDir, 'fixture.json'), { force: true });
    return annotations;
  } finally {
    await app.close();
    await database.close();
  }
}

/**
 * Drops and recreates the named synthetic database, migrates it, loads the
 * fixtures and replaces its annotation store with exactly their annotations.
 */
export async function resetSyntheticDatabase(options: SyntheticDatabaseOptions): Promise<FixtureAnnotations> {
  const { runtime, migration, admin } = targets(options);
  await withAdmin(admin, async (client) => {
    try {
      await client.query(`DROP DATABASE IF EXISTS ${pg.escapeIdentifier(options.database)} WITH (FORCE)`);
    } catch (error) {
      // The migration role cannot end another role's sessions, so a running
      // server (connected as the runtime role) blocks the drop.
      if ((error as { code?: unknown }).code === '42501') {
        throw new Error(`The database ${options.database} is in use. Stop \`${options.serverCommand ?? 'its server'}\` (and any export) first, then reset.`, { cause: error });
      }
      throw error;
    }
    await client.query(`CREATE DATABASE ${pg.escapeIdentifier(options.database)}`);
  });
  await runMigrations(migration);
  return seed(runtime, options.annotationsDir);
}

/**
 * Creates the named synthetic database if it does not exist, then applies
 * pending migrations. Never drops anything and never writes rows: safe to
 * run against a database that holds data.
 */
export async function setupSyntheticDatabase(options: SyntheticDatabaseOptions): Promise<{ created: boolean }> {
  const { migration, admin } = targets(options);
  const created = await withAdmin(admin, async (client) => {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [options.database]);
    if (found.rowCount === 1) return false;
    await client.query(`CREATE DATABASE ${pg.escapeIdentifier(options.database)}`);
    return true;
  });
  await runMigrations(migration);
  return { created };
}

export class NotEmptyError extends Error {
  constructor(database: string) {
    super(`${database} already has shoots; seeding only fills an empty database. Use the reset command to start over.`);
    this.name = 'NotEmptyError';
  }
}

/** Loads the fixtures into the named synthetic database only if it has no project yet. */
export async function seedEmptySyntheticDatabase(options: SyntheticDatabaseOptions): Promise<FixtureAnnotations> {
  const { runtime } = targets(options);
  const logger = createLogger('warn');
  const database = openDatabase(runtime, logger);
  try {
    const { rows } = await database.db.execute<{ n: number }>(sql`select count(*)::int as n from project`);
    if ((rows[0]?.n ?? 0) > 0) throw new NotEmptyError(options.database);
  } finally {
    await database.close();
  }
  return seed(runtime, options.annotationsDir);
}

/**
 * The local demo's reset (`npm run demo:reset`, `npm run demo:fresh`, the
 * demo regression suite): `modeling_standard_demo` only, on loopback.
 */
export async function resetDemoDatabase(options: {
  readonly host: string;
  readonly databaseUrl: string;
  readonly migrationDatabaseUrl: string;
  /** The demo's local directory (`.demo/`): the annotation store lives here. */
  readonly demoDir: string;
}): Promise<FixtureAnnotations> {
  assertLoopbackListenHost(options.host);
  return resetSyntheticDatabase({
    database: DEMO_DATABASE,
    databaseUrl: options.databaseUrl,
    migrationDatabaseUrl: options.migrationDatabaseUrl,
    annotationsDir: options.demoDir,
    serverCommand: 'npm run demo',
  });
}
