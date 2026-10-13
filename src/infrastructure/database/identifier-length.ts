import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PostgreSQL silently truncates identifiers longer than 63 bytes
 * (NAMEDATALEN - 1), so a name in a migration can differ from the name in
 * the catalog. This finds double-quoted identifiers over that limit in
 * migration SQL.
 *
 * It is a small lexer, not a SQL parser: it knows only the token boundaries
 * that decide where a quoted identifier can start and end.
 *
 * - `-- …` line comments and `/* … *\/` block comments (nested, as in
 *   PostgreSQL) are skipped;
 * - `'…'` string literals are skipped, with doubled quotes, and backslash
 *   escapes in `E'…'` strings;
 * - `"…"` quoted identifiers are read, with doubled quotes, across lines;
 *   their UTF-8 byte length is what counts;
 * - `$tag$ … $tag$` dollar-quoted bodies (function bodies) are scanned again
 *   as SQL, so identifiers inside them are checked too.
 *
 * Fail closed: anything it cannot scan cleanly — an unterminated comment,
 * string, identifier or dollar quote, a dollar-quoted body that does not scan
 * as SQL, or a `U&"…"` identifier whose escapes would change its length —
 * throws, and the check fails rather than skipping it. Unquoted identifiers
 * are not checked.
 */

export const POSTGRES_IDENTIFIER_MAX_BYTES = 63;

export interface LongIdentifier {
  readonly file: string;
  readonly identifier: string;
  readonly bytes: number;
  readonly line: number;
}

export class IdentifierScanError extends Error {
  constructor(file: string, line: number, what: string) {
    super(`${file}:${line}: ${what}; the identifier check cannot scan past it`);
    this.name = 'IdentifierScanError';
  }
}

/**
 * Over-long names that already shipped in a merged migration. They cannot be
 * edited; each must be fixed forward by a later migration, named here.
 */
export const KNOWN_LONG_IDENTIFIERS: readonly { readonly file: string; readonly identifier: string; readonly fixedBy: string }[] = [
  {
    file: '0009_presented_versions.sql',
    identifier: 'agreement_version_pairwise_agreement_id_pairwise_agreement_id_fk',
    fixedBy: '0014_agreement_version_fk_name.sql',
  },
];

const IDENTIFIER_CHAR = /[A-Za-z0-9_$\u0080-￿]/;

function lineAt(sql: string, index: number, baseLine: number): number {
  let line = baseLine;
  for (let i = 0; i < index; i += 1) if (sql.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Every double-quoted identifier in `sql`, with its line. Throws IdentifierScanError if it cannot scan. */
function quotedIdentifiers(file: string, sql: string, baseLine = 1): { name: string; line: number }[] {
  const found: { name: string; line: number }[] = [];
  const fail = (at: number, what: string): never => {
    throw new IdentifierScanError(file, lineAt(sql, at, baseLine), what);
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    const next = sql[i + 1];
    const prev = i > 0 ? sql[i - 1]! : '';

    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }

    if (c === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (depth > 0) {
        if (j >= sql.length) fail(i, 'unterminated block comment');
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth += 1;
          j += 2;
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth -= 1;
          j += 2;
        } else j += 1;
      }
      i = j;
      continue;
    }

    if (c === "'") {
      // E'…' strings take backslash escapes; standard strings do not.
      const escapes = /[Ee]/.test(prev) && !IDENTIFIER_CHAR.test(i > 1 ? sql[i - 2]! : ' ');
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) fail(i, 'unterminated string literal');
        if (escapes && sql[j] === '\\') j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      i = j + 1;
      continue;
    }

    if (c === '"') {
      if (/[Uu]/.test(sql[i - 2] ?? '') && prev === '&') fail(i, 'U&"…" identifier (escapes would change its length)');
      let j = i + 1;
      let name = '';
      for (;;) {
        if (j >= sql.length) fail(i, 'unterminated quoted identifier');
        if (sql[j] === '"' && sql[j + 1] === '"') {
          name += '"';
          j += 2;
        } else if (sql[j] === '"') break;
        else {
          name += sql[j];
          j += 1;
        }
      }
      found.push({ name, line: lineAt(sql, i, baseLine) });
      i = j + 1;
      continue;
    }

    if (c === '$' && !IDENTIFIER_CHAR.test(prev)) {
      const tag = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        if (close === -1) fail(i, `unterminated dollar quote ${tag[0]}`);
        const bodyStart = i + tag[0].length;
        // The body (in these migrations, a function body) is scanned as SQL
        // too. If it does not scan, the check fails rather than skipping it.
        found.push(...quotedIdentifiers(file, sql.slice(bodyStart, close), lineAt(sql, bodyStart, baseLine)));
        i = close + tag[0].length;
        continue;
      }
    }

    i += 1;
  }
  return found;
}

export function findLongIdentifiers(file: string, sql: string): LongIdentifier[] {
  return quotedIdentifiers(file, sql)
    .map(({ name, line }) => ({ file, identifier: name, bytes: Buffer.byteLength(name, 'utf8'), line }))
    .filter((item) => item.bytes > POSTGRES_IDENTIFIER_MAX_BYTES);
}

export function isKnownLongIdentifier(item: Pick<LongIdentifier, 'file' | 'identifier'>): boolean {
  return KNOWN_LONG_IDENTIFIERS.some((known) => known.file === item.file && known.identifier === item.identifier);
}

/**
 * The whole check behind `npm run db:identifiers`: every migration scans,
 * no quoted identifier is over 63 bytes except a listed shipped one, and each
 * listed exception still holds (its file exists, it still contains exactly
 * that identifier, and the migration that fixes it forward exists).
 * Returns the problems found; an empty list means the check passes.
 */
export function checkMigrationIdentifiers(dir: string, known = KNOWN_LONG_IDENTIFIERS): string[] {
  const problems: string[] = [];
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  const longByFile = new Map<string, LongIdentifier[]>();
  for (const file of files) {
    try {
      longByFile.set(file, findLongIdentifiers(file, readFileSync(join(dir, file), 'utf8')));
    } catch (error) {
      if (!(error instanceof IdentifierScanError)) throw error;
      problems.push(`${dir}/${error.message}`);
    }
  }
  for (const [file, items] of longByFile) {
    for (const item of items) {
      const excused = known.some((k) => k.file === item.file && k.identifier === item.identifier);
      if (!excused) {
        problems.push(
          `${dir}/${file}:${item.line}: "${item.identifier}" is ${item.bytes} bytes; PostgreSQL truncates identifiers to ${POSTGRES_IDENTIFIER_MAX_BYTES}. Give it a shorter explicit name.`,
        );
      }
    }
  }
  for (const k of known) {
    if (!existsSync(join(dir, k.file))) {
      problems.push(`${dir}/${k.file}: listed as a shipped exception, but the file does not exist`);
    } else if (longByFile.has(k.file) && !longByFile.get(k.file)!.some((item) => item.identifier === k.identifier)) {
      problems.push(`${dir}/${k.file}: listed exception "${k.identifier}" is no longer there; remove it from the list`);
    }
    if (!existsSync(join(dir, k.fixedBy))) {
      problems.push(`${dir}/${k.fixedBy}: named as the fix for "${k.identifier}", but the file does not exist`);
    }
  }
  return problems;
}
