import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import type { ResolvePrincipal } from '../../src/authorization/access.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';

/**
 * Test harness for the real application. It calls the production `createApp`
 * with the production operation list; the only substitutions are the
 * principal source (tests need principals; production has none) and where
 * log lines go.
 */

export const PRINCIPAL_HEADER = 'x-test-principal';

/** Test-only principal source. Never used by `src/`. */
export const headerPrincipal: ResolvePrincipal = (request) => {
  const value = request.headers[PRINCIPAL_HEADER];
  return typeof value === 'string' && value.length > 0 ? { id: value } : null;
};

export class LogCapture extends Writable {
  readonly lines: Record<string, unknown>[] = [];
  readonly raw: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: () => void): void {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      this.raw.push(line);
      this.lines.push(JSON.parse(line) as Record<string, unknown>);
    }
    callback();
  }

  text(): string {
    return this.raw.join('\n');
  }
}

export interface TestApp {
  readonly app: FastifyInstance;
  readonly database: DatabaseHandle;
  readonly logs: LogCapture;
  close(): Promise<void>;
}

export async function startTestApp(
  options: { resolvePrincipal?: ResolvePrincipal; databaseUrl?: string } = {},
): Promise<TestApp> {
  const logs = new LogCapture();
  const logger = createLogger('info', logs);
  const database = openDatabase(options.databaseUrl ?? inject('runtimeUrl'), logger);
  const app = createApp({
    db: database.db,
    logger,
    resolvePrincipal: options.resolvePrincipal ?? headerPrincipal,
  });
  await app.ready();
  return {
    app,
    database,
    logs,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}
