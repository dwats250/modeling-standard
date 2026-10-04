import { sql } from 'drizzle-orm';
import { createApp } from './app/create-app.ts';
import { createLogger } from './app/logger.ts';
import { resolveNoPrincipal } from './authorization/access.ts';
import { ConfigError, loadAppConfig } from './config/config.ts';
import { openDatabase } from './infrastructure/database/client.ts';

/**
 * Process entry point: the only place that reads the environment. Validates
 * configuration, confirms the database is reachable, then serves. Any failure
 * before listening exits non-zero.
 */

let config;
try {
  config = loadAppConfig(process.env);
} catch (error) {
  process.stderr.write(`${error instanceof ConfigError ? error.message : 'Invalid configuration'}\n`);
  process.exit(1);
}

const logger = createLogger(config.logLevel);
const database = openDatabase(config.databaseUrl, logger);

try {
  await database.db.execute(sql`select 1`);
} catch (err) {
  logger.fatal({ err }, 'database unreachable at boot');
  await database.close();
  process.exit(1);
}

// Stage 0 has no credential mechanism, so no request ever carries a principal
// and every protected operation is denied. That is deliberate.
const app = createApp({ db: database.db, logger, resolvePrincipal: resolveNoPrincipal });

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutting down');
  await app.close();
  await database.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  logger.fatal({ err }, 'failed to start listening');
  await database.close();
  process.exit(1);
}
