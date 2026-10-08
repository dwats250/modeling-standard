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
 * stamped with the database clock, and permanent.
 *
 * Pairwise terms can be affirmed only by the agreement's two parties;
 * universal terms by a party of the project. The database enforces both,
 * and accepts affirmations only against a container's first presented
 * version until ruling 6's escalation rules exist (`migrations/0012`).
 *
 * Data functions only, with no HTTP route. A party is not yet bound to a
 * person (D03), so nothing here authenticates or authorizes anyone; any
 * future caller must establish that the person acting is the party (D12: no
 * proxies). Nothing here computes finality or completeness, decides who
 * must affirm, records a decline or withdrawal, or groups affirmations:
 * those are open (D02, D04).
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
