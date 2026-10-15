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
 * creation, version history, drop-and-resend, affirmation evidence, the
 * simulator, reset repeatability, the portable snapshot, desktop and mobile
 * rendering, and production isolation. Screenshots go to test-results/demo/.
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
const CURRENT_SEAMS = ['D04 wording', 'D04 signing', 'R1', 'R2', 'D05'] as const;

describe('demo regression', () => {
  for (const viewport of ['desktop', 'mobile'] as const) {
    it(`shows the initial fixtures with their evidence (${viewport})`, async () => {
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
      // Universal v1: 2 terms × 2 parties; pairwise v1: 2 terms × 2 parties.
      await expect.poll(() => page.locator('.cell.yes').count()).toBe(8);
      expect(await page.locator('.version').count()).toBe(2);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `fixture1-${viewport}.png`), fullPage: true });

      await page.getByText(titleOf('Fixture 2'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 2' }).waitFor();
      await expect.poll(() => page.locator('.dropped').allInnerTexts()).toEqual([expect.stringContaining('Term three, later dropped.')]);
      expect(await page.locator('.badge', { hasText: 'Version 2' }).count()).toBe(1);
      // Universal: A and C have rows; A–C v1: one row; B–C: none.
      expect(await page.locator('.cell.yes').count()).toBe(3);
      expect(await page.locator('.drafts').count()).toBe(1);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `fixture2-${viewport}.png`), fullPage: true });

      await page.locator('#decisions-link').click();
      await expect.poll(() => page.locator('.decision').count()).toBe(CURRENT_SEAMS.length);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `decisions-${viewport}.png`), fullPage: true });
      await page.close();
    });
  }

  it('teaches no superseded semantics, and names only the current Cory seams', async () => {
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
    ];
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    const texts: string[] = [];
    for (const fixture of ['Fixture 1', 'Fixture 2', 'Fixture 3']) {
      await page.getByText(titleOf(fixture), { exact: true }).first().click();
      await page.locator('h2', { hasText: fixture }).waitFor();
      texts.push(await page.locator('body').innerText());
      // Tick rows are not labelled signatures.
      for (const cell of await page.locator('.cell.yes').all()) {
        expect(`${await cell.innerText()} ${(await cell.getAttribute('title')) ?? ''}`).not.toMatch(/sign/i);
      }
    }
    const legend = (await page.locator('.legend').first().innerText()) ?? '';
    expect(legend).toContain('A tick is not a signature');
    expect(legend).toContain('Signing is not built');

    await page.locator('#decisions-link').click();
    await expect.poll(() => page.locator('.decision').count()).toBe(CURRENT_SEAMS.length);
    expect(await page.locator('.decision .badge').allInnerTexts()).toEqual([...CURRENT_SEAMS]);
    const decisions = await page.locator('body').innerText();
    texts.push(decisions);
    expect(decisions).toContain('Decided, not built');
    expect(decisions).toContain('For counsel, not Cory homework.');
    for (const id of ['D03', 'D10']) {
      expect(await page.locator('.decision .badge', { hasText: id }).count()).toBe(0);
    }

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
    expect(await page.getByText('No pairwise agreements.').count()).toBe(1);
    await expect.poll(() => page.locator('.project-list a').count()).toBe(4);
    await page.close();
  });

  it('simulates present, tick, drop-and-resend without escalation, and offers no universal omission', async () => {
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    await page.locator('#start-simulation').click();
    await page.locator('h2', { hasText: 'Project created in this session' }).waitFor();
    await expect.poll(() => page.locator('details.sim-panel').count()).toBe(2);

    const panel = (i: number) => page.locator('details.sim-panel').nth(i);
    async function open(i: number): Promise<void> {
      if ((await panel(i).getAttribute('open')) === null) await panel(i).locator('summary').click();
    }
    async function addTerm(i: number, text: string): Promise<void> {
      await open(i);
      await panel(i).locator('input[type=text]').fill(text);
      const before = await page.locator('.sim-terms li').count();
      await panel(i).locator('button', { hasText: 'Add term' }).click();
      await expect.poll(() => page.locator('.sim-terms li').count()).toBe(before + 1);
    }
    async function present(i: number, label: string, uncheck: number[] = []): Promise<void> {
      await open(i);
      for (const index of uncheck) await panel(i).locator('.sim-terms input').nth(index).uncheck();
      const before = await page.locator('.version').count();
      await panel(i).locator('button', { hasText: label }).click();
      await expect.poll(() => page.locator('.version').count()).toBe(before + 1);
    }
    const box = (i: number, text: string) => panel(i).locator('.sim-terms li', { hasText: text }).locator('input');
    type Box = { disabled: boolean; checked: boolean };
    /** Clicks a control the demo server must refuse, and discounts exactly that one logged 409. */
    async function expectRefusal(click: () => Promise<void>, toastText: string): Promise<void> {
      const errorsBefore = pageErrors.length;
      const expectedConsoleError = page.waitForEvent('console', (m) => m.type() === 'error' && m.text().includes('409'));
      await click();
      await expect.poll(() => page.locator('#toast').textContent()).toContain(toastText);
      const controlled = `desktop: ${(await expectedConsoleError).text()}`;
      await page.waitForTimeout(200);
      const added = pageErrors.splice(errorsBefore);
      const own = added.indexOf(controlled);
      expect(own).toBeGreaterThanOrEqual(0);
      added.splice(own, 1);
      pageErrors.push(...added);
    }

    await addTerm(1, '[synthetic] pairwise one');
    await addTerm(1, '[synthetic] pairwise two');
    await addTerm(1, '[synthetic] three, to drop');
    await present(1, 'Present version 1');

    const block = page.locator('.agreement-block');
    for (let i = 0; i < 2; i += 1) {
      const before = await block.locator('.cell.yes').count();
      await block.locator('button.sim-affirm').first().click();
      await expect.poll(() => block.locator('.cell.yes').count()).toBe(before + 1);
    }

    // A term stored after version 1 cannot be added to the resend: escalation cannot happen.
    await addTerm(1, '[synthetic] four, added later');
    await open(1);
    expect(await box(1, 'four, added later').isDisabled()).toBe(true);
    expect(await box(1, 'four, added later').isChecked()).toBe(false);
    expect(await box(1, 'three, to drop').isDisabled()).toBe(false);
    expect(await panel(1).locator('.sim-locked').allTextContents()).toEqual([expect.stringContaining('no escalation')]);

    // Forcing the disabled box on is refused by the demo server, and nothing is presented.
    await box(1, 'four, added later').evaluate((node) => {
      (node as unknown as Box).disabled = false;
      (node as unknown as Box).checked = true;
    });
    const versionsBefore = await page.locator('.version').count();
    await expectRefusal(() => panel(1).locator('button', { hasText: 'Present version 2' }).click(), 'escalation cannot happen');
    expect(await page.locator('.version').count()).toBe(versionsBefore);

    // Dropping a term is the decided drop-and-resend.
    await present(1, 'Present version 2', [2]);
    await expect.poll(() => block.locator('.dropped').allInnerTexts()).toEqual([expect.stringContaining('three, to drop')]);
    // Version 1 keeps its two tick rows; nothing is offered on either version now (S05 guard).
    expect(await block.locator('.cell.yes').count()).toBe(2);
    expect(await block.locator('button.sim-affirm').count()).toBe(0);

    // Universal layer: once version 1 is presented, every shared term is locked
    // in, and a term stored later cannot be added. No omission path is offered.
    await addTerm(0, '[synthetic] shared one');
    await addTerm(0, '[synthetic] shared two');
    await present(0, 'Present version 1');
    await addTerm(0, '[synthetic] shared three');
    await open(0);
    for (const text of ['shared one', 'shared two']) {
      expect({ text, disabled: await box(0, text).isDisabled(), checked: await box(0, text).isChecked() }).toEqual({
        text,
        disabled: true,
        checked: true,
      });
    }
    expect(await box(0, 'shared three').isDisabled()).toBe(true);
    expect(await box(0, 'shared three').isChecked()).toBe(false);
    const shared = page.locator('section.card', { hasText: 'Shared terms — universal layer' });

    // Forcing a shared term off is refused by the demo server.
    await box(0, 'shared two').evaluate((node) => {
      (node as unknown as Box).disabled = false;
      (node as unknown as Box).checked = false;
    });
    const sharedBefore = await shared.locator('.version').count();
    await expectRefusal(() => panel(0).locator('button', { hasText: 'Present version 2' }).click(), 'can never be left out');
    expect(await shared.locator('.version').count()).toBe(sharedBefore);
    expect(await shared.locator('.dropped').count()).toBe(0);

    const universalHint = (await shared.locator('.sim-present-hint').textContent()) ?? '';
    const pairwiseHint = (await block.locator('.sim-present-hint').textContent()) ?? '';
    const pairwiseNotes = (await block.locator('.version p').allTextContents()).join(' ');
    expect(pairwiseHint).toContain('dropped and resent (D02)');
    expect(pairwiseHint).toContain('escalation cannot happen');
    expect(pairwiseNotes).toContain('Dropped since version 1');
    expect(pairwiseNotes).toContain('R1');
    expect(universalHint).toContain('A shared safety term can never be dropped');
    for (const text of [universalHint, pairwiseHint]) expect(text).not.toMatch(/undecided/);
    expect(await page.locator('.sim-assumptions').count()).toBe(1);
    await page.screenshot({ path: join(SHOTS, 'simulator-desktop.png'), fullPage: true });

    await page.setViewportSize(VIEWPORTS.mobile);
    await noHorizontalScroll(page);
    await page.screenshot({ path: join(SHOTS, 'simulator-mobile.png'), fullPage: true });
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
    await expect.poll(() => page.locator('.cell.yes').count()).toBe(8);
    expect(await page.locator('details.sim-panel').count()).toBe(0);
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

    it('A then B, B resolves first, A last: B stays displayed and the simulator targets B', async () => {
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

      // The simulator acts on B, the displayed and selected project. The write is
      // intercepted and answered here, so it never reaches the server and no
      // data changes.
      const writes: string[] = [];
      await page.route('**/demo/sim/**', async (route) => {
        writes.push(new URL(route.request().url()).pathname);
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000000' }) });
      });
      const panel = page.locator('details.sim-panel').first();
      await panel.locator('summary').click();
      await panel.locator('input[type=text]').fill('[synthetic] intercepted');
      await panel.locator('button', { hasText: 'Add term' }).click();
      await expect.poll(() => writes).toEqual([`/demo/sim/projects/${b}/terms`]);
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
    await expect.poll(() => page.locator('.cell.yes').count()).toBe(8);
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
