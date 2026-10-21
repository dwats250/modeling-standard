import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { AnnotationStore } from './annotations.ts';
import type { TestIssuer } from './test-issuer.ts';

/**
 * The demo's front door. It serves the demo's static pages (the participant
 * journey at `/`, the record inspector at `/inspector`), its demo
 * annotations (`/annotations.json`) and the local test identity provider's
 * two pages (`/test-idp/*`), and passes every other request to the real
 * application with `app.inject`. The Fastify application therefore keeps its
 * rule that every route is an operation with declared access; nothing here
 * adds a route to it, reads the database, or decides anything about access.
 *
 * Forwarded to the application: the method, path and query, the body, and
 * exactly three request headers — `content-type`, `cookie` and `origin`.
 * Nothing else (no `X-Forwarded-*`, no `Host`). Returned: the status, the
 * body, and exactly `content-type`, `x-request-id`, `location` and every
 * `set-cookie`.
 */

const UI_DIR = new URL('./ui/', import.meta.url);

const STATIC_FILES: Readonly<Record<string, { file: string; type: string }>> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/journey.js': { file: 'journey.js', type: 'text/javascript; charset=utf-8' },
  '/journey.css': { file: 'journey.css', type: 'text/css; charset=utf-8' },
  '/inspector': { file: 'inspector.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
};

const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

const MAX_BODY_BYTES = 64 * 1024;

export interface DemoServerOptions {
  readonly app: FastifyInstance;
  /** The demo annotation store (labels for invented records), served read-only. */
  readonly annotations: AnnotationStore;
  /** Host names/IPs accepted in the HTTP Host header. Defaults to loopback only. */
  readonly allowedHosts?: readonly string[];
  /** The local test identity provider, whose pages this server serves. */
  readonly testIssuer?: TestIssuer;
}

async function readBody(request: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  response.writeHead(status, { ...SECURITY_HEADERS, 'content-type': type });
  response.end(body);
}

/**
 * The Host header must name one explicitly allowed local authority and this
 * server's own port. This keeps the ordinary demo loopback-only and lets the
 * explicit LAN mode accept only private addresses actually assigned to the
 * demo machine. Arbitrary DNS names remain refused before any read or write.
 */
export function isAllowedDemoAuthority(
  header: string | undefined,
  localPort: number,
  allowedHosts: readonly string[] = ['127.0.0.1', 'localhost', '::1'],
): boolean {
  if (typeof header !== 'string') return false;
  // Exactly host[:port]. No userinfo, path, query, fragment, whitespace or
  // leading-zero port. IPv6 authorities must be bracketed.
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/i.exec(header);
  if (!match) return false;
  const rawHost = match[1]!;
  const host = rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;
  if (!allowedHosts.some((allowed) => allowed.toLowerCase() === host.toLowerCase())) return false;
  return match[2] === undefined ? localPort === 80 : Number(match[2]) === localPort;
}

function hostIsAllowed(options: DemoServerOptions, request: IncomingMessage): boolean {
  return isAllowedDemoAuthority(request.headers.host, request.socket.localPort ?? -1, options.allowedHosts);
}

async function handle(options: DemoServerOptions, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!hostIsAllowed(options, request)) {
    send(response, 421, 'application/json; charset=utf-8', '{"error":{"code":"misdirected_request"}}');
    return;
  }
  const url = new URL(request.url ?? '/', 'http://demo.invalid');
  const method = request.method ?? 'GET';

  const staticFile = STATIC_FILES[url.pathname];
  if (method === 'GET' && staticFile) {
    send(response, 200, staticFile.type, await readFile(new URL(staticFile.file, UI_DIR)));
    return;
  }

  if (method === 'GET' && url.pathname === '/annotations.json') {
    // Demo annotations (labels for invented records), the same for every
    // requester. Never stored in the product database. Empty until
    // `npm run demo:reset` has run.
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify(await options.annotations.read()));
    return;
  }

  if (url.pathname.startsWith('/test-idp/') && options.testIssuer) {
    const formBody = method === 'POST' ? await readBody(request) : null;
    if (method === 'POST' && formBody === null) {
      send(response, 413, 'application/json; charset=utf-8', '{"error":{"code":"payload_too_large"}}');
      return;
    }
    if (await options.testIssuer.handle(request, response, formBody)) return;
  }

  if (method !== 'GET' && method !== 'POST') {
    send(response, 405, 'application/json; charset=utf-8', '{"error":{"code":"method_not_allowed"}}');
    return;
  }

  const body = method === 'POST' ? await readBody(request) : null;
  if (method === 'POST' && body === null) {
    send(response, 413, 'application/json; charset=utf-8', '{"error":{"code":"payload_too_large"}}');
    return;
  }

  const forwarded: Record<string, string> = {};
  for (const name of ['content-type', 'cookie', 'origin'] as const) {
    const value = request.headers[name];
    if (typeof value === 'string') forwarded[name] = value;
  }
  const injected = await options.app.inject({
    method,
    url: `${url.pathname}${url.search}`,
    headers: forwarded,
    ...(body !== null && body.length > 0 ? { payload: body } : {}),
  });

  const headers: Record<string, string | string[]> = { ...SECURITY_HEADERS };
  for (const name of ['content-type', 'x-request-id', 'location']) {
    const value = injected.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  // Every Set-Cookie, each as its own header line.
  const cookies = injected.headers['set-cookie'];
  if (cookies !== undefined) headers['set-cookie'] = Array.isArray(cookies) ? cookies : [String(cookies)];
  response.writeHead(injected.statusCode, headers);
  response.end(injected.statusCode === 303 ? undefined : injected.rawPayload);
}

export function createDemoServer(options: DemoServerOptions): Server {
  return createServer((request, response) => {
    handle(options, request, response).catch(() => {
      if (!response.headersSent) send(response, 500, 'application/json; charset=utf-8', '{"error":{"code":"internal_error"}}');
      else response.end();
    });
  });
}
