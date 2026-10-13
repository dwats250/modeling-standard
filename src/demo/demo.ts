import { createRequire } from 'node:module';
import type { ResolvePrincipal, SyntheticPrincipal } from '../authorization/access.ts';
import type { ExplicitDatabaseTarget } from '../infrastructure/database/client.ts';

/**
 * The local synthetic demo: shared constants and guards.
 *
 * The demo exists to show what is built, with invented records, on a
 * developer machine. It is not a credential mechanism and not a product
 * flow. D03 (how a person takes part) is open, so the demo has exactly one
 * principal, a fixed synthetic operator that stands for nobody. That
 * operator never acts as a party: it creates projects (S01: the creator is
 * an audit and authorization fact, not a party) and reads its own records.
 */

/** The only database the demo will touch. Reset drops and recreates it. */
export const DEMO_DATABASE = 'modeling_standard_demo';

export const DEMO_OPERATOR: SyntheticPrincipal = Object.freeze({ id: 'demo-operator' });

/** Every request to the demo server is the demo operator. */
export const demoOperatorPrincipal: ResolvePrincipal = () => DEMO_OPERATOR;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export class DemoGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoGuardError';
  }
}

/** True for a loopback host name, with or without IPv6 brackets. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.replace(/^\[(.*)\]$/, '$1'));
}

/** Refuses to serve the demo anywhere but loopback. */
export function assertLoopbackListenHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new DemoGuardError('The synthetic demo listens on loopback only (127.0.0.1, ::1 or localhost).');
  }
}

// The pinned driver's own resolution of a connection string: the same code
// path pg.Client and pg.Pool use, including query parameters that override
// the URL authority (`?host=`, `?port=`), a host taken from PGHOST when the
// URL has none, and Unix-socket hosts. `pg` exports `./lib/*`.
interface ResolvedParameters {
  readonly host: string | undefined;
  readonly port: number;
  readonly database: string | undefined;
  readonly user: string | undefined;
  readonly password: string | undefined;
  readonly isDomainSocket: boolean;
}
const ConnectionParameters = createRequire(import.meta.url)('pg/lib/connection-parameters.js') as new (config: {
  connectionString: string;
}) => ResolvedParameters;

/**
 * Resolves a configured PostgreSQL URL exactly as the pinned `pg` driver
 * would, and refuses anything but a TCP server on loopback. The result is an
 * explicit target (no connection string left to reinterpret) and is what the
 * demo passes to the driver, so the target checked is the target used. Unix
 * sockets are refused (fail closed); the demo uses TCP loopback.
 *
 * Throws before any client exists or any SQL is sent.
 */
function resolveLoopbackTarget(configuredUrl: string, databaseOverride?: string): ExplicitDatabaseTarget {
  let resolved: ResolvedParameters;
  try {
    resolved = new ConnectionParameters({ connectionString: configuredUrl });
  } catch {
    throw new DemoGuardError('The demo database URL could not be read.');
  }
  const host = resolved.host ?? '';
  if (resolved.isDomainSocket || !isLoopbackHost(host)) {
    throw new DemoGuardError('The synthetic demo only uses a PostgreSQL server on TCP loopback (127.0.0.1, ::1 or localhost).');
  }
  if (!Number.isInteger(resolved.port) || resolved.port < 1 || resolved.port > 65535) {
    throw new DemoGuardError('The demo database port is not valid.');
  }
  const database = databaseOverride ?? resolved.database ?? '';
  if (database === '') throw new DemoGuardError('The database URL names no database.');
  return {
    host,
    port: resolved.port,
    database,
    ...(resolved.user === undefined ? {} : { user: resolved.user }),
    ...(resolved.password === undefined ? {} : { password: resolved.password }),
  };
}

/** The demo database, with the configured credentials, on a verified loopback server. */
export function demoDatabaseTarget(configuredUrl: string): ExplicitDatabaseTarget {
  return resolveLoopbackTarget(configuredUrl, DEMO_DATABASE);
}

/**
 * The configured migration role's own database, on a verified loopback
 * server: where reset runs DROP and CREATE DATABASE for the demo database.
 */
export function demoAdminTarget(configuredUrl: string): ExplicitDatabaseTarget {
  const target = resolveLoopbackTarget(configuredUrl);
  if (target.database === DEMO_DATABASE) {
    throw new DemoGuardError('Reset needs the migration role\'s own database, not the demo database.');
  }
  return target;
}
