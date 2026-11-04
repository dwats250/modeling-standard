import { createHash, randomUUID } from 'node:crypto';
import { withClient } from './sql.ts';

/**
 * Test-only: store a final contract among three bound parties.
 *
 * No product path can produce this record today. S10/S11 refuse anything but
 * two parties and one pair (`unsupported_topology`, and in the database
 * `live_brief_signing_requires_two_party`, `live_brief_final_requires_signatures`
 * and `contract_signature_sequence_known`). What this protects is the read
 * path: the route, the session, the D10 projection and the screen must keep
 * each person's payment private whatever the stored topology.
 *
 * So it writes the rows directly, with the contract guards off for this one
 * transaction, as the migration role, in a database the caller owns. The other
 * constraints and every foreign key stay on. Only two signature rows exist,
 * because the schema admits no third; the read path never returns them, and
 * they carry markers so a test can prove that.
 */

const GUARDED_TABLES = ['contract', 'contract_party', 'contract_item', 'contract_signature', 'live_brief'] as const;

export interface SeededClause {
  readonly layer: 'universal' | 'shared' | 'money';
  readonly pairwiseAgreementId?: string;
  readonly itemKey?: 'fee';
  readonly content: string;
  readonly value?: string;
  readonly approverPartyIds: readonly string[];
}

export interface SeededEvidence {
  readonly contractId: string;
  readonly fingerprint: string;
  readonly hashes: readonly string[];
  readonly ip: string;
  readonly userAgent: string;
}

const hex = (seed: string) => createHash('sha256').update(seed).digest('hex');

export async function seedThreePartyFinalRecord(
  migrationUrl: string,
  input: { readonly projectId: string; readonly briefId: string; readonly clauses: readonly SeededClause[] },
): Promise<SeededEvidence> {
  const contractId = randomUUID();
  const fingerprint = hex(`fingerprint:${contractId}`);
  const ip = '198.51.100.77';
  const userAgent = `UA-EVIDENCE-MARKER-${contractId}`;
  const hashes = [hex(`one:${contractId}`), hex(`two:${contractId}`)];
  await withClient(migrationUrl, async (c) => {
    await c.query('BEGIN');
    try {
      for (const table of GUARDED_TABLES) await c.query(`ALTER TABLE public.${table} DISABLE TRIGGER USER`);
      const bound = await c.query<{ party_id: string; account_id: string }>(
        'select party_id, account_id from party_account_binding where project_id = $1 order by party_id',
        [input.projectId],
      );
      if (bound.rows.length !== 3) throw new Error(`expected three bound parties, found ${bound.rows.length}`);
      await c.query('insert into contract (id, project_id, brief_id, fingerprint) values ($1, $2, $3, $4)', [contractId, input.projectId, input.briefId, fingerprint]);
      for (const row of bound.rows) {
        await c.query('insert into contract_party (contract_id, project_id, party_id, account_id, on_site) values ($1, $2, $3, $4, true)', [contractId, input.projectId, row.party_id, row.account_id]);
      }
      for (const [index, clause] of input.clauses.entries()) {
        await c.query(
          `insert into contract_item (contract_id, project_id, item_id, position, layer, pairwise_agreement_id, item_key, content, value, approver_party_ids)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[])`,
          [contractId, input.projectId, randomUUID(), index + 1, clause.layer, clause.pairwiseAgreementId ?? null, clause.itemKey ?? null, clause.content, clause.value ?? null, [...clause.approverPartyIds].sort()],
        );
      }
      for (const [index, row] of bound.rows.slice(0, 2).entries()) {
        await c.query(
          `insert into contract_signature (contract_id, project_id, sequence, party_id, account_id, fingerprint, ip, user_agent, prev_hash, record_hash)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [contractId, input.projectId, index + 1, row.party_id, row.account_id, fingerprint, ip, userAgent, index === 0 ? fingerprint : hashes[0], hashes[index]],
        );
      }
      await c.query("update live_brief set phase = 'final', fingerprint = null where id = $1", [input.briefId]);
      // As finalization does: the live items and ticks do not outlive the contract (HC1).
      await c.query('delete from brief_tick where brief_item_id in (select id from brief_item where brief_id = $1)', [input.briefId]);
      await c.query('delete from brief_item where brief_id = $1', [input.briefId]);
      for (const table of GUARDED_TABLES) await c.query(`ALTER TABLE public.${table} ENABLE TRIGGER USER`);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    }
  });
  return { contractId, fingerprint, hashes, ip, userAgent };
}
