import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pairwiseAgreement, project, projectParty } from '../projects/tables.ts';

/**
 * Slice S08: the draft live brief (D02, D04, D10; HC1, HC2).
 *
 * One mutable workspace per project, holding brief items. This is draft
 * composition only: there is no phase, and nothing here enforces a rule whose
 * meaning begins at sharing (S09). Live state is not evidence (HC1), so these
 * tables carry no timestamp, author, proposer, revision, history,
 * requiredness or tick column, and the runtime role may delete draft items.
 *
 * Privileges and the pair-subject trigger are hand-written SQL in
 * `migrations/`, never here.
 */

/**
 * The live brief: one per project. Runtime role: SELECT, INSERT.
 *
 * S08 columns only; S09 adds the phase. No timestamps: when people act is
 * noise (D10, noise doctrine).
 */
export const liveBrief = pgTable(
  'live_brief',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
  },
  (table) => [
    unique('live_brief_one_per_project').on(table.projectId),
    // Containment target for brief items. `id` alone is already unique.
    unique('live_brief_id_project_unique').on(table.id, table.projectId),
  ],
);

/**
 * One term or field of the brief. Runtime role: SELECT, INSERT, DELETE, and
 * UPDATE of content, value, pending and position only.
 *
 * Each column is one concept:
 * - `layer`: the visibility and affirmation layer (universal, shared, money);
 * - `pairwise_agreement_id`: optional pair scope (required for money, never
 *   for universal);
 * - `subject_party_id`: optional subject, the one party the term is about,
 *   who controls it (Q7), in any layer;
 * - `shape`: how the subject controls it, present exactly with a subject;
 * - `item_key`: semantic identity of a product-known item, nothing more. It
 *   does not mean required, immutable, product-authored, non-removable or
 *   deliberate-tick; those are later policies;
 * - `content`: the exact wording currently in the brief. A future catalogue
 *   may supply it, but it is always stored here before anyone acts on it;
 * - `value`: the supplied value of a field;
 * - `pending`: null when settled, `decide_together`, or `subject` (an open
 *   parameter awaiting its subject);
 * - `position`: display order only.
 */
export const briefItem = pgTable(
  'brief_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    briefId: uuid('brief_id').notNull(),
    projectId: uuid('project_id').notNull(),
    layer: text('layer').notNull(),
    pairwiseAgreementId: uuid('pairwise_agreement_id'),
    subjectPartyId: uuid('subject_party_id'),
    shape: text('shape'),
    itemKey: text('item_key'),
    content: text('content'),
    value: text('value'),
    pending: text('pending'),
    position: integer('position').notNull(),
  },
  // Every check is written null-safe (IS [NOT] DISTINCT FROM): a CHECK that
  // evaluates to NULL passes, so a plain `=` against a nullable column would
  // silently admit the row it is meant to refuse.
  (table) => [
    foreignKey({
      name: 'brief_item_in_brief_fk',
      columns: [table.briefId, table.projectId],
      foreignColumns: [liveBrief.id, liveBrief.projectId],
    }),
    foreignKey({
      name: 'brief_item_pair_in_project_fk',
      columns: [table.projectId, table.pairwiseAgreementId],
      foreignColumns: [pairwiseAgreement.projectId, pairwiseAgreement.id],
    }),
    foreignKey({
      name: 'brief_item_subject_in_project_fk',
      columns: [table.projectId, table.subjectPartyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    check('brief_item_layer_known', sql`${table.layer} in ('universal', 'shared', 'money')`),
    check('brief_item_shape_known', sql`${table.shape} in ('declaration', 'request', 'open_parameter')`),
    check(
      'brief_item_item_key_known',
      sql`${table.itemKey} in ('fee', 'no_means_no', 'coverage_level', 'physical_contact', 'stop_rule')`,
    ),
    check('brief_item_pending_known', sql`${table.pending} in ('decide_together', 'subject')`),
    check('brief_item_content_nonblank', sql`${table.content} ~ '[^[:space:]]'`),
    check('brief_item_value_nonblank', sql`${table.value} ~ '[^[:space:]]'`),
    // Money is private to the pair it is between (A2, D10).
    check('brief_item_money_is_pair_scoped', sql`${table.layer} <> 'money' OR ${table.pairwiseAgreementId} IS NOT NULL`),
    // "Money is not a category, it is one field: the fee" (Q6).
    check('brief_item_money_is_fee', sql`${table.layer} <> 'money' OR ${table.itemKey} IS NOT DISTINCT FROM 'fee'`),
    check('brief_item_fee_is_money', sql`${table.itemKey} IS DISTINCT FROM 'fee' OR ${table.layer} = 'money'`),
    // Universal safety is the same terms for everyone on site (Q14). A
    // subject is allowed (Q7).
    check(
      'brief_item_universal_is_project_wide',
      sql`${table.layer} <> 'universal' OR ${table.pairwiseAgreementId} IS NULL`,
    ),
    // A safety term every person affirms (Q13).
    check(
      'brief_item_no_means_no_is_universal',
      sql`${table.itemKey} IS DISTINCT FROM 'no_means_no' OR ${table.layer} = 'universal'`,
    ),
    // Shape is how the subject controls the term (Q7).
    check('brief_item_shape_iff_subject', sql`(${table.subjectPartyId} IS NULL) = (${table.shape} IS NULL)`),
    // A drafter-written item is its wording; a keyed item may wait in the
    // draft for materialized wording, which S09 requires before sharing.
    check('brief_item_drafter_item_has_wording', sql`${table.itemKey} IS NOT NULL OR ${table.content} IS NOT NULL`),
    // Decide-together means not yet supplied (A3).
    check(
      'brief_item_decide_together_has_no_value',
      sql`${table.pending} IS DISTINCT FROM 'decide_together' OR ${table.value} IS NULL`,
    ),
    // Only an open parameter awaits its subject (§3.11).
    check(
      'brief_item_subject_pending_is_open_parameter',
      sql`${table.pending} IS DISTINCT FROM 'subject' OR ${table.shape} IS NOT DISTINCT FROM 'open_parameter'`,
    ),
    check(
      'brief_item_open_parameter_state',
      sql`${table.shape} IS DISTINCT FROM 'open_parameter' OR (${table.pending} IS NOT DISTINCT FROM 'subject' AND ${table.value} IS NULL) OR (${table.pending} IS NULL AND ${table.value} IS NOT NULL)`,
    ),
    check('brief_item_position_positive', sql`${table.position} >= 1`),
    // One fee per pair (Q6: one field).
    uniqueIndex('brief_item_one_fee_per_pair')
      .on(table.pairwiseAgreementId)
      .where(sql`${table.itemKey} = 'fee'`),
  ],
);
