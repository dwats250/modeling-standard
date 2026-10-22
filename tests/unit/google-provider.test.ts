import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_ISSUERS,
  GOOGLE_TOKEN_ENDPOINT,
  GoogleTokenExchangeError,
  createGoogleProvider,
} from '../../src/identity/google.ts';
import { IdTokenRejectedError, verifyIdToken } from '../../src/identity/provider.ts';
import { textDigest } from '../../src/infrastructure/tokens.ts';

/**
 * The Google provider (S13) against fake endpoints: an injected token
 * endpoint and local signing keys. The verification is the real
 * `verifyIdToken` (jose). Nothing here talks to Google, so nothing here shows
 * that real Google sign-in works.
 */

const CLIENT_ID = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
const CLIENT_SECRET = 'fake-client-secret-Not-A-Real-Secret-4242';
const REDIRECT = 'https://staging.example.invalid:8443/sign-in/callback';

let privateKey: CryptoKey;
let jwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'google-test-1', alg: 'RS256', use: 'sig' };
});

interface Mint {
  iss?: string;
  aud?: string;
  sub?: string;
  nonce?: string;
  exp?: number;
  iat?: number;
  key?: CryptoKey;
}

async function mint(claims: Mint = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce: claims.nonce ?? 'the-nonce' })
    .setProtectedHeader({ alg: 'RS256', kid: 'google-test-1', typ: 'JWT' })
    .setIssuer(claims.iss ?? 'https://accounts.google.com')
    .setAudience(claims.aud ?? CLIENT_ID)
    .setSubject(claims.sub ?? '110169484474386276334')
    .setIssuedAt(claims.iat ?? now)
    .setExpirationTime(claims.exp ?? now + 3600)
    .sign(claims.key ?? privateKey);
}

function provider(answer: (request: { url: string; init: RequestInit }) => Promise<Response> | Response, calls: { url: string; init: RequestInit }[] = []) {
  return createGoogleProvider({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    keys: createLocalJWKSet({ keys: [jwk] }),
    timeoutMs: 200,
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: typeof url === 'string' ? url : url instanceof URL ? url.href : url.url, init: init ?? {} };
      calls.push(call);
      return answer(call);
    },
  });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Google authorization request', () => {
  it('asks Google for openid only, with state, nonce, PKCE S256, the exact redirect URI and an account chooser', () => {
    const url = new URL(
      provider(() => json({})).authorizationUrl({ origin: 'https://staging.example.invalid:8443', redirectUri: REDIRECT, state: 's'.repeat(43), nonce: 'n'.repeat(43), codeChallenge: 'c'.repeat(43) }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      scope: 'openid',
      state: 's'.repeat(43),
      nonce: 'n'.repeat(43),
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    // The secret never goes to the browser.
    expect(url.toString()).not.toContain(CLIENT_SECRET);
  });
});

describe('Google code exchange', () => {
  it('posts the code, verifier, redirect URI and client credentials to the token endpoint only, refusing redirects', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const token = await mint();
    const got = await provider(() => json({ id_token: token, access_token: 'ignored' }), calls).exchangeCode({ code: 'the-code', codeVerifier: 'v'.repeat(43), redirectUri: REDIRECT });
    expect(got).toBe(token);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(GOOGLE_TOKEN_ENDPOINT);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.redirect).toBe('error');
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.init.body as string))).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      code_verifier: 'v'.repeat(43),
    });
  });

  const failures: [string, (call: { init: RequestInit }) => Promise<Response> | Response][] = [
    ['a 400 (invalid_grant)', () => json({ error: 'invalid_grant', error_description: `bad code the-code ${CLIENT_SECRET}` }, 400)],
    ['a 500', () => new Response('oops', { status: 500 })],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ['JSON without an ID token', () => json({ access_token: 'x' })],
    ['an empty ID token', () => json({ id_token: '' })],
    ['an ID token that is not a string', () => json({ id_token: 42 })],
    ['an oversized ID token', () => json({ id_token: 'x'.repeat(9000) })],
    ['a network failure', () => Promise.reject(new TypeError(`fetch failed for ${CLIENT_SECRET}`))],
    // An endpoint that never answers: like the real fetch, the fake gives up when the signal aborts.
    ['a timeout', ({ init }) => new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error)))],
  ];
  for (const [label, answer] of failures) {
    it(`fails closed on ${label}, without the code, secret or response in the error`, async () => {
      const error = await provider(answer)
        .exchangeCode({ code: 'the-code', codeVerifier: 'v'.repeat(43), redirectUri: REDIRECT })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(GoogleTokenExchangeError);
      const text = `${(error as Error).message} ${String((error as Error).stack)} ${String((error as Error).cause)}`;
      for (const secret of [CLIENT_SECRET, 'the-code', 'invalid_grant', 'oops', '<html>']) expect(text).not.toContain(secret);
    });
  }
});

describe('Google ID-token verification (the real verifyIdToken path)', () => {
  const nonce = textDigest('the-nonce');
  const verification = () => provider(() => json({})).verification;

  it('accepts both documented issuer spellings and returns only the subject', async () => {
    expect(verification().issuer).toEqual(GOOGLE_ISSUERS);
    for (const iss of GOOGLE_ISSUERS) expect(await verifyIdToken(await mint({ iss }), verification(), nonce)).toBe('110169484474386276334');
  });

  const refused: [string, () => Promise<string>][] = [
    ['another issuer', () => mint({ iss: 'https://accounts.google.com.evil.example' })],
    ['an issuer spelled with a trailing slash', () => mint({ iss: 'https://accounts.google.com/' })],
    ['another client as audience', () => mint({ aud: '999-other.apps.googleusercontent.com' })],
    ['another nonce', () => mint({ nonce: 'someone-else' })],
    ['an expired token', () => mint({ exp: Math.floor(Date.now() / 1000) - 120 })],
    ['a token issued too long ago', () => mint({ iat: Math.floor(Date.now() / 1000) - 3600 })],
    ['a key Google does not publish', async () => mint({ key: (await generateKeyPair('RS256')).privateKey })],
    ['an unsigned token', async () => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${(await mint()).split('.')[1]}.`],
    ['an HS256 token', async () => new SignJWT({ nonce: 'the-nonce' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('https://accounts.google.com').setAudience(CLIENT_ID).setSubject('1').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode('x'.repeat(32)))],
    ['a tampered payload', async () => {
      const [h, , s] = (await mint()).split('.');
      return `${h}.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'attacker', nonce: 'the-nonce', iat: 1, exp: 9e9 })).toString('base64url')}.${s}`;
    }],
  ];
  for (const [label, token] of refused) {
    it(`refuses ${label}`, async () => {
      await expect(verifyIdToken(await token(), verification(), nonce)).rejects.toBeInstanceOf(IdTokenRejectedError);
    });
  }
});
