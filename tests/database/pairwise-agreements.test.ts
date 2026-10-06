import { randomUUID } from 'node:crypto';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { operations } from '../../src/app/operation-list.ts';
import { createLogger } from '../../src/app/logger.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { createPairwiseAgreement, findPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { pairwiseAgreement } from '../../src/projects/tables.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S02 pairwise agreement topology against real PostgreSQL, migrated by the
 * production migration path and used as the runtime role. The database
 * itself enforces that an agreement relates exactly two distinct existing
 * parties of its own project, and the record carries nothing but that pair.
 */

const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Words naming semantics S02 excludes: roles, payment or obligation
 * direction, terms, status and lifecycle, signatures, identity, invitation,
 * visibility, proposer, and authority.
 */
const EXCLUDED_SEMANTICS = [
  'payer', 'payee', 'pay', 'photographer', 'model', 'author', 'role', 'owner',
  'compensation', 'value', 'term', 'clause', 'obligation', 'usage', 'right', 'deliverable', 'safety',
  'status', 'state', 'final', 'accept', 'decline', 'withdraw', 'cancel', 'amend', 'version',
  'sign', 'affirm', 'witness', 'evidence', 'agreed',
  'identity', 'verif', 'invite', 'email', 'account', 'person', 'principal', 'creator',
  'visib', 'private', 'propos', 'initiat', 'sender', 'recipient', 'direction', 'proxy',
];

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

interface Fixture {
  readonly creator: string;
  readonly projectId: string;
  readonly partyIds: readonly [string, string];
}

/** A project with two parties, created through the S01 data functions. */
async function projectWithTwoParties(): Promise<Fixture> {
  const creator = `s02-creator-${randomUUID()}`;
  const created = await insertProject(database.db, { createdByPrincipalId: creator });
  const first = await addProjectParty(database.db, created.id);
  const second = await addProjectParty(database.db, created.id);
  return { creator, projectId: created.id, partyIds: [first.id, second.id] };
}

/** The error code a database call failed with, or null if it succeeded. */
async function failureCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    // Drizzle wraps the driver error; the SQLSTATE is on the error or its cause.
    const e = error as { code?: unknown; cause?: { code?: unknown } };
    const code = typeof e.code === 'string' ? e.code : e.cause?.code;
    return typeof code === 'string' ? code : 'unknown';
  }
}

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

describe('a pairwise agreement', () => {
  it('is persisted under a project between two distinct parties of that project, and reads back', async () => {
    const f = await projectWithTwoParties();
    const created = await createPairwiseAgreement(database.db, f.projectId, f.partyIds);
    expect(created).toEqual({ id: expect.any(String), projectId: f.projectId, partyIds: expect.any(Array) });
    expect(sorted(created.partyIds)).toEqual(sorted(f.partyIds));

    expect(await findPairwiseAgreement(database.db, created.id)).toEqual(created);
    expect(await findPairwiseAgreement(database.db, randomUUID())).toBeUndefined();
  });

  it('treats its two parties as an unordered pair: the order supplied changes nothing', async () => {
    const f = await projectWithTwoParties();
    const forward = await createPairwiseAgreement(database.db, f.projectId, [f.partyIds[0], f.partyIds[1]]);
    const reverse = await createPairwiseAgreement(database.db, f.projectId, [f.partyIds[1], f.partyIds[0]]);
    expect(reverse.partyIds).toEqual(forward.partyIds);
  });

  it('cannot be stored with its sides in a second order, so neither side can carry precedence', async () => {
    const f = await projectWithTwoParties();
    const [low, high] = sorted(f.partyIds);
    await withClient(inject('runtimeUrl'), async (c) => {
      const insert = 'insert into pairwise_agreement (project_id, party_one_id, party_two_id) values ($1, $2, $3)';
      expect(await sqlErrorCode(c, insert, [f.projectId, high, low])).toBe(CHECK_VIOLATION);
      expect(await sqlErrorCode(c, insert, [f.projectId, low, high])).toBeNull();
    });
  });

  it('may relate parties of a project without involving its creator', async () => {
    const f = await projectWithTwoParties();
    const created = await createPairwiseAgreement(database.db, f.projectId, f.partyIds);
    const row = await withClient(inject('runtimeUrl'), (c) =>
      c.query('select row_to_json(a)::text as json from pairwise_agreement a where id = $1', [created.id]),
    );
    expect(row.rows[0].json).not.toContain(f.creator);
  });
});

describe('the database rejects', () => {
  it('pairing a party with itself', async () => {
    const f = await projectWithTwoParties();
    const party = f.partyIds[0];
    expect(await failureCode(() => createPairwiseAgreement(database.db, f.projectId, [party, party]))).toBe(
      CHECK_VIOLATION,
    );
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(
        await sqlErrorCode(
          c,
          'insert into pairwise_agreement (project_id, party_one_id, party_two_id) values ($1, $2, $2)',
          [f.projectId, party],
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it('a pair where either party belongs to another project', async () => {
    const f = await projectWithTwoParties();
    const other = await projectWithTwoParties();
    const outsider = other.partyIds[0];
    // Both orders, so each side's constraint is exercised whichever way the
    // pair sorts.
    expect(await failureCode(() => createPairwiseAgreement(database.db, f.projectId, [f.partyIds[0], outsider]))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
    expect(await failureCode(() => createPairwiseAgreement(database.db, f.projectId, [outsider, f.partyIds[1]]))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
    // Nor can the agreement sit under a third project while relating parties of two others.
    expect(
      await failureCode(() => createPairwiseAgreement(database.db, f.projectId, [other.partyIds[0], other.partyIds[1]])),
    ).toBe(FOREIGN_KEY_VIOLATION);
  });

  it('each side independently, when only that side is outside the project', async () => {
    const f = await projectWithTwoParties();
    const other = await projectWithTwoParties();
    const [low, high] = sorted([f.partyIds[0], other.partyIds[0]]);
    const constraint = await withClient(inject('runtimeUrl'), async (c) => {
      try {
        await c.query('insert into pairwise_agreement (project_id, party_one_id, party_two_id) values ($1, $2, $3)', [
          f.projectId,
          low,
          high,
        ]);
        return null;
      } catch (error) {
        return (error as { constraint?: string }).constraint ?? null;
      }
    });
    const outsideSide = low === other.partyIds[0] ? 'one' : 'two';
    expect(constraint).toBe(`pairwise_agreement_party_${outsideSide}_in_project_fk`);
  });

  it('references to parties that do not exist', async () => {
    const f = await projectWithTwoParties();
    expect(await failureCode(() => createPairwiseAgreement(database.db, f.projectId, [f.partyIds[0], randomUUID()]))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
    expect(await failureCode(() => createPairwiseAgreement(database.db, f.projectId, [randomUUID(), randomUUID()]))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it('an agreement under a project that does not exist', async () => {
    const f = await projectWithTwoParties();
    expect(await failureCode(() => createPairwiseAgreement(database.db, randomUUID(), f.partyIds))).toBe(
      FOREIGN_KEY_VIOLATION,
    );
  });
});

describe('the stored relationship carries only the pair', () => {
  it('holds exactly an id, its project and the two parties', async () => {
    const columns = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'pairwise_agreement' order by ordinal_position`,
      ),
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual(['id', 'project_id', 'party_one_id', 'party_two_id']);
  });

  it('references only its project and project-local parties', async () => {
    const references = await withClient(inject('runtimeUrl'), (c) =>
      c.query<{ referenced: string }>(
        `select confrelid::regclass::text as referenced from pg_constraint
         where conrelid = 'public.pairwise_agreement'::regclass and contype = 'f' order by 1`,
      ),
    );
    expect(references.rows.map((r) => r.referenced)).toEqual(['project', 'project_party', 'project_party']);
  });

  it('names no excluded semantic in its columns or constraints', async () => {
    const names = await withClient(inject('runtimeUrl'), async (c) => {
      const columns = await c.query<{ name: string }>(
        `select column_name as name from information_schema.columns
         where table_schema = 'public' and table_name = 'pairwise_agreement'`,
      );
      const constraints = await c.query<{ name: string }>(
        `select conname as name from pg_constraint where conrelid = 'public.pairwise_agreement'::regclass`,
      );
      return [...columns.rows, ...constraints.rows].map((r) => r.name);
    });
    const definitionNames = Object.keys(getTableColumns(pairwiseAgreement)).map((n) => n.toLowerCase());
    const offending = [...names, ...definitionNames].filter((name) =>
      EXCLUDED_SEMANTICS.some((word) => name.includes(word)),
    );
    expect(offending).toEqual([]);
  });

  it('is not reachable over HTTP', () => {
    const agreementOperations = operations.filter((op) => /agreement|pair/i.test(`${op.name} ${op.path}`));
    expect(agreementOperations).toEqual([]);
  });
});

describe('runtime role on the agreement table', () => {
  it('cannot update, delete or truncate agreements (no S02 behaviour needs it)', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'update pairwise_agreement set party_one_id = party_one_id')).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(await sqlErrorCode(c, 'delete from pairwise_agreement')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate pairwise_agreement')).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });
});
