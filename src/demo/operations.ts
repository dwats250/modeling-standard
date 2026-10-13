import { z } from 'zod';
import type { Policy, SyntheticPrincipal } from '../authorization/access.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { listPairwiseAgreements } from '../projects/agreement.ts';
import { listProjectParties } from '../projects/party.ts';
import { creatorOnly, findProject, listProjectsCreatedBy } from '../projects/project.ts';

/**
 * Read-only operations for the local synthetic demo's record inspector.
 *
 * They are registered only by the demo server (`src/scripts/demo.ts`) and are
 * never in the production operation list. They go through the same boundary
 * as production operations: declared protected access, strict input and
 * output, authorization on the loaded project with the S01 creator-only
 * policy.
 *
 * The inspector shows the stored record as it is. It is not a view any party
 * would get: what each party sees is D10, still open. It writes nothing.
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

export const readDemoProjectRecordOperation = defineOperation({
  name: 'demo.project.record',
  method: 'GET',
  path: '/demo/projects/:id/record',
  input: { params: z.strictObject({ id: z.uuid() }) },
  output: z.strictObject({
    project: z.strictObject({ id: z.uuid() }),
    parties: z.array(z.strictObject({ id: z.uuid() })),
    agreements: z.array(z.strictObject({ id: z.uuid(), partyIds: z.tuple([z.uuid(), z.uuid()]) })),
  }),
  access: {
    kind: 'protected',
    load: (input, db) => findProject(db, input.params.id),
    policy: creatorOnly,
  },
  run: async (_input, { db, target }) => {
    const parties = await listProjectParties(db, target.id);
    const agreements = await listPairwiseAgreements(db, target.id);
    return {
      project: { id: target.id },
      parties: parties.map((p) => ({ id: p.id })),
      agreements: agreements.map((a) => ({ id: a.id, partyIds: [a.partyIds[0], a.partyIds[1]] as [string, string] })),
    };
  },
});

export const demoOperations: readonly AnyOperation[] = [listDemoProjectsOperation, readDemoProjectRecordOperation];
