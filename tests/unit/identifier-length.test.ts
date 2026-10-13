import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IdentifierScanError,
  KNOWN_LONG_IDENTIFIERS,
  checkMigrationIdentifiers,
  findLongIdentifiers,
  isKnownLongIdentifier,
} from '../../src/infrastructure/database/identifier-length.ts';
import { migrationsFolder } from '../../src/infrastructure/database/migrate.ts';

/** The 63-byte identifier guard behind `npm run db:identifiers`. */

const long = 'a'.repeat(64);
const names = (sql: string): string[] => findLongIdentifiers('0099_example.sql', sql).map((i) => i.identifier);

describe('findLongIdentifiers: the limit', () => {
  it('passes 63 bytes and flags 64', () => {
    const ok = 'a'.repeat(63);
    expect(findLongIdentifiers('x.sql', `ALTER TABLE "t" ADD CONSTRAINT "${ok}" CHECK (true);`)).toEqual([]);
    expect(findLongIdentifiers('x.sql', `ALTER TABLE "t" ADD CONSTRAINT "${long}" CHECK (true);`)).toEqual([
      { file: 'x.sql', identifier: long, bytes: 64, line: 1 },
    ]);
  });

  it('counts UTF-8 bytes, not characters', () => {
    const sixtyThreeChars = `${'a'.repeat(62)}é`; // 64 bytes
    const sixtyThreeBytes = `${'a'.repeat(61)}é`; // 63 bytes
    expect(names(`"${sixtyThreeChars}"`)).toEqual([sixtyThreeChars]);
    expect(names(`"${sixtyThreeBytes}"`)).toEqual([]);
    const multibyte = 'ü'.repeat(32); // 64 bytes, 32 characters
    expect(findLongIdentifiers('x.sql', `CREATE TABLE "${multibyte}" (i int);`)[0]).toMatchObject({ bytes: 64 });
  });

  it('reads doubled quotes inside a quoted name as one character', () => {
    expect(names(`"${'a'.repeat(62)}"""`)).toEqual([]); // 63 bytes once unescaped
    expect(names(`"${'a'.repeat(63)}"""`)).toEqual([`${'a'.repeat(63)}"`]); // 64 bytes
  });

  it('checks each part of a schema-qualified name, and names spanning lines', () => {
    expect(names(`CREATE TABLE "public"."${long}" (i int);`)).toEqual([long]);
    const multiline = `${'a'.repeat(40)}\n${'b'.repeat(40)}`;
    expect(findLongIdentifiers('x.sql', `SELECT 1;\nCREATE TABLE "${multiline}" (i int);`)).toEqual([
      { file: 'x.sql', identifier: multiline, bytes: 81, line: 2 },
    ]);
  });
});

describe('findLongIdentifiers: text that cannot define an identifier (Astra R01)', () => {
  it('is not fooled by a quote in a line comment (Astra reproduction 1)', () => {
    expect(names(`-- "comment\nCREATE TABLE "${long}" (i int);`)).toEqual([long]);
  });

  it('is not fooled by a quote in a string literal (Astra reproduction 2)', () => {
    expect(names(`SELECT '"'; CREATE TABLE "${long}" (i int);`)).toEqual([long]);
  });

  it('skips block comments containing quotes, including nested ones', () => {
    expect(names(`/* " */ CREATE TABLE "${long}" (i int);`)).toEqual([long]);
    expect(names(`/* outer /* " inner */ still " comment */ CREATE TABLE "${long}" (i int);`)).toEqual([long]);
    expect(names(`/* "${long}" */ SELECT 1;`)).toEqual([]);
  });

  it('skips string literals with doubled quotes and E-string escapes', () => {
    expect(names(`SELECT 'it''s "x'; CREATE TABLE "${long}" (i int);`)).toEqual([long]);
    expect(names(`SELECT E'\\' "'; CREATE TABLE "${long}" (i int);`)).toEqual([long]);
    expect(names(`SELECT '"${long}"';`)).toEqual([]);
  });

  it('keeps scanning after dollar-quoted content containing quotes', () => {
    expect(names(`CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $$ SELECT '"' $$;\nCREATE TABLE "${long}" (i int);`)).toEqual([long]);
    expect(names(`DO $body$ BEGIN PERFORM '"'; END $body$;\nCREATE TABLE "${long}" (i int);`)).toEqual([long]);
  });

  it('checks quoted identifiers inside dollar-quoted function bodies', () => {
    expect(names(`CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM "${long}"; END $$;`)).toEqual([long]);
  });

  it('does not take a positional parameter or a $ inside a name for a dollar quote', () => {
    expect(names(`SELECT $1, price$ FROM t; CREATE TABLE "${long}" (i int);`)).toEqual([long]);
  });
});

describe('findLongIdentifiers: fails closed on what it cannot scan', () => {
  for (const [label, sql] of [
    ['an unterminated string literal', `SELECT 'oops; CREATE TABLE "${long}" (i int);`],
    ['an unterminated block comment', `/* oops CREATE TABLE "${long}" (i int);`],
    ['an unterminated quoted identifier', `CREATE TABLE "oops (i int);`],
    ['an unterminated dollar quote', `DO $$ BEGIN END; CREATE TABLE "${long}" (i int);`],
    ['a dollar-quoted body that does not scan as SQL', `SELECT $$it's$$;`],
    ['a U&"…" identifier', `CREATE TABLE U&"d\\0061ta" (i int);`],
  ] as const) {
    it(`throws on ${label}`, () => {
      expect(() => findLongIdentifiers('0099_example.sql', sql)).toThrow(IdentifierScanError);
    });
  }
});

describe('shipped exceptions', () => {
  it('excuse a shipped name only in its own file', () => {
    const known = KNOWN_LONG_IDENTIFIERS[0]!;
    expect(isKnownLongIdentifier({ file: known.file, identifier: known.identifier })).toBe(true);
    expect(isKnownLongIdentifier({ file: '0099_new.sql', identifier: known.identifier })).toBe(false);
    expect(isKnownLongIdentifier({ file: known.file, identifier: `${known.identifier}x` })).toBe(false);
  });
});

describe('checkMigrationIdentifiers (the db:identifiers contract)', () => {
  const exception = { file: '0001_old.sql', identifier: long, fixedBy: '0002_fix.sql' };
  function dir(files: Record<string, string>): string {
    const path = mkdtempSync(join(tmpdir(), 'ms-identifiers-'));
    for (const [name, sql] of Object.entries(files)) writeFileSync(join(path, name), sql);
    return path;
  }

  it('passes the reviewed migrations', () => {
    expect(checkMigrationIdentifiers(migrationsFolder)).toEqual([]);
    expect(readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql')).length).toBeGreaterThan(0);
  });

  it('passes a listed exception that is present and fixed forward', () => {
    const path = dir({ '0001_old.sql': `CREATE TABLE "${long}" (i int);`, '0002_fix.sql': 'SELECT 1;' });
    expect(checkMigrationIdentifiers(path, [exception])).toEqual([]);
  });

  it('fails an unlisted long name, and a listed name found in another file', () => {
    const path = dir({ '0001_old.sql': 'SELECT 1;', '0002_fix.sql': `CREATE TABLE "${long}" (i int);` });
    const problems = checkMigrationIdentifiers(path, [exception]);
    expect(problems.some((p) => p.includes('0002_fix.sql:1') && p.includes('64 bytes'))).toBe(true);
    expect(problems.some((p) => p.includes('0001_old.sql') && p.includes('no longer there'))).toBe(true);
  });

  it('fails when the listed historical file is missing', () => {
    const path = dir({ '0002_fix.sql': 'SELECT 1;' });
    expect(checkMigrationIdentifiers(path, [exception])).toEqual([expect.stringContaining('0001_old.sql: listed as a shipped exception, but the file does not exist')]);
  });

  it('fails when the fixedBy migration is missing', () => {
    const path = dir({ '0001_old.sql': `CREATE TABLE "${long}" (i int);` });
    expect(checkMigrationIdentifiers(path, [exception])).toEqual([expect.stringContaining('0002_fix.sql: named as the fix')]);
  });

  it('fails a migration it cannot scan', () => {
    const path = dir({ '0001_bad.sql': "SELECT 'unterminated;" });
    expect(checkMigrationIdentifiers(path, [])).toEqual([expect.stringContaining('0001_bad.sql:1: unterminated string literal')]);
  });

  it('keeps the real exception exact: 0009 still holds the name and 0014 still exists', () => {
    for (const known of KNOWN_LONG_IDENTIFIERS) {
      expect(readFileSync(join(migrationsFolder, known.file), 'utf8')).toContain(`"${known.identifier}"`);
      expect(readdirSync(migrationsFolder)).toContain(known.fixedBy);
    }
  });
});
