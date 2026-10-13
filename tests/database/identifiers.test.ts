import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { withClient } from '../support/sql.ts';

/**
 * The migrated catalog (the test database is migrated from empty by the
 * production migration path): the agreement_version foreign key carries its
 * explicit name, unchanged in definition, and no identifier sits at exactly
 * 63 bytes, which is what a silently truncated name looks like.
 */

describe('migrated identifiers', () => {
  it('name the agreement_version foreign key explicitly, with the same definition', async () => {
    await withClient(inject('migrationUrl'), async (c) => {
      const { rows } = await c.query<{ conname: string; def: string; deferrable: boolean; validated: boolean }>(
        `select conname, pg_get_constraintdef(oid) as def, condeferrable as deferrable, convalidated as validated
           from pg_constraint where conrelid = 'public.agreement_version'::regclass and contype = 'f'`,
      );
      expect(rows).toEqual([
        {
          conname: 'agreement_version_agreement_fk',
          def: 'FOREIGN KEY (pairwise_agreement_id) REFERENCES pairwise_agreement(id)',
          deferrable: false,
          validated: true,
        },
      ]);
      const old = await c.query(
        `select 1 from pg_constraint where conname = 'agreement_version_pairwise_agreement_id_pairwise_agreement_id_f'`,
      );
      expect(old.rowCount).toBe(0);
    });
  });

  it('contain no 63-byte (possibly truncated) name in the public schema', async () => {
    await withClient(inject('migrationUrl'), async (c) => {
      const { rows } = await c.query<{ kind: string; name: string }>(`
        select 'constraint' as kind, conname::text as name from pg_constraint where connamespace = 'public'::regnamespace
        union all select 'relation', relname::text from pg_class where relnamespace = 'public'::regnamespace
        union all select 'function', proname::text from pg_proc where pronamespace = 'public'::regnamespace
        union all select 'trigger', tgname::text from pg_trigger t join pg_class r on r.oid = t.tgrelid
          where r.relnamespace = 'public'::regnamespace and not t.tgisinternal
      `);
      expect(rows.filter((r) => Buffer.byteLength(r.name) >= 63)).toEqual([]);
      expect(rows.length).toBeGreaterThan(0);
    });
  });
});
