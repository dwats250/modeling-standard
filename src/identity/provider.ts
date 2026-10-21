import { createHash } from 'node:crypto';
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { LoginProvider } from '../accounts/account.ts';
import { sameDigest, textDigest } from '../infrastructure/tokens.ts';

/**
 * An OpenID Connect identity provider, as the sign-in operations use it
 * (slice S12; D03: an account is created by Google or Apple sign-in at the
 * moment of the invitation; sign-in is the door, not identity).
 *
 * The application talks to a provider in exactly two places: the
 * authorization URL the browser is sent to, and the exchange of a code for an
 * ID token. Every ID token, from every provider, is verified by
 * `verifyIdToken` below with the provider's issuer, audience and keys.
 *
 * Production registers Google (`google.ts`, S13) only when its client is
 * fully configured, and otherwise none. The demo's local test issuer
 * (`src/demo/test-issuer.ts`) is outside the build. Issuers are constants of
 * a provider, never configuration.
 */

export interface AuthorizationRequest {
  /** The validated origin the browser started from. */
  readonly origin: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly nonce: string;
  /** base64url(SHA-256(PKCE verifier)), method S256. */
  readonly codeChallenge: string;
}

export interface CodeExchange {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

export interface TokenVerification {
  /** The issuer, or every spelling the provider documents for it. */
  readonly issuer: string | readonly string[];
  readonly audience: string;
  readonly keys: JWTVerifyGetKey;
}

export interface IdentityProvider {
  /** The name a sign-in request uses (`test`, later `google`, `apple`). */
  readonly id: string;
  /** How this provider's logins are recorded on an account (S06 admits only these). */
  readonly loginProvider: LoginProvider;
  /** Where to send the browser. Built from the provider's own constants and the request only. */
  authorizationUrl(request: AuthorizationRequest): string;
  /** Exchanges an authorization code for a raw ID token. Throws if the provider refuses. */
  exchangeCode(request: CodeExchange): Promise<string>;
  readonly verification: TokenVerification;
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export class IdTokenRejectedError extends Error {
  constructor(reason: string) {
    super(`ID token rejected: ${reason}`);
    this.name = 'IdTokenRejectedError';
  }
}

/** The provider subject: visible ASCII, bounded. */
const SUBJECT = /^[!-~]{1,255}$/;

/**
 * Verifies an ID token and returns its subject. RS256 only; issuer, audience,
 * `exp`, `iat`, `sub` and `nonce` required; at most 60 seconds of clock skew
 * and ten minutes of age; the nonce must be the one this sign-in attempt sent
 * (compared by digest). Anything else throws. Nothing from the token but the
 * subject is kept.
 */
export async function verifyIdToken(token: string, verification: TokenVerification, expectedNonceDigest: Buffer): Promise<string> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, verification.keys, {
      issuer: typeof verification.issuer === 'string' ? verification.issuer : [...verification.issuer],
      audience: verification.audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
      clockTolerance: 60,
      maxTokenAge: '10 minutes',
    }));
  } catch {
    throw new IdTokenRejectedError('verification failed');
  }
  if (typeof payload.nonce !== 'string' || !sameDigest(textDigest(payload.nonce), expectedNonceDigest)) {
    throw new IdTokenRejectedError('nonce mismatch');
  }
  if (typeof payload.sub !== 'string' || !SUBJECT.test(payload.sub)) throw new IdTokenRejectedError('subject');
  return payload.sub;
}
