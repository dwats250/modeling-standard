import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { createLogger } from '../app/logger.ts';
import { ConfigError } from '../config/config.ts';
import { createDemoApplication } from '../demo/application.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../demo/annotations.ts';
import { DEMO_DATABASE, DemoGuardError, demoDatabaseTarget } from '../demo/demo.ts';
import { createReviewerGate, loadReviewerConfigFromFile, type ReviewerConfig } from '../demo/reviewer.ts';
import { createDemoServer } from '../demo/server.ts';
import { openDatabase, type DatabaseTarget } from '../infrastructure/database/client.ts';

/**
 * `npm run demo:reviewer`. Serves the local synthetic demo on loopback,
 * behind a local HTTPS proxy and the reviewer gate (`src/demo/reviewer.ts`),
 * against `modeling_standard_demo` only. Reset and seed stay `npm run
 * demo:reset`. Not a production entry point, and not staging.
 *
 * Configuration comes only from the reviewer env file
 * (`~/.config/modeling-standard/reviewer.env`, or `MS_REVIEWER_ENV_FILE`),
 * an owner-only regular file; the process environment is not read for
 * settings, so a worktree's `.env` can never point reviewer mode anywhere.
 */

let config: ReviewerConfig;
let runtime: DatabaseTarget;
try {
  config = loadReviewerConfigFromFile(process.env.MS_REVIEWER_ENV_FILE);
  runtime = demoDatabaseTarget(config.app.databaseUrl);
} catch (error) {
  const message = error instanceof ConfigError || error instanceof DemoGuardError ? error.message : 'Invalid reviewer configuration';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const logger = createLogger(config.app.logLevel);
const database = openDatabase(runtime, logger);
try {
  await database.db.execute(sql`select 1 from project limit 1`);
} catch {
  process.stderr.write(`The demo database ${DEMO_DATABASE} is missing or not migrated. Run \`npm run demo:reset\` first.\n`);
  await database.close();
  process.exit(1);
}

const annotations = new AnnotationStore(resolve(process.cwd(), '.demo', ANNOTATIONS_FILE));
const { app, issuer } = await createDemoApplication({ db: database.db, logger, annotations, reviewer: { publicOrigin: config.publicOrigin } });
const gate = createReviewerGate({
  publicOrigin: config.publicOrigin,
  accessKey: config.accessKey,
  sessionSeconds: config.sessionSeconds,
  warn: (message) => logger.warn(message),
});

const server = createDemoServer({ app, annotations, publicAuthority: config.publicAuthority, testIssuer: issuer, reviewer: gate });
server.listen(config.app.port, config.app.host, () => {
  process.stdout.write(
    'Synthetic demo in reviewer mode (invented people; nothing here is real; sign-in is a local test provider, not Google or Apple):\n' +
      `  public:  ${config.publicOrigin}/reviewer  (needs the reviewer access key)\n` +
      `  listens: http://${config.app.host}:${config.app.port}/ (loopback, behind the HTTPS proxy only)\n` +
      `  reviewer sessions last ${config.sessionSeconds} s; stopping this process ends all of them.\n` +
      'Stop it with Ctrl+C.\n',
  );
});

server.on('error', (error: NodeJS.ErrnoException) => {
  process.stderr.write(
    error.code === 'EADDRINUSE' ? `Port ${config.app.port} is already in use: is reviewer mode already running?\n` : `Reviewer mode could not listen: ${error.message}\n`,
  );
  void app.close().then(() => database.close()).finally(() => process.exit(1));
});

const shutdown = (): void => {
  gate.revokeAll();
  server.close();
  void app.close().then(() => database.close());
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
