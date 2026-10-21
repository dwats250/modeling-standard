import { seedEmptySyntheticDatabase } from '../demo/reset.ts';
import { STAGING_DATABASE, loadStagingDatabaseOrExit } from '../demo/staging.ts';

/**
 * `npm run staging:seed`. Loads the synthetic example shoots into
 * `modeling_standard_staging`, only if it has no shoot yet. It refuses a
 * database that already holds data; starting over is `staging:reset`.
 */

const { options } = loadStagingDatabaseOrExit(process.env.MS_STAGING_ENV_FILE);
try {
  const annotations = await seedEmptySyntheticDatabase(options);
  process.stdout.write(`Seeded ${STAGING_DATABASE} with ${Object.keys(annotations.projects).length} synthetic shoots.\n`);
} catch (error) {
  process.stderr.write(`Staging seed refused: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
