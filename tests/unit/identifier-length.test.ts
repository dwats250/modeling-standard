import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KNOWN_LONG_IDENTIFIERS,
  findLongIdentifiers,
  isKnownLongIdentifier,
} from '../../src/infrastructure/database/identifier-length.ts';
import { migrationsFolder } from '../../src/infrastructure/database/migrate.ts';

/** The 63-byte identifier guard behind `npm run db:identifiers`. */

describe('findLongIdentifiers', () => {
  it('passes 63 bytes and flags 64', () => {
    const ok = 'a'.repeat(63);
    const long = 'a'.repeat(64);
    expect(findLongIdentifiers('x.sql', `ALTER TABLE "t" ADD CONSTRAINT "${ok}" CHECK (true);`)).toEqual([]);
    expect(findLongIdentifiers('x.sql', `ALTER TABLE "t" ADD CONSTRAINT "${long}" CHECK (true);`)).toEqual([
      { file: 'x.sql', identifier: long, bytes: 64 },
    ]);
  });

  it('counts bytes, not characters', () => {
    const multibyte = `${'a'.repeat(62)}é`; // 63 characters, 64 bytes
    expect(findLongIdentifiers('x.sql', `"${multibyte}"`)).toEqual([{ file: 'x.sql', identifier: multibyte, bytes: 64 }]);
  });

  it('reads doubled quotes inside a quoted name as one character', () => {
    const name = `${'a'.repeat(62)}"`; // 63 bytes once unescaped
    expect(findLongIdentifiers('x.sql', `"${'a'.repeat(62)}"""`)).toEqual([]);
    expect(name.length).toBe(63);
  });

  it('excuses a shipped name only in its own file', () => {
    const known = KNOWN_LONG_IDENTIFIERS[0]!;
    const [inPlace] = findLongIdentifiers(known.file, `"${known.identifier}"`);
    const [elsewhere] = findLongIdentifiers('0099_new.sql', `"${known.identifier}"`);
    expect(isKnownLongIdentifier(inPlace!)).toBe(true);
    expect(isKnownLongIdentifier(elsewhere!)).toBe(false);
  });
});

describe('the reviewed migrations', () => {
  const files = readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql')).sort();

  it('quote no identifier over 63 bytes except the shipped, fixed-forward ones', () => {
    const unexpected = files.flatMap((f) => findLongIdentifiers(f, readFileSync(join(migrationsFolder, f), 'utf8'))).filter((i) => !isKnownLongIdentifier(i));
    expect(unexpected).toEqual([]);
  });

  it('list only shipped names that are still present and are fixed by an existing migration', () => {
    for (const known of KNOWN_LONG_IDENTIFIERS) {
      expect(readFileSync(join(migrationsFolder, known.file), 'utf8')).toContain(`"${known.identifier}"`);
      expect(existsSync(join(migrationsFolder, known.fixedBy))).toBe(true);
    }
  });
});
