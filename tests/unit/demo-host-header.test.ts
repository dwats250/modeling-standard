import { describe, expect, it } from 'vitest';
import { isOwnLoopbackAuthority } from '../../src/demo/server.ts';

/** Astra B01 (adjacent): the demo server's Host header must be exactly a loopback authority for its own port. */

describe('isOwnLoopbackAuthority', () => {
  const port = 3100;

  it('accepts the loopback names with the exact port', () => {
    for (const host of ['127.0.0.1:3100', 'localhost:3100', 'LOCALHOST:3100', '[::1]:3100']) {
      expect({ host, ok: isOwnLoopbackAuthority(host, port) }).toEqual({ host, ok: true });
    }
  });

  it('rejects userinfo, paths, query, fragment, whitespace, malformed or foreign authorities and wrong ports', () => {
    for (const host of [
      'evil@127.0.0.1:3100',
      '127.0.0.1:3100/evil',
      '127.0.0.1:3100?x=1',
      '127.0.0.1:3100#x',
      ' 127.0.0.1:3100',
      '127.0.0.1:3100 ',
      '127.0.0.1:03100',
      '127.0.0.1:3101',
      '127.0.0.1:',
      '127.0.0.1',
      '::1:3100',
      '[::1]',
      '127.0.0.2:3100',
      'evil.example.com:3100',
      '127.0.0.1.evil.example.com:3100',
      '',
    ]) {
      expect({ host, ok: isOwnLoopbackAuthority(host, port) }).toEqual({ host, ok: false });
    }
    expect(isOwnLoopbackAuthority(undefined, port)).toBe(false);
  });

  it('allows an omitted port only when the server is on port 80', () => {
    expect(isOwnLoopbackAuthority('127.0.0.1', 80)).toBe(true);
    expect(isOwnLoopbackAuthority('127.0.0.1:80', 80)).toBe(true);
    expect(isOwnLoopbackAuthority('127.0.0.1', 3100)).toBe(false);
  });
});
