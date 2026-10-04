import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import pino from 'pino';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { readSyntheticEvidence, sha256, writeSyntheticEvidence } from '../../src/stage0/synthetic-evidence.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * Evidence-mechanics probe. Claim under test: with the ordinary runtime
 * credential, synthetic evidence can be written and read back verifiably, and
 * cannot be altered or removed. Out of scope: the migration/owner role and
 * database administrators (see docs/engineering/STAGE-0.md).
 */

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), pino({ level: 'silent' }));
});
afterAll(async () => {
  await database.close();
});

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

describe('synthetic evidence probe (runtime credential)', () => {
  it('writes bytes with their digest, reads back the exact bytes, and verifies them', async () => {
    // Arbitrary binary, including bytes that are not valid UTF-8.
    const payload = new Uint8Array([0x00, 0xff, 0xfe, 0x80, ...randomBytes(4096)]);
    const stored = await writeSyntheticEvidence(database.db, payload);
    expect(hex(stored.sha256)).toBe(hex(sha256(payload)));

    const retrieved = await readSyntheticEvidence(database.db, stored.id);
    expect(retrieved).toBeDefined();
    expect(hex(retrieved!.payload)).toBe(hex(payload));
    expect(hex(retrieved!.sha256)).toBe(hex(sha256(payload)));
    expect(retrieved!.verified).toBe(true);
  });

  it('cannot UPDATE evidence bytes or digest', async () => {
    const payload = randomBytes(64);
    const stored = await writeSyntheticEvidence(database.db, payload);

    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, `update synthetic_evidence set payload = '\\x00'::bytea where id = $1`, [stored.id])).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
      expect(
        await sqlErrorCode(c, `update synthetic_evidence set payload = $2, sha256 = sha256($2) where id = $1`, [
          stored.id,
          Buffer.from('replacement'),
        ]),
      ).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'update synthetic_evidence set sha256 = sha256(payload)')).toBe(INSUFFICIENT_PRIVILEGE);
    });

    const after = await readSyntheticEvidence(database.db, stored.id);
    expect(hex(after!.payload)).toBe(hex(payload));
    expect(after!.verified).toBe(true);
  });

  it('cannot DELETE or TRUNCATE evidence', async () => {
    const stored = await writeSyntheticEvidence(database.db, randomBytes(64));

    await withClient(inject('runtimeUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'delete from synthetic_evidence where id = $1', [stored.id])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'delete from synthetic_evidence')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'truncate synthetic_evidence')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await sqlErrorCode(c, 'drop table synthetic_evidence')).toBe(INSUFFICIENT_PRIVILEGE);
    });

    expect(await readSyntheticEvidence(database.db, stored.id)).toBeDefined();
  });

  it('cannot store a digest that does not match its bytes', async () => {
    await withClient(inject('runtimeUrl'), async (c) => {
      expect(
        await sqlErrorCode(c, 'insert into synthetic_evidence (payload, sha256) values ($1, $2)', [
          Buffer.from('bytes'),
          Buffer.from(sha256(Buffer.from('other bytes'))),
        ]),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it('is outside the threat boundary for the owning role (documented, not claimed)', async () => {
    // The migration role owns the table and is not restricted by the runtime
    // grants. This test pins that fact so the documentation stays honest.
    const stored = await writeSyntheticEvidence(database.db, randomBytes(16));
    await withClient(inject('migrationUrl'), async (c) => {
      expect(await sqlErrorCode(c, 'begin')).toBeNull();
      expect(await sqlErrorCode(c, 'delete from synthetic_evidence where id = $1', [stored.id])).toBeNull();
      expect(await sqlErrorCode(c, 'rollback')).toBeNull();
    });
    expect(await readSyntheticEvidence(database.db, stored.id)).toBeDefined();
  });
});
