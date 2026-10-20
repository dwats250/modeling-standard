import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { pairwiseAgreement, projectParty } from '../projects/tables.ts';
import { briefItem, liveBrief } from './tables.ts';

/**
 * The draft live brief (slice S08; D02, D04, D10; HC1, HC2).
 *
 * Draft composition. A brief is one mutable workspace per project; while it
 * is a draft its items can be added, edited and removed freely, including
 * universal and keyed ones. Once it is shared (S09, `./live.ts`) these
 * composition functions refuse, and the database's live guard is the final
 * authority. Nothing here records when anything happened or who did it: live
 * state is not evidence (HC1), and there is no proposer (HC2).
 *
 * `content` is the exact wording currently in the brief. There is no product
 * catalogue: callers pass wording, or leave it null for a keyed item whose
 * wording has not been materialized yet.
 *
 * The database enforces the topology (containment, layers, the fee, subject
 * and shape, pending states). These functions add only what a constraint
 * cannot: one brief per project resolved race-safely, positions assigned under
 * a per-brief advisory lock, and the D10 visibility filter.
 *
 * Data functions only. No HTTP operation, no principal, no logging, no
 * network. Authorization (who may compose a draft) belongs to the participant
 * surface, not here.
 */

export type BriefLayer = 'universal' | 'shared' | 'money';
export type BriefShape = 'declaration' | 'request' | 'open_parameter';
export type BriefItemKey = 'fee' | 'no_means_no' | 'coverage_level' | 'physical_contact' | 'stop_rule';
export type BriefPending = 'decide_together' | 'subject';
export type BriefPhase = 'draft' | 'live' | 'signing';

export interface LiveBriefRecord {
  readonly id: string;
  readonly projectId: string;
  readonly phase: BriefPhase;
}

export interface BriefItemRecord {
  readonly id: string;
  readonly briefId: string;
  readonly projectId: string;
  readonly layer: BriefLayer;
  readonly pairwiseAgreementId: string | null;
  readonly subjectPartyId: string | null;
  readonly shape: BriefShape | null;
  readonly itemKey: BriefItemKey | null;
  readonly content: string | null;
  readonly value: string | null;
  readonly pending: BriefPending | null;
  readonly position: number;
}

export interface BriefItemSpec {
  readonly layer: BriefLayer;
  readonly pairwiseAgreementId?: string | null;
  readonly subjectPartyId?: string | null;
  readonly shape?: BriefShape | null;
  readonly itemKey?: BriefItemKey | null;
  readonly content?: string | null;
  readonly value?: string | null;
  readonly pending?: BriefPending | null;
}

/** The draft fields that may change. Everything else is fixed at creation. */
export interface DraftBriefItemChanges {
  readonly content?: string | null;
  readonly value?: string | null;
  readonly pending?: BriefPending | null;
}

export class BriefNotFoundError extends Error {
  constructor() {
    super('live brief not found');
    this.name = 'BriefNotFoundError';
  }
}

export class BriefItemNotFoundError extends Error {
  constructor() {
    super('brief item not found');
    this.name = 'BriefItemNotFoundError';
  }
}

/**
 * Why a brief action was refused before reaching the database. The database
 * enforces the same rules where it can; these are the checks only a caller
 * can make (who is acting) and clear refusals for the rest.
 */
export type BriefRefusal =
  | 'not_draft'
  | 'not_live'
  | 'not_decide_together'
  | 'not_open_parameter'
  | 'not_request'
  | 'not_subject'
  | 'universal_kept'
  | 'blank_value'
  | 'deliberate_tick'
  | 'item_not_in_brief'
  | 'not_ready'
  | 'unsupported_topology';

export class BriefActionRefusedError extends Error {
  readonly reason: BriefRefusal;
  constructor(reason: BriefRefusal) {
    super(`brief action refused: ${reason}`);
    this.reason = reason;
    this.name = 'BriefActionRefusedError';
  }
}

type BriefItemRow = typeof briefItem.$inferSelect;
type LiveBriefRow = typeof liveBrief.$inferSelect;

export function toBriefRecord(row: LiveBriefRow): LiveBriefRecord {
  return { id: row.id, projectId: row.projectId, phase: row.phase as BriefPhase };
}

export function toItemRecord(row: BriefItemRow): BriefItemRecord {
  return {
    id: row.id,
    briefId: row.briefId,
    projectId: row.projectId,
    layer: row.layer as BriefLayer,
    pairwiseAgreementId: row.pairwiseAgreementId,
    subjectPartyId: row.subjectPartyId,
    shape: row.shape as BriefShape | null,
    itemKey: row.itemKey as BriefItemKey | null,
    content: row.content,
    value: row.value,
    pending: row.pending as BriefPending | null,
    position: row.position,
  };
}

/**
 * Serializes draft composition of one brief. Same key shape as the earlier
 * per-container locks: the UUID lowercased to match `uuid::text`.
 */
export async function lockBrief(tx: Executor, briefId: string): Promise<void> {
  const key = `live-brief:${briefId.toLowerCase()}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

/**
 * The project's live brief, created on first use. Race-safe through the
 * database's one-per-project key: a concurrent opener waits for the other's
 * insert and then reads it (READ COMMITTED). An unknown project is a
 * foreign-key violation.
 */
export async function openLiveBrief(db: Executor, projectId: string): Promise<LiveBriefRecord> {
  const [inserted] = await db
    .insert(liveBrief)
    .values({ projectId })
    .onConflictDoNothing({ target: liveBrief.projectId })
    .returning();
  if (inserted) return toBriefRecord(inserted);
  const [existing] = await db.select().from(liveBrief).where(eq(liveBrief.projectId, projectId)).limit(1);
  if (!existing) throw new Error('live brief exists but is not visible to this transaction');
  return toBriefRecord(existing);
}

export async function findLiveBriefForProject(db: Executor, projectId: string): Promise<LiveBriefRecord | undefined> {
  const [row] = await db.select().from(liveBrief).where(eq(liveBrief.projectId, projectId)).limit(1);
  return row ? toBriefRecord(row) : undefined;
}

export async function findLiveBrief(db: Executor, briefId: string): Promise<LiveBriefRecord | undefined> {
  const [row] = await db.select().from(liveBrief).where(eq(liveBrief.id, briefId)).limit(1);
  return row ? toBriefRecord(row) : undefined;
}

/** The brief, which must be a draft. Call under the brief lock. */
async function draftBrief(tx: Executor, briefId: string): Promise<LiveBriefRecord> {
  const brief = await findLiveBrief(tx, briefId);
  if (!brief) throw new BriefNotFoundError();
  if (brief.phase !== 'draft') throw new BriefActionRefusedError('not_draft');
  return brief;
}

/**
 * Adds an item at the end of a draft brief. The project is taken from the
 * brief, never from the caller. Every topology rule is the database's.
 */
export async function addBriefItem(db: Executor, briefId: string, spec: BriefItemSpec): Promise<BriefItemRecord> {
  return db.transaction(
    async (tx) => {
      await lockBrief(tx, briefId);
      const brief = await draftBrief(tx, briefId);
      const [next] = await tx
        .select({ position: sql<number>`coalesce(max(${briefItem.position}), 0) + 1` })
        .from(briefItem)
        .where(eq(briefItem.briefId, briefId));
      const [row] = await tx
        .insert(briefItem)
        .values({
          briefId,
          projectId: brief.projectId,
          layer: spec.layer,
          pairwiseAgreementId: spec.pairwiseAgreementId ?? null,
          subjectPartyId: spec.subjectPartyId ?? null,
          shape: spec.shape ?? null,
          itemKey: spec.itemKey ?? null,
          content: spec.content ?? null,
          value: spec.value ?? null,
          pending: spec.pending ?? null,
          position: Number(next?.position ?? 1),
        })
        .returning();
      if (!row) throw new Error('insert returned no row');
      return toItemRecord(row);
    },
    { isolationLevel: 'read committed' },
  );
}

export async function briefOfItem(tx: Executor, itemId: string): Promise<string> {
  const [item] = await tx.select({ briefId: briefItem.briefId }).from(briefItem).where(eq(briefItem.id, itemId)).limit(1);
  if (!item) throw new BriefItemNotFoundError();
  return item.briefId;
}

/**
 * Changes an item's wording, value or pending state while the brief is a
 * draft. Layer, scope, subject, shape, key, brief and project cannot change:
 * the runtime role has no UPDATE on them. A live brief is resolved only
 * through `./live.ts`.
 */
export async function updateDraftBriefItem(
  db: Executor,
  itemId: string,
  changes: DraftBriefItemChanges,
): Promise<BriefItemRecord> {
  return db.transaction(
    async (tx) => {
      const briefId = await briefOfItem(tx, itemId);
      await lockBrief(tx, briefId);
      await draftBrief(tx, briefId);
      const set: Partial<Pick<BriefItemRow, 'content' | 'value' | 'pending'>> = {};
      if (changes.content !== undefined) set.content = changes.content;
      if (changes.value !== undefined) set.value = changes.value;
      if (changes.pending !== undefined) set.pending = changes.pending;
      if (Object.keys(set).length === 0) {
        const [row] = await tx.select().from(briefItem).where(eq(briefItem.id, itemId)).limit(1);
        if (!row) throw new BriefItemNotFoundError();
        return toItemRecord(row);
      }
      const [row] = await tx.update(briefItem).set(set).where(eq(briefItem.id, itemId)).returning();
      if (!row) throw new BriefItemNotFoundError();
      return toItemRecord(row);
    },
    { isolationLevel: 'read committed' },
  );
}

/**
 * Removes any item, including universal and keyed ones, while the brief is a
 * draft. A live brief loses an item only by a decline (`./live.ts`).
 */
export async function removeDraftBriefItem(db: Executor, itemId: string): Promise<void> {
  await db.transaction(
    async (tx) => {
      const briefId = await briefOfItem(tx, itemId);
      await lockBrief(tx, briefId);
      await draftBrief(tx, briefId);
      const removed = await tx.delete(briefItem).where(eq(briefItem.id, itemId)).returning({ id: briefItem.id });
      if (removed.length === 0) throw new BriefItemNotFoundError();
    },
    { isolationLevel: 'read committed' },
  );
}

/** The brief's items in display order (position, then id). */
export async function listBriefItems(db: Executor, briefId: string): Promise<BriefItemRecord[]> {
  const rows = await db
    .select()
    .from(briefItem)
    .where(eq(briefItem.briefId, briefId))
    .orderBy(asc(briefItem.position), asc(briefItem.id));
  return rows.map(toItemRecord);
}

/**
 * The items a party may see (D10): universal and shared items, plus money
 * items whose pair includes the party. Pair scope on a shared item does not
 * restrict who sees it. A party outside the brief's project sees nothing.
 * A filter only: no party view or HTTP exists.
 */
export async function listBriefItemsVisibleTo(db: Executor, briefId: string, partyId: string): Promise<BriefItemRecord[]> {
  const brief = await findLiveBrief(db, briefId);
  if (!brief) return [];
  const [member] = await db
    .select({ id: projectParty.id })
    .from(projectParty)
    .where(and(eq(projectParty.id, partyId), eq(projectParty.projectId, brief.projectId)))
    .limit(1);
  if (!member) return [];
  const rows = await db
    .select({ item: briefItem })
    .from(briefItem)
    .leftJoin(pairwiseAgreement, eq(pairwiseAgreement.id, briefItem.pairwiseAgreementId))
    .where(
      and(
        eq(briefItem.briefId, briefId),
        or(
          sql`${briefItem.layer} <> 'money'`,
          eq(pairwiseAgreement.partyOneId, partyId),
          eq(pairwiseAgreement.partyTwoId, partyId),
        ),
      ),
    )
    .orderBy(asc(briefItem.position), asc(briefItem.id));
  return rows.map((r) => toItemRecord(r.item));
}
