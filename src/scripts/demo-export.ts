import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../app/create-app.ts';
import { createLogger } from '../app/logger.ts';
import { loadAppConfig } from '../config/config.ts';
import { assertLoopbackListenHost, demoDatabaseTarget, demoOperatorPrincipal } from '../demo/demo.ts';
import { collectSnapshot, renderSnapshotHtml } from '../demo/export.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../demo/annotations.ts';
import { createDemoOperations } from '../demo/operations.ts';
import { openDatabase } from '../infrastructure/database/client.ts';

/**
 * `npm run demo:export`. Writes a self-contained, read-only HTML snapshot of
 * the demo inspector to .demo/modeling-standard-demo.html. Reads the demo
 * database only.
 */

try {
  const config = loadAppConfig(process.env);
  assertLoopbackListenHost(config.host);
  const runtime = demoDatabaseTarget(config.databaseUrl);

  const dir = resolve(process.cwd(), '.demo');
  // Absent annotations (no reset yet) leave the snapshot's projects unlabelled.
  const annotations = new AnnotationStore(resolve(dir, ANNOTATIONS_FILE));
  const labels = await annotations.read();

  const logger = createLogger('warn');
  const database = openDatabase(runtime, logger);
  const app = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: createDemoOperations(annotations) });
  try {
    await app.ready();
    const html = await renderSnapshotHtml(await collectSnapshot(app, labels));
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
