import { customType, pgTable, text, uuid, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Stage 0 synthetic tables. These exist only to prove engineering mechanisms
 * (authorization on a loaded target, input/output discipline, transactions,
 * runtime-role privileges, evidence protection). They are not a product
 * model and must not be extended into one.
 *
 * Privileges are granted by hand-written SQL in `migrations/`, never here.
 */

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  fromDriver: (value) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
});

/** A synthetic resource with an owner. Runtime role: SELECT, INSERT. */
export const syntheticResource = pgTable('synthetic_resource', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Internal: used by the access policy, never returned in a response.
  ownerPrincipalId: text('owner_principal_id').notNull(),
  label: text('label').notNull(),
});

/**
 * Synthetic evidence bytes with their SHA-256 digest. Runtime role: SELECT,
 * INSERT only. The CHECK constraint makes PostgreSQL itself confirm that the
 * stored digest matches the stored bytes at write time.
 */
export const syntheticEvidence = pgTable(
  'synthetic_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    payload: bytea('payload').notNull(),
    sha256: bytea('sha256').notNull(),
  },
  (table) => [check('synthetic_evidence_sha256_matches_payload', sql`${table.sha256} = sha256(${table.payload})`)],
);
