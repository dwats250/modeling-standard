import { createHash } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { pairwiseAgreement, projectParty } from '../projects/tables.ts';
import {
  BriefActionRefusedError,
  BriefItemNotFoundError,
  BriefNotFoundError,
  briefOfItem,
  findLiveBrief,
  listBriefItems,
  listBriefItemsVisibleTo,
  lockBrief,
  toBriefRecord,
  toItemRecord,
  type BriefItemKey,
  type BriefItemRecord,
  type BriefPhase,
  type LiveBriefRecord,
} from './brief.ts';
import { briefItem, briefPartyPresence, briefTick, liveBrief } from './tables.ts';

/**
 * The live brief (slices S09 and S10; D02, D04, D10, D12; HC1, HC2).
 *
 * Sharing turns the draft into the one current live brief. From then on
 * nothing is added, wording and positions are fixed, a pending value settles
 * exactly once, a request may be declined by its subject (and simply
 * disappears), universal safety material stays, and parties tick and untick
 * items until everything is green. Ready to sign is derived from the rows as
 * they are now. Nothing records when anything happened, who settled a value,
 * that a request existed or was declined, or that group-check was used: live
 * state is not evidence (HC1), and there is no proposer (HC2).
 *
 * The database is the final authority (migrations/0022): its triggers refuse
 * every post-share change these functions do not offer, refuse a share with
 * unmaterialized wording or a missing presence fact, and admit a tick only
 * from a derived approver of a settled item. These functions add what the
 * database cannot know (who is acting) and clear refusals.
 *
 * S10 adds an internal signing phase. A brief that is ready to sign, in a
 * project of exactly two parties and one pair, can be frozen: its
 * signing-relevant state is fingerprinted and every change is refused, except
 * an untick, which withdraws it to live with nothing kept. Freezing is an
 * internal mechanism, not a party act. Signatures and the final contract are
 * S11 (`src/contracts/`), which moves a signing brief to its terminal final
 * phase; every function here refuses a final brief.
 *
 * Every mutation runs READ COMMITTED under the per-brief advisory lock.
 *
 * Data functions only. No HTTP operation, principal, logging or network: no
 * participant surface exists (S09 is not real use).
 */

/**
 * The fixed deliberate-tick list (Q6; LIVE-BRIEF-REBUILD §4): these items
 * always need their own tick and are refused by group-check. Product-set, not
 * a column. Nothing else is added without Cory's ruling.
 */
export const DELIBERATE_TICK_KEYS: readonly BriefItemKey[] = ['fee', 'coverage_level', 'physical_contact', 'stop_rule'];

export interface PresenceRecord {
  readonly partyId: string;
  readonly onSite: boolean;
}

export interface TickRecord {
  readonly briefItemId: string;
  readonly partyId: string;
}

export interface ItemGreenState {
  readonly item: BriefItemRecord;
  /** Derived, never stored. Sorted by id; the order carries no meaning. */
  readonly approverIds: readonly string[];
  /** The approvers who tick it now. Sorted by id. */
  readonly tickedBy: readonly string[];
  readonly green: boolean;
}

export interface BriefGreenState {
  readonly brief: LiveBriefRecord;
  readonly items: readonly ItemGreenState[];
}

const READ_COMMITTED = { isolationLevel: 'read committed' } as const;

function nonblank(value: string): boolean {
  return /[^\s]/u.test(value);
}

async function requireBrief(tx: Executor, briefId: string): Promise<LiveBriefRecord> {
  const brief = await findLiveBrief(tx, briefId);
  if (!brief) throw new BriefNotFoundError();
  return brief;
}

/** The item and its brief, locked, with the brief required to be live. */
async function liveItem(tx: Executor, itemId: string): Promise<BriefItemRecord> {
  const briefId = await briefOfItem(tx, itemId);
  await lockBrief(tx, briefId);
  const brief = await requireBrief(tx, briefId);
  if (brief.phase !== 'live') throw new BriefActionRefusedError('not_live');
  const [row] = await tx.select().from(briefItem).where(eq(briefItem.id, itemId)).limit(1);
  if (!row) throw new BriefItemNotFoundError();
  return toItemRecord(row);
}

// ---- Presence (draft only) ----

/**
 * Records whether a party will physically be on site (Q8). Draft only; the
 * database refuses any presence change once the brief is live. The project
 * is taken from the brief; a party of another project is a foreign-key
 * violation.
 */
export async function setDraftPartyPresence(
  db: Executor,
  briefId: string,
  partyId: string,
  onSite: boolean,
): Promise<PresenceRecord> {
  return db.transaction(async (tx) => {
    await lockBrief(tx, briefId);
    const brief = await requireBrief(tx, briefId);
    if (brief.phase !== 'draft') throw new BriefActionRefusedError('not_draft');
    const [row] = await tx
      .insert(briefPartyPresence)
      .values({ briefId, projectId: brief.projectId, partyId, onSite })
      .onConflictDoUpdate({ target: [briefPartyPresence.briefId, briefPartyPresence.partyId], set: { onSite } })
      .returning();
    if (!row) throw new Error('upsert returned no row');
    return { partyId: row.partyId, onSite: row.onSite };
  }, READ_COMMITTED);
}

/** The brief's presence facts, by party id. */
export async function listBriefPresence(db: Executor, briefId: string): Promise<PresenceRecord[]> {
  const rows = await db
    .select({ partyId: briefPartyPresence.partyId, onSite: briefPartyPresence.onSite })
    .from(briefPartyPresence)
    .where(eq(briefPartyPresence.briefId, briefId))
    .orderBy(asc(briefPartyPresence.partyId));
  return rows;
}

// ---- Share ----

/**
 * Shares a draft: draft → live. The database refuses unless every current
 * item has stored wording (`live_brief_share_requires_wording`) and every
 * current project party has an explicit presence fact
 * (`live_brief_share_requires_presence`). Explicit pending states are allowed.
 * A brief that is already live is refused (`not_draft`); nothing returns it
 * to draft.
 */
export async function shareLiveBrief(db: Executor, briefId: string): Promise<LiveBriefRecord> {
  return db.transaction(async (tx) => {
    await lockBrief(tx, briefId);
    const brief = await requireBrief(tx, briefId);
    if (brief.phase !== 'draft') throw new BriefActionRefusedError('not_draft');
    const [row] = await tx.update(liveBrief).set({ phase: 'live' }).where(eq(liveBrief.id, briefId)).returning();
    if (!row) throw new BriefNotFoundError();
    return toBriefRecord(row);
  }, READ_COMMITTED);
}

// ---- Resolve ----

async function settle(tx: Executor, itemId: string, value: string): Promise<BriefItemRecord> {
  const [row] = await tx.update(briefItem).set({ value, pending: null }).where(eq(briefItem.id, itemId)).returning();
  if (!row) throw new BriefItemNotFoundError();
  return toItemRecord(row);
}

/**
 * Settles a decide-together item with the value the parties arrived at. No
 * actor is taken or stored (HC2): acceptance is the ticks on the resulting
 * item. A settled item cannot change again.
 */
export async function settleDecideTogetherItem(db: Executor, itemId: string, value: string): Promise<BriefItemRecord> {
  return db.transaction(async (tx) => {
    const item = await liveItem(tx, itemId);
    if (item.pending !== 'decide_together') throw new BriefActionRefusedError('not_decide_together');
    if (!nonblank(value)) throw new BriefActionRefusedError('blank_value');
    return settle(tx, itemId, value);
  }, READ_COMMITTED);
}

/**
 * The subject sets an open parameter ("you set this one", §3.11). Only the
 * item's subject may; nobody else, and no counteroffer.
 */
export async function setOpenParameterBySubject(
  db: Executor,
  itemId: string,
  partyId: string,
  value: string,
): Promise<BriefItemRecord> {
  return db.transaction(async (tx) => {
    const item = await liveItem(tx, itemId);
    if (item.shape !== 'open_parameter' || item.pending !== 'subject') throw new BriefActionRefusedError('not_open_parameter');
    if (item.subjectPartyId !== partyId.toLowerCase()) throw new BriefActionRefusedError('not_subject');
    if (!nonblank(value)) throw new BriefActionRefusedError('blank_value');
    return settle(tx, itemId, value);
  }, READ_COMMITTED);
}

// ---- Decline ----

/**
 * The subject of a request declines it, and it is gone (Q7, Q10). The row is
 * deleted and its ticks go with it; nothing records that it existed, that it
 * was declined, by whom or when. Universal safety material is never removed
 * once shared. Who may decline is checked here: the database holds no actor,
 * and admits a live delete only of a non-universal request.
 */
export async function declineBriefRequest(db: Executor, itemId: string, partyId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await liveItem(tx, itemId);
    if (item.shape !== 'request') throw new BriefActionRefusedError('not_request');
    if (item.subjectPartyId !== partyId.toLowerCase()) throw new BriefActionRefusedError('not_subject');
    if (item.layer === 'universal') throw new BriefActionRefusedError('universal_kept');
    const removed = await tx.delete(briefItem).where(eq(briefItem.id, itemId)).returning({ id: briefItem.id });
    if (removed.length === 0) throw new BriefItemNotFoundError();
  }, READ_COMMITTED);
}

// ---- Ticks ----

/**
 * The party green-lights the item. The database admits it only on a live
 * brief, on a settled item with stored wording, from a derived approver
 * (`brief_tick_requires_*`). A repeat is a no-op returning the same tick.
 */
export async function tickBriefItem(db: Executor, itemId: string, partyId: string): Promise<TickRecord> {
  return db.transaction(async (tx) => {
    const item = await liveItem(tx, itemId);
    await tx.insert(briefTick).values({ briefItemId: item.id, projectId: item.projectId, partyId }).onConflictDoNothing();
    return { briefItemId: item.id, partyId: partyId.toLowerCase() };
  }, READ_COMMITTED);
}

/**
 * Withdraws the party's own tick before finality. The row is deleted; no
 * "withdrawn" record. Returns whether a tick was there.
 *
 * While the brief is signing (S10), removing a tick is the withdrawal: in
 * one transaction the brief returns to live, its fingerprint is cleared, and
 * the tick is removed. Nothing records that the brief was ever frozen. A
 * party without a tick on the item changes nothing.
 */
export async function untickBriefItem(db: Executor, itemId: string, partyId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const briefId = await briefOfItem(tx, itemId);
    await lockBrief(tx, briefId);
    const brief = await requireBrief(tx, briefId);
    // Re-read under the lock: a request declined meanwhile is gone.
    const [item] = await tx.select({ id: briefItem.id }).from(briefItem).where(eq(briefItem.id, itemId)).limit(1);
    if (!item) throw new BriefItemNotFoundError();
    const own = and(eq(briefTick.briefItemId, itemId), eq(briefTick.partyId, partyId));
    if (brief.phase === 'signing') {
      const [held] = await tx.select({ partyId: briefTick.partyId }).from(briefTick).where(own).limit(1);
      if (!held) return false;
      // Back to live first: the database refuses removing a tick while signing.
      await tx.update(liveBrief).set({ phase: 'live', fingerprint: null }).where(eq(liveBrief.id, briefId));
    } else if (brief.phase !== 'live') {
      throw new BriefActionRefusedError('not_live');
    }
    const removed = await tx.delete(briefTick).where(own).returning({ partyId: briefTick.partyId });
    return removed.length > 0;
  }, READ_COMMITTED);
}

/**
 * Group-check: the same individual ticks as `tickBriefItem`, for several
 * items at once, all or none. Every selected item is validated before
 * anything changes: it must be in this brief and must not carry a
 * deliberate-tick key (`deliberate_tick`). The database then checks each
 * tick as usual, in one statement. Nothing records that group-check was used.
 */
export async function groupCheckBriefItems(
  db: Executor,
  briefId: string,
  partyId: string,
  itemIds: readonly string[],
): Promise<TickRecord[]> {
  const ids = [...new Set(itemIds.map((id) => id.toLowerCase()))];
  return db.transaction(async (tx) => {
    await lockBrief(tx, briefId);
    const brief = await requireBrief(tx, briefId);
    if (brief.phase !== 'live') throw new BriefActionRefusedError('not_live');
    if (ids.length === 0) return [];
    const rows = await tx
      .select({ id: briefItem.id, itemKey: briefItem.itemKey })
      .from(briefItem)
      .where(and(eq(briefItem.briefId, briefId), inArray(briefItem.id, ids)));
    if (rows.length !== ids.length) throw new BriefActionRefusedError('item_not_in_brief');
    if (rows.some((row) => row.itemKey !== null && DELIBERATE_TICK_KEYS.includes(row.itemKey as BriefItemKey))) {
      throw new BriefActionRefusedError('deliberate_tick');
    }
    await tx
      .insert(briefTick)
      .values(ids.map((id) => ({ briefItemId: id, projectId: brief.projectId, partyId })))
      .onConflictDoNothing();
    return ids.sort().map((id) => ({ briefItemId: id, partyId: partyId.toLowerCase() }));
  }, READ_COMMITTED);
}

// ---- Green state and ready to sign ----

interface ApproverContext {
  readonly partyIds: readonly string[];
  readonly onSite: ReadonlySet<string>;
  readonly pairs: ReadonlyMap<string, readonly [string, string]>;
}

/**
 * Who must green-light an item, derived from current state (never stored):
 * universal → every party on site; pair-scoped shared and money → the pair;
 * shared project-wide → every party of the project. No organizer, creator
 * or proxy.
 */
function approversOf(item: BriefItemRecord, ctx: ApproverContext): string[] {
  if (item.layer === 'universal') return ctx.partyIds.filter((id) => ctx.onSite.has(id));
  if (item.pairwiseAgreementId !== null) return [...(ctx.pairs.get(item.pairwiseAgreementId) ?? [])].sort();
  return [...ctx.partyIds];
}

async function greenStateOf(db: Executor, brief: LiveBriefRecord, items: readonly BriefItemRecord[]): Promise<ItemGreenState[]> {
  const parties = await db
    .select({ id: projectParty.id })
    .from(projectParty)
    .where(eq(projectParty.projectId, brief.projectId))
    .orderBy(asc(projectParty.id));
  const presence = await listBriefPresence(db, brief.id);
  const pairs = await db
    .select({ id: pairwiseAgreement.id, one: pairwiseAgreement.partyOneId, two: pairwiseAgreement.partyTwoId })
    .from(pairwiseAgreement)
    .where(eq(pairwiseAgreement.projectId, brief.projectId));
  const ticks = items.length
    ? await db
        .select({ itemId: briefTick.briefItemId, partyId: briefTick.partyId })
        .from(briefTick)
        .where(inArray(briefTick.briefItemId, items.map((i) => i.id)))
    : [];
  const ctx: ApproverContext = {
    partyIds: parties.map((p) => p.id),
    onSite: new Set(presence.filter((p) => p.onSite).map((p) => p.partyId)),
    pairs: new Map(pairs.map((p) => [p.id, [p.one, p.two] as const])),
  };
  return items.map((item) => {
    const approverIds = approversOf(item, ctx);
    const ticked = new Set(ticks.filter((t) => t.itemId === item.id).map((t) => t.partyId));
    const tickedBy = approverIds.filter((id) => ticked.has(id));
    const green = item.pending === null && tickedBy.length === approverIds.length;
    return { item, approverIds, tickedBy, green };
  });
}

/**
 * Every item's current green state: its derived approvers, who ticks it now,
 * and whether it is green. The complete record, for the developer demo and
 * internal callers; a party gets `getBriefGreenStateVisibleTo`.
 */
export async function getBriefGreenState(db: Executor, briefId: string): Promise<BriefGreenState> {
  const brief = await requireBrief(db, briefId);
  return { brief, items: await greenStateOf(db, brief, await listBriefItems(db, briefId)) };
}

/**
 * The green state of the items a party may see (D10): universal and shared
 * items, and only the money items of its own pairs, with their ticks. It
 * says nothing about whether the whole brief is ready, which could reveal
 * another pair's private fee in a multi-party project.
 */
export async function getBriefGreenStateVisibleTo(db: Executor, briefId: string, partyId: string): Promise<BriefGreenState> {
  const brief = await requireBrief(db, briefId);
  return { brief, items: await greenStateOf(db, brief, await listBriefItemsVisibleTo(db, briefId, partyId)) };
}

/**
 * Ready to sign, derived (LB-13): the brief is live, nothing is pending, and
 * every current item is green for all of its derived approvers. No organizer
 * confirmation, stored flag or time.
 *
 * It means every CURRENT item satisfies the structural all-green rule. Until
 * the D01 required-item catalogue exists it does not prove the brief holds
 * every product-required item; real use remains gated.
 */
export async function isBriefReadyToSign(db: Executor, briefId: string): Promise<boolean> {
  const state = await getBriefGreenState(db, briefId);
  return isReady(state.brief.phase, state.items);
}

/** The ready-to-sign rule over a computed green state. */
export function isReady(phase: BriefPhase, items: readonly ItemGreenState[]): boolean {
  return phase === 'live' && items.every((s) => s.item.pending === null && s.green);
}

/** The brief's ticks, for internal reads and tests. */
export async function listBriefTicks(db: Executor, briefId: string): Promise<TickRecord[]> {
  const rows = await db
    .select({ briefItemId: briefTick.briefItemId, partyId: briefTick.partyId })
    .from(briefTick)
    .innerJoin(briefItem, eq(briefItem.id, briefTick.briefItemId))
    .where(eq(briefItem.briefId, briefId))
    .orderBy(asc(briefTick.briefItemId), asc(briefTick.partyId));
  return rows;
}

// ---- Signing freeze (S10) ----

/** The brief's phase and, while signing, its fingerprint. */
export interface BriefSigningState {
  readonly phase: BriefPhase;
  readonly fingerprint: string | null;
}

/**
 * Everything the fingerprint binds (docs/engineering/S10-SIGNING-FREEZE.md).
 * Positions only order the items: a gap would encode that a request was
 * declined (HC1), so their values are not bound. Ticks are not bound: at
 * freeze they equal each item's approvers, and how affirmation is evidenced
 * is S11's open question.
 */
export interface FingerprintSnapshot {
  readonly briefId: string;
  readonly projectId: string;
  readonly parties: readonly { readonly id: string; readonly onSite: boolean | null }[];
  readonly pairs: readonly { readonly id: string; readonly partyIds: readonly [string, string] }[];
  readonly items: readonly {
    readonly id: string;
    readonly position: number;
    readonly layer: BriefItemRecord['layer'];
    readonly pairwiseAgreementId: string | null;
    readonly subjectPartyId: string | null;
    readonly shape: BriefItemRecord['shape'];
    readonly itemKey: BriefItemKey | null;
    readonly content: string | null;
    readonly value: string | null;
    readonly approverIds: readonly string[];
  }[];
}

/** Fingerprint format v1. Changing what is bound or how is a new version. */
export const FINGERPRINT_DOMAIN = 'modeling-standard/brief-fingerprint';
export const FINGERPRINT_VERSION = 1;

const lower = (id: string): string => id.toLowerCase();
const lowerOrNull = (id: string | null): string | null => (id === null ? null : id.toLowerCase());
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * SHA-256, lowercase hex, of the UTF-8 JSON of a nested array (no object key
 * order is relied on): domain, version, brief, project, the parties with
 * their on-site fact, the pairs with their two parties, and the items in
 * canonical order (position, then id) with their stored identity, wording,
 * value and derived approvers. Ids are lowercased; every list without a
 * meaningful order is sorted by code units; text is hashed exactly as
 * stored, with no trimming or normalization. The database computes the same
 * digest on entering signing (migrations/0024) and refuses any other.
 */
export function briefFingerprint(snapshot: FingerprintSnapshot): string {
  const items = [...snapshot.items].sort((a, b) => a.position - b.position || byCodeUnits(lower(a.id), lower(b.id)));
  const payload = [
    FINGERPRINT_DOMAIN,
    FINGERPRINT_VERSION,
    lower(snapshot.briefId),
    lower(snapshot.projectId),
    snapshot.parties.map((p) => [lower(p.id), p.onSite] as const).sort((a, b) => byCodeUnits(a[0], b[0])),
    snapshot.pairs.map((p) => [lower(p.id), p.partyIds.map(lower).sort(byCodeUnits)] as const).sort((a, b) => byCodeUnits(a[0], b[0])),
    items.map((i) => [
      lower(i.id),
      i.layer,
      lowerOrNull(i.pairwiseAgreementId),
      lowerOrNull(i.subjectPartyId),
      i.shape,
      i.itemKey,
      i.content,
      i.value,
      i.approverIds.map(lower).sort(byCodeUnits),
    ]),
  ];
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

/** The brief's current fingerprint snapshot, read in the caller's transaction. */
async function fingerprintSnapshot(tx: Executor, brief: LiveBriefRecord, state: readonly ItemGreenState[]): Promise<FingerprintSnapshot> {
  const parties = await tx.select({ id: projectParty.id }).from(projectParty).where(eq(projectParty.projectId, brief.projectId));
  const presence = new Map((await listBriefPresence(tx, brief.id)).map((p) => [p.partyId, p.onSite]));
  const pairs = await tx
    .select({ id: pairwiseAgreement.id, one: pairwiseAgreement.partyOneId, two: pairwiseAgreement.partyTwoId })
    .from(pairwiseAgreement)
    .where(eq(pairwiseAgreement.projectId, brief.projectId));
  return {
    briefId: brief.id,
    projectId: brief.projectId,
    parties: parties.map((p) => ({ id: p.id, onSite: presence.get(p.id) ?? null })),
    pairs: pairs.map((p) => ({ id: p.id, partyIds: [p.one, p.two] as const })),
    items: state.map(({ item, approverIds }) => ({
      id: item.id,
      position: item.position,
      layer: item.layer,
      pairwiseAgreementId: item.pairwiseAgreementId,
      subjectPartyId: item.subjectPartyId,
      shape: item.shape,
      itemKey: item.itemKey,
      content: item.content,
      value: item.value,
      approverIds,
    })),
  };
}

/**
 * Freezes a brief for signing (S10): live -> signing, with the fingerprint
 * of its current signing-relevant state. Refused unless the brief is live
 * (`not_live`), ready to sign (`not_ready`), and in a project of exactly two
 * parties and one pair (`unsupported_topology`; a conservative boundary of
 * this slice, not a product ruling). The database re-checks readiness and
 * topology on the transition and recomputes the digest, refusing a mismatch.
 *
 * Internal: no party act and no record of who or when. Freezing again after
 * a withdrawal recomputes everything.
 */
export async function freezeBriefForSigning(db: Executor, briefId: string): Promise<{ briefId: string; fingerprint: string }> {
  return db.transaction(async (tx) => {
    await lockBrief(tx, briefId);
    // The row lock is taken before anything is read: every database guard on
    // a write the fingerprint depends on locks this row FOR SHARE, so such a
    // write has either committed (and is read below) or waits for this
    // transaction (and then finds the brief signing).
    await tx.select({ id: liveBrief.id }).from(liveBrief).where(eq(liveBrief.id, briefId)).for('update');
    const brief = await requireBrief(tx, briefId);
    if (brief.phase !== 'live') throw new BriefActionRefusedError('not_live');
    const state = await greenStateOf(tx, brief, await listBriefItems(tx, briefId));
    if (!isReady(brief.phase, state)) throw new BriefActionRefusedError('not_ready');
    const snapshot = await fingerprintSnapshot(tx, brief, state);
    if (snapshot.parties.length !== 2 || snapshot.pairs.length !== 1) throw new BriefActionRefusedError('unsupported_topology');
    const fingerprint = briefFingerprint(snapshot);
    const [row] = await tx.update(liveBrief).set({ phase: 'signing', fingerprint }).where(eq(liveBrief.id, briefId)).returning({ id: liveBrief.id });
    if (!row) throw new BriefNotFoundError();
    return { briefId: row.id, fingerprint };
  }, READ_COMMITTED);
}

/**
 * The brief's fingerprint snapshot as it is now, with each item's derived
 * approvers, read in the caller's transaction (S11 finalization copies it).
 * Call under the brief lock.
 */
export async function readFingerprintSnapshot(tx: Executor, brief: LiveBriefRecord): Promise<FingerprintSnapshot> {
  return fingerprintSnapshot(tx, brief, await greenStateOf(tx, brief, await listBriefItems(tx, brief.id)));
}

/** The brief's phase and fingerprint. */
export async function getBriefSigningState(db: Executor, briefId: string): Promise<BriefSigningState> {
  const [row] = await db.select({ phase: liveBrief.phase, fingerprint: liveBrief.fingerprint }).from(liveBrief).where(eq(liveBrief.id, briefId)).limit(1);
  if (!row) throw new BriefNotFoundError();
  return { phase: row.phase as BriefPhase, fingerprint: row.fingerprint };
}
