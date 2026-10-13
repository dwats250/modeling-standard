import type { ResolvePrincipal, SyntheticPrincipal } from '../authorization/access.ts';

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

/** The same credentials, pointed at the demo database. */
export function demoDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${DEMO_DATABASE}`;
  return parsed.toString();
}

/** True for a loopback host name, with or without IPv6 brackets. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.replace(/^\[(.*)\]$/, '$1'));
}

/**
 * Refuses to run anywhere but loopback, against a database server anywhere
 * but loopback, or against any database but the demo database. Reset drops
 * that database, so all three must hold.
 */
export function assertDemoTarget(options: { host: string; databaseUrl: string }): void {
  if (!isLoopbackHost(options.host)) {
    throw new DemoGuardError('The synthetic demo listens on loopback only (127.0.0.1, ::1 or localhost).');
  }
  let database: string;
  let databaseHost: string;
  try {
    const url = new URL(options.databaseUrl);
    database = decodeURIComponent(url.pathname.slice(1));
    databaseHost = url.hostname;
  } catch {
    throw new DemoGuardError('The demo database URL is not a valid URL.');
  }
  if (!isLoopbackHost(databaseHost)) {
    throw new DemoGuardError('The synthetic demo only uses a PostgreSQL server on loopback.');
  }
  if (database !== DEMO_DATABASE) {
    throw new DemoGuardError(`The synthetic demo only runs against the ${DEMO_DATABASE} database.`);
  }
}
