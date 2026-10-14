import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { inject } from 'vitest';
import { migrationsFolder } from '../../src/infrastructure/database/migrate.ts';
import { withDatabase } from './urls.ts';
import { withClient } from './sql.ts';

/**
 * Test-only: put a scratch database at a historical migration boundary.
 *
 * Drizzle's runtime migrator reads only `meta/_journal.json` and the
 * `<tag>.sql` file of each journal entry (snapshots are for drizzle-kit, not
 * the runner). It records each applied migration as (sha256 of the file,
 * the entry's `when`) and later applies only entries whose `when` is newer
 * than the newest recorded one. So a temporary folder holding byte-identical
 * copies of the migrations up to a tag, with the journal cut at that entry,
 * produces exactly the bookkeeping a real database at that point would have.
 * Continuing with the production `runMigrations` (or a later boundary) then
 * applies only what remains. Nothing here edits a migration or adds a
 * production API.
 */

interface JournalEntry {
  readonly idx: number;
  readonly tag: string;
  readonly when: number;
}
interface Journal {
  readonly entries: readonly JournalEntry[];
}

export function journal(): Journal {
  return JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as Journal;
}

/** Migrates `migrationUrl` through `lastTag` (inclusive), using the repository's own migration files. */
export async function migrateThrough(migrationUrl: string, lastTag: string): Promise<void> {
  const full = journal();
  const cut = full.entries.findIndex((entry) => entry.tag === lastTag);
  if (cut === -1) throw new Error(`No migration ${lastTag} in the journal`);
  const entries = full.entries.slice(0, cut + 1);

  const folder = mkdtempSync(join(tmpdir(), 'ms-migration-boundary-'));
  try {
    mkdirSync(join(folder, 'meta'));
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...full, entries }, null, 2));
    for (const entry of entries) copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));

    const pool = new pg.Pool({ connectionString: migrationUrl, max: 1 });
    try {
      await migrate(drizzle({ client: pool }), { migrationsFolder: folder });
    } finally {
      await pool.end();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

export interface ScratchDatabase {
  readonly name: string;
  /** Migration (owner) credential. */
  readonly migrationUrl: string;
  /** Runtime credential. */
  readonly runtimeUrl: string;
  drop(): Promise<void>;
}

/** A new empty database, dropped by `drop()`. */
export async function createScratchDatabase(): Promise<ScratchDatabase> {
  const name = `ms_upgrade_${randomUUID().replaceAll('-', '')}`;
  const admin = inject('adminUrl');
  await withClient(admin, (c) => c.query(`CREATE DATABASE ${name}`));
  return {
    name,
    migrationUrl: withDatabase(admin, name),
    runtimeUrl: withDatabase(inject('runtimeUrl'), name),
    drop: () => withClient(admin, (c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)).then(() => undefined),
  };
}
