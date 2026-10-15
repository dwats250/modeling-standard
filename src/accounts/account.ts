import { and, eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { account } from './tables.ts';

/**
 * Sign-in accounts (slice S06; D03).
 *
 * Data functions only, with no HTTP route and no caller in production yet.
 * A later authentication adapter is meant to verify a Google or Apple
 * sign-in and then call `resolveAccountForLogin` with the provider's opaque
 * subject. Nothing here talks to a provider, checks a token, or stores one.
 *
 * An account is a sign-in account, not a verified identity: verification is
 * separate and happens at first participation (D11). An account is not a
 * party: parties are project-local (S01) and are bound to an account
 * separately (`binding.ts`).
 */

export const LOGIN_PROVIDERS = ['google', 'apple'] as const;
export type LoginProvider = (typeof LOGIN_PROVIDERS)[number];

/** A provider's opaque subject for one login. A login credential, not identity. */
export interface ExternalLogin {
  readonly provider: LoginProvider;
  readonly providerSubject: string;
}

export interface AccountRecord {
  readonly id: string;
  readonly provider: LoginProvider;
  readonly providerSubject: string;
  readonly createdAt: Date;
}

type AccountRow = typeof account.$inferSelect;

function toRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    provider: row.loginProvider as LoginProvider,
    providerSubject: row.providerSubject,
    createdAt: row.createdAt,
  };
}

/** The account for this exact external login, if one exists. */
export async function findAccountByLogin(db: Executor, login: ExternalLogin): Promise<AccountRecord | undefined> {
  const [row] = await db
    .select()
    .from(account)
    .where(and(eq(account.loginProvider, login.provider), eq(account.providerSubject, login.providerSubject)))
    .limit(1);
  return row ? toRecord(row) : undefined;
}

/**
 * The one account for this external login, created on first use.
 *
 * Race-safe: the database's unique key on (provider, subject) is the final
 * authority. A concurrent resolution of the same login waits for the other
 * insert, does nothing, and then reads the committed row, so both callers
 * get the same account. Call with the database handle or inside a READ
 * COMMITTED transaction; under REPEATABLE READ or SERIALIZABLE the follow-up
 * read cannot see a row committed by another transaction, and this throws
 * rather than inventing a second account.
 *
 * The same subject under a different provider is a different account.
 * Unknown providers and blank subjects are rejected by the database.
 */
export async function resolveAccountForLogin(db: Executor, login: ExternalLogin): Promise<AccountRecord> {
  const [inserted] = await db
    .insert(account)
    .values({ loginProvider: login.provider, providerSubject: login.providerSubject })
    .onConflictDoNothing({ target: [account.loginProvider, account.providerSubject] })
    .returning();
  if (inserted) return toRecord(inserted);
  const existing = await findAccountByLogin(db, login);
  if (!existing) throw new Error('account for this login exists but is not visible to this transaction');
  return existing;
}

export async function findAccount(db: Executor, id: string): Promise<AccountRecord | undefined> {
  const [row] = await db.select().from(account).where(eq(account.id, id)).limit(1);
  return row ? toRecord(row) : undefined;
}
