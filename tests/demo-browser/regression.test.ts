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
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import { bindPartyToAccount } from '../../src/accounts/binding.ts';
import { addBriefItem, openLiveBrief } from '../../src/briefs/brief.ts';
import { createDemoApplication } from '../../src/demo/application.ts';
import { demoDatabaseTarget, demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { collectSnapshot, renderSnapshotHtml } from '../../src/demo/export.ts';
import type { FixtureAnnotations } from '../../src/demo/fixtures.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../../src/demo/annotations.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { resetDemoDatabase } from '../../src/demo/reset.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { enterOperatorMode } from '../support/demo-browser.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * The whole demo, end to end, in a real browser: reset, fixtures, project
 * creation, the S09 walkthrough (draft → share → live → resolve → decline →
 * tick → group-check → untick → retick → READY TO SIGN), reset repeatability,
 * the portable snapshot, desktop and mobile rendering, stale navigation, and
 * production isolation. Screenshots go to test-results/demo/.
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
let demoOperations: ReturnType<typeof createDemoOperations>;
const pageErrors: string[] = [];

async function reset(): Promise<FixtureAnnotations> {
  return resetDemoDatabase({
    host: '127.0.0.1',
    databaseUrl: requireEnv('DATABASE_URL'),
    migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'),
    demoDir: fixtureDir,
  });
}

async function openPage(viewport: keyof typeof VIEWPORTS, url = `${base}/inspector`): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORTS[viewport] });
  page.on('pageerror', (e) => pageErrors.push(`${viewport}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${viewport}: ${m.text()}`);
  });
  await enterOperatorMode(page, base);
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
  const store = new AnnotationStore(join(fixtureDir, ANNOTATIONS_FILE));
  // The operation list, for the production-isolation check; the server runs the real demo wiring.
  demoOperations = createDemoOperations(store);
  const demo = await createDemoApplication({ db: database.db, logger, annotations: store });
  app = demo.app;
  server = createDemoServer({ app, annotations: store, testIssuer: demo.issuer });
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  demo.origins.push(base);
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

/** Retired with S03–S05 (S08), or history the live brief never shows (S09). */
const NEVER_IN_PROJECT_VIEWS = [
  /\bversions?\b/i,
  /\bR1\b/,
  /\bR2\b/,
  /\bsealed\b/i,
  /affirmation/i,
  /declined by/i,
  /changed by/i,
  /\brevision/i,
  /activity/i,
  /audit/i,
  /read receipt/i,
  /\btick row/i,
];

/** Clears the transient toast so a screenshot shows state only. */
async function settle(page: Page): Promise<void> {
  await page.locator('#toast').evaluate((node) => {
    (node as unknown as { hidden: boolean }).hidden = true;
  });
}

/** Hides what changes run to run (ids), so the milestone screenshot is stable. */
const masks = (page: Page) => [page.locator('.id'), page.locator('.detail-head .meta code'), page.locator('.project-list .meta code')];

/**
 * Mobile milestone shots mid-walkthrough: the first screen and the whole page at
 * 390 px, with the brief near the top and no horizontal scroll; then back to desktop.
 */
async function shootMobile(page: Page, name: string): Promise<void> {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.evaluate('window.scrollTo(0, 0)');
  await noHorizontalScroll(page);
  expect((await page.locator('.band').boundingBox())!.y).toBeLessThan(VIEWPORTS.mobile.height / 2);
  await page.screenshot({ path: join(SHOTS, `${name}-mobile-top.png`), mask: masks(page), animations: 'disabled' });
  await page.screenshot({ path: join(SHOTS, `${name}-mobile.png`), fullPage: true, mask: masks(page), animations: 'disabled' });
  await page.setViewportSize(VIEWPORTS.desktop);
}

describe('demo regression', () => {
  for (const viewport of ['desktop', 'mobile'] as const) {
    it(`shows the fixtures: drafts by layer, private money, and one brief ready to sign (${viewport})`, async () => {
      const page = await openPage(viewport);
      const items = page.locator('.project-list a');
      await expect.poll(() => items.count()).toBe(4);
      expect(await items.allInnerTexts()).toEqual([
        expect.stringContaining('Fixture 1'),
        expect.stringContaining('Fixture 2'),
        expect.stringContaining('Fixture 3'),
        expect.stringContaining('Fixture 4'),
      ]);

      await page.getByText(titleOf('Fixture 1'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 1' }).waitFor();
      await expect.poll(() => page.locator('.brief-item').count()).toBe(5);
      expect(await page.locator('.stage-headline').innerText()).toBe('DRAFT');
      expect((await page.locator('.brief .layer h4').allInnerTexts()).map((t) => t.toLowerCase())).toEqual(['universal', 'shared']);
      // Schema labels are kept as instrumentation behind Engineering notes (hidden by default)...
      expect(await page.locator('.brief .tags').first().isVisible()).toBe(false);
      const tags = (await page.locator('.brief .tag').allTextContents()).join(' | ').toLowerCase();
      for (const label of ['subject', 'shape', 'declaration', 'request', 'open parameter', 'decide together', 'awaiting its subject', 'project-wide', 'between']) {
        expect({ label, shown: tags.includes(label) }).toEqual({ label, shown: true });
      }
      // ...and the same facts read in plain language.
      const chips = (await page.locator('.brief .chip').allInnerTexts()).join(' | ');
      for (const label of ['Declaration by', 'Request · only', 'sets this', 'Decide together', 'Waiting for', 'Between', 'everyone can see it']) {
        expect({ label, shown: chips.includes(label) }).toEqual({ label, shown: true });
      }
      expect(await page.locator('.presence-status.unset').count()).toBe(2);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `fixture1-${viewport}.png`), fullPage: true });

      await page.getByText(titleOf('Fixture 2'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 2' }).waitFor();
      await expect.poll(() => page.locator('.brief-item').count()).toBe(4);
      const money = page.locator('.brief-item[data-layer="money"]');
      expect(await money.count()).toBe(2);
      for (const fee of await money.all()) {
        expect(await fee.locator('.tag.private').textContent()).toMatch(/^private to this pair · Pair (A|B)–C$/);
        expect(await fee.locator('.chip.private').innerText()).toMatch(/^Private · only Party (A|B) & Party C see this$/);
      }
      expect(await page.locator('.brief-item:not([data-layer="money"]) .tag.private').count()).toBe(0);
      expect(await page.locator('.brief-item:not([data-layer="money"]) .chip.private').count()).toBe(0);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `fixture2-${viewport}.png`), fullPage: true });

      await page.getByText(titleOf('Fixture 3'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 3' }).waitFor();
      await expect.poll(() => page.getByText('The draft brief has no items.').count()).toBe(1);

      await page.getByText(titleOf('Fixture 4'), { exact: true }).first().click();
      await page.locator('h2', { hasText: 'Fixture 4' }).waitFor();
      await expect.poll(() => page.locator('.stage-headline').innerText()).toBe('READY TO SIGN');
      expect(await page.locator('.brief-item').count()).toBe(7);
      expect(await page.locator('.brief-item.green').count()).toBe(7);
      expect(await page.locator('.brief-item[data-layer="money"] .tag.private').textContent()).toBe('private to this pair · Pair: Photographer ↔ Model');
      expect(await page.locator('.brief-item[data-layer="money"] .chip.private').innerText()).toBe('Private · only Model & Photographer see this');
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `fixture4-${viewport}.png`), fullPage: true, mask: masks(page), animations: 'disabled' });

      await page.locator('#decisions-link').click();
      await expect.poll(() => page.locator('.decision').count()).toBe(CURRENT_SEAMS.length);
      await noHorizontalScroll(page);
      await page.screenshot({ path: join(SHOTS, `decisions-${viewport}.png`), fullPage: true });
      await page.close();
    });
  }

  it('teaches no superseded semantics, shows no history, and names only the current Cory seams', async () => {
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
      /Presence is not recorded/,
    ];
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    const texts: string[] = [];
    for (const fixture of ['Fixture 1', 'Fixture 2', 'Fixture 3', 'Fixture 4']) {
      await page.getByText(titleOf(fixture), { exact: true }).first().click();
      await page.locator('h2', { hasText: fixture }).waitFor();
      const text = await page.locator('#detail').innerText();
      texts.push(text);
      for (const never of NEVER_IN_PROJECT_VIEWS) {
        expect({ fixture, never: String(never), found: never.test(text) }).toEqual({ fixture, never: String(never), found: false });
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
    await expect.poll(() => page.locator('.project-list a').count()).toBe(5);
    await page.close();
  });

  it('walks a photographer and a model from draft to READY TO SIGN, and back and forth through green', async () => {
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    expect(await page.locator('#start-simulation').innerText()).toBe('Start the walkthrough');

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
    const headline = () => page.locator('.stage-headline').innerText();
    const itemWith = (text: string) => page.locator('.brief-item', { hasText: text });
    async function actAs(name: 'Photographer' | 'Model'): Promise<void> {
      await page.locator('.actor-bar button', { hasText: name }).click();
      await expect.poll(() => page.locator('.actor.current').innerText()).toBe(name);
    }
    /** Clicks, then waits for the record to reload with `done` true. */
    async function act(click: () => Promise<void>, done: () => Promise<boolean>): Promise<void> {
      await click();
      await expect.poll(done).toBe(true);
    }

    // 1–2. Start, and inspect the draft: three layers, private money, pending items.
    await page.locator('#start-simulation').click();
    await page.locator('h2', { hasText: 'Walkthrough — Photographer and Model' }).waitFor();
    await expect.poll(() => page.locator('.brief-item').count()).toBe(8);
    expect(await headline()).toBe('DRAFT');
    expect((await page.locator('.brief .layer h4').allInnerTexts()).map((t) => t.toLowerCase())).toEqual(['universal', 'shared', 'private money']);
    expect(await page.locator('.brief-item[data-layer="money"] .tag.private').textContent()).toBe('private to this pair · Pair: Model ↔ Photographer');
    expect(await page.locator('.brief-item[data-layer="money"] .chip.private').innerText()).toBe('Private · only Model & Photographer see this');
    expect(await page.locator('.actor-bar').count()).toBe(0);
    // Orientation: the cast and the stage sit in one band; engineering notes are collapsed.
    expect(await page.locator('.band .cast-chip').allInnerTexts()).toEqual(['Model', 'Photographer']);
    expect(await page.locator('.detail-head .meta').isVisible()).toBe(false);
    expect(await page.locator('.brief-item .tags').first().isVisible()).toBe(false);
    await page.locator('#eng-toggle').click();
    expect(await page.locator('.brief-item .tags').first().isVisible()).toBe(true);
    await page.locator('#eng-toggle').click();
    expect(await page.locator('.brief-item .tags').first().isVisible()).toBe(false);
    await settle(page);
    await page.evaluate('window.scrollTo(0, 0)');
    await page.screenshot({ path: join(SHOTS, 'walkthrough-1-draft-desktop.png'), fullPage: true, mask: masks(page), animations: 'disabled' });
    await shootMobile(page, 'walkthrough-1-draft');

    // 3–5. Sharing is refused until both have an on-site answer; then it goes live.
    await expectRefusal(() => page.locator('button.share').click(), 'on-site answer');
    expect(await headline()).toBe('DRAFT');
    for (const who of ['Photographer', 'Model']) {
      await act(
        () => page.locator('.presence li', { hasText: who }).locator('button', { hasText: /^On site$/ }).click(),
        async () => (await page.locator('.presence li', { hasText: who }).locator('.presence-status').innerText()) === 'on site',
      );
    }
    await act(() => page.locator('button.share').click(), async () => (await headline()) === 'LIVE');
    expect(await page.locator('.band-note').innerText()).toContain('now live');
    // Live with work still open: neutral waiting labels, not errors.
    expect(await page.locator('.chip.waiting').allInnerTexts()).toEqual(['Decide together · still open', 'Waiting for Model']);
    await settle(page);
    await page.evaluate('window.scrollTo(0, 0)');
    await page.screenshot({ path: join(SHOTS, 'walkthrough-2-live-open-desktop.png'), fullPage: true, mask: masks(page), animations: 'disabled' });
    await shootMobile(page, 'walkthrough-2-live-open');
    expect(await page.locator('.presence button').count()).toBe(0);
    expect(await page.locator('button.share').count()).toBe(0);

    // 6. Resolve: the delivery date together; the coverage level only by the model.
    await act(
      async () => {
        await itemWith('Delivery date').locator('input').fill('[synthetic] Within two weeks');
        await itemWith('Delivery date').locator('button', { hasText: 'Settle together' }).click();
      },
      async () => (await itemWith('Delivery date').locator('.value').count()) === 1,
    );
    await actAs('Photographer');
    expect(await itemWith('Coverage level').locator('.hint').innerText()).toBe('Waiting for Model to set this.');
    await actAs('Model');
    await act(
      async () => {
        await itemWith('Coverage level').locator('input').fill('[synthetic] Level 2');
        await itemWith('Coverage level').locator('button', { hasText: 'Set as Model' }).click();
      },
      async () => (await itemWith('Coverage level').locator('.value').count()) === 1,
    );
    expect(await page.locator('.tag.pending').count()).toBe(0);
    expect(await page.locator('.chip.waiting').count()).toBe(0);

    // 7. The model declines the album-cover request: it simply disappears.
    expect(await itemWith('album cover').locator('button', { hasText: 'Decline as Model' }).count()).toBe(1);
    expect(await itemWith('album cover').locator('.chip', { hasText: 'only Model can decline it' }).count()).toBe(1);
    await act(() => itemWith('album cover').locator('button', { hasText: 'Decline as Model' }).click(), async () => (await page.locator('.brief-item').count()) === 7);
    expect(await page.getByText('album cover').count()).toBe(0);
    expect(await page.locator('#toast').textContent()).toBe('Request removed.');
    // Numbering is display order: no gap betrays the declined request.
    expect(await page.locator('.brief-item .pos').allInnerTexts()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    await settle(page);
    await page.evaluate('window.scrollTo(0, 0)');
    await page.screenshot({ path: join(SHOTS, 'walkthrough-3-live-resolved-desktop.png'), fullPage: true, mask: masks(page), animations: 'disabled' });
    await shootMobile(page, 'walkthrough-3-live-resolved');

    // 8. Individual ticks: the fee, by each of the pair.
    for (const who of ['Photographer', 'Model'] as const) {
      await actAs(who);
      await act(
        () => itemWith('Fee for the shoot').locator('button', { hasText: `Tick as ${who}` }).click(),
        async () => (await itemWith('Fee for the shoot').locator('.approval.yes').count()) === (who === 'Photographer' ? 1 : 2),
      );
    }
    await expect.poll(() => itemWith('Fee for the shoot').getAttribute('class')).toContain('green');

    // 9–10. Group-check ordinary material; the deliberate coverage level refuses it.
    await actAs('Photographer');
    const panel = page.locator('details.group-check');
    await panel.locator('summary').click();
    const coverageBox = panel.locator('li', { hasText: 'Coverage level' }).locator('input');
    expect(await coverageBox.isDisabled()).toBe(true);
    expect(await coverageBox.isChecked()).toBe(false);
    expect(await panel.locator('li.deliberate .hint').allInnerTexts()).toEqual(['Needs its own tick']);
    await coverageBox.evaluate((node) => {
      (node as unknown as { disabled: boolean; checked: boolean }).disabled = false;
      (node as unknown as { disabled: boolean; checked: boolean }).checked = true;
    });
    await expectRefusal(() => panel.locator('button', { hasText: 'Group-check as Photographer' }).click(), 'own deliberate tick');
    expect(await page.locator('.approval.yes', { hasText: 'Photographer' }).count()).toBe(1);
    for (const who of ['Photographer', 'Model'] as const) {
      await actAs(who);
      const open = page.locator('details.group-check');
      if ((await open.getAttribute('open')) === null) await open.locator('summary').click();
      await act(
        () => open.locator('button', { hasText: `Group-check as ${who}` }).click(),
        async () => (await page.locator('details.group-check li:not(.deliberate)').count()) === 0,
      );
    }
    expect(await headline()).toBe('LIVE');

    // 11. The deliberate coverage level, ticked on its own by each; everything goes green.
    for (const who of ['Model', 'Photographer'] as const) {
      await actAs(who);
      await act(
        () => itemWith('Coverage level').locator('button', { hasText: `Tick as ${who}` }).click(),
        async () => (await itemWith('Coverage level').locator(`.approval.yes`, { hasText: who }).count()) === 1,
      );
    }
    await expect.poll(headline).toBe('READY TO SIGN');
    expect(await page.locator('.brief-item.green').count()).toBe(7);
    expect(await page.locator('.band-note').innerText()).toContain('ready to sign');

    // 12–13. An untick loses green and readiness at once; a retick restores both.
    await act(
      () => itemWith('Fee for the shoot').locator('button', { hasText: 'Untick as Photographer' }).click(),
      async () => (await headline()) === 'LIVE',
    );
    expect(await itemWith('Fee for the shoot').getAttribute('class')).not.toContain('green');
    expect(await page.locator('.brief-item.green').count()).toBe(6);
    expect(await page.locator('.band-note').innerText()).toContain('No longer ready to sign');
    expect(await page.locator('.milestone.ready').count()).toBe(0);
    await act(
      () => itemWith('Fee for the shoot').locator('button', { hasText: 'Tick as Photographer' }).click(),
      async () => (await headline()) === 'READY TO SIGN',
    );

    // 14. READY TO SIGN: the end of S09. No signing control exists.
    expect(await page.locator('.brief-item.green').count()).toBe(7);
    // The only "Sign" control is the disabled not-available entry.
    expect(await page.locator('button:not([disabled])', { hasText: /\bsign\b/i }).count()).toBe(0);
    expect(await page.locator('.milestone.ready .milestone-title').innerText()).toBe('READY TO SIGN');
    expect(await page.locator('.stage-detail').innerText()).toContain('Signing is the next step');
    expect(await page.locator('.next-step').innerText()).toContain('Signing is not built in this demo yet');
    // The stage band stays on screen after the last tick: nothing to hunt for.
    const band = (await page.locator('.band').boundingBox())!;
    expect(band.y).toBeGreaterThanOrEqual(0);
    expect(band.y + band.height).toBeLessThanOrEqual(VIEWPORTS.desktop.height);
    expect(await page.locator('.band .stage-headline').innerText()).toBe('READY TO SIGN');
    const detail = await page.locator('#detail').innerText();
    for (const never of NEVER_IN_PROJECT_VIEWS) expect({ never: String(never), found: never.test(detail) }).toEqual({ never: String(never), found: false });
    await settle(page);
    // What the viewer sees right after the final tick, then the whole page.
    await page.screenshot({ path: join(SHOTS, 'ready-to-sign-desktop-after-tick.png'), mask: masks(page), animations: 'disabled' });
    await page.evaluate('window.scrollTo(0, 0)');
    await page.screenshot({ path: join(SHOTS, 'ready-to-sign-desktop-top.png'), mask: masks(page), animations: 'disabled' });
    await page.screenshot({ path: join(SHOTS, 'ready-to-sign-desktop.png'), fullPage: true, mask: masks(page), animations: 'disabled' });

    await page.setViewportSize(VIEWPORTS.mobile);
    await noHorizontalScroll(page);
    await page.evaluate('window.scrollTo(0, 0)');
    // On a phone the band and the milestone are in the first screen.
    expect((await page.locator('.band').boundingBox())!.y).toBeLessThan(VIEWPORTS.mobile.height / 2);
    expect((await page.locator('.milestone.ready').boundingBox())!.y).toBeLessThan(VIEWPORTS.mobile.height);
    await page.screenshot({ path: join(SHOTS, 'ready-to-sign-mobile-top.png'), mask: masks(page), animations: 'disabled' });
    await page.screenshot({ path: join(SHOTS, 'ready-to-sign-mobile.png'), fullPage: true, mask: masks(page), animations: 'disabled' });
    // Scrolled into the items, the band keeps the stage and actor in view.
    await itemWith('Fee for the shoot').scrollIntoViewIfNeeded();
    const stuck = (await page.locator('.band').boundingBox())!;
    expect(stuck.y).toBeGreaterThanOrEqual(0);
    expect(stuck.y).toBeLessThan(20);
    expect(await page.locator('.band .actor.current').isVisible()).toBe(true);
    await page.screenshot({ path: join(SHOTS, 'ready-to-sign-mobile-scrolled.png'), mask: masks(page), animations: 'disabled' });

    // 15. S11: the operator's synthetic finalization. Unbound people are refused, and nothing changes.
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.evaluate('window.scrollTo(0, 0)');
    const finalizeButton = page.locator('button', { hasText: 'Finalize as the operator (synthetic)' });
    await expectRefusal(() => finalizeButton.click(), 'Each person must claim their invitation');
    expect(await headline()).toBe('READY TO SIGN');
    // Bind each person (as claiming their invitation would), then finalize.
    const projectId = (await page.evaluate<string>('location.hash')).split('/')[2]!;
    const parties = (await page.evaluate<{ parties: { id: string }[] }>(`fetch('/demo/projects/${projectId}/record').then((r) => r.json())`)).parties;
    for (const party of parties) {
      const account = await resolveAccountForLogin(database.db, { provider: 'google', providerSubject: `regression-${party.id}` });
      await bindPartyToAccount(database.db, { projectId, partyId: party.id, accountId: account.id });
    }
    await finalizeButton.click();
    await expect.poll(headline).toBe('FINAL — SYNTHETIC');
    const contract = page.locator('.card', { has: page.locator('h3', { hasText: 'Final contract — synthetic' }) });
    await contract.waitFor();
    expect(await contract.locator('.chip', { hasText: 'chain verifies' }).count()).toBe(1);
    expect(await contract.locator('.signatures li').count()).toBe(2);
    expect(await contract.locator('details.rendering iframe[sandbox=""]').count()).toBe(2);
    expect(await page.locator('button:not([disabled])', { hasText: /\bsign\b/i }).count()).toBe(0);
    const finalDetail = await page.locator('#detail').innerText();
    for (const never of NEVER_IN_PROJECT_VIEWS) expect({ never: String(never), found: never.test(finalDetail) }).toEqual({ never: String(never), found: false });
    await contract.locator('details.rendering summary').first().click();
    await expect.poll(() => page.frameLocator('details.rendering iframe').first().locator('body').innerText()).toContain("Proposal rendering for Cory's reaction — synthetic.");
    await page.setViewportSize(VIEWPORTS.mobile);
    await noHorizontalScroll(page);
    await contract.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, 'final-contract-mobile.png'), fullPage: true, mask: masks(page), animations: 'disabled' });
    await page.close();
  });

  it('shows a keyed item without wording only as instrumentation', async () => {
    const page = await openPage('desktop');
    await page.locator('.project-list a').first().waitFor();
    await page.locator('#create-project').click();
    await page.locator('h2', { hasText: 'Project created in this session' }).waitFor();
    const projectId = (await page.locator('.detail-head .meta code').textContent())!;
    const brief = await openLiveBrief(database.db, projectId);
    await addBriefItem(database.db, brief.id, { layer: 'universal', itemKey: 'no_means_no' });
    await page.reload();
    await page.locator('.brief-item').first().waitFor();
    expect(await page.locator('.instrumentation').allInnerTexts()).toEqual(['item key no_means_no — wording not materialized (draft)']);
    expect(await page.locator('.wording').count()).toBe(0);
    await page.close();
  });

  it('exports a portable snapshot that renders from disk with no network and no writes', async () => {
    const fixture = JSON.parse(await (await fetch(`${base}/annotations.json`)).text()) as unknown;
    // As `npm run demo:export` does: an operator-only app on the demo database, never the server's.
    const exportApp = createApp({ db: database.db, logger: createLogger('silent'), resolvePrincipal: demoOperatorPrincipal, additionalOperations: demoOperations });
    await exportApp.ready();
    const html = await renderSnapshotHtml(await collectSnapshot(exportApp, fixture));
    await exportApp.close();
    const file = join(fixtureDir, 'snapshot.html');
    await writeFile(file, html);

    const page = await browser.newPage({ viewport: VIEWPORTS.mobile });
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('pageerror', (e) => pageErrors.push(`snapshot: ${e.message}`));
    await page.goto(pathToFileURL(file).href);
    await expect.poll(() => page.locator('.project-list a').count()).toBe(7);
    expect(await page.locator('#create-project').isDisabled()).toBe(true);
    expect(await page.locator('#start-simulation').isHidden()).toBe(true);
    await page.getByText(titleOf('Fixture 1'), { exact: true }).first().click();
    await expect.poll(() => page.locator('.brief-item').count()).toBe(5);
    expect(await page.locator('button.share').count()).toBe(0);
    await page.getByText(titleOf('Fixture 4'), { exact: true }).first().click();
    await expect.poll(() => page.locator('.stage-headline').innerText()).toBe('READY TO SIGN');
    // State only: no simulation controls in a read-only snapshot.
    expect(await page.locator('.actor-bar, details.group-check, .item-actions, .presence button').count()).toBe(0);
    await noHorizontalScroll(page);

    // The earlier walkthrough test finalizes this project before the snapshot is exported.
    // Open it here so the portable file proves that finalized contract renderings survive export.
    await page.getByText('Walkthrough — Photographer and Model', { exact: true }).first().click();
    await expect.poll(() => page.locator('.stage-headline').innerText()).toBe('FINAL — SYNTHETIC');
    const finalContract = page.locator('.card', { has: page.locator('h3', { hasText: 'Final contract — synthetic' }) });
    await finalContract.waitFor();
    expect(await finalContract.locator('details.rendering iframe[sandbox=""]').count()).toBe(2);
    await finalContract.locator('details.rendering summary').first().click();
    await expect.poll(() => page.frameLocator('details.rendering iframe').first().locator('body').innerText()).toContain("Proposal rendering for Cory's reaction — synthetic.");

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
    await expect.poll(() => page.locator('.project-list a').count()).toBe(4);
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
        const res = await production.inject({ method: op.method, url: op.path.replace(/:[a-zA-Z]+/g, '00000000-0000-4000-8000-000000000000'), payload: {} });
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
