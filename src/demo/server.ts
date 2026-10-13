import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { isLoopbackHost } from './demo.ts';

/**
 * The demo's front door. It serves the inspector's static files and passes
 * every other request, unchanged, to the real application with
 * `app.inject`. The Fastify application therefore keeps its rule that every
 * route is an operation with declared access; nothing here adds a route to
 * it, reads the database, or decides anything about access.
 */

const UI_DIR = new URL('./ui/', import.meta.url);

const STATIC_FILES: Readonly<Record<string, { file: string; type: string }>> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
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
  /** Absolute path of the fixture annotation file written by `demo:reset`, if any. */
  readonly fixturePath: string;
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
 * The Host header must name loopback and this server's own port. A page on
 * another origin that rebinds its DNS name to 127.0.0.1 sends its own name,
 * so it is refused before anything is read or written.
 */
function hostIsOwnLoopback(request: IncomingMessage): boolean {
  const header = request.headers.host;
  if (typeof header !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(`http://${header}`);
  } catch {
    return false;
  }
  return isLoopbackHost(parsed.hostname) && Number(parsed.port || '80') === request.socket.localPort;
}

async function handle(options: DemoServerOptions, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!hostIsOwnLoopback(request)) {
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

  if (method === 'GET' && url.pathname === '/fixture.json') {
    // Demo annotations (labels for invented records). Never stored in the
    // product database. Absent until `npm run demo:reset` has run.
    try {
      send(response, 200, 'application/json; charset=utf-8', await readFile(options.fixturePath));
    } catch {
      send(response, 200, 'application/json; charset=utf-8', '{"projects":{}}');
    }
    return;
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

  const contentType = request.headers['content-type'];
  const injected = await options.app.inject({
    method,
    url: `${url.pathname}${url.search}`,
    headers: contentType ? { 'content-type': contentType } : {},
    ...(body !== null && body.length > 0 ? { payload: body } : {}),
  });

  const headers: Record<string, string> = { ...SECURITY_HEADERS };
  for (const name of ['content-type', 'x-request-id']) {
    const value = injected.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  response.writeHead(injected.statusCode, headers);
  response.end(injected.rawPayload);
}

export function createDemoServer(options: DemoServerOptions): Server {
  return createServer((request, response) => {
    handle(options, request, response).catch(() => {
      if (!response.headersSent) send(response, 500, 'application/json; charset=utf-8', '{"error":{"code":"internal_error"}}');
      else response.end();
    });
  });
}
