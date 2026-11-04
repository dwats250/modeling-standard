import { sql } from 'drizzle-orm';
import { ConfigError } from '../config/config.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { DEMO_DATABASE } from './demo.ts';

/**
 * Reviewer mode's database boundary, read from the server's own catalogs over
 * the connection that will serve, never from the URL. Startup fails closed
 * unless the connected database is exactly `modeling_standard_demo` and the
 * effective role is the least-privilege runtime role:
 *
 * - it acts as itself and may become only `app_runtime` (membership is
 *   transitive, and a role can `SET ROLE` to anything it is a member of, so an
 *   elevated attribute anywhere in that closure counts as its own);
 * - it owns nothing, in this database or any other;
 * - it can create nothing and can connect to no other database;
 * - its table privileges are exactly `RUNTIME_TABLE_PRIVILEGES`.
 *
 * Messages name the problem, never a credential.
 */

const RUNTIME_GROUP = 'app_runtime';

/**
 * What the runtime role holds on each table: the reviewer's own copy of the
 * set `tests/database/runtime-role.test.ts` pins. A migration that changes
 * grants must change both; `tests/http/reviewer.test.ts` fails until it does.
 */
export const RUNTIME_TABLE_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  'public.account': ['INSERT', 'SELECT'],
  'public.account_session': ['INSERT', 'SELECT'],
  'public.brief_item': ['DELETE', 'INSERT', 'SELECT'],
  'public.brief_party_presence': ['INSERT', 'SELECT'],
  'public.brief_tick': ['DELETE', 'INSERT', 'SELECT'],
  'public.comp_card_draft': ['INSERT', 'SELECT'],
  'public.contract': ['INSERT', 'SELECT'],
  'public.contract_item': ['INSERT', 'SELECT'],
  'public.contract_party': ['INSERT', 'SELECT'],
  'public.contract_signature': ['INSERT', 'SELECT'],
  'public.direct_invitation': ['INSERT', 'SELECT'],
  'public.live_brief': ['INSERT', 'SELECT'],
  'public.pairwise_agreement': ['INSERT', 'SELECT'],
  'public.party_account_binding': ['INSERT', 'SELECT'],
  'public.portfolio_draft': ['INSERT', 'SELECT'],
  'public.professional_profile': ['INSERT', 'SELECT'],
  'public.project': ['INSERT', 'SELECT'],
  'public.project_party': ['INSERT', 'SELECT'],
  'public.sign_in_attempt': ['DELETE', 'INSERT', 'SELECT'],
  'public.synthetic_evidence': ['INSERT', 'SELECT'],
  'public.synthetic_resource': ['INSERT', 'SELECT'],
};

/** The only tables with column-level UPDATE. No table may be updated wholesale. */
export const RUNTIME_COLUMN_UPDATABLE: readonly string[] = [
  'public.account_session',
  'public.brief_item',
  'public.brief_party_presence',
  'public.comp_card_draft',
  'public.live_brief',
  'public.portfolio_draft',
  'public.professional_profile',
];

export interface DatabaseBoundaryFacts {
  readonly database: string;
  readonly currentUser: string;
  readonly sessionUser: string;
  /** Every other role this one is a member of, directly or not. */
  readonly memberOf: readonly string[];
  /** Whether it gets the runtime group's privileges without SET ROLE. */
  readonly inheritsRuntimeGroup: boolean;
  /** Whether it may grant the runtime group to others. */
  readonly administersRuntimeGroup: boolean;
  /** Elevated attributes held by it or by anything in `memberOf`. */
  readonly attributes: readonly string[];
  readonly ownsADatabase: boolean;
  readonly ownedSchemas: number;
  readonly ownedTables: number;
  /** Objects of any kind, in any database, recorded as owned by it or by anything in `memberOf`. */
  readonly ownedObjects: number;
  readonly canCreateInDatabase: boolean;
  readonly schemasWithCreate: number;
  readonly otherConnectableDatabases: readonly string[];
  readonly tables: readonly { readonly name: string; readonly privileges: readonly string[]; readonly columnUpdate: boolean; readonly columnReferences: boolean }[];
  readonly sequences: number;
}

/** Every reason these facts are not the least-privilege boundary. Empty means they are. */
export function databaseBoundaryProblems(facts: DatabaseBoundaryFacts, expectedDatabase: string = DEMO_DATABASE): string[] {
  const problems: string[] = [];
  if (facts.database !== expectedDatabase) problems.push(`database: connected to a database other than ${expectedDatabase}`);
  if (facts.currentUser !== facts.sessionUser) problems.push('role: the connection has switched role (current_user is not session_user)');
  if (facts.attributes.length > 0) problems.push(`role: holds or can become a role that holds ${[...facts.attributes].sort().join(', ')}`);
  const extra = facts.memberOf.filter((role) => role !== RUNTIME_GROUP);
  if (extra.length > 0) problems.push(`role: is a member of a role other than ${RUNTIME_GROUP} (${[...extra].sort().join(', ')})`);
  if (!facts.inheritsRuntimeGroup) problems.push(`role: does not inherit ${RUNTIME_GROUP}`);
  if (facts.administersRuntimeGroup) problems.push(`role: holds ${RUNTIME_GROUP} with its admin option`);
  if (facts.ownsADatabase) problems.push('ownership: owns a database');
  if (facts.ownedSchemas > 0) problems.push('ownership: owns a schema');
  if (facts.ownedTables > 0) problems.push('ownership: owns a table');
  if (facts.ownedObjects > 0) problems.push('ownership: owns database objects');
  if (facts.canCreateInDatabase) problems.push('grants: may create schemas or temporary tables in this database');
  if (facts.schemasWithCreate > 0) problems.push('grants: may create objects in a schema');
  if (facts.otherConnectableDatabases.length > 0) {
    problems.push(`grants: may connect to other databases (${[...facts.otherConnectableDatabases].sort().join(', ')}); revoke CONNECT or use a dedicated PostgreSQL server`);
  }
  const held = new Map(facts.tables.map((table) => [table.name, table]));
  const columnUpdatable = new Set(RUNTIME_COLUMN_UPDATABLE);
  for (const table of facts.tables) {
    const expected = RUNTIME_TABLE_PRIVILEGES[table.name];
    const privileges = [...table.privileges].sort();
    if (expected === undefined) {
      if (privileges.length > 0 || table.columnUpdate || table.columnReferences) problems.push(`grants: holds privileges on an unexpected table (${table.name})`);
      continue;
    }
    if (privileges.join() !== expected.join()) problems.push(`grants: holds ${privileges.join(', ') || 'nothing'} on ${table.name}, expected ${expected.join(', ')}`);
    if (table.columnUpdate !== columnUpdatable.has(table.name)) problems.push(`grants: unexpected column UPDATE state on ${table.name}`);
    if (table.columnReferences) problems.push(`grants: holds REFERENCES on ${table.name}`);
  }
  for (const name of Object.keys(RUNTIME_TABLE_PRIVILEGES)) {
    if (!held.has(name)) problems.push(`grants: ${name} is missing (not migrated?)`);
  }
  if (facts.sequences > 0) problems.push('grants: holds privileges on a sequence');
  return problems;
}

/** Reads the facts in one statement, so they all come from one connection. */
export async function readDatabaseBoundaryFacts(db: Executor): Promise<DatabaseBoundaryFacts> {
  const { rows } = await db.execute<{ facts: DatabaseBoundaryFacts }>(sql`
    with me as (select oid, rolname from pg_roles where rolname = current_user),
    closure as (select r.* from pg_roles r, me where pg_has_role(me.oid, r.oid, 'MEMBER')),
    user_schemas as (
      select n.oid, n.nspname, n.nspowner from pg_namespace n
      where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_(toast|temp)'
    ),
    relations as (
      select c.oid, c.relkind, c.relowner, format('%s.%s', s.nspname, c.relname) as name
      from pg_class c join user_schemas s on s.oid = c.relnamespace
    ),
    tables as (select * from relations where relkind in ('r', 'p', 'v', 'm', 'f')),
    grant_group as (select oid from pg_roles where rolname = ${RUNTIME_GROUP})
    select json_build_object(
      'database', current_database(),
      'currentUser', current_user,
      'sessionUser', session_user,
      'memberOf', (select coalesce(json_agg(rolname), '[]'::json) from closure where rolname <> current_user),
      'inheritsRuntimeGroup', coalesce((select pg_has_role(me.oid, g.oid, 'USAGE') from me, grant_group g), false),
      'administersRuntimeGroup', coalesce((select pg_has_role(me.oid, g.oid, 'MEMBER WITH ADMIN OPTION') from me, grant_group g), false),
      'attributes', (
        select coalesce(json_agg(distinct a.attribute), '[]'::json)
        from closure c cross join lateral (values
          ('SUPERUSER', c.rolsuper), ('CREATEROLE', c.rolcreaterole), ('CREATEDB', c.rolcreatedb),
          ('BYPASSRLS', c.rolbypassrls), ('REPLICATION', c.rolreplication)
        ) as a(attribute, held) where a.held
      ),
      'ownsADatabase', exists (select 1 from pg_database d, me where pg_has_role(me.oid, d.datdba, 'MEMBER')),
      'ownedSchemas', (select count(*) from user_schemas s, me where pg_has_role(me.oid, s.nspowner, 'MEMBER')),
      'ownedTables', (select count(*) from relations r, me where pg_has_role(me.oid, r.relowner, 'MEMBER')),
      'ownedObjects', (select count(*) from pg_shdepend d where d.deptype = 'o' and d.refobjid in (select oid from closure)),
      'canCreateInDatabase', (select has_database_privilege(me.oid, current_database(), 'CREATE, TEMPORARY') from me),
      'schemasWithCreate', (select count(*) from user_schemas s, me where has_schema_privilege(me.oid, s.oid, 'CREATE')),
      'otherConnectableDatabases', (
        select coalesce(json_agg(d.datname), '[]'::json) from pg_database d, me
        where d.datallowconn and d.datname <> current_database() and has_database_privilege(me.oid, d.oid, 'CONNECT')
      ),
      'tables', (
        select coalesce(json_agg(json_build_object(
          'name', t.name,
          'privileges', (
            select coalesce(json_agg(p), '[]'::json)
            from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p
            where has_table_privilege(me.oid, t.oid, p)
          ),
          'columnUpdate', has_any_column_privilege(me.oid, t.oid, 'UPDATE'),
          'columnReferences', has_any_column_privilege(me.oid, t.oid, 'REFERENCES')
        )), '[]'::json) from tables t, me
      ),
      'sequences', (
        select count(*) from relations r, me
        where r.relkind = 'S' and (has_sequence_privilege(me.oid, r.oid, 'USAGE') or has_sequence_privilege(me.oid, r.oid, 'SELECT') or has_sequence_privilege(me.oid, r.oid, 'UPDATE'))
      )
    ) as facts
  `);
  const facts = rows[0]?.facts;
  if (facts === undefined) throw new Error('the database boundary could not be read');
  return facts;
}

/** Startup's check. Throws a ConfigError naming every problem; passing means the boundary held at this moment. */
export async function assertReviewerDatabaseBoundary(db: Executor): Promise<void> {
  const problems = databaseBoundaryProblems(await readDatabaseBoundaryFacts(db));
  if (problems.length > 0) throw new ConfigError(problems);
}
