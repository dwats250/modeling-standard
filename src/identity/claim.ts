import { sql } from 'drizzle-orm';
import { bindPartyToAccount, listBindingsForAccount } from '../accounts/binding.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import type { DirectInvitationRecord } from '../invitations/invitation.ts';

/**
 * Accepting an invitation as a signed-in account (slice S12).
 *
 * Binds the account to the invitation's party (S06, S07), with one refusal
 * S07's data function does not make: an account that is already a different
 * party of the same shoot is refused. Whether one account may ever be two
 * parties of one shoot is not decided (S06 records that no database rule was
 * authorized; D02 puts dual roles inside one agreement), and the participant
 * routes cannot serve such an account (they fail closed). So the claim fails
 * closed too, rather than creating a binding nobody can use — for example
 * when a browser signed in as one person opens another person's link.
 *
 * Application-level only, serialized per account and project by an advisory
 * lock; nothing in the database changes. Call inside a READ COMMITTED
 * transaction.
 */

export class AccountAlreadyInProjectError extends Error {
  constructor() {
    super('this account is already a different party of this project');
    this.name = 'AccountAlreadyInProjectError';
  }
}

export async function claimInvitationForAccount(tx: Executor, invitation: DirectInvitationRecord, accountId: string): Promise<void> {
  const key = `claim:${accountId.toLowerCase()}:${invitation.projectId.toLowerCase()}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  const elsewhere = (await listBindingsForAccount(tx, accountId)).filter((b) => b.projectId === invitation.projectId && b.partyId !== invitation.partyId);
  if (elsewhere.length > 0) throw new AccountAlreadyInProjectError();
  // Throws PartyAlreadyBoundError if the party is another account's.
  await bindPartyToAccount(tx, { projectId: invitation.projectId, partyId: invitation.partyId, accountId });
}
