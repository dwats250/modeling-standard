import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { project, projectParty } from '../projects/tables.ts';

/**
 * Slice S06: sign-in accounts and their binding to project-local parties
 * (D03, DECIDED for the photo-shoot scope).
 *
 * An account is a sign-in account only. It is not a verified identity
 * (verification is separate and happens at first participation, D11), it is
 * not a party (a party is project-local, S01), and binding it to a party
 * gives nobody authority to act for anyone else (D12: no proxies).
 *
 * Deliberately absent: tokens of any kind, email, display name, avatar,
 * profile, portfolio, date of birth, age, verification result or vendor
 * data, roles, payer or payee, invitation state and signatures.
 *
 * Privileges and the database-time stamps are hand-written SQL in
 * `migrations/`, never here.
 */

/**
 * One sign-in account (D03: an account is required, created by Google or
 * Apple sign-in). Runtime role: SELECT, INSERT.
 *
 * `(login_provider, provider_subject)` identifies exactly one account. The
 * provider subject is that provider's opaque identifier for the login; it is
 * a login credential, not identity. A Google login and an Apple login are
 * two accounts: nothing links them.
 */
export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loginProvider: text('login_provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    // Set by the database when the row is written (migrations/0016); a
    // caller cannot supply it.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('account_login_unique').on(table.loginProvider, table.providerSubject),
    check('account_login_provider_known', sql`${table.loginProvider} in ('google', 'apple')`),
    check('account_provider_subject_nonblank', sql`${table.providerSubject} ~ '[^[:space:]]'`),
  ],
);

/**
 * Binds one project-local party to one account. Runtime role: SELECT, INSERT.
 *
 * Append-only evidence: a party is bound at most once, and never rebound to
 * another account. The party must belong to the named project. Nothing here
 * limits how many parties one account may be bound to, in one project or
 * across projects: that is not a decided invariant.
 *
 * A binding says only that this account's sign-in is how this party is
 * reached. It is not verification, consent, acceptance, a role or authority
 * over anyone else.
 */
export const partyAccountBinding = pgTable(
  'party_account_binding',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id),
    partyId: uuid('party_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    // Set by the database when the row is written (migrations/0016); a
    // caller cannot supply it.
    boundAt: timestamp('bound_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The party must be an existing party of the named project.
    foreignKey({
      name: 'party_account_binding_party_in_project_fk',
      columns: [table.projectId, table.partyId],
      foreignColumns: [projectParty.projectId, projectParty.id],
    }),
    // One binding per party: a party cannot be bound twice or rebound.
    unique('party_account_binding_one_per_party').on(table.partyId),
  ],
);
