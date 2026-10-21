import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { IdentityProvider } from './provider.ts';

/**
 * Google sign-in as an OpenID Connect provider (slice S13; D03: an account is
 * created by Google or Apple sign-in at the moment of the invitation; sign-in
 * is the door, not identity).
 *
 * Authorization code flow for a confidential web client, with PKCE (S256), a
 * state and a nonce from the sign-in attempt. Only the `openid` scope is
 * requested, so Google is asked for nothing but the subject; no email, name
 * or picture is requested or kept (S06 stores `(login_provider,
 * provider_subject)` only). The ID token is verified by `verifyIdToken`
 * against Google's published keys, issuer and this client's audience.
 *
 * Endpoints and issuers are constants from Google's OpenID Connect
 * documentation, never configuration. The client id and secret come from
 * validated configuration; the secret is sent only in the body of the token
 * request and never logged or returned.
 */

export const GOOGLE_PROVIDER_ID = 'google';
/** Google documents both spellings of its issuer. */
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
export const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

const TOKEN_TIMEOUT_MS = 10_000;
const MAX_ID_TOKEN_LENGTH = 8192;

export interface GoogleCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface GoogleProviderOptions extends GoogleCredentials {
  /** Tests only: a stand-in for the token endpoint. Production uses the global fetch. */
  readonly fetch?: typeof fetch;
  /** Tests only: local keys. Production fetches and caches Google's JWKS. */
  readonly keys?: JWTVerifyGetKey;
  readonly timeoutMs?: number;
}

/** Why a code exchange failed. The message never carries the code, the secret or the response body. */
export class GoogleTokenExchangeError extends Error {
  constructor(reason: string) {
    super(`Google token exchange failed: ${reason}`);
    this.name = 'GoogleTokenExchangeError';
  }
}

export function createGoogleProvider(options: GoogleProviderOptions): IdentityProvider {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? TOKEN_TIMEOUT_MS;
  const keys =
    options.keys ??
    createRemoteJWKSet(new URL(GOOGLE_JWKS_URI), { timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });

  return {
    id: GOOGLE_PROVIDER_ID,
    loginProvider: 'google',
    authorizationUrl: ({ redirectUri, state, nonce, codeChallenge }) => {
      const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: options.clientId,
        redirect_uri: redirectUri,
        scope: 'openid',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        // A shared phone is never silently the last Google account used.
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },
    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      let response: Response;
      try {
        response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: options.clientId,
            client_secret: options.clientSecret,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }).toString(),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // Neither the request nor the underlying error is kept: only its kind.
        throw new GoogleTokenExchangeError(error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'unreachable');
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        throw new GoogleTokenExchangeError(`token endpoint answered ${response.status}`);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new GoogleTokenExchangeError('token endpoint answered without JSON');
      }
      const idToken = typeof body === 'object' && body !== null ? (body as { id_token?: unknown }).id_token : undefined;
      if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > MAX_ID_TOKEN_LENGTH) {
        throw new GoogleTokenExchangeError('token endpoint answered without an ID token');
      }
      return idToken;
    },
    verification: { issuer: GOOGLE_ISSUERS, audience: options.clientId, keys },
  };
}
