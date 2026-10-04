import { z } from 'zod';

/**
 * Configuration is read from the environment exactly once, at the process
 * entry point, and passed into the application as a typed value. Nothing else
 * in `src/` reads `process.env`.
 *
 * Error messages name the setting and the problem, never the value: a
 * malformed DATABASE_URL may still contain a password.
 */

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const postgresUrl = z
  .string({ error: 'is required' })
  .min(1, { error: 'is required' })
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.pathname.length > 1;
      } catch {
        return false;
      }
    },
    { error: 'must be a postgres:// URL that names a database' },
  );

const appConfigSchema = z.object({
  DATABASE_URL: postgresUrl,
  HOST: z.string().min(1, { error: 'must not be empty' }).default('127.0.0.1'),
  PORT: z.coerce
    .number({ error: 'must be an integer between 0 and 65535' })
    .int({ error: 'must be an integer between 0 and 65535' })
    .min(0, { error: 'must be an integer between 0 and 65535' })
    .max(65535, { error: 'must be an integer between 0 and 65535' })
    .default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
      error: 'must be one of fatal, error, warn, info, debug, trace, silent',
    })
    .default('info'),
});

const migrationConfigSchema = z.object({
  MIGRATION_DATABASE_URL: postgresUrl,
});

export interface AppConfig {
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: number;
  readonly logLevel: z.infer<typeof appConfigSchema>['LOG_LEVEL'];
}

export interface MigrationConfig {
  readonly migrationDatabaseUrl: string;
}

type Env = Readonly<Record<string, string | undefined>>;

function parse<S extends z.ZodType>(schema: S, env: Env): z.infer<S> {
  // Empty strings count as missing so that `PORT=` behaves like an unset PORT.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return result.data;
}

/** Configuration for the HTTP application. It never sees the migration credential. */
export function loadAppConfig(env: Env): AppConfig {
  const parsed = parse(appConfigSchema, env);
  return {
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  };
}

/** Configuration for the migration command only. */
export function loadMigrationConfig(env: Env): MigrationConfig {
  const parsed = parse(migrationConfigSchema, env);
  return { migrationDatabaseUrl: parsed.MIGRATION_DATABASE_URL };
}
