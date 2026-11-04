import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config/config.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { RUNTIME_COLUMN_UPDATABLE, RUNTIME_TABLE_PRIVILEGES, databaseBoundaryProblems, type DatabaseBoundaryFacts } from '../../src/demo/reviewer-database.ts';
import { applyReviewerServerLimits, assertReviewerStateDir, inheritedEnvironmentProblems, loadReviewerConfig, parseExactHttpsOrigin } from '../../src/demo/reviewer.ts';
import { loadReviewerBootstrapConfig } from '../../src/demo/reviewer-bootstrap.ts';

/**
 * Reviewer mode's configuration fails closed: every setting that matters is
 * exact and required, anything that would make it staging or production is
 * refused, and no message echoes a value.
 */

const KEY = newToken().token;
const DB = 'postgres://ms_runtime:Secret-42@127.0.0.1:5461/modeling_standard_demo';
const work = mkdtempSync(join(tmpdir(), 'ms-reviewer-config-'));
const STATE_DIR = '/var/lib/ms-reviewer';
afterAll(() => rmSync(work, { recursive: true, force: true }));

function good(): Record<string, string> {
  return { DATABASE_URL: DB, REVIEWER_PUBLIC_ORIGIN: 'https://review.example.ts.net:8444', REVIEWER_ACCESS_KEY: KEY, HOST: '127.0.0.1', PORT: '3140', REVIEWER_STATE_DIR: STATE_DIR };
}

function problemsOf(env: Record<string, string | undefined>): readonly string[] {
  try {
    loadReviewerConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems;
  }
  throw new Error('expected a ConfigError');
}

describe('reviewer configuration', () => {
  it('accepts a complete configuration: exact origin, authority as the browser sends it, default session length', () => {
    const config = loadReviewerConfig(good());
    expect(config.publicOrigin).toBe('https://review.example.ts.net:8444');
    expect(config.publicAuthority).toBe('review.example.ts.net:8444');
    expect(config.accessKey).toBe(KEY);
    expect(config.sessionSeconds).toBe(4 * 60 * 60);
    expect(config.app.port).toBe(3140);
    expect(config.app.google).toBeNull();
    expect(config.stateDir).toBe(STATE_DIR);
    // A default-port origin has no port in its authority, as the browser spells Host.
    expect(loadReviewerConfig({ ...good(), REVIEWER_PUBLIC_ORIGIN: 'https://review.example.ts.net' }).publicAuthority).toBe('review.example.ts.net');
    expect(loadReviewerConfig({ ...good(), REVIEWER_PUBLIC_ORIGIN: 'https://review.example.ts.net/' }).publicOrigin).toBe('https://review.example.ts.net');
    expect(loadReviewerConfig({ ...good(), REVIEWER_SESSION_SECONDS: '600' }).sessionSeconds).toBe(600);
  });

  it('refuses every origin that is not exactly one https origin', () => {
    const bad = [
      undefined,
      '',
      'http://review.example.ts.net:8444',
      'review.example.ts.net:8444',
      'https://review.example.ts.net:8444/demo',
      'https://review.example.ts.net:8444?x=1',
      'https://review.example.ts.net:8444#x',
      'https://u:p@review.example.ts.net:8444',
      'https://*.example.ts.net',
      'https://review.example.ts.net:8444, https://other.example',
      'https://review.example.ts.net:8444 ',
      'https://REVIEW.example.ts.net:08444',
      'https://review.example.ts.net:99999',
      'https://',
      'javascript:alert(1)',
      'ftp://review.example.ts.net',
    ];
    for (const origin of bad) {
      const problems = problemsOf({ ...good(), REVIEWER_PUBLIC_ORIGIN: origin });
      expect({ origin, problems: problems.map((p) => p.split(':')[0]) }).toEqual({ origin, problems: ['REVIEWER_PUBLIC_ORIGIN'] });
    }
    expect(parseExactHttpsOrigin('https://[::1]:8444')).toEqual({ publicOrigin: 'https://[::1]:8444', publicAuthority: '[::1]:8444' });
  });

  it('refuses a missing, short, padded, patterned or non-canonical access key, without echoing it', () => {
    for (const key of [undefined, '', 'reviewer', 'a'.repeat(43), `${KEY}=`, KEY.slice(0, 42), `${KEY}x`, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'abababababababababababababababababababababa']) {
      const problems = problemsOf({ ...good(), REVIEWER_ACCESS_KEY: key });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^REVIEWER_ACCESS_KEY: /);
      if (key) expect(problems[0]).not.toContain(key);
    }
  });

  it('refuses anything that would make it staging or production', () => {
    const expectOnly = (env: Record<string, string | undefined>, setting: string) => {
      const problems = problemsOf(env);
      expect(problems.map((p) => p.split(':')[0])).toEqual([setting]);
      expect(problems.join(' ')).not.toContain('Secret-42');
    };
    // A Google client needs PUBLIC_BASE_URL to be a valid app configuration at all; reviewer mode refuses both.
    const google = problemsOf({ ...good(), GOOGLE_CLIENT_ID: '1234-abcd.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GOCSPX-abcdefghijklmnop', PUBLIC_BASE_URL: 'https://review.example.ts.net:8444' });
    expect(google.map((p) => p.split(':')[0]).sort()).toEqual(['GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET', 'PUBLIC_BASE_URL']);
    expect(google.join(' ')).not.toContain('GOCSPX');
    expectOnly({ ...good(), PUBLIC_BASE_URL: 'https://review.example.ts.net:8444' }, 'PUBLIC_BASE_URL');
    expectOnly({ ...good(), MIGRATION_DATABASE_URL: 'postgres://ms_migrator:Secret-42@127.0.0.1:5461/modeling_standard' }, 'MIGRATION_DATABASE_URL');
    expectOnly({ ...good(), STAGING_OPERATOR_KEY: newToken().token }, 'STAGING_OPERATOR_KEY');
    expectOnly({ ...good(), DATABASE_URL: 'postgres://ms_runtime:Secret-42@127.0.0.1:5461/modeling_standard_staging' }, 'DATABASE_URL');
    expectOnly({ ...good(), DATABASE_URL: 'postgres://ms_runtime:Secret-42@127.0.0.1:5461/modeling_standard' }, 'DATABASE_URL');
    expectOnly({ ...good(), DATABASE_URL: `${DB}?options=-c%20role%3Dpostgres` }, 'DATABASE_URL');
    expectOnly({ ...good(), DATABASE_URL: `${DB}?host=10.0.0.1` }, 'DATABASE_URL');
    for (const dir of [undefined, '', '.demo', 'relative/state', '/var/lib/../lib/ms', '/var/lib/ms/', resolve('.demo'), resolve('.')]) {
      expectOnly({ ...good(), REVIEWER_STATE_DIR: dir }, 'REVIEWER_STATE_DIR');
    }
    expectOnly({ ...good(), HOST: '0.0.0.0' }, 'HOST');
    expectOnly({ ...good(), HOST: '100.64.0.7' }, 'HOST');
    for (const seconds of ['0', '59', '43201', '-5', '1e3', 'ten', '3600.5']) expectOnly({ ...good(), REVIEWER_SESSION_SECONDS: seconds }, 'REVIEWER_SESSION_SECONDS');
  });

  it('reports every problem at once and never a value', () => {
    const problems = problemsOf({ DATABASE_URL: 'not a url Secret-42', REVIEWER_PUBLIC_ORIGIN: 'http://x', REVIEWER_ACCESS_KEY: 'short-Secret-42' });
    expect(problems.map((p) => p.split(':')[0]).sort()).toEqual(['DATABASE_URL', 'REVIEWER_ACCESS_KEY', 'REVIEWER_PUBLIC_ORIGIN', 'REVIEWER_STATE_DIR']);
    expect(problems.join(' ')).not.toContain('Secret-42');
  });
});

describe('the serving process\'s environment and writable path', () => {
  it('refuses inherited database and credential variables, naming them and not their values', () => {
    expect(inheritedEnvironmentProblems({ PATH: '/usr/bin', HOME: '/x', MS_REVIEWER_ENV_FILE: '/x', npm_lifecycle_event: 'demo:reviewer', DATABASE_URL: '' })).toEqual([]);
    const names = ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'POSTGRES_PASSWORD', 'REVIEWER_ACCESS_KEY', 'STAGING_OPERATOR_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PGPASSWORD', 'PGUSER', 'PGHOST', 'PGOPTIONS', 'PGPASSFILE', 'PGSERVICE'];
    for (const name of names) {
      const problems = inheritedEnvironmentProblems({ [name]: 'Secret-42' });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(new RegExp(`^${name}: `));
      expect(problems[0]).not.toContain('Secret-42');
    }
  });

  it('accepts only an owner-only real directory outside the repository', () => {
    const good = join(work, 'state');
    mkdirSync(good, { mode: 0o700 });
    expect(() => assertReviewerStateDir(good)).not.toThrow();
    const refused = (path: string, reason: RegExp) => expect(() => assertReviewerStateDir(path)).toThrow(reason);
    refused(join(work, 'absent'), /does not exist/);
    const file = join(work, 'a-file');
    writeFileSync(file, '');
    refused(file, /must be a directory/);
    const link = join(work, 'a-link');
    symlinkSync(good, link);
    refused(link, /must be a directory/);
    const open = join(work, 'open');
    mkdirSync(open);
    chmodSync(open, 0o750);
    refused(open, /chmod 700/);
    // Through a symlinked parent, into the repository: resolved before it is judged.
    mkdirSync(resolve('test-results'), { recursive: true });
    const inRepository = mkdtempSync(resolve('test-results/reviewer-state-'));
    try {
      mkdirSync(join(inRepository, 'state'), { mode: 0o700 });
      const via = join(work, 'via');
      symlinkSync(inRepository, via);
      refused(join(via, 'state'), /outside the repository/);
    } finally {
      rmSync(inRepository, { recursive: true, force: true });
    }
  });

  it('bounds connections and slow requests on the server it is given', () => {
    const server = createServer();
    applyReviewerServerLimits(server);
    expect({ max: server.maxConnections, headers: server.headersTimeout, request: server.requestTimeout, idle: server.keepAliveTimeout, perSocket: server.maxRequestsPerSocket }).toEqual({
      max: 128,
      headers: 10_000,
      request: 30_000,
      idle: 5_000,
      perSocket: 1_000,
    });
  });
});

describe('the database boundary decision', () => {
  const clean: DatabaseBoundaryFacts = {
    database: 'modeling_standard_demo',
    currentUser: 'ms_reviewer_runtime',
    sessionUser: 'ms_reviewer_runtime',
    memberOf: ['app_runtime'],
    inheritsRuntimeGroup: true,
    administersRuntimeGroup: false,
    attributes: [],
    ownsADatabase: false,
    ownedSchemas: 0,
    ownedTables: 0,
    ownedObjects: 0,
    canCreateInDatabase: false,
    schemasWithCreate: 0,
    otherConnectableDatabases: [],
    tables: Object.entries(RUNTIME_TABLE_PRIVILEGES).map(([name, privileges]) => ({ name, privileges, columnUpdate: RUNTIME_COLUMN_UPDATABLE.includes(name), columnReferences: false })),
    sequences: 0,
  };
  const tables = (change: (name: string) => Partial<DatabaseBoundaryFacts['tables'][number]>) => clean.tables.map((table) => ({ ...table, ...change(table.name) }));

  it('passes only the exact least-privilege facts', () => {
    expect(databaseBoundaryProblems(clean)).toEqual([]);
  });

  it('refuses each departure, each with its own reason', () => {
    const cases: readonly [Partial<DatabaseBoundaryFacts>, RegExp][] = [
      [{ database: 'modeling_standard' }, /^database: /],
      [{ database: 'modeling_standard_demo_copy' }, /^database: /],
      [{ currentUser: 'app_runtime' }, /switched role/],
      [{ attributes: ['SUPERUSER'] }, /SUPERUSER/],
      [{ attributes: ['CREATEDB'] }, /CREATEDB/],
      [{ attributes: ['CREATEROLE'] }, /CREATEROLE/],
      [{ attributes: ['BYPASSRLS'] }, /BYPASSRLS/],
      [{ memberOf: ['app_runtime', 'pg_read_all_data'] }, /other than app_runtime \(pg_read_all_data\)/],
      [{ inheritsRuntimeGroup: false }, /does not inherit/],
      [{ administersRuntimeGroup: true }, /admin option/],
      [{ ownsADatabase: true }, /owns a database/],
      [{ ownedSchemas: 1 }, /owns a schema/],
      [{ ownedTables: 1 }, /owns a table/],
      [{ ownedObjects: 1 }, /owns database objects/],
      [{ canCreateInDatabase: true }, /may create schemas/],
      [{ schemasWithCreate: 1 }, /may create objects/],
      [{ otherConnectableDatabases: ['modeling_standard_staging'] }, /may connect to other databases \(modeling_standard_staging\)/],
      [{ sequences: 1 }, /sequence/],
      [{ tables: clean.tables.slice(1) }, /is missing/],
      [{ tables: [...clean.tables, { name: 'public.other', privileges: ['SELECT'], columnUpdate: false, columnReferences: false }] }, /unexpected table/],
      [{ tables: tables((name) => (name === 'public.contract' ? { privileges: ['DELETE', 'INSERT', 'SELECT'] } : {})) }, /holds DELETE, INSERT, SELECT on public\.contract/],
      [{ tables: tables((name) => (name === 'public.project' ? { privileges: ['SELECT'] } : {})) }, /holds SELECT on public\.project/],
      [{ tables: tables((name) => (name === 'public.contract' ? { columnUpdate: true } : {})) }, /column UPDATE state/],
      [{ tables: tables((name) => (name === 'public.brief_item' ? { columnUpdate: false } : {})) }, /column UPDATE state/],
      [{ tables: tables((name) => (name === 'public.project' ? { columnReferences: true } : {})) }, /REFERENCES/],
    ];
    for (const [change, reason] of cases) {
      const problems = databaseBoundaryProblems({ ...clean, ...change });
      expect({ change, joined: problems.join('\n') }).toEqual({ change, joined: expect.stringMatching(reason) });
    }
  });
});

describe('the bootstrap configuration', () => {
  const MIGRATION = 'postgres://ms_migrator:Secret-42@127.0.0.1:5461/ms_reviewer_admin';
  const settings = (over: Record<string, string | undefined> = {}) => ({ DATABASE_URL: DB, MIGRATION_DATABASE_URL: MIGRATION, REVIEWER_ANNOTATIONS_OUT_DIR: join(work, 'out'), PORT: '3140', ...over });
  const refused = (over: Record<string, string | undefined>, setting: string) => {
    let message = '';
    try {
      loadReviewerBootstrapConfig(settings(over));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      message = (error as ConfigError).problems.join('\n');
    }
    expect(message).toContain(setting);
    expect(message).not.toContain('Secret-42');
  };

  it('takes a separate runtime and migration role on one loopback server', () => {
    expect(loadReviewerBootstrapConfig(settings())).toMatchObject({ databaseUrl: DB, migrationDatabaseUrl: MIGRATION, servingPort: 3140 });
    refused({ DATABASE_URL: 'postgres://ms_migrator:Secret-42@127.0.0.1:5461/modeling_standard_demo' }, 'must be different roles');
    refused({ MIGRATION_DATABASE_URL: 'postgres://ms_migrator:Secret-42@127.0.0.1:5999/ms_reviewer_admin' }, 'must be the same server');
    refused({ MIGRATION_DATABASE_URL: 'postgres://ms_migrator:Secret-42@10.0.0.1:5461/ms_reviewer_admin' }, 'MIGRATION_DATABASE_URL');
    refused({ MIGRATION_DATABASE_URL: 'postgres://ms_migrator:Secret-42@127.0.0.1:5461/modeling_standard_demo' }, 'own database');
    refused({ DATABASE_URL: 'postgres://ms_runtime:Secret-42@127.0.0.1:5461/modeling_standard' }, 'DATABASE_URL');
  });

  it('refuses serving and unrelated secrets, and a path or port it cannot rely on', () => {
    for (const name of ['REVIEWER_ACCESS_KEY', 'REVIEWER_PUBLIC_ORIGIN', 'STAGING_OPERATOR_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PUBLIC_BASE_URL']) refused({ [name]: 'Secret-42' }, name);
    for (const dir of [undefined, '', '.demo', resolve('.demo')]) refused({ REVIEWER_ANNOTATIONS_OUT_DIR: dir }, 'REVIEWER_ANNOTATIONS_OUT_DIR');
    for (const port of [undefined, '', '0', '70000', 'x']) refused({ PORT: port }, 'PORT');
  });
});
