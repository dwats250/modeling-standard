import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { DEFAULT_ARRANGEMENT, FIXTURE_MEDIA } from '../../src/toolkit/fixture-media.ts';
import {
  ProfileRequiredError,
  findDraftForAccount,
  findProfileForAccount,
  saveDraftForAccount,
  saveProfileForAccount,
} from '../../src/toolkit/profile.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * B1 professional profile and comp-card draft, against real PostgreSQL as
 * the runtime role: one row per owner, owner-keyed data functions, database
 * time, the declarative checks, and the privileges that keep ownership and
 * history out of the runtime role's reach even by direct SQL.
 */

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

const db = () => database.db;
const newAccount = () => resolveAccountForLogin(db(), { provider: 'google', providerSubject: `toolkit-${randomUUID()}` });
const profileFields = { displayName: 'Test Person', profession: 'Model', biography: 'Line one.\nLine two.' };
const slots = { ...DEFAULT_ARRANGEMENT };

describe('data functions', () => {
  it('keeps exactly one profile per account and replaces its fields on save', async () => {
    const acct = await newAccount();
    expect(await findProfileForAccount(db(), acct.id)).toBeUndefined();
    const first = await saveProfileForAccount(db(), acct.id, profileFields);
    const second = await saveProfileForAccount(db(), acct.id, { ...profileFields, displayName: 'Renamed' });
    expect(second.id).toBe(first.id);
    expect(second.displayName).toBe('Renamed');
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    const count = await withClient(inject('migrationUrl'), (c) => c.query('select count(*)::int as n from professional_profile where account_id = $1', [acct.id]));
    expect(count.rows[0].n).toBe(1);
  });

  it('refuses a draft without a profile, then keeps one draft per profile', async () => {
    const acct = await newAccount();
    await expect(saveDraftForAccount(db(), acct.id, { tagline: '', slots })).rejects.toBeInstanceOf(ProfileRequiredError);
    await saveProfileForAccount(db(), acct.id, profileFields);
    await saveDraftForAccount(db(), acct.id, { tagline: 'One', slots });
    const swapped = { ...slots, hero: slots.beauty, beauty: slots.hero };
    const saved = await saveDraftForAccount(db(), acct.id, { tagline: 'Two', slots: swapped });
    expect(saved).toMatchObject({ tagline: 'Two', slots: swapped });
    expect(await findDraftForAccount(db(), acct.id)).toMatchObject({ tagline: 'Two', slots: swapped });
  });

  it('never reaches another account’s rows', async () => {
    const a = await newAccount();
    const b = await newAccount();
    await saveProfileForAccount(db(), a.id, { ...profileFields, displayName: 'Owner A' });
    await saveDraftForAccount(db(), a.id, { tagline: 'A only', slots });
    expect(await findProfileForAccount(db(), b.id)).toBeUndefined();
    expect(await findDraftForAccount(db(), b.id)).toBeUndefined();
    await saveProfileForAccount(db(), b.id, { ...profileFields, displayName: 'Owner B' });
    expect((await findProfileForAccount(db(), a.id))?.displayName).toBe('Owner A');
    expect(await findDraftForAccount(db(), b.id)).toBeUndefined();
  });
});

describe('database guards (runtime role, direct SQL)', () => {
  async function seeded(): Promise<{ accountId: string; profileId: string }> {
    const acct = await newAccount();
    const profile = await saveProfileForAccount(db(), acct.id, profileFields);
    await saveDraftForAccount(db(), acct.id, { tagline: '', slots });
    return { accountId: acct.id, profileId: profile.id };
  }

  it('sets created_at and updated_at from database time; a caller cannot backdate them', async () => {
    const { accountId } = await seeded();
    await withClient(inject('runtimeUrl'), async (c) => {
      const other = await newAccount();
      const inserted = await c.query(
        `insert into professional_profile (account_id, display_name, created_at, updated_at) values ($1, 'X', '2000-01-01', '2000-01-01') returning created_at, updated_at`,
        [other.id],
      );
      expect(new Date(inserted.rows[0].created_at).getFullYear()).toBeGreaterThan(2020);
      expect(new Date(inserted.rows[0].updated_at).getFullYear()).toBeGreaterThan(2020);
      const before = await c.query<{ created_at: Date }>('select created_at from professional_profile where account_id = $1', [accountId]);
      await c.query(`update professional_profile set display_name = 'Later' where account_id = $1`, [accountId]);
      const after = await c.query<{ created_at: Date; updated_at: Date }>('select created_at, updated_at from professional_profile where account_id = $1', [accountId]);
      expect(after.rows[0]!.created_at).toEqual(before.rows[0]!.created_at);
      expect(after.rows[0]!.updated_at.getTime()).toBeGreaterThanOrEqual(before.rows[0]!.created_at.getTime());
    });
  });

  it('refuses deletes, owner changes and time changes', async () => {
    const { accountId, profileId } = await seeded();
    const other = await newAccount();
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'delete from comp_card_draft where profile_id = $1', [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from professional_profile where id = $1', [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update professional_profile set account_id = $1 where id = $2', [other.id, profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, `update professional_profile set created_at = now() where id = $1`, [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, `update professional_profile set updated_at = now() where id = $1`, [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update comp_card_draft set profile_id = gen_random_uuid() where profile_id = $1', [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, `update comp_card_draft set created_at = now() where profile_id = $1`, [profileId])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate professional_profile')).toBe(INSUFFICIENT_PRIVILEGE);
    });
    expect((await findProfileForAccount(db(), accountId))?.id).toBe(profileId);
  });

  it('checks lengths, a non-blank name, slot-key shape and distinct slots', async () => {
    const { profileId } = await seeded();
    const fresh = await newAccount();
    await withClient(inject('runtimeUrl'), async (c) => {
      const insertProfile = (name: string, profession = '', biography = '') =>
        sqlErrorCode(c, 'insert into professional_profile (account_id, display_name, profession, biography) values ($1, $2, $3, $4)', [fresh.id, name, profession, biography]);
      expect(await insertProfile('')).toBe(CHECK_VIOLATION);
      expect(await insertProfile('   ')).toBe(CHECK_VIOLATION);
      expect(await insertProfile('x'.repeat(81))).toBe(CHECK_VIOLATION);
      expect(await insertProfile('Fine', 'x'.repeat(61))).toBe(CHECK_VIOLATION);
      expect(await insertProfile('Fine', '', 'x'.repeat(601))).toBe(CHECK_VIOLATION);

      const setSlot = (column: string, value: string) => sqlErrorCode(c, `update comp_card_draft set ${column} = $1 where profile_id = $2`, [value, profileId]);
      expect(await setSlot('slot_hero', DEFAULT_ARRANGEMENT.beauty)).toBe(CHECK_VIOLATION);
      expect(await setSlot('slot_hero', 'Not A Key')).toBe(CHECK_VIOLATION);
      expect(await setSlot('slot_hero', '../../etc/passwd')).toBe(CHECK_VIOLATION);
      expect(await setSlot('tagline', 'x'.repeat(81))).toBe(CHECK_VIOLATION);
    });
  });

  it('every catalogue key fits the database key shape', () => {
    for (const fixture of FIXTURE_MEDIA) expect(fixture.key).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(FIXTURE_MEDIA.map((f) => f.key)).size).toBe(FIXTURE_MEDIA.length);
  });
});
