import { z } from 'zod';
import { AppError } from '../app/errors.ts';
import type { SyntheticPrincipal } from '../authorization/access.ts';
import { BriefActionRefusedError, briefOfItem, findLiveBrief } from '../briefs/brief.ts';
import {
  declineBriefRequest,
  groupCheckBriefItems,
  setDraftPartyPresence,
  setOpenParameterBySubject,
  settleDecideTogetherItem,
  shareLiveBrief,
  tickBriefItem,
  untickBriefItem,
} from '../briefs/live.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { creatorOnly, findProject, insertProject } from '../projects/project.ts';
import { buildWalkthroughDraft } from './walkthrough.ts';

/**
 * The demo's scenario simulator. Demo-only operations, registered only by the
 * demo server and never in the production list, that drive the S09 data
 * functions so a viewer can walk a synthetic photographer and model through
 * draft → share → live → resolve → green → ready to sign.
 *
 * Every act here is a SIMULATION. The demo operator chooses which synthetic
 * party is acting; in the product only a party acts for itself (D12), signed
 * in to its own account (D03; sign-in is not built). Nothing here is a
 * participant route.
 *
 * The rules are the data functions' and the database's own (S08, S09); this
 * file adds none. Refusals come back as 409s with a stable code.
 *
 * Authorization: every operation loads the project it acts on (directly, or
 * through the brief or the item) and applies the S01 creator-only policy.
 */

type ProjectRow = NonNullable<Awaited<ReturnType<typeof findProject>>>;
interface BriefTarget {
  readonly briefId: string;
  readonly project: ProjectRow;
}
interface ItemTarget extends BriefTarget {
  readonly itemId: string;
}

async function loadBrief(db: Executor, briefId: string): Promise<BriefTarget | undefined> {
  const brief = await findLiveBrief(db, briefId);
  if (!brief) return undefined;
  const project = await findProject(db, brief.projectId);
  return project ? { briefId: brief.id, project } : undefined;
}

async function loadItem(db: Executor, itemId: string): Promise<ItemTarget | undefined> {
  let briefId: string;
  try {
    briefId = await briefOfItem(db, itemId);
  } catch {
    return undefined;
  }
  const brief = await loadBrief(db, briefId);
  return brief ? { ...brief, itemId } : undefined;
}

const briefAccess = {
  kind: 'protected' as const,
  load: (input: { params: { id: string } }, db: Executor) => loadBrief(db, input.params.id),
  policy: (principal: SyntheticPrincipal, target: BriefTarget) => creatorOnly(principal, target.project),
};
const itemAccess = {
  kind: 'protected' as const,
  load: (input: { params: { id: string } }, db: Executor) => loadItem(db, input.params.id),
  policy: (principal: SyntheticPrincipal, target: ItemTarget) => creatorOnly(principal, target.project),
};

/** Database refusals the walkthrough can meet, by constraint, as stable codes. */
const CONSTRAINT_CODES: Readonly<Record<string, string>> = {
  live_brief_share_requires_wording: 'wording_not_materialized',
  live_brief_share_requires_presence: 'presence_missing',
  brief_tick_requires_approver: 'not_an_approver',
  brief_tick_requires_settled: 'still_pending',
  brief_tick_requires_live: 'not_live',
  brief_item_live_rigid: 'fixed_once_shared',
  brief_item_live_no_insert: 'fixed_once_shared',
  brief_item_live_no_delete: 'fixed_once_shared',
  brief_item_live_universal_kept: 'universal_kept',
  brief_party_presence_live_fixed: 'not_draft',
};

function asConflict(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof BriefActionRefusedError) throw new AppError(409, error.reason);
  const e = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code = typeof e.code === 'string' ? e.code : e.cause?.code;
  const raw = typeof e.constraint === 'string' ? e.constraint : e.cause?.constraint;
  const constraint = typeof raw === 'string' ? raw : '';
  if (constraint in CONSTRAINT_CODES) throw new AppError(409, CONSTRAINT_CODES[constraint]!);
  if (code === '23503') throw new AppError(409, 'not_in_project');
  if (code === '23514') throw new AppError(409, 'rejected_by_database');
  throw error;
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return asConflict(error);
  }
}

const idParams = z.strictObject({ id: z.uuid() });
const idOutput = z.strictObject({ id: z.uuid() });
const value = z
  .string()
  .max(500)
  .refine((v) => /\S/u.test(v), { error: 'must contain a non-space character' });
const party = z.strictObject({ partyId: z.uuid() });

// ---- Start ----

export const startScenarioOperation = defineOperation({
  name: 'demo.sim.scenario.start',
  method: 'POST',
  path: '/demo/sim/scenarios',
  successStatus: 201,
  input: { body: z.strictObject({}) },
  output: z.strictObject({ id: z.uuid(), photographerPartyId: z.uuid(), modelPartyId: z.uuid() }),
  access: { kind: 'protected', load: async () => ({}), policy: () => true },
  run: async (_input, { db, principal }) => {
    // A fresh project with the synthetic photographer and model, their pair,
    // and the walkthrough's draft brief, as fixture construction.
    const self = principal as SyntheticPrincipal;
    const project = await insertProject(db, { createdByPrincipalId: self.id });
    const draft = await buildWalkthroughDraft(db, project.id);
    return { id: project.id, photographerPartyId: draft.photographerPartyId, modelPartyId: draft.modelPartyId };
  },
});

// ---- Draft: presence and share ----

export const setPresenceOperation = defineOperation({
  name: 'demo.sim.brief.presence',
  method: 'POST',
  path: '/demo/sim/briefs/:id/presence',
  input: { params: idParams, body: z.strictObject({ partyId: z.uuid(), onSite: z.boolean() }) },
  output: idOutput,
  access: briefAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      await setDraftPartyPresence(db, target.briefId, input.body.partyId, input.body.onSite);
      return { id: target.briefId };
    }),
});

export const shareBriefOperation = defineOperation({
  name: 'demo.sim.brief.share',
  method: 'POST',
  path: '/demo/sim/briefs/:id/share',
  input: { params: idParams, body: z.strictObject({}) },
  output: idOutput,
  access: briefAccess,
  run: async (_input, { db, target }) => guarded(async () => ({ id: (await shareLiveBrief(db, target.briefId)).id })),
});

// ---- Live: resolve, decline, tick ----

export const settleOperation = defineOperation({
  name: 'demo.sim.item.settle',
  method: 'POST',
  path: '/demo/sim/items/:id/settle',
  input: { params: idParams, body: z.strictObject({ value }) },
  output: idOutput,
  access: itemAccess,
  run: async (input, { db, target }) =>
    guarded(async () => ({ id: (await settleDecideTogetherItem(db, target.itemId, input.body.value)).id })),
});

export const setParameterOperation = defineOperation({
  name: 'demo.sim.item.parameter',
  method: 'POST',
  path: '/demo/sim/items/:id/parameter',
  input: { params: idParams, body: z.strictObject({ partyId: z.uuid(), value }) },
  output: idOutput,
  access: itemAccess,
  run: async (input, { db, target }) =>
    guarded(async () => ({
      id: (await setOpenParameterBySubject(db, target.itemId, input.body.partyId, input.body.value)).id,
    })),
});

export const declineOperation = defineOperation({
  name: 'demo.sim.item.decline',
  method: 'POST',
  path: '/demo/sim/items/:id/decline',
  input: { params: idParams, body: party },
  output: idOutput,
  access: itemAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      await declineBriefRequest(db, target.itemId, input.body.partyId);
      return { id: target.briefId };
    }),
});

export const tickOperation = defineOperation({
  name: 'demo.sim.item.tick',
  method: 'POST',
  path: '/demo/sim/items/:id/tick',
  input: { params: idParams, body: party },
  output: idOutput,
  access: itemAccess,
  run: async (input, { db, target }) =>
    guarded(async () => ({ id: (await tickBriefItem(db, target.itemId, input.body.partyId)).briefItemId })),
});

export const untickOperation = defineOperation({
  name: 'demo.sim.item.untick',
  method: 'POST',
  path: '/demo/sim/items/:id/untick',
  input: { params: idParams, body: party },
  output: idOutput,
  access: itemAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      await untickBriefItem(db, target.itemId, input.body.partyId);
      return { id: target.itemId };
    }),
});

export const groupCheckOperation = defineOperation({
  name: 'demo.sim.brief.group-check',
  method: 'POST',
  path: '/demo/sim/briefs/:id/group-check',
  input: {
    params: idParams,
    body: z.strictObject({ partyId: z.uuid(), itemIds: z.array(z.uuid()).min(1).max(100) }),
  },
  output: idOutput,
  access: briefAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      await groupCheckBriefItems(db, target.briefId, input.body.partyId, input.body.itemIds);
      return { id: target.briefId };
    }),
});

export const simulatorOperations: readonly AnyOperation[] = [
  startScenarioOperation,
  setPresenceOperation,
  shareBriefOperation,
  settleOperation,
  setParameterOperation,
  declineOperation,
  tickOperation,
  untickOperation,
  groupCheckOperation,
];
