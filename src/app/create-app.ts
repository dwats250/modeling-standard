import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { ResolvePrincipal } from '../authorization/access.ts';
import type { Database } from '../infrastructure/database/client.ts';
import { registerOperations } from '../http/operations.ts';
import { AppError, type ErrorBody } from './errors.ts';
import { operations } from './operation-list.ts';

/**
 * Everything the application needs from outside. Production (`src/main.ts`)
 * and the integration tests both build the app through `createApp` with these
 * dependencies; there is no other way to construct it.
 */
export interface AppDependencies {
  readonly db: Database;
  readonly logger: Logger;
  /** Production passes `resolveNoPrincipal`. Tests pass a synthetic resolver. */
  readonly resolvePrincipal: ResolvePrincipal;
}

const clientErrorCodes: Record<number, string> = {
  400: 'bad_request',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
};

export function createApp(deps: AppDependencies): FastifyInstance {
  const loggerInstance: FastifyBaseLogger = deps.logger;
  const app = Fastify({
    loggerInstance,
    genReqId: () => randomUUID(),
    exposeHeadRoutes: false,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // The error boundary. Expected errors (AppError, framework 4xx) get their
  // status and a stable code; anything else is a 500 with a generic body and
  // a redacted log entry carrying the request id.
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    const body = (code: string): ErrorBody => ({ error: { code, requestId: request.id } });

    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, 'request failed');
      const payload = body(error.code);
      if (error.issues) payload.error.issues = error.issues;
      return reply.code(error.statusCode).send(payload);
    }

    const statusCode = (error as FastifyError).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(body(clientErrorCodes[statusCode] ?? 'bad_request'));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send(body('internal_error'));
  });

  app.setNotFoundHandler((request, reply) => {
    const payload: ErrorBody = { error: { code: 'not_found', requestId: request.id } };
    return reply.code(404).send(payload);
  });

  registerOperations(app, operations, { db: deps.db, resolvePrincipal: deps.resolvePrincipal });

  return app;
}
