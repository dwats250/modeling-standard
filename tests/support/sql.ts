import pg from 'pg';

/** A raw SQL client for asserting what PostgreSQL itself allows. */
export async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Runs `sql` and returns the PostgreSQL error code it failed with, or null if it succeeded. */
export async function sqlErrorCode(client: pg.Client, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await client.query(sql, params);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

export const INSUFFICIENT_PRIVILEGE = '42501';
export const CHECK_VIOLATION = '23514';
