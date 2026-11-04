import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../config/config.ts';
import { DEMO_DATABASE, DemoGuardError } from '../demo/demo.ts';
import { bootstrapReviewerDatabase, loadReviewerBootstrapConfig } from '../demo/reviewer-bootstrap.ts';
import { readOwnerOnlyEnvFile } from '../demo/staging.ts';

/**
 * `node src/scripts/demo-reviewer-bootstrap.ts --confirm modeling_standard_demo`.
 * Drops and recreates the reviewer's demo database on its dedicated PostgreSQL
 * server (`src/demo/reviewer-bootstrap.ts`). Settings come only from its own
 * owner-only env file (`~/.config/modeling-standard/reviewer-bootstrap.env`, or
 * `MS_REVIEWER_BOOTSTRAP_ENV_FILE`), never from the environment or a `.env`.
 */

const at = process.argv.indexOf('--confirm');
if (at < 0 || process.argv[at + 1] !== DEMO_DATABASE) {
  process.stderr.write(`This deletes the reviewer's demo database. To proceed: node src/scripts/demo-reviewer-bootstrap.ts --confirm ${DEMO_DATABASE}\n`);
  process.exit(1);
}

try {
  const file = process.env.MS_REVIEWER_BOOTSTRAP_ENV_FILE || join(homedir(), '.config', 'modeling-standard', 'reviewer-bootstrap.env');
  const count = await bootstrapReviewerDatabase(loadReviewerBootstrapConfig(readOwnerOnlyEnvFile(file, 'reviewer bootstrap env file')));
  process.stdout.write(`Reset ${DEMO_DATABASE} with ${count} synthetic projects; the runtime role passes the serving boundary.\n`);
} catch (error) {
  const known = error instanceof ConfigError || error instanceof DemoGuardError;
  process.stderr.write(`Reviewer bootstrap failed: ${known ? error.message : 'the database step failed; check that the server is up and provisioned, and that the migration role can create databases'}\n`);
  process.exitCode = 1;
}
