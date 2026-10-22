import { sql } from 'drizzle-orm';
import { createLogger } from '../app/logger.ts';
import { createDemoApplication } from '../demo/application.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../demo/annotations.ts';
import { syntheticDatabaseTarget } from '../demo/demo.ts';
import { createDemoServer } from '../demo/server.ts';
import { STAGING_DATABASE, loadStagingOrExit } from '../demo/staging.ts';
import { createGoogleProvider } from '../identity/google.ts';
import { openDatabase, type DatabaseTarget } from '../infrastructure/database/client.ts';
import { join } from 'node:path';

/**
 * `npm run staging`. Serves synthetic staging (S13) on loopback, behind the
 * local HTTPS proxy, against `modeling_standard_staging` only. It never
 * resets, migrates or seeds: those are `staging:setup`, `staging:seed` and
 * `staging:reset`. Not a production entry point.
 */

const config = loadStagingOrExit(process.env.MS_STAGING_ENV_FILE);

let runtime: DatabaseTarget;
try {
  runtime = syntheticDatabaseTarget(config.app.databaseUrl, STAGING_DATABASE);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Invalid database setting'}\n`);
  process.exit(1);
}

const logger = createLogger(config.app.logLevel);
const database = openDatabase(runtime, logger);
try {
  await database.db.execute(sql`select 1 from project limit 1`);
} catch {
  process.stderr.write(`The staging database ${STAGING_DATABASE} is missing or not migrated. Run \`npm run staging:setup\` first.\n`);
  await database.close();
  process.exit(1);
}

const annotations = new AnnotationStore(join(config.stateDir, ANNOTATIONS_FILE));
const { app } = await createDemoApplication({
  db: database.db,
  logger,
  annotations,
  staging: {
    publicOrigin: config.app.publicOrigin,
    operatorKey: config.operatorKey,
    providers: [createGoogleProvider(config.app.google)],
  },
});

const server = createDemoServer({ app, annotations, publicAuthority: config.publicAuthority });
server.listen(config.app.port, config.app.host, () => {
  process.stdout.write(
    'Synthetic staging (invented shoots; not for real collaborations; sign-in is Google, which is not verification):\n' +
      `  public:  ${config.app.publicOrigin}/\n` +
      `  listens: http://${config.app.host}:${config.app.port}/ (loopback, behind the HTTPS proxy only)\n` +
      'Stop it with Ctrl+C.\n',
  );
});

server.on('error', (error: NodeJS.ErrnoException) => {
  process.stderr.write(
    error.code === 'EADDRINUSE' ? `Port ${config.app.port} is already in use: is staging already running?\n` : `Staging could not listen: ${error.message}\n`,
  );
  void app.close().then(() => database.close()).finally(() => process.exit(1));
});

const shutdown = (): void => {
  server.close();
  void app.close().then(() => database.close());
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
