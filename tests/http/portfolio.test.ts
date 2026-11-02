import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import type { ResolvePrincipal } from '../../src/authorization/access.ts';
import { FIXTURE_KEYS } from '../../src/toolkit/fixture-media.ts';
import { toolkitOperations } from '../../src/toolkit/operations.ts';
import { PORTFOLIO_CAPTION_MAX, PORTFOLIO_MAX_ITEMS } from '../../src/toolkit/tables.ts';
import { PRINCIPAL_HEADER, startTestApp, type TestApp } from '../support/app.ts';

/**
 * B2 portfolio draft through the real application boundary, with the toolkit
 * operations added as only the local demo adds them (production has none:
 * tests/http/toolkit.test.ts). Owner-only with the owner taken from the
 * principal; strict input; the order kept; empty and full drafts; no ids in
 * any response; durability across an application restart. B3: one optional
 * plain-text caption per selected image, keyed by its fixture key.
 *
 * Principals as in tests/http/toolkit.test.ts: `x-test-account` is a
 * signed-in account, `x-test-principal` a synthetic one.
 */

const ACCOUNT_HEADER = 'x-test-account';
const resolve: ResolvePrincipal = (request) => {
  const acct = request.headers[ACCOUNT_HEADER];
  if (typeof acct === 'string' && acct.length > 0) return { id: acct, kind: 'account' };
  const synthetic = request.headers[PRINCIPAL_HEADER];
  return typeof synthetic === 'string' && synthetic.length > 0 ? { id: synthetic, kind: 'synthetic' } : null;
};
const start = () => startTestApp({ resolvePrincipal: resolve, additionalOperations: toolkitOperations });

let t: TestApp;
beforeAll(async () => {
  t = await start();
});
afterAll(async () => {
  await t.close();
});

type Json = Record<string, unknown>;
interface View {
  profile: Json | null;
  draft: { items: string[]; captions: Record<string, string>; updatedAt: string | null };
  maxItems: number;
  maxCaptionLength: number;
  fixtures: { key: string; label: string }[];
}
async function call(app: TestApp, method: 'GET' | 'POST', url: string, as: Record<string, string>, payload?: unknown) {
  const res = await app.app.inject({ method, url, headers: as, ...(payload === undefined ? {} : { payload: payload as Json }) });
  return { status: res.statusCode, body: res.body, json: <T = View>() => res.json<T>() };
}
const asAccount = (id: string) => ({ [ACCOUNT_HEADER]: id });
const newOwner = async (name?: string) => {
  const id = (await resolveAccountForLogin(t.database.db, { provider: 'google', providerSubject: `http-portfolio-${randomUUID()}` })).id;
  if (name) expect((await call(t, 'POST', '/me/profile', asAccount(id), { displayName: name, profession: 'Model', biography: '' })).status).toBe(200);
  return id;
};
const keys = (...indexes: number[]) => indexes.map((i) => FIXTURE_KEYS[i]!);

describe('access', () => {
  it('refuses no principal (401) and a synthetic principal (generic 404), writing nothing', async () => {
    const owner = await newOwner('Owner');
    expect((await call(t, 'GET', '/me/portfolio', {})).status).toBe(401);
    expect((await call(t, 'POST', '/me/portfolio', {}, { items: [] })).status).toBe(401);
    const synthetic = { [PRINCIPAL_HEADER]: owner };
    for (const [method, payload] of [['GET', undefined], ['POST', { items: keys(0) }]] as const) {
      const res = await call(t, method, '/me/portfolio', synthetic, payload);
      expect(res.status).toBe(404);
      expect(res.json<Json>()).toEqual({ error: { code: 'not_found', requestId: expect.any(String) } });
    }
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toEqual({ items: [], captions: {}, updatedAt: null });
  });

  it('owner B cannot read or change owner A’s draft, by any body or query', async () => {
    const a = await newOwner('Amara Okafor');
    const b = await newOwner('Jun Park');
    expect((await call(t, 'POST', '/me/portfolio', asAccount(a), { items: keys(3, 1, 5) })).status).toBe(200);
    const bView = (await call(t, 'GET', '/me/portfolio', asAccount(b))).json();
    expect(bView.draft).toEqual({ items: [], captions: {}, updatedAt: null });
    expect(bView.profile).toMatchObject({ displayName: 'Jun Park' });
    expect(JSON.stringify(bView)).not.toContain('Amara');

    for (const [url, payload] of [
      ['/me/portfolio', { items: keys(0), accountId: a }],
      ['/me/portfolio', { items: keys(0), profileId: randomUUID() }],
      ['/me/portfolio', { items: keys(0), owner: 'a' }],
      [`/me/portfolio?accountId=${a}`, { items: keys(0) }],
    ] as const) {
      expect((await call(t, 'POST', url, asAccount(b), payload)).status, url).toBe(400);
    }
    expect((await call(t, 'GET', `/me/portfolio?owner=a`, asAccount(b))).status).toBe(400);
    expect((await call(t, 'GET', `/me/portfolio/${a}`, asAccount(b))).status).toBe(404);

    expect((await call(t, 'POST', '/me/portfolio', asAccount(b), { items: keys(9) })).status).toBe(200);
    expect((await call(t, 'GET', '/me/portfolio', asAccount(a))).json().draft.items).toEqual(keys(3, 1, 5));
    expect((await call(t, 'GET', '/me/portfolio', asAccount(b))).json().draft.items).toEqual(keys(9));
  });

  it('never returns an id or an owner', async () => {
    const owner = await newOwner('No Ids');
    await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: keys(0, 1) });
    for (const method of ['GET', 'POST'] as const) {
      const body = (await call(t, method, '/me/portfolio', asAccount(owner), method === 'POST' ? { items: keys(1, 0) } : undefined)).body;
      expect(body).not.toContain(owner);
      expect(body).not.toMatch(/"(id|accountId|profileId)"/);
    }
  });
});

describe('the draft', () => {
  it('needs a profile first (409); an unsaved draft reads as empty', async () => {
    const owner = await newOwner();
    const res = await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: keys(0) });
    expect(res.status).toBe(409);
    expect(res.json<Json>()).toMatchObject({ error: { code: 'profile_required' } });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json()).toEqual({
      profile: null,
      draft: { items: [], captions: {}, updatedAt: null },
      maxItems: PORTFOLIO_MAX_ITEMS,
      maxCaptionLength: PORTFOLIO_CAPTION_MAX,
      fixtures: expect.any(Array),
    });
  });

  it('keeps the order saved, through select, remove and reorder', async () => {
    const owner = await newOwner('Order Keeper');
    const view = (await call(t, 'GET', '/me/portfolio', asAccount(owner))).json();
    expect(view.maxItems).toBe(PORTFOLIO_MAX_ITEMS);
    expect(view.fixtures.map((f) => f.key)).toEqual(FIXTURE_KEYS);

    const first = await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: keys(2, 0, 7, 4) });
    expect(first.status).toBe(200);
    expect(first.json().draft).toEqual({ items: keys(2, 0, 7, 4), captions: {}, updatedAt: expect.any(String) });
    // Remove one, move the last to the front.
    await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: keys(4, 2, 7) });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft.items).toEqual(keys(4, 2, 7));
  });

  it('saves an empty draft and a full one', async () => {
    const owner = await newOwner('Edges');
    const empty = await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: [] });
    expect(empty.status).toBe(200);
    expect(empty.json().draft).toEqual({ items: [], captions: {}, updatedAt: expect.any(String) });
    const full = FIXTURE_KEYS.slice(0, PORTFOLIO_MAX_ITEMS);
    expect((await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: full })).json().draft.items).toEqual(full);
  });

  it('refuses unknown, malformed or repeated keys, too many items and unknown fields, changing nothing', async () => {
    const owner = await newOwner('Strict');
    await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: keys(0, 1) });
    const before = (await call(t, 'GET', '/me/portfolio', asAccount(owner))).json();
    for (const payload of [
      { items: [...keys(0), 'not-a-fixture'] },
      { items: ['https://example.com/me.jpg'] },
      { items: ['../media/fixtures/x.svg'] },
      { items: [FIXTURE_KEYS[0].toUpperCase()] },
      { items: [''] },
      { items: [null] },
      { items: [42] },
      { items: keys(0, 1, 0) },
      { items: FIXTURE_KEYS.slice(0, PORTFOLIO_MAX_ITEMS + 1) },
      { items: [{ key: FIXTURE_KEYS[0] }] },
      { items: FIXTURE_KEYS[0] },
      { items: keys(0), caption: 'Hello' },
      // B3: captions only for selected keys, as plain one-line text within the limit
      { items: keys(0), captions: { [FIXTURE_KEYS[1]!]: 'Not selected' } },
      { items: keys(0), captions: { 'not-a-fixture': 'Unknown' } },
      { items: keys(0), captions: { [FIXTURE_KEYS[0]]: 'x'.repeat(PORTFOLIO_CAPTION_MAX + 1) } },
      { items: keys(0), captions: { [FIXTURE_KEYS[0]]: 'two\nlines' } },
      { items: keys(0), captions: { [FIXTURE_KEYS[0]]: 42 } },
      { items: keys(0), captions: { [FIXTURE_KEYS[0]]: null } },
      { items: keys(0), captions: { [FIXTURE_KEYS[0]]: { text: 'Hi' } } },
      { items: keys(0), captions: ['Hello'] },
      { items: keys(0), captions: 'Hello' },
      { items: keys(0), captions: null },
      { items: [], captions: { [FIXTURE_KEYS[0]]: 'Nothing selected' } },
      { items: keys(0), public: true },
      {},
    ]) {
      const res = await call(t, 'POST', '/me/portfolio', asAccount(owner), payload);
      expect({ payload, status: res.status }).toEqual({ payload, status: 400 });
      expect(res.json<Json>()).toMatchObject({ error: { code: 'invalid_input' } });
    }
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json()).toEqual(before);
  });

  it('keeps a caption with its image: set, edit, clear, reorder, remove and re-add (B3)', async () => {
    const owner = await newOwner('Captioner');
    const [a, b, c] = keys(1, 4, 6);
    const set = (items: string[], captions: Record<string, string>) => call(t, 'POST', '/me/portfolio', asAccount(owner), { items, captions });
    // Set two; the blank third is omitted. Surrounding space is trimmed.
    let res = await set([a!, b!, c!], { [a!]: '  On set, early morning ', [b!]: '', [c!]: 'Studio' });
    expect(res.status).toBe(200);
    expect(res.json().draft.captions).toEqual({ [a!]: 'On set, early morning', [c!]: 'Studio' });
    // Reorder: each caption stays with its key.
    res = await set([c!, a!, b!], { [a!]: 'On set, early morning', [c!]: 'Studio' });
    expect(res.json().draft).toMatchObject({ items: [c, a, b], captions: { [a!]: 'On set, early morning', [c!]: 'Studio' } });
    // Edit one, clear one by omission, and one at exactly the limit.
    const longest = 'y'.repeat(PORTFOLIO_CAPTION_MAX);
    res = await set([c!, a!, b!], { [a!]: 'Edited', [b!]: longest });
    expect(res.json().draft.captions).toEqual({ [a!]: 'Edited', [b!]: longest });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft.captions).toEqual({ [a!]: 'Edited', [b!]: longest });
    // Remove an image: its caption goes; adding it again starts blank.
    res = await set([c!, b!], { [b!]: longest });
    expect(res.json().draft).toMatchObject({ items: [c, b], captions: { [b!]: longest } });
    res = await set([c!, b!, a!], { [b!]: longest });
    expect(res.json().draft.captions).toEqual({ [b!]: longest });
    // Captions are optional; omitted, every caption is cleared. Markup stays text.
    res = await set([c!, b!, a!], { [c!]: '<b>Bold</b> & "quoted"' });
    expect(res.json().draft.captions).toEqual({ [c!]: '<b>Bold</b> & "quoted"' });
    res = await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: [c!, b!] });
    expect(res.status).toBe(200);
    expect(res.json().draft).toEqual({ items: [c, b], captions: {}, updatedAt: expect.any(String) });
  });

  it('owner B cannot read or change owner A’s captions (B3)', async () => {
    const a = await newOwner('Caption A');
    const b = await newOwner('Caption B');
    await call(t, 'POST', '/me/portfolio', asAccount(a), { items: keys(2), captions: { [FIXTURE_KEYS[2]!]: 'Private to A' } });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(b))).body).not.toContain('Private to A');
    expect((await call(t, 'POST', '/me/portfolio', asAccount(b), { items: keys(2), captions: { [FIXTURE_KEYS[2]!]: 'B wrote this' }, accountId: a })).status).toBe(400);
    await call(t, 'POST', '/me/portfolio', asAccount(b), { items: keys(2), captions: { [FIXTURE_KEYS[2]!]: 'B wrote this' } });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(a))).json().draft.captions).toEqual({ [FIXTURE_KEYS[2]!]: 'Private to A' });
  });

  it('survives an application restart', async () => {
    const owner = await newOwner('Restart');
    await call(t, 'POST', '/me/portfolio', asAccount(owner), { items: keys(6, 3, 8), captions: { [FIXTURE_KEYS[3]!]: 'Kept' } });
    const second = await start();
    try {
      expect((await call(second, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toEqual({ items: keys(6, 3, 8), captions: { [FIXTURE_KEYS[3]!]: 'Kept' }, updatedAt: expect.any(String) });
    } finally {
      await second.close();
    }
  });
});
