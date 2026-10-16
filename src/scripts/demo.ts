import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createApp } from '../app/create-app.ts';
import { createLogger } from '../app/logger.ts';
import { ConfigError, loadAppConfig } from '../config/config.ts';
import { DemoGuardError, demoDatabaseTarget, demoListenTarget, demoOperatorPrincipal } from '../demo/demo.ts';
import { demoOperations } from '../demo/operations.ts';
import { createDemoServer } from '../demo/server.ts';
import { openDatabase, type DatabaseTarget } from '../infrastructure/database/client.ts';

/**
 * `npm run demo`. Serves the synthetic demo on loopback against the demo
 * database only. Not a production entry point: `src/main.ts` is, and it has
 * no principal and no demo operations.
 */

let config;
let runtime: DatabaseTarget;
let port: number;
let listen: ReturnType<typeof demoListenTarget>;
try {
  config = loadAppConfig(process.env);
  const lanMode = process.argv.includes('--lan');
  listen = demoListenTarget(config.host, lanMode);
  runtime = demoDatabaseTarget(config.databaseUrl);
  port = Number(process.env.DEMO_PORT ?? '3100');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError(['DEMO_PORT: must be an integer between 1 and 65535']);
} catch (error) {
  const message = error instanceof ConfigError || error instanceof DemoGuardError ? error.message : 'Invalid configuration';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const logger = createLogger(config.logLevel);
const database = openDatabase(runtime, logger);
try {
  await database.db.execute(sql`select 1 from project limit 1`);
} catch {
  process.stderr.write('The demo database is missing or not migrated. Run `npm run demo:reset` first.\n');
  await database.close();
  process.exit(1);
}

const app = createApp({
  db: database.db,
  logger,
  resolvePrincipal: demoOperatorPrincipal,
  additionalOperations: demoOperations,
});
await app.ready();

const server = createDemoServer({ app, fixturePath: resolve(process.cwd(), '.demo', 'fixture.json'), allowedHosts: listen.allowedHosts });
server.listen(port, listen.listenHost, () => {
  process.stdout.write('Synthetic demo (not for real people):\n');
  for (const host of listen.urls) process.stdout.write(`  http://${host}:${port}/\n`);
});

const shutdown = (): void => {
  server.close();
  void app.close().then(() => database.close());
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
