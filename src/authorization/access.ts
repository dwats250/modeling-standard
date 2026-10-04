import type { FastifyRequest } from 'fastify';
import type { Executor } from '../infrastructure/database/client.ts';

/**
 * The authorization boundary's vocabulary. Deliberately small:
 *
 * - A principal is an opaque identifier. Stage 0 does not decide what a
 *   principal will be (an account, a code holder, a representative); that is
 *   Cory's decision D3. In the Stage 0 production build nothing produces a
 *   principal, so every protected operation is denied.
 * - Every operation declares its access: public (with a stated reason) or
 *   protected (with a loader for the object acted on and a policy over it).
 *   There is no third option and no default.
 */

export interface SyntheticPrincipal {
  readonly id: string;
}

/** Turns a request into a principal, or null. The only source of principals. */
export type ResolvePrincipal = (request: FastifyRequest) => SyntheticPrincipal | null;

/** Production resolver for Stage 0: no credential mechanism exists yet. */
export const resolveNoPrincipal: ResolvePrincipal = () => null;

/** A policy decides whether a principal may act on a specific loaded target. */
export type Policy<Target> = (principal: SyntheticPrincipal, target: Target) => boolean;

export interface PublicAccess {
  readonly kind: 'public';
  /** Why this operation is intentionally reachable without a principal. */
  readonly reason: string;
}

export interface ProtectedAccess<Input, Target> {
  readonly kind: 'protected';
  /** Loads the object being acted on. `undefined` means it does not exist. */
  readonly load: (input: Input, db: Executor) => Promise<Target | undefined>;
  readonly policy: Policy<Target>;
}

export type Access<Input, Target> = PublicAccess | ProtectedAccess<Input, Target>;

export function publicAccess(reason: string): PublicAccess {
  if (reason.trim().length === 0) throw new Error('A public operation must state why it is public');
  return { kind: 'public', reason };
}

export type AuthorizationOutcome<Target> =
  | { readonly allowed: true; readonly target: Target }
  | { readonly allowed: false; readonly reason: 'not_found' | 'forbidden' };

/**
 * Loads the target and applies the policy to it. Authorization is decided on
 * the object acted on, not on the route that was called.
 */
export async function authorize<Input, Target>(
  access: ProtectedAccess<Input, Target>,
  principal: SyntheticPrincipal,
  input: Input,
  db: Executor,
): Promise<AuthorizationOutcome<Target>> {
  const target = await access.load(input, db);
  if (target === undefined) return { allowed: false, reason: 'not_found' };
  if (access.policy(principal, target) !== true) return { allowed: false, reason: 'forbidden' };
  return { allowed: true, target };
}
