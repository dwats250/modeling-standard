import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger } from 'pino';

export type Database = NodePgDatabase;

/** Either the database or an open transaction; data functions accept both. */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DatabaseHandle {
  readonly db: Database;
  close(): Promise<void>;
}

/**
 * Opens the runtime connection pool. The URL must carry the runtime
 * credential, never the migration credential (see docs/engineering/STAGE-0.md).
 */
export function openDatabase(url: string, logger: Logger): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // An idle client can fail (for example, the server restarts). Without a
  // listener, pg would crash the process with an unhandled 'error' event.
  pool.on('error', (err) => {
    logger.error({ err }, 'idle database client error');
  });
  return {
    db: drizzle({ client: pool }),
    close: () => pool.end(),
  };
}
