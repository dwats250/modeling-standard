import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest, RouteHandlerMethod } from 'fastify';
import { z } from 'zod';
import { AppError } from '../app/errors.ts';
import {
  authorize,
  type Access,
  type ResolvePrincipal,
  type Principal,
} from '../authorization/access.ts';
import type { Database } from '../infrastructure/database/client.ts';
import { cookieValues, serializeCookie, type ResponseCookie } from './cookies.ts';

/**
 * Operations are the only way behaviour becomes reachable over HTTP.
 *
 * An operation is a plain object: method, path, declared input and output
 * shapes, declared access, and a `run` function. `registerOperations` turns a
 * list of them into routes and is the single enforcement point for:
 *
 *   1. access classification: public (with a reason) or protected (with a
 *      policy); anything else fails at registration, i.e. at boot;
 *   2. principal presence for protected operations, checked in the route's
 *      onRequest hook, i.e. before the body is read or parsed;
 *   3. strict input: undeclared fields are rejected, never silently dropped;
 *   4. authorization on the loaded target;
 *   5. strict output: a response is the declared shape or a 500, never a row;
 *   6. exact-origin protection: a POST to a browser operation, or any POST
 *      carrying a cookie, must name one explicitly allowed origin in its
 *      Origin header, checked before the body is read.
 *
 * An operation declares its response kind. `json` (the default) returns the
 * declared output and nothing else. `browser` (sign-in, sign-out, the demo's
 * explicit operator switch) returns either JSON or a redirect to a fixed
 * same-origin path, and may ask the boundary to set structured cookies. No
 * operation sets a header itself.
 *
 * It also refuses any route not created here. (Hooks and not-found handlers
 * are a different Fastify mechanism; ESLint confines them to src/app/create-app.ts
 * and this file.)
 */

type StrictObject = z.ZodObject<z.ZodRawShape, z.core.$strict>;

const noFields = (): StrictObject => z.strictObject({});

export interface OperationInput<Params, Query, Body> {
  readonly params: Params;
  readonly query: Query;
  readonly body: Body;
}

export interface OperationContext<Target> {
  readonly db: Database;
  readonly principal: Principal | null;
  /** The authorized target for protected operations; undefined for public ones. */
  readonly target: Target;
  readonly log: FastifyBaseLogger;
  /** The request's Origin, only when it is one of the allowed origins; otherwise null. */
  readonly origin: string | null;
  /** Every value the request's Cookie header carries for `name`. */
  readonly cookies: (name: string) => string[];
}

/** What a `browser` operation returns: JSON or a same-origin redirect, with cookies. */
export type BrowserResult<Output> =
  | { readonly kind: 'json'; readonly body: Output; readonly cookies?: readonly ResponseCookie[] }
  | { readonly kind: 'redirect'; readonly location: string; readonly cookies?: readonly ResponseCookie[] };

/** A same-origin path: one leading slash, then not a slash; only visible ASCII, no backslash. */
const SAME_ORIGIN_PATH = /^\/(?![/\\])[!-[\]-~]*$/;

export function isSameOriginPath(location: string): boolean {
  return SAME_ORIGIN_PATH.test(location);
}

type InputOf<P extends StrictObject, Q extends StrictObject, B extends StrictObject> = OperationInput<
  z.output<P>,
  z.output<Q>,
  z.output<B>
>;

export interface Operation<
  P extends StrictObject,
  Q extends StrictObject,
  B extends StrictObject,
  Output,
  Target,
> {
  readonly name: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly successStatus: 200 | 201;
  /** `json`: `run` returns the output. `browser`: `run` returns a BrowserResult. */
  readonly response: 'json' | 'browser';
  readonly input: { readonly params: P; readonly query: Q; readonly body: B };
  readonly output: z.ZodType<Output>;
  readonly access: Access<InputOf<P, Q, B>, Target>;
  readonly run: (input: InputOf<P, Q, B>, ctx: OperationContext<Target>) => Promise<Output | BrowserResult<Output>>;
}

// The heterogeneous operation list needs an existential type; `any` here is
// confined to the list's element type and never reaches a handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyOperation = Operation<any, any, any, any, any>;

/** The same operation seen without its type parameters, for the registration loop. */
type ErasedOperation = Operation<StrictObject, StrictObject, StrictObject, unknown, unknown>;

/**
 * Identity function that infers types from the schemas. Omitted input parts
 * default to "no fields allowed", not to "anything allowed".
 */
export function defineOperation<
  Output,
  Target = undefined,
  P extends StrictObject = StrictObject,
  Q extends StrictObject = StrictObject,
  B extends StrictObject = StrictObject,
>(definition: {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  successStatus?: 200 | 201;
  input?: { params?: P; query?: Q; body?: B };
  output: z.ZodType<Output>;
  access: Access<InputOf<P, Q, B>, Target>;
  run: (input: InputOf<P, Q, B>, ctx: OperationContext<Target>) => Promise<Output>;
}): Operation<P, Q, B, Output, Target> {
  return {
    name: definition.name,
    method: definition.method,
    path: definition.path,
    successStatus: definition.successStatus ?? 200,
    response: 'json',
    input: {
      // When a part is omitted its type parameter is the StrictObject default,
      // so the "no fields" schema is exactly that type.
      params: definition.input?.params ?? (noFields() as P),
      query: definition.input?.query ?? (noFields() as Q),
      body: definition.input?.body ?? (noFields() as B),
    },
    output: definition.output,
    access: definition.access,
    run: definition.run,
  };
}

/**
 * A browser-facing operation: its `run` returns JSON or a same-origin
 * redirect, with structured cookies. Every POST to one must carry an allowed
 * Origin, cookie or not.
 */
export function defineBrowserOperation<
  Output,
  Target = undefined,
  P extends StrictObject = StrictObject,
  Q extends StrictObject = StrictObject,
  B extends StrictObject = StrictObject,
>(definition: {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  input?: { params?: P; query?: Q; body?: B };
  output: z.ZodType<Output>;
  access: Access<InputOf<P, Q, B>, Target>;
  run: (input: InputOf<P, Q, B>, ctx: OperationContext<Target>) => Promise<BrowserResult<Output>>;
}): Operation<P, Q, B, Output, Target> {
  return {
    name: definition.name,
    method: definition.method,
    path: definition.path,
    successStatus: 200,
    response: 'browser',
    input: {
      params: definition.input?.params ?? (noFields() as P),
      query: definition.input?.query ?? (noFields() as Q),
      body: definition.input?.body ?? (noFields() as B),
    },
    output: definition.output,
    access: definition.access,
    run: definition.run,
  };
}

export class OperationDefinitionError extends Error {
  constructor(problems: readonly string[]) {
    super(`Invalid operation definitions:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'OperationDefinitionError';
  }
}

function isStrictObject(schema: unknown): boolean {
  return schema instanceof z.ZodObject && schema.def.catchall instanceof z.ZodNever;
}

/** Checks every definition. Runs at boot, so a bad definition stops the app. */
export function validateOperations(operations: readonly AnyOperation[]): void {
  const problems: string[] = [];
  const names = new Set<string>();
  const routes = new Set<string>();

  for (const [index, op] of operations.entries()) {
    const label = typeof op?.name === 'string' && op.name.length > 0 ? op.name : `#${index}`;
    if (typeof op?.name !== 'string' || op.name.length === 0) problems.push(`${label}: missing name`);
    else if (names.has(op.name)) problems.push(`${label}: duplicate name`);
    else names.add(op.name);

    if (op?.method !== 'GET' && op?.method !== 'POST') problems.push(`${label}: method must be GET or POST`);
    if (op?.response !== 'json' && op?.response !== 'browser') problems.push(`${label}: response must be "json" or "browser"`);
    if (typeof op?.path !== 'string' || !op.path.startsWith('/')) problems.push(`${label}: path must start with /`);
    const route = `${String(op?.method)} ${String(op?.path)}`;
    if (routes.has(route)) problems.push(`${label}: duplicate route ${route}`);
    routes.add(route);

    const access: unknown = op?.access;
    if (typeof access !== 'object' || access === null) {
      problems.push(`${label}: no access declared; declare publicAccess(reason) or { kind: 'protected', load, policy }`);
    } else {
      const a = access as { kind?: unknown; reason?: unknown; load?: unknown; policy?: unknown };
      if (a.kind === 'public') {
        if (typeof a.reason !== 'string' || a.reason.trim().length === 0) {
          problems.push(`${label}: public access must state a reason`);
        }
      } else if (a.kind === 'protected') {
        if (typeof a.load !== 'function') problems.push(`${label}: protected access must declare load`);
        if (typeof a.policy !== 'function') problems.push(`${label}: protected access must declare a policy`);
      } else {
        problems.push(`${label}: access kind must be "public" or "protected"`);
      }
    }

    for (const part of ['params', 'query', 'body'] as const) {
      if (!isStrictObject(op?.input?.[part])) problems.push(`${label}: input.${part} must be a strict object schema`);
    }
    if (!isStrictObject(op?.output)) problems.push(`${label}: output must be a strict object schema`);
    if (typeof op?.run !== 'function') problems.push(`${label}: missing run`);
  }

  if (problems.length > 0) throw new OperationDefinitionError(problems);
}

function invalidInput(location: string, error: z.ZodError): AppError {
  return new AppError(
    400,
    'invalid_input',
    error.issues.map((issue) => ({ location, path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

export interface OperationDependencies {
  readonly db: Database;
  readonly resolvePrincipal: ResolvePrincipal;
  /**
   * The exact origins (`scheme://host[:port]`) a cookie-bearing or browser
   * POST may come from. Read at request time, so a server that learns its
   * port after listening can fill it in. Empty: every such POST is refused.
   */
  readonly allowedOrigins?: readonly string[];
  /** Mark cookies `Secure` (the app is served over HTTPS). */
  readonly secureCookies?: boolean;
}

/**
 * Registers the operations as routes. After this call, any attempt to add a
 * route by another path throws, so a route cannot exist without an operation
 * definition (and therefore without declared access).
 */
export function registerOperations(
  app: FastifyInstance,
  operations: readonly AnyOperation[],
  deps: OperationDependencies,
): void {
  validateOperations(operations);

  const ownHandlers = new WeakSet<RouteHandlerMethod>();
  app.addHook('onRoute', (route) => {
    if (!ownHandlers.has(route.handler)) {
      throw new Error(
        `Route ${String(route.method)} ${route.url} was not registered as an operation. ` +
          'Every route must be an operation with declared access.',
      );
    }
  });

  // The principal resolved for each request, before its body is parsed.
  const principals = new WeakMap<FastifyRequest, Principal | null>();

  /** The request's Origin if it is exactly one of the allowed origins. Forwarded headers are never read. */
  const allowedOrigin = (request: FastifyRequest): string | null => {
    const origin = request.headers.origin;
    return typeof origin === 'string' && (deps.allowedOrigins ?? []).includes(origin) ? origin : null;
  };

  for (const operation of operations) {
    const op = operation as ErasedOperation;

    // Runs before body parsing: an unauthenticated request to a protected
    // operation gets 401, and a cross-origin state-changing request gets
    // 403, without the server reading its body, validating its input, or
    // touching the database beyond resolving the principal.
    const onRequest = async (request: FastifyRequest): Promise<void> => {
      const principal = await deps.resolvePrincipal(request);
      if (op.access.kind === 'protected' && principal === null) throw new AppError(401, 'unauthenticated');
      const needsOrigin = op.method === 'POST' && (op.response === 'browser' || request.headers.cookie !== undefined);
      if (needsOrigin && allowedOrigin(request) === null) throw new AppError(403, 'cross_origin');
      principals.set(request, principal);
    };

    const handler = async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
      const principal = principals.get(request) ?? null;

      const params = op.input.params.safeParse(request.params ?? {});
      if (!params.success) throw invalidInput('params', params.error);
      const query = op.input.query.safeParse(request.query ?? {});
      if (!query.success) throw invalidInput('query', query.error);
      const body = op.input.body.safeParse(request.body ?? {});
      if (!body.success) throw invalidInput('body', body.error);
      const input = { params: params.data, query: query.data, body: body.data };

      let target: unknown = undefined;
      if (op.access.kind === 'protected') {
        // Already enforced in onRequest; repeated so this path can never run without one.
        if (principal === null) throw new AppError(401, 'unauthenticated');
        const outcome = await authorize(op.access, principal, input, deps.db);
        if (!outcome.allowed) {
          throw outcome.reason === 'not_found' ? new AppError(404, 'not_found') : new AppError(403, 'forbidden');
        }
        target = outcome.target;
      }

      const context = {
        db: deps.db,
        principal,
        target,
        log: request.log,
        origin: allowedOrigin(request),
        cookies: (name: string) => cookieValues(request.headers.cookie, name, deps.secureCookies === true),
      };
      const result: unknown = await op.run(input, context);

      if (op.response === 'browser') {
        const browser = result as BrowserResult<unknown>;
        const cookies = (browser.cookies ?? []).map((cookie) => serializeCookie(cookie, deps.secureCookies === true));
        if (browser.kind === 'redirect') {
          if (!isSameOriginPath(browser.location)) {
            request.log.error({ operation: op.name }, 'operation redirect is not a same-origin path');
            throw new AppError(500, 'internal_error');
          }
          if (cookies.length > 0) reply.header('set-cookie', cookies);
          reply.code(303).header('location', browser.location);
          return null;
        }
        const output = parseOutput(op, browser.body, request);
        if (cookies.length > 0) reply.header('set-cookie', cookies);
        reply.code(op.successStatus);
        return output;
      }

      const output = parseOutput(op, result, request);
      reply.code(op.successStatus);
      return output;
    };

    ownHandlers.add(handler);
    app.route({ method: op.method, url: op.path, onRequest, handler });
  }
}

/** The declared output, or a 500 that logs where the mismatch is, never the values. */
function parseOutput(op: ErasedOperation, result: unknown, request: FastifyRequest): unknown {
  const output = op.output.safeParse(result);
  if (!output.success) {
    request.log.error(
      { operation: op.name, issues: output.error.issues.map((i) => ({ code: i.code, path: i.path.map(String) })) },
      'operation result does not match its declared output',
    );
    throw new AppError(500, 'internal_error');
  }
  return output.data;
}
