import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import pino from 'pino';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { findSyntheticResource, insertSyntheticResource } from '../../src/stage0/synthetic-resource.ts';

/** Transactions roll back on failure and commit on success, using the module's own data functions. */

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), pino({ level: 'silent' }));
});
afterAll(async () => {
  await database.close();
});

describe('transactions', () => {
  it('roll back every write when the transaction fails', async () => {
    let insertedId: string | undefined;
    const failure = new Error('fail after write');

    await expect(
      database.db.transaction(async (tx) => {
        const row = await insertSyntheticResource(tx, { ownerPrincipalId: 'tx-principal', label: 'rolled back' });
        insertedId = row.id;
        // Visible inside the transaction...
        expect(await findSyntheticResource(tx, row.id)).toBeDefined();
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(insertedId).toBeDefined();
    // ...and gone after it.
    expect(await findSyntheticResource(database.db, insertedId as string)).toBeUndefined();
  });

  it('commit every write when the transaction succeeds', async () => {
    const id = await database.db.transaction(async (tx) => {
      const row = await insertSyntheticResource(tx, { ownerPrincipalId: 'tx-principal', label: 'committed' });
      return row.id;
    });
    expect(await findSyntheticResource(database.db, id)).toMatchObject({ id, label: 'committed' });
  });
});
