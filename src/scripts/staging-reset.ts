import { connect } from 'node:net';
import { resetSyntheticDatabase } from '../demo/reset.ts';
import { STAGING_DATABASE, loadStagingDatabaseOrExit } from '../demo/staging.ts';

/**
 * `npm run staging:reset -- --confirm modeling_standard_staging`. Drops and
 * recreates the staging database, migrates it and loads the synthetic
 * example shoots. Every account, session and invitation on staging goes with
 * it. It refuses without the exact confirmation, and while anything listens on
 * staging's port (an idle staging server holds no database connection, so the
 * database alone cannot tell). It touches no other database.
 */

const at = process.argv.indexOf('--confirm');
if (at < 0 || process.argv[at + 1] !== STAGING_DATABASE) {
  process.stderr.write(`This deletes everything on staging. To proceed: npm run staging:reset -- --confirm ${STAGING_DATABASE}\n`);
  process.exit(1);
}

const { options, port } = loadStagingDatabaseOrExit(process.env.MS_STAGING_ENV_FILE);

function listening(host: string): Promise<boolean> {
  return new Promise((done) => {
    const socket = connect({ port, host });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      done(false);
    });
    socket.once('error', () => done(false));
  });
}

if ((await listening('127.0.0.1')) || (await listening('::1'))) {
  process.stderr.write(`Something is listening on port ${port}: stop \`npm run staging\` first, then reset.\n`);
  process.exit(1);
}

try {
  const annotations = await resetSyntheticDatabase(options);
  process.stdout.write(`Reset ${STAGING_DATABASE} with ${Object.keys(annotations.projects).length} synthetic shoots.\n`);
} catch (error) {
  process.stderr.write(`Staging reset failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
