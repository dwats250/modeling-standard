import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { withClient } from '../support/sql.ts';

/**
 * Every trigger function in the schema, pinned by name and held to the same
 * hardening rule: `search_path` pinned with `pg_temp` last, and not callable
 * by the runtime role. Relocated from the S04 version tests when S08 retired
 * S03–S05; a later slice that adds a trigger function adds it here.
 */

describe('trigger functions', () => {
  it('are exactly the expected set, cannot be shadowed by temporary objects, and cannot be called by the runtime role', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      const functions = await c.query<{ name: string; config: string[] | null; callable: boolean }>(
        `select p.proname as name, p.proconfig as config, has_function_privilege(current_user, p.oid, 'EXECUTE') as callable
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prorettype = 'trigger'::regtype order by 1`,
      );
      expect(functions.rows.map((r) => r.name)).toEqual([
        'account_stamp',
        'brief_item_check_scope',
        'direct_invitation_stamp',
        'party_account_binding_stamp',
      ]);
      for (const f of functions.rows) {
        expect({ name: f.name, config: f.config, callable: f.callable }).toEqual({
          name: f.name,
          config: ['search_path=pg_catalog, public, pg_temp'],
          callable: false,
        });
      }
    });
  });
});
