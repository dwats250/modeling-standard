import { z } from 'zod';
import { listBindingsForAccount } from '../accounts/binding.ts';
import type { Policy, Principal } from '../authorization/access.ts';
import { groupCheckBriefItems } from '../briefs/live.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { ITEM_ACTS, act, groupCheckBody, loadParticipant, participantView, participantViewDto, type ParticipantTarget } from './view.ts';

/**
 * The signed-in participant's routes (slice S12; D03, D10, D12).
 *
 * The party is never in the address or the body: it is the one party the
 * signed-in account is bound to in this project (S06 binding, made by
 * claiming an invitation, S07). No proxies (D12): an account acts only as
 * its own party. A synthetic principal, an account with no binding in the
 * project, an account with more than one (not a decided case; it fails
 * closed), a project whose brief is not live, and an item this party cannot
 * see are all the generic 404, byte-identical to a nonexistent id.
 *
 * There is no route to compose, invite, share, set presence or settle a
 * decide-together value: who does those is not ruled for participants.
 */

interface OwnPartyTarget extends ParticipantTarget {
  readonly accountId: string;
}

async function loadOwnParty(db: Executor, principal: Principal, projectId: string, itemIds: readonly string[] = []): Promise<OwnPartyTarget | undefined> {
  if (principal.kind !== 'account') return undefined;
  const project = projectId.toLowerCase();
  const bindings = (await listBindingsForAccount(db, principal.id)).filter((b) => b.projectId === project);
  if (bindings.length !== 1) return undefined;
  const target = await loadParticipant(db, project, bindings[0]!.partyId, itemIds);
  return target ? { ...target, accountId: principal.id } : undefined;
}

/** Defence in depth: the loaded party is this account's own. */
const ownPartyOnly: Policy<OwnPartyTarget> = (principal, target) => principal.kind === 'account' && target.accountId === principal.id;

const uuid = z.uuid();
const projectParams = z.strictObject({ projectId: uuid });
const itemParams = z.strictObject({ projectId: uuid, itemId: uuid });

const readOwnBriefOperation = defineOperation({
  name: 'participant.read',
  method: 'GET',
  path: '/shoots/:projectId',
  input: { params: projectParams },
  output: participantViewDto,
  access: {
    kind: 'protected',
    load: (input, db, principal) => loadOwnParty(db, principal, input.params.projectId),
    policy: ownPartyOnly,
  },
  run: async (_input, { db, target }) => participantView(db, target),
});

function itemActOperation(verb: keyof typeof ITEM_ACTS) {
  const { perform, body } = ITEM_ACTS[verb];
  return defineOperation({
    name: `participant.${verb}`,
    method: 'POST',
    path: `/shoots/:projectId/items/:itemId/${verb}`,
    input: { params: itemParams, body },
    output: participantViewDto,
    access: {
      kind: 'protected',
      load: (input, db, principal) => loadOwnParty(db, principal, input.params.projectId, [input.params.itemId]),
      policy: ownPartyOnly,
    },
    run: async (input, { db, target }) => {
      await act(() => perform(db, input.params.itemId, target.partyId, input.body as { value?: string }));
      return participantView(db, target);
    },
  });
}

const groupCheckOperation = defineOperation({
  name: 'participant.group-check',
  method: 'POST',
  path: '/shoots/:projectId/group-check',
  input: { params: projectParams, body: groupCheckBody },
  output: participantViewDto,
  access: {
    kind: 'protected',
    load: (input, db, principal) => loadOwnParty(db, principal, input.params.projectId, input.body.itemIds),
    policy: ownPartyOnly,
  },
  run: async (input, { db, target }) => {
    await act(() => groupCheckBriefItems(db, target.brief.id, target.partyId, input.body.itemIds));
    return participantView(db, target);
  },
});

export const participantOperations: readonly AnyOperation[] = [
  readOwnBriefOperation,
  itemActOperation('tick'),
  itemActOperation('untick'),
  itemActOperation('decline'),
  itemActOperation('parameter'),
  groupCheckOperation,
];
