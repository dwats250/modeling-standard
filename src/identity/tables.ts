import { sql } from 'drizzle-orm';
import { check, customType, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { directInvitation } from '../invitations/tables.ts';

/**
 * Slice S12: one sign-in attempt, started from a real direct invitation and
 * bound to the browser that started it.
 *
 * An attempt lives for minutes and is deleted when its callback consumes it
 * (atomically, once). It holds digests of the OAuth `state`, the OpenID
 * `nonce` and the browser-binding secret; the PKCE verifier in clear,
 * because it must be sent to the token endpoint; the redirect URI the
 * authorization request named; and the invitation it was started from.
 *
 * Deliberately absent: the raw invitation credential, any token, the
 * browser-binding secret itself, email, name, IP address and user agent.
 *
 * Privileges and the database-time stamp are hand-written SQL in
 * `migrations/`, never here.
 */

/** Raw bytes, stored as PostgreSQL `bytea`. */
const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/** Runtime role: SELECT, INSERT, DELETE (consuming an attempt deletes it). */
export const signInAttempt = pgTable(
  'sign_in_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stateDigest: bytes('state_digest').notNull(),
    bindingDigest: bytes('binding_digest').notNull(),
    nonceDigest: bytes('nonce_digest').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    provider: text('provider').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    invitationId: uuid('invitation_id')
      .notNull()
      .references(() => directInvitation.id),
    // Set by the database when the row is written; a caller cannot supply it.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('sign_in_attempt_state_digest_unique').on(table.stateDigest),
    check(
      'sign_in_attempt_digests_sha256_length',
      sql`octet_length(${table.stateDigest}) = 32 and octet_length(${table.bindingDigest}) = 32 and octet_length(${table.nonceDigest}) = 32`,
    ),
    check('sign_in_attempt_code_verifier_shape', sql`${table.codeVerifier} ~ '^[A-Za-z0-9_-]{43,128}$'`),
    check('sign_in_attempt_provider_shape', sql`${table.provider} ~ '^[a-z]{1,32}$'`),
    check('sign_in_attempt_expires_after_creation', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
