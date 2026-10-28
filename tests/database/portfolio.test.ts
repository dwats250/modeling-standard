import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { FIXTURE_KEYS } from '../../src/toolkit/fixture-media.ts';
import { StaleRevisionError, UNSAVED_REVISION, findPortfolioForAccount, savePortfolioForAccount } from '../../src/toolkit/portfolio.ts';
import { ProfileRequiredError, saveProfileForAccount } from '../../src/toolkit/profile.ts';
import { PORTFOLIO_CAPTION_MAX, PORTFOLIO_MAX_ITEMS } from '../../src/toolkit/tables.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * B2 portfolio draft, against real PostgreSQL as the runtime role: one draft
 * per profile, the order kept as saved, owner-keyed data functions, and the
 * database's own limits (count, key shape, no repeats, no deletes, no owner
 * or time changes) even by direct SQL. B3 adds one optional caption per
 * item, kept beside its item (same position) and bounded by the database.
 * B4 adds the save revision: set by the database alone, compared and
 * written in one statement, so a stale save and all but one of any
 * simultaneous saves change nothing.
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
/** Saves on top of whatever is saved now (the sequential cases; B4's own cases name revisions explicitly). */
const save = async (accountId: string, items: readonly string[], captions?: readonly string[]) =>
  savePortfolioForAccount(db(), accountId, { items, ...(captions ? { captions } : {}), expectedRevision: (await findPortfolioForAccount(db(), accountId))?.revision ?? UNSAVED_REVISION });

describe('data functions', () => {
  it('needs a profile, then keeps one draft per profile in the order saved', async () => {
    const acct = await newAccount();
    await expect(save(acct.id, keys(2))).rejects.toBeInstanceOf(ProfileRequiredError);
    expect(await findPortfolioForAccount(db(), acct.id)).toBeUndefined();

    await saveProfileForAccount(db(), acct.id, { displayName: 'P', profession: '', biography: '' });
    const order = [key(4), key(0), key(7)];
    expect((await save(acct.id, order)).items).toEqual(order);
    const reordered = [key(7), key(4)];
    await save(acct.id, reordered);
    expect((await findPortfolioForAccount(db(), acct.id))?.items).toEqual(reordered);
    const count = await withClient(inject('migrationUrl'), (c) =>
      c.query('select count(*)::int as n from portfolio_draft d join professional_profile p on p.id = d.profile_id where p.account_id = $1', [acct.id]),
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('keeps an empty draft and a full one', async () => {
    const { accountId } = await withProfile();
    const empty = await save(accountId, []);
    expect(empty.items).toEqual([]);
    expect((await findPortfolioForAccount(db(), accountId))?.items).toEqual([]);
    expect((await save(accountId, keys(PORTFOLIO_MAX_ITEMS))).items).toEqual(keys(PORTFOLIO_MAX_ITEMS));
  });

  it('keeps a caption beside its item through reorder and removal (B3)', async () => {
    const { accountId } = await withProfile();
    const saved = await save(accountId, [key(2), key(5), key(7)], ['Second', '', 'Seventh']);
    expect(saved.captions).toEqual(['Second', '', 'Seventh']);
    // Without captions given, every caption is blank.
    expect((await save(accountId, [key(1)])).captions).toEqual(['']);
    await save(accountId, [key(7), key(2)], ['Seventh', 'Second']);
    expect(await findPortfolioForAccount(db(), accountId)).toMatchObject({ items: [key(7), key(2)], captions: ['Seventh', 'Second'] });
    expect((await save(accountId, [], [])).captions).toEqual([]);
  });

  it('never reaches another account’s draft', async () => {
    const a = await withProfile();
    const b = await withProfile();
    await save(a.accountId, keys(3));
    expect(await findPortfolioForAccount(db(), b.accountId)).toBeUndefined();
    await save(b.accountId, [key(9)]);
    expect((await findPortfolioForAccount(db(), a.accountId))?.items).toEqual(keys(3));
  });

  it('numbers revisions from 1 and refuses a save based on a stale one, writing nothing (B4)', async () => {
    const { accountId } = await withProfile();
    const write = (items: readonly string[], expectedRevision: number) => savePortfolioForAccount(db(), accountId, { items, expectedRevision });
    // No draft yet: only a first save (revision 0) can land.
    await expect(write(keys(1), 1)).rejects.toBeInstanceOf(StaleRevisionError);
    expect(await findPortfolioForAccount(db(), accountId)).toBeUndefined();
    const first = await write(keys(1), UNSAVED_REVISION);
    expect(first.revision).toBe(1);
    // A second "first save" finds the draft there.
    await expect(write(keys(2), UNSAVED_REVISION)).rejects.toBeInstanceOf(StaleRevisionError);
    const second = await write(keys(2), 1);
    expect(second.revision).toBe(2);
    // Based on revision 1 again: stale, and the draft is untouched.
    await expect(write(keys(3), 1)).rejects.toBeInstanceOf(StaleRevisionError);
    await expect(write(keys(3), 3)).rejects.toBeInstanceOf(StaleRevisionError);
    expect(await findPortfolioForAccount(db(), accountId)).toMatchObject({ items: keys(2), revision: 2 });
    expect((await write([], 2)).revision).toBe(3);
    // The error carries no draft data.
    const error = await write(keys(1), 1).catch((e: unknown) => e);
    expect(JSON.stringify(error)).not.toMatch(/items|captions|revision|updatedAt/);
    expect(Object.keys(error as object)).toEqual(['name']);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) await expect(write(keys(1), bad)).rejects.toBeInstanceOf(RangeError);
  });

  it('of simultaneous first saves exactly one lands, and of competing updates on one revision exactly one lands (B4)', async () => {
    const { accountId } = await withProfile();
    const attempt = (items: readonly string[], expectedRevision: number) =>
      savePortfolioForAccount(db(), accountId, { items, expectedRevision }).then(
        (record) => ({ ok: true as const, record }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    const firsts = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => attempt([key(i)], UNSAVED_REVISION)));
    const won = firsts.filter((r) => r.ok);
    expect(won).toHaveLength(1);
    expect(firsts.filter((r) => !r.ok).every((r) => r.error instanceof StaleRevisionError)).toBe(true);
    const after = await findPortfolioForAccount(db(), accountId);
    expect(after).toMatchObject({ items: won[0]!.record.items, revision: 1 });

    const updates = await Promise.all([6, 7, 8, 9].map((i) => attempt([key(i)], 1)));
    const landed = updates.filter((r) => r.ok);
    expect(landed).toHaveLength(1);
    expect(updates.filter((r) => !r.ok).every((r) => r.error instanceof StaleRevisionError)).toBe(true);
    expect(await findPortfolioForAccount(db(), accountId)).toMatchObject({ items: landed[0]!.record.items, revision: 2 });
    // Owner B's revisions are its own: the same numbers, a different draft.
    const other = await withProfile();
    expect((await savePortfolioForAccount(db(), other.accountId, { items: keys(4), expectedRevision: UNSAVED_REVISION })).revision).toBe(1);
    expect((await findPortfolioForAccount(db(), accountId))?.revision).toBe(2);
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

  it('sets the revision itself (1, then +1 per update) and refuses a direct revision change (B4)', async () => {
    const { profileId } = await withProfile();
    await withClient(inject('runtimeUrl'), async (c) => {
      // No INSERT privilege is column-scoped, so a supplied revision reaches the trigger, which replaces it.
      const inserted = await c.query<{ revision: number }>(`insert into portfolio_draft (profile_id, items, revision) values ($1, '{}', 99) returning revision`, [profileId]);
      expect(inserted.rows[0]!.revision).toBe(1);
      expect(await sqlErrorCode(c, 'update portfolio_draft set revision = 50 where profile_id = $1', [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update portfolio_draft set items = $1::text[], captions = $2::text[], revision = 50 where profile_id = $3', [keys(1), [''], profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      for (const n of [2, 3]) {
        const updated = await c.query<{ revision: number }>('update portfolio_draft set items = $1::text[], captions = $2::text[] where profile_id = $3 returning revision', [keys(n), keys(n).map(() => ''), profileId]);
        expect(updated.rows[0]!.revision).toBe(n);
      }
      // A refused write (here, a repeated key) leaves the revision alone.
      expect(await sqlErrorCode(c, 'update portfolio_draft set items = $1::text[], captions = $2::text[] where profile_id = $3', [[key(0), key(0)], ['', ''], profileId])).toBe(CHECK_VIOLATION);
      expect((await c.query<{ revision: number }>('select revision from portfolio_draft where profile_id = $1', [profileId])).rows[0]!.revision).toBe(3);
      // The compare-and-swap itself, as SQL: a stale revision matches no row.
      const stale = await c.query('update portfolio_draft set items = $1::text[], captions = $2::text[] where profile_id = $3 and revision = 2 returning revision', [keys(4), keys(4).map(() => ''), profileId]);
      expect(stale.rowCount).toBe(0);
      const current = await c.query<{ revision: number }>('update portfolio_draft set items = $1::text[], captions = $2::text[] where profile_id = $3 and revision = 3 returning revision', [keys(4), keys(4).map(() => ''), profileId]);
      expect(current.rows[0]!.revision).toBe(4);
    });
    // Below 1 is refused even for a role that could set it (the migrator), by the CHECK.
    await withClient(inject('migrationUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'alter table portfolio_draft disable trigger portfolio_draft_revision')).toBeNull();
      try {
        expect(await sqlErrorCode(c, 'update portfolio_draft set revision = 0 where profile_id = $1', [profileId])).toBe(CHECK_VIOLATION);
      } finally {
        await c.query('alter table portfolio_draft enable trigger portfolio_draft_revision');
      }
    });
  });

  it('the maximum is below the catalogue size, so the limit is a real one', () => {
    expect(FIXTURE_KEYS.length).toBeGreaterThan(PORTFOLIO_MAX_ITEMS);
    expect(PORTFOLIO_CAPTION_MAX).toBe(120);
  });
});
