import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { withClient } from '../support/sql.ts';

/**
 * The migrated catalog (the test database is migrated from empty by the
 * production migration path): the agreement_version foreign key carries its
 * explicit name, unchanged in definition, and the truncated name PostgreSQL
 * stored for it before migrations/0014 is gone.
 *
 * The general protection against over-long names is the migration-source
 * guard (`npm run db:identifiers`), not the catalog: PostgreSQL truncates an
 * over-long name before it reaches the catalog, so the catalog cannot show it.
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
});
