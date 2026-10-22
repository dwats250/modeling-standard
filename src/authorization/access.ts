import type { FastifyRequest } from 'fastify';
import type { Executor } from '../infrastructure/database/client.ts';

/**
 * The authorization boundary's vocabulary. Deliberately small:
 *
 * - A principal is an opaque identifier with a kind. An `account` principal
 *   is a signed-in sign-in account (D03; S06 accounts, S12 sessions): its id
 *   is `account.id`. A `synthetic` principal is test- or demo-only (the test
 *   header resolver, the demo operator) and stands for nobody. Sign-in is the
 *   door, not identity (D03): an account principal is not a verified person.
 * - Every operation declares its access: public (with a stated reason) or
 *   protected (with a loader for the object acted on and a policy over it).
 *   There is no third option and no default.
 */

export interface Principal {
  readonly id: string;
  readonly kind: 'account' | 'synthetic';
}

/**
 * Turns a request into a principal, or null. The only source of principals.
 * It must fail closed: anything it cannot positively resolve is null.
 */
export type ResolvePrincipal = (request: FastifyRequest) => Principal | null | Promise<Principal | null>;

/** A resolver that never produces a principal: every protected operation is denied. */
export const resolveNoPrincipal: ResolvePrincipal = () => null;

/** A policy decides whether a principal may act on a specific loaded target. */
export type Policy<Target> = (principal: Principal, target: Target) => boolean;

/** Only synthetic (test or demo) principals; a signed-in account is refused. */
export function syntheticOnly(principal: Principal): boolean {
  return principal.kind === 'synthetic';
}

export interface PublicAccess {
  readonly kind: 'public';
  /** Why this operation is intentionally reachable without a principal. */
  readonly reason: string;
}

export interface ProtectedAccess<Input, Target> {
  readonly kind: 'protected';
  /**
   * Loads the object being acted on. `undefined` means it does not exist (or,
   * for a principal-dependent loader, does not exist for this principal).
   */
  readonly load: (input: Input, db: Executor, principal: Principal) => Promise<Target | undefined>;
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
  principal: Principal,
  input: Input,
  db: Executor,
): Promise<AuthorizationOutcome<Target>> {
  const target = await access.load(input, db, principal);
  if (target === undefined) return { allowed: false, reason: 'not_found' };
  if (access.policy(principal, target) !== true) return { allowed: false, reason: 'forbidden' };
  return { allowed: true, target };
}
