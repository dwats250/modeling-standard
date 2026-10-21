import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { ResponseCookie } from '../http/cookies.ts';
import { clearCookie } from '../http/cookies.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { newToken, textDigest, tokenDigest } from '../infrastructure/tokens.ts';
import { pkceChallenge } from './provider.ts';
import { signInAttempt } from './tables.ts';

/**
 * Sign-in attempts (slice S12).
 *
 * An attempt is admitted only for a real direct invitation (the caller has
 * resolved it), lives ten minutes, and is consumed exactly once: the callback
 * deletes it and receives its row in one statement, so a replayed or
 * concurrent callback finds nothing.
 *
 * Four fresh secrets per attempt, 32 CSPRNG bytes each:
 * - `state`, sent to the provider and back; stored as a digest, the lookup key;
 * - `nonce`, sent to the provider and returned inside the ID token; stored as
 *   a digest;
 * - the PKCE verifier, kept here in clear (it must be sent to the token
 *   endpoint) and never sent to the browser;
 * - the browser-binding secret, set as the `ms_signin` cookie (`__Host-ms_signin`
 *   over HTTPS, hence `Path=/` in both forms) on the browser
 *   that started the attempt and stored as a digest. A callback is honoured
 *   only from a browser that presents it, so a callback URL produced in one
 *   browser cannot sign in another.
 */

export const SIGN_IN_COOKIE = 'ms_signin';
export const ATTEMPT_TTL_SECONDS = 10 * 60;

export interface StartedAttempt {
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  /** The browser-binding secret, for the `ms_signin` cookie only. */
  readonly binding: string;
}

export interface ConsumedAttempt {
  readonly bindingDigest: Buffer;
  readonly nonceDigest: Buffer;
  readonly codeVerifier: string;
  readonly provider: string;
  readonly redirectUri: string;
  readonly invitationId: string;
}

/** Records an attempt for a resolved invitation. Expired attempts are pruned first. */
export async function startSignInAttempt(
  db: Executor,
  request: { provider: string; redirectUri: string; invitationId: string },
): Promise<StartedAttempt> {
  await db.delete(signInAttempt).where(lte(signInAttempt.expiresAt, sql`clock_timestamp()`));
  const state = newToken();
  const nonce = newToken();
  const verifier = newToken();
  const binding = newToken();
  await db.insert(signInAttempt).values({
    stateDigest: state.digest,
    bindingDigest: binding.digest,
    nonceDigest: textDigest(nonce.token),
    codeVerifier: verifier.token,
    provider: request.provider,
    redirectUri: request.redirectUri,
    invitationId: request.invitationId,
    expiresAt: sql`clock_timestamp() + make_interval(secs => ${ATTEMPT_TTL_SECONDS})`,
  });
  return { state: state.token, nonce: nonce.token, codeChallenge: pkceChallenge(verifier.token), binding: binding.token };
}

/**
 * Consumes the unexpired attempt a `state` names, atomically: it is deleted
 * and returned by one statement, so it can be consumed once. Undefined for a
 * malformed, unknown, expired or already-consumed state.
 */
export async function consumeSignInAttempt(db: Executor, state: unknown): Promise<ConsumedAttempt | undefined> {
  const digest = tokenDigest(state);
  if (!digest) return undefined;
  const [row] = await db
    .delete(signInAttempt)
    .where(and(eq(signInAttempt.stateDigest, digest), gt(signInAttempt.expiresAt, sql`clock_timestamp()`)))
    .returning({
      bindingDigest: signInAttempt.bindingDigest,
      nonceDigest: signInAttempt.nonceDigest,
      codeVerifier: signInAttempt.codeVerifier,
      provider: signInAttempt.provider,
      redirectUri: signInAttempt.redirectUri,
      invitationId: signInAttempt.invitationId,
    });
  return row;
}

export function signInCookie(binding: string): ResponseCookie {
  return { name: SIGN_IN_COOKIE, value: binding, maxAge: ATTEMPT_TTL_SECONDS, path: '/', sameSite: 'Lax' };
}

export function clearSignInCookie(): ResponseCookie {
  return clearCookie(SIGN_IN_COOKIE);
}
