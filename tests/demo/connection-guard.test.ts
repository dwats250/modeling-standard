import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Astra B01: the demo's database guard must check the target the pinned `pg`
 * driver will actually connect to, and fail before any client exists. No
 * test here connects anywhere: resolution is the driver's own
 * ConnectionParameters, and `pg` is wrapped to count clients and pools.
 */

const constructed = vi.hoisted(() => ({ clients: 0, pools: 0 }));
vi.mock('pg', async (importOriginal) => {
  const actual = (await importOriginal<{ default: typeof import('pg') }>()).default;
  class CountingClient extends actual.Client {
    constructor(...args: ConstructorParameters<typeof actual.Client>) {
      constructed.clients += 1;
      super(...args);
    }
  }
  class CountingPool extends actual.Pool {
    constructor(...args: ConstructorParameters<typeof actual.Pool>) {
      constructed.pools += 1;
      super(...args);
    }
  }
  const wrapped = { ...actual, Client: CountingClient, Pool: CountingPool };
  return { ...wrapped, default: wrapped };
});

const { DemoGuardError, demoAdminTarget, demoDatabaseTarget } = await import('../../src/demo/demo.ts');
const { connectionConfig } = await import('../../src/infrastructure/database/client.ts');
const { resetDemoDatabase } = await import('../../src/demo/reset.ts');

const ConnectionParameters = createRequire(import.meta.url)('pg/lib/connection-parameters.js') as new (config: object) => {
  host: string;
  port: number;
  database: string;
  isDomainSocket: boolean;
};
const driverView = (config: object) => new ConnectionParameters(config);

/** Configurations whose effective target is not TCP loopback, and what the driver would really use. */
const REMOTE: [string, string][] = [
  ['authority loopback + ?host=remote IPv4', 'postgres://u:p@127.0.0.1:5432/main?host=203.0.113.10'],
  ['authority loopback + ?host=remote name', 'postgres://u:p@127.0.0.1:5432/main?host=db.example.com'],
  ['IPv6 loopback authority + ?host=remote', 'postgres://u:p@[::1]:5432/main?host=203.0.113.10'],
  ['remote hostname', 'postgres://u:p@db.example.com:5432/main'],
  ['remote IPv4', 'postgres://u:p@203.0.113.10:5432/main'],
  ['unspecified address', 'postgres://u:p@0.0.0.0:5432/main'],
  ['URL-encoded Unix socket host', 'postgres://u:p@%2Fvar%2Frun%2Fpostgresql/main'],
  ['?host= Unix socket', 'postgres://u:p@127.0.0.1:5432/main?host=/var/run/postgresql'],
  ['socket: URL', 'socket:/var/run/postgresql?db=main'],
  ['raw socket path', '/var/run/postgresql main'],
];

beforeEach(() => {
  constructed.clients = 0;
  constructed.pools = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('demo database targets (Astra B01)', () => {
  for (const [label, url] of REMOTE) {
    it(`reject ${label}`, () => {
      // The driver itself would not connect to loopback over TCP here.
      const effective = driverView({ connectionString: url });
      expect(effective.isDomainSocket || !['127.0.0.1', '::1', 'localhost'].includes(effective.host)).toBe(true);
      expect(() => demoDatabaseTarget(url)).toThrow(DemoGuardError);
      expect(() => demoAdminTarget(url)).toThrow(DemoGuardError);
    });
  }

  it('reject an empty URL host that the driver would fill from PGHOST', () => {
    vi.stubEnv('PGHOST', '203.0.113.10');
    const url = 'postgres://u:p@/main';
    expect(driverView({ connectionString: url }).host).toBe('203.0.113.10');
    expect(() => demoDatabaseTarget(url)).toThrow(DemoGuardError);
    expect(() => demoAdminTarget(url)).toThrow(DemoGuardError);
  });

  it('accept what the driver resolves to TCP loopback, and pass the driver exactly that target', () => {
    const cases: [string, string, number][] = [
      ['postgres://u:p@127.0.0.1:5432/main', '127.0.0.1', 5432],
      ['postgres://u:p@localhost:5433/main', 'localhost', 5433],
      ['postgres://u:p@[::1]:5432/main', '::1', 5432],
      // The effective target is what counts, in both directions.
      ['postgres://u:p@db.example.com:5432/main?host=127.0.0.1', '127.0.0.1', 5432],
      ['postgres://u:p@127.0.0.1:5432/main?port=6543', '127.0.0.1', 6543],
    ];
    for (const [url, host, port] of cases) {
      const target = demoDatabaseTarget(url);
      expect(target).toMatchObject({ host, port, database: 'modeling_standard_demo', user: 'u', password: 'p' });
      const config = connectionConfig(target);
      expect(config).not.toHaveProperty('connectionString');
      // What the driver will use from that config is the target that was checked.
      const used = driverView(config);
      expect({ host: used.host, port: used.port, database: used.database, socket: used.isDomainSocket }).toEqual({
        host,
        port,
        database: 'modeling_standard_demo',
        socket: false,
      });
    }
  });

  it('keep the admin connection on the configured database, never the demo database', () => {
    expect(demoAdminTarget('postgres://m:p@127.0.0.1:5432/modeling_standard')).toMatchObject({ database: 'modeling_standard' });
    expect(() => demoAdminTarget('postgres://m:p@127.0.0.1:5432/modeling_standard_demo')).toThrow(DemoGuardError);
  });

  it('fail reset before any client or pool exists, for every connection it would open', async () => {
    const good = 'postgres://u:p@127.0.0.1:5432/modeling_standard';
    const bad = 'postgres://u:p@127.0.0.1:5432/modeling_standard?host=db.invalid';
    const attempts = [
      { databaseUrl: bad, migrationDatabaseUrl: good },
      { databaseUrl: good, migrationDatabaseUrl: bad },
      { databaseUrl: 'postgres://u:p@db.invalid/x', migrationDatabaseUrl: good },
    ];
    for (const urls of attempts) {
      await expect(resetDemoDatabase({ host: '127.0.0.1', demoDir: '/nonexistent', ...urls })).rejects.toThrow(DemoGuardError);
    }
    await expect(resetDemoDatabase({ host: '0.0.0.0', demoDir: '/nonexistent', databaseUrl: good, migrationDatabaseUrl: good })).rejects.toThrow(DemoGuardError);
    expect(constructed).toEqual({ clients: 0, pools: 0 });
  });
});
