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

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * The public origin the application is served at, if any. HTTPS, or HTTP on
 * a loopback host only (local development). An origin only: no path, query,
 * fragment or credentials. It is the one origin a cookie-bearing POST is
 * accepted from, and it decides whether cookies are marked Secure.
 */
const publicBaseUrl = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return null;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be an absolute URL' });
      return z.NEVER;
    }
    const originOnly = url.username === '' && url.password === '' && (url.pathname === '/' || url.pathname === '') && url.search === '' && url.hash === '';
    const secure = url.protocol === 'https:';
    const localHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
    if (!originOnly || !(secure || localHttp)) {
      ctx.addIssue({ code: 'custom', message: 'must be an https:// origin (or http:// on a loopback host), with no path' });
      return z.NEVER;
    }
    return url.origin;
  });

const appConfigSchema = z.object({
  DATABASE_URL: postgresUrl,
  PUBLIC_BASE_URL: publicBaseUrl,
  HOST: z.string().min(1, { error: 'must not be empty' }).default('127.0.0.1'),
  PORT: z
    .string()
    .regex(/^\d{1,5}$/, { error: 'must be an integer between 0 and 65535' })
    .transform(Number)
    .pipe(z.number().max(65535, { error: 'must be an integer between 0 and 65535' }))
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
  /** The public origin (`PUBLIC_BASE_URL`), or null when none is configured. */
  readonly publicOrigin: string | null;
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
    publicOrigin: parsed.PUBLIC_BASE_URL,
  };
}

/** Configuration for the migration command only. */
export function loadMigrationConfig(env: Env): MigrationConfig {
  const parsed = parse(migrationConfigSchema, env);
  return { migrationDatabaseUrl: parsed.MIGRATION_DATABASE_URL };
}
