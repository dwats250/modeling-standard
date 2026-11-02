import { eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { COMP_CARD_SLOTS, DEFAULT_ARRANGEMENT, type CompCardSlot } from './fixture-media.ts';
import { compCardDraft, professionalProfile } from './tables.ts';

/**
 * Data functions for the B1 profile and comp-card draft. Every function
 * takes the owning account id, never a profile or draft id: a caller cannot
 * reach a row it does not own by naming it. Columns are mapped explicitly;
 * request input is never spread into a row.
 */

export interface ProfileFields {
  readonly displayName: string;
  readonly profession: string;
  readonly biography: string;
}

export interface ProfileRecord extends ProfileFields {
  readonly id: string;
  readonly updatedAt: Date;
}

export type Slots = Readonly<Record<CompCardSlot, string>>;

export interface DraftFields {
  readonly tagline: string;
  readonly slots: Slots;
}

export interface DraftRecord extends DraftFields {
  readonly updatedAt: Date;
}

export class ProfileRequiredError extends Error {
  constructor() {
    super('a comp card needs a saved profile first');
    this.name = 'ProfileRequiredError';
  }
}

type ProfileRow = typeof professionalProfile.$inferSelect;
type DraftRow = typeof compCardDraft.$inferSelect;

const profileRecord = (row: ProfileRow): ProfileRecord => ({
  id: row.id,
  displayName: row.displayName,
  profession: row.profession,
  biography: row.biography,
  updatedAt: row.updatedAt,
});

const draftRecord = (row: DraftRow): DraftRecord => ({
  tagline: row.tagline,
  slots: {
    hero: row.slotHero,
    fullBody: row.slotFullBody,
    profileView: row.slotProfileView,
    lifestyle: row.slotLifestyle,
    beauty: row.slotBeauty,
  },
  updatedAt: row.updatedAt,
});

const slotColumns = (slots: Slots) => ({
  slotHero: slots.hero,
  slotFullBody: slots.fullBody,
  slotProfileView: slots.profileView,
  slotLifestyle: slots.lifestyle,
  slotBeauty: slots.beauty,
});

export async function findProfileForAccount(db: Executor, accountId: string): Promise<ProfileRecord | undefined> {
  const [row] = await db.select().from(professionalProfile).where(eq(professionalProfile.accountId, accountId)).limit(1);
  return row ? profileRecord(row) : undefined;
}

/** Creates the account's profile, or replaces its three fields. */
export async function saveProfileForAccount(db: Executor, accountId: string, fields: ProfileFields): Promise<ProfileRecord> {
  const values = { displayName: fields.displayName, profession: fields.profession, biography: fields.biography };
  const [row] = await db
    .insert(professionalProfile)
    .values({ accountId, ...values })
    .onConflictDoUpdate({ target: professionalProfile.accountId, set: values })
    .returning();
  if (!row) throw new Error('upsert returned no row');
  return profileRecord(row);
}

export async function findDraftForAccount(db: Executor, accountId: string): Promise<DraftRecord | undefined> {
  const [row] = await db
    .select({ draft: compCardDraft })
    .from(compCardDraft)
    .innerJoin(professionalProfile, eq(compCardDraft.profileId, professionalProfile.id))
    .where(eq(professionalProfile.accountId, accountId))
    .limit(1);
  return row ? draftRecord(row.draft) : undefined;
}

/** Creates the account's draft, or replaces it. Throws ProfileRequiredError without a profile. */
export async function saveDraftForAccount(db: Executor, accountId: string, fields: DraftFields): Promise<DraftRecord> {
  const profile = await findProfileForAccount(db, accountId);
  if (!profile) throw new ProfileRequiredError();
  const values = { tagline: fields.tagline, ...slotColumns(fields.slots) };
  const [row] = await db
    .insert(compCardDraft)
    .values({ profileId: profile.id, ...values })
    .onConflictDoUpdate({ target: compCardDraft.profileId, set: values })
    .returning();
  if (!row) throw new Error('upsert returned no row');
  return draftRecord(row);
}

/** The arrangement a draft that was never saved starts from. */
export function defaultDraft(): DraftFields {
  return { tagline: '', slots: Object.fromEntries(COMP_CARD_SLOTS.map((s) => [s, DEFAULT_ARRANGEMENT[s]])) as Slots };
}
