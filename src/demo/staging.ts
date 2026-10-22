import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { ConfigError, loadAppConfig, loadMigrationConfig, type AppConfig } from '../config/config.ts';
import { tokenDigest } from '../infrastructure/tokens.ts';
import { DemoGuardError, isLoopbackHost } from './demo.ts';
import type { SyntheticDatabaseOptions } from './reset.ts';

/**
 * Synthetic staging (slice S13): the synthetic demo, reachable from phones
 * through a local HTTPS reverse proxy (Tailscale Serve on the staging host),
 * signing people in with Google, with operator mode behind a key.
 *
 * Staging is still synthetic: invented shoots, the operator acts labelled as
 * such, no real collaboration (D06 step 1; Gate 2 stays closed). It is not
 * the production entry point (`src/main.ts`), and like all of `src/demo/` it
 * is outside the production build.
 *
 * Configuration comes from one env file outside the repository
 * (`~/.config/modeling-standard/staging.env` by default, or the path in
 * `MS_STAGING_ENV_FILE`), which must be a regular file owned by this user
 * and readable by nobody else. The process environment is not read for
 * anything else, so a worktree's `.env` can never point staging at another
 * database. Every check fails closed and names the setting, never its value.
 *
 * Trust boundary: the server listens on loopback only. The one thing in
 * front of it is the local proxy, which terminates TLS for the pinned public
 * origin. The server pins the Host header to that origin's authority and the
 * Origin of every state-changing browser request to that origin exactly; it
 * reads no forwarded header, so neither the proxy nor a client can widen
 * either.
 */

/** The only database staging uses. Never the demo's, never the tests'. */
export const STAGING_DATABASE = 'modeling_standard_staging';

export const DEFAULT_STAGING_ENV_FILE = join(homedir(), '.config', 'modeling-standard', 'staging.env');
const DEFAULT_STATE_DIR = join(homedir(), '.local', 'state', 'modeling-standard', 'staging');

export interface StagingConfig {
  readonly app: AppConfig & { readonly publicOrigin: string; readonly google: NonNullable<AppConfig['google']> };
  /** The exact Host header the proxy forwards for the public origin (`host[:port]`). */
  readonly publicAuthority: string;
  readonly operatorKey: string;
  /** Where staging's annotation store lives (outside the repository). */
  readonly stateDir: string;
}

/** The staging env file's settings. Refuses a file that is missing, not ours, or readable by others. */
export function readStagingEnvFile(path: string): Record<string, string> {
  // Opened once, without following a symlink in the last component, and
  // checked and read through the same descriptor: what is checked is what is read.
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') throw new ConfigError([`staging env file: ${path} must be a regular file, not a symlink`]);
    throw new ConfigError([`staging env file: not found at ${path}`]);
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new ConfigError([`staging env file: ${path} must be a regular file`]);
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
      throw new ConfigError([`staging env file: ${path} must be owned by the user running staging`]);
    }
    if ((stat.mode & 0o077) !== 0) throw new ConfigError([`staging env file: ${path} must not be readable by group or others (chmod 600)`]);
    return Object.fromEntries(Object.entries(parseEnv(readFileSync(fd, 'utf8'))).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } finally {
    closeSync(fd);
  }
}

/** Where staging keeps its annotation store: STAGING_STATE_DIR (absolute), or a default outside the repository. */
function stagingStateDir(env: Readonly<Record<string, string | undefined>>): string {
  const stateDir = env.STAGING_STATE_DIR !== undefined && env.STAGING_STATE_DIR !== '' ? env.STAGING_STATE_DIR : DEFAULT_STATE_DIR;
  if (!stateDir.startsWith('/')) throw new ConfigError(['STAGING_STATE_DIR: must be an absolute path']);
  return stateDir;
}

/** Validates staging's settings: everything is required, nothing is defaulted that matters. */
export function loadStagingConfig(env: Readonly<Record<string, string | undefined>>): StagingConfig {
  const app = loadAppConfig(env);
  const problems: string[] = [];
  let publicAuthority = '';
  if (app.publicOrigin === null) {
    problems.push('PUBLIC_BASE_URL: is required on staging');
  } else {
    const url = new URL(app.publicOrigin);
    if (url.protocol !== 'https:') problems.push('PUBLIC_BASE_URL: must be https:// on staging');
    if (isLoopbackHost(url.hostname)) problems.push('PUBLIC_BASE_URL: must be the proxy\'s public name on staging, not loopback');
    publicAuthority = url.host;
  }
  if (app.google === null) problems.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: are required on staging');
  if (!isLoopbackHost(app.host)) problems.push('HOST: staging listens on loopback only (the proxy is in front of it)');
  const operatorKey = env.STAGING_OPERATOR_KEY ?? '';
  // The format is checked exactly; randomness cannot be, but a hand-typed or
  // patterned value (few distinct characters) is refused. 43 random base64url
  // characters practically never have fewer than 16 distinct ones.
  if (tokenDigest(operatorKey) === null || new Set(operatorKey).size < 16) {
    problems.push('STAGING_OPERATOR_KEY: must be 32 random bytes as unpadded base64url (43 characters); generate it as the runbook says');
  }
  let stateDir = '';
  try {
    stateDir = stagingStateDir(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    problems.push(...error.problems);
  }
  if (problems.length > 0) throw new ConfigError(problems);
  return {
    app: app as StagingConfig['app'],
    publicAuthority,
    operatorKey,
    stateDir,
  };
}

/**
 * Staging's database settings for setup, seed and reset. These need the
 * database URLs (and the migration role) but not Google or the operator key,
 * so the database can be prepared before the Google client exists. Anything
 * present is still validated: a partial Google client fails here too.
 */
export function loadStagingDatabaseOptions(env: Readonly<Record<string, string | undefined>>): SyntheticDatabaseOptions {
  const app = loadAppConfig(env);
  const migration = loadMigrationConfig(env);
  const stateDir = stagingStateDir(env);
  return {
    database: STAGING_DATABASE,
    databaseUrl: app.databaseUrl,
    migrationDatabaseUrl: migration.migrationDatabaseUrl,
    annotationsDir: stateDir,
    serverCommand: 'npm run staging',
  };
}

function exitWith(error: unknown): never {
  const message = error instanceof ConfigError || error instanceof DemoGuardError ? error.message : 'Invalid staging configuration';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * Reads and validates staging's env file for serving (the entry point passes
 * `MS_STAGING_ENV_FILE`, or nothing for the default path); prints the
 * problem (never a value) and exits on failure.
 */
export function loadStagingOrExit(envFile: string | undefined): StagingConfig {
  try {
    return loadStagingConfig(readStagingEnvFile(envFile || DEFAULT_STAGING_ENV_FILE));
  } catch (error) {
    exitWith(error);
  }
}

/** The same, for the database commands (setup, seed, reset), with the port staging serves on. */
export function loadStagingDatabaseOrExit(envFile: string | undefined): { options: SyntheticDatabaseOptions; port: number } {
  try {
    const env = readStagingEnvFile(envFile || DEFAULT_STAGING_ENV_FILE);
    return { options: loadStagingDatabaseOptions(env), port: loadAppConfig(env).port };
  } catch (error) {
    exitWith(error);
  }
}
