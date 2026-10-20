import { connect } from 'node:net';
import { resolve } from 'node:path';
import { loadAppConfig, loadMigrationConfig } from '../config/config.ts';
import { DEMO_DATABASE, DemoGuardError, demoListenTarget } from '../demo/demo.ts';
import { resetDemoDatabase } from '../demo/reset.ts';

/**
 * `npm run demo:fresh` (`-- --lan` for LAN mode). One command from a clean
 * state: reset the demo database, then serve it. Fail-fast: if anything is
 * already listening on DEMO_PORT it stops and says so, before touching the
 * database. It never ends another process or another session; the reset
 * guard is unchanged (reset refuses while a demo server is connected).
 */

function listening(port: number, host: string): Promise<boolean> {
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

const port = Number(process.env.DEMO_PORT ?? '3100');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('DEMO_PORT: must be an integer between 1 and 65535\n');
  process.exit(1);
}
if ((await listening(port, '127.0.0.1')) || (await listening(port, '::1'))) {
  process.stderr.write(`Something is already listening on port ${port}: stop the running demo first.\n`);
  process.exit(1);
}

try {
  const app = loadAppConfig(process.env);
  const migration = loadMigrationConfig(process.env);
  // The listener is validated (LAN mode needs a private address) before
  // anything is reset, so a refusal leaves the demo database as it was.
  demoListenTarget(app.host, process.argv.includes('--lan'));
  const annotations = await resetDemoDatabase({
    host: app.host,
    databaseUrl: app.databaseUrl,
    migrationDatabaseUrl: migration.migrationDatabaseUrl,
    demoDir: resolve(process.cwd(), '.demo'),
  });
  process.stdout.write(`Demo database ${DEMO_DATABASE} reset with ${Object.keys(annotations.projects).length} synthetic projects.\n`);
} catch (error) {
  const prefix = error instanceof DemoGuardError ? '' : 'Demo reset failed: ';
  process.stderr.write(`${prefix}${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exit(1);
}

// Serve, exactly as `npm run demo` does (it reads `--lan` from argv).
await import('./demo.ts');
