import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { account } from '../accounts/tables.ts';

/**
 * Slice B1 (Track B): a private professional profile and its comp-card
 * draft. Synthetic and provisional: the fields, lengths and the five slot
 * names are reversible design choices, not product policy.
 *
 * Owner-only. A profile belongs to exactly one sign-in account and is read
 * and written only by that account (`operations.ts`). Nothing here is shared,
 * listed or discoverable (I6). An account is a sign-in account, not a
 * verified identity (D03, D11).
 *
 * Deliberately absent: measurements, contact details, location, date of
 * birth, age, images or image bytes (slots hold fixture keys only), public
 * or share state, visibility, payment or plan, and history.
 *
 * Privileges and the database-time stamps are hand-written SQL in
 * `migrations/`, never here.
 */

/**
 * One account's profile. Runtime role: SELECT, INSERT, and UPDATE of the
 * three text columns only. No DELETE; `account_id` never changes.
 */
export const professionalProfile = pgTable(
  'professional_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    displayName: text('display_name').notNull(),
    profession: text('profession').notNull().default(''),
    biography: text('biography').notNull().default(''),
    // Set by the database (migrations/0031); a caller cannot supply them.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('professional_profile_one_per_account').on(table.accountId),
    check('professional_profile_display_name_length', sql`char_length(${table.displayName}) between 1 and 80 and ${table.displayName} ~ '[^[:space:]]'`),
    check('professional_profile_profession_length', sql`char_length(${table.profession}) <= 60`),
    check('professional_profile_biography_length', sql`char_length(${table.biography}) <= 600`),
  ],
);

const FIXTURE_KEY = `'^[a-z0-9-]{1,40}$'`;

/** Every pair of the columns differs (a CHECK cannot hold a subquery). */
function distinctPairs(columns: readonly string[]): string {
  const terms: string[] = [];
  columns.forEach((a, i) => columns.slice(i + 1).forEach((b) => terms.push(`"comp_card_draft"."${a}" <> "comp_card_draft"."${b}"`)));
  return terms.join(' and ');
}

/**
 * One profile's comp-card draft: an optional tagline and one fixture key per
 * slot. Runtime role: SELECT, INSERT, and UPDATE of the tagline and the slot
 * columns only. No DELETE; `profile_id` never changes.
 *
 * Which keys exist is the application's fixture catalogue
 * (`fixture-media.ts`); the database checks only their shape and that the
 * five slots are distinct.
 */
export const compCardDraft = pgTable(
  'comp_card_draft',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => professionalProfile.id),
    tagline: text('tagline').notNull().default(''),
    slotHero: text('slot_hero').notNull(),
    slotFullBody: text('slot_full_body').notNull(),
    slotProfileView: text('slot_profile_view').notNull(),
    slotLifestyle: text('slot_lifestyle').notNull(),
    slotBeauty: text('slot_beauty').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('comp_card_draft_one_per_profile').on(table.profileId),
    check('comp_card_draft_tagline_length', sql`char_length(${table.tagline}) <= 80`),
    check(
      'comp_card_draft_slot_key_shape',
      sql.raw(
        ['slot_hero', 'slot_full_body', 'slot_profile_view', 'slot_lifestyle', 'slot_beauty']
          .map((column) => `"comp_card_draft"."${column}" ~ ${FIXTURE_KEY}`)
          .join(' and '),
      ),
    ),
    check(
      'comp_card_draft_slots_distinct',
      sql.raw(distinctPairs(['slot_hero', 'slot_full_body', 'slot_profile_view', 'slot_lifestyle', 'slot_beauty'])),
    ),
  ],
);
