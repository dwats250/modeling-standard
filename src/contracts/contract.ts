import { createHash } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { findBindingForParty } from '../accounts/binding.ts';
import {
  BriefActionRefusedError,
  BriefNotFoundError,
  findLiveBrief,
  lockBrief,
  type BriefItemKey,
  type BriefLayer,
  type BriefShape,
} from '../briefs/brief.ts';
import { briefFingerprint, readFingerprintSnapshot, type FingerprintSnapshot } from '../briefs/live.ts';
import { briefItem, briefTick, liveBrief } from '../briefs/tables.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { listPairwiseAgreements } from '../projects/agreement.ts';
import { contract, contractItem, contractParty, contractSignature } from './tables.ts';

/**
 * The final contract (slice S11; D02, D04, D10, D12; HC1, HC2).
 *
 * `finalizeBrief` turns a brief that S10 froze into the contract, in one
 * call that carries both parties' signature evidence: the contract is copied
 * verbatim from the frozen brief, the brief becomes final, and its items and
 * ticks are deleted (HC1). It is an operator/test-only act: the visible
 * signing act is not decided (D04), nor whether one person may sign before
 * the other, so nothing here stores one signature while the other is
 * awaited, and no participant route calls it.
 *
 * The database is the final authority (migrations/0029): a contract is
 * written only for a signing brief with its fingerprint, a party's account
 * must be its binding, the signature time and chain are the database's, the
 * brief becomes final only with a complete verbatim contract, and a contract
 * cannot commit without it. Runtime role: SELECT and INSERT only.
 *
 * Data functions only. No HTTP operation, principal, logging or network.
 */

export class ContractNotFoundError extends Error {
  constructor() {
    super('contract not found');
    this.name = 'ContractNotFoundError';
  }
}

/** Optional request evidence. Null until an HTTP surface supplies it. */
export interface SignatureRequestEvidence {
  /** A single host address. */
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/** One party's signature evidence: the party, its bound account and the fingerprint it binds. */
export interface SignatureEvidence {
  readonly partyId: string;
  readonly accountId: string;
  readonly fingerprint: string;
  readonly evidence?: SignatureRequestEvidence;
}

export interface ContractRecord {
  readonly id: string;
  readonly projectId: string;
  readonly briefId: string;
  readonly fingerprint: string;
}

export interface ContractPartyRecord {
  readonly partyId: string;
  readonly accountId: string;
  readonly onSite: boolean;
}

export interface ContractItemRecord {
  readonly itemId: string;
  readonly position: number;
  readonly layer: BriefLayer;
  readonly pairwiseAgreementId: string | null;
  readonly subjectPartyId: string | null;
  readonly shape: BriefShape | null;
  readonly itemKey: BriefItemKey | null;
  readonly content: string;
  readonly value: string | null;
  readonly approverPartyIds: readonly string[];
}

export interface ContractSignatureRecord {
  readonly sequence: number;
  readonly partyId: string;
  readonly accountId: string;
  readonly fingerprint: string;
  readonly signedAt: Date;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly prevHash: string;
  readonly recordHash: string;
}

/** The whole stored contract: for internal callers, tests and the operator's inspector. Never a party view. */
export interface FullContract {
  readonly contract: ContractRecord;
  readonly parties: readonly ContractPartyRecord[];
  /** In display order. */
  readonly items: readonly ContractItemRecord[];
  /** In chain order. */
  readonly signatures: readonly ContractSignatureRecord[];
  /** The project's pairs, with their two parties sorted. */
  readonly pairs: readonly { readonly id: string; readonly partyIds: readonly [string, string] }[];
}

const READ_COMMITTED = { isolationLevel: 'read committed' } as const;
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
// The database overwrites both hashes on insert (migrations/0029); the
// columns are NOT NULL, so the insert carries a placeholder.
const OVERWRITTEN = '0'.repeat(64);

// ---- Finalize ----

/**
 * Finalizes a frozen brief with both parties' signature evidence, in one
 * READ COMMITTED transaction under the per-brief advisory lock and a row
 * lock on the brief. Refused unless the brief is signing (`not_signing`;
 * `already_final` once final) in a project of exactly two parties and one
 * pair (`unsupported_topology`); the two signatures are by the project's two
 * parties (`not_a_party`), each through the account bound to that party
 * (`not_bound_account`, D12), each over the brief's fingerprint, which must
 * still equal the brief as it is now (`fingerprint_mismatch`).
 *
 * The signatures are chained by party id, not by the order given: nothing
 * records who signed first.
 */
export async function finalizeBrief(
  db: Executor,
  briefId: string,
  signatures: readonly [SignatureEvidence, SignatureEvidence],
): Promise<{ contractId: string; fingerprint: string }> {
  return db.transaction(async (tx) => {
    await lockBrief(tx, briefId);
    const [row] = await tx
      .select({ id: liveBrief.id, projectId: liveBrief.projectId, phase: liveBrief.phase, fingerprint: liveBrief.fingerprint })
      .from(liveBrief)
      .where(eq(liveBrief.id, briefId))
      .for('update');
    const brief = row ? await findLiveBrief(tx, row.id) : undefined;
    if (!row || !brief) throw new BriefNotFoundError();
    if (brief.phase === 'final') throw new BriefActionRefusedError('already_final');
    if (brief.phase !== 'signing' || row.fingerprint === null) throw new BriefActionRefusedError('not_signing');

    const snapshot = await readFingerprintSnapshot(tx, brief);
    if (snapshot.parties.length !== 2 || snapshot.pairs.length !== 1) throw new BriefActionRefusedError('unsupported_topology');

    const partyIds = new Set(snapshot.parties.map((p) => p.id));
    const signers = signatures.map((s) => ({ ...s, partyId: s.partyId.toLowerCase(), accountId: s.accountId.toLowerCase() }));
    if (new Set(signers.map((s) => s.partyId)).size !== 2 || signers.some((s) => !partyIds.has(s.partyId))) {
      throw new BriefActionRefusedError('not_a_party');
    }
    for (const signer of signers) {
      const binding = await findBindingForParty(tx, signer.partyId);
      if (!binding || binding.accountId !== signer.accountId) throw new BriefActionRefusedError('not_bound_account');
    }
    // Each signature binds the fingerprint it was given; the brief must still be that brief.
    if (signers.some((s) => s.fingerprint !== row.fingerprint) || briefFingerprint(snapshot) !== row.fingerprint) {
      throw new BriefActionRefusedError('fingerprint_mismatch');
    }

    const [written] = await tx
      .insert(contract)
      .values({ projectId: brief.projectId, briefId: brief.id, fingerprint: row.fingerprint })
      .returning({ id: contract.id });
    if (!written) throw new Error('insert returned no row');
    const contractId = written.id;
    const accountOf = new Map(signers.map((s) => [s.partyId, s.accountId]));
    await tx.insert(contractParty).values(
      snapshot.parties.map((p) => ({
        contractId,
        projectId: brief.projectId,
        partyId: p.id,
        accountId: accountOf.get(p.id)!,
        // Never null once shared (S09); the database refuses a mismatch.
        onSite: p.onSite === true,
      })),
    );
    const items = [...snapshot.items].sort((a, b) => a.position - b.position || byCodeUnits(a.id, b.id));
    if (items.length > 0) {
      await tx.insert(contractItem).values(
        items.map((item, index) => ({
          contractId,
          projectId: brief.projectId,
          itemId: item.id,
          position: index + 1,
          layer: item.layer,
          pairwiseAgreementId: item.pairwiseAgreementId,
          subjectPartyId: item.subjectPartyId,
          shape: item.shape,
          itemKey: item.itemKey,
          content: item.content!,
          value: item.value,
          approverPartyIds: [...item.approverIds].sort(byCodeUnits),
        })),
      );
    }
    // One row at a time, in chain order: each record's hash is the next one's prev_hash.
    const ordered = [...signers].sort((a, b) => byCodeUnits(a.partyId, b.partyId));
    for (const [index, signer] of ordered.entries()) {
      await tx.insert(contractSignature).values({
        contractId,
        projectId: brief.projectId,
        sequence: index + 1,
        partyId: signer.partyId,
        accountId: signer.accountId,
        fingerprint: row.fingerprint,
        ip: signer.evidence?.ip ?? null,
        userAgent: signer.evidence?.userAgent ?? null,
        prevHash: OVERWRITTEN,
        recordHash: OVERWRITTEN,
      });
    }

    // Final first: the database checks the contract against the brief's rows
    // as they are, then admits deleting them.
    await tx.update(liveBrief).set({ phase: 'final', fingerprint: null }).where(eq(liveBrief.id, brief.id));
    const itemIds = (await tx.select({ id: briefItem.id }).from(briefItem).where(eq(briefItem.briefId, brief.id))).map((i) => i.id);
    if (itemIds.length > 0) {
      await tx.delete(briefTick).where(inArray(briefTick.briefItemId, itemIds));
      await tx.delete(briefItem).where(eq(briefItem.briefId, brief.id));
    }
    return { contractId, fingerprint: row.fingerprint };
  }, READ_COMMITTED);
}

// ---- Read ----

export async function findContractForBrief(db: Executor, briefId: string): Promise<ContractRecord | undefined> {
  const [row] = await db.select().from(contract).where(eq(contract.briefId, briefId)).limit(1);
  return row;
}

/** The whole stored contract. Internal and operator use only; a party gets `getContractVisibleTo`. */
export async function getContract(db: Executor, contractId: string): Promise<FullContract> {
  const [head] = await db.select().from(contract).where(eq(contract.id, contractId)).limit(1);
  if (!head) throw new ContractNotFoundError();
  const parties = await db
    .select({ partyId: contractParty.partyId, accountId: contractParty.accountId, onSite: contractParty.onSite })
    .from(contractParty)
    .where(eq(contractParty.contractId, head.id))
    .orderBy(asc(contractParty.partyId));
  const items = await db.select().from(contractItem).where(eq(contractItem.contractId, head.id)).orderBy(asc(contractItem.position));
  const signatures = await db.select().from(contractSignature).where(eq(contractSignature.contractId, head.id)).orderBy(asc(contractSignature.sequence));
  const pairs = await listPairwiseAgreements(db, head.projectId);
  return {
    contract: head,
    parties,
    items: items.map((i) => ({
      itemId: i.itemId,
      position: i.position,
      layer: i.layer as BriefLayer,
      pairwiseAgreementId: i.pairwiseAgreementId,
      subjectPartyId: i.subjectPartyId,
      shape: i.shape as BriefShape | null,
      itemKey: i.itemKey as BriefItemKey | null,
      content: i.content,
      value: i.value,
      approverPartyIds: i.approverPartyIds,
    })),
    signatures: signatures.map((s) => ({
      sequence: s.sequence,
      partyId: s.partyId,
      accountId: s.accountId,
      fingerprint: s.fingerprint,
      signedAt: s.signedAt,
      ip: s.ip,
      userAgent: s.userAgent,
      prevHash: s.prevHash,
      recordHash: s.recordHash,
    })),
    pairs: pairs.map((p) => ({ id: p.id, partyIds: [...p.partyIds].sort(byCodeUnits) as [string, string] })),
  };
}

// ---- The per-party view (D10) ----

/** One clause as a party sees it: what was agreed and who approved it. */
export interface ContractClauseView {
  readonly layer: BriefLayer;
  /** The two parties a pair-scoped clause is between; null when project-wide. */
  readonly between: readonly [string, string] | null;
  readonly subjectPartyId: string | null;
  readonly shape: BriefShape | null;
  readonly itemKey: BriefItemKey | null;
  readonly content: string;
  readonly value: string | null;
  readonly approverPartyIds: readonly string[];
}

/**
 * A contract as one party may see it (D10: everything jointly agreed plus
 * one's own payment terms, nobody else's numbers). In display order. No
 * signature time, IP, user agent, hash, fingerprint, account or position:
 * those are evidence, not what was agreed (noise doctrine).
 */
export interface ContractView {
  readonly contractId: string;
  readonly projectId: string;
  readonly partyId: string;
  readonly parties: readonly { readonly id: string; readonly onSite: boolean }[];
  readonly clauses: readonly ContractClauseView[];
}

/** The party's view; a party not in the contract gets `ContractNotFoundError`, never an empty record. */
export async function getContractVisibleTo(db: Executor, contractId: string, partyId: string): Promise<ContractView> {
  const [head] = await db.select({ id: contract.id }).from(contract).where(eq(contract.id, contractId)).limit(1);
  if (!head) throw new ContractNotFoundError();
  return contractViewFor(await getContract(db, head.id), partyId);
}

/**
 * The D10 filter over a whole contract, as a pure function: every universal
 * and shared clause, and a money clause only when the viewer is in its pair.
 */
export function contractViewFor(full: FullContract, partyId: string): ContractView {
  const viewer = partyId.toLowerCase();
  if (!full.parties.some((p) => p.partyId.toLowerCase() === viewer)) throw new ContractNotFoundError();
  const pairOf = new Map(full.pairs.map((p) => [p.id, p.partyIds]));
  const clauses = full.items
    .map((item) => ({ item, between: item.pairwiseAgreementId === null ? null : (pairOf.get(item.pairwiseAgreementId) ?? null) }))
    .filter(({ item, between }) => item.layer !== 'money' || (between !== null && between.includes(viewer)))
    .map(({ item, between }) => ({
      layer: item.layer,
      between,
      subjectPartyId: item.subjectPartyId,
      shape: item.shape,
      itemKey: item.itemKey,
      content: item.content,
      value: item.value,
      approverPartyIds: [...item.approverPartyIds],
    }));
  return {
    contractId: full.contract.id,
    projectId: full.contract.projectId,
    partyId: viewer,
    parties: full.parties.map((p) => ({ id: p.partyId, onSite: p.onSite })),
    clauses,
  };
}

// ---- The signature chain ----

export const SIGNATURE_RECORD_DOMAIN = 'modeling-standard/contract-signature';
export const SIGNATURE_RECORD_VERSION = 1;

/**
 * Signature record v1: SHA-256, lowercase hex, of the UTF-8 JSON of
 * [domain, version, contractId, sequence, partyId, accountId, fingerprint,
 * signedAtMs, ip, userAgent, prevHash]. The database computes the same
 * digest on insert (migrations/0029).
 */
export function signatureRecordHash(contractId: string, signature: Omit<ContractSignatureRecord, 'recordHash'>): string {
  const payload = [
    SIGNATURE_RECORD_DOMAIN,
    SIGNATURE_RECORD_VERSION,
    contractId.toLowerCase(),
    signature.sequence,
    signature.partyId.toLowerCase(),
    signature.accountId.toLowerCase(),
    signature.fingerprint,
    signature.signedAt.getTime(),
    signature.ip,
    signature.userAgent,
    signature.prevHash,
  ];
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export interface ContractChainCheck {
  readonly valid: boolean;
  /** Empty when valid. Engineering diagnostics, not product text. */
  readonly problems: readonly string[];
}

/**
 * Recomputes a stored contract from its own rows, independently of the
 * database: the S10 fingerprint v1 over the contract's parties, the
 * project's pairs and its clauses (in display order, with their approvers)
 * must equal the stored fingerprint; there must be exactly one signature per
 * party, in chain order by party id, each over that fingerprint, by that
 * party's recorded account; each `prev_hash` must be the fingerprint or the
 * previous record's hash; and each `record_hash` must recompute.
 */
export function verifyContractRecord(full: FullContract): ContractChainCheck {
  const problems: string[] = [];
  const { contract: head } = full;
  const snapshot: FingerprintSnapshot = {
    briefId: head.briefId,
    projectId: head.projectId,
    parties: full.parties.map((p) => ({ id: p.partyId, onSite: p.onSite })),
    pairs: full.pairs,
    items: full.items.map((i) => ({
      id: i.itemId,
      position: i.position,
      layer: i.layer,
      pairwiseAgreementId: i.pairwiseAgreementId,
      subjectPartyId: i.subjectPartyId,
      shape: i.shape,
      itemKey: i.itemKey,
      content: i.content,
      value: i.value,
      approverIds: i.approverPartyIds,
    })),
  };
  if (briefFingerprint(snapshot) !== head.fingerprint) problems.push('the contract rows do not recompute the fingerprint');

  const order = full.parties.map((p) => p.partyId.toLowerCase()).sort(byCodeUnits);
  if (full.signatures.length !== order.length || order.length !== 2) problems.push('there must be exactly one signature per party, two in all');
  let previous = head.fingerprint;
  full.signatures.forEach((signature, index) => {
    const label = `signature ${index + 1}`;
    if (signature.sequence !== index + 1) problems.push(`${label}: sequence out of order`);
    if (signature.partyId.toLowerCase() !== order[index]) problems.push(`${label}: not in party-id order`);
    const party = full.parties.find((p) => p.partyId.toLowerCase() === signature.partyId.toLowerCase());
    if (!party || party.accountId.toLowerCase() !== signature.accountId.toLowerCase()) problems.push(`${label}: not the party's recorded account`);
    if (signature.fingerprint !== head.fingerprint) problems.push(`${label}: binds another fingerprint`);
    if (signature.prevHash !== previous) problems.push(`${label}: broken link`);
    if (signatureRecordHash(head.id, signature) !== signature.recordHash) problems.push(`${label}: record hash does not recompute`);
    previous = signature.recordHash;
  });
  return { valid: problems.length === 0, problems };
}

/** Reads the stored contract and verifies it (`verifyContractRecord`). */
export async function verifyContractChain(db: Executor, contractId: string): Promise<ContractChainCheck> {
  return verifyContractRecord(await getContract(db, contractId));
}
