import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { createApp } from '../app/create-app.ts';
import { clearCookie } from '../http/cookies.ts';
import type { Database } from '../infrastructure/database/client.ts';
import { newToken } from '../infrastructure/tokens.ts';
import type { AnnotationStore } from './annotations.ts';
import { OPERATOR_COOKIE, createDemoPrincipalResolver } from './demo.ts';
import { createDemoOperations } from './operations.ts';
import { createTestIssuer, type TestIssuer } from './test-issuer.ts';

/**
 * The demo application as `npm run demo` serves it: the production operation
 * list plus the demo operations, the fail-closed demo principal source, the
 * local test identity provider, and the exact origins a browser POST may come
 * from. Shared by the demo script and the browser tests, so both run the same
 * wiring.
 *
 * `origins` is filled in by the caller once the server knows its port; the
 * application and the test issuer read it at request time.
 */
export interface DemoApplication {
  readonly app: FastifyInstance;
  readonly issuer: TestIssuer;
  readonly origins: string[];
}

export async function createDemoApplication(options: { db: Database; logger: Logger; annotations: AnnotationStore }): Promise<DemoApplication> {
  const origins: string[] = [];
  // A fresh operator secret per process: restarting the demo leaves operator mode.
  const operatorSecret = newToken().token;
  const issuer = await createTestIssuer({ allowedOrigins: origins });
  const app = createApp({
    db: options.db,
    logger: options.logger,
    resolvePrincipal: createDemoPrincipalResolver(options.db, operatorSecret),
    additionalOperations: createDemoOperations(options.annotations, { secret: operatorSecret }),
    allowedOrigins: origins,
    // The demo is plain HTTP on loopback or a LAN: a Secure cookie would never be sent back.
    secureCookies: false,
    identity: { providers: [issuer.provider], clearOnSessionChange: [clearCookie(OPERATOR_COOKIE)] },
  });
  await app.ready();
  return { app, issuer, origins };
}
