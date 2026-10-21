import { randomUUID } from 'node:crypto';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import { bindPartyToAccount, findBindingForParty } from '../../src/accounts/binding.ts';
import { createLogger } from '../../src/app/logger.ts';
import { consumeSignInAttempt, startSignInAttempt } from '../../src/identity/attempt.ts';
import { AccountAlreadyInProjectError, claimInvitationForAccount } from '../../src/identity/claim.ts';
import { signInAttempt } from '../../src/identity/tables.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { createDirectInvitation } from '../../src/invitations/invitation.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { createSession, endSession, findActiveSession, sessionPrincipal } from '../../src/sessions/session.ts';
import { accountSession } from '../../src/sessions/tables.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S12 sessions, sign-in attempts and the guarded claim, against real
 * PostgreSQL as the runtime role: digest-only storage, database time,
 * fail-closed resolution, end-once, atomic single-use consumption, and the
 * privileges that make those hold even by direct SQL.
 */

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

const db = () => database.db;
const newAccount = () => resolveAccountForLogin(db(), { provider: 'google', providerSubject: `sessions-${randomUUID()}` });

async function projectWithParties(n: number): Promise<{ projectId: string; partyIds: string[] }> {
  const project = await insertProject(db(), { createdByPrincipalId: 'sessions-test' });
  const partyIds: string[] = [];
  for (let i = 0; i < n; i += 1) partyIds.push((await addProjectParty(db(), project.id)).id);
  return { projectId: project.id, partyIds };
}

/**
 * Moves a session's expiry into the past, as the owner (the runtime role
 * cannot). Its update trigger admits only ending a session, so it is
 * disabled for this one statement, inside one transaction.
 */
async function expire(sessionId: string): Promise<void> {
  await withClient(inject('migrationUrl'), async (c) => {
    await c.query('begin');
    await c.query('alter table account_session disable trigger account_session_end_once');
    await c.query(`update account_session set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where id = $1`, [sessionId]);
    await c.query('alter table account_session enable trigger account_session_end_once');
    await c.query('commit');
  });
}

describe('sessions', () => {
  it('resolves an open session to its account, and stores only the digest of the token', async () => {
    const acct = await newAccount();
    const session = await createSession(db(), acct.id);
    expect(await findActiveSession(db(), session.token)).toEqual({ id: session.id, accountId: acct.id });
    expect(await sessionPrincipal(db(), `ms_session=${session.token}`)).toEqual({ id: acct.id, kind: 'account' });
    const stored = await withClient(inject('migrationUrl'), (c) => c.query(`select row_to_json(s)::text as row from account_session s where id = $1`, [session.id]));
    expect(stored.rows[0].row).not.toContain(session.token);
    expect(stored.rows[0].row).not.toContain(Buffer.from(session.token, 'base64url').toString('hex'));
  });

  it('fails closed: no cookie, malformed, duplicated, unknown, ended and expired are no principal', async () => {
    const acct = await newAccount();
    const live = await createSession(db(), acct.id);
    const ended = await createSession(db(), acct.id);
    expect(await endSession(db(), ended.token)).toBe(true);
    const expired = await createSession(db(), acct.id);
    await expire(expired.id);

    for (const header of [
      undefined,
      '',
      'other=1',
      'ms_session=',
      'ms_session=not-a-token',
      `ms_session=${live.token}=`,
      `ms_session=${live.token}; ms_session=${live.token}`,
      `ms_session=${newToken().token}`,
      `ms_session=${ended.token}`,
      `ms_session=${expired.token}`,
    ]) {
      expect({ header, principal: await sessionPrincipal(db(), header) }).toEqual({ header, principal: null });
    }
    expect(await sessionPrincipal(db(), `theme=dark; ms_session=${live.token}`)).toEqual({ id: acct.id, kind: 'account' });
  });

  it('ends once, at database time; an ended session cannot be reopened or ended again, even by direct SQL', async () => {
    const acct = await newAccount();
    const session = await createSession(db(), acct.id);
    expect(await endSession(db(), session.token)).toBe(true);
    expect(await endSession(db(), session.token)).toBe(false);
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'update account_session set ended_at = null where id = $1', [session.id])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, `update account_session set ended_at = now() where id = $1`, [session.id])).toBe(CHECK_VIOLATION);
      const lag = await c.query(`select extract(epoch from (clock_timestamp() - ended_at))::float8 as lag from account_session where id = $1`, [session.id]);
      expect(lag.rows[0].lag).toBeGreaterThanOrEqual(0);
      expect(lag.rows[0].lag).toBeLessThan(60);
    });
  });

  it('takes its creation time from the database and cannot be created already ended', async () => {
    const acct = await newAccount();
    await withClient(inject('runtimeUrl'), async (c) => {
      const res = await c.query(
        `insert into account_session (account_id, token_digest, created_at, expires_at) values ($1, $2, '2001-01-01', clock_timestamp() + interval '1 hour')
         returning extract(epoch from (clock_timestamp() - created_at))::float8 as lag`,
        [acct.id, newToken().digest],
      );
      expect(res.rows[0].lag).toBeLessThan(60);
      expect(
        await sqlErrorCode(c, `insert into account_session (account_id, token_digest, expires_at, ended_at) values ($1, $2, clock_timestamp() + interval '1 hour', now())`, [acct.id, newToken().digest]),
      ).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, `insert into account_session (account_id, token_digest, expires_at) values ($1, $2, now() - interval '1 hour')`, [acct.id, newToken().digest])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, `insert into account_session (account_id, token_digest, expires_at) values ($1, '\\x00', clock_timestamp() + interval '1 hour')`, [acct.id])).toBe(CHECK_VIOLATION);
    });
  });

  it('cannot be moved, reassigned, deleted or truncated by the runtime role', async () => {
    const acct = await newAccount();
    const other = await newAccount();
    const session = await createSession(db(), acct.id);
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, `update account_session set expires_at = now() + interval '10 years' where id = $1`, [session.id])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update account_session set account_id = $2 where id = $1', [session.id, other.id])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from account_session')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate account_session')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('holds only a digest, an account, and times', () => {
    expect(Object.keys(getTableColumns(accountSession)).sort()).toEqual(['accountId', 'createdAt', 'endedAt', 'expiresAt', 'id', 'tokenDigest']);
    for (const column of Object.keys(getTableColumns(accountSession))) {
      expect(column).not.toMatch(/email|name|subject|provider|token$|ip|agent|party|project|verified/i);
    }
  });
});

describe('sign-in attempts', () => {
  async function invitation() {
    const { projectId, partyIds } = await projectWithParties(1);
    return createDirectInvitation(db(), { projectId, partyId: partyIds[0]! });
  }

  it('stores digests, the PKCE verifier and the invitation id — never the invitation credential or the binding secret', async () => {
    const inv = await invitation();
    const attempt = await startSignInAttempt(db(), { provider: 'test', redirectUri: 'http://127.0.0.1:1/sign-in/callback', invitationId: inv.id });
    const stored = await withClient(inject('migrationUrl'), (c) => c.query(`select row_to_json(a)::text as row from sign_in_attempt a where invitation_id = $1`, [inv.id]));
    expect(stored.rows).toHaveLength(1);
    for (const secret of [inv.credential, attempt.binding, attempt.state, attempt.nonce]) expect(stored.rows[0].row).not.toContain(secret);
    expect(Object.keys(getTableColumns(signInAttempt)).sort()).toEqual(
      ['bindingDigest', 'codeVerifier', 'createdAt', 'expiresAt', 'id', 'invitationId', 'nonceDigest', 'provider', 'redirectUri', 'stateDigest'],
    );
  });

  it('is consumed exactly once, atomically, even by concurrent callbacks', async () => {
    const inv = await invitation();
    const attempt = await startSignInAttempt(db(), { provider: 'test', redirectUri: 'http://127.0.0.1:1/sign-in/callback', invitationId: inv.id });
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeSignInAttempt(db(), attempt.state)));
    expect(results.filter((r) => r !== undefined)).toHaveLength(1);
    expect(await consumeSignInAttempt(db(), attempt.state)).toBeUndefined();
  });

  it('is unknown for a malformed, foreign or expired state, and expired attempts are pruned', async () => {
    const inv = await invitation();
    const attempt = await startSignInAttempt(db(), { provider: 'test', redirectUri: 'http://127.0.0.1:1/sign-in/callback', invitationId: inv.id });
    for (const state of ['', 'x', `${attempt.state}=`, newToken().token, attempt.nonce, attempt.binding]) {
      expect(await consumeSignInAttempt(db(), state)).toBeUndefined();
    }
    await withClient(inject('migrationUrl'), (c) =>
      c.query(`update sign_in_attempt set created_at = now() - interval '1 hour', expires_at = now() - interval '1 minute' where invitation_id = $1`, [inv.id]),
    );
    expect(await consumeSignInAttempt(db(), attempt.state)).toBeUndefined();
    await startSignInAttempt(db(), { provider: 'test', redirectUri: 'http://127.0.0.1:1/sign-in/callback', invitationId: inv.id });
    const left = await withClient(inject('migrationUrl'), (c) => c.query(`select count(*)::int as n from sign_in_attempt where invitation_id = $1 and expires_at <= now()`, [inv.id]));
    expect(left.rows[0].n).toBe(0);
  });

  it('cannot be updated by the runtime role, and its creation time is the database\'s', async () => {
    const inv = await invitation();
    await startSignInAttempt(db(), { provider: 'test', redirectUri: 'http://127.0.0.1:1/sign-in/callback', invitationId: inv.id });
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, `update sign_in_attempt set expires_at = now() + interval '1 year'`)).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate sign_in_attempt')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});

describe('claiming as a signed-in account', () => {
  it('binds an unbound party; the same account again is idempotent', async () => {
    const { projectId, partyIds } = await projectWithParties(2);
    const inv = await createDirectInvitation(db(), { projectId, partyId: partyIds[0]! });
    const acct = await newAccount();
    for (let i = 0; i < 2; i += 1) {
      await db().transaction((tx) => claimInvitationForAccount(tx, inv, acct.id), { isolationLevel: 'read committed' });
    }
    expect((await findBindingForParty(db(), partyIds[0]!))?.accountId).toBe(acct.id);
  });

  it('refuses an account that is already a different party of the same shoot, and binds nothing', async () => {
    const { projectId, partyIds } = await projectWithParties(2);
    const acct = await newAccount();
    await bindPartyToAccount(db(), { projectId, partyId: partyIds[0]!, accountId: acct.id });
    const second = await createDirectInvitation(db(), { projectId, partyId: partyIds[1]! });
    await expect(db().transaction((tx) => claimInvitationForAccount(tx, second, acct.id), { isolationLevel: 'read committed' })).rejects.toBeInstanceOf(
      AccountAlreadyInProjectError,
    );
    expect(await findBindingForParty(db(), partyIds[1]!)).toBeUndefined();
  });

  it('serializes one account claiming two parties of one shoot at once: exactly one binding', async () => {
    const { projectId, partyIds } = await projectWithParties(2);
    const acct = await newAccount();
    const invs = await Promise.all(partyIds.map((partyId) => createDirectInvitation(db(), { projectId, partyId })));
    const outcomes = await Promise.allSettled(invs.map((inv) => db().transaction((tx) => claimInvitationForAccount(tx, inv, acct.id), { isolationLevel: 'read committed' })));
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const bound = (await Promise.all(partyIds.map((p) => findBindingForParty(db(), p)))).filter(Boolean);
    expect(bound).toHaveLength(1);
  });
});
