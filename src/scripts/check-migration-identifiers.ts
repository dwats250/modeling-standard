import { readdirSync } from 'node:fs';
import { POSTGRES_IDENTIFIER_MAX_BYTES, checkMigrationIdentifiers } from '../infrastructure/database/identifier-length.ts';

/**
 * `npm run db:identifiers` (part of `npm run check`). Fails if any reviewed
 * migration quotes a PostgreSQL identifier longer than 63 bytes, apart from
 * the shipped names listed in KNOWN_LONG_IDENTIFIERS; if a migration cannot
 * be scanned; or if a listed exception no longer holds (its file, its
 * identifier in that file, or the migration that fixes it is missing).
 */

const dir = 'migrations';
const problems = checkMigrationIdentifiers(dir);

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exitCode = 1;
} else {
  const count = readdirSync(dir).filter((name) => name.endsWith('.sql')).length;
  process.stdout.write(`Migration identifiers: ${count} files scanned, none over ${POSTGRES_IDENTIFIER_MAX_BYTES} bytes except listed shipped names.\n`);
}
