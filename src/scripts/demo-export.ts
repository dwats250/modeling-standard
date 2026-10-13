import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../app/create-app.ts';
import { createLogger } from '../app/logger.ts';
import { loadAppConfig } from '../config/config.ts';
import { assertDemoTarget, demoDatabaseUrl, demoOperatorPrincipal } from '../demo/demo.ts';
import { collectSnapshot, renderSnapshotHtml } from '../demo/export.ts';
import { demoOperations } from '../demo/operations.ts';
import { openDatabase } from '../infrastructure/database/client.ts';

/**
 * `npm run demo:export`. Writes a self-contained, read-only HTML snapshot of
 * the demo inspector to .demo/modeling-standard-demo.html. Reads the demo
 * database only.
 */

try {
  const config = loadAppConfig(process.env);
  const runtimeUrl = demoDatabaseUrl(config.databaseUrl);
  assertDemoTarget({ host: config.host, databaseUrl: runtimeUrl });

  const dir = resolve(process.cwd(), '.demo');
  let fixture: unknown = { projects: {} };
  try {
    fixture = JSON.parse(await readFile(resolve(dir, 'fixture.json'), 'utf8'));
  } catch {
    // No fixtures loaded: the snapshot shows whatever projects exist, unlabelled.
  }

  const logger = createLogger('warn');
  const database = openDatabase(runtimeUrl, logger);
  const app = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: demoOperations });
  try {
    await app.ready();
    const html = await renderSnapshotHtml(await collectSnapshot(app, fixture));
    await mkdir(dir, { recursive: true });
    const out = resolve(dir, 'modeling-standard-demo.html');
    await writeFile(out, html);
    process.stdout.write(`Wrote read-only snapshot ${out} (${Math.round(html.length / 1024)} KB).\n`);
  } finally {
    await app.close();
    await database.close();
  }
} catch (error) {
  process.stderr.write(`Demo export failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
