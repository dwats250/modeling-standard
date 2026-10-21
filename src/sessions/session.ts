import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Principal, ResolvePrincipal } from '../authorization/access.ts';
import type { ResponseCookie } from '../http/cookies.ts';
import { clearCookie, cookieValues } from '../http/cookies.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { newToken, tokenDigest } from '../infrastructure/tokens.ts';
import { accountSession } from './tables.ts';

/**
 * Browser sessions (slice S12; D03: an account is required, sign-in is the
 * door, not identity).
 *
 * A session is a bearer token in an `HttpOnly` cookie that signs a browser in
 * as one account until it expires (absolute, 12 hours) or is ended (sign-out).
 * Only the token's SHA-256 digest is stored. Whoever holds the cookie is that
 * account: it is a credential, not identity, and not verification (D11).
 *
 * Resolution fails closed. No cookie is no principal. A cookie that is
 * malformed, sent more than once, unknown, expired or ended is no principal,
 * never a fallback to anything else.
 */

export const SESSION_COOKIE = 'ms_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface CreatedSession {
  readonly id: string;
  /** The raw token: returned once, set as the cookie, never stored. */
  readonly token: string;
}

export interface ActiveSession {
  readonly id: string;
  readonly accountId: string;
}

/** Creates a session for the account. Call with the database handle or inside a transaction. */
export async function createSession(db: Executor, accountId: string, ttlSeconds = SESSION_TTL_SECONDS): Promise<CreatedSession> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) throw new Error('session lifetime must be a positive whole number of seconds');
  const { token, digest } = newToken();
  const [row] = await db
    .insert(accountSession)
    .values({ accountId, tokenDigest: digest, expiresAt: sql`clock_timestamp() + make_interval(secs => ${ttlSeconds})` })
    .returning({ id: accountSession.id });
  if (!row) throw new Error('insert returned no row');
  return { id: row.id, token };
}

/** The open, unexpired session a token names, or undefined for anything else. */
export async function findActiveSession(db: Executor, token: unknown): Promise<ActiveSession | undefined> {
  const digest = tokenDigest(token);
  if (!digest) return undefined;
  const [row] = await db
    .select({ id: accountSession.id, accountId: accountSession.accountId })
    .from(accountSession)
    .where(and(eq(accountSession.tokenDigest, digest), isNull(accountSession.endedAt), gt(accountSession.expiresAt, sql`clock_timestamp()`)))
    .limit(1);
  return row;
}

/** Ends the session a token names, if it is open. True if a session was ended. */
export async function endSession(db: Executor, token: unknown): Promise<boolean> {
  const digest = tokenDigest(token);
  if (!digest) return false;
  const rows = await db
    .update(accountSession)
    .set({ endedAt: sql`clock_timestamp()` })
    .where(and(eq(accountSession.tokenDigest, digest), isNull(accountSession.endedAt)))
    .returning({ id: accountSession.id });
  return rows.length > 0;
}

/** True if the Cookie header carries a session cookie at all, valid or not. */
export function carriesSessionCookie(cookieHeader: string | undefined): boolean {
  return cookieValues(cookieHeader, SESSION_COOKIE).length > 0;
}

/**
 * The account principal for a Cookie header, or null. Exactly one session
 * cookie naming an open, unexpired session; anything else is null.
 */
export async function sessionPrincipal(db: Executor, cookieHeader: string | undefined): Promise<Principal | null> {
  const values = cookieValues(cookieHeader, SESSION_COOKIE);
  if (values.length !== 1) return null;
  const session = await findActiveSession(db, values[0]);
  return session ? { id: session.accountId, kind: 'account' } : null;
}

/** The production principal source: the session cookie, and nothing else. */
export function createSessionResolver(db: Executor): ResolvePrincipal {
  return (request) => sessionPrincipal(db, request.headers.cookie);
}

export function sessionCookie(token: string, ttlSeconds = SESSION_TTL_SECONDS): ResponseCookie {
  return { name: SESSION_COOKIE, value: token, maxAge: ttlSeconds, path: '/', sameSite: 'Lax' };
}

export function clearSessionCookie(): ResponseCookie {
  return clearCookie(SESSION_COOKIE);
}
