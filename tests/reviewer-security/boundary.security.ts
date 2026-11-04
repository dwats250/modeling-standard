import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_DATABASE } from '../../src/demo/demo.ts';
import { databaseBoundaryProblems, readDatabaseBoundaryFacts } from '../../src/demo/reviewer-database.ts';
import { REVIEWER_COOKIE } from '../../src/demo/reviewer.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';

/**
 * The reviewer's database boundary and its commands against a real PostgreSQL
 * with real roles, and as real processes. Only for the disposable server from
 * tests/reviewer-security/harness.sh: it refuses to start anywhere else.
 */

const ROOT = resolve(import.meta.dirname, '../..');
const SERVING_PORT = 3141;
const ORIGIN = 'https://review.example.invalid:8443';
const AUTHORITY = 'review.example.invalid:8443';
const WIRE_COOKIE = `__Host-${REVIEWER_COOKIE}`;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run this through tests/reviewer-security/harness.sh`);
  return value;
}
const SUPER_URL = required('REVIEWER_SECURITY_SUPERUSER_URL');
const RUNTIME_ADMIN_URL = required('DATABASE_URL');
const MIGRATION_URL = required('MIGRATION_DATABASE_URL');

const on = (url: string, database: string) => {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
};
const RUNTIME_URL = on(RUNTIME_ADMIN_URL, DEMO_DATABASE);
const secrets = [SUPER_URL, RUNTIME_URL, MIGRATION_URL].map((url) => new URL(url).password);

const work = mkdtempSync(join(tmpdir(), 'ms-reviewer-security-'));
const stateDir = join(work, 'state');
const annotationsOut = join(work, 'annotations-out');
const KEY = newToken().token;
const children: ChildProcess[] = [];

async function asSuper<T>(database: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: on(SUPER_URL, database) });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function envFile(values: Record<string, string>, mode = 0o600): string {
  const file = join(mkdtempSync(join(work, 'env-')), 'file.env');
  writeFileSync(file, `${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n')}\n`);
  chmodSync(file, mode);
  return file;
}

function run(script: string, args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, 'src/scripts', script), ...args], { env: { PATH: process.env.PATH ?? '', ...env }, cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', (code) => done({ code, out }));
  });
}

const bootstrapSettings = (overrides: Record<string, string> = {}) => ({
  DATABASE_URL: RUNTIME_URL,
  MIGRATION_DATABASE_URL: MIGRATION_URL,
  REVIEWER_ANNOTATIONS_OUT_DIR: annotationsOut,
  PORT: String(SERVING_PORT),
  ...overrides,
});
const bootstrap = (settings: Record<string, string> = bootstrapSettings(), args = ['--confirm', DEMO_DATABASE]) =>
  run('demo-reviewer-bootstrap.ts', args, { MS_REVIEWER_BOOTSTRAP_ENV_FILE: envFile(settings) });

const servingSettings = (overrides: Record<string, string> = {}) => ({
  DATABASE_URL: RUNTIME_URL,
  HOST: '127.0.0.1',
  PORT: String(SERVING_PORT),
  LOG_LEVEL: 'warn',
  REVIEWER_PUBLIC_ORIGIN: ORIGIN,
  REVIEWER_ACCESS_KEY: KEY,
  REVIEWER_STATE_DIR: stateDir,
  ...overrides,
});
const serveAndExpectRefusal = (settings: Record<string, string>, env: Record<string, string> = {}) =>
  run('demo-reviewer.ts', [], { MS_REVIEWER_ENV_FILE: envFile(settings), ...env });

/** Starts reviewer mode; resolves once it listens. */
function serve(): Promise<ChildProcess> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(ROOT, 'src/scripts/demo-reviewer.ts')], { env: { PATH: process.env.PATH ?? '', MS_REVIEWER_ENV_FILE: envFile(servingSettings()) }, cwd: ROOT });
    children.push(child);
    let out = '';
    const seen = (d: Buffer) => {
      out += d.toString();
      if (out.includes('listens:')) done(child);
    };
    child.stdout.on('data', seen);
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', (code) => fail(new Error(`reviewer mode exited with ${code}`)));
  });
}
const stop = (child: ChildProcess) =>
  new Promise<void>((done) => {
    child.removeAllListeners('close');
    child.once('close', () => done());
    child.kill('SIGTERM');
  });

interface Res { status: number; location: string | undefined; cookie: string | undefined; body: string }
function call(method: string, path: string, headers: Record<string, string>, body?: string): Promise<Res> {
  return new Promise((done, fail) => {
    const req = httpRequest({ host: '127.0.0.1', port: SERVING_PORT, method, path, headers, setHost: false }, (res) => {
      let text = '';
      res.on('data', (c: Buffer) => (text += c.toString()));
      res.on('end', () => done({ status: res.statusCode ?? 0, location: res.headers.location, cookie: res.headers['set-cookie']?.[0], body: text }));
    });
    req.on('error', fail);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function problemsAs(url: string, prepare?: (client: pg.Client) => Promise<unknown>): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await prepare?.(client);
    return databaseBoundaryProblems(await readDatabaseBoundaryFacts(drizzle({ client })));
  } finally {
    await client.end();
  }
}

const CASE_ROLE = 'rsec_case';
const CASE_PASSWORD = newToken().token.replace(/[^a-zA-Z0-9]/g, 'x');
const CASE_URL = (() => {
  const parsed = new URL(on(RUNTIME_ADMIN_URL, DEMO_DATABASE));
  parsed.username = CASE_ROLE;
  parsed.password = CASE_PASSWORD;
  return parsed.toString();
})();

/** One role, one change, the problems the live check reports, and everything undone. */
async function caseProblems(setup: string[], undo: string[] = []): Promise<string[]> {
  await asSuper(DEMO_DATABASE, (c) => c.query(`create role ${CASE_ROLE} login password '${CASE_PASSWORD}' in role app_runtime`));
  try {
    await asSuper(DEMO_DATABASE, async (c) => {
      for (const statement of setup) await c.query(statement);
    });
    return await problemsAs(CASE_URL);
  } finally {
    await asSuper(DEMO_DATABASE, async (c) => {
      for (const statement of undo) await c.query(statement);
      await c.query(`drop owned by ${CASE_ROLE}`);
      await c.query(`drop role ${CASE_ROLE}`);
    });
  }
}

beforeAll(async () => {
  // Nothing destructive unless this is the harness's own disposable server.
  for (const url of [SUPER_URL, RUNTIME_ADMIN_URL, MIGRATION_URL]) {
    const parsed = new URL(url);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '5471') throw new Error('refusing: not the isolated server on 127.0.0.1:5471');
  }
  const marker = await asSuper('postgres', (c) => c.query(`select 1 from pg_roles where rolname = 'ms_reviewer_security_marker'`));
  if (marker.rowCount !== 1) throw new Error('refusing: this server was not provisioned by the harness');
});

afterAll(async () => {
  for (const child of children) child.kill('SIGKILL');
  rmSync(work, { recursive: true, force: true });
});

describe('reviewer bootstrap: the only path that holds the migration credential', () => {
  it('needs the exact confirmation, and creates nothing without it', async () => {
    for (const args of [[], ['--confirm'], ['--confirm', 'modeling_standard'], ['--confirm', 'modeling_standard_staging']]) {
      const result = await bootstrap(bootstrapSettings(), args);
      expect(result.code).toBe(1);
      expect(result.out).toContain('--confirm modeling_standard_demo');
    }
    const found = await asSuper('postgres', (c) => c.query(`select 1 from pg_database where datname = $1`, [DEMO_DATABASE]));
    expect(found.rowCount).toBe(0);
  });

  it('reads only its own owner-only file, and refuses settings that belong elsewhere', async () => {
    const worldReadable = await run('demo-reviewer-bootstrap.ts', ['--confirm', DEMO_DATABASE], { MS_REVIEWER_BOOTSTRAP_ENV_FILE: envFile(bootstrapSettings(), 0o644) });
    expect(worldReadable.code).toBe(1);
    expect(worldReadable.out).toContain('chmod 600');
    // The environment is not read: these point nowhere usable and the missing file still wins.
    const fromEnvironment = await run('demo-reviewer-bootstrap.ts', ['--confirm', DEMO_DATABASE], { ...bootstrapSettings(), MS_REVIEWER_BOOTSTRAP_ENV_FILE: join(work, 'absent.env') });
    expect(fromEnvironment.code).toBe(1);
    expect(fromEnvironment.out).toContain('not found');
    for (const [setting, value, expected] of [
      ['REVIEWER_ACCESS_KEY', KEY, 'REVIEWER_ACCESS_KEY'],
      ['DATABASE_URL', MIGRATION_URL, 'DATABASE_URL'],
      ['DATABASE_URL', on(RUNTIME_ADMIN_URL, 'modeling_standard_staging'), 'DATABASE_URL'],
      ['MIGRATION_DATABASE_URL', on(MIGRATION_URL, DEMO_DATABASE), 'MIGRATION_DATABASE_URL'],
      ['REVIEWER_ANNOTATIONS_OUT_DIR', join(ROOT, '.demo'), 'REVIEWER_ANNOTATIONS_OUT_DIR'],
    ] as const) {
      const result = await bootstrap(bootstrapSettings({ [setting]: value }));
      expect({ setting, code: result.code }).toEqual({ setting, code: 1 });
      expect(result.out).toContain(expected);
      for (const secret of [...secrets, KEY]) expect(result.out).not.toContain(secret);
    }
    const found = await asSuper('postgres', (c) => c.query(`select 1 from pg_database where datname = $1`, [DEMO_DATABASE]));
    expect(found.rowCount).toBe(0);
  });

  it('prepares the database on the dedicated server and checks the serving boundary', async () => {
    const result = await bootstrap();
    expect({ code: result.code, out: result.out }).toEqual({ code: 0, out: expect.stringMatching(/^Reset modeling_standard_demo with \d+ synthetic projects; the runtime role passes the serving boundary\.\n$/) });
    expect(existsSync(join(annotationsOut, 'annotations.json'))).toBe(true);
    const owner = await asSuper('postgres', (c) => c.query(`select pg_get_userbyid(datdba) as owner from pg_database where datname = $1`, [DEMO_DATABASE]));
    expect(owner.rows[0].owner).toBe('ms_reviewer_migrator');
  });

  it('refuses, and drops nothing, on a server holding another database, while the port is in use, or with a superuser', async () => {
    await asSuper(DEMO_DATABASE, (c) => c.query('create table rsec_keep ()'));
    try {
      await asSuper('postgres', (c) => c.query('create database modeling_standard_staging'));
      try {
        const shared = await bootstrap();
        expect(shared.code).toBe(1);
        expect(shared.out).toContain('modeling_standard_staging');
        expect(shared.out).toContain('dedicated server');
      } finally {
        await asSuper('postgres', (c) => c.query('drop database modeling_standard_staging'));
      }

      const occupied: Server = createServer();
      await new Promise<void>((done) => occupied.listen(SERVING_PORT, '127.0.0.1', done));
      try {
        const busy = await bootstrap();
        expect(busy.code).toBe(1);
        expect(busy.out).toContain('listening');
      } finally {
        await new Promise((done) => occupied.close(done));
      }

      const superuser = await bootstrap(bootstrapSettings({ MIGRATION_DATABASE_URL: SUPER_URL }));
      expect(superuser.code).toBe(1);
      expect(superuser.out).toContain('must not be a superuser');
      const kept = await asSuper(DEMO_DATABASE, (c) => c.query(`select to_regclass('public.rsec_keep') as t`));
      expect(kept.rows[0].t).toBe('rsec_keep');
    } finally {
      await asSuper(DEMO_DATABASE, (c) => c.query('drop table rsec_keep'));
    }
  });
});

describe('the live boundary, against real roles on modeling_standard_demo', () => {
  it('passes the provisioned runtime role, and a fresh role that is only in app_runtime', async () => {
    expect(await problemsAs(RUNTIME_URL)).toEqual([]);
    expect(await caseProblems([])).toEqual([]);
  });

  it('refuses the migration role and a superuser, whatever the URL says', async () => {
    const migrator = await problemsAs(on(MIGRATION_URL, DEMO_DATABASE));
    expect(migrator.join('\n')).toMatch(/CREATEDB/);
    expect(migrator.join('\n')).toMatch(/owns a database/);
    expect(migrator.join('\n')).toMatch(/owns a table/);
    const superuser = await problemsAs(on(SUPER_URL, DEMO_DATABASE));
    expect(superuser.join('\n')).toMatch(/SUPERUSER/);
  });

  it('refuses a role switched by SET ROLE, and any other database', async () => {
    expect((await problemsAs(RUNTIME_URL, (c) => c.query('set role app_runtime'))).join('\n')).toMatch(/switched role/);
    await asSuper('postgres', (c) => c.query('create database rsec_other'));
    try {
      const problems = await problemsAs(on(RUNTIME_ADMIN_URL, 'rsec_other'));
      expect(problems.join('\n')).toMatch(/^database: connected to a database other than modeling_standard_demo/);
    } finally {
      await asSuper('postgres', (c) => c.query('drop database rsec_other'));
    }
  });

  const cases: readonly { name: string; setup: string[]; undo?: string[]; expected: RegExp }[] = [
    { name: 'SUPERUSER', setup: [`alter role ${CASE_ROLE} superuser`], expected: /SUPERUSER/ },
    { name: 'CREATEDB', setup: [`alter role ${CASE_ROLE} createdb`], expected: /CREATEDB/ },
    { name: 'CREATEROLE', setup: [`alter role ${CASE_ROLE} createrole`], expected: /CREATEROLE/ },
    { name: 'BYPASSRLS', setup: [`alter role ${CASE_ROLE} bypassrls`], expected: /BYPASSRLS/ },
    { name: 'REPLICATION', setup: [`alter role ${CASE_ROLE} replication`], expected: /REPLICATION/ },
    { name: 'an elevated role it can become', setup: ['create role rsec_up nologin superuser', `grant rsec_up to ${CASE_ROLE}`], undo: ['drop role rsec_up'], expected: /SUPERUSER/ },
    { name: 'a predefined read-everything role', setup: [`grant pg_read_all_data to ${CASE_ROLE}`], expected: /member of a role other than app_runtime \(pg_read_all_data\)/ },
    { name: 'a predefined server-program role', setup: [`grant pg_execute_server_program to ${CASE_ROLE}`], expected: /pg_execute_server_program/ },
    // CONNECT comes from app_runtime (migration 0002), so these two need it directly to get as far as being asked.
    { name: 'no app_runtime membership', setup: [`revoke app_runtime from ${CASE_ROLE}`, `grant connect on database ${DEMO_DATABASE} to ${CASE_ROLE}`], undo: [`revoke connect on database ${DEMO_DATABASE} from ${CASE_ROLE}`], expected: /does not inherit app_runtime/ },
    { name: 'app_runtime without inherit', setup: [`revoke app_runtime from ${CASE_ROLE}`, `grant app_runtime to ${CASE_ROLE} with inherit false`, `grant connect on database ${DEMO_DATABASE} to ${CASE_ROLE}`], undo: [`revoke connect on database ${DEMO_DATABASE} from ${CASE_ROLE}`], expected: /does not inherit app_runtime/ },
    { name: 'app_runtime with admin option', setup: [`grant app_runtime to ${CASE_ROLE} with admin option`], expected: /admin option/ },
    { name: 'database owner', setup: [`alter database ${DEMO_DATABASE} owner to ${CASE_ROLE}`], undo: [`alter database ${DEMO_DATABASE} owner to ms_reviewer_migrator`], expected: /owns a database/ },
    { name: 'schema owner', setup: [`create schema rsec_s authorization ${CASE_ROLE}`], undo: ['drop schema rsec_s cascade'], expected: /owns a schema/ },
    { name: 'table owner', setup: ['create table public.rsec_t ()', `alter table public.rsec_t owner to ${CASE_ROLE}`], undo: ['drop table public.rsec_t'], expected: /owns a table/ },
    { name: 'owner of something else', setup: ['create type public.rsec_e as enum (\'x\')', `alter type public.rsec_e owner to ${CASE_ROLE}`], undo: ['drop type public.rsec_e'], expected: /owns database objects/ },
    { name: 'CREATE on the database', setup: [`grant create on database ${DEMO_DATABASE} to ${CASE_ROLE}`], undo: [`revoke create on database ${DEMO_DATABASE} from ${CASE_ROLE}`], expected: /may create schemas/ },
    { name: 'TEMPORARY on the database', setup: [`grant temporary on database ${DEMO_DATABASE} to ${CASE_ROLE}`], undo: [`revoke temporary on database ${DEMO_DATABASE} from ${CASE_ROLE}`], expected: /temporary tables/ },
    { name: 'CREATE on a schema', setup: [`grant create on schema public to ${CASE_ROLE}`], undo: [`revoke create on schema public from ${CASE_ROLE}`], expected: /may create objects/ },
    { name: 'CONNECT elsewhere', setup: [`grant connect on database postgres to ${CASE_ROLE}`], undo: [`revoke connect on database postgres from ${CASE_ROLE}`], expected: /may connect to other databases \(postgres\)/ },
    { name: 'a direct extra table grant', setup: [`grant truncate on public.contract to ${CASE_ROLE}`], undo: [`revoke truncate on public.contract from ${CASE_ROLE}`], expected: /holds .*TRUNCATE.* on public\.contract/ },
    { name: 'an extra grant to the group', setup: ['grant delete on public.contract to app_runtime'], undo: ['revoke delete on public.contract from app_runtime'], expected: /holds DELETE.* on public\.contract/ },
    { name: 'an extra grant to PUBLIC', setup: ['grant update on public.contract_signature to public'], undo: ['revoke update on public.contract_signature from public'], expected: /public\.contract_signature/ },
    { name: 'a column update grant', setup: [`grant update (id) on public.contract to ${CASE_ROLE}`], undo: [`revoke update (id) on public.contract from ${CASE_ROLE}`], expected: /column UPDATE state on public\.contract/ },
    { name: 'a table it should not reach', setup: ['create table public.rsec_x ()', `grant select on public.rsec_x to ${CASE_ROLE}`], undo: ['drop table public.rsec_x'], expected: /unexpected table \(public\.rsec_x\)/ },
    { name: 'a sequence grant', setup: ['create sequence public.rsec_q', `grant usage on public.rsec_q to ${CASE_ROLE}`], undo: ['drop sequence public.rsec_q'], expected: /sequence/ },
  ];
  for (const { name, setup, undo, expected } of cases) {
    it(`refuses: ${name}`, async () => {
      const problems = await caseProblems(setup, undo);
      expect(problems.join('\n')).toMatch(expected);
    });
  }
});

describe('the serving process', () => {
  it('will not start with a state directory it should not trust', async () => {
    const missing = await serveAndExpectRefusal(servingSettings());
    expect(missing.code).toBe(1);
    expect(missing.out).toContain('REVIEWER_STATE_DIR: does not exist');
    const inRepository = await serveAndExpectRefusal(servingSettings({ REVIEWER_STATE_DIR: join(ROOT, '.demo') }));
    expect(inRepository.code).toBe(1);
    expect(inRepository.out).toContain('outside the repository');
  });

  it('refuses the migration credential, in its file or inherited, and any elevated role, before listening', async () => {
    // As the runbook does: the serving directory gets the annotation file, and only that.
    mkdirSync(stateDir, { mode: 0o700 });
    copyFileSync(join(annotationsOut, 'annotations.json'), join(stateDir, 'annotations.json'));
    const attempts: readonly [string, Promise<{ code: number | null; out: string }>, string][] = [
      ['in the env file', serveAndExpectRefusal(servingSettings({ MIGRATION_DATABASE_URL: MIGRATION_URL })), 'MIGRATION_DATABASE_URL'],
      ['inherited', serveAndExpectRefusal(servingSettings(), { MIGRATION_DATABASE_URL: MIGRATION_URL }), 'MIGRATION_DATABASE_URL'],
      ['inherited PG setting', serveAndExpectRefusal(servingSettings(), { PGPASSWORD: 'x' }), 'PGPASSWORD'],
      ['migrator as DATABASE_URL', serveAndExpectRefusal(servingSettings({ DATABASE_URL: on(MIGRATION_URL, DEMO_DATABASE) })), 'owns a database'],
      ['superuser as DATABASE_URL', serveAndExpectRefusal(servingSettings({ DATABASE_URL: on(SUPER_URL, DEMO_DATABASE) })), 'SUPERUSER'],
      ['another database named', serveAndExpectRefusal(servingSettings({ DATABASE_URL: on(RUNTIME_ADMIN_URL, 'modeling_standard') })), 'DATABASE_URL'],
    ];
    for (const [label, attempt, expected] of attempts) {
      const result = await attempt;
      expect({ label, code: result.code }).toEqual({ label, code: 1 });
      expect(result.out).toContain(expected);
      for (const secret of [...secrets, KEY]) expect(result.out).not.toContain(secret);
    }
  });

  it('serves as the runtime role behind the gate; a restart ends the session', async () => {
    let child = await serve();
    try {
      const headers = { host: AUTHORITY };
      expect((await call('GET', '/', { host: `127.0.0.1:${SERVING_PORT}` })).status).toBe(421);
      expect((await call('GET', '/', headers)).location).toBe('/reviewer');
      expect((await call('GET', '/demo/projects', headers)).status).toBe(401);
      const form = new URLSearchParams({ key: KEY }).toString();
      const signIn = await call('POST', '/reviewer/sign-in', { ...headers, origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(form.length) }, form);
      expect(signIn.status).toBe(303);
      const cookie = signIn.cookie!.split(';')[0]!;
      expect(cookie.startsWith(`${WIRE_COOKIE}=`)).toBe(true);
      // The demo reads its annotations from the state directory, and its database as the runtime role.
      const annotations = await call('GET', '/annotations.json', { ...headers, cookie });
      expect(Object.keys((JSON.parse(annotations.body) as { projects: object }).projects).length).toBeGreaterThan(0);
      expect((await call('GET', '/demo/environment', { ...headers, cookie })).status).toBe(200);
      await stop(child);
      child = await serve();
      expect((await call('GET', '/demo/environment', { ...headers, cookie })).status).toBe(401);
    } finally {
      await stop(child);
    }
  });
});
