import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { createApp } from '../app/create-app.ts';
import { clearCookie } from '../http/cookies.ts';
import type { IdentityProvider } from '../identity/provider.ts';
import type { Database } from '../infrastructure/database/client.ts';
import { newToken } from '../infrastructure/tokens.ts';
import { toolkitOperations } from '../toolkit/operations.ts';
import type { AnnotationStore } from './annotations.ts';
import { OPERATOR_COOKIE, createDemoPrincipalResolver } from './demo.ts';
import { createDemoOperations, type DemoEnvironment } from './operations.ts';
import { createTestIssuer, type TestIssuer } from './test-issuer.ts';

/**
 * The demo application as `npm run demo` and `npm run staging` serve it: the
 * production operation list plus the demo operations, the fail-closed demo
 * principal source, the identity providers, and the exact origins a browser
 * POST may come from. Shared by the scripts and the tests, so all run the
 * same wiring.
 *
 * Two shapes:
 *
 * - **local** (`npm run demo`, LAN or loopback, plain HTTP): the local test
 *   identity provider, one-tap operator mode, and B1/B2's toolkit routes
 *   (`/me/profile`, `/me/comp-card`, `/me/portfolio`) with their synthetic
 *   owner harness. `origins` is filled in by the caller once the server knows
 *   its port; the application and the test issuer read it at request time.
 * - **staging** (`npm run staging`, S13, behind a local HTTPS proxy): the
 *   given providers (Google) and no test issuer, exactly one allowed origin
 *   (the pinned public HTTPS origin), `Secure` cookies, and operator mode
 *   only with the server-validated operator key. No toolkit routes.
 */
export interface DemoApplication {
  readonly app: FastifyInstance;
  /** The local test identity provider. */
  readonly issuer: TestIssuer;
  readonly origins: string[];
}

/** Staging has no test identity provider. */
export interface StagingApplication {
  readonly app: FastifyInstance;
  readonly issuer: undefined;
  readonly origins: string[];
}

interface ApplicationOptions {
  db: Database;
  logger: Logger;
  annotations: AnnotationStore;
}

export interface StagingSettings {
  /** The pinned public HTTPS origin, e.g. `https://host.example.ts.net:8443`. */
  readonly publicOrigin: string;
  /** The operator key (a canonical 32-byte base64url token). */
  readonly operatorKey: string;
  readonly providers: readonly IdentityProvider[];
}

export async function createDemoApplication(options: ApplicationOptions): Promise<DemoApplication>;
export async function createDemoApplication(options: ApplicationOptions & { staging: StagingSettings }): Promise<StagingApplication>;
export async function createDemoApplication(options: ApplicationOptions & { staging?: StagingSettings }): Promise<DemoApplication | StagingApplication> {
  // A fresh operator secret per process: restarting the server leaves operator mode.
  // It is the operator cookie's value; the operator key (staging) is never a cookie.
  const operatorSecret = newToken().token;
  const staging = options.staging;
  if (staging && !staging.publicOrigin.startsWith('https://')) throw new Error('staging needs an https:// public origin');
  const origins: string[] = staging ? [staging.publicOrigin] : [];
  const issuer = staging ? undefined : await createTestIssuer({ allowedOrigins: origins });
  const providers = staging ? staging.providers : [issuer!.provider];
  const environment: DemoEnvironment = {
    environment: staging ? 'staging' : 'local',
    providers: providers.map((p) => p.id),
    operatorKeyRequired: staging !== undefined,
  };
  // The local demo is plain HTTP on loopback or a LAN, where a Secure cookie
  // would never be sent back. Staging is HTTPS end to end at the browser, so
  // its cookies are Secure and `__Host-` named, written and read.
  const secureCookies = staging !== undefined;
  const app = createApp({
    db: options.db,
    logger: options.logger,
    resolvePrincipal: createDemoPrincipalResolver(options.db, operatorSecret, secureCookies),
    additionalOperations: [
      ...createDemoOperations(options.annotations, {
        secret: operatorSecret,
        ...(staging ? { key: staging.operatorKey } : {}),
        environment,
      }),
      // B1/B2's owner-only toolkit routes: the local synthetic demo only,
      // never production or staging. Not operator-wrapped: they serve the
      // signed-in account (here, a harness professional) and refuse a synthetic principal.
      ...(staging ? [] : toolkitOperations),
    ],
    allowedOrigins: origins,
    secureCookies,
    identity: { providers, clearOnSessionChange: [clearCookie(OPERATOR_COOKIE)] },
  });
  await app.ready();
  return issuer ? { app, issuer, origins } : { app, issuer: undefined, origins };
}
