import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { withClient } from '../support/sql.ts';

/**
 * The migrated catalog (the test database is migrated from empty by the
 * production migration path) holds no identifier at PostgreSQL's 63-byte
 * limit, which is where a truncated name would land, and the one name that
 * shipped truncated before migrations/0014 is gone (its table was retired in
 * S08).
 *
 * The general protection against over-long names is the migration-source
 * guard (`npm run db:identifiers`), not the catalog: PostgreSQL truncates an
 * over-long name before it reaches the catalog, so the catalog cannot show it.
 */

describe('migrated identifiers', () => {
  it('include no name at the 63-byte truncation limit, and not the formerly truncated one', async () => {
    await withClient(inject('migrationUrl'), async (c) => {
      const { rows } = await c.query<{ name: string }>(
        `select conname::text as name from pg_constraint where connamespace = 'public'::regnamespace
         union all select relname::text from pg_class where relnamespace = 'public'::regnamespace
         union all select tgname::text from pg_trigger t join pg_class r on r.oid = t.tgrelid where r.relnamespace = 'public'::regnamespace
         union all select proname::text from pg_proc where pronamespace = 'public'::regnamespace`,
      );
      expect(rows.filter((r) => Buffer.byteLength(r.name) >= 63)).toEqual([]);
      expect(rows.map((r) => r.name)).not.toContain('agreement_version_pairwise_agreement_id_pairwise_agreement_id_f');
    });
  });
});
