import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  POSTGRES_IDENTIFIER_MAX_BYTES,
  findLongIdentifiers,
  isKnownLongIdentifier,
} from '../infrastructure/database/identifier-length.ts';

/**
 * `npm run db:identifiers` (part of `npm run check`). Fails if any reviewed
 * migration quotes a PostgreSQL identifier longer than 63 bytes, apart from
 * the shipped names listed in KNOWN_LONG_IDENTIFIERS.
 */

const dir = 'migrations';
const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
const problems = [];
for (const file of files) {
  for (const item of findLongIdentifiers(file, await readFile(join(dir, file), 'utf8'))) {
    if (!isKnownLongIdentifier(item)) problems.push(item);
  }
}

if (problems.length > 0) {
  for (const p of problems) {
    process.stderr.write(
      `${dir}/${p.file}: "${p.identifier}" is ${p.bytes} bytes; PostgreSQL truncates identifiers to ${POSTGRES_IDENTIFIER_MAX_BYTES}. Give it a shorter explicit name.\n`,
    );
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`Migration identifiers: ${files.length} files, none over ${POSTGRES_IDENTIFIER_MAX_BYTES} bytes.\n`);
}
