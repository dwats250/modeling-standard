import { resolve } from 'node:path';
import { createLogger } from '../app/logger.ts';
import { ConfigError } from '../config/config.ts';
import { createDemoApplication } from '../demo/application.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../demo/annotations.ts';
import { DemoGuardError, demoDatabaseTarget } from '../demo/demo.ts';
import { assertReviewerDatabaseBoundary } from '../demo/reviewer-database.ts';
import { applyReviewerServerLimits, assertReviewerStateDir, createReviewerGate, inheritedEnvironmentProblems, loadReviewerConfigFromFile, type ReviewerConfig } from '../demo/reviewer.ts';
import { createDemoServer } from '../demo/server.ts';
import { openDatabase, type DatabaseTarget } from '../infrastructure/database/client.ts';

/**
 * `npm run demo:reviewer`. Serves the local synthetic demo on loopback,
 * behind a local HTTPS proxy and the reviewer gate (`src/demo/reviewer.ts`),
 * against `modeling_standard_demo` only. It holds the runtime credential and
 * no other; preparing the database is `src/scripts/demo-reviewer-bootstrap.ts`,
 * a separate command with a separate env file. Not a production entry point,
 * and not staging.
 *
 * Configuration comes only from the reviewer env file
 * (`~/.config/modeling-standard/reviewer.env`, or `MS_REVIEWER_ENV_FILE`),
 * an owner-only regular file; the process environment is not read for
 * settings, so a worktree's `.env` can never point reviewer mode anywhere.
 * It refuses to start if it inherited a known database or credential variable,
 * or if the live database is not the least-privilege boundary
 * (`src/demo/reviewer-database.ts`).
 */

let config: ReviewerConfig;
let runtime: DatabaseTarget;
try {
  const inherited = inheritedEnvironmentProblems(process.env);
  if (inherited.length > 0) throw new ConfigError(inherited);
  config = loadReviewerConfigFromFile(process.env.MS_REVIEWER_ENV_FILE);
  assertReviewerStateDir(config.stateDir);
  runtime = demoDatabaseTarget(config.app.databaseUrl);
} catch (error) {
  const message = error instanceof ConfigError || error instanceof DemoGuardError ? error.message : 'Invalid reviewer configuration';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const logger = createLogger(config.app.logLevel);
const database = openDatabase(runtime, logger);
try {
  await assertReviewerDatabaseBoundary(database.db);
} catch (error) {
  // Not the driver's message: it is not this process's to repeat.
  const message = error instanceof ConfigError ? error.message : 'The reviewer database could not be checked: is it prepared (docs/engineering/REVIEWER-ACCESS.md) and reachable?';
  process.stderr.write(`${message}\n`);
  await database.close();
  process.exit(1);
}

const annotations = new AnnotationStore(resolve(config.stateDir, ANNOTATIONS_FILE));
const { app, issuer } = await createDemoApplication({ db: database.db, logger, annotations, reviewer: { publicOrigin: config.publicOrigin } });
const gate = createReviewerGate({
  publicOrigin: config.publicOrigin,
  accessKey: config.accessKey,
  sessionSeconds: config.sessionSeconds,
  warn: (message) => logger.warn(message),
});

const server = createDemoServer({ app, annotations, publicAuthority: config.publicAuthority, testIssuer: issuer, reviewer: gate });
applyReviewerServerLimits(server);
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
