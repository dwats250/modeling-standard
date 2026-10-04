import pino, { type DestinationStream, type Logger, type LevelWithSilent } from 'pino';

/**
 * Structured JSON logging with deliberate serializers.
 *
 * - Requests are logged as method + path only: no headers and no query
 *   string, so no credentials, codes or principal identifiers reach the log.
 * - Errors are logged as type, message, code and stack only. Database errors
 *   are reduced further: a PostgreSQL error's message, detail and stack can
 *   contain row or parameter values, and Drizzle's query errors embed bound
 *   parameters in their message. Those keep only their SQLSTATE and the names
 *   of the objects involved.
 */

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  stack?: unknown;
  query?: unknown;
  params?: unknown;
  cause?: unknown;
  severity?: unknown;
  table?: unknown;
  column?: unknown;
  constraint?: unknown;
}

export interface SerializedError {
  type: string;
  message: string;
  code?: string;
  stack?: string;
  table?: string;
  column?: string;
  constraint?: string;
  cause?: SerializedError;
}

/** A PostgreSQL server error as raised by `pg`: a SQLSTATE code plus a severity. */
function isPostgresError(e: ErrorLike): boolean {
  return typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.severity === 'string';
}

const MAX_CAUSE_DEPTH = 3;

export function serializeError(error: unknown, depth = 0): SerializedError {
  if (typeof error !== 'object' || error === null) {
    return { type: typeof error, message: 'non-error value thrown' };
  }
  const e = error as ErrorLike;
  const type = typeof e.name === 'string' ? e.name : 'Error';

  if (isPostgresError(e)) {
    const pgError: SerializedError = { type, message: 'database error', code: e.code as string };
    if (typeof e.table === 'string') pgError.table = e.table;
    if (typeof e.column === 'string') pgError.column = e.column;
    if (typeof e.constraint === 'string') pgError.constraint = e.constraint;
    return pgError;
  }

  // A Drizzle query error carries `query` and `params`; its message repeats
  // both. Keep neither: the SQL text is in the code, the parameters are data.
  const isQueryError = 'query' in e && 'params' in e;
  const serialized: SerializedError = {
    type,
    message: isQueryError ? 'database query failed' : typeof e.message === 'string' ? e.message : '',
  };
  if (typeof e.code === 'string') serialized.code = e.code;
  if (typeof e.stack === 'string' && !isQueryError) serialized.stack = e.stack;
  if (e.cause !== undefined && depth < MAX_CAUSE_DEPTH) serialized.cause = serializeError(e.cause, depth + 1);
  return serialized;
}

interface RequestLike {
  method?: string;
  url?: string;
}

interface ReplyLike {
  statusCode?: number;
}

export function createLogger(level: LevelWithSilent, destination?: DestinationStream): Logger {
  const options = {
    level,
    base: null,
    serializers: {
      req: (req: RequestLike) => ({ method: req.method, url: req.url?.split('?')[0] }),
      res: (res: ReplyLike) => ({ statusCode: res.statusCode }),
      err: serializeError,
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
