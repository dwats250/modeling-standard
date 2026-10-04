import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Executor } from '../infrastructure/database/client.ts';
import { syntheticEvidence } from './tables.ts';

/**
 * Stage 0 evidence-mechanics probe. Proves, on synthetic bytes, that stored
 * evidence can be written, read back exactly, verified against a digest, and
 * not altered or deleted with the runtime credential.
 *
 * Threat boundary (see docs/engineering/STAGE-0.md):
 *   - holds against normal application behaviour, application bugs, and a
 *     compromised runtime credential;
 *   - does NOT hold against a database administrator or the migration role;
 *   - is NOT a retention guarantee and NOT the future evidence mechanism.
 *
 * This module offers no update or delete function. The probe's tests show
 * that adding one would not help: the runtime role cannot execute it.
 */

export function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export interface StoredEvidence {
  readonly id: string;
  readonly sha256: Uint8Array;
}

export interface RetrievedEvidence {
  readonly id: string;
  readonly payload: Uint8Array;
  readonly sha256: Uint8Array;
  /** True when the stored digest matches a digest recomputed from the stored bytes. */
  readonly verified: boolean;
}

export async function writeSyntheticEvidence(db: Executor, payload: Uint8Array): Promise<StoredEvidence> {
  const digest = sha256(payload);
  const [row] = await db
    .insert(syntheticEvidence)
    .values({ payload, sha256: digest })
    .returning({ id: syntheticEvidence.id, sha256: syntheticEvidence.sha256 });
  if (!row) throw new Error('insert returned no row');
  return row;
}

export function verifyEvidence(payload: Uint8Array, storedDigest: Uint8Array): boolean {
  return equalBytes(sha256(payload), storedDigest);
}

export async function readSyntheticEvidence(db: Executor, id: string): Promise<RetrievedEvidence | undefined> {
  const [row] = await db.select().from(syntheticEvidence).where(eq(syntheticEvidence.id, id)).limit(1);
  if (!row) return undefined;
  return { id: row.id, payload: row.payload, sha256: row.sha256, verified: verifyEvidence(row.payload, row.sha256) };
}
