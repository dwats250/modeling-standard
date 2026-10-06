import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Product tables for slice S01 (project and party core). Separate from the
 * Stage 0 synthetic fixtures in `src/stage0/tables.ts`.
 *
 * What these tables deliberately do not hold (S01 invariants, D01, D12):
 * no professional or commercial role, no payer or payee, no compensation,
 * terms, obligations or usage rights, no acceptance, affirmation, signature
 * or witness, no youth, guardian or proxy, no posted/direct-send subtype, and
 * no binding from a party to an account, principal, person or identity.
 *
 * Privileges are granted by hand-written SQL in `migrations/`, never here.
 */

/**
 * The common container for a collaboration (D01). Runtime role: SELECT, INSERT.
 *
 * It carries no product content yet: what a project describes is not part of
 * S01.
 */
export const project = pgTable('project', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Audit and authorization fact: the principal that created the project.
  // Not a party, and not a commercial or professional role (D01: creator is
  // role-neutral). Internal: never returned in a response.
  createdByPrincipalId: text('created_by_principal_id').notNull(),
  // Audit fact. Internal: never returned in a response.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A project-local party: someone taking part in one project. Runtime role:
 * SELECT, INSERT.
 *
 * Deliberately only an identifier scoped to its project. It has no role, no
 * label, and no link to an account, principal or person; how a party is
 * identified and how someone joins is D03, still open.
 */
export const projectParty = pgTable('project_party', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => project.id),
});
