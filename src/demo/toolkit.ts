import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { resolveAccountForLogin } from '../accounts/account.ts';
import { account } from '../accounts/tables.ts';
import { publicAccess } from '../authorization/access.ts';
import { clearCookie } from '../http/cookies.ts';
import { defineBrowserOperation, defineOperation, type AnyOperation } from '../http/operations.ts';
import { SESSION_COOKIE, createSession, endSession, sessionCookie } from '../sessions/session.ts';
import { OPERATOR_COOKIE } from './demo.ts';

/**
 * The local demo's synthetic owner harness for the professional toolkit
 * (slice B1). NOT sign-in, and not identity.
 *
 * Login, onboarding and real-provider acceptance for professionals are
 * deferred. To exercise owner-only access in the meantime, the local demo
 * has exactly two fixed synthetic professionals, A and B. Choosing one ends
 * any session or operator mode this browser has and signs it in, with an
 * ordinary S12 session, as that fixed account. The server decides which
 * account: the request names only `a` or `b`, never an account id, so no
 * request can choose an arbitrary account. The professional's own toolkit
 * routes (`src/toolkit/operations.ts`) then find the owner from the session,
 * exactly as they would for a real sign-in.
 *
 * Registered only by the local demo (`createDemoOperations` with the local
 * environment), never on staging and never in production: `src/demo/` is
 * excluded from the build. Its logins are stored as `login_provider =
 * 'google'` (the account table admits only Google and Apple) with a
 * `demo-toolkit|` subject. That is a storage constraint, not a claim: no
 * Google sign-in happens, and a real Google subject is digits only, so it
 * can never collide.
 */

export const SYNTHETIC_OWNERS = {
  a: { subject: 'demo-toolkit|professional-a', label: 'Synthetic professional A' },
  b: { subject: 'demo-toolkit|professional-b', label: 'Synthetic professional B' },
} as const;
export type SyntheticOwner = keyof typeof SYNTHETIC_OWNERS;

const ownerKey = z.enum(['a', 'b']);

/** Which synthetic owner an account is, if it is one. */
function ownerForSubject(subject: string): SyntheticOwner | null {
  for (const [key, owner] of Object.entries(SYNTHETIC_OWNERS)) if (owner.subject === subject) return key as SyntheticOwner;
  return null;
}

/** `mode`: what this browser is (no mode, the demo operator, or a signed-in account); `owner`: which synthetic professional, if one. */
const ownerDto = z.strictObject({ mode: z.enum(['none', 'operator', 'account']), owner: ownerKey.nullable(), label: z.string().nullable() });

export function createToolkitHarnessOperations(): readonly AnyOperation[] {
  const choose = defineBrowserOperation({
    name: 'demo.toolkit.owner.choose',
    method: 'POST',
    path: '/demo/toolkit/owner',
    input: { body: z.strictObject({ owner: ownerKey }) },
    output: ownerDto,
    access: publicAccess(
      'local synthetic demo only: signs this browser in as one of two fixed synthetic professionals the server names; origin-checked; never an account the request names',
    ),
    run: async (input, { db, cookies }) => {
      const owner = SYNTHETIC_OWNERS[input.body.owner];
      const token = await db.transaction(
        async (tx) => {
          const found = await resolveAccountForLogin(tx, { provider: 'google', providerSubject: owner.subject });
          return (await createSession(tx, found.id)).token;
        },
        { isolationLevel: 'read committed' },
      );
      // A session this browser already held is ended, not left open behind the new one.
      for (const previous of cookies(SESSION_COOKIE)) await endSession(db, previous);
      return {
        kind: 'json',
        body: { mode: 'account' as const, owner: input.body.owner, label: owner.label },
        cookies: [sessionCookie(token), clearCookie(OPERATOR_COOKIE)],
      };
    },
  });

  const current = defineOperation({
    name: 'demo.toolkit.owner.read',
    method: 'GET',
    path: '/demo/toolkit/owner',
    output: ownerDto,
    access: publicAccess('local synthetic demo only: says which of the two synthetic professionals, if either, this browser is signed in as'),
    run: async (_input, { db, principal }) => {
      if (principal === null) return { mode: 'none' as const, owner: null, label: null };
      if (principal.kind !== 'account') return { mode: 'operator' as const, owner: null, label: null };
      const [row] = await db.select({ subject: account.providerSubject }).from(account).where(eq(account.id, principal.id)).limit(1);
      const key = row ? ownerForSubject(row.subject) : null;
      return { mode: 'account' as const, owner: key, label: key ? SYNTHETIC_OWNERS[key].label : null };
    },
  });

  return [choose, current];
}
