import { setupSyntheticDatabase } from '../demo/reset.ts';
import { STAGING_DATABASE, loadStagingDatabaseOrExit } from '../demo/staging.ts';

/**
 * `npm run staging:setup`. Creates `modeling_standard_staging` if it does not
 * exist and applies pending migrations. Never drops a database and never
 * writes or removes a row, so it is safe to rerun after every update.
 */

const { options } = loadStagingDatabaseOrExit(process.env.MS_STAGING_ENV_FILE);
try {
  const { created } = await setupSyntheticDatabase(options);
  process.stdout.write(`${created ? 'Created' : 'Found'} ${STAGING_DATABASE}; migrations applied.\n`);
} catch (error) {
  process.stderr.write(`Staging setup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
