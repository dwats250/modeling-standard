import { z } from 'zod';
import type { Principal } from '../authorization/access.ts';
import { findBindingForParty } from '../accounts/binding.ts';
import { BriefActionRefusedError, briefOfItem, findLiveBrief } from '../briefs/brief.ts';
import {
  declineBriefRequest,
  freezeBriefForSigning,
  getBriefSigningState,
  groupCheckBriefItems,
  setDraftPartyPresence,
  setOpenParameterBySubject,
  settleDecideTogetherItem,
  shareLiveBrief,
  tickBriefItem,
  untickBriefItem,
} from '../briefs/live.ts';
import { finalizeBrief } from '../contracts/contract.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { listProjectParties } from '../projects/party.ts';
import { creatorOnly, findProject, insertProject } from '../projects/project.ts';
import { guarded } from '../participants/refusals.ts';
import type { AnnotationStore } from './annotations.ts';
import { buildWalkthroughDraft, walkthroughAnnotation } from './walkthrough.ts';

/**
 * The demo's scenario simulator. Demo-only operations, registered only by the
 * demo server and never in the production list, that drive the S09 data
 * functions so a viewer can walk a synthetic photographer and model through
 * draft → share → live → resolve → green → ready to sign, and (S11) the
 * operator's synthetic finalization into the final contract.
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
  policy: (principal: Principal, target: BriefTarget) => creatorOnly(principal, target.project),
};
const itemAccess = {
  kind: 'protected' as const,
  load: (input: { params: { id: string } }, db: Executor) => loadItem(db, input.params.id),
  policy: (principal: Principal, target: ItemTarget) => creatorOnly(principal, target.project),
};

const idParams = z.strictObject({ id: z.uuid() });
const idOutput = z.strictObject({ id: z.uuid() });
const value = z
  .string()
  .max(500)
  .refine((v) => /\S/u.test(v), { error: 'must contain a non-space character' });
const party = z.strictObject({ partyId: z.uuid() });

// ---- Start ----

/**
 * Starts the walkthrough. The labels Photographer and Model, and the pair's
 * label, go to the demo annotation store, so every browser (a LAN phone
 * included) sees them; the database stores no role.
 */
export function startScenarioOperation(annotations: AnnotationStore) {
  return defineOperation({
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
      const self = principal as Principal;
      const { project, draft } = await db.transaction(async (tx) => {
        const project = await insertProject(tx, { createdByPrincipalId: self.id });
        return { project, draft: await buildWalkthroughDraft(tx, project.id) };
      });
      await annotations.setProject(project.id, walkthroughAnnotation(draft, 'Walkthrough — Photographer and Model'));
      return { id: project.id, photographerPartyId: draft.photographerPartyId, modelPartyId: draft.modelPartyId };
    },
  });
}

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

// ---- Ready to sign: the operator's synthetic finalization (S11) ----

/**
 * SYNTHETIC, OPERATOR-ONLY: finalizes a ready brief into its final contract
 * with both parties' signature evidence, as one operator act. It is not the
 * signing act, which is not decided (D04), and it does not say whether one
 * person may sign before the other: both signatures are given at once. Each
 * signature is the party's own bound account (a person who claimed their
 * invitation); a party without one is refused (`not_bound_account`). A live,
 * ready brief is frozen first (S10). No request evidence is passed: the
 * operator's browser is neither party's device.
 */
export const finalizeBriefOperation = defineOperation({
  name: 'demo.sim.brief.finalize',
  method: 'POST',
  path: '/demo/sim/briefs/:id/finalize',
  input: { params: idParams, body: z.strictObject({}) },
  output: z.strictObject({ id: z.uuid(), contractId: z.uuid() }),
  access: briefAccess,
  run: async (_input, { db, target }) =>
    guarded(async () => {
      if ((await getBriefSigningState(db, target.briefId)).phase === 'final') throw new BriefActionRefusedError('already_final');
      // Bindings first, so a refusal here leaves the brief as it was.
      const signers = [];
      for (const party of await listProjectParties(db, target.project.id)) {
        const binding = await findBindingForParty(db, party.id);
        if (!binding) throw new BriefActionRefusedError('not_bound_account');
        signers.push({ partyId: party.id, accountId: binding.accountId });
      }
      if (signers.length !== 2) throw new BriefActionRefusedError('unsupported_topology');
      if ((await getBriefSigningState(db, target.briefId)).phase === 'live') await freezeBriefForSigning(db, target.briefId);
      const { fingerprint } = await getBriefSigningState(db, target.briefId);
      if (fingerprint === null) throw new BriefActionRefusedError('not_signing');
      const [one, two] = signers.map((signer) => ({ ...signer, fingerprint }));
      const { contractId } = await finalizeBrief(db, target.briefId, [one!, two!]);
      return { id: target.briefId, contractId };
    }),
});

export const createSimulatorOperations = (annotations: AnnotationStore): readonly AnyOperation[] => [
  startScenarioOperation(annotations),
  setPresenceOperation,
  shareBriefOperation,
  settleOperation,
  setParameterOperation,
  declineOperation,
  tickOperation,
  untickOperation,
  groupCheckOperation,
  finalizeBriefOperation,
];
