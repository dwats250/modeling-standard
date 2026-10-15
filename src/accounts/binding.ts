import { eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { partyAccountBinding } from './tables.ts';

/**
 * Party-to-account bindings (slice S06; D03, D12).
 *
 * Binds an existing project-local party to a sign-in account. Data functions
 * only, with no HTTP route: how someone reaches a party (the invitation link,
 * D03) is a later slice and will consume these.
 *
 * A binding is append-only evidence. A party is bound at most once; binding
 * it again to the same account returns the existing binding, and binding it
 * to a different account is refused. The database's unique key on the party
 * is the final authority, so concurrent competing bindings leave exactly one
 * durable winner.
 *
 * A binding is not verification (D11), not acceptance of any term, not a
 * role, and gives the account no authority over any other party (D12: no
 * proxies). Nothing here limits how many parties one account may be bound
 * to; that is not a decided invariant.
 */

export interface PartyAccountBindingRecord {
  readonly id: string;
  readonly projectId: string;
  readonly partyId: string;
  readonly accountId: string;
  readonly boundAt: Date;
}

export class PartyAlreadyBoundError extends Error {
  constructor() {
    super('party is already bound to a different account');
    this.name = 'PartyAlreadyBoundError';
  }
}

type BindingRow = typeof partyAccountBinding.$inferSelect;

function toRecord(row: BindingRow): PartyAccountBindingRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    partyId: row.partyId,
    accountId: row.accountId,
    boundAt: row.boundAt,
  };
}

export interface PartyAccountBindingRequest {
  readonly projectId: string;
  readonly partyId: string;
  readonly accountId: string;
}

/**
 * Binds the party to the account, or returns the existing identical binding.
 *
 * Throws `PartyAlreadyBoundError` if the party is already bound to another
 * account (or recorded under another project, which containment makes
 * impossible). An unknown account, or a party that is not a party of the
 * named project, is rejected by the database's foreign keys.
 *
 * Call with the database handle or inside a READ COMMITTED transaction.
 */
export async function bindPartyToAccount(
  db: Executor,
  request: PartyAccountBindingRequest,
): Promise<PartyAccountBindingRecord> {
  const [inserted] = await db
    .insert(partyAccountBinding)
    .values({ projectId: request.projectId, partyId: request.partyId, accountId: request.accountId })
    .onConflictDoNothing({ target: partyAccountBinding.partyId })
    .returning();
  if (inserted) return toRecord(inserted);
  const existing = await findBindingForParty(db, request.partyId);
  if (!existing) throw new Error('party binding exists but is not visible to this transaction');
  if (existing.accountId !== request.accountId || existing.projectId !== request.projectId) {
    throw new PartyAlreadyBoundError();
  }
  return existing;
}

/** The binding for this party, if it has been bound. */
export async function findBindingForParty(db: Executor, partyId: string): Promise<PartyAccountBindingRecord | undefined> {
  const [row] = await db
    .select()
    .from(partyAccountBinding)
    .where(eq(partyAccountBinding.partyId, partyId))
    .limit(1);
  return row ? toRecord(row) : undefined;
}

/**
 * Every party this account is bound to, across projects, in a stable (id)
 * order that carries no meaning. A future authorization boundary needs this
 * to know which parties a signed-in account may act as.
 */
export async function listBindingsForAccount(db: Executor, accountId: string): Promise<PartyAccountBindingRecord[]> {
  const rows = await db
    .select()
    .from(partyAccountBinding)
    .where(eq(partyAccountBinding.accountId, accountId))
    .orderBy(partyAccountBinding.id);
  return rows.map(toRecord);
}
