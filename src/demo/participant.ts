import { z } from 'zod';
import type { Principal } from '../authorization/access.ts';
import { groupCheckBriefItems } from '../briefs/live.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { ITEM_ACTS, act, groupCheckBody, loadParticipant, participantView, participantViewDto, type ParticipantTarget } from '../participants/view.ts';
import { creatorOnly } from '../projects/project.ts';

/**
 * The demo operator's simulation of each person's screen: one live brief
 * seen as one party, with only what that party may see and the acts that
 * party may take (`src/participants/view.ts`, shared with the signed-in
 * routes).
 *
 * The simulated party is a URL parameter, never a credential. Every request
 * is the demo operator (who must have created the project). Signed-in
 * participants use their own routes (`src/participants/operations.ts`), where
 * the party comes from the session; a signed-in account is refused here.
 */

const uuid = z.uuid();
const asParams = z.strictObject({ projectId: uuid, partyId: uuid });
const itemParams = z.strictObject({ projectId: uuid, partyId: uuid, itemId: uuid });
const policy = (principal: Principal, target: ParticipantTarget) => creatorOnly(principal, target.project);

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

function itemActOperation(verb: keyof typeof ITEM_ACTS) {
  const { perform, body } = ITEM_ACTS[verb];
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

export const participantOperations: readonly AnyOperation[] = [
  readParticipantViewOperation,
  itemActOperation('tick'),
  itemActOperation('untick'),
  itemActOperation('decline'),
  itemActOperation('parameter'),
  defineOperation({
    name: 'demo.shoots.as.group-check',
    method: 'POST',
    path: '/demo/shoots/:projectId/as/:partyId/group-check',
    input: { params: asParams, body: groupCheckBody },
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
