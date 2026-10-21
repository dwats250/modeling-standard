import { sql } from 'drizzle-orm';
import { check, customType, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { account } from '../accounts/tables.ts';

/**
 * Slice S12: a signed-in browser session for one account (D03: an account is
 * required; sign-in is the door, not identity).
 *
 * A session row records only that a bearer token, whose SHA-256 digest is
 * stored here, signs a browser in as one account until it expires or is
 * ended. The token itself is never stored.
 *
 * Deliberately absent: the token, email, name, provider subject or provider
 * tokens, party or project ids, IP address, user agent, and anything about
 * what the person did while signed in (D10 noise doctrine).
 *
 * Privileges, the database-time stamp and the end-once guard are hand-written
 * SQL in `migrations/`, never here.
 */

/** Raw bytes, stored as PostgreSQL `bytea`. */
const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * One session. Runtime role: SELECT, INSERT, and UPDATE of `ended_at` only
 * (ending a session, once).
 */
export const accountSession = pgTable(
  'account_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    // SHA-256 of the 32 token bytes. The token itself is never stored.
    tokenDigest: bytes('token_digest').notNull(),
    // Set by the database when the row is written; a caller cannot supply it.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Set once, by the database, when the session is ended (sign-out).
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    unique('account_session_token_digest_unique').on(table.tokenDigest),
    check('account_session_token_digest_sha256_length', sql`octet_length(${table.tokenDigest}) = 32`),
    check('account_session_expires_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
