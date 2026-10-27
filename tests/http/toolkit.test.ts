import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import { operations } from '../../src/app/operation-list.ts';
import type { ResolvePrincipal } from '../../src/authorization/access.ts';
import { validateOperations } from '../../src/http/operations.ts';
import { DEFAULT_ARRANGEMENT, FIXTURE_MEDIA } from '../../src/toolkit/fixture-media.ts';
import { toolkitOperations } from '../../src/toolkit/operations.ts';
import { PRINCIPAL_HEADER, startTestApp, type TestApp } from '../support/app.ts';

/**
 * B1 through the real application boundary: the production app (createApp +
 * the production operation list) has no toolkit route at all; with the
 * toolkit operations added, as only the local demo adds them, owner-only
 * access with the owner taken from the principal, never from the request;
 * strict input; no ids in any response; a refusal for a synthetic principal;
 * and durability across an application restart.
 *
 * Principals: `x-test-account` stands for a signed-in account (what a session
 * resolves to); `x-test-principal` is a synthetic (operator or test) one.
 */

const ACCOUNT_HEADER = 'x-test-account';
const resolve: ResolvePrincipal = (request) => {
  const acct = request.headers[ACCOUNT_HEADER];
  if (typeof acct === 'string' && acct.length > 0) return { id: acct, kind: 'account' };
  const synthetic = request.headers[PRINCIPAL_HEADER];
  return typeof synthetic === 'string' && synthetic.length > 0 ? { id: synthetic, kind: 'synthetic' } : null;
};

let t: TestApp;
let production: TestApp;
let ownerA: string;
let ownerB: string;
const withToolkit = () => startTestApp({ resolvePrincipal: resolve, additionalOperations: toolkitOperations });
beforeAll(async () => {
  t = await withToolkit();
  production = await startTestApp({ resolvePrincipal: resolve });
  ownerA = (await resolveAccountForLogin(t.database.db, { provider: 'google', providerSubject: `http-toolkit-a-${randomUUID()}` })).id;
  ownerB = (await resolveAccountForLogin(t.database.db, { provider: 'google', providerSubject: `http-toolkit-b-${randomUUID()}` })).id;
});
afterAll(async () => {
  await t.close();
  await production.close();
});

type Json = Record<string, unknown>;
async function call(app: TestApp, method: 'GET' | 'POST', url: string, as: Record<string, string>, payload?: unknown) {
  const res = await app.app.inject({ method, url, headers: as, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: res.body, json: () => res.json<Json>() };
}
const asAccount = (id: string) => ({ [ACCOUNT_HEADER]: id });
const profile = { displayName: 'Amara Okafor', profession: 'Model', biography: 'Editorial and commercial.' };
const card = (overrides: Json = {}) => ({ tagline: 'Available for editorial work', slots: { ...DEFAULT_ARRANGEMENT }, ...overrides });

const ROUTES = [
  ['GET', '/me/profile'],
  ['POST', '/me/profile'],
  ['GET', '/me/comp-card'],
  ['POST', '/me/comp-card'],
  ['GET', '/me/portfolio'],
  ['POST', '/me/portfolio'],
] as const;

describe('the toolkit routes are not in the production surface', () => {
  it('the production operation list has none of them', () => {
    expect(operations.filter((op) => op.name.startsWith('toolkit.') || op.path.startsWith('/me'))).toEqual([]);
  });

  it('the production app answers the generic 404 for each, even to a signed-in account, and writes nothing', async () => {
    for (const [method, url] of ROUTES) {
      expect(production.app.hasRoute({ method, url })).toBe(false);
      const res = await call(production, method, url, asAccount(ownerA), method === 'POST' ? (url === '/me/profile' ? profile : card()) : undefined);
      expect({ method, url, status: res.status }).toEqual({ method, url, status: 404 });
      expect(res.json()).toEqual({ error: { code: 'not_found', requestId: expect.any(String) } });
    }
    expect((await call(t, 'GET', '/me/profile', asAccount(ownerA))).json()).toEqual({ profile: null });
  });

  it('the toolkit operations (B1 and B2), as the local demo registers them, pass registration validation and are all protected', () => {
    expect(() => validateOperations(toolkitOperations)).not.toThrow();
    expect(toolkitOperations.map((op) => `${op.method} ${op.path}`)).toEqual(ROUTES.map(([m, u]) => `${m} ${u}`));
    expect(toolkitOperations.every((op) => op.access.kind === 'protected')).toBe(true);
  });
});

describe('owner-only access', () => {
  it('refuses a request with no principal before reading its body (401)', async () => {
    for (const [method, url] of [['GET', '/me/profile'], ['POST', '/me/profile'], ['GET', '/me/comp-card'], ['POST', '/me/comp-card']] as const) {
      const res = await call(t, method, url, {}, method === 'POST' ? { displayName: 'x' } : undefined);
      expect(res.status).toBe(401);
    }
  });

  it('refuses a synthetic principal (the demo operator, a test header) with the generic 404, writing nothing', async () => {
    const synthetic = { [PRINCIPAL_HEADER]: ownerA };
    expect((await call(t, 'POST', '/me/profile', synthetic, profile)).status).toBe(404);
    expect((await call(t, 'GET', '/me/profile', synthetic)).status).toBe(404);
    expect((await call(t, 'POST', '/me/comp-card', synthetic, card())).status).toBe(404);
    expect((await call(t, 'GET', '/me/comp-card', synthetic)).status).toBe(404);
    expect((await call(t, 'GET', '/me/profile', asAccount(ownerA))).json()).toEqual({ profile: null });
  });

  it('each owner creates, edits and reads only their own profile and draft', async () => {
    const created = await call(t, 'POST', '/me/profile', asAccount(ownerA), profile);
    expect(created.status).toBe(200);
    expect(created.json()).toEqual({ profile: { ...profile, updatedAt: expect.any(String) } });

    expect((await call(t, 'GET', '/me/profile', asAccount(ownerB))).json()).toEqual({ profile: null });
    const bCard = (await call(t, 'GET', '/me/comp-card', asAccount(ownerB))).json();
    expect(bCard.profile).toBeNull();

    await call(t, 'POST', '/me/profile', asAccount(ownerB), { displayName: 'Jun Park', profession: 'Photographer', biography: '' });
    const aSaved = await call(t, 'POST', '/me/comp-card', asAccount(ownerA), card());
    expect(aSaved.status).toBe(200);
    const bSaved = await call(t, 'POST', '/me/comp-card', asAccount(ownerB), card({ tagline: 'B', slots: { ...DEFAULT_ARRANGEMENT, hero: 'studio-portrait-slate' } }));
    expect(bSaved.status).toBe(200);

    const a = (await call(t, 'GET', '/me/comp-card', asAccount(ownerA))).json() as { profile: Json; draft: Json };
    expect(a.profile).toMatchObject(profile);
    expect(a.draft).toMatchObject({ tagline: 'Available for editorial work', slots: DEFAULT_ARRANGEMENT, updatedAt: expect.any(String) });
    const b = (await call(t, 'GET', '/me/comp-card', asAccount(ownerB))).json() as { profile: Json; draft: Json };
    expect(b.profile).toMatchObject({ displayName: 'Jun Park' });
    expect(b.draft).toMatchObject({ tagline: 'B', slots: { hero: 'studio-portrait-slate' } });
    expect(JSON.stringify(b)).not.toContain('Amara');
  });

  it('cannot be pointed at another owner: owner, profile or draft ids in the body or query are refused, nothing changes', async () => {
    await call(t, 'POST', '/me/profile', asAccount(ownerA), profile);
    const before = (await call(t, 'GET', '/me/comp-card', asAccount(ownerA))).json();
    const attempts = [
      ['POST', '/me/profile', { ...profile, displayName: 'Hijacked', accountId: ownerA }],
      ['POST', '/me/profile', { ...profile, displayName: 'Hijacked', owner: 'a' }],
      ['POST', '/me/profile', { ...profile, displayName: 'Hijacked', id: randomUUID() }],
      ['POST', '/me/comp-card', { ...card({ tagline: 'Hijacked' }), profileId: randomUUID() }],
      ['POST', '/me/comp-card', { ...card({ tagline: 'Hijacked' }), accountId: ownerA }],
      ['POST', `/me/profile?accountId=${ownerA}`, { ...profile, displayName: 'Hijacked' }],
      ['GET', `/me/profile?accountId=${ownerA}`, undefined],
      ['GET', `/me/comp-card?owner=a`, undefined],
    ] as const;
    for (const [method, url, payload] of attempts) {
      const res = await call(t, method, url, asAccount(ownerB), payload);
      expect(res.status, `${method} ${url}`).toBe(400);
      expect(res.body).not.toContain('Amara');
    }
    // No route takes an id: a guessed one is simply not a route.
    expect((await call(t, 'GET', `/me/profile/${ownerA}`, asAccount(ownerB))).status).toBe(404);
    expect((await call(t, 'GET', `/profiles/${ownerA}`, asAccount(ownerB))).status).toBe(404);
    expect((await call(t, 'GET', '/me/comp-card', asAccount(ownerA))).json()).toEqual(before);
  });

  it('never returns an id or an owner', async () => {
    for (const url of ['/me/profile', '/me/comp-card']) {
      const body = (await call(t, 'GET', url, asAccount(ownerA))).body;
      expect(body).not.toContain(ownerA);
      expect(body).not.toMatch(/"(id|accountId|profileId)"/);
    }
  });
});

describe('strict input', () => {
  const refused = async (url: string, payload: unknown) => {
    const res = await call(t, 'POST', url, asAccount(ownerA), payload);
    expect(res.status, JSON.stringify(payload)).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_input' } });
  };

  it('refuses invalid profiles', async () => {
    await refused('/me/profile', { ...profile, displayName: '' });
    await refused('/me/profile', { ...profile, displayName: '   ' });
    await refused('/me/profile', { ...profile, displayName: 'x'.repeat(81) });
    await refused('/me/profile', { ...profile, displayName: 'Tab\tName' });
    await refused('/me/profile', { ...profile, displayName: 'Line\nbreak' });
    await refused('/me/profile', { ...profile, profession: 'x'.repeat(61) });
    await refused('/me/profile', { ...profile, biography: 'x'.repeat(601) });
    await refused('/me/profile', { ...profile, biography: 'bell\u0007' });
    await refused('/me/profile', { displayName: 'Only a name' });
    await refused('/me/profile', { ...profile, displayName: 42 });
  });

  it('trims, normalises line breaks, and keeps markup as plain text', async () => {
    const res = await call(t, 'POST', '/me/profile', asAccount(ownerA), {
      displayName: '  Amara Okafor  ',
      profession: ' Model ',
      biography: '  <script>alert(1)</script>\r\nSecond line\r\n  ',
    });
    expect(res.json()).toMatchObject({ profile: { displayName: 'Amara Okafor', profession: 'Model', biography: '<script>alert(1)</script>\nSecond line' } });
  });

  it('refuses invalid comp cards: unknown or duplicate fixtures, missing or extra slots, long taglines', async () => {
    await call(t, 'POST', '/me/profile', asAccount(ownerA), profile);
    await refused('/me/comp-card', card({ slots: { ...DEFAULT_ARRANGEMENT, hero: 'not-a-fixture' } }));
    await refused('/me/comp-card', card({ slots: { ...DEFAULT_ARRANGEMENT, hero: 'https://example.com/me.jpg' } }));
    await refused('/me/comp-card', card({ slots: { ...DEFAULT_ARRANGEMENT, hero: DEFAULT_ARRANGEMENT.beauty } }));
    const { beauty: _omitted, ...missing } = DEFAULT_ARRANGEMENT;
    await refused('/me/comp-card', card({ slots: missing }));
    await refused('/me/comp-card', card({ slots: { ...DEFAULT_ARRANGEMENT, extra: FIXTURE_MEDIA[1]!.key } }));
    await refused('/me/comp-card', card({ tagline: 'x'.repeat(81) }));
    await refused('/me/comp-card', { slots: DEFAULT_ARRANGEMENT });
  });

  it('a comp card needs a profile first (409), and an unsaved draft reads as the default arrangement', async () => {
    const fresh = (await resolveAccountForLogin(t.database.db, { provider: 'google', providerSubject: `http-toolkit-fresh-${randomUUID()}` })).id;
    const res = await call(t, 'POST', '/me/comp-card', asAccount(fresh), card());
    expect(res.status).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'profile_required' } });
    await call(t, 'POST', '/me/profile', asAccount(fresh), profile);
    const view = (await call(t, 'GET', '/me/comp-card', asAccount(fresh))).json() as { draft: Json; fixtures: Json[] };
    expect(view.draft).toEqual({ tagline: '', slots: DEFAULT_ARRANGEMENT, updatedAt: null });
    expect(view.fixtures.map((f) => f.key)).toEqual(FIXTURE_MEDIA.map((f) => f.key));
  });
});

describe('durability', () => {
  it('survives an application restart: a new app on the same database reads the same profile and draft', async () => {
    const owner = (await resolveAccountForLogin(t.database.db, { provider: 'google', providerSubject: `http-toolkit-restart-${randomUUID()}` })).id;
    await call(t, 'POST', '/me/profile', asAccount(owner), profile);
    const arranged = { ...DEFAULT_ARRANGEMENT, hero: 'beauty-natural-light', beauty: 'studio-portrait-slate' };
    await call(t, 'POST', '/me/comp-card', asAccount(owner), card({ tagline: 'Kept', slots: arranged }));

    const second = await withToolkit();
    try {
      const view = (await call(second, 'GET', '/me/comp-card', asAccount(owner))).json() as { profile: Json; draft: Json };
      expect(view.profile).toMatchObject(profile);
      expect(view.draft).toMatchObject({ tagline: 'Kept', slots: arranged });
    } finally {
      await second.close();
    }
  });
});

describe('the demo harness is not in the production application', () => {
  it('has no /demo/toolkit route', async () => {
    expect((await call(t, 'POST', '/demo/toolkit/owner', {}, { owner: 'a' })).status).toBe(404);
    expect((await call(t, 'GET', '/demo/toolkit/owner', {})).status).toBe(404);
    expect((await call(t, 'GET', '/media/fixtures/studio-portrait-warm.svg', {})).status).toBe(404);
  });
});
