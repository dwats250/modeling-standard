import { z } from 'zod';
import type { Policy, SyntheticPrincipal } from '../authorization/access.ts';
import { findLiveBriefForProject, listBriefItems } from '../briefs/brief.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { listPairwiseAgreements } from '../projects/agreement.ts';
import { listProjectParties } from '../projects/party.ts';
import { creatorOnly, findProject, listProjectsCreatedBy } from '../projects/project.ts';
import { simulatorOperations } from './simulator.ts';

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
 * pair-scope records, and the draft live brief (S08). It is not a view any
 * party would get: D10 is decided for photo shoots, but no party view is
 * built. It writes nothing.
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

// A draft brief item exactly as stored (S08). Draft composition only: no
// phase, tick, requiredness, finality or signature exists to show.
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
    brief: z.strictObject({ id: z.uuid(), items: z.array(briefItemDto) }).nullable(),
  }),
  access: {
    kind: 'protected',
    load: (input, db) => findProject(db, input.params.id),
    policy: creatorOnly,
  },
  run: async (_input, { db, target }) => {
    const parties = await listProjectParties(db, target.id);
    const agreements = await listPairwiseAgreements(db, target.id);
    const brief = await findLiveBriefForProject(db, target.id);
    return {
      project: { id: target.id },
      parties: parties.map((p) => ({ id: p.id })),
      agreements: agreements.map((a) => ({ id: a.id, partyIds: [a.partyIds[0], a.partyIds[1]] as [string, string] })),
      brief: brief
        ? {
            id: brief.id,
            items: (await listBriefItems(db, brief.id)).map((item) => ({
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
            })),
          }
        : null,
    };
  },
});

export const demoOperations: readonly AnyOperation[] = [
  listDemoProjectsOperation,
  readDemoProjectRecordOperation,
  ...simulatorOperations,
];
