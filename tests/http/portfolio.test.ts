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
 * plain-text caption per selected image, keyed by its fixture key. B4: every
 * save names the revision it was based on; a stale one is a generic 409 with
 * nothing written and nothing revealed.
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
  draft: { items: string[]; captions: Record<string, string>; revision: number; updatedAt: string | null };
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
type Reply = Awaited<ReturnType<typeof call>>;
const revisionOf = async (owner: string): Promise<number> => (await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft.revision;
/** Saves on top of the revision the owner would see now (B4); the B4 cases below name revisions explicitly. */
const post = async (owner: string, payload: Json): Promise<Reply> => call(t, 'POST', '/me/portfolio', asAccount(owner), { expectedRevision: await revisionOf(owner), ...payload });

describe('access', () => {
  it('refuses no principal (401) and a synthetic principal (generic 404), writing nothing', async () => {
    const owner = await newOwner('Owner');
    expect((await call(t, 'GET', '/me/portfolio', {})).status).toBe(401);
    expect((await call(t, 'POST', '/me/portfolio', {}, { items: [], expectedRevision: 0 })).status).toBe(401);
    const synthetic = { [PRINCIPAL_HEADER]: owner };
    for (const [method, payload] of [['GET', undefined], ['POST', { items: keys(0), expectedRevision: 0 }]] as const) {
      const res = await call(t, method, '/me/portfolio', synthetic, payload);
      expect(res.status).toBe(404);
      expect(res.json<Json>()).toEqual({ error: { code: 'not_found', requestId: expect.any(String) } });
    }
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toEqual({ items: [], captions: {}, revision: 0, updatedAt: null });
  });

  it('owner B cannot read or change owner A’s draft, by any body or query', async () => {
    const a = await newOwner('Amara Okafor');
    const b = await newOwner('Jun Park');
    expect((await post(a, { items: keys(3, 1, 5) })).status).toBe(200);
    const bView = (await call(t, 'GET', '/me/portfolio', asAccount(b))).json();
    expect(bView.draft).toEqual({ items: [], captions: {}, revision: 0, updatedAt: null });
    expect(bView.profile).toMatchObject({ displayName: 'Jun Park' });
    expect(JSON.stringify(bView)).not.toContain('Amara');

    for (const [url, payload] of [
      ['/me/portfolio', { items: keys(0), accountId: a }],
      ['/me/portfolio', { items: keys(0), profileId: randomUUID() }],
      ['/me/portfolio', { items: keys(0), owner: 'a' }],
      [`/me/portfolio?accountId=${a}`, { items: keys(0) }],
    ] as const) {
      expect((await call(t, 'POST', url, asAccount(b), { expectedRevision: 0, ...payload })).status, url).toBe(400);
    }
    expect((await call(t, 'GET', `/me/portfolio?owner=a`, asAccount(b))).status).toBe(400);
    expect((await call(t, 'GET', `/me/portfolio/${a}`, asAccount(b))).status).toBe(404);

    expect((await post(b, { items: keys(9) })).status).toBe(200);
    expect((await call(t, 'GET', '/me/portfolio', asAccount(a))).json().draft.items).toEqual(keys(3, 1, 5));
    expect((await call(t, 'GET', '/me/portfolio', asAccount(b))).json().draft.items).toEqual(keys(9));
  });

  it('never returns an id or an owner', async () => {
    const owner = await newOwner('No Ids');
    await post(owner, { items: keys(0, 1) });
    for (const method of ['GET', 'POST'] as const) {
      const body = (await call(t, method, '/me/portfolio', asAccount(owner), method === 'POST' ? { items: keys(1, 0), expectedRevision: await revisionOf(owner) } : undefined)).body;
      expect(body).not.toContain(owner);
      expect(body).not.toMatch(/"(id|accountId|profileId)"/);
    }
  });
});

describe('the draft', () => {
  it('needs a profile first (409); an unsaved draft reads as empty', async () => {
    const owner = await newOwner();
    const res = await post(owner, { items: keys(0) });
    expect(res.status).toBe(409);
    expect(res.json<Json>()).toMatchObject({ error: { code: 'profile_required' } });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json()).toEqual({
      profile: null,
      draft: { items: [], captions: {}, revision: 0, updatedAt: null },
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

    const first = await post(owner, { items: keys(2, 0, 7, 4) });
    expect(first.status).toBe(200);
    expect(first.json().draft).toEqual({ items: keys(2, 0, 7, 4), captions: {}, revision: 1, updatedAt: expect.any(String) });
    // Remove one, move the last to the front.
    await post(owner, { items: keys(4, 2, 7) });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft.items).toEqual(keys(4, 2, 7));
  });

  it('saves an empty draft and a full one', async () => {
    const owner = await newOwner('Edges');
    const empty = await post(owner, { items: [] });
    expect(empty.status).toBe(200);
    expect(empty.json().draft).toEqual({ items: [], captions: {}, revision: 1, updatedAt: expect.any(String) });
    const full = FIXTURE_KEYS.slice(0, PORTFOLIO_MAX_ITEMS);
    expect((await post(owner, { items: full })).json().draft.items).toEqual(full);
  });

  it('refuses unknown, malformed or repeated keys, too many items and unknown fields, changing nothing', async () => {
    const owner = await newOwner('Strict');
    await post(owner, { items: keys(0, 1) });
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
      const res = await post(owner, payload);
      expect({ payload, status: res.status }).toEqual({ payload, status: 400 });
      expect(res.json<Json>()).toMatchObject({ error: { code: 'invalid_input' } });
    }
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json()).toEqual(before);
  });

  it('keeps a caption with its image: set, edit, clear, reorder, remove and re-add (B3)', async () => {
    const owner = await newOwner('Captioner');
    const [a, b, c] = keys(1, 4, 6);
    const set = (items: string[], captions: Record<string, string>) => post(owner, { items, captions });
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
    res = await post(owner, { items: [c!, b!] });
    expect(res.status).toBe(200);
    expect(res.json().draft).toEqual({ items: [c, b], captions: {}, revision: expect.any(Number), updatedAt: expect.any(String) });
  });

  it('owner B cannot read or change owner A’s captions (B3)', async () => {
    const a = await newOwner('Caption A');
    const b = await newOwner('Caption B');
    await post(a, { items: keys(2), captions: { [FIXTURE_KEYS[2]!]: 'Private to A' } });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(b))).body).not.toContain('Private to A');
    expect((await post(b, { items: keys(2), captions: { [FIXTURE_KEYS[2]!]: 'B wrote this' }, accountId: a })).status).toBe(400);
    await post(b, { items: keys(2), captions: { [FIXTURE_KEYS[2]!]: 'B wrote this' } });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(a))).json().draft.captions).toEqual({ [FIXTURE_KEYS[2]!]: 'Private to A' });
  });

  it('survives an application restart', async () => {
    const owner = await newOwner('Restart');
    await post(owner, { items: keys(6, 3, 8), captions: { [FIXTURE_KEYS[3]!]: 'Kept' } });
    const second = await start();
    try {
      expect((await call(second, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toEqual({ items: keys(6, 3, 8), captions: { [FIXTURE_KEYS[3]!]: 'Kept' }, revision: 1, updatedAt: expect.any(String) });
    } finally {
      await second.close();
    }
  });
});

describe('stale-save protection (B4)', () => {
  const write = (owner: string, expectedRevision: unknown, items: string[], captions: Record<string, string> = {}) =>
    call(t, 'POST', '/me/portfolio', asAccount(owner), { items, captions, expectedRevision });
  const expectStale = async (res: Reply) => {
    expect(res.status).toBe(409);
    expect(res.json<Json>()).toEqual({ error: { code: 'stale_revision', requestId: expect.any(String) } });
  };

  it('issues a revision on GET, needs it on POST, and moves it on by one per save', async () => {
    const owner = await newOwner('Revisions');
    expect(await revisionOf(owner)).toBe(0);
    const first = await write(owner, 0, keys(1));
    expect(first.status).toBe(200);
    expect(first.json().draft.revision).toBe(1);
    expect(await revisionOf(owner)).toBe(1);
    const second = await write(owner, 1, keys(1, 2), { [FIXTURE_KEYS[2]!]: 'Second' });
    expect(second.json().draft).toMatchObject({ items: keys(1, 2), revision: 2 });
    // An unchanged save is still a save: a new revision.
    expect((await write(owner, 2, keys(1, 2), { [FIXTURE_KEYS[2]!]: 'Second' })).json().draft.revision).toBe(3);
    expect(await revisionOf(owner)).toBe(3);
  });

  it('refuses a stale revision with a generic 409: nothing written, no draft data, no revision in the answer', async () => {
    const owner = await newOwner('Two Tabs');
    // Two tabs read the draft at revision 1.
    await write(owner, 0, keys(0), { [FIXTURE_KEYS[0]]: 'Original' });
    const tabA = (await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft;
    const tabB = (await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft;
    expect(tabA.revision).toBe(1);
    expect(tabB.revision).toBe(1);
    // Tab B saves first.
    expect((await write(owner, tabB.revision, keys(0, 5), { [FIXTURE_KEYS[5]!]: 'From tab B' })).status).toBe(200);
    // Tab A's save, based on revision 1, is refused and reveals nothing of tab B's draft.
    const stale = await write(owner, tabA.revision, keys(0, 7), { [FIXTURE_KEYS[0]]: 'From tab A' });
    await expectStale(stale);
    expect(stale.body).not.toMatch(/"(draft|items|captions|revision|updatedAt)"|From tab/);
    expect(stale.body).not.toContain(FIXTURE_KEYS[5]!);
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toEqual({
      items: keys(0, 5),
      captions: { [FIXTURE_KEYS[5]!]: 'From tab B' },
      revision: 2,
      updatedAt: expect.any(String),
    });
    // Ahead of the draft, or stale by more than one: the same answer.
    await expectStale(await write(owner, 3, keys(0)));
    await expectStale(await write(owner, 0, keys(0)));
    await expectStale(await write(owner, 2_147_483_647, keys(0)));
    expect(await revisionOf(owner)).toBe(2);
    // A fresh read, then the save lands.
    expect((await write(owner, 2, keys(0, 7), { [FIXTURE_KEYS[0]]: 'From tab A' })).json().draft).toMatchObject({ items: keys(0, 7), revision: 3 });
  });

  it('with no draft yet, a "first save" that finds one there is stale, and a save naming a revision is stale too', async () => {
    const owner = await newOwner('First Save');
    await expectStale(await write(owner, 1, keys(0)));
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toEqual({ items: [], captions: {}, revision: 0, updatedAt: null });
    expect((await write(owner, 0, keys(0))).status).toBe(200);
    await expectStale(await write(owner, 0, keys(1)));
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toMatchObject({ items: keys(0), revision: 1 });
  });

  it('of simultaneous first saves exactly one lands; of competing updates on one revision exactly one lands', async () => {
    const owner = await newOwner('Race');
    const firsts = await Promise.all([0, 1, 2, 3, 4].map((i) => write(owner, 0, keys(i))));
    expect(firsts.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
    const winner = firsts.find((r) => r.status === 200)!.json().draft;
    expect(winner.revision).toBe(1);
    for (const lost of firsts.filter((r) => r.status === 409)) await expectStale(lost);
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toMatchObject({ items: winner.items, revision: 1 });

    const updates = await Promise.all([5, 6, 7, 8].map((i) => write(owner, 1, keys(i))));
    expect(updates.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    const landed = updates.find((r) => r.status === 200)!.json().draft;
    expect(landed.revision).toBe(2);
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json().draft).toMatchObject({ items: landed.items, revision: 2 });
  });

  it('refuses a missing or malformed expectedRevision as input (400), changing nothing', async () => {
    const owner = await newOwner('Malformed');
    await write(owner, 0, keys(2));
    const before = (await call(t, 'GET', '/me/portfolio', asAccount(owner))).json();
    for (const expectedRevision of [undefined, null, -1, 1.5, '1', '', 'latest', true, [1], { revision: 1 }, 2_147_483_648, Number.MAX_SAFE_INTEGER]) {
      const payload: Json = expectedRevision === undefined ? { items: keys(3) } : { items: keys(3), expectedRevision };
      const res = await call(t, 'POST', '/me/portfolio', asAccount(owner), payload);
      expect({ expectedRevision, status: res.status }).toEqual({ expectedRevision, status: 400 });
      expect(res.json<Json>()).toMatchObject({ error: { code: 'invalid_input' } });
    }
    // Naming the revision by another spelling is refused as an unknown field.
    for (const payload of [{ items: keys(3), revision: 1 }, { items: keys(3), expectedRevision: 1, revision: 1 }, { items: keys(3), expectedRevision: 1, force: true }]) {
      expect((await call(t, 'POST', '/me/portfolio', asAccount(owner), payload)).status).toBe(400);
    }
    expect((await call(t, 'GET', '/me/portfolio', asAccount(owner))).json()).toEqual(before);
  });

  it('keeps owner A’s and owner B’s revisions apart: B’s saves never make A’s stale, and A’s revision cannot be used by B', async () => {
    const a = await newOwner('Rev A');
    const b = await newOwner('Rev B');
    await write(a, 0, keys(1));
    await write(a, 1, keys(1, 2));
    expect(await revisionOf(a)).toBe(2);
    expect(await revisionOf(b)).toBe(0);
    // B at revision 2 is stale for B (no draft), whatever A's revision is.
    await expectStale(await write(b, 2, keys(9)));
    expect((await write(b, 0, keys(9))).json().draft.revision).toBe(1);
    // B's saves do not move A on; A's next save is not stale.
    expect((await write(b, 1, keys(9, 8))).status).toBe(200);
    expect(await revisionOf(a)).toBe(2);
    expect((await write(a, 2, keys(2))).json().draft).toMatchObject({ items: keys(2), revision: 3 });
    expect((await call(t, 'GET', '/me/portfolio', asAccount(b))).json().draft).toMatchObject({ items: keys(9, 8), revision: 2 });
    // A stale answer to B names nothing of A.
    const stale = await write(b, 7, keys(0), { [FIXTURE_KEYS[0]]: 'B' });
    await expectStale(stale);
    expect(stale.body).not.toContain(a);
  });

  it('keeps the revision across a reload and an application restart: a save based on it still lands, an older one still does not', async () => {
    const owner = await newOwner('Restart Rev');
    await write(owner, 0, keys(4));
    await write(owner, 1, keys(4, 5));
    const second = await start();
    try {
      const reread = (await call(second, 'GET', '/me/portfolio', asAccount(owner))).json().draft;
      expect(reread).toMatchObject({ items: keys(4, 5), revision: 2 });
      await expectStale(await call(second, 'POST', '/me/portfolio', asAccount(owner), { items: keys(4), expectedRevision: 1 }));
      expect((await call(second, 'POST', '/me/portfolio', asAccount(owner), { items: keys(4), expectedRevision: reread.revision })).json().draft.revision).toBe(3);
    } finally {
      await second.close();
    }
    expect(await revisionOf(owner)).toBe(3);
  });
});
