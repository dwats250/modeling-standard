import { randomUUID } from 'node:crypto';
import { getTableColumns } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import {
  findAccount,
  findAccountByLogin,
  resolveAccountForLogin,
  type ExternalLogin,
  type LoginProvider,
} from '../../src/accounts/account.ts';
import {
  bindPartyToAccount,
  findBindingForParty,
  listBindingsForAccount,
  PartyAlreadyBoundError,
} from '../../src/accounts/binding.ts';
import { account, partyAccountBinding } from '../../src/accounts/tables.ts';
import { createLogger } from '../../src/app/logger.ts';
import { operations } from '../../src/app/operation-list.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S06 sign-in accounts and party bindings against real PostgreSQL, migrated
 * by the production migration path and used as the runtime role.
 *
 * An account is a sign-in account (D03), not a verified identity (D11) and
 * not a party (S01). A binding says which account reaches a project-local
 * party; it is not verification, acceptance, a role or proxy authority (D12).
 */

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/**
 * Words naming semantics S06 excludes: verified identity, role, payment
 * direction, proxy and guardianship, profile and portfolio, invitation
 * state, signatures, and anything a provider token or personal profile would
 * carry.
 */
const EXCLUDED_SEMANTICS = [
  'verif', 'identity', 'kyc', 'age', 'birth', 'dob', 'document', 'vendor',
  'role', 'payer', 'payee', 'pay', 'photographer', 'model', 'owner',
  'proxy', 'guardian', 'minor', 'youth', 'represent', 'agent',
  'profile', 'portfolio', 'avatar', 'display', 'name', 'email', 'phone',
  'invit', 'status', 'state', 'pending', 'accept',
  'sign', 'affirm', 'witness', 'consent',
  'token', 'secret', 'password', 'session', 'cookie',
];

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

const login = (provider: LoginProvider, providerSubject = `subject-${randomUUID()}`): ExternalLogin => ({
  provider,
  providerSubject,
});

/** The error code a database call failed with, or null if it succeeded. */
async function failureCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { code?: unknown; cause?: { code?: unknown } };
    const code = typeof e.code === 'string' ? e.code : e.cause?.code;
    return typeof code === 'string' ? code : 'unknown';
  }
}

async function projectWithParties(count: number): Promise<{ projectId: string; partyIds: string[] }> {
  const created = await insertProject(database.db, { createdByPrincipalId: `s06-creator-${randomUUID()}` });
  const partyIds: string[] = [];
  for (let i = 0; i < count; i++) partyIds.push((await addProjectParty(database.db, created.id)).id);
  return { projectId: created.id, partyIds };
}

async function countRows(table: 'account' | 'party_account_binding', where: string, params: unknown[]): Promise<number> {
  const res = await withClient(inject('runtimeUrl'), (c) =>
    c.query<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`, params),
  );
  return res.rows[0]?.n ?? -1;
}

describe('a sign-in account', () => {
  it.each(['google', 'apple'] as const)('is created for a %s login and reads back', async (provider) => {
    const l = login(provider);
    const created = await resolveAccountForLogin(database.db, l);
    expect(created).toEqual({
      id: expect.any(String),
      provider,
      providerSubject: l.providerSubject,
      createdAt: expect.any(Date),
    });
    expect(await findAccountByLogin(database.db, l)).toEqual(created);
    expect(await findAccount(database.db, created.id)).toEqual(created);
  });

  it('resolves the same login to the same account every time', async () => {
    const l = login('google');
    const first = await resolveAccountForLogin(database.db, l);
    const second = await resolveAccountForLogin(database.db, l);
    expect(second).toEqual(first);
    expect(await countRows('account', 'login_provider = $1 and provider_subject = $2', [l.provider, l.providerSubject])).toBe(1);
  });

  it('is created exactly once when the same login resolves concurrently', async () => {
    const l = login('apple');
    const results = await Promise.all(Array.from({ length: 12 }, () => resolveAccountForLogin(database.db, l)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await countRows('account', 'login_provider = $1 and provider_subject = $2', [l.provider, l.providerSubject])).toBe(1);
  });

  it('waits for a competing uncommitted creation and then returns that same account', async () => {
    const l = login('google');
    const other = new pg.Client({ connectionString: inject('runtimeUrl') });
    await other.connect();
    try {
      await other.query('begin');
      const held = await other.query<{ id: string }>(
        'insert into account (login_provider, provider_subject) values ($1, $2) returning id',
        [l.provider, l.providerSubject],
      );
      // This resolution must block on the uncommitted row, not create a second account.
      const pending = resolveAccountForLogin(database.db, l);
      await new Promise((r) => setTimeout(r, 300));
      await other.query('commit');
      const resolved = await pending;
      expect(resolved.id).toBe(held.rows[0]?.id);
    } finally {
      await other.end();
    }
    expect(await countRows('account', 'login_provider = $1 and provider_subject = $2', [l.provider, l.providerSubject])).toBe(1);
  });

  it('keeps the same subject under Google and under Apple as two distinct accounts', async () => {
    const subject = `shared-${randomUUID()}`;
    const google = await resolveAccountForLogin(database.db, login('google', subject));
    const apple = await resolveAccountForLogin(database.db, login('apple', subject));
    expect(google.id).not.toBe(apple.id);
    expect(await countRows('account', 'provider_subject = $1', [subject])).toBe(2);
  });

  it('rejects an unsupported provider, in the database itself', async () => {
    const unsupported = { provider: 'facebook', providerSubject: `s-${randomUUID()}` } as unknown as ExternalLogin;
    expect(await failureCode(() => resolveAccountForLogin(database.db, unsupported))).toBe(CHECK_VIOLATION);
    await withClient(inject('runtimeUrl'), async (c) => {
      for (const provider of ['Google', 'APPLE', 'github', '']) {
        expect(
          await sqlErrorCode(c, 'insert into account (login_provider, provider_subject) values ($1, $2)', [provider, 'x']),
        ).toBe(CHECK_VIOLATION);
      }
    });
  });

  it('rejects a blank subject', async () => {
    for (const subject of ['', ' ', '\t\n']) {
      expect(await failureCode(() => resolveAccountForLogin(database.db, login('google', subject)))).toBe(CHECK_VIOLATION);
    }
  });

  it('gets its creation time from the database, not the caller', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      const res = await c.query<{ lag: number }>(
        `insert into account (login_provider, provider_subject, created_at) values ('google', $1, '2001-01-01')
         returning extract(epoch from (clock_timestamp() - created_at))::float8 as lag`,
        [`s-${randomUUID()}`],
      );
      expect(res.rows[0]?.lag).toBeGreaterThanOrEqual(0);
      expect(res.rows[0]?.lag).toBeLessThan(60);
    });
  });
});

describe('a party binding', () => {
  it('binds an existing party to an account, and reads back from either side', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const acct = await resolveAccountForLogin(database.db, login('google'));
    const bound = await bindPartyToAccount(database.db, { projectId, partyId: partyIds[0]!, accountId: acct.id });
    expect(bound).toEqual({
      id: expect.any(String),
      projectId,
      partyId: partyIds[0],
      accountId: acct.id,
      boundAt: expect.any(Date),
    });
    expect(await findBindingForParty(database.db, partyIds[0]!)).toEqual(bound);
    expect(await listBindingsForAccount(database.db, acct.id)).toEqual([bound]);
    expect(await findBindingForParty(database.db, randomUUID())).toBeUndefined();
  });

  it('rejects an unknown account', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    expect(
      await failureCode(() => bindPartyToAccount(database.db, { projectId, partyId: partyIds[0]!, accountId: randomUUID() })),
    ).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('rejects an unknown party, and a party of another project, by the database', async () => {
    const mine = await projectWithParties(1);
    const theirs = await projectWithParties(1);
    const acct = await resolveAccountForLogin(database.db, login('apple'));
    expect(
      await failureCode(() =>
        bindPartyToAccount(database.db, { projectId: mine.projectId, partyId: randomUUID(), accountId: acct.id }),
      ),
    ).toBe(FOREIGN_KEY_VIOLATION);
    expect(
      await failureCode(() =>
        bindPartyToAccount(database.db, { projectId: mine.projectId, partyId: theirs.partyIds[0]!, accountId: acct.id }),
      ),
    ).toBe(FOREIGN_KEY_VIOLATION);
    await withClient(inject('runtimeUrl'), async (c) => {
      const err = await c
        .query('insert into party_account_binding (project_id, party_id, account_id) values ($1, $2, $3)', [
          mine.projectId,
          theirs.partyIds[0],
          acct.id,
        ])
        .then(
          () => null,
          (e: { code?: string; constraint?: string }) => ({ code: e.code, constraint: e.constraint }),
        );
      expect(err).toEqual({ code: FOREIGN_KEY_VIOLATION, constraint: 'party_account_binding_party_in_project_fk' });
    });
  });

  it('binding the same party to the same account again returns the existing binding without a second row', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const acct = await resolveAccountForLogin(database.db, login('google'));
    const first = await bindPartyToAccount(database.db, { projectId, partyId: partyIds[0]!, accountId: acct.id });
    const again = await bindPartyToAccount(database.db, { projectId, partyId: partyIds[0]!, accountId: acct.id });
    expect(again).toEqual(first);
    expect(await countRows('party_account_binding', 'party_id = $1', [partyIds[0]])).toBe(1);
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(
        await sqlErrorCode(c, 'insert into party_account_binding (project_id, party_id, account_id) values ($1, $2, $3)', [
          projectId,
          partyIds[0],
          acct.id,
        ]),
      ).toBe(UNIQUE_VIOLATION);
    });
  });

  it('refuses to rebind a party to a different account, keeping the original', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const original = await resolveAccountForLogin(database.db, login('google'));
    const intruder = await resolveAccountForLogin(database.db, login('google'));
    const bound = await bindPartyToAccount(database.db, { projectId, partyId: partyIds[0]!, accountId: original.id });
    await expect(
      bindPartyToAccount(database.db, { projectId, partyId: partyIds[0]!, accountId: intruder.id }),
    ).rejects.toBeInstanceOf(PartyAlreadyBoundError);
    expect(await findBindingForParty(database.db, partyIds[0]!)).toEqual(bound);
    expect(await countRows('party_account_binding', 'party_id = $1', [partyIds[0]])).toBe(1);
  });

  it('leaves exactly one durable winner when different accounts compete for one party concurrently', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const accounts = await Promise.all(
      Array.from({ length: 8 }, () => resolveAccountForLogin(database.db, login('apple'))),
    );
    const outcomes = await Promise.allSettled(
      accounts.map((a) => bindPartyToAccount(database.db, { projectId, partyId: partyIds[0]!, accountId: a.id })),
    );
    const won = outcomes.filter((o) => o.status === 'fulfilled');
    const lost = outcomes.filter((o) => o.status === 'rejected');
    expect(won).toHaveLength(1);
    for (const o of lost) expect((o).reason).toBeInstanceOf(PartyAlreadyBoundError);
    const durable = await findBindingForParty(database.db, partyIds[0]!);
    expect(durable).toEqual((won[0] as PromiseFulfilledResult<unknown>).value);
    expect(await countRows('party_account_binding', 'party_id = $1', [partyIds[0]])).toBe(1);
  });

  it('lets one account be bound to parties of different projects', async () => {
    const a = await projectWithParties(1);
    const b = await projectWithParties(1);
    const acct = await resolveAccountForLogin(database.db, login('google'));
    await bindPartyToAccount(database.db, { projectId: a.projectId, partyId: a.partyIds[0]!, accountId: acct.id });
    await bindPartyToAccount(database.db, { projectId: b.projectId, partyId: b.partyIds[0]!, accountId: acct.id });
    const bindings = await listBindingsForAccount(database.db, acct.id);
    expect(bindings.map((x) => x.projectId).sort()).toEqual([a.projectId, b.projectId].sort());
  });

  // Deliberately absent: any assertion that one account cannot be bound to two
  // parties of the same project. That is not a decided invariant (D02 dual
  // roles live inside one agreement, but no database rule was authorized).

  it('gets its binding time from the database, not the caller', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const acct = await resolveAccountForLogin(database.db, login('apple'));
    await withClient(inject('runtimeUrl'), async (c) => {
      const res = await c.query<{ lag: number }>(
        `insert into party_account_binding (project_id, party_id, account_id, bound_at) values ($1, $2, $3, '2001-01-01')
         returning extract(epoch from (clock_timestamp() - bound_at))::float8 as lag`,
        [projectId, partyIds[0], acct.id],
      );
      expect(res.rows[0]?.lag).toBeGreaterThanOrEqual(0);
      expect(res.rows[0]?.lag).toBeLessThan(60);
    });
  });
});

describe('what the S06 tables hold', () => {
  const columnsOf = async (table: string) =>
    (
      await withClient(inject('runtimeUrl'), (c) =>
        c.query<{ column_name: string }>(
          `select column_name from information_schema.columns
           where table_schema = 'public' and table_name = $1 order by ordinal_position`,
          [table],
        ),
      )
    ).rows.map((r) => r.column_name);

  it('account holds exactly an id, the login provider, the provider subject and the creation time', async () => {
    expect(await columnsOf('account')).toEqual(['id', 'login_provider', 'provider_subject', 'created_at']);
  });

  it('a binding holds exactly an id, the project, the party, the account and the binding time', async () => {
    expect(await columnsOf('party_account_binding')).toEqual(['id', 'project_id', 'party_id', 'account_id', 'bound_at']);
  });

  it('carries exactly the expected constraints, with no cascading foreign key', async () => {
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ rel: string; name: string; type: string; ondelete: string }>(
        `select conrelid::regclass::text as rel, conname as name, contype as type, confdeltype as ondelete
         from pg_constraint where conrelid in ('public.account'::regclass, 'public.party_account_binding'::regclass)
         order by 1, 2`,
      ),
    );
    expect(rows.rows.map((r) => `${r.rel}.${r.name}:${r.type}`)).toEqual([
      'account.account_login_provider_known:c',
      'account.account_login_unique:u',
      'account.account_pkey:p',
      'account.account_provider_subject_nonblank:c',
      'party_account_binding.party_account_binding_account_id_account_id_fk:f',
      'party_account_binding.party_account_binding_one_per_party:u',
      'party_account_binding.party_account_binding_party_in_project_fk:f',
      'party_account_binding.party_account_binding_pkey:p',
      'party_account_binding.party_account_binding_project_id_project_id_fk:f',
    ]);
    // 'a' is NO ACTION: deleting an account, party or project never erases a binding.
    for (const fk of rows.rows.filter((r) => r.type === 'f')) expect({ fk: fk.name, ondelete: fk.ondelete }).toEqual({ fk: fk.name, ondelete: 'a' });
  });

  it('names no excluded semantic: no verified identity, role, payment, proxy, profile, invitation, signature or token', async () => {
    const names = await withClient(inject('runtimeUrl'), async (c) => {
      const columns = await c.query<{ name: string }>(
        `select column_name as name from information_schema.columns
         where table_schema = 'public' and table_name in ('account', 'party_account_binding')`,
      );
      const constraints = await c.query<{ name: string }>(
        `select conname as name from pg_constraint
         where conrelid in ('public.account'::regclass, 'public.party_account_binding'::regclass)`,
      );
      return [...columns.rows, ...constraints.rows].map((r) => r.name);
    });
    const definitionNames = [
      ...Object.keys(getTableColumns(account)),
      ...Object.keys(getTableColumns(partyAccountBinding)),
    ].map((n) => n.toLowerCase());
    const offending = [...names, ...definitionNames].filter((name) =>
      EXCLUDED_SEMANTICS.some((word) => name.includes(word)),
    );
    expect(offending).toEqual([]);
  });

  it('adds no HTTP operation: the only sign-in, account or binding routes are S12\'s', () => {
    // S06 itself adds none. S12 adds sign-in from an invitation, sign-out and
    // the claim; there is still no account, login or binding route as such.
    expect(
      operations
        .filter((op) => /account|login|sign|auth|oauth|bind|invit|google|apple/i.test(`${op.name} ${op.path}`))
        .map((op) => op.name)
        .sort(),
    ).toEqual(['invitation.claim', 'sign-in.callback', 'sign-in.start', 'sign-out']);
  });
});

describe('runtime role on the S06 tables', () => {
  it.each(['account', 'party_account_binding'])('cannot update, delete or truncate %s', async (table) => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, `update ${table} set id = id`)).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, `delete from ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, `truncate ${table}`)).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('cannot call the stamp functions directly', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'select account_stamp()')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'select party_account_binding_stamp()')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

describe('resolution inside a snapshot transaction', () => {
  it('fails closed rather than inventing a second account when the row is invisible', async () => {
    const l = login('google');
    const client = new pg.Client({ connectionString: inject('runtimeUrl') });
    await client.connect();
    try {
      await client.query('begin isolation level repeatable read');
      await client.query('select 1'); // take the snapshot
      await resolveAccountForLogin(database.db, l); // committed by another session after the snapshot
      const tx = drizzle(client);
      await expect(resolveAccountForLogin(tx, l)).rejects.toThrow();
      await client.query('rollback');
    } finally {
      await client.end();
    }
    expect(await countRows('account', 'login_provider = $1 and provider_subject = $2', [l.provider, l.providerSubject])).toBe(1);
  });
});
