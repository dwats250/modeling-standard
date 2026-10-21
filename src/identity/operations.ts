import { z } from 'zod';
import { resolveAccountForLogin } from '../accounts/account.ts';
import { PartyAlreadyBoundError } from '../accounts/binding.ts';
import { AppError } from '../app/errors.ts';
import { publicAccess, type Principal } from '../authorization/access.ts';
import type { ResponseCookie } from '../http/cookies.ts';
import { defineBrowserOperation, defineOperation, type AnyOperation, type BrowserResult } from '../http/operations.ts';
import { sameDigest, tokenDigest } from '../infrastructure/tokens.ts';
import { InvitationNotFoundError, findDirectInvitation, resolveDirectInvitation } from '../invitations/invitation.ts';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSession,
  endSession,
  sessionCookie,
} from '../sessions/session.ts';
import { SIGN_IN_COOKIE, clearSignInCookie, consumeSignInAttempt, signInCookie, startSignInAttempt } from './attempt.ts';
import { AccountAlreadyInProjectError, claimInvitationForAccount } from './claim.ts';
import { verifyIdToken, type IdentityProvider } from './provider.ts';

/**
 * Sign-in, invitation acceptance and sign-out (slice S12; D03, D11, D12).
 *
 * D03: an account is required and is created by sign-in at the moment of the
 * invitation; the link is the invitation; sign-in is the door, not identity.
 * So a sign-in can only start from a real direct invitation, and its
 * completion binds the account to that invitation's party (S06, S07) and
 * signs the browser in. There is no bare sign-in that creates accounts.
 *
 * D11 is not touched: nothing here verifies anyone. D12: a claim binds an
 * account to one party; it gives no authority over anyone else.
 *
 * The invitation link carries its credential in the URL fragment
 * (`/#/i/<credential>`), so the credential reaches the server only in the
 * body of `POST /sign-in/start` or `POST /invitations/claim`. After the
 * provider, the claim context is the attempt's invitation id, held server
 * side; the browser is redirected to its brief, never to a URL with a
 * credential in it.
 */

export interface IdentityOptions {
  /** Registered providers. Production registers none in this slice. */
  readonly providers: readonly IdentityProvider[];
  readonly sessionTtlSeconds?: number;
  /**
   * Cookies cleared whenever this browser's session begins or ends. The demo
   * uses it so a browser that signs in or out leaves operator mode; the
   * product has none.
   */
  readonly clearOnSessionChange?: readonly ResponseCookie[];
}

export const NO_IDENTITY: IdentityOptions = { providers: [] };

/** Where a finished sign-in may send the browser: fixed paths only. */
const SIGNED_IN_PATH = (projectId: string) => `/#/brief/${z.uuid().parse(projectId)}`;
const SIGN_IN_FAILED_PATH = '/#/signin/failed';
const ALREADY_CLAIMED_PATH = '/#/signin/already-claimed';
const ALREADY_IN_SHOOT_PATH = '/#/signin/already-in-shoot';

const accountOnly = (principal: Principal) => principal.kind === 'account';

export function createIdentityOperations(options: IdentityOptions): readonly AnyOperation[] {
  const ttl = options.sessionTtlSeconds ?? SESSION_TTL_SECONDS;
  const companions = options.clearOnSessionChange ?? [];
  const providerNamed = (id: string) => options.providers.find((p) => p.id === id);

  const start = defineBrowserOperation({
    name: 'sign-in.start',
    method: 'POST',
    path: '/sign-in/start',
    input: {
      body: z.strictObject({
        provider: z.string().min(1).max(32),
        invitation: z.string().min(1).max(128),
      }),
    },
    output: z.strictObject({ authorizationUrl: z.url() }),
    access: publicAccess('a person opening an invitation link is not signed in yet; only a real invitation admits a sign-in attempt'),
    run: async (input, { db, origin }) => {
      const provider = providerNamed(input.body.provider);
      // The boundary admits a browser POST only from an allowed origin.
      if (!provider || origin === null) throw new AppError(404, 'not_found');
      const invitation = await resolveDirectInvitation(db, input.body.invitation);
      if (!invitation) throw new AppError(404, 'not_found');
      const redirectUri = `${origin}/sign-in/callback`;
      const attempt = await startSignInAttempt(db, { provider: provider.id, redirectUri, invitationId: invitation.id });
      const authorizationUrl = provider.authorizationUrl({
        origin,
        redirectUri,
        state: attempt.state,
        nonce: attempt.nonce,
        codeChallenge: attempt.codeChallenge,
      });
      return { kind: 'json', body: { authorizationUrl }, cookies: [signInCookie(attempt.binding)] };
    },
  });

  const callbackQuery = z.strictObject({
    code: z.string().min(1).max(2048).optional(),
    state: z.string().min(1).max(128).optional(),
    // What a provider may add; read never, accepted so a real callback is not a 400.
    error: z.string().max(256).optional(),
    error_description: z.string().max(1024).optional(),
    scope: z.string().max(1024).optional(),
    iss: z.string().max(256).optional(),
    authuser: z.string().max(16).optional(),
    prompt: z.string().max(64).optional(),
    hd: z.string().max(256).optional(),
  });

  const callback = defineBrowserOperation({
    name: 'sign-in.callback',
    method: 'GET',
    path: '/sign-in/callback',
    input: { query: callbackQuery },
    output: z.strictObject({}),
    access: publicAccess('the identity provider returns the browser here; the attempt, its browser binding and the ID token are checked before anything is written'),
    run: async (input, { db, cookies, log }): Promise<BrowserResult<Record<string, never>>> => {
      const done = (location: string, extra: readonly ResponseCookie[] = []): BrowserResult<Record<string, never>> => ({
        kind: 'redirect',
        location,
        cookies: [clearSignInCookie(), ...extra],
      });
      const { code, state } = input.query;
      if (code === undefined || state === undefined) return done(SIGN_IN_FAILED_PATH);

      // Consumed first and atomically: whatever happens next, this state is spent.
      const attempt = await consumeSignInAttempt(db, state);
      if (!attempt) return done(SIGN_IN_FAILED_PATH);

      // Only the browser that started the attempt may finish it.
      const bindings = cookies(SIGN_IN_COOKIE);
      const presented = bindings.length === 1 ? tokenDigest(bindings[0]) : null;
      if (presented === null || !sameDigest(presented, attempt.bindingDigest)) return done(SIGN_IN_FAILED_PATH);

      const provider = providerNamed(attempt.provider);
      if (!provider) return done(SIGN_IN_FAILED_PATH);
      let subject: string;
      try {
        const idToken = await provider.exchangeCode({ code, codeVerifier: attempt.codeVerifier, redirectUri: attempt.redirectUri });
        subject = await verifyIdToken(idToken, provider.verification, attempt.nonceDigest);
      } catch (err) {
        log.warn({ err }, 'sign-in callback refused');
        return done(SIGN_IN_FAILED_PATH);
      }

      // Account, claim and session in one transaction: a refused claim
      // creates no account and no session.
      let signedIn: { projectId: string; token: string };
      try {
        signedIn = await db.transaction(
          async (tx) => {
            const invitation = await findDirectInvitation(tx, attempt.invitationId);
            if (!invitation) throw new InvitationNotFoundError();
            const account = await resolveAccountForLogin(tx, { provider: provider.loginProvider, providerSubject: subject });
            await claimInvitationForAccount(tx, invitation, account.id);
            const session = await createSession(tx, account.id, ttl);
            return { projectId: invitation.projectId, token: session.token };
          },
          { isolationLevel: 'read committed' },
        );
      } catch (error) {
        if (error instanceof PartyAlreadyBoundError) return done(ALREADY_CLAIMED_PATH);
        if (error instanceof AccountAlreadyInProjectError) return done(ALREADY_IN_SHOOT_PATH);
        if (error instanceof InvitationNotFoundError) return done(SIGN_IN_FAILED_PATH);
        throw error;
      }

      // A session this browser already held is ended, not left open behind the new one.
      for (const previous of cookies(SESSION_COOKIE)) await endSession(db, previous);
      return done(SIGNED_IN_PATH(signedIn.projectId), [sessionCookie(signedIn.token, ttl), ...companions]);
    },
  });

  const signOut = defineBrowserOperation({
    name: 'sign-out',
    method: 'POST',
    path: '/sign-out',
    output: z.strictObject({}),
    access: publicAccess('signing out needs no principal: it ends the session this browser names, if any, and clears its cookies'),
    run: async (_input, { db, cookies }) => {
      for (const token of cookies(SESSION_COOKIE)) await endSession(db, token);
      return { kind: 'json', body: {}, cookies: [clearSessionCookie(), ...companions] };
    },
  });

  const claim = defineOperation({
    name: 'invitation.claim',
    method: 'POST',
    path: '/invitations/claim',
    input: { body: z.strictObject({ credential: z.string().min(1).max(128) }) },
    output: z.strictObject({ projectId: z.uuid() }),
    access: {
      kind: 'protected',
      load: (input, db) => resolveDirectInvitation(db, input.body.credential),
      // Only a signed-in account claims; a synthetic principal is not a person.
      policy: accountOnly,
    },
    run: async (input, { db, principal }) => {
      try {
        return await db.transaction(
          async (tx) => {
            const invitation = await resolveDirectInvitation(tx, input.body.credential);
            if (!invitation) throw new InvitationNotFoundError();
            await claimInvitationForAccount(tx, invitation, (principal as Principal).id);
            return { projectId: invitation.projectId };
          },
          { isolationLevel: 'read committed' },
        );
      } catch (error) {
        if (error instanceof PartyAlreadyBoundError) throw new AppError(409, 'already_claimed');
        if (error instanceof AccountAlreadyInProjectError) throw new AppError(409, 'already_in_shoot');
        if (error instanceof InvitationNotFoundError) throw new AppError(404, 'not_found');
        throw error;
      }
    },
  });

  /** Whether this browser is signed in. Says nothing about the account. */
  const session = defineOperation({
    name: 'session.read',
    method: 'GET',
    path: '/session',
    output: z.strictObject({}),
    access: { kind: 'protected', load: async () => ({}), policy: accountOnly },
    run: async () => ({}),
  });

  return [start, callback, signOut, claim, session];
}
