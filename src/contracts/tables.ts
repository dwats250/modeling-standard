import { sql } from 'drizzle-orm';
import { boolean, check, customType, foreignKey, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { account } from '../accounts/tables.ts';
import { liveBrief } from '../briefs/tables.ts';
import { pairwiseAgreement, project, projectParty } from '../projects/tables.ts';

/**
 * Slice S11: the final contract (D02, D04, D10, D12; HC1, HC2).
 *
 * Written once, in the transaction that finalizes a frozen (S10) brief, and
 * never changed: the runtime role holds SELECT and INSERT only, no foreign
 * key cascades, and every foreign key points at a row the runtime role
 * cannot delete. The contract is copied verbatim from the brief; the brief's
 * items and ticks are then deleted (HC1: live state is not evidence).
 *
 * Deliberately absent: authorship or proposer (HC2), declines or gaps (Q10),
 * history (HC1), any affirmation table or column named for who affirmed or
 * signed a clause (S10's open question stays open), names, surnames, archive references,
 * retention or purge (D09, counsel), and any participant-facing label.
 *
 * Every guard (the brief must be signing with this fingerprint; the copy is
 * verbatim; parties, accounts and presence match; database time and the
 * signature chain; no partial contract commits) and every privilege is
 * hand-written SQL in `migrations/`, never here.
 */

const inet = customType<{ data: string }>({ dataType: () => 'inet' });

/**
 * One final contract per brief (and so per project). `fingerprint` is the
 * frozen brief's S10 fingerprint v1, which the contract's own rows recompute.
 * No timestamp: the signatures carry the database time.
 */
export const contract = pgTable(
  'contract',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    briefId: uuid('brief_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
  },
  (table) => [
    foreignKey({
      name: 'contract_brief_in_project_fk',
      columns: [table.briefId, table.projectId],
      foreignColumns: [liveBrief.id, liveBrief.projectId],
    }),
    check('contract_fingerprint_format', sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    unique('contract_one_per_brief').on(table.briefId),
    unique('contract_one_per_project').on(table.projectId),
    // Containment target for the contract's parts. `id` alone is already unique.
    unique('contract_id_project_unique').on(table.id, table.projectId),
  ],
);

/**
 * A party of the contract: its on-site fact and the account bound to it
 * (S06), both as they were at finalization.
 */
export const contractParty = pgTable(
  'contract_party',
  {
    contractId: uuid('contract_id').notNull(),
    projectId: uuid('project_id').notNull(),
    partyId: uuid('party_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    onSite: boolean('on_site').notNull(),
  },
  (table) => [
    primaryKey({ name: 'contract_party_pk', columns: [table.contractId, table.partyId] }),
    foreignKey({
      name: 'contract_party_in_contract_fk',
      columns: [table.contractId, table.projectId],
      foreignColumns: [contract.id, contract.projectId],
    }),
    foreignKey({
      name: 'contract_party_party_in_project_fk',
      columns: [table.projectId, table.partyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    // Target for the signatures: a signature is by one of the contract's parties, with its account.
    unique('contract_party_account_unique').on(table.contractId, table.partyId, table.accountId),
  ],
);

/**
 * One clause, copied verbatim from the frozen brief item: its id, layer,
 * pair scope, subject and shape, key, exact wording and value.
 *
 * `position` is the display order 1..n, never the brief's raw position (a gap
 * would record that a request was declined). `approver_party_ids` is the
 * item's derived approvers at finalization, sorted; at freeze they are
 * exactly the parties who ticked it. The name states what the column is and
 * prefers neither reading of "affirmation evidence".
 */
export const contractItem = pgTable(
  'contract_item',
  {
    contractId: uuid('contract_id').notNull(),
    projectId: uuid('project_id').notNull(),
    itemId: uuid('item_id').notNull(),
    position: integer('position').notNull(),
    layer: text('layer').notNull(),
    pairwiseAgreementId: uuid('pairwise_agreement_id'),
    subjectPartyId: uuid('subject_party_id'),
    shape: text('shape'),
    itemKey: text('item_key'),
    content: text('content').notNull(),
    value: text('value'),
    approverPartyIds: uuid('approver_party_ids').array().notNull(),
  },
  (table) => [
    primaryKey({ name: 'contract_item_pk', columns: [table.contractId, table.itemId] }),
    foreignKey({
      name: 'contract_item_in_contract_fk',
      columns: [table.contractId, table.projectId],
      foreignColumns: [contract.id, contract.projectId],
    }),
    foreignKey({
      name: 'contract_item_pair_in_project_fk',
      columns: [table.projectId, table.pairwiseAgreementId],
      foreignColumns: [pairwiseAgreement.projectId, pairwiseAgreement.id],
    }),
    foreignKey({
      name: 'contract_item_subject_in_project_fk',
      columns: [table.projectId, table.subjectPartyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    unique('contract_item_one_per_position').on(table.contractId, table.position),
    check('contract_item_position_positive', sql`${table.position} >= 1`),
    check('contract_item_layer_known', sql`${table.layer} in ('universal', 'shared', 'money')`),
  ],
);

/**
 * One party's signature evidence, chained within the contract.
 *
 * `sequence` (1 or 2) is the chain order, by party id: both signatures are
 * recorded in one act, and nothing here says who signed first. `signed_at`
 * is the finalizing transaction's database time, the same for both.
 * `ip` and `user_agent` are null until an HTTP surface supplies them.
 * `prev_hash` is the contract fingerprint for sequence 1 and the previous
 * record's hash otherwise; `record_hash` is SHA-256 over this record's
 * canonical form (docs/engineering/S11-FINAL-CONTRACT.md). The database sets
 * the time and both hashes; a caller cannot supply them.
 */
export const contractSignature = pgTable(
  'contract_signature',
  {
    contractId: uuid('contract_id').notNull(),
    projectId: uuid('project_id').notNull(),
    sequence: integer('sequence').notNull(),
    partyId: uuid('party_id').notNull(),
    accountId: uuid('account_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    prevHash: text('prev_hash').notNull(),
    recordHash: text('record_hash').notNull(),
  },
  (table) => [
    primaryKey({ name: 'contract_signature_pk', columns: [table.contractId, table.sequence] }),
    foreignKey({
      name: 'contract_signature_in_contract_fk',
      columns: [table.contractId, table.projectId],
      foreignColumns: [contract.id, contract.projectId],
    }),
    foreignKey({
      name: 'contract_signature_by_contract_party_fk',
      columns: [table.contractId, table.partyId, table.accountId],
      foreignColumns: [contractParty.contractId, contractParty.partyId, contractParty.accountId],
    }),
    unique('contract_signature_one_per_party').on(table.contractId, table.partyId),
    check('contract_signature_sequence_known', sql`${table.sequence} in (1, 2)`),
    check(
      'contract_signature_hashes_format',
      sql`${table.fingerprint} ~ '^[0-9a-f]{64}$' AND ${table.prevHash} ~ '^[0-9a-f]{64}$' AND ${table.recordHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'contract_signature_ip_is_host',
      sql`${table.ip} IS NULL OR masklen(${table.ip}) = CASE WHEN family(${table.ip}) = 4 THEN 32 ELSE 128 END`,
    ),
    check('contract_signature_user_agent_bounded', sql`${table.userAgent} IS NULL OR char_length(${table.userAgent}) BETWEEN 1 AND 512`),
  ],
);
