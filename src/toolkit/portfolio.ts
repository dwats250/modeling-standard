import { eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { ProfileRequiredError, findProfileForAccount } from './profile.ts';
import { portfolioDraft, professionalProfile } from './tables.ts';

/**
 * Data functions for the B2 portfolio draft and its B3 captions. As in B1
 * (`profile.ts`), every function takes the owning account id, never a profile
 * or draft id, and the columns are mapped explicitly.
 */

export interface PortfolioRecord {
  /** Fixture keys, in the order shown. */
  readonly items: readonly string[];
  /** One caption per item, at the item's position; '' when blank. */
  readonly captions: readonly string[];
  readonly updatedAt: Date;
}

export async function findPortfolioForAccount(db: Executor, accountId: string): Promise<PortfolioRecord | undefined> {
  const [row] = await db
    .select({ items: portfolioDraft.items, captions: portfolioDraft.captions, updatedAt: portfolioDraft.updatedAt })
    .from(portfolioDraft)
    .innerJoin(professionalProfile, eq(portfolioDraft.profileId, professionalProfile.id))
    .where(eq(professionalProfile.accountId, accountId))
    .limit(1);
  return row ? { items: [...row.items], captions: [...row.captions], updatedAt: row.updatedAt } : undefined;
}

/**
 * Creates the account's portfolio draft, or replaces its items and captions.
 * `captions` is positional (one per item, '' for none) and defaults to all
 * blank. Throws ProfileRequiredError without a profile.
 */
export async function savePortfolioForAccount(
  db: Executor,
  accountId: string,
  items: readonly string[],
  captions: readonly string[] = items.map(() => ''),
): Promise<PortfolioRecord> {
  const profile = await findProfileForAccount(db, accountId);
  if (!profile) throw new ProfileRequiredError();
  if (captions.length !== items.length) throw new RangeError('one caption per item');
  const values = { items: [...items], captions: [...captions] };
  const [row] = await db
    .insert(portfolioDraft)
    .values({ profileId: profile.id, ...values })
    .onConflictDoUpdate({ target: portfolioDraft.profileId, set: values })
    .returning({ items: portfolioDraft.items, captions: portfolioDraft.captions, updatedAt: portfolioDraft.updatedAt });
  if (!row) throw new Error('upsert returned no row');
  return { items: [...row.items], captions: [...row.captions], updatedAt: row.updatedAt };
}
