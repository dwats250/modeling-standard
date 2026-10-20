import { z } from 'zod';
import type { SyntheticPrincipal } from '../authorization/access.ts';
import { addBriefItem, openLiveBrief, type BriefItemSpec } from '../briefs/brief.ts';
import { declineBriefRequest, setDraftPartyPresence, shareLiveBrief } from '../briefs/live.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { createPairwiseAgreement } from '../projects/agreement.ts';
import { addProjectParty } from '../projects/party.ts';
import { insertProject } from '../projects/project.ts';
import type { AnnotationStore } from './annotations.ts';
import { guarded } from './simulator.ts';
import { buildWalkthroughDraft, walkthroughAnnotation } from './walkthrough.ts';

/**
 * Demo shoots: the composer and the scenario cards. Demo-only operations,
 * registered only by the demo server, never in the production list.
 *
 * Both are OPERATOR-LEVEL and unattributed. Who composes a brief, and how,
 * is the participant surface's question and is not ruled; the demo operator
 * composes here, and the screens say so. Nothing here marks an item
 * required: the required-term catalogue is not drafted, and layer placement
 * is not requiredness.
 *
 * Writes go through the S01, S02 and S08 data functions (and, for the
 * scenario cards, S09's), in one transaction. The labels (Photographer,
 * Model, the shoot's title) go to the demo annotation store after the
 * transaction commits; the database stores no name, role or label.
 */

const SYNTHETIC = '[synthetic] ';

/** Every stored text is marked synthetic, as the fixtures' are. */
export function synthetic(text: string): string {
  const trimmed = text.trim();
  return trimmed.startsWith(SYNTHETIC.trim()) ? trimmed : `${SYNTHETIC}${trimmed}`;
}

const FILL_IN = 'Fill it in.';
const FILL_IN_OR_DECIDE = 'Fill it in, or mark it decide together.';
const FILL_IN_OR_LEAVE = 'Fill it in, or leave it for the Model to set.';

const text = (message: string) =>
  z
    .string({ error: message })
    .max(400)
    .refine((v) => /\S/u.test(v), { error: message });

/** A value field: supplied now, or explicitly left to decide together. */
const valueOrTogether = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('supplied'), value: text(FILL_IN_OR_DECIDE) }),
  z.strictObject({ mode: z.literal('decide_together') }),
]);

/** A subject-controlled field: set now, or left for the Model to set (open parameter). */
const subjectSets = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('set_now'), value: text(FILL_IN_OR_LEAVE) }),
  z.strictObject({ mode: z.literal('model_sets') }),
]);

/** The fee: none (the item is omitted, as in D01), an amount, or decide together. */
const feeField = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('none') }),
  z.strictObject({ mode: z.literal('amount'), value: text(FILL_IN_OR_DECIDE) }),
  z.strictObject({ mode: z.literal('decide_together') }),
]);

export const composeBody = z.strictObject({
  concept: text(FILL_IN),
  declaration: text(FILL_IN),
  callTime: valueOrTogether,
  deliveryDate: valueOrTogether,
  coverage: subjectSets,
  deliverables: text(FILL_IN),
  request: text(FILL_IN),
  fee: feeField,
});

export type ComposeBody = z.output<typeof composeBody>;

/**
 * The composer's rows as brief items (the first-scenario shape; not the D01
 * required-term catalogue). Layer placement of the keyed item is a demo
 * choice, as in the walkthrough.
 */
export function composedItems(body: ComposeBody, ids: { modelPartyId: string; pairId: string }): BriefItemSpec[] {
  const supplied = (field: { mode: 'supplied'; value: string } | { mode: 'decide_together' }) =>
    field.mode === 'supplied' ? { value: synthetic(field.value) } : { pending: 'decide_together' as const };
  const items: BriefItemSpec[] = [
    { layer: 'shared', content: synthetic(`What the shoot is: ${body.concept.trim()}`) },
    { layer: 'universal', subjectPartyId: ids.modelPartyId, shape: 'declaration', content: synthetic(`Declaration: ${body.declaration.trim()}`) },
    { layer: 'shared', content: synthetic('Call time and location.'), ...supplied(body.callTime) },
    { layer: 'shared', content: synthetic('Delivery date for the edited files.'), ...supplied(body.deliveryDate) },
    {
      layer: 'shared',
      subjectPartyId: ids.modelPartyId,
      shape: 'open_parameter',
      itemKey: 'coverage_level',
      content: synthetic('Coverage level for the theme (a synthetic example) — the Model sets it.'),
      ...(body.coverage.mode === 'set_now' ? { value: synthetic(body.coverage.value) } : { pending: 'subject' as const }),
    },
    { layer: 'shared', pairwiseAgreementId: ids.pairId, content: synthetic(`Deliverables: ${body.deliverables.trim()}`) },
    {
      layer: 'shared',
      pairwiseAgreementId: ids.pairId,
      subjectPartyId: ids.modelPartyId,
      shape: 'request',
      content: synthetic(`Request: ${body.request.trim()}`),
    },
  ];
  if (body.fee.mode !== 'none') {
    items.push({
      layer: 'money',
      pairwiseAgreementId: ids.pairId,
      itemKey: 'fee',
      content: synthetic('Fee for the shoot.'),
      ...(body.fee.mode === 'amount' ? { value: synthetic(body.fee.value) } : { pending: 'decide_together' as const }),
    });
  }
  return items;
}

const castOutput = z.strictObject({ projectId: z.uuid(), photographerPartyId: z.uuid(), modelPartyId: z.uuid() });
const anyOperatorMayCreate = { kind: 'protected' as const, load: async () => ({}), policy: () => true };

export function composeShootOperation(annotations: AnnotationStore) {
  return defineOperation({
    name: 'demo.shoots.compose',
    method: 'POST',
    path: '/demo/shoots',
    successStatus: 201,
    input: { body: composeBody },
    output: castOutput,
    access: anyOperatorMayCreate,
    run: async (input, { db, principal }) => {
      const self = principal as SyntheticPrincipal;
      const created = await guarded(() =>
        db.transaction(async (tx) => {
          const project = await insertProject(tx, { createdByPrincipalId: self.id });
          const photographer = await addProjectParty(tx, project.id);
          const model = await addProjectParty(tx, project.id);
          const pair = await createPairwiseAgreement(tx, project.id, [photographer.id, model.id]);
          const brief = await openLiveBrief(tx, project.id);
          for (const spec of composedItems(input.body, { modelPartyId: model.id, pairId: pair.id })) await addBriefItem(tx, brief.id, spec);
          return { projectId: project.id, photographerPartyId: photographer.id, modelPartyId: model.id, pairId: pair.id };
        }),
      );
      await annotations.setProject(created.projectId, {
        title: input.body.concept.trim(),
        kind: 'composed',
        parties: { [created.photographerPartyId]: 'Photographer', [created.modelPartyId]: 'Model' },
        agreements: {},
      });
      return { projectId: created.projectId, photographerPartyId: created.photographerPartyId, modelPartyId: created.modelPartyId };
    },
  });
}

/**
 * The scenario cards: the walkthrough draft, then a fixed script of S09
 * data-function calls run at click time. Deterministic; no new mechanism.
 */
export const SCENARIO_CARDS = {
  straightforward: 'Two-person straightforward shoot',
  unresolved: 'Unresolved two-person shoot',
  declined: 'Declined request',
} as const;
type ScenarioCard = keyof typeof SCENARIO_CARDS;

export function startScenarioCardOperation(annotations: AnnotationStore) {
  return defineOperation({
    name: 'demo.shoots.scenario',
    method: 'POST',
    path: '/demo/shoots/scenarios',
    successStatus: 201,
    input: { body: z.strictObject({ card: z.enum(Object.keys(SCENARIO_CARDS) as [ScenarioCard, ...ScenarioCard[]]) }) },
    output: castOutput,
    access: anyOperatorMayCreate,
    run: async (input, { db, principal }) => {
      const self = principal as SyntheticPrincipal;
      const card = input.body.card;
      const { projectId, draft } = await guarded(() =>
        db.transaction(async (tx) => {
          const project = await insertProject(tx, { createdByPrincipalId: self.id });
          const draft = await buildWalkthroughDraft(tx, project.id);
          if (card !== 'straightforward') {
            // Both on site, then shared. Pending items stay untouched.
            for (const party of [draft.photographerPartyId, draft.modelPartyId]) await setDraftPartyPresence(tx, draft.briefId, party, true);
            await shareLiveBrief(tx, draft.briefId);
          }
          // The model, as the request's subject, declines it: it is simply gone.
          if (card === 'declined') await declineBriefRequest(tx, draft.items.request, draft.modelPartyId);
          return { projectId: project.id, draft };
        }),
      );
      await annotations.setProject(projectId, walkthroughAnnotation(draft, SCENARIO_CARDS[card]));
      return { projectId, photographerPartyId: draft.photographerPartyId, modelPartyId: draft.modelPartyId };
    },
  });
}

export const createShootOperations = (annotations: AnnotationStore): readonly AnyOperation[] => [
  composeShootOperation(annotations),
  startScenarioCardOperation(annotations),
];
