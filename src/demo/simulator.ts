import { z } from 'zod';
import type { SyntheticPrincipal } from '../authorization/access.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { createPairwiseAgreement } from '../projects/agreement.ts';
import { addProjectParty } from '../projects/party.ts';
import { insertProject } from '../projects/project.ts';

/**
 * The demo's scenario simulator. Demo-only, registered only by the demo
 * server.
 *
 * Since S08 it has one operation: start a scenario (a fresh project with two
 * parties and one pair-scope record between them, the D01 shape), as fixture
 * construction. The S03–S05 term, version and tick operations were retired
 * with those tables. Draft brief composition has data functions (S08) but no
 * product path and no simulator operation: who may compose a draft is the
 * participant surface's question, not the demo's.
 */

export const startScenarioOperation = defineOperation({
  name: 'demo.sim.scenario.start',
  method: 'POST',
  path: '/demo/sim/scenarios',
  successStatus: 201,
  input: { body: z.strictObject({}) },
  output: z.strictObject({ id: z.uuid() }),
  access: { kind: 'protected', load: async () => ({}), policy: () => true },
  run: async (_input, { db, principal }) => {
    const self = principal as SyntheticPrincipal;
    const project = await insertProject(db, { createdByPrincipalId: self.id });
    const one = await addProjectParty(db, project.id);
    const two = await addProjectParty(db, project.id);
    await createPairwiseAgreement(db, project.id, [one.id, two.id]);
    return { id: project.id };
  },
});

export const simulatorOperations: readonly AnyOperation[] = [startScenarioOperation];
