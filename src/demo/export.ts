import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';

/**
 * Builds the portable, read-only snapshot: one self-contained HTML file with
 * the inspector's markup, styles and script inlined, and every response the
 * inspector needs embedded as JSON. It has no server and makes no network
 * request (its content security policy forbids any). It contains only what
 * the demo inspector already shows: synthetic records and fixture labels.
 */

const UI_DIR = new URL('./ui/', import.meta.url);

export interface SnapshotData {
  readonly exportedAt: string;
  readonly responses: Record<string, unknown>;
}

async function getJson(app: FastifyInstance, url: string): Promise<unknown> {
  const res = await app.inject({ method: 'GET', url });
  if (res.statusCode !== 200) throw new Error(`GET ${url} returned ${res.statusCode}`);
  return res.json();
}

/** Every response the inspector reads, as the demo operator sees it. */
export async function collectSnapshot(app: FastifyInstance, fixture: unknown, now = new Date()): Promise<SnapshotData> {
  const responses: Record<string, unknown> = { '/fixture.json': fixture };
  const list = (await getJson(app, '/demo/projects')) as { projects: { id: string }[] };
  responses['/demo/projects'] = list;
  for (const project of list.projects) {
    const url = `/demo/projects/${project.id}/record`;
    responses[url] = await getJson(app, url);
  }
  return { exportedAt: now.toISOString(), responses };
}

/** JSON that is safe inside a <script> element. */
function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const SNAPSHOT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

export async function renderSnapshotHtml(data: SnapshotData): Promise<string> {
  const read = (file: string): Promise<string> => readFile(new URL(file, UI_DIR), 'utf8');
  const [html, css, js] = await Promise.all([read('index.html'), read('styles.css'), read('app.js')]);
  const stylesheet = '<link rel="stylesheet" href="/styles.css" />';
  const script = '<script type="module" src="/app.js"></script>';
  if (!html.includes(stylesheet) || !html.includes(script)) throw new Error('index.html no longer matches the export template');
  return html
    .replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${SNAPSHOT_CSP}" />`)
    .replace('<title>Record Inspector — synthetic demo</title>', '<title>Record Inspector — read-only synthetic snapshot</title>')
    .replace(stylesheet, () => `<style>\n${css}\n</style>`)
    .replace(
      script,
      () =>
        `<script type="application/json" id="ms-snapshot">${scriptSafeJson(data)}</script>\n    <script type="module">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
    );
}
