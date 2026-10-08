import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Product tables for slices S01 (project and party core), S02 (pairwise
 * agreement topology), S03 (term units), S04 (presented versions) and S05
 * (per-term affirmation evidence). Separate from the Stage 0
 * synthetic fixtures in `src/stage0/tables.ts`.
 *
 * What these tables deliberately do not hold (S01 to S05 invariants; D01, D02, D04, D12):
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
    // Lets an affirmation (S05) require that its party is one of this
    // agreement's two parties, declaratively. `id` alone is already unique.
    unique('pairwise_agreement_id_parties_unique').on(table.id, table.partyOneId, table.partyTwoId),
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
    // Target for a presented universal term's same-project check (S04).
    // `id` alone is already unique.
    unique('universal_term_project_id_id_unique').on(table.projectId, table.id),
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
    // Target for a presented pairwise term's same-agreement check (S04).
    unique('agreement_term_pairwise_agreement_id_id_unique').on(table.pairwiseAgreementId, table.id),
    check('agreement_term_position_positive', sql`${table.position} >= 1`),
    check('agreement_term_content_not_blank', sql`${table.content} ~ '[^[:space:]]'`),
  ],
);

/**
 * A presented version of a pairwise agreement: the exact terms frozen for
 * presentation within the agreement (S04; DOCTRINE:46 clause text is frozen
 * as presented; D02 drop-and-resend). Runtime role: SELECT, INSERT. It
 * records no recipient, viewing or delivery: what each person saw is later,
 * per-party evidence (D10).
 *
 * Sealed on creation: `term_count` fixes how many terms the version holds,
 * and deferred triggers (`migrations/0010`) reject a transaction that leaves
 * the version with any other number of terms or with positions outside
 * 1..term_count, so no term can be added to a version after it is created.
 * With no UPDATE or DELETE grant, nothing in it can change afterwards.
 * `sequence` must be the container's next number and `presented_at` is the
 * database clock time the row was written; triggers enforce both.
 *
 * Deliberately absent: who presented and to whom, status, supersession,
 * finality, completeness validation, digest. A later version does not
 * withdraw or replace an earlier one here; that lifecycle is open (D02).
 */
export const agreementVersion = pgTable(
  'agreement_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pairwiseAgreementId: uuid('pairwise_agreement_id')
      .notNull()
      .references(() => pairwiseAgreement.id),
    sequence: integer('sequence').notNull(),
    termCount: integer('term_count').notNull(),
    presentedAt: timestamp('presented_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('agreement_version_pairwise_agreement_id_sequence_unique').on(table.pairwiseAgreementId, table.sequence),
    // Target for the composite key from presented terms.
    unique('agreement_version_pairwise_agreement_id_id_unique').on(table.pairwiseAgreementId, table.id),
    check('agreement_version_sequence_positive', sql`${table.sequence} >= 1`),
    check('agreement_version_term_count_positive', sql`${table.termCount} >= 1`),
  ],
);

/**
 * One term as presented in a pairwise version: a copy of an `agreement_term`
 * of the same agreement, in its presented position (S04). Runtime role:
 * SELECT, INSERT.
 *
 * The text is copied, and a trigger rejects a copy that differs from its
 * source term, so the presented wording is the wording that was written.
 */
export const agreementVersionTerm = pgTable(
  'agreement_version_term',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pairwiseAgreementId: uuid('pairwise_agreement_id').notNull(),
    agreementVersionId: uuid('agreement_version_id').notNull(),
    agreementTermId: uuid('agreement_term_id').notNull(),
    position: integer('position').notNull(),
    content: text('content').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'agreement_version_term_version_in_agreement_fk',
      columns: [table.pairwiseAgreementId, table.agreementVersionId],
      foreignColumns: [agreementVersion.pairwiseAgreementId, agreementVersion.id],
    }),
    foreignKey({
      name: 'agreement_version_term_source_in_agreement_fk',
      columns: [table.pairwiseAgreementId, table.agreementTermId],
      foreignColumns: [agreementTerm.pairwiseAgreementId, agreementTerm.id],
    }),
    unique('agreement_version_term_version_position_unique').on(table.agreementVersionId, table.position),
    unique('agreement_version_term_version_source_unique').on(table.agreementVersionId, table.agreementTermId),
    // Target for an affirmation's same-version check (S05).
    unique('agreement_version_term_version_id_unique').on(table.agreementVersionId, table.id),
    check('agreement_version_term_position_positive', sql`${table.position} >= 1`),
  ],
);

/**
 * A presented version of a project's universal terms: the exact safety and
 * consent terms frozen for presentation (S04). Runtime role: SELECT, INSERT.
 * Sealed, numbered and timestamped exactly as `agreement_version`, with the
 * same deliberate absences. Who is on site, and whether everyone on site sees
 * the same version, are open (D02 f, D10). Whether a universal term may be
 * left out of a later version is open too (VISION:374, ruling 14).
 */
export const universalVersion = pgTable(
  'universal_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    sequence: integer('sequence').notNull(),
    termCount: integer('term_count').notNull(),
    presentedAt: timestamp('presented_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('universal_version_project_id_sequence_unique').on(table.projectId, table.sequence),
    unique('universal_version_project_id_id_unique').on(table.projectId, table.id),
    check('universal_version_sequence_positive', sql`${table.sequence} >= 1`),
    check('universal_version_term_count_positive', sql`${table.termCount} >= 1`),
  ],
);

/** One universal term as presented: a faithful copy of a `universal_term` of the same project (S04). */
export const universalVersionTerm = pgTable(
  'universal_version_term',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull(),
    universalVersionId: uuid('universal_version_id').notNull(),
    universalTermId: uuid('universal_term_id').notNull(),
    position: integer('position').notNull(),
    content: text('content').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'universal_version_term_version_in_project_fk',
      columns: [table.projectId, table.universalVersionId],
      foreignColumns: [universalVersion.projectId, universalVersion.id],
    }),
    foreignKey({
      name: 'universal_version_term_source_in_project_fk',
      columns: [table.projectId, table.universalTermId],
      foreignColumns: [universalTerm.projectId, universalTerm.id],
    }),
    unique('universal_version_term_version_position_unique').on(table.universalVersionId, table.position),
    unique('universal_version_term_version_source_unique').on(table.universalVersionId, table.universalTermId),
    unique('universal_version_term_version_id_unique').on(table.universalVersionId, table.id),
    check('universal_version_term_position_positive', sql`${table.position} >= 1`),
  ],
);

/**
 * One party's affirmation of one presented pairwise term (S05; D04: every
 * term is individually affirmable and is the unit of the record;
 * DOCTRINE:51: a signature is bound to the clauses it affirms). Runtime
 * role: SELECT, INSERT.
 *
 * The agreement's two parties are stored alongside so the database itself
 * can require, by foreign key and check, that the affirming party is one of
 * them (D02: the parties named in that agreement; D12: no one affirms for
 * another). A trigger (`migrations/0012`) accepts affirmations only against
 * the agreement's first presented version (ruling 6 escalation is not yet
 * specified) and stamps `affirmed_at` from the database clock.
 *
 * Deliberately absent: finality or status, declines, withdrawal, group
 * affirmation, principal, credential, IP or device.
 */
export const agreementAffirmation = pgTable(
  'agreement_affirmation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pairwiseAgreementId: uuid('pairwise_agreement_id').notNull(),
    partyOneId: uuid('party_one_id').notNull(),
    partyTwoId: uuid('party_two_id').notNull(),
    agreementVersionId: uuid('agreement_version_id').notNull(),
    agreementVersionTermId: uuid('agreement_version_term_id').notNull(),
    partyId: uuid('party_id').notNull(),
    affirmedAt: timestamp('affirmed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'agreement_affirmation_pair_fk',
      columns: [table.pairwiseAgreementId, table.partyOneId, table.partyTwoId],
      foreignColumns: [pairwiseAgreement.id, pairwiseAgreement.partyOneId, pairwiseAgreement.partyTwoId],
    }),
    foreignKey({
      name: 'agreement_affirmation_version_in_agreement_fk',
      columns: [table.pairwiseAgreementId, table.agreementVersionId],
      foreignColumns: [agreementVersion.pairwiseAgreementId, agreementVersion.id],
    }),
    foreignKey({
      name: 'agreement_affirmation_term_in_version_fk',
      columns: [table.agreementVersionId, table.agreementVersionTermId],
      foreignColumns: [agreementVersionTerm.agreementVersionId, agreementVersionTerm.id],
    }),
    check(
      'agreement_affirmation_party_in_pair',
      sql`${table.partyId} = ${table.partyOneId} or ${table.partyId} = ${table.partyTwoId}`,
    ),
    unique('agreement_affirmation_term_party_unique').on(table.agreementVersionTermId, table.partyId),
  ],
);

/**
 * One party's affirmation of one presented universal term (S05). Runtime
 * role: SELECT, INSERT. The party must be a party of the project. Recording
 * an affirmation decides nothing about who must affirm: who is on site is
 * open (D02 f). First-version rule and database time as for
 * `agreement_affirmation`, with the same deliberate absences.
 */
export const universalAffirmation = pgTable(
  'universal_affirmation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull(),
    universalVersionId: uuid('universal_version_id').notNull(),
    universalVersionTermId: uuid('universal_version_term_id').notNull(),
    partyId: uuid('party_id').notNull(),
    affirmedAt: timestamp('affirmed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'universal_affirmation_party_in_project_fk',
      columns: [table.projectId, table.partyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    foreignKey({
      name: 'universal_affirmation_version_in_project_fk',
      columns: [table.projectId, table.universalVersionId],
      foreignColumns: [universalVersion.projectId, universalVersion.id],
    }),
    foreignKey({
      name: 'universal_affirmation_term_in_version_fk',
      columns: [table.universalVersionId, table.universalVersionTermId],
      foreignColumns: [universalVersionTerm.universalVersionId, universalVersionTerm.id],
    }),
    unique('universal_affirmation_term_party_unique').on(table.universalVersionTermId, table.partyId),
  ],
);
