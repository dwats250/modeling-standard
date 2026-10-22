import { AppError } from '../app/errors.ts';
import { BriefActionRefusedError } from '../briefs/brief.ts';

/**
 * Refusals from the brief data functions and the database's own guards (S08,
 * S09), as stable 409 codes. Shared by the participant routes (S12) and the
 * demo's simulator. No rule is decided here; this only names the refusal.
 * Error bodies carry the code and nothing else.
 */

/** Database refusals a brief act can meet, by constraint, as stable codes. */
const CONSTRAINT_CODES: Readonly<Record<string, string>> = {
  live_brief_share_requires_wording: 'wording_not_materialized',
  live_brief_share_requires_presence: 'presence_missing',
  brief_tick_requires_approver: 'not_an_approver',
  brief_tick_requires_settled: 'still_pending',
  brief_tick_requires_live: 'not_live',
  brief_item_live_rigid: 'fixed_once_shared',
  brief_item_live_no_insert: 'fixed_once_shared',
  brief_item_live_no_delete: 'fixed_once_shared',
  brief_item_live_universal_kept: 'universal_kept',
  brief_party_presence_live_fixed: 'not_draft',
  // S10: a brief being signed is fixed (the demo never freezes one).
  brief_item_signing_fixed: 'not_live',
  brief_tick_signing_fixed: 'not_live',
  pairwise_agreement_signing_fixed: 'not_live',
};

export function asConflict(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof BriefActionRefusedError) throw new AppError(409, error.reason);
  const e = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code = typeof e.code === 'string' ? e.code : e.cause?.code;
  const raw = typeof e.constraint === 'string' ? e.constraint : e.cause?.constraint;
  const constraint = typeof raw === 'string' ? raw : '';
  if (constraint in CONSTRAINT_CODES) throw new AppError(409, CONSTRAINT_CODES[constraint]!);
  if (code === '23503') throw new AppError(409, 'not_in_project');
  if (code === '23514') throw new AppError(409, 'rejected_by_database');
  throw error;
}

export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return asConflict(error);
  }
}
