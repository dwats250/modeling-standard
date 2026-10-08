import { asc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { agreementTerm, universalTerm } from './tables.ts';

/**
 * Term units (slice S03).
 *
 * Universal terms are safety and consent terms for everyone on site, held on
 * the project. Pairwise terms are private commercial and craft terms, held on
 * one pairwise agreement (D02 structure ruling, reconciliation ruling 11).
 * Every term is its own row (D04).
 *
 * Data functions only, with no HTTP route. They record no actor: who may
 * write or see a term is undecided (D03, D10, D12). Term text is opaque, and
 * nothing classifies a term as required, body or money: what makes a term
 * required, and who classifies body and money terms, are open (D04). Terms
 * are append-only here; nothing presents, affirms or finalizes them.
 *
 * Position is storage order within one container, assigned after the current
 * last position. It is not the presentation order of ruling 4, which is
 * undecided across the two layers. Additions to the same container are
 * serialized with a transaction-scoped advisory lock on the container id, so
 * concurrent additions get distinct positions instead of one failing.
 */

export interface UniversalTermRecord {
  readonly id: string;
  readonly projectId: string;
  readonly position: number;
  readonly content: string;
}

export interface AgreementTermRecord {
  readonly id: string;
  readonly pairwiseAgreementId: string;
  readonly position: number;
  readonly content: string;
}

/** Serializes position assignment for one container until the transaction ends. */
async function lockContainer(tx: Executor, containerId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`term-container:${containerId}`}, 0))`);
}

export async function addUniversalTerm(db: Executor, projectId: string, content: string): Promise<UniversalTermRecord> {
  return db.transaction(async (tx) => {
    await lockContainer(tx, projectId);
    const [row] = await tx
      .insert(universalTerm)
      .values({
        projectId,
        position: sql`(select coalesce(max(${universalTerm.position}), 0) + 1 from ${universalTerm} where ${universalTerm.projectId} = ${projectId})`,
        content,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  });
}

export async function listUniversalTerms(db: Executor, projectId: string): Promise<UniversalTermRecord[]> {
  return db
    .select()
    .from(universalTerm)
    .where(eq(universalTerm.projectId, projectId))
    .orderBy(asc(universalTerm.position));
}

export async function addAgreementTerm(
  db: Executor,
  pairwiseAgreementId: string,
  content: string,
): Promise<AgreementTermRecord> {
  return db.transaction(async (tx) => {
    await lockContainer(tx, pairwiseAgreementId);
    const [row] = await tx
      .insert(agreementTerm)
      .values({
        pairwiseAgreementId,
        position: sql`(select coalesce(max(${agreementTerm.position}), 0) + 1 from ${agreementTerm} where ${agreementTerm.pairwiseAgreementId} = ${pairwiseAgreementId})`,
        content,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  });
}

export async function listAgreementTerms(db: Executor, pairwiseAgreementId: string): Promise<AgreementTermRecord[]> {
  return db
    .select()
    .from(agreementTerm)
    .where(eq(agreementTerm.pairwiseAgreementId, pairwiseAgreementId))
    .orderBy(asc(agreementTerm.position));
}
