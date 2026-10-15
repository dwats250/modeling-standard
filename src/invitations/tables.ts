import { sql } from 'drizzle-orm';
import { check, customType, foreignKey, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { project, projectParty } from '../projects/tables.ts';

/**
 * Slice S07: the direct-send invitation (D03, DECIDED for the photo-shoot
 * scope).
 *
 * The link is the invitation. This table records only that an invitation
 * credential exists for one project-local party: the SHA-256 digest of the
 * credential, never the credential itself, and the time the database wrote
 * the row.
 *
 * Deliberately absent: recipient identity or address, delivery channel,
 * sent, delivered, opened or forwarded state, expiry, rotation or resend,
 * any accepted, declined, revoked or cancelled status, and IP or device
 * data. Claiming an invitation is recorded only as the S06 party-account
 * binding, not here.
 *
 * Privileges and the database-time stamp are hand-written SQL in
 * `migrations/`, never here.
 */

/** Raw bytes, stored as PostgreSQL `bytea`. */
const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * One direct invitation credential for one project-local party. Runtime
 * role: SELECT, INSERT.
 *
 * Only two invariants are decided: each credential digest is unique, and the
 * party belongs to the named project. Nothing limits how many invitations a
 * party may have; rotation, reissue and revocation are not defined.
 */
export const directInvitation = pgTable(
  'direct_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    partyId: uuid('party_id').notNull(),
    // SHA-256 of the 32 credential bytes. The credential itself is never stored.
    credentialDigest: bytes('credential_digest').notNull(),
    // Set by the database when the row is written (migrations/0018); a
    // caller cannot supply it.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The party must be an existing party of the named project.
    foreignKey({
      name: 'direct_invitation_party_in_project_fk',
      columns: [table.projectId, table.partyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    unique('direct_invitation_digest_unique').on(table.credentialDigest),
    check('direct_invitation_digest_sha256_length', sql`octet_length(${table.credentialDigest}) = 32`),
  ],
);
