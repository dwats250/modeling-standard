import { mkdirSync } from 'node:fs';
import { connect } from 'node:net';
import { isAbsolute, normalize } from 'node:path';
import pg from 'pg';
import { createLogger } from '../app/logger.ts';
import { ConfigError } from '../config/config.ts';
import { connectionConfig, openDatabase } from '../infrastructure/database/client.ts';
import { DEMO_DATABASE, DemoGuardError, syntheticAdminTarget, syntheticDatabaseTarget } from './demo.ts';
import { resetSyntheticDatabase } from './reset.ts';
import { assertReviewerDatabaseBoundary } from './reviewer-database.ts';
import { isInsideRepository } from './reviewer.ts';

/**
 * Prepares the reviewer's database: drops and recreates
 * `modeling_standard_demo`, migrates it, loads the synthetic fixtures, then
 * checks the runtime role against the same boundary serving will enforce.
 *
 * This is the one place the migration credential is used for reviewer mode,
 * from its own owner-only env file. The serving process never receives it.
 * Because this drops a database, it refuses any PostgreSQL server that holds
 * another application database: it runs on a dedicated server or not at all,
 * never beside staging or the ordinary demo's development databases.
 */

export interface ReviewerBootstrapConfig {
  readonly databaseUrl: string;
  readonly migrationDatabaseUrl: string;
  /** Where the fixtures' annotation file is written, for installing into the serving state directory. */
  readonly annotationsDir: string;
  /** The serving port on loopback: bootstrap refuses while anything listens there. */
  readonly servingPort: number;
}

const REFUSED_SETTINGS = ['REVIEWER_ACCESS_KEY', 'REVIEWER_PUBLIC_ORIGIN', 'STAGING_OPERATOR_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_BASE_URL'];

/** Validates bootstrap's settings. Messages name the setting and the problem, never a value. */
export function loadReviewerBootstrapConfig(env: Readonly<Record<string, string | undefined>>): ReviewerBootstrapConfig {
  const problems: string[] = [];
  for (const name of REFUSED_SETTINGS) {
    if (env[name] !== undefined && env[name] !== '') problems.push(`${name}: must not be in the bootstrap env file (it belongs to serving, or to nothing here)`);
  }
  const databaseUrl = env.DATABASE_URL ?? '';
  const migrationDatabaseUrl = env.MIGRATION_DATABASE_URL ?? '';
  let runtime: ReturnType<typeof syntheticDatabaseTarget> | undefined;
  let admin: ReturnType<typeof syntheticAdminTarget> | undefined;
  try {
    runtime = syntheticDatabaseTarget(databaseUrl, DEMO_DATABASE);
    if (new URL(databaseUrl).pathname !== `/${DEMO_DATABASE}` || new URL(databaseUrl).search !== '') {
      problems.push(`DATABASE_URL: must name ${DEMO_DATABASE} exactly, with no query parameters`);
    }
  } catch {
    problems.push('DATABASE_URL: must be a URL for a PostgreSQL server on TCP loopback');
  }
  try {
    admin = syntheticAdminTarget(migrationDatabaseUrl, DEMO_DATABASE);
    if (new URL(migrationDatabaseUrl).search !== '') problems.push('MIGRATION_DATABASE_URL: must have no query parameters');
  } catch (error) {
    problems.push(`MIGRATION_DATABASE_URL: ${error instanceof DemoGuardError && error.message.startsWith('Reset needs') ? 'must name the migration role\'s own database, not the demo database' : 'must be a URL for a PostgreSQL server on TCP loopback'}`);
  }
  if (runtime && admin) {
    if (runtime.user === admin.user) problems.push('DATABASE_URL and MIGRATION_DATABASE_URL: must be different roles');
    if (runtime.host !== admin.host || runtime.port !== admin.port) problems.push('DATABASE_URL and MIGRATION_DATABASE_URL: must be the same server');
  }
  const annotationsDir = env.REVIEWER_ANNOTATIONS_OUT_DIR ?? '';
  if (!isAbsolute(annotationsDir) || normalize(annotationsDir).replace(/(?<=.)\/$/, '') !== annotationsDir || isInsideRepository(annotationsDir)) {
    problems.push('REVIEWER_ANNOTATIONS_OUT_DIR: must be a normalized absolute path outside the repository');
  }
  const servingPort = Number(env.PORT);
  if (!/^[1-9][0-9]{0,4}$/.test(env.PORT ?? '') || servingPort > 65535) problems.push('PORT: must be the port reviewer mode serves on');
  if (problems.length > 0) throw new ConfigError(problems);
  return { databaseUrl, migrationDatabaseUrl, annotationsDir, servingPort };
}

function listening(port: number, host: string): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ port, host });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      done(false);
    });
    socket.once('error', () => done(false));
  });
}

/**
 * Everything checked before anything is dropped: the serving port is free,
 * the migration role is not a superuser, and this PostgreSQL server holds no
 * database but the demo's, the migration role's own and the built-in ones.
 */
async function preflight(config: ReviewerBootstrapConfig): Promise<void> {
  if ((await listening(config.servingPort, '127.0.0.1')) || (await listening(config.servingPort, '::1'))) {
    throw new ConfigError([`PORT: something is listening on ${config.servingPort}; stop reviewer mode first`]);
  }
  const client = new pg.Client(connectionConfig(syntheticAdminTarget(config.migrationDatabaseUrl, DEMO_DATABASE)));
  await client.connect();
  try {
    const { rows } = await client.query<{ datname: string; own: string; super: boolean }>(
      `select d.datname, current_database() as own, (select rolsuper from pg_roles where rolname = current_user) as super
       from pg_database d where not d.datistemplate`,
    );
    const own = rows[0]?.own;
    if (rows[0]?.super) throw new ConfigError(['MIGRATION_DATABASE_URL: must not be a superuser']);
    const others = rows.map((row) => row.datname).filter((name) => name !== DEMO_DATABASE && name !== own && name !== 'postgres');
    if (others.length > 0) {
      throw new ConfigError([`this PostgreSQL server holds other databases (${others.sort().join(', ')}); reviewer bootstrap needs a dedicated server`]);
    }
  } finally {
    await client.end();
  }
}

/** Preflight, reset, then the serving boundary, checked as the runtime role. Returns the synthetic project count. */
export async function bootstrapReviewerDatabase(config: ReviewerBootstrapConfig): Promise<number> {
  await preflight(config);
  mkdirSync(config.annotationsDir, { recursive: true, mode: 0o700 });
  const annotations = await resetSyntheticDatabase({
    database: DEMO_DATABASE,
    databaseUrl: config.databaseUrl,
    migrationDatabaseUrl: config.migrationDatabaseUrl,
    annotationsDir: config.annotationsDir,
    serverCommand: 'npm run demo:reviewer',
  });
  const logger = createLogger('warn');
  const database = openDatabase(syntheticDatabaseTarget(config.databaseUrl, DEMO_DATABASE), logger);
  try {
    await assertReviewerDatabaseBoundary(database.db);
  } finally {
    await database.close();
  }
  return Object.keys(annotations.projects).length;
}
