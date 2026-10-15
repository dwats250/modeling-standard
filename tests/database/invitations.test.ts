import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { findAccount, resolveAccountForLogin } from '../../src/accounts/account.ts';
import { findBindingForParty, PartyAlreadyBoundError } from '../../src/accounts/binding.ts';
import { createLogger } from '../../src/app/logger.ts';
import { operations } from '../../src/app/operation-list.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import {
  AccountNotFoundError,
  claimDirectInvitation,
  createDirectInvitation,
  CREDENTIAL_BYTES,
  InvitationNotFoundError,
  resolveDirectInvitation,
} from '../../src/invitations/invitation.ts';
import { directInvitation } from '../../src/invitations/tables.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { findProject, insertProject } from '../../src/projects/project.ts';
import { LogCapture } from '../support/app.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S07 direct invitations against real PostgreSQL, migrated by the production
 * migration path and used as the runtime role.
 *
 * The link is the invitation: a 32-byte bearer credential whose SHA-256
 * digest is the only thing stored. Resolving it names a project-local party
 * and nothing more; claiming it binds a sign-in account to that party through
 * S06. It establishes no identity, is not acceptance and grants no proxy.
 */

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/**
 * Words naming what S07 must not store: recipient identity or address,
 * delivery channel and delivery state, lifecycle status, expiry, and
 * request metadata.
 */
const EXCLUDED_SEMANTICS = [
  'email', 'phone', 'name', 'recipient', 'account', 'address',
  'channel', 'sent', 'deliver', 'open', 'read', 'forward', 'bounce',
  'expir', 'resend', 'rotat', 'revok', 'cancel', 'accept', 'declin', 'reject', 'status', 'state',
  'ip', 'device', 'agent', 'verif', 'identity', 'role', 'proxy', 'sign', 'token', 'raw', 'plain',
];

let logs: LogCapture;
let database: DatabaseHandle;
beforeAll(() => {
  logs = new LogCapture();
  database = openDatabase(inject('runtimeUrl'), createLogger('trace', logs));
});
afterAll(async () => {
  await database.close();
});

/** Every credential any test has seen, to prove none reached a log or a row. */
const seenCredentials: string[] = [];

async function projectWithParties(count: number): Promise<{ projectId: string; partyIds: string[] }> {
  const created = await insertProject(database.db, { createdByPrincipalId: `s07-creator-${randomUUID()}` });
  const partyIds: string[] = [];
  for (let i = 0; i < count; i++) partyIds.push((await addProjectParty(database.db, created.id)).id);
  return { projectId: created.id, partyIds };
}

async function invite(projectId: string, partyId: string) {
  const created = await createDirectInvitation(database.db, { projectId, partyId });
  seenCredentials.push(created.credential);
  return created;
}

const newAccount = () =>
  resolveAccountForLogin(database.db, { provider: 'google', providerSubject: `s07-${randomUUID()}` });

async function failure(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}

function codeOf(error: unknown): string | null {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  if (!e) return null;
  const code = typeof e.code === 'string' ? e.code : e.cause?.code;
  return typeof code === 'string' ? code : 'unknown';
}

const sha256 = (credential: string) => createHash('sha256').update(Buffer.from(credential, 'base64url')).digest();

describe('creating a direct invitation', () => {
  it('returns the target and a 32-byte unpadded base64url credential, once', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    expect(created).toEqual({
      id: expect.any(String),
      projectId,
      partyId: partyIds[0],
      createdAt: expect.any(Date),
      credential: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(Buffer.from(created.credential, 'base64url')).toHaveLength(CREDENTIAL_BYTES);
  });

  it('gives every invitation a distinct credential and digest, and allows several for one party', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const many = await Promise.all(Array.from({ length: 20 }, () => invite(projectId, partyIds[0]!)));
    expect(new Set(many.map((m) => m.credential)).size).toBe(20);
    const digests = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ d: string }>(`select encode(credential_digest, 'hex') as d from direct_invitation where party_id = $1`, [
        partyIds[0],
      ]),
    );
    expect(new Set(digests.rows.map((r) => r.d)).size).toBe(20);
    // Distinct bytes, not a counter: every credential differs in most positions.
    const [a, b] = [Buffer.from(many[0]!.credential, 'base64url'), Buffer.from(many[1]!.credential, 'base64url')];
    expect(a.filter((byte, i) => byte !== b[i]).length).toBeGreaterThan(20);
  });

  it('stores only the SHA-256 digest of the credential bytes, never the credential', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    await withClient(inject('runtimeUrl'), async (c) => {
      const row = await c.query<{ digest: Buffer; row: string }>(
        `select credential_digest as digest, row_to_json(direct_invitation)::text as row from direct_invitation where id = $1`,
        [created.id],
      );
      expect(row.rows[0]!.digest.equals(sha256(created.credential))).toBe(true);
      expect(row.rows[0]!.row).not.toContain(created.credential);
      const hex = Buffer.from(created.credential, 'base64url').toString('hex');
      expect(row.rows[0]!.row).not.toContain(hex);
    });
  });

  it('rejects a party that is not a party of the named project, by the database', async () => {
    const mine = await projectWithParties(1);
    const theirs = await projectWithParties(1);
    expect(codeOf(await failure(() => createDirectInvitation(database.db, { projectId: mine.projectId, partyId: theirs.partyIds[0]! })))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
    expect(codeOf(await failure(() => createDirectInvitation(database.db, { projectId: mine.projectId, partyId: randomUUID() })))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
    await withClient(inject('runtimeUrl'), async (c) => {
      const err = await c
        .query('insert into direct_invitation (project_id, party_id, credential_digest) values ($1, $2, $3)', [
          mine.projectId,
          theirs.partyIds[0],
          Buffer.alloc(32, 7),
        ])
        .then(
          () => null,
          (e: { code?: string; constraint?: string }) => ({ code: e.code, constraint: e.constraint }),
        );
      expect(err).toEqual({ code: FOREIGN_KEY_VIOLATION, constraint: 'direct_invitation_party_in_project_fk' });
    });
  });

  it('rejects a duplicate digest and a digest that is not 32 bytes, by the database', async () => {
    const { projectId, partyIds } = await projectWithParties(2);
    const digest = Buffer.from(randomUUID().replaceAll('-', '').repeat(2), 'hex');
    await withClient(inject('runtimeUrl'), async (c) => {
      const insert = 'insert into direct_invitation (project_id, party_id, credential_digest) values ($1, $2, $3)';
      expect(await sqlErrorCode(c, insert, [projectId, partyIds[0], digest])).toBeNull();
      expect(await sqlErrorCode(c, insert, [projectId, partyIds[1], digest])).toBe(UNIQUE_VIOLATION);
      expect(await sqlErrorCode(c, insert, [projectId, partyIds[0], Buffer.alloc(31)])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, insert, [projectId, partyIds[0], Buffer.from('a-plaintext-credential-that-is-not-a-digest')])).toBe(
        CHECK_VIOLATION,
      );
    });
  });

  it('gets its creation time from the database, not the caller', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    await withClient(inject('runtimeUrl'), async (c) => {
      const res = await c.query<{ lag: number }>(
        `insert into direct_invitation (project_id, party_id, credential_digest, created_at) values ($1, $2, $3, '2001-01-01')
         returning extract(epoch from (clock_timestamp() - created_at))::float8 as lag`,
        [projectId, partyIds[0], Buffer.from(randomUUID().replaceAll('-', '').repeat(2), 'hex')],
      );
      expect(res.rows[0]?.lag).toBeGreaterThanOrEqual(0);
      expect(res.rows[0]?.lag).toBeLessThan(60);
    });
  });
});

describe('resolving a direct invitation', () => {
  it('resolves a valid credential to its project and party, with no credential or digest in the result', async () => {
    const { projectId, partyIds } = await projectWithParties(2);
    const created = await invite(projectId, partyIds[1]!);
    const resolved = await resolveDirectInvitation(database.db, created.credential);
    expect(resolved).toEqual({ id: created.id, projectId, partyId: partyIds[1], createdAt: created.createdAt });
    expect(Object.keys(resolved!).sort()).toEqual(['createdAt', 'id', 'partyId', 'projectId']);
  });

  it('does not resolve an unknown credential', async () => {
    const unknown = Buffer.alloc(32, 9).toString('base64url');
    expect(await resolveDirectInvitation(database.db, unknown)).toBeUndefined();
  });

  it('does not resolve malformed credentials, including non-canonical spellings of a real one', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    const malformed = [
      '',
      'short',
      `${created.credential}=`,
      `${created.credential}A`,
      created.credential.slice(0, 42),
      Buffer.from(created.credential, 'base64url').toString('base64'),
      Buffer.from(created.credential, 'base64url').toString('hex'),
      ` ${created.credential}`,
      created.credential.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A')),
    ];
    for (const value of malformed) {
      expect({ value, resolved: await resolveDirectInvitation(database.db, value) }).toEqual({ value, resolved: undefined });
    }
    expect(await resolveDirectInvitation(database.db, null as unknown as string)).toBeUndefined();
  });

  it('looks up by digest: a credential equal to the stored digest text resolves nothing', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    const digestAsCredential = sha256(created.credential).toString('base64url');
    expect(await resolveDirectInvitation(database.db, digestAsCredential)).toBeUndefined();
    expect(await resolveDirectInvitation(database.db, created.credential)).toMatchObject({ id: created.id });
  });
});

describe('claiming a direct invitation', () => {
  it('binds the account to the invitation’s party through S06, exactly once', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    const acct = await newAccount();
    const claimed = await claimDirectInvitation(database.db, created.credential, acct.id);
    expect(claimed.invitation).toEqual({ id: created.id, projectId, partyId: partyIds[0], createdAt: created.createdAt });
    expect(claimed.binding).toEqual({ id: expect.any(String), projectId, partyId: partyIds[0], accountId: acct.id, boundAt: expect.any(Date) });
    expect(await findBindingForParty(database.db, partyIds[0]!)).toEqual(claimed.binding);
  });

  it('is idempotent for the same account', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    const acct = await newAccount();
    const first = await claimDirectInvitation(database.db, created.credential, acct.id);
    const again = await claimDirectInvitation(database.db, created.credential, acct.id);
    expect(again.binding).toEqual(first.binding);
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ n: number }>('select count(*)::int as n from party_account_binding where party_id = $1', [partyIds[0]]),
    );
    expect(rows.rows[0]!.n).toBe(1);
  });

  it('refuses a different account, leaving the original binding unchanged — whichever invitation it uses', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const first = await invite(projectId, partyIds[0]!);
    const second = await invite(projectId, partyIds[0]!);
    const owner = await newAccount();
    const other = await newAccount();
    const bound = await claimDirectInvitation(database.db, first.credential, owner.id);
    for (const credential of [first.credential, second.credential]) {
      expect(await failure(() => claimDirectInvitation(database.db, credential, other.id))).toBeInstanceOf(PartyAlreadyBoundError);
    }
    expect(await findBindingForParty(database.db, partyIds[0]!)).toEqual(bound.binding);
  });

  it('leaves exactly one winner when many accounts claim concurrently, and every loser fails cleanly', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    const accounts = await Promise.all(Array.from({ length: 8 }, () => newAccount()));
    const outcomes = await Promise.allSettled(accounts.map((a) => claimDirectInvitation(database.db, created.credential, a.id)));
    const won = outcomes.filter((o) => o.status === 'fulfilled');
    const lost = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(7);
    for (const o of lost) expect(o.reason).toBeInstanceOf(PartyAlreadyBoundError);
    const durable = await findBindingForParty(database.db, partyIds[0]!);
    expect(durable).toEqual(won[0]!.value.binding);
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ n: number }>('select count(*)::int as n from party_account_binding where party_id = $1', [partyIds[0]]),
    );
    expect(rows.rows[0]!.n).toBe(1);
  });

  it('fails for an unknown account and for an unknown or malformed credential, binding nothing', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    const acct = await newAccount();
    expect(await failure(() => claimDirectInvitation(database.db, created.credential, randomUUID()))).toBeInstanceOf(AccountNotFoundError);
    expect(await failure(() => claimDirectInvitation(database.db, Buffer.alloc(32, 3).toString('base64url'), acct.id))).toBeInstanceOf(
      InvitationNotFoundError,
    );
    expect(await failure(() => claimDirectInvitation(database.db, 'not-a-credential', acct.id))).toBeInstanceOf(InvitationNotFoundError);
    expect(await findBindingForParty(database.db, partyIds[0]!)).toBeUndefined();
  });

  it('cannot bind across projects: the invitation’s own project and party are what is bound', async () => {
    const a = await projectWithParties(1);
    const b = await projectWithParties(1);
    const created = await invite(a.projectId, a.partyIds[0]!);
    const acct = await newAccount();
    const claimed = await claimDirectInvitation(database.db, created.credential, acct.id);
    expect(claimed.binding).toMatchObject({ projectId: a.projectId, partyId: a.partyIds[0] });
    expect(await findBindingForParty(database.db, b.partyIds[0]!)).toBeUndefined();
  });
});

describe('what S07 stores and exposes', () => {
  it('holds exactly an id, the project, the party, the credential digest and the creation time', async () => {
    const columns = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'direct_invitation' order by ordinal_position`,
      ),
    );
    expect(columns.rows).toEqual([
      { column_name: 'id', data_type: 'uuid' },
      { column_name: 'project_id', data_type: 'uuid' },
      { column_name: 'party_id', data_type: 'uuid' },
      { column_name: 'credential_digest', data_type: 'bytea' },
      { column_name: 'created_at', data_type: 'timestamp with time zone' },
    ]);
  });

  it('carries exactly the expected constraints, with no cascading foreign key', async () => {
    const rows = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ name: string; type: string; ondelete: string }>(
        `select conname as name, contype as type, confdeltype as ondelete from pg_constraint
         where conrelid = 'public.direct_invitation'::regclass order by 1`,
      ),
    );
    expect(rows.rows.map((r) => `${r.name}:${r.type}`)).toEqual([
      'direct_invitation_digest_sha256_length:c',
      'direct_invitation_digest_unique:u',
      'direct_invitation_party_in_project_fk:f',
      'direct_invitation_pkey:p',
      'direct_invitation_project_id_project_id_fk:f',
    ]);
    for (const fk of rows.rows.filter((r) => r.type === 'f')) expect({ fk: fk.name, ondelete: fk.ondelete }).toEqual({ fk: fk.name, ondelete: 'a' });
  });

  it('names no recipient, delivery, lifecycle, identity or request-metadata semantic', async () => {
    const names = await withClient(inject('runtimeUrl'), async (c) => {
      const columns = await c.query<{ name: string }>(
        `select column_name as name from information_schema.columns where table_schema = 'public' and table_name = 'direct_invitation'`,
      );
      const constraints = await c.query<{ name: string }>(
        `select conname as name from pg_constraint where conrelid = 'public.direct_invitation'::regclass`,
      );
      return [...columns.rows, ...constraints.rows].map((r) => r.name);
    });
    const definitionNames = Object.keys(getTableColumns(directInvitation)).map((n) => n.toLowerCase());
    expect([...names, ...definitionNames].filter((name) => EXCLUDED_SEMANTICS.some((w) => name.includes(w)))).toEqual([]);
  });

  it('adds no HTTP operation: there is no invitation, claim or link route', () => {
    expect(operations.filter((op) => /invit|claim|link|credential|token/i.test(`${op.name} ${op.path}`))).toEqual([]);
  });

  it('leaks nothing into the project record or the S06 account record', async () => {
    const { projectId, partyIds } = await projectWithParties(1);
    const created = await invite(projectId, partyIds[0]!);
    const acct = await newAccount();
    await claimDirectInvitation(database.db, created.credential, acct.id);
    const projectRecord = JSON.stringify(await findProject(database.db, projectId));
    const accountRecord = JSON.stringify(await findAccount(database.db, acct.id));
    for (const text of [projectRecord, accountRecord]) {
      expect(text).not.toContain(created.credential);
      expect(text).not.toContain(created.id);
      expect(text).not.toMatch(/invit|credential|digest/i);
    }
  });

  it('never writes a credential to a database row or to the log', async () => {
    expect(seenCredentials.length).toBeGreaterThan(10);
    const dump = await withClient(inject('migrationUrl'), async (c) => {
      const tables = await c.query<{ t: string }>(`select table_name as t from information_schema.tables where table_schema = 'public'`);
      const parts: string[] = [];
      for (const { t } of tables.rows) {
        const rows = await c.query<{ r: string }>(`select row_to_json(x)::text as r from public."${t}" x`);
        parts.push(...rows.rows.map((r) => r.r));
      }
      return parts.join('\n');
    });
    const logText = logs.text();
    for (const credential of seenCredentials) {
      expect(dump.includes(credential)).toBe(false);
      expect(logText.includes(credential)).toBe(false);
    }
  });

  it('has no logging, console, network, mail or provider code path', () => {
    const dir = join(import.meta.dirname, '../../src/invitations');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect({ file, hit: /\bconsole\.|logger|pino|fetch\(|nodemailer|smtp|twilio|google|apple/i.test(source.replace(/\/\*\*[\s\S]*?\*\//g, '')) }).toEqual({
        file,
        hit: false,
      });
    }
  });
});

describe('runtime role on direct_invitation', () => {
  it('cannot update, delete or truncate invitations, or call the stamp function', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'update direct_invitation set id = id')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from direct_invitation')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate direct_invitation')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'select direct_invitation_stamp()')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});
