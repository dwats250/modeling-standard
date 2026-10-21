import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { GOOGLE_AUTHORIZATION_ENDPOINT, GOOGLE_TOKEN_ENDPOINT, createGoogleProvider } from '../../src/identity/google.ts';
import type { IdentityProvider } from '../../src/identity/provider.ts';

/**
 * A stand-in for Google's endpoints, for tests only: it plays the account
 * chooser (`approve`) and the token endpoint (through the provider's injected
 * fetch), and signs ID tokens with a local key published through the
 * provider's injected key set. The provider and the verification are the
 * real S13 code. This proves our side of the flow; it says nothing about
 * whether real Google accepts our client or our redirect URI.
 */

export const FAKE_CLIENT_ID = '123456789012-fakegoogleclient0000000000000000.apps.googleusercontent.com';
export const FAKE_CLIENT_SECRET = 'GOCSPX-Fake-Secret-For-Tests-Only';

interface Pending {
  readonly subject: string;
  readonly nonce: string;
  readonly challenge: string;
  readonly redirectUri: string;
}

/** What the next token response does, for refusal tests. */
export type TokenBehaviour =
  | 'ok'
  | 'http-400'
  | 'no-id-token'
  | 'wrong-audience'
  | 'wrong-issuer'
  | 'wrong-nonce'
  | 'foreign-key'
  | 'expired';

export interface FakeGoogle {
  readonly provider: IdentityProvider;
  /** The person picks `subject` on Google's page: returns the code and state Google would send back. */
  approve(authorizationUrl: string, subject: string): { code: string; state: string; redirectUri: string };
  /** Every token request the server made (form fields), to check what it sent. */
  readonly tokenRequests: Record<string, string>[];
  behaviour: TokenBehaviour;
}

export async function createFakeGoogle(): Promise<FakeGoogle> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'fake-google-1', alg: 'RS256', use: 'sig' };
  const pending = new Map<string, Pending>();
  const tokenRequests: Record<string, string>[] = [];

  async function sign(claims: { sub: string; nonce: string; aud?: string; iss?: string; exp?: number }, key: CryptoKey): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ nonce: claims.nonce })
      .setProtectedHeader({ alg: 'RS256', kid: 'fake-google-1', typ: 'JWT' })
      .setIssuer(claims.iss ?? 'https://accounts.google.com')
      .setAudience(claims.aud ?? FAKE_CLIENT_ID)
      .setSubject(claims.sub)
      .setIssuedAt(now)
      .setExpirationTime(claims.exp ?? now + 3600)
      .sign(key);
  }

  const fake: FakeGoogle = {
    behaviour: 'ok',
    tokenRequests,
    approve(authorizationUrl, subject) {
      const url = new URL(authorizationUrl);
      if (`${url.origin}${url.pathname}` !== GOOGLE_AUTHORIZATION_ENDPOINT) throw new Error('not a Google authorization URL');
      const p = url.searchParams;
      if (p.get('client_id') !== FAKE_CLIENT_ID || p.get('scope') !== 'openid' || p.get('code_challenge_method') !== 'S256') throw new Error('unexpected request');
      const code = randomBytes(24).toString('base64url');
      pending.set(code, { subject, nonce: p.get('nonce')!, challenge: p.get('code_challenge')!, redirectUri: p.get('redirect_uri')! });
      return { code, state: p.get('state')!, redirectUri: p.get('redirect_uri')! };
    },
    provider: createGoogleProvider({
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
      keys: createLocalJWKSet({ keys: [jwk] }),
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        const target = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (target !== GOOGLE_TOKEN_ENDPOINT) throw new Error('only the token endpoint is called');
        const form = Object.fromEntries(new URLSearchParams(typeof init?.body === 'string' ? init.body : ''));
        tokenRequests.push(form);
        const found = pending.get(form.code ?? '');
        pending.delete(form.code ?? '');
        const bad = (status = 400) => new Response(JSON.stringify({ error: 'invalid_grant' }), { status });
        if (fake.behaviour === 'http-400') return bad();
        if (!found || form.client_id !== FAKE_CLIENT_ID || form.client_secret !== FAKE_CLIENT_SECRET || form.redirect_uri !== found.redirectUri) return bad();
        if (createHash('sha256').update(form.code_verifier ?? '', 'ascii').digest('base64url') !== found.challenge) return bad();
        if (fake.behaviour === 'no-id-token') return Response.json({ access_token: 'x' });
        const claims = { sub: found.subject, nonce: found.nonce };
        const key = fake.behaviour === 'foreign-key' ? (await generateKeyPair('RS256')).privateKey : privateKey;
        const idToken = await sign(
          {
            ...claims,
            ...(fake.behaviour === 'wrong-audience' ? { aud: '999-another.apps.googleusercontent.com' } : {}),
            ...(fake.behaviour === 'wrong-issuer' ? { iss: 'https://accounts.google.example' } : {}),
            ...(fake.behaviour === 'wrong-nonce' ? { nonce: 'not-the-nonce' } : {}),
            ...(fake.behaviour === 'expired' ? { exp: Math.floor(Date.now() / 1000) - 300 } : {}),
          },
          key,
        );
        return Response.json({ id_token: idToken, access_token: 'x', token_type: 'Bearer', expires_in: 3599, scope: 'openid' });
      },
    }),
  };
  return fake;
}
