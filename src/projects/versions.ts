import { asc, eq, sql } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { agreementVersion, agreementVersionTerm, universalVersion, universalVersionTerm } from './tables.ts';

/**
 * Presented versions (slice S04).
 *
 * A presented version freezes exactly which terms were put in front of
 * people, in which order, with which text (DOCTRINE:46: clause text is
 * frozen as presented). A pairwise version is presented within one pairwise
 * agreement; a universal version presents a project's safety and consent
 * terms. The caller chooses which of the container's terms to present and
 * in what order; dropping a term and resending (D02) is a new version that
 * leaves it out. Earlier versions are untouched by later ones.
 *
 * Data functions only, with no HTTP route. No actor is recorded: who
 * presents, and to whom, are undecided (D03, D10, D12). Nothing here
 * validates completeness, decides that a later version supersedes an earlier
 * one, or computes finality: those are open (D02, D04).
 *
 * The database seals each version on creation (`migrations/0010`): it must
 * commit holding exactly its terms, each a faithful copy of a visible source
 * term, numbered as its container's next version, stamped with the database
 * clock time the row was written, and the runtime role cannot change it
 * afterwards. "Presented" here means frozen for presentation: no recipient,
 * viewing or delivery is recorded.
 *
 * Call these with the database handle or inside a READ COMMITTED
 * transaction. Inside an outer REPEATABLE READ or SERIALIZABLE transaction a
 * concurrent presentation to the same container fails its numbering check
 * instead of queueing; inside any outer transaction the sealing checks run at
 * the outer commit.
 */

export class TermNotInContainerError extends Error {
  constructor() {
    super('every presented term must be an existing term of the same agreement or project');
    this.name = 'TermNotInContainerError';
  }
}

export interface PresentedTerm {
  readonly id: string;
  /** The term this is a frozen copy of. */
  readonly sourceTermId: string;
  readonly position: number;
  readonly content: string;
}

export interface AgreementVersionRecord {
  readonly id: string;
  readonly pairwiseAgreementId: string;
  readonly sequence: number;
  readonly presentedAt: Date;
  readonly terms: readonly PresentedTerm[];
}

export interface UniversalVersionRecord {
  readonly id: string;
  readonly projectId: string;
  readonly sequence: number;
  readonly presentedAt: Date;
  readonly terms: readonly PresentedTerm[];
}

/**
 * Queues presentations to one container. The same key is taken by the
 * database's numbering trigger (`migrations/0010`); UUIDs are lowercased to
 * match its `uuid::text` form.
 */
async function lockVersions(tx: Executor, containerId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`version-container:${containerId.toLowerCase()}`}, 0))`,
  );
}

// ---- Pairwise ----

export async function presentAgreementVersion(
  db: Executor,
  pairwiseAgreementId: string,
  termIds: readonly string[],
): Promise<AgreementVersionRecord> {
  const versionId = await db.transaction(async (tx) => {
    await lockVersions(tx, pairwiseAgreementId);
    const [version] = await tx
      .insert(agreementVersion)
      .values({
        pairwiseAgreementId,
        sequence: sql`(select coalesce(max(${agreementVersion.sequence}), 0) + 1 from ${agreementVersion} where ${agreementVersion.pairwiseAgreementId} = ${pairwiseAgreementId})`,
        termCount: termIds.length,
      })
      .returning({ id: agreementVersion.id });
    if (!version) throw new Error('insert returned no row');
    // Copies each chosen term of this agreement, in the order given. A term
    // of another agreement, or one that does not exist, matches nothing.
    const copied = await tx.execute(sql`
      insert into agreement_version_term
        (pairwise_agreement_id, agreement_version_id, agreement_term_id, position, content)
      select t.pairwise_agreement_id, ${version.id}, t.id, chosen.ord, t.content
      from jsonb_array_elements_text(${JSON.stringify(termIds)}::jsonb) with ordinality as chosen(term_id, ord)
      join agreement_term t on t.id = chosen.term_id::uuid and t.pairwise_agreement_id = ${pairwiseAgreementId}
    `);
    if (copied.rowCount !== termIds.length) throw new TermNotInContainerError();
    return version.id;
  });
  const created = await findAgreementVersion(db, versionId);
  if (!created) throw new Error('presented version not found after insert');
  return created;
}

export async function findAgreementVersion(db: Executor, id: string): Promise<AgreementVersionRecord | undefined> {
  const [version] = await db.select().from(agreementVersion).where(eq(agreementVersion.id, id)).limit(1);
  if (!version) return undefined;
  const terms = await db
    .select()
    .from(agreementVersionTerm)
    .where(eq(agreementVersionTerm.agreementVersionId, id))
    .orderBy(asc(agreementVersionTerm.position));
  return {
    id: version.id,
    pairwiseAgreementId: version.pairwiseAgreementId,
    sequence: version.sequence,
    presentedAt: version.presentedAt,
    terms: terms.map((t) => ({ id: t.id, sourceTermId: t.agreementTermId, position: t.position, content: t.content })),
  };
}

/** The ids and sequence numbers of an agreement's presented versions, oldest first. */
export async function listAgreementVersions(
  db: Executor,
  pairwiseAgreementId: string,
): Promise<{ id: string; sequence: number }[]> {
  return db
    .select({ id: agreementVersion.id, sequence: agreementVersion.sequence })
    .from(agreementVersion)
    .where(eq(agreementVersion.pairwiseAgreementId, pairwiseAgreementId))
    .orderBy(asc(agreementVersion.sequence));
}

// ---- Universal ----

export async function presentUniversalVersion(
  db: Executor,
  projectId: string,
  termIds: readonly string[],
): Promise<UniversalVersionRecord> {
  const versionId = await db.transaction(async (tx) => {
    await lockVersions(tx, projectId);
    const [version] = await tx
      .insert(universalVersion)
      .values({
        projectId,
        sequence: sql`(select coalesce(max(${universalVersion.sequence}), 0) + 1 from ${universalVersion} where ${universalVersion.projectId} = ${projectId})`,
        termCount: termIds.length,
      })
      .returning({ id: universalVersion.id });
    if (!version) throw new Error('insert returned no row');
    const copied = await tx.execute(sql`
      insert into universal_version_term
        (project_id, universal_version_id, universal_term_id, position, content)
      select t.project_id, ${version.id}, t.id, chosen.ord, t.content
      from jsonb_array_elements_text(${JSON.stringify(termIds)}::jsonb) with ordinality as chosen(term_id, ord)
      join universal_term t on t.id = chosen.term_id::uuid and t.project_id = ${projectId}
    `);
    if (copied.rowCount !== termIds.length) throw new TermNotInContainerError();
    return version.id;
  });
  const created = await findUniversalVersion(db, versionId);
  if (!created) throw new Error('presented version not found after insert');
  return created;
}

export async function findUniversalVersion(db: Executor, id: string): Promise<UniversalVersionRecord | undefined> {
  const [version] = await db.select().from(universalVersion).where(eq(universalVersion.id, id)).limit(1);
  if (!version) return undefined;
  const terms = await db
    .select()
    .from(universalVersionTerm)
    .where(eq(universalVersionTerm.universalVersionId, id))
    .orderBy(asc(universalVersionTerm.position));
  return {
    id: version.id,
    projectId: version.projectId,
    sequence: version.sequence,
    presentedAt: version.presentedAt,
    terms: terms.map((t) => ({ id: t.id, sourceTermId: t.universalTermId, position: t.position, content: t.content })),
  };
}

/** The ids and sequence numbers of a project's presented universal versions, oldest first. */
export async function listUniversalVersions(db: Executor, projectId: string): Promise<{ id: string; sequence: number }[]> {
  return db
    .select({ id: universalVersion.id, sequence: universalVersion.sequence })
    .from(universalVersion)
    .where(eq(universalVersion.projectId, projectId))
    .orderBy(asc(universalVersion.sequence));
}
