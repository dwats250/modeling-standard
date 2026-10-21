import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { pkceChallenge, type IdentityProvider } from '../identity/provider.ts';

/**
 * The demo's local test identity provider. NOT Google, NOT Apple, and not
 * identity: it lets a person pick an invented test name and proves only that
 * the sign-in path works end to end — authorization request, code, PKCE,
 * token exchange and the real ID-token verification (`verifyIdToken`, jose,
 * RS256, issuer, audience, expiry, nonce).
 *
 * It lives in `src/demo/`, which the production build excludes, and is
 * registered only by the demo server and by tests. Its issuer is a reserved
 * `.invalid` name, so no real token could ever carry it.
 *
 * Its logins are stored as `login_provider = 'google'` (S06 admits only
 * `google` and `apple`) with subject `test-issuer|<name>`. That is a storage
 * constraint, not a claim: no Google sign-in happens, and the demo says so.
 *
 * Two pages, served by the demo server:
 * - `GET /test-idp/authorize` checks the request (client, response type, S256
 *   PKCE, a redirect URI that is exactly an allowed origin's callback) and
 *   shows a form to pick a test name;
 * - `POST /test-idp/approve` (same origin only) issues a single-use code
 *   valid for 60 seconds and redirects to the checked callback.
 */

export const TEST_ISSUER = 'https://test-issuer.modeling-standard.invalid';
export const TEST_AUDIENCE = 'modeling-standard-demo';
export const TEST_PROVIDER_ID = 'test';
const SUBJECT_PREFIX = 'test-issuer|';
const CODE_TTL_MS = 60_000;
const TOKEN_TTL_SECONDS = 300;
const KEY_ID = 'test-issuer-1';

/** Bounded, URL-safe text for the parameters the pages carry. */
const PARAM = /^[A-Za-z0-9_.~-]{16,256}$/;
const NAME = /^[A-Za-z0-9 ]{1,40}$/;

interface PendingCode {
  readonly subject: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly expiresAt: number;
}

export interface MintOptions {
  readonly subject?: string;
  readonly nonce?: string;
  readonly issuer?: string;
  readonly audience?: string;
  /** Seconds from now; negative for an expired token. */
  readonly expiresIn?: number;
  readonly issuedAgo?: number;
  /** Sign with a key the issuer does not publish. */
  readonly foreignKey?: boolean;
}

export interface TestIssuer {
  readonly provider: IdentityProvider;
  /** Handles `/test-idp/*` on the demo server. False if the path is not its own. */
  handle(request: IncomingMessage, response: ServerResponse, body: Buffer | null): Promise<boolean>;
  /** Test helper: a code as the approve page would issue it, without the page. */
  issueCode(request: { name: string; nonce: string; codeChallenge: string; redirectUri: string }): string;
  /** Test helper: a signed ID token, valid unless the options say otherwise. */
  mintIdToken(options: MintOptions): Promise<string>;
}

export interface TestIssuerOptions {
  /** The exact origins whose `/sign-in/callback` may receive a code. Read at request time. */
  readonly allowedOrigins: readonly string[];
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

export async function createTestIssuer(options: TestIssuerOptions): Promise<TestIssuer> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const codes = new Map<string, PendingCode>();

  const isCallback = (uri: string) => options.allowedOrigins.some((origin) => uri === `${origin}/sign-in/callback`);

  async function sign(claims: Record<string, unknown>, key: CryptoKey, subject: string, issuer: string, audience: string, expiresIn: number, issuedAgo: number) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID, typ: 'JWT' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt(now - issuedAgo)
      .setExpirationTime(now + expiresIn)
      .sign(key);
  }

  const provider: IdentityProvider = {
    id: TEST_PROVIDER_ID,
    loginProvider: 'google',
    authorizationUrl: ({ origin, redirectUri, state, nonce, codeChallenge }) => {
      const url = new URL('/test-idp/authorize', origin);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: TEST_AUDIENCE,
        redirect_uri: redirectUri,
        scope: 'openid',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return url.toString();
    },
    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      const pending = codes.get(code);
      codes.delete(code);
      if (!pending || pending.expiresAt < Date.now()) throw new Error('unknown or expired code');
      if (pending.redirectUri !== redirectUri) throw new Error('redirect URI mismatch');
      if (pkceChallenge(codeVerifier) !== pending.codeChallenge) throw new Error('PKCE verifier mismatch');
      return sign({ nonce: pending.nonce }, privateKey, pending.subject, TEST_ISSUER, TEST_AUDIENCE, TOKEN_TTL_SECONDS, 0);
    },
    verification: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, keys },
  };

  function issueCode(request: { name: string; nonce: string; codeChallenge: string; redirectUri: string }): string {
    const code = randomBytes(32).toString('base64url');
    const slug = request.name.trim().toLowerCase().replace(/\s+/g, '-');
    codes.set(code, {
      subject: `${SUBJECT_PREFIX}${slug}`,
      nonce: request.nonce,
      codeChallenge: request.codeChallenge,
      redirectUri: request.redirectUri,
      expiresAt: Date.now() + CODE_TTL_MS,
    });
    return code;
  }

  /** The authorization request's parameters, or null if anything is off. */
  function authorizationParams(params: URLSearchParams): { redirectUri: string; state: string; nonce: string; codeChallenge: string } | null {
    const redirectUri = params.get('redirect_uri') ?? '';
    const state = params.get('state') ?? '';
    const nonce = params.get('nonce') ?? '';
    const codeChallenge = params.get('code_challenge') ?? '';
    const ok =
      params.get('response_type') === 'code' &&
      params.get('client_id') === TEST_AUDIENCE &&
      params.get('code_challenge_method') === 'S256' &&
      isCallback(redirectUri) &&
      PARAM.test(state) &&
      PARAM.test(nonce) &&
      PARAM.test(codeChallenge);
    return ok ? { redirectUri, state, nonce, codeChallenge } : null;
  }

  function page(response: ServerResponse, status: number, title: string, body: string): void {
    response.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8' });
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
        `<title>${escape(title)}</title><link rel="stylesheet" href="/journey.css"></head>` +
        `<body class="journey"><main class="screen"><div class="screen-body">${body}</div></main></body></html>`,
    );
  }

  function refused(response: ServerResponse): void {
    page(response, 400, 'Test sign-in refused', '<section class="card"><h1>Test sign-in refused</h1><p class="muted">This sign-in request is not one this demo issued. Open your invitation link again.</p></section>');
  }

  async function handle(request: IncomingMessage, response: ServerResponse, body: Buffer | null): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://demo.invalid');
    if (request.method === 'GET' && url.pathname === '/test-idp/authorize') {
      const params = authorizationParams(url.searchParams);
      if (!params) {
        refused(response);
        return true;
      }
      const hidden = (['redirect_uri', 'state', 'nonce', 'code_challenge'] as const)
        .map((name) => `<input type="hidden" name="${name}" value="${escape(url.searchParams.get(name) ?? '')}">`)
        .join('');
      const choice = (name: string) => `<button class="btn block" type="submit" name="name" value="${escape(name)}">${escape(name)}</button>`;
      page(
        response,
        200,
        'Test sign-in',
        `<section class="card test-idp">` +
          `<p class="eyebrow">Test identity provider</p>` +
          `<h1>Test sign-in — not Google, not Apple</h1>` +
          `<p class="muted">This is the demo's own local stand-in for Google or Apple sign-in. It checks nothing about who you are: pick any invented test name. A real sign-in would happen here in the product.</p>` +
          `<form method="post" action="/test-idp/approve" class="test-idp-form">${hidden}` +
          `${choice('Test person A')}${choice('Test person B')}${choice('Test person C')}` +
          `<label class="small muted" for="other-name">Or another invented name</label>` +
          `<input class="input" id="other-name" name="other" maxlength="40" autocomplete="off">` +
          `<button class="btn primary block" type="submit" name="name" value="">Continue with that name</button>` +
          `</form></section>`,
      );
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/test-idp/approve') {
      const origin = request.headers.origin;
      if (typeof origin !== 'string' || !options.allowedOrigins.includes(origin)) {
        refused(response);
        return true;
      }
      const form = new URLSearchParams(body?.toString('utf8') ?? '');
      const params = authorizationParams(new URLSearchParams({ ...Object.fromEntries(form), response_type: 'code', client_id: TEST_AUDIENCE, code_challenge_method: 'S256' }));
      const name = (form.get('name') || form.get('other') || '').trim();
      if (!params || !NAME.test(name)) {
        refused(response);
        return true;
      }
      const code = issueCode({ name, nonce: params.nonce, codeChallenge: params.codeChallenge, redirectUri: params.redirectUri });
      const target = new URL(params.redirectUri);
      target.search = new URLSearchParams({ code, state: params.state }).toString();
      response.writeHead(303, { ...SECURITY_HEADERS, location: target.toString() });
      response.end();
      return true;
    }
    return false;
  }

  async function mintIdToken(mint: MintOptions): Promise<string> {
    const key = mint.foreignKey ? (await generateKeyPair('RS256')).privateKey : privateKey;
    return sign(
      { nonce: mint.nonce ?? 'missing-nonce' },
      key,
      mint.subject ?? `${SUBJECT_PREFIX}minted`,
      mint.issuer ?? TEST_ISSUER,
      mint.audience ?? TEST_AUDIENCE,
      mint.expiresIn ?? TOKEN_TTL_SECONDS,
      mint.issuedAgo ?? 0,
    );
  }

  return { provider, handle, issueCode, mintIdToken };
}
