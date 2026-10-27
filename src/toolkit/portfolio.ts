import { eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { ProfileRequiredError, findProfileForAccount } from './profile.ts';
import { portfolioDraft, professionalProfile } from './tables.ts';

/**
 * Data functions for the B2 portfolio draft. As in B1 (`profile.ts`), every
 * function takes the owning account id, never a profile or draft id, and the
 * one column is mapped explicitly.
 */

export interface PortfolioRecord {
  /** Fixture keys, in the order shown. */
  readonly items: readonly string[];
  readonly updatedAt: Date;
}

export async function findPortfolioForAccount(db: Executor, accountId: string): Promise<PortfolioRecord | undefined> {
  const [row] = await db
    .select({ items: portfolioDraft.items, updatedAt: portfolioDraft.updatedAt })
    .from(portfolioDraft)
    .innerJoin(professionalProfile, eq(portfolioDraft.profileId, professionalProfile.id))
    .where(eq(professionalProfile.accountId, accountId))
    .limit(1);
  return row ? { items: [...row.items], updatedAt: row.updatedAt } : undefined;
}

/** Creates the account's portfolio draft, or replaces its items. Throws ProfileRequiredError without a profile. */
export async function savePortfolioForAccount(db: Executor, accountId: string, items: readonly string[]): Promise<PortfolioRecord> {
  const profile = await findProfileForAccount(db, accountId);
  if (!profile) throw new ProfileRequiredError();
  const values = { items: [...items] };
  const [row] = await db
    .insert(portfolioDraft)
    .values({ profileId: profile.id, ...values })
    .onConflictDoUpdate({ target: portfolioDraft.profileId, set: values })
    .returning({ items: portfolioDraft.items, updatedAt: portfolioDraft.updatedAt });
  if (!row) throw new Error('upsert returned no row');
  return { items: [...row.items], updatedAt: row.updatedAt };
}
