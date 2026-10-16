import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { migrationsFolder, runMigrations } from '../../src/infrastructure/database/migrate.ts';
import { createScratchDatabase, journal, migrateThrough, type ScratchDatabase } from '../support/migration-boundary.ts';
import { CHECK_VIOLATION, withClient } from '../support/sql.ts';

/**
 * Populated upgrades across the Stage 1 migration seams, against real
 * PostgreSQL. Each case puts a scratch database at a historical boundary
 * with the repository's own migration files, writes rows the schema at that
 * boundary accepts, upgrades, and checks that the rows and the database's
 * protections survived. These are migration-preservation checks only: the
 * rows mean nothing as product data.
 */

const T0006 = '0006_pairwise_agreement_runtime_grants';
const T0011 = '0011_term_affirmation';
const T0012 = '0012_term_affirmation_rules_and_grants';
const T0013 = '0013_affirmation_read_committed_only';
const T0014 = '0014_agreement_version_fk_name';
const T0016 = '0016_account_party_binding_stamps_and_grants';
const T0018 = '0018_direct_invitation_stamp_and_grants';

const ROW_TABLES = [
  'project',
  'project_party',
  'pairwise_agreement',
  'agreement_term',
  'universal_term',
  'agreement_version',
  'agreement_version_term',
  'universal_version',
  'universal_version_term',
  'agreement_affirmation',
  'universal_affirmation',
  'account',
  'party_account_binding',
  'direct_invitation',
  'live_brief',
  'brief_item',
] as const;

/** Tables that exist from their slice onward and survive S08. */
const SURVIVING_TABLES = ['project', 'project_party', 'pairwise_agreement', 'account', 'party_account_binding', 'direct_invitation'] as const;
/** The S03–S05 tables S08 retires. */
const RETIRED_TABLES = [
  'agreement_term',
  'universal_term',
  'agreement_version',
  'agreement_version_term',
  'universal_version',
  'universal_version_term',
  'agreement_affirmation',
  'universal_affirmation',
] as const;
const RETIRED_FUNCTIONS = [
  'agreement_affirmation_stamp',
  'universal_affirmation_stamp',
  'agreement_version_term_check_copy',
  'universal_version_term_check_copy',
  'agreement_version_check_sealed',
  'universal_version_check_sealed',
  'agreement_version_stamp',
  'universal_version_stamp',
] as const;

/** Only the rows of tables that survive S08, optionally only those present in `reference`. */
function surviving(rows: Record<string, unknown[]>, reference?: Record<string, unknown[]>): Record<string, unknown[]> {
  return Object.fromEntries(
    Object.entries(rows).filter(
      ([table]) => (SURVIVING_TABLES as readonly string[]).includes(table) && (reference === undefined || table in reference),
    ),
  );
}

const STAMP_FUNCTIONS = ['agreement_affirmation_stamp', 'universal_affirmation_stamp'] as const;
const PINNED_SEARCH_PATH = ['search_path=pg_catalog, public, pg_temp'];
const TRUNCATED_FK = 'agreement_version_pairwise_agreement_id_pairwise_agreement_id_f';
const UPGRADE_TIMEOUT = 90_000;

async function inScratch<T>(fn: (db: ScratchDatabase) => Promise<T>): Promise<T> {
  const db = await createScratchDatabase();
  try {
    return await fn(db);
  } finally {
    await db.drop();
  }
}

const asRuntime = <T>(db: ScratchDatabase, fn: (c: pg.Client) => Promise<T>) => withClient(db.runtimeUrl, fn);
const asOwner = <T>(db: ScratchDatabase, fn: (c: pg.Client) => Promise<T>) => withClient(db.migrationUrl, fn);

// ---- Facts read from a database ----

/** Every row of every product table that exists, as stored, keyed by table. */
async function rowsOf(c: pg.Client): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of ROW_TABLES) {
    const exists = await c.query<{ r: string | null }>('select to_regclass($1)::text as r', [`public.${table}`]);
    if (exists.rows[0]!.r === null) continue;
    const { rows } = await c.query<{ rows: unknown[] | null }>(`select json_agg(t order by t.id) as rows from public.${table} t`);
    out[table] = rows[0]!.rows ?? [];
  }
  return out;
}

/** Drizzle's migration bookkeeping. */
async function bookkeeping(c: pg.Client): Promise<{ id: number; hash: string; created_at: string }[]> {
  const { rows } = await c.query<{ id: number; hash: string; created_at: string }>(
    'select id, hash, created_at::text as created_at from drizzle.__drizzle_migrations order by id',
  );
  return rows;
}

/** What the bookkeeping must be after migrating through journal entry `count - 1`. */
function expectedBookkeeping(count: number): { hash: string; created_at: string }[] {
  return journal()
    .entries.slice(0, count)
    .map((entry) => ({
      hash: createHash('sha256').update(readFileSync(join(migrationsFolder, `${entry.tag}.sql`))).digest('hex'),
      created_at: String(entry.when),
    }));
}

/**
 * The catalog facts an upgrade must reproduce: columns, constraints, triggers,
 * function settings and PUBLIC execute, and table privileges for the runtime
 * group and PUBLIC. Compared between an upgraded database and a freshly
 * migrated one, so nothing here is a hand-written snapshot.
 */
async function catalog(c: pg.Client): Promise<Record<string, unknown[]>> {
  const q = async (text: string): Promise<unknown[]> => (await c.query<Record<string, unknown>>(text)).rows;
  return {
    columns: await q(`select table_name, column_name, data_type, is_nullable, column_default
                        from information_schema.columns where table_schema = 'public' order by 1, 2`),
    constraints: await q(`select conrelid::regclass::text as rel, conname, pg_get_constraintdef(oid) as def,
                                 convalidated, condeferrable, condeferred
                            from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    triggers: await q(`select tgrelid::regclass::text as rel, tgname, tgfoid::regprocedure::text as fn,
                              tgenabled, tgdeferrable, tginitdeferred
                         from pg_trigger t join pg_class r on r.oid = t.tgrelid
                        where r.relnamespace = 'public'::regnamespace and not t.tgisinternal order by 1, 2`),
    functions: await q(`select proname, proconfig, has_function_privilege('public', oid, 'EXECUTE') as public_execute
                          from pg_proc where pronamespace = 'public'::regnamespace order by 1`),
    privileges: await q(`select c.relname,
                                coalesce((select string_agg(a.privilege_type, ',' order by a.privilege_type)
                                            from aclexplode(c.relacl) a where a.grantee = 'app_runtime'::regrole), '') as runtime,
                                coalesce((select string_agg(a.privilege_type, ',' order by a.privilege_type)
                                            from aclexplode(c.relacl) a where a.grantee = 0), '') as public
                           from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`),
  };
}

async function freshCatalog(): Promise<Record<string, unknown[]>> {
  // The suite's own database, migrated from empty by the production path in global setup.
  return withClient(inject('migrationUrl'), catalog);
}

async function runtimePrivileges(c: pg.Client, table: string): Promise<string[]> {
  const { rows } = await c.query<{ p: string }>(
    `select a.privilege_type as p from pg_class c, aclexplode(c.relacl) a
      where c.oid = $1::regclass and a.grantee = 'app_runtime'::regrole order by 1`,
    [`public.${table}`],
  );
  return rows.map((r) => r.p);
}

interface StampFunctionFacts {
  readonly name: string;
  readonly oid: number;
  readonly config: string[] | null;
  readonly acl: string | null;
  readonly publicExecute: boolean;
  readonly triggers: { rel: string; tgname: string; tgfoid: number; enabled: string }[];
}

async function stampFunctions(c: pg.Client): Promise<StampFunctionFacts[]> {
  const facts: StampFunctionFacts[] = [];
  for (const name of STAMP_FUNCTIONS) {
    const fn = await c.query<{ oid: number; config: string[] | null; acl: string | null; public_execute: boolean }>(
      `select oid::int as oid, proconfig as config, proacl::text as acl,
              has_function_privilege('public', oid, 'EXECUTE') as public_execute
         from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`,
      [name],
    );
    const row = fn.rows[0]!;
    const triggers = await c.query<{ rel: string; tgname: string; tgfoid: number; enabled: string }>(
      `select tgrelid::regclass::text as rel, tgname, tgfoid::int as tgfoid, tgenabled as enabled
         from pg_trigger where tgfoid = $1 order by 1, 2`,
      [row.oid],
    );
    facts.push({ name, oid: row.oid, config: row.config, acl: row.acl, publicExecute: row.public_execute, triggers: triggers.rows });
  }
  return facts;
}

// ---- Population (legitimate rows for the schema at each boundary) ----

interface S01S02 {
  readonly projectId: string;
  readonly partyIds: [string, string];
  readonly agreementId: string;
  /** The pair as stored: canonical order. */
  readonly pair: [string, string];
}

async function populateS01S02(c: pg.Client): Promise<S01S02> {
  const project = await c.query<{ id: string }>(`insert into project (created_by_principal_id) values ('upgrade-test-creator') returning id`);
  const projectId = project.rows[0]!.id;
  const one = await c.query<{ id: string }>('insert into project_party (project_id) values ($1) returning id', [projectId]);
  const two = await c.query<{ id: string }>('insert into project_party (project_id) values ($1) returning id', [projectId]);
  const partyIds: [string, string] = [one.rows[0]!.id, two.rows[0]!.id];
  const agreement = await c.query<{ id: string; party_one_id: string; party_two_id: string }>(
    `insert into pairwise_agreement (project_id, party_one_id, party_two_id)
     values ($1, least($2::uuid, $3::uuid), greatest($2::uuid, $3::uuid)) returning id, party_one_id, party_two_id`,
    [projectId, partyIds[0], partyIds[1]],
  );
  const a = agreement.rows[0]!;
  return { projectId, partyIds, agreementId: a.id, pair: [a.party_one_id, a.party_two_id] };
}

interface S03S04 extends S01S02 {
  readonly agreementVersionId: string;
  readonly agreementPresentedTermIds: string[];
  readonly universalVersionId: string;
  readonly universalPresentedTermIds: string[];
}

/** S01–S04 rows: source terms in both layers, and one sealed version 1 of each, presented in one transaction. */
async function populateThroughS04(c: pg.Client): Promise<S03S04> {
  const base = await populateS01S02(c);
  await c.query(`insert into agreement_term (pairwise_agreement_id, position, content) values ($1, 1, '[upgrade] pairwise one'), ($1, 2, '[upgrade] pairwise two')`, [base.agreementId]);
  await c.query(`insert into universal_term (project_id, position, content) values ($1, 1, '[upgrade] universal one'), ($1, 2, '[upgrade] universal two')`, [base.projectId]);

  await c.query('begin');
  const av = await c.query<{ id: string }>('insert into agreement_version (pairwise_agreement_id, sequence, term_count) values ($1, 1, 2) returning id', [base.agreementId]);
  const avt = await c.query<{ id: string }>(
    `insert into agreement_version_term (pairwise_agreement_id, agreement_version_id, agreement_term_id, position, content)
     select pairwise_agreement_id, $2, id, position, content from agreement_term where pairwise_agreement_id = $1 order by position
     returning id`,
    [base.agreementId, av.rows[0]!.id],
  );
  const uv = await c.query<{ id: string }>('insert into universal_version (project_id, sequence, term_count) values ($1, 1, 2) returning id', [base.projectId]);
  const uvt = await c.query<{ id: string }>(
    `insert into universal_version_term (project_id, universal_version_id, universal_term_id, position, content)
     select project_id, $2, id, position, content from universal_term where project_id = $1 order by position
     returning id`,
    [base.projectId, uv.rows[0]!.id],
  );
  await c.query('commit');

  return {
    ...base,
    agreementVersionId: av.rows[0]!.id,
    agreementPresentedTermIds: avt.rows.map((r) => r.id),
    universalVersionId: uv.rows[0]!.id,
    universalPresentedTermIds: uvt.rows.map((r) => r.id),
  };
}

function agreementAffirmationSql(s: S03S04, termId: string, partyId: string, affirmedAt?: string): [string, unknown[]] {
  return [
    `insert into agreement_affirmation
       (pairwise_agreement_id, party_one_id, party_two_id, agreement_version_id, agreement_version_term_id, party_id${affirmedAt ? ', affirmed_at' : ''})
     values ($1, $2, $3, $4, $5, $6${affirmedAt ? ', $7' : ''}) returning id, affirmed_at::text as affirmed_at`,
    [s.agreementId, s.pair[0], s.pair[1], s.agreementVersionId, termId, partyId, ...(affirmedAt ? [affirmedAt] : [])],
  ];
}

function universalAffirmationSql(s: S03S04, termId: string, partyId: string, affirmedAt?: string): [string, unknown[]] {
  return [
    `insert into universal_affirmation (project_id, universal_version_id, universal_version_term_id, party_id${affirmedAt ? ', affirmed_at' : ''})
     values ($1, $2, $3, $4${affirmedAt ? ', $5' : ''}) returning id, affirmed_at::text as affirmed_at`,
    [s.projectId, s.universalVersionId, termId, partyId, ...(affirmedAt ? [affirmedAt] : [])],
  ];
}

async function failure(c: pg.Client, [text, params]: [string, unknown[]], isolation?: string): Promise<{ code: string; constraint?: string } | null> {
  try {
    await c.query(isolation ? `begin isolation level ${isolation}` : 'begin');
    await c.query(text, params);
    await c.query('rollback');
    return null;
  } catch (error) {
    await c.query('rollback').catch(() => undefined);
    const e = error as { code?: string; constraint?: string };
    return { code: e.code ?? 'unknown', ...(e.constraint ? { constraint: e.constraint } : {}) };
  }
}

// ---- The cases ----

describe('populated migration upgrades', () => {
  it(
    'pre-S03 (0006) → current: S01/S02 rows survive unchanged through S03–S05 and their retirement, grants match a fresh database',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0006);
        const atBoundary = await asOwner(db, async (c) => ({
          s3Absent: (await c.query(`select to_regclass('public.agreement_term') as r`)).rows[0].r,
          books: await bookkeeping(c),
        }));
        expect(atBoundary.s3Absent).toBeNull();
        expect(atBoundary.books.map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(7));

        const s = await asRuntime(db, populateS01S02);
        const before = await asOwner(db, rowsOf);
        expect(before['project']).toEqual([expect.objectContaining({ id: s.projectId, created_by_principal_id: 'upgrade-test-creator' })]);

        // The normal production upgrade path.
        await runMigrations(db.migrationUrl);

        await asOwner(db, async (c) => {
          const after = await rowsOf(c);
          for (const table of ['project', 'project_party', 'pairwise_agreement']) {
            expect({ table, rows: after[table] }).toEqual({ table, rows: before[table] });
          }
          expect(after['pairwise_agreement']).toEqual([
            expect.objectContaining({ id: s.agreementId, project_id: s.projectId, party_one_id: s.pair[0], party_two_id: s.pair[1] }),
          ]);
          expect(s.pair[0] < s.pair[1]).toBe(true);
          expect([...s.pair].sort()).toEqual([...s.partyIds].sort());
          for (const table of ROW_TABLES) {
            const retired = (RETIRED_TABLES as readonly string[]).includes(table);
            expect({ table, present: table in after }).toEqual({ table, present: !retired });
          }

          // Bookkeeping: the first seven entries untouched, the rest appended once each, nothing replayed.
          const books = await bookkeeping(c);
          expect(books.slice(0, 7)).toEqual(atBoundary.books);
          expect(books.map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(journal().entries.length));

          expect(await catalog(c)).toEqual(await freshCatalog());
        });

        // A further run applies nothing and changes nothing.
        await runMigrations(db.migrationUrl);
        await asOwner(db, async (c) => {
          expect((await bookkeeping(c)).length).toBe(journal().entries.length);
          expect(surviving(await rowsOf(c), before)).toEqual(surviving(before));
        });
      });
    },
    UPGRADE_TIMEOUT,
  );

  it(
    'populated 0011 → 0012: rows and stored times survive; stamp triggers, PUBLIC revocation, grants and rules arrive',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0011);
        const s = await asRuntime(db, populateThroughS04);
        // At 0011 the affirmation tables exist without runtime grants or stamp
        // triggers, so these rows are written by the owning role, with a stored
        // historical time the upgrade must not touch.
        const historical = '2026-01-02 03:04:05+00';
        await asOwner(db, async (c) => {
          await c.query(...agreementAffirmationSql(s, s.agreementPresentedTermIds[0]!, s.pair[0], historical));
          await c.query(...universalAffirmationSql(s, s.universalPresentedTermIds[0]!, s.partyIds[0], historical));
          expect(await runtimePrivileges(c, 'agreement_affirmation')).toEqual([]);
          expect((await c.query(`select count(*)::int as n from pg_proc where proname = any($1)`, [STAMP_FUNCTIONS])).rows[0].n).toBe(0);
        });
        const before = await asOwner(db, rowsOf);

        await migrateThrough(db.migrationUrl, T0012);

        await asOwner(db, async (c) => {
          expect(await rowsOf(c)).toEqual(before);
          const stored = await c.query<{ same: boolean }>(
            `select affirmed_at = $1::timestamptz as same from agreement_affirmation
             union all select affirmed_at = $1::timestamptz from universal_affirmation`,
            [historical],
          );
          expect(stored.rows.map((r) => r.same)).toEqual([true, true]);

          const fns = await stampFunctions(c);
          expect(fns.map((f) => ({ name: f.name, triggers: f.triggers.map(({ rel, tgname }) => ({ rel, tgname })), publicExecute: f.publicExecute }))).toEqual([
            { name: 'agreement_affirmation_stamp', triggers: [{ rel: 'agreement_affirmation', tgname: 'agreement_affirmation_stamp' }], publicExecute: false },
            { name: 'universal_affirmation_stamp', triggers: [{ rel: 'universal_affirmation', tgname: 'universal_affirmation_stamp' }], publicExecute: false },
          ]);
          for (const table of ['agreement_affirmation', 'universal_affirmation']) {
            expect({ table, privileges: await runtimePrivileges(c, table) }).toEqual({ table, privileges: ['INSERT', 'SELECT'] });
          }
          expect((await bookkeeping(c)).map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(13));
        });

        // New inserts are held to the 0012 rules (the current storage restrictions).
        await asRuntime(db, async (c) => {
          const supplied = await c.query<{ affirmed_at: string }>(
            ...universalAffirmationSql(s, s.universalPresentedTermIds[0]!, s.partyIds[1], '2000-01-01 00:00:00+00'),
          );
          // The supplied time is replaced by the database clock.
          const recent = await c.query<{ ok: boolean }>(
            `select $1::timestamptz > now() - interval '5 minutes' and $1::timestamptz <> '2000-01-01 00:00:00+00'::timestamptz as ok`,
            [supplied.rows[0]!.affirmed_at],
          );
          expect(recent.rows[0]!.ok).toBe(true);

          // A second presented version makes the container's version 1 no longer accept rows.
          await c.query('begin');
          const v2 = await c.query<{ id: string }>('insert into agreement_version (pairwise_agreement_id, sequence, term_count) values ($1, 2, 1) returning id', [s.agreementId]);
          await c.query(
            `insert into agreement_version_term (pairwise_agreement_id, agreement_version_id, agreement_term_id, position, content)
             select pairwise_agreement_id, $2, id, 1, content from agreement_term where pairwise_agreement_id = $1 and position = 1`,
            [s.agreementId, v2.rows[0]!.id],
          );
          await c.query('commit');
          expect(await failure(c, agreementAffirmationSql(s, s.agreementPresentedTermIds[1]!, s.pair[1]))).toEqual({
            code: CHECK_VIOLATION,
            constraint: 'agreement_affirmation_single_version_only',
          });
        });

        // The historical rows are still exactly as they were.
        await asOwner(db, async (c) => {
          const after = await rowsOf(c);
          expect(after['agreement_affirmation']).toEqual(before['agreement_affirmation']);
          expect((after['universal_affirmation'] as { id: string }[]).filter((r) => (before['universal_affirmation'] as { id: string }[]).some((b) => b.id === r.id))).toEqual(before['universal_affirmation']);
        });
      });
    },
    UPGRADE_TIMEOUT,
  );

  it(
    'populated 0012 → 0013: evidence unchanged, PUBLIC execute stays revoked through CREATE OR REPLACE, snapshot isolation now refused',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0012);
        const s = await asRuntime(db, populateThroughS04);
        await asRuntime(db, async (c) => {
          await c.query(...agreementAffirmationSql(s, s.agreementPresentedTermIds[0]!, s.pair[0]));
          await c.query(...universalAffirmationSql(s, s.universalPresentedTermIds[0]!, s.partyIds[0]));
          // Before 0013, a REPEATABLE READ affirmation is accepted (rolled back here).
          expect(await failure(c, agreementAffirmationSql(s, s.agreementPresentedTermIds[1]!, s.pair[1]), 'repeatable read')).toBeNull();
        });

        const before = await asOwner(db, async (c) => ({ rows: await rowsOf(c), fns: await stampFunctions(c) }));
        expect(before.fns.every((f) => f.publicExecute === false && f.acl !== null)).toBe(true);
        expect(before.fns.map((f) => f.config)).toEqual([PINNED_SEARCH_PATH, PINNED_SEARCH_PATH]);

        await migrateThrough(db.migrationUrl, T0013);

        await asOwner(db, async (c) => {
          expect(await rowsOf(c)).toEqual(before.rows);
          const after = await stampFunctions(c);
          // Same function objects, same ACL (PUBLIC still without EXECUTE), same
          // pinned search_path, still attached to the same triggers.
          expect(after.map((f) => ({ oid: f.oid, acl: f.acl, publicExecute: f.publicExecute, config: f.config, triggers: f.triggers }))).toEqual(
            before.fns.map((f) => ({ oid: f.oid, acl: f.acl, publicExecute: false, config: PINNED_SEARCH_PATH, triggers: f.triggers })),
          );
          for (const f of after) expect(f.triggers.every((t) => t.tgfoid === f.oid && t.enabled === 'O')).toBe(true);
        });

        await asRuntime(db, async (c) => {
          for (const isolation of ['repeatable read', 'serializable']) {
            expect({ isolation, result: await failure(c, agreementAffirmationSql(s, s.agreementPresentedTermIds[1]!, s.pair[1]), isolation) }).toEqual({
              isolation,
              result: { code: CHECK_VIOLATION, constraint: 'agreement_affirmation_read_committed_only' },
            });
            expect({ isolation, result: await failure(c, universalAffirmationSql(s, s.universalPresentedTermIds[1]!, s.partyIds[1]), isolation) }).toEqual({
              isolation,
              result: { code: CHECK_VIOLATION, constraint: 'universal_affirmation_read_committed_only' },
            });
          }
          // READ COMMITTED still accepts an otherwise valid affirmation.
          const ok = await c.query(...agreementAffirmationSql(s, s.agreementPresentedTermIds[1]!, s.pair[1]));
          expect(ok.rowCount).toBe(1);
        });
      });
    },
    UPGRADE_TIMEOUT,
  );

  it(
    'populated 0013 → 0014: the foreign key is renamed in place (same OID and definition), rows unchanged',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0013);
        const s = await asRuntime(db, populateThroughS04);
        await asRuntime(db, (c) => c.query(...agreementAffirmationSql(s, s.agreementPresentedTermIds[0]!, s.pair[0])));

        const fkFacts = (c: pg.Client) =>
          c.query<{ oid: number; conname: string; def: string; convalidated: boolean; condeferrable: boolean; condeferred: boolean; confrelid: string; conkey: number[]; confkey: number[] }>(
            `select oid::int as oid, conname, pg_get_constraintdef(oid) as def, convalidated, condeferrable, condeferred,
                    confrelid::regclass::text as confrelid, conkey, confkey
               from pg_constraint where conrelid = 'public.agreement_version'::regclass and contype = 'f'`,
          );
        const before = await asOwner(db, async (c) => ({ fk: (await fkFacts(c)).rows, rows: await rowsOf(c) }));
        expect(before.fk).toEqual([
          expect.objectContaining({
            conname: TRUNCATED_FK,
            def: 'FOREIGN KEY (pairwise_agreement_id) REFERENCES pairwise_agreement(id)',
            confrelid: 'pairwise_agreement',
          }),
        ]);

        await migrateThrough(db.migrationUrl, T0014);

        await asOwner(db, async (c) => {
          const after = (await fkFacts(c)).rows;
          expect(after).toEqual([{ ...before.fk[0]!, conname: 'agreement_version_agreement_fk' }]);
          expect(after[0]!.oid).toBe(before.fk[0]!.oid);
          expect((await c.query('select 1 from pg_constraint where conname = $1', [TRUNCATED_FK])).rowCount).toBe(0);
          expect(await rowsOf(c)).toEqual(before.rows);
          expect((await bookkeeping(c)).map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(15));
        });

        // The normal path then applies whatever later migrations exist and
        // reaches exactly the freshly migrated schema.
        await runMigrations(db.migrationUrl);
        await asOwner(db, async (c) => {
          const all = journal().entries.length;
          expect((await bookkeeping(c)).map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(all));
          // S08 retires the S03–S05 rows; everything that survives is unchanged.
          expect(surviving(await rowsOf(c), before.rows)).toEqual(surviving(before.rows));
          expect(await catalog(c)).toEqual(await freshCatalog());
        });
      });
    },
    UPGRADE_TIMEOUT,
  );

  it(
    'populated 0014 → 0016 (S06): S01–S05 rows unchanged and account tables arrive empty; then → current, survivors unchanged and existing parties can be bound',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0014);
        const s = await asRuntime(db, populateThroughS04);
        await asRuntime(db, (c) => c.query(...agreementAffirmationSql(s, s.agreementPresentedTermIds[0]!, s.pair[0])));
        const before = await asOwner(db, async (c) => ({
          rows: await rowsOf(c),
          accountAbsent: (await c.query(`select to_regclass('public.account') as r`)).rows[0].r,
        }));
        expect(before.accountAbsent).toBeNull();

        // At its own seam: every S01–S05 row unchanged, account tables empty.
        await migrateThrough(db.migrationUrl, T0016);
        await asOwner(db, async (c) => {
          const after = await rowsOf(c);
          for (const table of Object.keys(before.rows)) {
            expect({ table, rows: after[table] }).toEqual({ table, rows: before.rows[table] });
          }
          expect(after['account']).toEqual([]);
          expect(after['party_account_binding']).toEqual([]);
        });

        // Then to current: S08 retires S03–S05; survivors are unchanged.
        await runMigrations(db.migrationUrl);
        await asOwner(db, async (c) => {
          expect(surviving(await rowsOf(c), before.rows)).toEqual(surviving(before.rows));
          expect((await bookkeeping(c)).map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(
            expectedBookkeeping(journal().entries.length),
          );
          expect(await catalog(c)).toEqual(await freshCatalog());
        });

        // A party created before S06 can be bound through the runtime role.
        await asRuntime(db, async (c) => {
          const acct = await c.query<{ id: string }>(
            `insert into account (login_provider, provider_subject) values ('google', 'upgrade-subject') returning id`,
          );
          const bound = await c.query(
            'insert into party_account_binding (project_id, party_id, account_id) values ($1, $2, $3) returning party_id',
            [s.projectId, s.pair[0], acct.rows[0]!.id],
          );
          expect(bound.rows).toEqual([{ party_id: s.pair[0] }]);
        });
      });
    },
    UPGRADE_TIMEOUT,
  );

  it(
    'populated S06 (0016) → current (S07): accounts and bindings unchanged, invitations arrive empty with their grants, rerun is a no-op',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0016);
        const s = await asRuntime(db, populateS01S02);
        await asRuntime(db, async (c) => {
          const acct = await c.query<{ id: string }>(
            `insert into account (login_provider, provider_subject) values ('apple', 'upgrade-s06-subject') returning id`,
          );
          await c.query('insert into party_account_binding (project_id, party_id, account_id) values ($1, $2, $3)', [
            s.projectId,
            s.pair[0],
            acct.rows[0]!.id,
          ]);
        });
        const before = await asOwner(db, async (c) => ({
          rows: await rowsOf(c),
          books: await bookkeeping(c),
          invitationAbsent: (await c.query(`select to_regclass('public.direct_invitation') as r`)).rows[0].r,
        }));
        expect(before.invitationAbsent).toBeNull();
        expect(before.rows['account']).toHaveLength(1);
        expect(before.rows['party_account_binding']).toHaveLength(1);
        const boundary = journal().entries.findIndex((e) => e.tag === T0016) + 1;
        expect(before.books.map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(boundary));

        await runMigrations(db.migrationUrl);

        await asOwner(db, async (c) => {
          const after = await rowsOf(c);
          for (const table of Object.keys(surviving(before.rows))) {
            expect({ table, rows: after[table] }).toEqual({ table, rows: before.rows[table] });
          }
          expect(after['direct_invitation']).toEqual([]);
          expect(await runtimePrivileges(c, 'direct_invitation')).toEqual(['INSERT', 'SELECT']);
          const books = await bookkeeping(c);
          expect(books.slice(0, boundary)).toEqual(before.books);
          expect(books.map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(journal().entries.length));
          expect(await catalog(c)).toEqual(await freshCatalog());
        });

        // A second run applies nothing and changes nothing.
        await runMigrations(db.migrationUrl);
        await asOwner(db, async (c) => {
          expect((await bookkeeping(c)).length).toBe(journal().entries.length);
          expect(surviving(await rowsOf(c), before.rows)).toEqual(surviving(before.rows));
        });

        // An invitation can be created for a pre-existing party through the runtime role.
        await asRuntime(db, async (c) => {
          const res = await c.query(
            'insert into direct_invitation (project_id, party_id, credential_digest) values ($1, $2, $3) returning party_id',
            [s.projectId, s.pair[1], Buffer.alloc(32, 1)],
          );
          expect(res.rows).toEqual([{ party_id: s.pair[1] }]);
        });
      });
    },
    UPGRADE_TIMEOUT,
  );

  it(
    'populated pre-S08 (0018) → current: S01/S02/S06/S07 rows unchanged, S03–S05 retired, live brief arrives, rerun is a no-op',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0018);
        const s = await asRuntime(db, populateThroughS04);
        await asRuntime(db, async (c) => {
          await c.query(...agreementAffirmationSql(s, s.agreementPresentedTermIds[0]!, s.pair[0]));
          await c.query(...universalAffirmationSql(s, s.universalPresentedTermIds[0]!, s.partyIds[0]));
          const acct = await c.query<{ id: string }>(
            `insert into account (login_provider, provider_subject) values ('google', 'upgrade-s08-subject') returning id`,
          );
          await c.query('insert into party_account_binding (project_id, party_id, account_id) values ($1, $2, $3)', [
            s.projectId,
            s.pair[0],
            acct.rows[0]!.id,
          ]);
          await c.query('insert into direct_invitation (project_id, party_id, credential_digest) values ($1, $2, $3)', [
            s.projectId,
            s.pair[1],
            Buffer.alloc(32, 8),
          ]);
        });
        const boundary = journal().entries.findIndex((e) => e.tag === T0018) + 1;
        const before = await asOwner(db, async (c) => ({ rows: await rowsOf(c), books: await bookkeeping(c) }));
        for (const table of [...SURVIVING_TABLES, ...RETIRED_TABLES]) {
          expect({ table, populated: (before.rows[table] ?? []).length > 0 }).toEqual({ table, populated: true });
        }
        expect(before.books.map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(boundary));

        await runMigrations(db.migrationUrl);

        await asOwner(db, async (c) => {
          const after = await rowsOf(c);
          expect(surviving(after, before.rows)).toEqual(surviving(before.rows));
          for (const table of RETIRED_TABLES) expect({ table, present: table in after }).toEqual({ table, present: false });
          const fns = await c.query<{ n: number }>(
            `select count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1)`,
            [RETIRED_FUNCTIONS],
          );
          expect(fns.rows[0]!.n).toBe(0);
          expect(after['live_brief']).toEqual([]);
          expect(after['brief_item']).toEqual([]);
          expect(await runtimePrivileges(c, 'live_brief')).toEqual(['INSERT', 'SELECT']);
          expect(await runtimePrivileges(c, 'brief_item')).toEqual(['DELETE', 'INSERT', 'SELECT']);
          const books = await bookkeeping(c);
          expect(books.slice(0, boundary)).toEqual(before.books);
          expect(books.map(({ hash, created_at }) => ({ hash, created_at }))).toEqual(expectedBookkeeping(journal().entries.length));
          expect(await catalog(c)).toEqual(await freshCatalog());
        });

        // A second run applies nothing and changes nothing.
        await runMigrations(db.migrationUrl);
        await asOwner(db, async (c) => {
          expect((await bookkeeping(c)).length).toBe(journal().entries.length);
          expect(surviving(await rowsOf(c), before.rows)).toEqual(surviving(before.rows));
        });

        // A pre-existing project can open a brief, and its pre-existing pair can carry a fee.
        await asRuntime(db, async (c) => {
          const brief = await c.query<{ id: string }>('insert into live_brief (project_id) values ($1) returning id', [s.projectId]);
          const fee = await c.query(
            `insert into brief_item (brief_id, project_id, layer, pairwise_agreement_id, item_key, value, position)
             values ($1, $2, 'money', $3, 'fee', '[upgrade] 100', 1) returning id`,
            [brief.rows[0]!.id, s.projectId, s.agreementId],
          );
          expect(fee.rowCount).toBe(1);
        });
      });
    },
    UPGRADE_TIMEOUT,
  );

  it(
    'duplicate pairs at 0018: the S08 upgrade fails loudly and leaves the database exactly as it was',
    async () => {
      await inScratch(async (db) => {
        await migrateThrough(db.migrationUrl, T0018);
        const s = await asRuntime(db, populateS01S02);
        await asRuntime(db, (c) =>
          c.query('insert into pairwise_agreement (project_id, party_one_id, party_two_id) values ($1, $2, $3)', [
            s.projectId,
            s.pair[0],
            s.pair[1],
          ]),
        );
        const before = await asOwner(db, async (c) => ({ rows: await rowsOf(c), books: await bookkeeping(c), catalog: await catalog(c) }));
        expect(before.rows['pairwise_agreement']).toHaveLength(2);

        await expect(runMigrations(db.migrationUrl)).rejects.toThrow(/duplicate pairwise agreements exist/);

        await asOwner(db, async (c) => {
          expect(await rowsOf(c)).toEqual(before.rows);
          expect(await bookkeeping(c)).toEqual(before.books);
          expect(await catalog(c)).toEqual(before.catalog);
          expect((await c.query(`select to_regclass('public.agreement_term') as r`)).rows[0].r).not.toBeNull();
          expect((await c.query(`select to_regclass('public.live_brief') as r`)).rows[0].r).toBeNull();
        });
      });
    },
    UPGRADE_TIMEOUT,
  );
});
