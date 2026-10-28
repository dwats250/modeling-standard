import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Policy, Principal } from '../authorization/access.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { getContractVisibleTo } from '../contracts/contract.ts';
import { contract, contractParty } from '../contracts/tables.ts';

/**
 * Read-only access to the current account's D10-filtered view of its own
 * final record. Registered only by the local synthetic demo. The underlying
 * finalization is operator/test-only; this view is not participant signing
 * or real-use authorization.
 */

interface OwnFinalRecordTarget {
  readonly accountId: string;
  readonly contractId: string;
  readonly partyId: string;
}

async function loadOwnFinalRecord(input: { readonly params: { readonly projectId: string } }, db: Executor, principal: Principal): Promise<OwnFinalRecordTarget | undefined> {
  if (principal.kind !== 'account') return undefined;
  const [row] = await db
    .select({ accountId: contractParty.accountId, contractId: contract.id, partyId: contractParty.partyId })
    .from(contractParty)
    .innerJoin(contract, eq(contractParty.contractId, contract.id))
    .where(and(eq(contract.projectId, input.params.projectId.toLowerCase()), eq(contractParty.accountId, principal.id)))
    .limit(1);
  return row;
}

const ownAccountOnly: Policy<OwnFinalRecordTarget> = (principal, target) =>
  principal.kind === 'account' && target.accountId === principal.id;

const uuid = z.uuid();
const contractViewDto = z.strictObject({
  contractId: uuid,
  projectId: uuid,
  partyId: uuid,
  parties: z.array(z.strictObject({ id: uuid, onSite: z.boolean() })),
  clauses: z.array(z.strictObject({
    layer: z.enum(['universal', 'shared', 'money']),
    between: z.tuple([uuid, uuid]).nullable(),
    subjectPartyId: uuid.nullable(),
    shape: z.enum(['declaration', 'request', 'open_parameter']).nullable(),
    itemKey: z.enum(['fee', 'no_means_no', 'coverage_level', 'physical_contact', 'stop_rule']).nullable(),
    content: z.string(),
    value: z.string().nullable(),
    approverPartyIds: z.array(uuid),
  })),
});

export const readOwnFinalRecordOperation = defineOperation({
  name: 'participant.final-record.read',
  method: 'GET',
  path: '/shoots/:projectId/final-record',
  input: { params: z.strictObject({ projectId: uuid }) },
  output: z.strictObject({ synthetic: z.literal(true), record: contractViewDto }),
  access: {
    kind: 'protected',
    load: loadOwnFinalRecord,
    policy: ownAccountOnly,
  },
  run: async (_input, { db, target }) => ({
    synthetic: true,
    record: await getContractVisibleTo(db, target.contractId, target.partyId),
  }),
});

export const participantFinalRecordOperations: readonly AnyOperation[] = [readOwnFinalRecordOperation];
