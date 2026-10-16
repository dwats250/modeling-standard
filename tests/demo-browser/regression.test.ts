import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { addBriefItem, openLiveBrief } from '../../src/briefs/brief.ts';
import { demoDatabaseTarget, demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { collectSnapshot, renderSnapshotHtml } from '../../src/demo/export.ts';
import type { FixtureAnnotations } from '../../src/demo/fixtures.ts';
import { demoOperations } from '../../src/demo/operations.ts';
import { resetDemoDatabase } from '../../src/demo/reset.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * The whole demo, end to end, in a real browser: reset, fixtures, project
 * creation, the draft live brief by layer (S08), the scenario starter, reset
 * repeatability, the portable snapshot, desktop and mobile rendering, stale
 * navigation, and production isolation. Screenshots go to test-results/demo/.
 */

const SHOTS = resolve('test-results/demo');
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } } as const;

let fixtureDir: string;
let annotations: FixtureAnnotations;
let database: DatabaseHandle;
let app: FastifyInstance;
let server: Server;
let base: string;
let browser: Browser;
const pageErrors: string[] = [];

async function reset(): Promise<FixtureAnnotations> {
  return resetDemoDatabase({
    host: '127.0.0.1',
    databaseUrl: requireEnv('DATABASE_URL'),
    migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'),
    fixtureDir,
  });
}

async function openPage(viewport: keyof typeof VIEWPORTS, url = `${base}/`): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORTS[viewport] });
  page.on('pageerror', (e) => pageErrors.push(`${viewport}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${viewport}: ${m.text()}`);
  });
  await page.goto(url);
  return page;
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const [scrollWidth, innerWidth] = await page.evaluate<[number, number]>('[document.documentElement.scrollWidth, window.innerWidth]');
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

function titleOf(prefix: string): string {
  return Object.values(annotations.projects).find((p) => p.title.startsWith(prefix))!.title;
}

beforeAll(async () => {
  const executablePath = requireEnv('CHROME_PATH');
  await mkdir(SHOTS, { recursive: true });
  fixtureDir = await mkdtemp(join(tmpdir(), 'ms-demo-regression-'));
  annotations = await reset();

  await startServer();
  browser = await chromium.launch({ executablePath });
});

afterAll(async () => {
  await browser?.close();
  await stopServer();
});

/** The demo server as `npm run demo` runs it, on the port it had before if any. */
async function startServer(port = 0): Promise<void> {
  const logger = createLogger('warn');
  database = openDatabase(demoDatabaseTarget(requireEnv('DATABASE_URL')), logger);
  app = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: demoOperations });
  await app.ready();
  server = createDemoServer({ app, fixturePath: join(fixtureDir, 'fixture.json') });
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function stopServer(): Promise<void> {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  await app?.close();
  await database?.close();
}

/** The open Cory seams the decisions view names, and nothing else. */
const CURRENT_SEAMS = ['D04 wording', 'D04 signing', 'D05'] as const;

const DRAFT_BANNER = 'Draft composition only. Sharing, green state and signing arrive in S09–S11.';

/** Retired with S03–S05 (S08): nothing in a project view may say these. */
const RETIRED_IN_PROJECT_VIEWS = [/\bversions?\b/i, /\btick/i, /\bR1\b/, /\bR2\b/, /\bsealed\b/i, /affirmation/i, /\bsimulate\b/i];

describe('demo regression', () => {
  for (const viewport of ['desktop', 'mobile'] as const) {
    it(`shows the initial fixtures as draft briefs by layer (${viewport})`, async () => {
      const page = await openPage(viewport);
      const items = page.locator('.project-list a');
      await expect.poll(() => items.count()).toBe(3);
      expect(await items.allInnerTexts()).toEqual([
        expect.stringContaining('Fixture 1'),
        expect.stringContaining('Fixture 2'),
        expect.stringContaining('Fixture 3'),
      ]);

      await page.getByText(titleOf('Fixture 1'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 1' }).waitFor();
      await expect.poll(() => page.locator('.brief-item').count()).toBe(5);
      expect(await page.locator('.draft-banner').innerText()).toBe(DRAFT_BANNER);
      expect((await page.locator('.brief .layer h4').allInnerTexts()).map((t) => t.toLowerCase())).toEqual(['universal layer', 'shared layer']);
      // Subject, shape and pending are labels.
      const tags = (await page.locator('.brief .tag').allInnerTexts()).join(' | ');
      for (const label of ['subject', 'shape', 'declaration', 'request', 'open parameter', 'decide together', 'awaiting its subject', 'project-wide', 'between']) {
        expect({ label, shown: tags.toLowerCase().includes(label) }).toEqual({ label, shown: true });
      }
      expect(await page.locator('.brief-item[data-layer="money"]').count()).toBe(0);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `fixture1-${viewport}.png`), fullPage: true });

      await page.getByText(titleOf('Fixture 2'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 2' }).waitFor();
      await expect.poll(() => page.locator('.brief-item').count()).toBe(4);
      // Money: one fee per pair, each shown as private to its pair, and nothing else is.
      const money = page.locator('.brief-item[data-layer="money"]');
      expect(await money.count()).toBe(2);
      for (const fee of await money.all()) expect(await fee.locator('.tag.private').innerText()).toMatch(/^private to this pair · Pair (A|B)–C$/);
      expect(await page.locator('.tag.private').count()).toBe(2);
      expect(await page.locator('.brief-item:not([data-layer="money"]) .tag.private').count()).toBe(0);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `fixture2-${viewport}.png`), fullPage: true });

      await page.getByText(titleOf('Fixture 3'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 3' }).waitFor();
      await expect.poll(() => page.getByText('The draft brief has no items.').count()).toBe(1);

      await page.locator('#decisions-link').click();
      await expect.poll(() => page.locator('.decision').count()).toBe(CURRENT_SEAMS.length);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `decisions-${viewport}.png`), fullPage: true });
      await page.close();
    });
  }

  it('teaches no superseded or retired semantics, and names only the current Cory seams', async () => {
    const STALE = [
      /is undecided \(D03\)/,
      /Participation credential and invitation are undecided/,
      /mostly undecided \(D10\)/,
      /\(D10 open\)/,
      /may be left out is undecided/,
      /left out of a later version is undecided/,
      /Who counts as on site is undecided/,
      /Private commercial and craft terms/,
      /affirmation row/i,
      /Four open decisions/,
      /How body and money terms are identified/,
      /drop-and-resend/i,
      /presented version/i,
    ];
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    const texts: string[] = [];
    for (const fixture of ['Fixture 1', 'Fixture 2', 'Fixture 3']) {
      await page.getByText(titleOf(fixture), { exact: true }).first().click();
      await page.locator('h2', { hasText: fixture }).waitFor();
      const text = await page.locator('#detail').innerText();
      texts.push(text);
      for (const retired of RETIRED_IN_PROJECT_VIEWS) {
        expect({ fixture, retired: String(retired), found: retired.test(text) }).toEqual({ fixture, retired: String(retired), found: false });
      }
      // No product-wording placeholder presented as document text: every
      // wording line is marked synthetic, and no-means-no has none.
      for (const wording of await page.locator('.wording').allInnerTexts()) expect(wording).toMatch(/^\[synthetic\] /);
      expect(text).not.toMatch(/no[ -]means[ -]no/i);
    }

    await page.locator('#decisions-link').click();
    await expect.poll(() => page.locator('.decision').count()).toBe(CURRENT_SEAMS.length);
    expect(await page.locator('.decision .badge').allInnerTexts()).toEqual([...CURRENT_SEAMS]);
    const decisions = await page.locator('body').innerText();
    texts.push(decisions);
    expect(decisions).toContain('Decided, not built');
    expect(decisions).toContain('For counsel, not Cory homework.');
    for (const id of ['D03', 'D10', 'R1', 'R2']) {
      expect(await page.locator('.decision .badge', { hasText: id }).count()).toBe(0);
    }
    expect(decisions).not.toMatch(/\bversions?\b/i);
    expect(decisions).not.toMatch(/\bR[12]\b/);

    for (const text of texts) {
      for (const stale of STALE) expect({ stale: String(stale), found: stale.test(text) }).toEqual({ stale: String(stale), found: false });
    }
    await page.close();
  });

  it('creates a project through the real operation and shows its empty states', async () => {
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    await page.locator('#create-project').click();
    await page.locator('h2', { hasText: 'Project created in this session' }).waitFor();
    expect(await page.getByText('No parties in this project.').count()).toBe(1);
    expect(await page.getByText('No pairs.').count()).toBe(1);
    expect(await page.getByText('No live brief has been opened for this project.').count()).toBe(1);
    await expect.poll(() => page.locator('.project-list a').count()).toBe(4);
    await page.close();
  });

  it('starts a scenario, and shows a keyed item without wording only as instrumentation', async () => {
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    expect(await page.locator('#start-simulation').innerText()).toBe('Start a scenario');
    await page.locator('#start-simulation').click();
    await page.locator('h2', { hasText: 'Project created in this session' }).waitFor();
    await expect.poll(() => page.locator('.card').filter({ has: page.locator('h3', { hasText: /^Parties$/ }) }).locator('.rows li').count()).toBe(2);
    expect(await page.locator('.card').filter({ has: page.locator('h3', { hasText: /^Pairs$/ }) }).locator('.rows li').count()).toBe(1);
    expect(await page.getByText('No live brief has been opened for this project.').count()).toBe(1);
    expect(await page.locator('details.sim-panel, button.sim-affirm, .sim-assumptions').count()).toBe(0);

    // Instrumentation only: a keyed item whose wording was never materialized,
    // written with the data function (no product path exists). The inspector
    // must not render it as document text.
    const projectId = (await page.locator('.detail-head .meta code').textContent())!;
    const brief = await openLiveBrief(database.db, projectId);
    await addBriefItem(database.db, brief.id, { layer: 'universal', itemKey: 'no_means_no' });
    await page.reload();
    await page.locator('.brief-item').first().waitFor();
    expect(await page.locator('.instrumentation').allInnerTexts()).toEqual(['item key no_means_no — wording not materialized (draft)']);
    expect(await page.locator('.wording').count()).toBe(0);
    expect(await page.locator('.draft-banner').innerText()).toBe(DRAFT_BANNER);
    await page.screenshot({ path: join(SHOTS, 'scenario-desktop.png'), fullPage: true });

    await page.setViewportSize(VIEWPORTS.mobile);
    await noHorizontalScroll(page);
    await page.screenshot({ path: join(SHOTS, 'scenario-mobile.png'), fullPage: true });
    await page.close();
  });

  it('exports a portable snapshot that renders from disk with no network and no writes', async () => {
    const fixture = JSON.parse(await (await fetch(`${base}/fixture.json`)).text()) as unknown;
    const html = await renderSnapshotHtml(await collectSnapshot(app, fixture));
    const file = join(fixtureDir, 'snapshot.html');
    await writeFile(file, html);

    const page = await browser.newPage({ viewport: VIEWPORTS.mobile });
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('pageerror', (e) => pageErrors.push(`snapshot: ${e.message}`));
    await page.goto(pathToFileURL(file).href);
    await expect.poll(() => page.locator('.project-list a').count()).toBe(5);
    expect(await page.locator('#create-project').isDisabled()).toBe(true);
    expect(await page.locator('#start-simulation').isHidden()).toBe(true);
    await page.getByText(titleOf('Fixture 1'), { exact: true }).first().click();
    await expect.poll(() => page.locator('.brief-item').count()).toBe(5);
    expect(await page.locator('.draft-banner').innerText()).toBe(DRAFT_BANNER);
    await noHorizontalScroll(page);
    await page.screenshot({ path: join(SHOTS, 'snapshot-mobile.png'), fullPage: true });
    expect(requests.filter((url) => !url.startsWith('file:'))).toEqual([]);
    await page.close();
  });

  describe('stale project responses (Astra R02)', () => {
    function idOf(prefix: string): string {
      return Object.entries(annotations.projects).find(([, p]) => p.title.startsWith(prefix))![0];
    }

    /** Holds the record request for one project until released, then lets it succeed or fail. */
    async function hold(page: Page, projectId: string): Promise<{ requested: Promise<void>; release(outcome: 'succeed' | 'fail'): void }> {
      let markRequested!: () => void;
      const requested = new Promise<void>((done) => (markRequested = done));
      let release!: (outcome: 'succeed' | 'fail') => void;
      const released = new Promise<'succeed' | 'fail'>((done) => (release = done));
      await page.route(`**/demo/projects/${projectId}/record`, async (route) => {
        markRequested();
        const outcome = await released;
        if (outcome === 'succeed') await route.continue();
        else await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"internal_error","requestId":"held"}}' });
      });
      return { requested, release };
    }

    async function go(page: Page, hash: string): Promise<void> {
      await page.evaluate(`location.hash = ${JSON.stringify(hash)}`);
    }

    async function displayedProjectId(page: Page): Promise<string | null> {
      return page.locator('.detail-head .meta code').textContent({ timeout: 2000 }).catch(() => null);
    }

    it('A then B, B resolves first, A last: B stays displayed with its own brief', async () => {
      const a = idOf('Fixture 1');
      const b = idOf('Fixture 3');
      const page = await openPage('desktop');
      await page.locator('.project-list a').first().waitFor();
      const held = await hold(page, a);
      await go(page, `#/projects/${a}`);
      await held.requested;
      await go(page, `#/projects/${b}`);
      await page.locator('h2', { hasText: 'Fixture 3' }).waitFor();
      held.release('succeed');
      await page.waitForResponse((r) => r.url().endsWith(`/demo/projects/${a}/record`));
      await page.waitForTimeout(300);
      expect(await page.locator('h2', { hasText: 'Fixture 1' }).count()).toBe(0);
      expect(await displayedProjectId(page)).toBe(b);
      // B's empty draft, not A's items.
      expect(await page.getByText('The draft brief has no items.').count()).toBe(1);
      expect(await page.locator('.brief-item').count()).toBe(0);
      await page.close();
    });

    it('A then Decisions: A completing late does not replace the Decisions view', async () => {
      const a = idOf('Fixture 1');
      const page = await openPage('desktop');
      await page.locator('.project-list a').first().waitFor();
      const held = await hold(page, a);
      await go(page, `#/projects/${a}`);
      await held.requested;
      await go(page, '#/decisions');
      await expect.poll(() => page.locator('.decision').count()).toBe(CURRENT_SEAMS.length);
      held.release('succeed');
      await page.waitForResponse((r) => r.url().endsWith(`/demo/projects/${a}/record`));
      await page.waitForTimeout(300);
      expect(await page.locator('.decision').count()).toBe(CURRENT_SEAMS.length);
      expect(await page.locator('h2', { hasText: 'Fixture 1' }).count()).toBe(0);
      expect(await page.getByText('Select a project').count()).toBe(0);
      await page.close();
    });

    it('A failing after B loaded does not replace B with an error', async () => {
      const a = idOf('Fixture 1');
      const b = idOf('Fixture 2');
      const page = await openPage('desktop');
      await page.locator('.project-list a').first().waitFor();
      const held = await hold(page, a);
      await go(page, `#/projects/${a}`);
      await held.requested;
      await go(page, `#/projects/${b}`);
      await page.locator('h2', { hasText: 'Fixture 2' }).waitFor();
      // The browser logs the held 500 as a console error; wait for exactly that one.
      const errorsBefore = pageErrors.length;
      const expectedConsoleError = page.waitForEvent('console', (m) => m.type() === 'error' && m.text().includes('500'));
      held.release('fail');
      await page.waitForResponse((r) => r.url().endsWith(`/demo/projects/${a}/record`));
      const controlled = `desktop: ${(await expectedConsoleError).text()}`;
      await page.waitForTimeout(300);
      expect(await page.locator('.state.error').count()).toBe(0);
      expect(await displayedProjectId(page)).toBe(b);
      expect(await page.locator('h2', { hasText: 'Fixture 2' }).count()).toBe(1);
      // Discount only this test's own controlled 500, and only among errors
      // logged since it was released. Anything else logged since then goes
      // back, so the final no-browser-errors check still sees it.
      const added = pageErrors.splice(errorsBefore);
      const own = added.indexOf(controlled);
      expect(own).toBeGreaterThanOrEqual(0);
      added.splice(own, 1);
      pageErrors.push(...added);
      await page.close();
    });
  });

  it('resets to the same fixtures, repeatably', async () => {
    const before = Object.values(annotations.projects).map((p) => p.title);
    // A running server blocks the reset, with a message saying so.
    await expect(reset()).rejects.toThrow(/Stop `npm run demo`/);
    const port = (server.address() as AddressInfo).port;
    await stopServer();
    annotations = await reset();
    await startServer(port);
    expect(Object.values(annotations.projects).map((p) => p.title)).toEqual(before);

    const page = await openPage('desktop');
    await expect.poll(() => page.locator('.project-list a').count()).toBe(3);
    await page.getByText(titleOf('Fixture 1'), { exact: true }).first().click();
    await expect.poll(() => page.locator('.brief-item').count()).toBe(5);
    await page.close();
  });

  it('keeps every demo route out of the production application', async () => {
    const logger = createLogger('silent');
    const production = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal });
    await production.ready();
    try {
      for (const op of demoOperations) {
        const res = await production.inject({ method: op.method, url: op.path.replace(':id', '00000000-0000-4000-8000-000000000000'), payload: {} });
        expect({ op: op.name, status: res.statusCode }).toEqual({ op: op.name, status: 404 });
      }
    } finally {
      await production.close();
    }
  });

  it('logged no browser errors', () => {
    expect(pageErrors).toEqual([]);
  });
});
