import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Product tables for slices S01 (project and party core), S02 (pairwise
 * agreement topology) and S03 (draft term units). Separate from the Stage 0
 * synthetic fixtures in `src/stage0/tables.ts`.
 *
 * What these tables deliberately do not hold (S01 to S03 invariants; D01, D02, D04, D12):
 * no professional or commercial role, no payer or payee, no structured
 * compensation, obligations or usage rights (term text is opaque), no
 * author or proposer, no acceptance, affirmation, signature
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
export const projectParty = pgTable(
  'project_party',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
  },
  // Lets a pairwise agreement require that each of its parties belongs to
  // the agreement's own project (S02). `id` alone is already unique.
  (table) => [unique('project_party_project_id_id_unique').on(table.projectId, table.id)],
);

/**
 * A private pairwise agreement relationship between two project-local
 * parties under one project (S02; D02 structure ruling). Runtime role:
 * SELECT, INSERT.
 *
 * Topology only. It holds no terms, compensation, obligations, status,
 * finality, proposer, signature or visibility; those are later decisions and
 * attach to this record without changing which two parties it relates.
 *
 * The two sides are interchangeable. They are stored in canonical order
 * (`party_one_id < party_two_id` by UUID value) so that "one" and "two"
 * carry no precedence or direction: the same pair can be written only one
 * way, whatever order a caller supplies. Nothing here limits how many
 * agreement records the same two parties may have.
 */
export const pairwiseAgreement = pgTable(
  'pairwise_agreement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    partyOneId: uuid('party_one_id').notNull(),
    partyTwoId: uuid('party_two_id').notNull(),
  },
  (table) => [
    // Each side must be an existing party of this agreement's project.
    foreignKey({
      name: 'pairwise_agreement_party_one_in_project_fk',
      columns: [table.projectId, table.partyOneId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    foreignKey({
      name: 'pairwise_agreement_party_two_in_project_fk',
      columns: [table.projectId, table.partyTwoId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    check('pairwise_agreement_distinct_parties', sql`${table.partyOneId} <> ${table.partyTwoId}`),
    check('pairwise_agreement_canonical_order', sql`${table.partyOneId} < ${table.partyTwoId}`),
  ],
);

/**
 * A universal term: one safety or consent term for everyone who will be on
 * site, held on the project (S03; D02 structure ruling, reconciliation
 * ruling 11). Runtime role: SELECT, INSERT.
 *
 * One row is one term (D04: every term is individually represented). The
 * text is opaque. Rows are append-only: S03 neither edits nor removes a
 * term. Deliberately absent:
 * requiredness, body and money classification, author, proposer and
 * obligation direction, all still open.
 */
export const universalTerm = pgTable(
  'universal_term',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    // Storage order within the project. Not a ruling-4 presentation order.
    position: integer('position').notNull(),
    content: text('content').notNull(),
  },
  (table) => [
    unique('universal_term_project_id_position_unique').on(table.projectId, table.position),
    check('universal_term_position_positive', sql`${table.position} >= 1`),
    check('universal_term_content_not_blank', sql`${table.content} ~ '[^[:space:]]'`),
  ],
);

/**
 * A pairwise term: one private commercial or craft term on one pairwise
 * agreement (S03; D02 structure ruling). Runtime role: SELECT, INSERT.
 *
 * One row is one term (D04). Append-only and opaque, with the same
 * deliberate absences as `universal_term`.
 */
export const agreementTerm = pgTable(
  'agreement_term',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pairwiseAgreementId: uuid('pairwise_agreement_id')
      .notNull()
      .references(() => pairwiseAgreement.id),
    // Storage order within the agreement. Not a ruling-4 presentation order.
    position: integer('position').notNull(),
    content: text('content').notNull(),
  },
  (table) => [
    unique('agreement_term_pairwise_agreement_id_position_unique').on(table.pairwiseAgreementId, table.position),
    check('agreement_term_position_positive', sql`${table.position} >= 1`),
    check('agreement_term_content_not_blank', sql`${table.content} ~ '[^[:space:]]'`),
  ],
);
