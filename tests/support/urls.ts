export const TEST_DATABASE = 'modeling_standard_test';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The database suites require PostgreSQL and are never skipped. ` +
        'Locally: `cp .env.example .env` and `npm run db:up`. In CI: set it in the workflow.',
    );
  }
  return value;
}

/** The same credentials, pointed at a different database. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
