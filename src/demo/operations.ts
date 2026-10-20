import { z } from 'zod';
import type { Policy, SyntheticPrincipal } from '../authorization/access.ts';
import { findLiveBriefForProject } from '../briefs/brief.ts';
import { getBriefGreenState, isReady, listBriefPresence } from '../briefs/live.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { listPairwiseAgreements } from '../projects/agreement.ts';
import { listProjectParties } from '../projects/party.ts';
import { creatorOnly, findProject, listProjectsCreatedBy } from '../projects/project.ts';
import type { AnnotationStore } from './annotations.ts';
import { participantOperations } from './participant.ts';
import { createShootOperations } from './shoots.ts';
import { createSimulatorOperations } from './simulator.ts';

/**
 * Read-only operations for the local synthetic demo's record inspector.
 *
 * They are registered only by the demo server (`src/scripts/demo.ts`) and are
 * never in the production operation list. They go through the same boundary
 * as production operations: declared protected access, strict input and
 * output, authorization on the loaded project with the S01 creator-only
 * policy.
 *
 * The inspector shows the stored record as it is: parties, the internal
 * pair-scope records, and the live brief (S08, S09) with its phase, presence
 * facts and each item's current green state, derived (approvers, who ticks
 * it now, green) — and whether the whole brief is ready to sign. It is not a
 * view any party would get: D10 is decided for photo shoots, but no party
 * view is built. It writes nothing, and shows no time or history because
 * none is stored.
 */

const anyPrincipalMayListOwn: Policy<object> = () => true;

const projectSummary = z.strictObject({
  id: z.uuid(),
  partyCount: z.number().int().nonnegative(),
  agreementCount: z.number().int().nonnegative(),
});

export const listDemoProjectsOperation = defineOperation({
  name: 'demo.projects.list',
  method: 'GET',
  path: '/demo/projects',
  output: z.strictObject({ projects: z.array(projectSummary) }),
  access: {
    kind: 'protected',
    // The listing is always scoped to the requesting principal's own projects.
    load: async () => ({}),
    policy: anyPrincipalMayListOwn,
  },
  run: async (_input, { db, principal }) => {
    const self = principal as SyntheticPrincipal;
    const rows = await listProjectsCreatedBy(db, self.id);
    const projects = [];
    for (const row of rows) {
      const parties = await listProjectParties(db, row.id);
      const agreements = await listPairwiseAgreements(db, row.id);
      projects.push({ id: row.id, partyCount: parties.length, agreementCount: agreements.length });
    }
    return { projects };
  },
});

// A brief item exactly as stored (S08), with its current green state
// derived (S09). No time, order of acts, author, requiredness, finality or
// signature exists to show.
const briefItemDto = z.strictObject({
  id: z.uuid(),
  layer: z.enum(['universal', 'shared', 'money']),
  pairwiseAgreementId: z.uuid().nullable(),
  subjectPartyId: z.uuid().nullable(),
  shape: z.enum(['declaration', 'request', 'open_parameter']).nullable(),
  itemKey: z.enum(['fee', 'no_means_no', 'coverage_level', 'physical_contact', 'stop_rule']).nullable(),
  content: z.string().nullable(),
  value: z.string().nullable(),
  pending: z.enum(['decide_together', 'subject']).nullable(),
  position: z.number().int().positive(),
  approverIds: z.array(z.uuid()),
  tickedBy: z.array(z.uuid()),
  green: z.boolean(),
});

export const readDemoProjectRecordOperation = defineOperation({
  name: 'demo.project.record',
  method: 'GET',
  path: '/demo/projects/:id/record',
  input: { params: z.strictObject({ id: z.uuid() }) },
  output: z.strictObject({
    project: z.strictObject({ id: z.uuid() }),
    parties: z.array(z.strictObject({ id: z.uuid() })),
    agreements: z.array(z.strictObject({ id: z.uuid(), partyIds: z.tuple([z.uuid(), z.uuid()]) })),
    brief: z
      .strictObject({
        id: z.uuid(),
        // `signing` (S10) is internal; the demo never freezes a brief.
        phase: z.enum(['draft', 'live', 'signing']),
        ready: z.boolean(),
        presence: z.array(z.strictObject({ partyId: z.uuid(), onSite: z.boolean() })),
        items: z.array(briefItemDto),
      })
      .nullable(),
  }),
  access: {
    kind: 'protected',
    load: (input, db) => findProject(db, input.params.id),
    policy: creatorOnly,
  },
  run: async (_input, { db, target }) => {
    const parties = await listProjectParties(db, target.id);
    const agreements = await listPairwiseAgreements(db, target.id);
    const found = await findLiveBriefForProject(db, target.id);
    const state = found ? await getBriefGreenState(db, found.id) : null;
    return {
      project: { id: target.id },
      parties: parties.map((p) => ({ id: p.id })),
      agreements: agreements.map((a) => ({ id: a.id, partyIds: [a.partyIds[0], a.partyIds[1]] as [string, string] })),
      brief: state
        ? {
            id: state.brief.id,
            phase: state.brief.phase,
            ready: isReady(state.brief.phase, state.items),
            presence: await listBriefPresence(db, state.brief.id),
            items: state.items.map(({ item, approverIds, tickedBy, green }) => ({
              id: item.id,
              layer: item.layer,
              pairwiseAgreementId: item.pairwiseAgreementId,
              subjectPartyId: item.subjectPartyId,
              shape: item.shape,
              itemKey: item.itemKey,
              content: item.content,
              value: item.value,
              pending: item.pending,
              position: item.position,
              approverIds: [...approverIds],
              tickedBy: [...tickedBy],
              green,
            })),
          }
        : null,
    };
  },
});

/**
 * Every demo operation: the inspector's reads, the simulator, the composer
 * and scenario cards, and the participant screens. The operations that write
 * demo labels are given the annotation store they write to.
 */
export function createDemoOperations(annotations: AnnotationStore): readonly AnyOperation[] {
  return [
    listDemoProjectsOperation,
    readDemoProjectRecordOperation,
    ...createSimulatorOperations(annotations),
    ...createShootOperations(annotations),
    ...participantOperations,
  ];
}
