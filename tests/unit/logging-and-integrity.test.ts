import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { serializeError } from '../../src/app/logger.ts';
import { withClient } from '../support/sql.ts';
import { sha256, verifyEvidence } from '../../src/stage0/synthetic-evidence.ts';

describe('error serialization keeps data out of logs', () => {
  it('drops the parameters a Drizzle query error embeds in its message', () => {
    // Shape of drizzle-orm's DrizzleQueryError (message repeats query and params).
    const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      detail: 'Key (label)=(private-value) already exists.',
    });
    const error = Object.assign(new Error('Failed query: insert ... params: private-value'), {
      name: 'DrizzleQueryError',
      query: 'insert into synthetic_resource ...',
      params: ['private-value'],
      cause,
    });

    const serialized = JSON.stringify(serializeError(error));

    expect(serialized).not.toContain('private-value');
    expect(serialized).toContain('23505');
    expect(serialized).toContain('DrizzleQueryError');
  });

  it('reduces a real PostgreSQL error to its SQLSTATE, dropping the value it quotes', async () => {
    const error = await withClient(inject('runtimeUrl'), async (c) => {
      try {
        await c.query('select $1::int', ['Secret-Param-Value']);
      } catch (caught) {
        return caught;
      }
      throw new Error('expected the query to fail');
    });
    // The raw error does contain the value; the serialized form must not.
    expect(String((error as Error).message)).toContain('Secret-Param-Value');
    const serialized = serializeError(error);
    expect(serialized.code).toBe('22P02');
    expect(JSON.stringify(serialized)).not.toContain('Secret-Param-Value');
  });

  it('keeps type, message and code, and nothing else, for ordinary errors', () => {
    const error = Object.assign(new Error('boom'), { code: 'E_X', row: { secret: 'value' } });
    const serialized = serializeError(error);
    expect(serialized.type).toBe('Error');
    expect(serialized.message).toBe('boom');
    expect(serialized.code).toBe('E_X');
    expect(JSON.stringify(serialized)).not.toContain('secret');
  });
});

describe('evidence digest', () => {
  it('verifies the bytes it was computed from', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(verifyEvidence(bytes, sha256(bytes))).toBe(true);
  });

  it('detects a single changed byte', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const digest = sha256(bytes);
    const altered = Uint8Array.from(bytes);
    altered[2] = 3;
    expect(verifyEvidence(altered, digest)).toBe(false);
  });

  it('detects truncation', () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    expect(verifyEvidence(bytes.subarray(0, 3), sha256(bytes))).toBe(false);
  });
});
