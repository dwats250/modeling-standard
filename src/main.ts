import { sql } from 'drizzle-orm';
import { createApp } from './app/create-app.ts';
import { createLogger } from './app/logger.ts';
import { ConfigError, loadAppConfig } from './config/config.ts';
import { openDatabase } from './infrastructure/database/client.ts';
import { createGoogleProvider } from './identity/google.ts';
import { createSessionResolver } from './sessions/session.ts';

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

// The only principal source is the session cookie (S12). Google is the only
// identity provider, registered only when its client is completely
// configured (configuration refuses a partial one); without it nobody can
// sign in and every protected operation is denied. Production serves no
// screens and has no operator, so nothing here creates a shoot or an
// invitation. Cookie-bearing POSTs are accepted only from PUBLIC_BASE_URL's
// origin; with none configured, from nowhere.
const app = createApp({
  db: database.db,
  logger,
  resolvePrincipal: createSessionResolver(database.db),
  allowedOrigins: config.publicOrigin === null ? [] : [config.publicOrigin],
  secureCookies: config.publicOrigin?.startsWith('https:') === true,
  identity: { providers: config.google === null ? [] : [createGoogleProvider(config.google)] },
});

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
