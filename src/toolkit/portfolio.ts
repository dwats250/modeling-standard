import { and, eq, sql } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { ProfileRequiredError, findProfileForAccount } from './profile.ts';
import { portfolioDraft, professionalProfile } from './tables.ts';

/**
 * Data functions for the B2 portfolio draft, its B3 captions and its B4
 * save revision. As in B1 (`profile.ts`), every function takes the owning
 * account id, never a profile or draft id, and the columns are mapped
 * explicitly.
 */

export interface PortfolioRecord {
  /** Fixture keys, in the order shown. */
  readonly items: readonly string[];
  /** One caption per item, at the item's position; '' when blank. */
  readonly captions: readonly string[];
  /** The database's save count, 1 for a first save (B4). */
  readonly revision: number;
  readonly updatedAt: Date;
}

/** The revision a caller names when there is no saved draft yet. */
export const UNSAVED_REVISION = 0;

/**
 * The save was based on a revision that is no longer the draft's (or on no
 * draft, when one now exists). Nothing was written. Carries no draft data.
 */
export class StaleRevisionError extends Error {
  constructor() {
    super('stale_revision');
    this.name = 'StaleRevisionError';
  }
}

export interface PortfolioSave {
  readonly items: readonly string[];
  /** Positional, one per item, '' for none; defaults to all blank. */
  readonly captions?: readonly string[];
  /** The revision the edit was based on: UNSAVED_REVISION (0) for a first save. */
  readonly expectedRevision: number;
}

const RETURNING = { items: portfolioDraft.items, captions: portfolioDraft.captions, revision: portfolioDraft.revision, updatedAt: portfolioDraft.updatedAt };
type Row = { items: string[]; captions: string[]; revision: number; updatedAt: Date };
const toRecord = (row: Row): PortfolioRecord => ({ items: [...row.items], captions: [...row.captions], revision: row.revision, updatedAt: row.updatedAt });

export async function findPortfolioForAccount(db: Executor, accountId: string): Promise<PortfolioRecord | undefined> {
  const [row] = await db
    .select(RETURNING)
    .from(portfolioDraft)
    .innerJoin(professionalProfile, eq(portfolioDraft.profileId, professionalProfile.id))
    .where(eq(professionalProfile.accountId, accountId))
    .limit(1);
  return row ? toRecord(row) : undefined;
}

/**
 * Creates the account's portfolio draft, or replaces its items and captions,
 * only if the draft is still at `expectedRevision`. One statement does the
 * compare and the write, so of any number of simultaneous saves based on the
 * same revision exactly one lands:
 *
 * - expectedRevision 0: INSERT ... ON CONFLICT DO NOTHING. A row already
 *   there (someone else's first save) means no row returned.
 * - expectedRevision n ≥ 1: UPDATE ... WHERE revision = n. A draft since
 *   moved on, or never saved, means no row returned.
 *
 * No row returned throws StaleRevisionError, with nothing written and no
 * draft data. The new revision is set by the database (migrations/0037).
 * Throws ProfileRequiredError without a profile.
 */
export async function savePortfolioForAccount(db: Executor, accountId: string, save: PortfolioSave): Promise<PortfolioRecord> {
  const { items, captions = items.map(() => ''), expectedRevision } = save;
  if (!Number.isInteger(expectedRevision) || expectedRevision < UNSAVED_REVISION) throw new RangeError('expectedRevision is a non-negative integer');
  if (captions.length !== items.length) throw new RangeError('one caption per item');
  const profile = await findProfileForAccount(db, accountId);
  if (!profile) throw new ProfileRequiredError();
  const values = { items: [...items], captions: [...captions] };
  const rows =
    expectedRevision === UNSAVED_REVISION
      ? await db
          .insert(portfolioDraft)
          .values({ profileId: profile.id, ...values })
          .onConflictDoNothing({ target: portfolioDraft.profileId })
          .returning(RETURNING)
      : await db
          .update(portfolioDraft)
          .set(values)
          .where(and(eq(portfolioDraft.profileId, profile.id), eq(portfolioDraft.revision, sql`${expectedRevision}::integer`)))
          .returning(RETURNING);
  const [row] = rows;
  if (!row) throw new StaleRevisionError();
  return toRecord(row);
}
