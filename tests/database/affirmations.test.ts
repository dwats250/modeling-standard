import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import type pg from 'pg';
import { operations } from '../../src/app/operation-list.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import {
  affirmAgreementTerm,
  affirmUniversalTerm,
  listAgreementAffirmations,
  listUniversalAffirmations,
  PresentedTermNotFoundError,
  type AffirmationRecord,
} from '../../src/projects/affirmations.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { addAgreementTerm, addUniversalTerm } from '../../src/projects/terms.ts';
import { presentAgreementVersion, presentUniversalVersion } from '../../src/projects/versions.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S05 per-term affirmation evidence against real PostgreSQL, migrated by the
 * production migration path and used as the runtime role, for both layers.
 */

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

/** Words naming semantics S05 excludes from affirmation rows. */
const EXCLUDED_SEMANTICS = [
  'final', 'complete', 'outstanding', 'pending', 'status', 'state', 'current',
  'declin', 'reject', 'withdraw', 'revok', 'retract', 'cancel',
  'group', 'batch', 'bulk', 'all_',
  'principal', 'account', 'person', 'credential', 'ip', 'device', 'agent',
  'sign', 'witness', 'requir', 'body', 'money', 'visib', 'propos',
];

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

async function failureCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown } };
    const code = typeof e.code === 'string' ? e.code : e.cause?.code;
    return typeof code === 'string' ? code : 'unknown';
  }
}

async function failureConstraint(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const e = error as { constraint?: unknown; cause?: { constraint?: unknown } };
    const constraint = typeof e.constraint === 'string' ? e.constraint : e.cause?.constraint;
    return typeof constraint === 'string' ? constraint : 'unknown';
  }
}

async function inTransaction(c: pg.Client, statements: [string, unknown[]][]): Promise<{ code: string; constraint?: string | undefined } | null> {
  try {
    await c.query('begin');
    for (const [text, params] of statements) await c.query(text, params);
    await c.query('commit');
    return null;
  } catch (error) {
    await c.query('rollback').catch(() => undefined);
    const e = error as { code?: string; constraint?: string };
    return { code: e.code ?? 'unknown', constraint: e.constraint };
  }
}

/**
 * A project with an agreement between parties a and b, a second agreement
 * between c and d, and a party of another project; each container has two
 * terms presented in a first version.
 */
async function world() {
  const p = await insertProject(database.db, { createdByPrincipalId: `s05-${randomUUID()}` });
  const [a, b, c, d] = await Promise.all([1, 2, 3, 4].map(() => addProjectParty(database.db, p.id)));
  const other = await insertProject(database.db, { createdByPrincipalId: `s05-${randomUUID()}` });
  const outsider = await addProjectParty(database.db, other.id);
  const agreement = await createPairwiseAgreement(database.db, p.id, [a!.id, b!.id]);
  const otherAgreement = await createPairwiseAgreement(database.db, p.id, [c!.id, d!.id]);

  const at1 = await addAgreementTerm(database.db, agreement.id, 'pairwise one');
  const at2 = await addAgreementTerm(database.db, agreement.id, 'pairwise two');
  const pairwiseV1 = await presentAgreementVersion(database.db, agreement.id, [at1.id, at2.id]);
  const ot1 = await addAgreementTerm(database.db, otherAgreement.id, 'other pair');
  const otherV1 = await presentAgreementVersion(database.db, otherAgreement.id, [ot1.id]);

  const ut1 = await addUniversalTerm(database.db, p.id, 'universal one');
  const ut2 = await addUniversalTerm(database.db, p.id, 'universal two');
  const universalV1 = await presentUniversalVersion(database.db, p.id, [ut1.id, ut2.id]);
  const ox = await addUniversalTerm(database.db, other.id, 'other project');
  const otherUniversalV1 = await presentUniversalVersion(database.db, other.id, [ox.id]);

  return {
    projectId: p.id,
    otherProjectId: other.id,
    parties: { a: a!.id, b: b!.id, c: c!.id, d: d!.id, outsider: outsider.id },
    agreementId: agreement.id,
    pairwiseV1,
    otherV1,
    pairwiseTermIds: [at1.id, at2.id],
    universalV1,
    otherUniversalV1,
    universalTermIds: [ut1.id, ut2.id],
  };
}
type World = Awaited<ReturnType<typeof world>>;

interface Layer {
  readonly name: string;
  readonly table: string;
  readonly firstVersionConstraint: string;
  affirm(presentedTermId: string, partyId: string): Promise<AffirmationRecord>;
  list(versionId: string): Promise<AffirmationRecord[]>;
  /** The first version and the parties that may affirm it. */
  first(w: World): { versionId: string; termIds: string[]; affirmers: string[] };
  /** Parties the database must reject for this layer. */
  rejected(w: World): { partyId: string; code: string }[];
  /** Presents a second version of the same container and returns its first presented term. */
  later(w: World): Promise<{ versionId: string; termId: string }>;
  /** Columns for a raw insert of an affirmation of `termId` in `versionId` by `partyId`. */
  rawInsert(w: World, versionId: string, termId: string, partyId: string, extra?: string): [string, unknown[]];
}

const layers: Layer[] = [
  {
    name: 'pairwise',
    table: 'agreement_affirmation',
    firstVersionConstraint: 'agreement_affirmation_first_version_only',
    affirm: (t, p) => affirmAgreementTerm(database.db, t, p),
    list: (v) => listAgreementAffirmations(database.db, v),
    first: (w) => ({
      versionId: w.pairwiseV1.id,
      termIds: w.pairwiseV1.terms.map((t) => t.id),
      affirmers: [w.parties.a, w.parties.b],
    }),
    rejected: (w) => [
      // Same project, but not one of this agreement's two parties.
      { partyId: w.parties.c, code: CHECK_VIOLATION },
      // Another project entirely.
      { partyId: w.parties.outsider, code: CHECK_VIOLATION },
    ],
    async later(w) {
      const v2 = await presentAgreementVersion(database.db, w.agreementId, [w.pairwiseTermIds[0]!]);
      return { versionId: v2.id, termId: v2.terms[0]!.id };
    },
    rawInsert(w, versionId, termId, partyId, extra) {
      const [one, two] = [w.parties.a, w.parties.b].sort();
      return [
        `insert into agreement_affirmation
           (pairwise_agreement_id, party_one_id, party_two_id, agreement_version_id, agreement_version_term_id, party_id${extra ? ', affirmed_at' : ''})
         values ($1, $2, $3, $4, $5, $6${extra ? ', $7' : ''})`,
        [w.agreementId, one, two, versionId, termId, partyId, ...(extra ? [extra] : [])],
      ];
    },
  },
  {
    name: 'universal',
    table: 'universal_affirmation',
    firstVersionConstraint: 'universal_affirmation_first_version_only',
    affirm: (t, p) => affirmUniversalTerm(database.db, t, p),
    list: (v) => listUniversalAffirmations(database.db, v),
    first: (w) => ({
      versionId: w.universalV1.id,
      termIds: w.universalV1.terms.map((t) => t.id),
      // Any party of the project may be recorded; who must affirm is open.
      affirmers: [w.parties.a, w.parties.b, w.parties.c],
    }),
    rejected: (w) => [{ partyId: w.parties.outsider, code: FOREIGN_KEY_VIOLATION }],
    async later(w) {
      const v2 = await presentUniversalVersion(database.db, w.projectId, [w.universalTermIds[0]!]);
      return { versionId: v2.id, termId: v2.terms[0]!.id };
    },
    rawInsert(w, versionId, termId, partyId, extra) {
      return [
        `insert into universal_affirmation (project_id, universal_version_id, universal_version_term_id, party_id${extra ? ', affirmed_at' : ''})
         values ($1, $2, $3, $4${extra ? ', $5' : ''})`,
        [w.projectId, versionId, termId, partyId, ...(extra ? [extra] : [])],
      ];
    },
  },
];

describe.each(layers)('$name affirmations', (layer) => {
  it('record one row per party per presented term, with a database time, and read back per version', async () => {
    const w = await world();
    const { versionId, termIds, affirmers } = layer.first(w);
    const recorded: AffirmationRecord[] = [];
    for (const partyId of affirmers) {
      for (const termId of termIds) recorded.push(await layer.affirm(termId, partyId));
    }
    expect(recorded).toHaveLength(affirmers.length * termIds.length);
    for (const r of recorded) {
      expect(r).toEqual({ id: expect.any(String), versionId, presentedTermId: expect.any(String), partyId: expect.any(String), affirmedAt: expect.any(Date) });
    }
    expect(await layer.list(versionId)).toEqual(recorded);
  });

  it('are independent per term: affirming one term affirms nothing else', async () => {
    const w = await world();
    const { versionId, termIds, affirmers } = layer.first(w);
    await layer.affirm(termIds[0]!, affirmers[0]!);
    const listed = await layer.list(versionId);
    expect(listed.map((r) => [r.presentedTermId, r.partyId])).toEqual([[termIds[0], affirmers[0]]]);
  });

  it('reject a party who may not affirm in this container', async () => {
    const w = await world();
    const { versionId, termIds } = layer.first(w);
    for (const { partyId, code } of layer.rejected(w)) {
      expect({ partyId, code: await failureCode(() => layer.affirm(termIds[0]!, partyId)) }).toEqual({ partyId, code });
    }
    expect(await layer.list(versionId)).toEqual([]);
  });

  it('reject a second affirmation of the same term by the same party', async () => {
    const w = await world();
    const { termIds, affirmers } = layer.first(w);
    await layer.affirm(termIds[0]!, affirmers[0]!);
    expect(await failureCode(() => layer.affirm(termIds[0]!, affirmers[0]!))).toBe(UNIQUE_VIOLATION);
  });

  it('reject affirming a term of a later version: escalation rules (ruling 6) do not exist yet', async () => {
    const w = await world();
    const later = await layer.later(w);
    const partyId = layer.first(w).affirmers[0]!;
    expect(await failureConstraint(() => layer.affirm(later.termId, partyId))).toBe(layer.firstVersionConstraint);
    expect(await layer.list(later.versionId)).toEqual([]);
  });

  it('reject an unknown presented term', async () => {
    await expect(layer.affirm(randomUUID(), randomUUID())).rejects.toBeInstanceOf(PresentedTermNotFoundError);
  });

  describe('are enforced by the database against raw SQL', () => {
    it('so a term must belong to the stated version', async () => {
      const w = await world();
      const { versionId, affirmers } = layer.first(w);
      const later = await layer.later(w);
      await withClient(inject('runtimeUrl'), async (c) => {
        const failure = await inTransaction(c, [layer.rawInsert(w, versionId, later.termId, affirmers[0]!)]);
        expect(failure?.code).toBe(FOREIGN_KEY_VIOLATION);
      });
    });

    it('so a version of another container is rejected', async () => {
      const w = await world();
      const { affirmers } = layer.first(w);
      const foreign = layer.name === 'pairwise' ? w.otherV1 : w.otherUniversalV1;
      await withClient(inject('runtimeUrl'), async (c) => {
        const failure = await inTransaction(c, [layer.rawInsert(w, foreign.id, foreign.terms[0]!.id, affirmers[0]!)]);
        expect(failure).toEqual({ code: CHECK_VIOLATION, constraint: layer.firstVersionConstraint });
      });
    });

    it('so the affirmation time is the clock time the row is written, not the caller\'s', async () => {
      const w = await world();
      const { versionId, termIds, affirmers } = layer.first(w);
      await withClient(inject('runtimeUrl'), async (c) => {
        await c.query('begin');
        const started = await c.query<{ t: Date }>('select now() as t');
        await c.query('select pg_sleep(1.2)');
        const [text, params] = layer.rawInsert(w, versionId, termIds[0]!, affirmers[0]!, '2000-01-01T00:00:00Z');
        await c.query(text, params);
        await c.query('commit');
        const stored = await c.query<{ lag: number }>(
          `select extract(epoch from (affirmed_at - $1::timestamptz))::float8 as lag from ${layer.table} where party_id = $2`,
          [started.rows[0]!.t, affirmers[0]],
        );
        expect(stored.rows[0]!.lag).toBeGreaterThanOrEqual(1.1);
      });
    });

    it('so an affirmation cannot target a version that another transaction has not yet committed', async () => {
      const w = await world();
      const { affirmers } = layer.first(w);
      const containerTable = layer.name === 'pairwise' ? 'agreement_version' : 'universal_version';
      const containerColumn = layer.name === 'pairwise' ? 'pairwise_agreement_id' : 'project_id';
      const container = layer.name === 'pairwise' ? w.agreementId : w.projectId;
      const versionId = randomUUID();
      await withClient(inject('runtimeUrl'), async (writer) => {
        await withClient(inject('runtimeUrl'), async (affirmer) => {
          await writer.query('begin');
          // Not committed: its sequence (2) is invisible to the affirmer.
          await writer.query(`insert into ${containerTable} (id, ${containerColumn}, sequence, term_count) values ($1, $2, 2, 1)`, [
            versionId,
            container,
          ]);
          const [text, params] = layer.rawInsert(w, versionId, randomUUID(), affirmers[0]!);
          expect(await sqlErrorCode(affirmer, text, params)).toBe(CHECK_VIOLATION);
          await writer.query('rollback');
        });
      });
    });

    it('so the runtime role cannot update, delete or truncate an affirmation', async () => {
      await withClient(inject('runtimeUrl'), async (c) => {
        expect(await sqlErrorCode(c, `update ${layer.table} set party_id = party_id`)).toBe(INSUFFICIENT_PRIVILEGE);
        expect(await sqlErrorCode(c, `delete from ${layer.table}`)).toBe(INSUFFICIENT_PRIVILEGE);
        expect(await sqlErrorCode(c, `truncate ${layer.table}`)).toBe(INSUFFICIENT_PRIVILEGE);
      });
    });
  });

  it('name no excluded semantic in columns or constraints', async () => {
    const names = await withClient(inject('runtimeUrl'), async (c) => {
      const res = await c.query<{ name: string }>(
        `select column_name as name from information_schema.columns where table_schema = 'public' and table_name = $1
         union all
         select conname from pg_constraint where conrelid = $2::regclass`,
        [layer.table, `public.${layer.table}`],
      );
      return res.rows.map((r) => r.name);
    });
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => EXCLUDED_SEMANTICS.some((word) => name.includes(word)))).toEqual([]);
  });
});

describe('pairwise affirmations', () => {
  it('cannot claim a pair other than the agreement\'s own', async () => {
    const w = await world();
    const [one, two] = [w.parties.c, w.parties.d].sort();
    await withClient(inject('runtimeUrl'), async (c) => {
      const failure = await inTransaction(c, [
        [
          `insert into agreement_affirmation
             (pairwise_agreement_id, party_one_id, party_two_id, agreement_version_id, agreement_version_term_id, party_id)
           values ($1, $2, $3, $4, $5, $6)`,
          [w.agreementId, one, two, w.pairwiseV1.id, w.pairwiseV1.terms[0]!.id, w.parties.c],
        ],
      ]);
      expect(failure).toEqual({ code: FOREIGN_KEY_VIOLATION, constraint: 'agreement_affirmation_pair_fk' });
    });
  });
});

describe('affirmations', () => {
  it('are not reachable over HTTP', () => {
    expect(operations.filter((op) => /affirm|sign|accept/i.test(`${op.name} ${op.path}`))).toEqual([]);
  });

  it('use trigger functions the runtime role cannot call', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'select agreement_affirmation_stamp()')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'select universal_affirmation_stamp()')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});
