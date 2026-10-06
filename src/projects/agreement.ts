import { eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { pairwiseAgreement } from './tables.ts';

/**
 * Pairwise agreement topology (slice S02; D02 structure ruling: commercial
 * and craft agreements are private and pairwise under the project).
 *
 * Data functions only, with no HTTP route. They record which two
 * project-local parties of one project an agreement relates, and nothing
 * else: no terms, status, finality, proposer, direction, visibility,
 * signature or authority. Who may create an agreement is not decided, so
 * nothing here checks or records an actor. Relating two parties gives no
 * principal (including the project's creator) authority to act for either
 * of them (D12).
 *
 * The database enforces the topology itself: two distinct parties, both
 * existing parties of the agreement's project.
 */

export interface PairwiseAgreementRecord {
  readonly id: string;
  readonly projectId: string;
  /** The two parties, as an unordered pair in canonical (UUID value) order. */
  readonly partyIds: readonly [string, string];
}

type PairwiseAgreementRow = typeof pairwiseAgreement.$inferSelect;

function toRecord(row: PairwiseAgreementRow): PairwiseAgreementRecord {
  return { id: row.id, projectId: row.projectId, partyIds: [row.partyOneId, row.partyTwoId] };
}

/**
 * Puts the pair in the order the table requires. Compares as PostgreSQL
 * compares `uuid` values (byte order), which for canonical lowercase UUID
 * text is the same as comparing the hex digits. Equal ids are left for the
 * database to reject.
 */
function canonicalPair(a: string, b: string): [string, string] {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x <= y ? [x, y] : [y, x];
}

export async function createPairwiseAgreement(
  db: Executor,
  projectId: string,
  partyIds: readonly [string, string],
): Promise<PairwiseAgreementRecord> {
  const [partyOneId, partyTwoId] = canonicalPair(partyIds[0], partyIds[1]);
  const [row] = await db.insert(pairwiseAgreement).values({ projectId, partyOneId, partyTwoId }).returning();
  if (!row) throw new Error('insert returned no row');
  return toRecord(row);
}

export async function findPairwiseAgreement(db: Executor, id: string): Promise<PairwiseAgreementRecord | undefined> {
  const [row] = await db.select().from(pairwiseAgreement).where(eq(pairwiseAgreement.id, id)).limit(1);
  return row ? toRecord(row) : undefined;
}
