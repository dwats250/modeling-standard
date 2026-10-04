import { describe, expect, it } from 'vitest';
import { ConfigError, loadAppConfig, loadMigrationConfig } from '../../src/config/config.ts';

const validUrl = 'postgres://ms_runtime:pw@127.0.0.1:5432/modeling_standard';

function problemsOf(fn: () => unknown): readonly string[] {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems;
  }
  throw new Error('expected a ConfigError');
}

describe('application configuration fails closed', () => {
  it('accepts a complete configuration and applies non-secret defaults', () => {
    expect(loadAppConfig({ DATABASE_URL: validUrl })).toEqual({
      databaseUrl: validUrl,
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
    });
  });

  it('rejects a missing DATABASE_URL, naming the setting', () => {
    expect(problemsOf(() => loadAppConfig({}))).toEqual(['DATABASE_URL: is required']);
  });

  it('treats an empty value as missing', () => {
    expect(problemsOf(() => loadAppConfig({ DATABASE_URL: '' }))).toEqual(['DATABASE_URL: is required']);
  });

  it('rejects malformed values and reports every problem at once', () => {
    const problems = problemsOf(() =>
      loadAppConfig({ DATABASE_URL: 'mysql://x/y', PORT: '70000', LOG_LEVEL: 'chatty' }),
    );
    expect(problems).toHaveLength(3);
    expect(problems.map((p) => p.split(':')[0])).toEqual(['DATABASE_URL', 'PORT', 'LOG_LEVEL']);
  });

  it('rejects a postgres URL with no database name', () => {
    expect(problemsOf(() => loadAppConfig({ DATABASE_URL: 'postgres://u:p@host:5432' }))).toEqual([
      'DATABASE_URL: must be a postgres:// URL that names a database',
    ]);
  });

  it('never echoes a configuration value in its error', () => {
    const secret = 'Sup3r-Secret-Password';
    try {
      loadAppConfig({ DATABASE_URL: `not a url ${secret}`, PORT: secret });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret);
    }
  });

  it('does not read or require the migration credential', () => {
    const config = loadAppConfig({ DATABASE_URL: validUrl, MIGRATION_DATABASE_URL: 'postgres://m:p@h/db' });
    expect(JSON.stringify(config)).not.toContain('postgres://m:');
  });
});

describe('migration configuration fails closed', () => {
  it('requires MIGRATION_DATABASE_URL and ignores DATABASE_URL', () => {
    expect(problemsOf(() => loadMigrationConfig({ DATABASE_URL: validUrl }))).toEqual([
      'MIGRATION_DATABASE_URL: is required',
    ]);
  });
});
