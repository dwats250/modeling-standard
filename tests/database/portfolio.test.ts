import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { FIXTURE_KEYS } from '../../src/toolkit/fixture-media.ts';
import { findPortfolioForAccount, savePortfolioForAccount } from '../../src/toolkit/portfolio.ts';
import { ProfileRequiredError, saveProfileForAccount } from '../../src/toolkit/profile.ts';
import { PORTFOLIO_CAPTION_MAX, PORTFOLIO_MAX_ITEMS } from '../../src/toolkit/tables.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * B2 portfolio draft, against real PostgreSQL as the runtime role: one draft
 * per profile, the order kept as saved, owner-keyed data functions, and the
 * database's own limits (count, key shape, no repeats, no deletes, no owner
 * or time changes) even by direct SQL. B3 adds one optional caption per
 * item, kept beside its item (same position) and bounded by the database.
 */

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

const db = () => database.db;
const newAccount = () => resolveAccountForLogin(db(), { provider: 'google', providerSubject: `portfolio-${randomUUID()}` });
const withProfile = async () => {
  const acct = await newAccount();
  const profile = await saveProfileForAccount(db(), acct.id, { displayName: 'Portfolio Person', profession: '', biography: '' });
  return { accountId: acct.id, profileId: profile.id };
};
const keys = (n: number) => FIXTURE_KEYS.slice(0, n);
const key = (i: number) => FIXTURE_KEYS[i]!;

describe('data functions', () => {
  it('needs a profile, then keeps one draft per profile in the order saved', async () => {
    const acct = await newAccount();
    await expect(savePortfolioForAccount(db(), acct.id, keys(2))).rejects.toBeInstanceOf(ProfileRequiredError);
    expect(await findPortfolioForAccount(db(), acct.id)).toBeUndefined();

    await saveProfileForAccount(db(), acct.id, { displayName: 'P', profession: '', biography: '' });
    const order = [key(4), key(0), key(7)];
    expect((await savePortfolioForAccount(db(), acct.id, order)).items).toEqual(order);
    const reordered = [key(7), key(4)];
    await savePortfolioForAccount(db(), acct.id, reordered);
    expect((await findPortfolioForAccount(db(), acct.id))?.items).toEqual(reordered);
    const count = await withClient(inject('migrationUrl'), (c) =>
      c.query('select count(*)::int as n from portfolio_draft d join professional_profile p on p.id = d.profile_id where p.account_id = $1', [acct.id]),
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('keeps an empty draft and a full one', async () => {
    const { accountId } = await withProfile();
    const empty = await savePortfolioForAccount(db(), accountId, []);
    expect(empty.items).toEqual([]);
    expect((await findPortfolioForAccount(db(), accountId))?.items).toEqual([]);
    expect((await savePortfolioForAccount(db(), accountId, keys(PORTFOLIO_MAX_ITEMS))).items).toEqual(keys(PORTFOLIO_MAX_ITEMS));
  });

  it('keeps a caption beside its item through reorder and removal (B3)', async () => {
    const { accountId } = await withProfile();
    const saved = await savePortfolioForAccount(db(), accountId, [key(2), key(5), key(7)], ['Second', '', 'Seventh']);
    expect(saved.captions).toEqual(['Second', '', 'Seventh']);
    // Without captions given, every caption is blank.
    expect((await savePortfolioForAccount(db(), accountId, [key(1)])).captions).toEqual(['']);
    await savePortfolioForAccount(db(), accountId, [key(7), key(2)], ['Seventh', 'Second']);
    expect(await findPortfolioForAccount(db(), accountId)).toMatchObject({ items: [key(7), key(2)], captions: ['Seventh', 'Second'] });
    expect((await savePortfolioForAccount(db(), accountId, [], [])).captions).toEqual([]);
  });

  it('never reaches another account’s draft', async () => {
    const a = await withProfile();
    const b = await withProfile();
    await savePortfolioForAccount(db(), a.accountId, keys(3));
    expect(await findPortfolioForAccount(db(), b.accountId)).toBeUndefined();
    await savePortfolioForAccount(db(), b.accountId, [key(9)]);
    expect((await findPortfolioForAccount(db(), a.accountId))?.items).toEqual(keys(3));
  });
});

describe('database guards (runtime role, direct SQL)', () => {
  it('refuses more than the maximum, repeats, non-key items, NULL items and a non-list array', async () => {
    const { profileId } = await withProfile();
    await withClient(inject('runtimeUrl'), async (c) => {
      // Blank captions, one per item, so these refusals are about the items (B3 keeps the pair aligned).
      const insert = (items: unknown) =>
        sqlErrorCode(c, `insert into portfolio_draft (profile_id, items, captions) values ($1, $2::text[], array_fill(''::text, ARRAY[cardinality($2::text[])]))`, [profileId, items]);
      expect(await insert([...FIXTURE_KEYS.slice(0, PORTFOLIO_MAX_ITEMS), key(PORTFOLIO_MAX_ITEMS)])).toBe(CHECK_VIOLATION);
      expect(await insert([key(0), key(1), key(0)])).toBe(CHECK_VIOLATION);
      for (const bad of ['Not A Key', '../../etc/passwd', '', 'https://example.com/x.jpg', 'a,b', 'x'.repeat(41)]) {
        expect({ bad, code: await insert([key(0), bad]) }).toEqual({ bad, code: CHECK_VIOLATION });
      }
      expect(await insert([key(0), null])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, `insert into portfolio_draft (profile_id, items) values ($1, '{{a,b},{c,d}}')`, [profileId])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, `insert into portfolio_draft (profile_id, items) values ($1, '[0:1]={a,b}')`, [profileId])).toBe(CHECK_VIOLATION);
      // Nothing above was written; a valid list still is.
      expect(await insert(keys(PORTFOLIO_MAX_ITEMS))).toBeNull();
      expect(await sqlErrorCode(c, 'update portfolio_draft set items = $1::text[], captions = $2::text[] where profile_id = $3', [[key(2), key(2)], ['', ''], profileId])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, 'insert into portfolio_draft (profile_id, items) values ($1, $2::text[])', [profileId, []])).toBe('23505');
    });
  });

  it('refuses captions that do not match the items one to one, NULL captions and overlong captions (B3)', async () => {
    const { profileId } = await withProfile();
    await withClient(inject('runtimeUrl'), async (c) => {
      const insert = (items: unknown, captions: unknown) =>
        sqlErrorCode(c, 'insert into portfolio_draft (profile_id, items, captions) values ($1, $2::text[], $3::text[])', [profileId, items, captions]);
      expect(await insert([key(0), key(1)], ['one'])).toBe(CHECK_VIOLATION);
      expect(await insert([key(0)], ['one', 'two'])).toBe(CHECK_VIOLATION);
      expect(await insert([], ['stray'])).toBe(CHECK_VIOLATION);
      expect(await insert([key(0)], [null])).toBe(CHECK_VIOLATION);
      expect(await insert([key(0)], ['x'.repeat(PORTFOLIO_CAPTION_MAX + 1)])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, `insert into portfolio_draft (profile_id, items, captions) values ($1, '{a}', '{{a},{b}}')`, [profileId])).toBe(CHECK_VIOLATION);
      // Nothing above was written; blank, short and maximum-length captions are kept.
      expect(await insert([key(0), key(1), key(2)], ['', 'short', 'y'.repeat(PORTFOLIO_CAPTION_MAX)])).toBeNull();
      // Changing the items alone leaves the pair misaligned; the write is refused.
      expect(await sqlErrorCode(c, 'update portfolio_draft set items = $1::text[] where profile_id = $2', [[key(0)], profileId])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, 'update portfolio_draft set items = $1::text[], captions = $2::text[] where profile_id = $3', [[key(0)], ['only'], profileId])).toBeNull();
      expect(await sqlErrorCode(c, 'update portfolio_draft set captions = $1::text[] where profile_id = $2', [['x'.repeat(PORTFOLIO_CAPTION_MAX + 1)], profileId])).toBe(CHECK_VIOLATION);
      const row = await c.query<{ captions: string[] }>('select captions from portfolio_draft where profile_id = $1', [profileId]);
      expect(row.rows[0]!.captions).toEqual(['only']);
    });
  });

  it('sets time from the database and refuses deletes, owner changes and time changes', async () => {
    const { accountId, profileId } = await withProfile();
    const other = await withProfile();
    await withClient(inject('runtimeUrl'), async (c) => {
      const inserted = await c.query<{ created_at: Date; updated_at: Date }>(
        `insert into portfolio_draft (profile_id, items, created_at, updated_at) values ($1, '{}', '2000-01-01', '2000-01-01') returning created_at, updated_at`,
        [profileId],
      );
      expect(inserted.rows[0]!.created_at.getFullYear()).toBeGreaterThan(2020);
      expect(inserted.rows[0]!.updated_at.getFullYear()).toBeGreaterThan(2020);
      expect(await sqlErrorCode(c, 'delete from portfolio_draft where profile_id = $1', [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update portfolio_draft set profile_id = $1 where profile_id = $2', [other.profileId, profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update portfolio_draft set created_at = now() where profile_id = $1', [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update portfolio_draft set updated_at = now() where profile_id = $1', [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate portfolio_draft')).toBe(INSUFFICIENT_PRIVILEGE);
      const before = await c.query<{ created_at: Date }>('select created_at from portfolio_draft where profile_id = $1', [profileId]);
      await c.query('update portfolio_draft set items = $1::text[], captions = $2::text[] where profile_id = $3', [keys(2), ['', ''], profileId]);
      const after = await c.query<{ created_at: Date; updated_at: Date }>('select created_at, updated_at from portfolio_draft where profile_id = $1', [profileId]);
      expect(after.rows[0]!.created_at).toEqual(before.rows[0]!.created_at);
      expect(after.rows[0]!.updated_at.getTime()).toBeGreaterThanOrEqual(before.rows[0]!.created_at.getTime());
    });
    expect((await findPortfolioForAccount(db(), accountId))?.items).toEqual(keys(2));
  });

  it('the maximum is below the catalogue size, so the limit is a real one', () => {
    expect(FIXTURE_KEYS.length).toBeGreaterThan(PORTFOLIO_MAX_ITEMS);
    expect(PORTFOLIO_CAPTION_MAX).toBe(120);
  });
});
