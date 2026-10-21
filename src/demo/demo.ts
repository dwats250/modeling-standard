import { createRequire } from 'node:module';
import { networkInterfaces } from 'node:os';
import type { ResolvePrincipal, Principal } from '../authorization/access.ts';
import { cookieValues } from '../http/cookies.ts';
import type { Executor, ExplicitDatabaseTarget } from '../infrastructure/database/client.ts';
import { sameDigest, tokenDigest } from '../infrastructure/tokens.ts';
import { carriesSessionCookie, sessionPrincipal } from '../sessions/session.ts';

/**
 * The local synthetic demo: shared constants and guards.
 *
 * The demo exists to show what is built, with invented records, on a
 * developer machine. It is not a product flow. It has two kinds of
 * principal:
 *
 * - the demo operator, a fixed synthetic principal that stands for nobody.
 *   It composes, shares, settles and invites (operator acts, because who does
 *   those is not ruled), and never acts as a party;
 * - signed-in test participants (S12): accounts signed in through the local
 *   test identity provider, each acting only as its own party.
 *
 * A browser is one or the other, never both, and never the operator by
 * accident (see `createDemoPrincipalResolver`).
 */

/** The only database the demo will touch. Reset drops and recreates it. */
export const DEMO_DATABASE = 'modeling_standard_demo';

export const DEMO_OPERATOR: Principal = Object.freeze({ id: 'demo-operator', kind: 'synthetic' });

/**
 * Every request is the demo operator. For the demo's reset, export and the
 * tests that drive operator acts directly; the demo server itself uses
 * `createDemoPrincipalResolver`.
 */
export const demoOperatorPrincipal: ResolvePrincipal = () => DEMO_OPERATOR;

/** The cookie that puts one browser in operator mode (an explicit demo convenience). */
export const OPERATOR_COOKIE = 'ms_demo_operator';

/**
 * The demo server's principal source. It fails closed:
 *
 * - a request carrying a session cookie is that session's account or nobody
 *   (malformed, duplicated, unknown, expired or ended) — never the operator;
 * - a request without one is the operator only if it carries exactly one
 *   operator cookie equal (in constant time) to this server's secret, which
 *   is set only by the explicit "operator mode" action;
 * - anything else is nobody.
 *
 * Signing in and signing out clear the operator cookie, so a participant who
 * signs out is nobody, not the operator.
 */
export function createDemoPrincipalResolver(db: Executor, operatorSecret: string, secure: boolean): ResolvePrincipal {
  const expected = tokenDigest(operatorSecret);
  if (!expected) throw new Error('the operator secret must be a canonical token');
  return async (request) => {
    const header = request.headers.cookie;
    if (carriesSessionCookie(header, secure)) return sessionPrincipal(db, header, secure);
    const values = cookieValues(header, OPERATOR_COOKIE, secure);
    if (values.length !== 1) return null;
    const presented = tokenDigest(values[0]);
    return presented !== null && sameDigest(presented, expected) ? DEMO_OPERATOR : null;
  };
}

/** The exact origins a browser uses for the hosts the demo accepts, on its port. */
export function demoOrigins(allowedHosts: readonly string[], port: number): string[] {
  return allowedHosts.map((host) => `http://${host.includes(':') ? `[${host}]` : host}:${port}`);
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Private IPv4 addresses currently assigned to this machine. */
export function demoLanAddresses(): string[] {
  const found = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && isPrivateIpv4(address.address)) found.add(address.address);
    }
  }
  return [...found].sort();
}

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

/** Refuses the ordinary demo anywhere but loopback. LAN mode is explicit and demo-only. */
export function assertLoopbackListenHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new DemoGuardError('The synthetic demo listens on loopback only (127.0.0.1, ::1 or localhost).');
  }
}

/**
 * Resolve the demo listener and Host-header allow-list. Ordinary mode stays
 * loopback-only. LAN mode binds all IPv4 interfaces but accepts requests only
 * for loopback names or private IPv4 addresses actually assigned to this
 * machine. PostgreSQL remains independently restricted to TCP loopback.
 */
export function demoListenTarget(configuredHost: string, lanMode: boolean): { listenHost: string; allowedHosts: string[]; urls: string[] } {
  if (!lanMode) {
    assertLoopbackListenHost(configuredHost);
    return { listenHost: configuredHost, allowedHosts: ['127.0.0.1', 'localhost', '::1'], urls: [configuredHost] };
  }
  const lan = demoLanAddresses();
  if (lan.length === 0) throw new DemoGuardError('LAN demo mode found no private IPv4 address on this machine.');
  return {
    listenHost: '0.0.0.0',
    allowedHosts: ['127.0.0.1', 'localhost', '::1', ...lan],
    urls: lan,
  };
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
  return syntheticAdminTarget(configuredUrl, DEMO_DATABASE);
}

/** A named synthetic database (the demo's or staging's), on a verified loopback server. */
export function syntheticDatabaseTarget(configuredUrl: string, database: string): ExplicitDatabaseTarget {
  return resolveLoopbackTarget(configuredUrl, database);
}

/** The migration role's own database, which must not be the synthetic one it creates or drops. */
export function syntheticAdminTarget(configuredUrl: string, database: string): ExplicitDatabaseTarget {
  const target = resolveLoopbackTarget(configuredUrl);
  if (target.database === database) {
    throw new DemoGuardError(`Reset needs the migration role's own database, not ${database}.`);
  }
  return target;
}
