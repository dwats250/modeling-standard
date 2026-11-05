import { resolve } from 'node:path';
import { loadAppConfig, loadMigrationConfig } from '../config/config.ts';
import { DEMO_DATABASE } from '../demo/demo.ts';
import { resetDemoDatabase } from '../demo/reset.ts';

/**
 * `npm run demo:reset`. Drops and recreates the synthetic demo database
 * (modeling_standard_demo only), migrates it, and loads the fixtures. It
 * never touches any other database. `-- --showcase` also writes the invented
 * showcase professional (src/demo/showcase.ts).
 */

const showcase = process.argv.includes('--showcase');

try {
  const app = loadAppConfig(process.env);
  const migration = loadMigrationConfig(process.env);
  const annotations = await resetDemoDatabase({
    host: app.host,
    databaseUrl: app.databaseUrl,
    migrationDatabaseUrl: migration.migrationDatabaseUrl,
    demoDir: resolve(process.cwd(), '.demo'),
    showcase,
  });
  process.stdout.write(`Demo database ${DEMO_DATABASE} reset with ${Object.keys(annotations.projects).length} synthetic projects${showcase ? ' and the invented showcase professional' : ''}.\n`);
} catch (error) {
  process.stderr.write(`Demo reset failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
