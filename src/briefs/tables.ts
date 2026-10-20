import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, integer, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pairwiseAgreement, project, projectParty } from '../projects/tables.ts';

/**
 * Slices S08, S09 and S10: the live brief (D02, D04, D10; HC1, HC2).
 *
 * One mutable workspace per project, holding brief items. S08 is draft
 * composition; S09 adds the phase (draft, then live), the on-site presence
 * fact and current ticks; S10 adds the internal signing phase and its
 * fingerprint. Live state is not evidence (HC1), so these tables
 * carry no timestamp, author, proposer, revision, history, requiredness,
 * decline or group-check column, and live rows are updated and deleted in
 * place.
 *
 * Privileges and every trigger (pair-subject scope; the S09 phase, live-item,
 * presence, roster and tick guards; the S10 signing guards) are hand-written SQL in `migrations/`,
 * never here.
 */

/**
 * The live brief: one per project. Runtime role: SELECT, INSERT, UPDATE of
 * phase and fingerprint only.
 *
 * `phase` is `draft`, `live` (S09) or `signing` (S10). Draft → live needs
 * stored wording on every item and an explicit presence fact for every
 * party. Live → signing needs the brief to be ready to sign in a project of
 * exactly two parties and one pair (this slice's engineering boundary, not
 * a product ruling); signing → live is the withdrawal. A
 * database trigger enforces each transition and refuses every other one.
 *
 * `fingerprint` is the SHA-256 (lowercase hex) of the brief's
 * signing-relevant state, computed by `freezeBriefForSigning`. It is stored
 * exactly while signing and cleared on withdrawal. The database checks its
 * presence, format and immutability, and recomputes it on entering signing,
 * refusing any value that does not match the brief. No timestamps: when
 * people act is noise (D10, noise doctrine).
 */
export const liveBrief = pgTable(
  'live_brief',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    phase: text('phase').notNull().default('draft'),
    fingerprint: text('fingerprint'),
  },
  (table) => [
    check('live_brief_phase_known', sql`${table.phase} in ('draft', 'live', 'signing')`),
    check(
      'live_brief_fingerprint_iff_signing',
      sql`(${table.phase} = 'signing') = (${table.fingerprint} IS NOT NULL) AND (${table.fingerprint} IS NULL OR ${table.fingerprint} ~ '^[0-9a-f]{64}$')`,
    ),
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
    // Containment target for ticks (S09). `id` alone is already unique.
    unique('brief_item_id_project_unique').on(table.id, table.projectId),
    // One fee per pair (Q6: one field).
    uniqueIndex('brief_item_one_fee_per_pair')
      .on(table.pairwiseAgreementId)
      .where(sql`${table.itemKey} = 'fee'`),
  ],
);

/**
 * Whether a party will physically be on site (S09; Q8: on site means
 * physical proximity). One explicit fact per party per brief; a missing fact
 * is never read as false, and sharing requires one for every party. Universal
 * items are approved by the parties on site. Runtime role: SELECT, INSERT,
 * UPDATE of on_site only, and only while the brief is a draft. No timestamp,
 * role, reason, author or history.
 */
export const briefPartyPresence = pgTable(
  'brief_party_presence',
  {
    briefId: uuid('brief_id').notNull(),
    projectId: uuid('project_id').notNull(),
    partyId: uuid('party_id').notNull(),
    onSite: boolean('on_site').notNull(),
  },
  (table) => [
    primaryKey({ name: 'brief_party_presence_pk', columns: [table.briefId, table.partyId] }),
    foreignKey({
      name: 'brief_party_presence_in_brief_fk',
      columns: [table.briefId, table.projectId],
      foreignColumns: [liveBrief.id, liveBrief.projectId],
    }),
    foreignKey({
      name: 'brief_party_presence_party_in_project_fk',
      columns: [table.projectId, table.partyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
  ],
);

/**
 * A current tick: this party green-lights this item now (S09). Current green
 * state, not evidence: an untick deletes the row, and a declined item takes
 * its ticks with it (the only cascading foreign key in the brief). Runtime
 * role: SELECT, INSERT, DELETE. No time, order, source, group-check flag,
 * device, credential or version.
 */
export const briefTick = pgTable(
  'brief_tick',
  {
    briefItemId: uuid('brief_item_id').notNull(),
    projectId: uuid('project_id').notNull(),
    partyId: uuid('party_id').notNull(),
  },
  (table) => [
    primaryKey({ name: 'brief_tick_pk', columns: [table.briefItemId, table.partyId] }),
    foreignKey({
      name: 'brief_tick_item_fk',
      columns: [table.briefItemId, table.projectId],
      foreignColumns: [briefItem.id, briefItem.projectId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'brief_tick_party_in_project_fk',
      columns: [table.projectId, table.partyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
  ],
);
