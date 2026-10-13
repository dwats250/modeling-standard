import { asc, eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import {
  agreementAffirmation,
  agreementVersionTerm,
  pairwiseAgreement,
  universalAffirmation,
  universalVersionTerm,
} from './tables.ts';

/**
 * Per-term affirmation evidence (slice S05).
 *
 * Records that one party affirmed one presented term: one row per party per
 * term (D04: every term is individually affirmable and is the unit of the
 * record), bound to the frozen wording of a presented version (DOCTRINE:51),
 * stamped with the database clock, and append-only for the runtime role.
 *
 * Pairwise rows can name only the agreement's two parties; universal rows
 * any party of the project (which says nothing about who is on site). The
 * database enforces both, and accepts affirmations only while a container
 * has a single presented version and never in the transaction that
 * presented it (`migrations/0012`): supersession (D02 d, g, h), escalation
 * (ruling 6) and signing timing (D04) are open. It does not detect
 * escalation in general.
 *
 * These rows are not complete signature evidence: DOCTRINE:52 also requires
 * the credential used to agree, which awaits D03. The absence of a row means
 * nothing: not "no", not "not yet", not "not shown".
 *
 * Data functions only, with no HTTP route, and no runtime path may call them
 * until D03 binds parties to people: nothing here authenticates anyone, and
 * D12 (no proxies) must be established by the caller. Nothing here computes
 * finality or completeness, decides who must affirm, records a decline or
 * withdrawal, or groups affirmations: those are open (D02, D04). Call with
 * the database handle or inside a READ COMMITTED transaction.
 */

export class PresentedTermNotFoundError extends Error {
  constructor() {
    super('presented term not found');
    this.name = 'PresentedTermNotFoundError';
  }
}

export interface AffirmationRecord {
  readonly id: string;
  readonly versionId: string;
  readonly presentedTermId: string;
  readonly partyId: string;
  readonly affirmedAt: Date;
}

// ---- Pairwise ----

export async function affirmAgreementTerm(
  db: Executor,
  presentedTermId: string,
  partyId: string,
): Promise<AffirmationRecord> {
  const [target] = await db
    .select({
      pairwiseAgreementId: agreementVersionTerm.pairwiseAgreementId,
      agreementVersionId: agreementVersionTerm.agreementVersionId,
      partyOneId: pairwiseAgreement.partyOneId,
      partyTwoId: pairwiseAgreement.partyTwoId,
    })
    .from(agreementVersionTerm)
    .innerJoin(pairwiseAgreement, eq(pairwiseAgreement.id, agreementVersionTerm.pairwiseAgreementId))
    .where(eq(agreementVersionTerm.id, presentedTermId))
    .limit(1);
  if (!target) throw new PresentedTermNotFoundError();

  // Columns are mapped explicitly. The database rejects a party outside the
  // pair and a version other than the first.
  const [row] = await db
    .insert(agreementAffirmation)
    .values({
      pairwiseAgreementId: target.pairwiseAgreementId,
      partyOneId: target.partyOneId,
      partyTwoId: target.partyTwoId,
      agreementVersionId: target.agreementVersionId,
      agreementVersionTermId: presentedTermId,
      partyId,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return {
    id: row.id,
    versionId: row.agreementVersionId,
    presentedTermId: row.agreementVersionTermId,
    partyId: row.partyId,
    affirmedAt: row.affirmedAt,
  };
}

/** A pairwise version's affirmations, in the order they were recorded. */
export async function listAgreementAffirmations(db: Executor, agreementVersionId: string): Promise<AffirmationRecord[]> {
  const rows = await db
    .select()
    .from(agreementAffirmation)
    .where(eq(agreementAffirmation.agreementVersionId, agreementVersionId))
    .orderBy(asc(agreementAffirmation.affirmedAt), asc(agreementAffirmation.id));
  return rows.map((row) => ({
    id: row.id,
    versionId: row.agreementVersionId,
    presentedTermId: row.agreementVersionTermId,
    partyId: row.partyId,
    affirmedAt: row.affirmedAt,
  }));
}

// ---- Universal ----

export async function affirmUniversalTerm(
  db: Executor,
  presentedTermId: string,
  partyId: string,
): Promise<AffirmationRecord> {
  const [target] = await db
    .select({ projectId: universalVersionTerm.projectId, universalVersionId: universalVersionTerm.universalVersionId })
    .from(universalVersionTerm)
    .where(eq(universalVersionTerm.id, presentedTermId))
    .limit(1);
  if (!target) throw new PresentedTermNotFoundError();

  // The database rejects a party of another project and a version other
  // than the first.
  const [row] = await db
    .insert(universalAffirmation)
    .values({
      projectId: target.projectId,
      universalVersionId: target.universalVersionId,
      universalVersionTermId: presentedTermId,
      partyId,
    })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return {
    id: row.id,
    versionId: row.universalVersionId,
    presentedTermId: row.universalVersionTermId,
    partyId: row.partyId,
    affirmedAt: row.affirmedAt,
  };
}

/** A universal version's affirmations, in the order they were recorded. */
export async function listUniversalAffirmations(db: Executor, universalVersionId: string): Promise<AffirmationRecord[]> {
  const rows = await db
    .select()
    .from(universalAffirmation)
    .where(eq(universalAffirmation.universalVersionId, universalVersionId))
    .orderBy(asc(universalAffirmation.affirmedAt), asc(universalAffirmation.id));
  return rows.map((row) => ({
    id: row.id,
    versionId: row.universalVersionId,
    presentedTermId: row.universalVersionTermId,
    partyId: row.partyId,
    affirmedAt: row.affirmedAt,
  }));
}
