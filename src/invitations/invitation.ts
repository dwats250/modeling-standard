import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { findAccount } from '../accounts/account.ts';
import { bindPartyToAccount, type PartyAccountBindingRecord } from '../accounts/binding.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { directInvitation } from './tables.ts';

/**
 * Direct-send invitations (slice S07; D03, D12).
 *
 * The link is the invitation. A direct invitation is a high-entropy bearer
 * credential for one existing project-local party. How the link travels
 * (email, a message, anything else) is not product state, and nothing about
 * the recipient is stored.
 *
 * The credential is 32 bytes from the operating system's CSPRNG, written as
 * unpadded base64url (43 characters). Only SHA-256 of those 32 bytes is
 * stored; the credential is returned once, from `createDirectInvitation`,
 * and never persisted or logged. It is not a password, so it is not
 * stretched.
 *
 * Resolving a credential says which party it reaches. It is not
 * authorization to read anything: D03 requires an account, and nothing here
 * returns project content. Claiming binds a sign-in account to the party
 * through S06; that binding is the only record of a claim. An invitation
 * establishes no identity (verification is separate, D11), is not
 * acceptance of any term, and grants no proxy authority (D12).
 *
 * Data functions only. No HTTP operation, no mail or SMS, no provider call,
 * and nothing here logs.
 */

/** Raw credential length in bytes. */
export const CREDENTIAL_BYTES = 32;
/** Unpadded base64url of 32 bytes. */
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class InvitationNotFoundError extends Error {
  constructor() {
    super('invitation not found');
    this.name = 'InvitationNotFoundError';
  }
}

export class AccountNotFoundError extends Error {
  constructor() {
    super('account not found');
    this.name = 'AccountNotFoundError';
  }
}

/** What an invitation reaches. Carries no credential or digest. */
export interface DirectInvitationRecord {
  readonly id: string;
  readonly projectId: string;
  readonly partyId: string;
  readonly createdAt: Date;
}

/** The creation result: the only place the raw credential ever appears. */
export interface CreatedDirectInvitation extends DirectInvitationRecord {
  readonly credential: string;
}

export interface DirectInvitationRequest {
  readonly projectId: string;
  readonly partyId: string;
}

export interface ClaimedDirectInvitation {
  readonly invitation: DirectInvitationRecord;
  readonly binding: PartyAccountBindingRecord;
}

const recordColumns = {
  id: directInvitation.id,
  projectId: directInvitation.projectId,
  partyId: directInvitation.partyId,
  createdAt: directInvitation.createdAt,
};

function digestOf(credentialBytes: Buffer): Buffer {
  return createHash('sha256').update(credentialBytes).digest();
}

/**
 * The credential's 32 bytes, or null if the text is not exactly the
 * canonical unpadded base64url of 32 bytes. Only the canonical form is
 * accepted, so each credential has exactly one textual spelling.
 */
function decodeCredential(credential: unknown): Buffer | null {
  if (typeof credential !== 'string' || !CREDENTIAL_PATTERN.test(credential)) return null;
  const decoded = Buffer.from(credential, 'base64url');
  if (decoded.length !== CREDENTIAL_BYTES || decoded.toString('base64url') !== credential) return null;
  return decoded;
}

/**
 * Creates a direct invitation for an existing party of the project, and
 * returns its raw credential once. The database rejects a party that is not
 * a party of the named project. Nothing limits how many invitations one
 * party may have.
 */
export async function createDirectInvitation(
  db: Executor,
  request: DirectInvitationRequest,
): Promise<CreatedDirectInvitation> {
  const credentialBytes = randomBytes(CREDENTIAL_BYTES);
  const [row] = await db
    .insert(directInvitation)
    .values({ projectId: request.projectId, partyId: request.partyId, credentialDigest: digestOf(credentialBytes) })
    .returning(recordColumns);
  if (!row) throw new Error('insert returned no row');
  return { ...row, credential: credentialBytes.toString('base64url') };
}

/**
 * The invitation a raw credential reaches, or undefined for an unknown or
 * malformed credential. Looks up by digest only. This is not authorization to
 * read the project.
 */
export async function resolveDirectInvitation(
  db: Executor,
  credential: string,
): Promise<DirectInvitationRecord | undefined> {
  const credentialBytes = decodeCredential(credential);
  if (!credentialBytes) return undefined;
  const [row] = await db
    .select(recordColumns)
    .from(directInvitation)
    .where(eq(directInvitation.credentialDigest, digestOf(credentialBytes)))
    .limit(1);
  return row;
}

/**
 * The invitation with this id, or undefined. For a caller that already
 * resolved the credential once (S12: a sign-in attempt records the
 * invitation's id, never its credential). Not authorization to read anything.
 */
export async function findDirectInvitation(db: Executor, id: string): Promise<DirectInvitationRecord | undefined> {
  const [row] = await db.select(recordColumns).from(directInvitation).where(eq(directInvitation.id, id)).limit(1);
  return row;
}

/**
 * Claims a direct invitation for a sign-in account, in one transaction:
 * resolves the credential, checks the account exists, and binds the account
 * to the invitation's party through S06.
 *
 * - Unknown or malformed credential: `InvitationNotFoundError`.
 * - Unknown account: `AccountNotFoundError`.
 * - The party already bound to this account: returns that binding
 *   (idempotent).
 * - The party already bound to another account: `PartyAlreadyBoundError`,
 *   and the existing binding is unchanged. Concurrent competing claims leave
 *   exactly one durable binding (S06's one-binding-per-party key).
 *
 * The binding is the only record of the claim; the invitation row is not
 * changed. Runs as READ COMMITTED.
 */
export async function claimDirectInvitation(
  db: Executor,
  credential: string,
  accountId: string,
): Promise<ClaimedDirectInvitation> {
  return db.transaction(
    async (tx) => {
      const invitation = await resolveDirectInvitation(tx, credential);
      if (!invitation) throw new InvitationNotFoundError();
      if (!(await findAccount(tx, accountId))) throw new AccountNotFoundError();
      const binding = await bindPartyToAccount(tx, {
        projectId: invitation.projectId,
        partyId: invitation.partyId,
        accountId,
      });
      return { invitation, binding };
    },
    { isolationLevel: 'read committed' },
  );
}
