import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ConfigError } from '../../src/config/config.ts';
import { DemoGuardError } from '../../src/demo/demo.ts';
import { NotEmptyError, resetSyntheticDatabase, seedEmptySyntheticDatabase, setupSyntheticDatabase } from '../../src/demo/reset.ts';
import { STAGING_DATABASE, loadStagingConfig, readStagingEnvFile } from '../../src/demo/staging.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { withClient } from '../support/sql.ts';
import { withDatabase } from '../support/urls.ts';

/**
 * S13 staging's configuration and database lifecycle, on the test server.
 *
 * The library functions are exercised on a test-only database name. The
 * commands force staging's real name, so before anything else this file
 * refuses to run if the server it was pointed at already has a staging
 * database: a test run can never drop a real one. It drops only what it
 * created.
 */

const ROOT = resolve(import.meta.dirname, '../..');
const KEY = newToken().token;
const CLIENT_ID = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
const CLIENT_SECRET = 'GOCSPX-Staging-Test-Secret-77';
const work = mkdtempSync(join(tmpdir(), 'ms-staging-test-'));

function stagingEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL: inject('runtimeUrl'),
    MIGRATION_DATABASE_URL: inject('adminUrl'),
    PUBLIC_BASE_URL: 'https://staging.example.invalid:8443',
    HOST: '127.0.0.1',
    PORT: '3130',
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    STAGING_OPERATOR_KEY: KEY,
    STAGING_STATE_DIR: join(work, 'state'),
    LOG_LEVEL: 'warn',
    ...overrides,
  };
}

function envFile(env: Record<string, string>, mode = 0o600): string {
  const path = join(work, `staging-${newToken().token.slice(0, 8)}.env`);
  writeFileSync(path, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'));
  chmodSync(path, mode);
  return path;
}

function problemsOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems.join('\n');
  }
  throw new Error('expected a ConfigError');
}

const LIBRARY_DATABASE = 'modeling_standard_staging_test';

const options = () => ({
  database: LIBRARY_DATABASE,
  databaseUrl: inject('runtimeUrl'),
  migrationDatabaseUrl: inject('adminUrl'),
  annotationsDir: join(work, 'state'),
});

async function projectCount(database: string): Promise<number> {
  return withClient(withDatabase(inject('adminUrl'), database), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from project')).rows[0]!.n);
}

async function exists(database: string): Promise<boolean> {
  return withClient(inject('adminUrl'), async (c) => (await c.query('select 1 from pg_database where datname = $1', [database])).rowCount === 1);
}

beforeAll(async () => {
  for (const database of [STAGING_DATABASE, LIBRARY_DATABASE]) {
    if (await exists(database)) {
      throw new Error(`Refusing to run: the test server already has a database named ${database}. Point the tests at a test-only server, never at staging's.`);
    }
  }
});

afterAll(async () => {
  // Both were absent when this file started (checked above): only what it created is dropped.
  for (const database of [STAGING_DATABASE, LIBRARY_DATABASE]) await withClient(inject('adminUrl'), (c) => c.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`));
});

describe('staging configuration fails closed', () => {
  it('accepts a complete configuration and pins the public authority', () => {
    const config = loadStagingConfig(stagingEnv());
    expect(config.app.publicOrigin).toBe('https://staging.example.invalid:8443');
    expect(config.publicAuthority).toBe('staging.example.invalid:8443');
    expect(config.app.google).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  });

  const cases: [string, Record<string, string>, RegExp][] = [
    ['no public origin', { PUBLIC_BASE_URL: '' }, /PUBLIC_BASE_URL: is required/],
    ['a plain-HTTP public origin', { PUBLIC_BASE_URL: 'http://localhost:3130' }, /PUBLIC_BASE_URL: must be https/],
    ['a loopback public origin', { PUBLIC_BASE_URL: 'https://127.0.0.1:8443' }, /PUBLIC_BASE_URL: must be the proxy's public name/],
    ['no Google client', { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }, /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: are required/],
    ['half a Google client', { GOOGLE_CLIENT_SECRET: '' }, /GOOGLE_CLIENT_SECRET: is required/],
    ['a listener off loopback', { HOST: '0.0.0.0' }, /HOST: staging listens on loopback only/],
    ['no operator key', { STAGING_OPERATOR_KEY: '' }, /STAGING_OPERATOR_KEY: must be/],
    ['a short operator key', { STAGING_OPERATOR_KEY: 'Secret-Short-Key' }, /STAGING_OPERATOR_KEY: must be/],
    ['a patterned operator key', { STAGING_OPERATOR_KEY: 'A'.repeat(43) }, /STAGING_OPERATOR_KEY: must be/],
    ['a nearly patterned operator key', { STAGING_OPERATOR_KEY: 'abcdefghij'.repeat(4) + 'abc' }, /STAGING_OPERATOR_KEY: must be/],
    ['a relative state directory', { STAGING_STATE_DIR: 'state' }, /STAGING_STATE_DIR: must be an absolute path/],
  ];
  for (const [label, overrides, expected] of cases) {
    it(`refuses ${label}, naming the setting and never a value`, () => {
      const text = problemsOf(() => loadStagingConfig(stagingEnv(overrides)));
      expect(text).toMatch(expected);
      for (const value of [KEY, CLIENT_SECRET, 'Secret-Short-Key']) expect(text).not.toContain(value);
    });
  }

  it('reads its env file only if it is a regular file readable by its owner alone', () => {
    const good = envFile(stagingEnv());
    expect(readStagingEnvFile(good).STAGING_OPERATOR_KEY).toBe(KEY);
    for (const mode of [0o644, 0o640, 0o604, 0o660]) {
      const text = problemsOf(() => readStagingEnvFile(envFile(stagingEnv(), mode)));
      expect(text).toMatch(/must not be readable by group or others/);
      expect(text).not.toContain(CLIENT_SECRET);
    }
    expect(problemsOf(() => readStagingEnvFile(join(work, 'missing.env')))).toMatch(/not found/);
    const link = join(work, 'link.env');
    symlinkSync(good, link);
    expect(problemsOf(() => readStagingEnvFile(link))).toMatch(/not a symlink/);
    const dir = join(work, 'a-directory.env');
    mkdirSync(dir, { recursive: true });
    expect(problemsOf(() => readStagingEnvFile(dir))).toMatch(/must be a regular file/);
  });
});

describe('staging database lifecycle (fixed name, loopback only)', () => {
  it('refuses a non-loopback database server, or the migration role pointed at the staging database itself, before connecting', async () => {
    await expect(setupSyntheticDatabase({ ...options(), databaseUrl: 'postgres://u:Secret-Pw@db.example:5432/x' })).rejects.toBeInstanceOf(DemoGuardError);
    await expect(setupSyntheticDatabase({ ...options(), migrationDatabaseUrl: withDatabase(inject('adminUrl'), LIBRARY_DATABASE) })).rejects.toBeInstanceOf(DemoGuardError);
    expect(await exists(LIBRARY_DATABASE)).toBe(false);
  });

  it('setup creates and migrates it, seed fills it once, setup again keeps every row, seed again refuses, reset starts over', async () => {
    expect(await setupSyntheticDatabase(options())).toEqual({ created: true });
    expect(await projectCount(LIBRARY_DATABASE)).toBe(0);
    const seeded = await seedEmptySyntheticDatabase(options());
    const seededCount = Object.keys(seeded.projects).length;
    expect(seededCount).toBeGreaterThan(0);
    expect(await projectCount(LIBRARY_DATABASE)).toBe(seededCount);

    // Something only a running staging would have written.
    await withClient(withDatabase(inject('adminUrl'), LIBRARY_DATABASE), (c) => c.query("insert into account (login_provider, provider_subject) values ('google', 'kept-across-setup')"));
    expect(await setupSyntheticDatabase(options())).toEqual({ created: false });
    expect(await projectCount(LIBRARY_DATABASE)).toBe(seededCount);
    await expect(seedEmptySyntheticDatabase(options())).rejects.toBeInstanceOf(NotEmptyError);
    const kept = await withClient(withDatabase(inject('adminUrl'), LIBRARY_DATABASE), async (c) => (await c.query("select 1 from account where provider_subject = 'kept-across-setup'")).rowCount);
    expect(kept).toBe(1);

    await resetSyntheticDatabase(options());
    expect(await projectCount(LIBRARY_DATABASE)).toBe(seededCount);
    const gone = await withClient(withDatabase(inject('adminUrl'), LIBRARY_DATABASE), async (c) => (await c.query<{ n: number }>('select count(*)::int as n from account')).rows[0]!.n);
    expect(gone).toBe(0);
  });
});

function run(script: string, args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, 'src/scripts', script), ...args], { env: { PATH: process.env.PATH ?? '', ...env }, cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', (code) => done({ code, out }));
  });
}

async function freePort(): Promise<number> {
  return new Promise((done) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
}

function get(port: number, host: string, path: string): Promise<number> {
  return new Promise((done, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers: { host }, setHost: false }, (res) => {
      res.resume();
      res.on('end', () => done(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('staging commands (staging\'s own name, on the test server)', () => {
  it('setup creates and migrates, seed fills an empty database once, setup again keeps the data', async () => {
    const file = envFile(stagingEnv());
    const first = await run('staging-setup.ts', [], { MS_STAGING_ENV_FILE: file });
    expect(first.out).toContain(`Created ${STAGING_DATABASE}; migrations applied.`);
    const seeded = await run('staging-seed.ts', [], { MS_STAGING_ENV_FILE: file });
    expect(seeded.code).toBe(0);
    const count = await projectCount(STAGING_DATABASE);
    expect(count).toBeGreaterThan(0);
    const again = await run('staging-seed.ts', [], { MS_STAGING_ENV_FILE: file });
    expect(again.code).toBe(1);
    expect(again.out).toContain('already has shoots');
    expect((await run('staging-setup.ts', [], { MS_STAGING_ENV_FILE: file })).out).toContain(`Found ${STAGING_DATABASE}`);
    expect(await projectCount(STAGING_DATABASE)).toBe(count);
  });

  it('reset refuses without the exact confirmation, before reading anything', async () => {
    const file = envFile(stagingEnv());
    const before = await projectCount(STAGING_DATABASE);
    for (const args of [[], ['--confirm'], ['--confirm', 'modeling_standard_demo'], ['--confirm', 'modeling_standard']]) {
      const result = await run('staging-reset.ts', args, { MS_STAGING_ENV_FILE: file });
      expect(result.code).toBe(1);
      expect(result.out).toContain(`--confirm ${STAGING_DATABASE}`);
    }
    expect(await projectCount(STAGING_DATABASE)).toBe(before);
  });

  it('the database commands need no Google client or operator key; serving needs both', async () => {
    const dbOnly = envFile(stagingEnv({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', STAGING_OPERATOR_KEY: '', PUBLIC_BASE_URL: '' }));
    const setup = await run('staging-setup.ts', [], { MS_STAGING_ENV_FILE: dbOnly });
    expect(setup.code).toBe(0);
    expect(setup.out).toContain(`Found ${STAGING_DATABASE}`);
    const serve = await run('staging.ts', [], { MS_STAGING_ENV_FILE: dbOnly });
    expect(serve.code).toBe(1);
    expect(serve.out).toMatch(/PUBLIC_BASE_URL: is required on staging/);
    expect(serve.out).toMatch(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: are required/);
    expect(serve.out).toMatch(/STAGING_OPERATOR_KEY: must be/);
    // A half-configured Google client is refused even by the database commands.
    const half = await run('staging-setup.ts', [], { MS_STAGING_ENV_FILE: envFile(stagingEnv({ GOOGLE_CLIENT_SECRET: '' })) });
    expect(half.code).toBe(1);
    expect(half.out).toMatch(/GOOGLE_CLIENT_SECRET: is required/);
  });

  it('a command refuses an env file others can read, without echoing its secrets', async () => {
    const result = await run('staging-setup.ts', [], { MS_STAGING_ENV_FILE: envFile(stagingEnv(), 0o644) });
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/chmod 600/);
    for (const value of [KEY, CLIENT_SECRET]) expect(result.out).not.toContain(value);
  });

  it('starting staging serves the existing data and changes nothing; it answers only the public Host', async () => {
    const port = await freePort();
    const file = envFile(stagingEnv({ PORT: String(port) }));
    const before = await projectCount(STAGING_DATABASE);
    const child = spawn(process.execPath, [join(ROOT, 'src/scripts/staging.ts')], { env: { PATH: process.env.PATH ?? '', MS_STAGING_ENV_FILE: file }, cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    try {
      await new Promise<void>((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`staging did not start: ${out}`)), 15_000);
        const check = () => {
          if (out.includes('Stop it with Ctrl+C')) {
            clearTimeout(timer);
            done();
          } else setTimeout(check, 50);
        };
        check();
      });
      expect(out).toContain('https://staging.example.invalid:8443/');
      for (const value of [KEY, CLIENT_SECRET]) expect(out).not.toContain(value);
      expect(await get(port, 'staging.example.invalid:8443', '/health')).toBe(200);
      expect(await get(port, `127.0.0.1:${port}`, '/health')).toBe(421);
      // Reset refuses while staging is serving, even though an idle server holds no database connection.
      const reset = await run('staging-reset.ts', ['--confirm', STAGING_DATABASE], { MS_STAGING_ENV_FILE: file });
      expect(reset.code).toBe(1);
      expect(reset.out).toContain('stop `npm run staging` first');
    } finally {
      child.kill('SIGINT');
      await new Promise((done) => child.once('close', done));
    }
    expect(await projectCount(STAGING_DATABASE)).toBe(before);
  });

  it('starting staging refuses when the staging database is missing, and creates nothing', async () => {
    await withClient(inject('adminUrl'), (c) => c.query(`DROP DATABASE IF EXISTS ${STAGING_DATABASE} WITH (FORCE)`));
    const result = await run('staging.ts', [], { MS_STAGING_ENV_FILE: envFile(stagingEnv({ PORT: String(await freePort()) })) });
    expect(result.code).toBe(1);
    expect(result.out).toContain('npm run staging:setup');
    expect(await exists(STAGING_DATABASE)).toBe(false);
  });
});
