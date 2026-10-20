import { z } from 'zod';
import { AppError } from '../app/errors.ts';
import type { SyntheticPrincipal } from '../authorization/access.ts';
import {
  BriefItemNotFoundError,
  BriefNotFoundError,
  findLiveBriefForProject,
  listBriefItemsVisibleTo,
  type BriefItemRecord,
  type LiveBriefRecord,
} from '../briefs/brief.ts';
import {
  DELIBERATE_TICK_KEYS,
  declineBriefRequest,
  getBriefGreenStateVisibleTo,
  groupCheckBriefItems,
  isReady,
  listBriefPresence,
  setOpenParameterBySubject,
  tickBriefItem,
  untickBriefItem,
  type ItemGreenState,
} from '../briefs/live.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { listPairwiseAgreements } from '../projects/agreement.ts';
import { listProjectParties } from '../projects/party.ts';
import { creatorOnly, findProject } from '../projects/project.ts';
import { asConflict } from './simulator.ts';

/**
 * Participant screens for the synthetic demo: one live brief seen as one
 * party, with only what that party may see and the acts that party may take.
 *
 * The simulated party is a URL parameter, never a credential. Every request
 * is still the demo operator (who must have created the project); in the
 * product each person acts only for themselves, signed in (D03, D12), and
 * none of that is built.
 *
 * Reads are party-filtered at the source (D10): `listBriefItemsVisibleTo`,
 * `getBriefGreenStateVisibleTo`, the presence facts, the project's parties
 * and its pair records. Never the whole-brief reads.
 *
 * The visibility pre-check runs in `load`, before any data function or
 * database guard: the project must exist, its brief must be live, the party
 * must belong to the project, and every item id named in the request must be
 * one this party can see. Any miss is the generic 404 a nonexistent id gets,
 * so a hidden item (another pair's fee) cannot be told from an id that never
 * existed. Without it, the data functions and database guards would answer
 * `deliberate_tick`, `item_not_in_brief` or `not_an_approver`, revealing
 * that the item exists and what it is. After the pre-check the data
 * functions run with the party's id, and their refusals are the stable 409
 * codes; error bodies never mention hidden items, other pairs or readiness.
 *
 * No rule is re-implemented here. The permitted actions are a presentation
 * of who the functions would admit, derived from the visible state; the
 * functions and the database still decide.
 */

type ProjectRow = NonNullable<Awaited<ReturnType<typeof findProject>>>;

export interface ParticipantTarget {
  readonly project: ProjectRow;
  readonly brief: LiveBriefRecord;
  readonly partyId: string;
  readonly partyIds: readonly string[];
  readonly visible: readonly BriefItemRecord[];
}

/** The visibility pre-check. `undefined` is the generic 404. */
export async function loadParticipant(
  db: Executor,
  projectId: string,
  partyId: string,
  itemIds: readonly string[] = [],
): Promise<ParticipantTarget | undefined> {
  const project = await findProject(db, projectId);
  if (!project) return undefined;
  const brief = await findLiveBriefForProject(db, project.id);
  if (!brief || brief.phase !== 'live') return undefined;
  const party = partyId.toLowerCase();
  const partyIds = (await listProjectParties(db, project.id)).map((p) => p.id);
  if (!partyIds.includes(party)) return undefined;
  const visible = await listBriefItemsVisibleTo(db, brief.id, party);
  const visibleIds = new Set(visible.map((item) => item.id));
  if (itemIds.some((id) => !visibleIds.has(id.toLowerCase()))) return undefined;
  return { project, brief, partyId: party, partyIds, visible };
}

export interface PermittedActions {
  readonly tick: boolean;
  readonly untick: boolean;
  readonly setParameter: boolean;
  readonly decline: boolean;
  readonly groupCheck: boolean;
}

export function isDeliberate(item: BriefItemRecord): boolean {
  return item.itemKey !== null && DELIBERATE_TICK_KEYS.includes(item.itemKey);
}

/**
 * What this party may do with one visible item, as the S09 functions would
 * admit it. Settling a decide-together value is not here: it is not a party
 * act (the function takes no actor; who enters the agreed value is open).
 */
export function permittedActions(state: ItemGreenState, partyId: string): PermittedActions {
  const { item, approverIds, tickedBy } = state;
  const settled = item.pending === null;
  const approver = approverIds.includes(partyId);
  const ticked = tickedBy.includes(partyId);
  const tick = settled && approver && !ticked;
  return {
    tick,
    untick: ticked,
    setParameter: item.shape === 'open_parameter' && item.pending === 'subject' && item.subjectPartyId === partyId,
    decline: item.shape === 'request' && item.layer !== 'universal' && item.subjectPartyId === partyId,
    groupCheck: tick && !isDeliberate(item),
  };
}

const uuid = z.uuid();
const actionsDto = z.strictObject({
  tick: z.boolean(),
  untick: z.boolean(),
  setParameter: z.boolean(),
  decline: z.boolean(),
  groupCheck: z.boolean(),
});

// What a party sees of one item: what it says and where it stands now. No
// position (a gap would reveal a declined request or another pair's fee), no
// pair-scope record id, no time, author or history.
const participantItemDto = z.strictObject({
  id: uuid,
  layer: z.enum(['universal', 'shared', 'money']),
  /** The two parties a pair-scoped item is between; null when project-wide. */
  between: z.tuple([uuid, uuid]).nullable(),
  subjectPartyId: uuid.nullable(),
  shape: z.enum(['declaration', 'request', 'open_parameter']).nullable(),
  itemKey: z.enum(['fee', 'no_means_no', 'coverage_level', 'physical_contact', 'stop_rule']).nullable(),
  deliberate: z.boolean(),
  content: z.string().nullable(),
  value: z.string().nullable(),
  pending: z.enum(['decide_together', 'subject']).nullable(),
  approverIds: z.array(uuid),
  tickedBy: z.array(uuid),
  green: z.boolean(),
  actions: actionsDto,
});

export const participantViewDto = z.strictObject({
  projectId: uuid,
  partyId: uuid,
  phase: z.literal('live'),
  parties: z.array(z.strictObject({ id: uuid, onSite: z.boolean().nullable() })),
  items: z.array(participantItemDto),
  /** Counts over this party's visible items only. */
  progress: z.strictObject({ green: z.number().int().nonnegative(), total: z.number().int().nonnegative(), open: z.number().int().nonnegative() }),
  /** Present only for a two-party, one-pair project, where the party sees every item. */
  ready: z.boolean().optional(),
});

export type ParticipantView = z.output<typeof participantViewDto>;

/** The party's view, from the party-filtered reads only. */
export async function participantView(db: Executor, target: ParticipantTarget): Promise<ParticipantView> {
  const { brief, partyId, partyIds } = target;
  const state = await getBriefGreenStateVisibleTo(db, brief.id, partyId);
  const presence = new Map((await listBriefPresence(db, brief.id)).map((p) => [p.partyId, p.onSite]));
  const pairs = await listPairwiseAgreements(db, target.project.id);
  const pairOf = new Map(pairs.map((pair) => [pair.id, [...pair.partyIds].sort() as [string, string]]));
  const items = state.items.map((s) => ({
    id: s.item.id,
    layer: s.item.layer,
    between: s.item.pairwiseAgreementId === null ? null : (pairOf.get(s.item.pairwiseAgreementId) ?? null),
    subjectPartyId: s.item.subjectPartyId,
    shape: s.item.shape,
    itemKey: s.item.itemKey,
    deliberate: isDeliberate(s.item),
    content: s.item.content,
    value: s.item.value,
    pending: s.item.pending,
    approverIds: [...s.approverIds],
    tickedBy: [...s.tickedBy],
    green: s.green,
    actions: permittedActions(s, partyId),
  }));
  // With exactly two parties and one pair, a party sees every item of the
  // brief (the pair's money included), so the all-green rule over its
  // visible state is the brief's own. Otherwise readiness could reveal
  // another pair's private fee, and the key is absent.
  const twoPartyOnePair = partyIds.length === 2 && pairs.length === 1;
  return {
    projectId: target.project.id,
    partyId,
    phase: 'live',
    parties: [...partyIds].sort().map((id) => ({ id, onSite: presence.get(id) ?? null })),
    items,
    progress: {
      green: items.filter((i) => i.green).length,
      total: items.length,
      open: items.filter((i) => i.pending !== null).length,
    },
    ...(twoPartyOnePair ? { ready: isReady(state.brief.phase, state.items) } : {}),
  };
}

/** Domain refusals as stable 409s; an item gone since the pre-check is the same generic 404. */
async function act<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BriefItemNotFoundError || error instanceof BriefNotFoundError) throw new AppError(404, 'not_found');
    return asConflict(error);
  }
}

const asParams = z.strictObject({ projectId: uuid, partyId: uuid });
const itemParams = z.strictObject({ projectId: uuid, partyId: uuid, itemId: uuid });
const policy = (principal: SyntheticPrincipal, target: ParticipantTarget) => creatorOnly(principal, target.project);
const value = z
  .string()
  .max(500)
  .refine((v) => /\S/u.test(v), { error: 'must contain a non-space character' });

export const readParticipantViewOperation = defineOperation({
  name: 'demo.shoots.as.read',
  method: 'GET',
  path: '/demo/shoots/:projectId/as/:partyId',
  input: { params: asParams },
  output: participantViewDto,
  access: {
    kind: 'protected',
    load: (input, db) => loadParticipant(db, input.params.projectId, input.params.partyId),
    policy,
  },
  run: async (_input, { db, target }) => participantView(db, target),
});

type ItemAct = (db: Executor, itemId: string, partyId: string, body: { value?: string }) => Promise<unknown>;

function itemActOperation(verb: 'tick' | 'untick' | 'decline' | 'parameter', perform: ItemAct, body: z.ZodObject<z.ZodRawShape, z.core.$strict>) {
  return defineOperation({
    name: `demo.shoots.as.${verb}`,
    method: 'POST',
    path: `/demo/shoots/:projectId/as/:partyId/items/:itemId/${verb}`,
    input: { params: itemParams, body },
    output: participantViewDto,
    access: {
      kind: 'protected',
      load: (input, db) => loadParticipant(db, input.params.projectId, input.params.partyId, [input.params.itemId]),
      policy,
    },
    run: async (input, { db, target }) => {
      await act(() => perform(db, input.params.itemId, target.partyId, input.body as { value?: string }));
      return participantView(db, target);
    },
  });
}

const noBody = z.strictObject({});

export const participantOperations: readonly AnyOperation[] = [
  readParticipantViewOperation,
  itemActOperation('tick', (db, itemId, partyId) => tickBriefItem(db, itemId, partyId), noBody),
  itemActOperation('untick', (db, itemId, partyId) => untickBriefItem(db, itemId, partyId), noBody),
  itemActOperation('decline', (db, itemId, partyId) => declineBriefRequest(db, itemId, partyId), noBody),
  itemActOperation('parameter', (db, itemId, partyId, body) => setOpenParameterBySubject(db, itemId, partyId, body.value!), z.strictObject({ value })),
  defineOperation({
    name: 'demo.shoots.as.group-check',
    method: 'POST',
    path: '/demo/shoots/:projectId/as/:partyId/group-check',
    input: { params: asParams, body: z.strictObject({ itemIds: z.array(uuid).min(1).max(100) }) },
    output: participantViewDto,
    access: {
      kind: 'protected',
      load: (input, db) => loadParticipant(db, input.params.projectId, input.params.partyId, input.body.itemIds),
      policy,
    },
    run: async (input, { db, target }) => {
      await act(() => groupCheckBriefItems(db, target.brief.id, target.partyId, input.body.itemIds));
      return participantView(db, target);
    },
  }),
];
