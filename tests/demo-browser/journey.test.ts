import { mkdir, mkdtemp } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../../src/demo/annotations.ts';
import { demoDatabaseTarget, demoOperatorPrincipal } from '../../src/demo/demo.ts';
import type { FixtureAnnotations } from '../../src/demo/fixtures.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { resetDemoDatabase } from '../../src/demo/reset.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * The participant journey in a real browser, at desktop (1280) and mobile
 * (390): the entry screen, the composer (blank values refused per field),
 * the draft (share refused until presence is answered, then shared), the
 * chooser, each person's screen with the simulation label and band, the
 * live resolution to READY TO SIGN (open parameter by its subject only,
 * the agreed value in Simulation controls, group-check, deliberate ticks),
 * untick and retick, the decline path, the three-person fee case, reload and
 * restart. Screenshots per stage go to test-results/demo/journey-*.
 */

const SHOTS = resolve('test-results/demo');
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } } as const;
type Viewport = keyof typeof VIEWPORTS;

let demoDir: string;
let annotations: FixtureAnnotations;
let database: DatabaseHandle;
let app: FastifyInstance;
let server: Server;
let base: string;
let browser: Browser;
const pageErrors: string[] = [];

/** History the live brief never shows (HC1, HC2, Q16). */
const NEVER_SHOWN = [/declined/i, /removed by/i, /changed by/i, /proposed by/i, /\brevision/i, /activity/i, /read receipt/i, /\bversion\b/i, /\bago\b/i, /no[ -]means[ -]no(?! term — its wording)/i];

beforeAll(async () => {
  const executablePath = requireEnv('CHROME_PATH');
  await mkdir(SHOTS, { recursive: true });
  demoDir = await mkdtemp(join(tmpdir(), 'ms-demo-journey-'));
  annotations = await resetDemoDatabase({
    host: '127.0.0.1',
    databaseUrl: requireEnv('DATABASE_URL'),
    migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'),
    demoDir,
  });
  await startServer();
  browser = await chromium.launch({ executablePath });
});

afterAll(async () => {
  await browser?.close();
  await stopServer();
});

async function startServer(port = 0): Promise<void> {
  const logger = createLogger('warn');
  database = openDatabase(demoDatabaseTarget(requireEnv('DATABASE_URL')), logger);
  const store = new AnnotationStore(join(demoDir, ANNOTATIONS_FILE));
  app = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: createDemoOperations(store) });
  await app.ready();
  server = createDemoServer({ app, annotations: store });
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

async function openPage(viewport: Viewport, hash = '#/'): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORTS[viewport] });
  page.on('pageerror', (e) => pageErrors.push(`${viewport}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${viewport}: ${m.text()}`);
  });
  await page.goto(`${base}/${hash}`);
  await idle(page);
  return page;
}

/** Waits until the screen shows the current address and no request or render is in flight. */
async function idle(page: Page): Promise<void> {
  // (page.evaluate, not waitForFunction: the demo's CSP forbids string evaluation in the page.)
  await expect
    .poll(() => page.evaluate<boolean>("!document.body.hasAttribute('data-busy') && document.body.dataset.route === (location.hash || '#/')"), { interval: 20, timeout: 10_000 })
    .toBe(true);
}

async function click(page: Page, target: Locator): Promise<void> {
  await target.click();
  await idle(page);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const [scrollWidth, innerWidth] = await page.evaluate<[number, number]>('[document.documentElement.scrollWidth, window.innerWidth]');
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function hideToast(page: Page): Promise<void> {
  await page.locator('#toast').evaluate((node) => {
    (node as unknown as { hidden: boolean }).hidden = true;
  });
}

async function shot(page: Page, name: string, viewport: Viewport): Promise<void> {
  await hideToast(page);
  await noHorizontalScroll(page);
  await page.screenshot({ path: join(SHOTS, `journey-${name}-${viewport}.png`), fullPage: true, animations: 'disabled' });
}

/** Clicks a control the server must refuse, and discounts exactly the one console error the refused request logs. */
async function expectRefusal(page: Page, viewport: Viewport, act: () => Promise<void>, status: number): Promise<void> {
  const before = pageErrors.length;
  const logged = page.waitForEvent('console', (m) => m.type() === 'error' && m.text().includes(String(status)));
  await act();
  const text = `${viewport}: ${(await logged).text()}`;
  await page.waitForTimeout(150);
  const added = pageErrors.splice(before);
  const own = added.indexOf(text);
  expect(own).toBeGreaterThanOrEqual(0);
  added.splice(own, 1);
  pageErrors.push(...added);
}

/** Every participant screen carries the simulation label, the band and no signing control. */
/** Every participant screen carries the demo indicator, the simulation note and no signing control. */
async function participantInvariants(page: Page, viewport: Viewport): Promise<void> {
  expect(await page.locator('.simulation-note').innerText()).toBe('Demo simulation — in the product, each person signs in and acts only for themselves.');
  expect(await page.locator('.demo-pill').innerText()).toContain('Synthetic demo');
  expect(await page.locator('button:not([disabled]), a', { hasText: /\bsign(ature|ed)?\b(?! in)/i }).count()).toBe(0);
  const text = await page.locator('#screen').innerText();
  for (const never of NEVER_SHOWN) expect({ never: String(never), found: never.test(text) }).toEqual({ never: String(never), found: false });
  expect(text).not.toMatch(/\bnull\b|\bundefined\b|\[object |\[synthetic\]/);
  if (viewport === 'mobile') {
    // The person switch is in the first half-screen; every control is at least 44 px tall.
    expect((await page.locator('.viewing').boundingBox())!.y).toBeLessThan(VIEWPORTS.mobile.height / 2);
    for (const control of await page.locator('#screen button:visible, #screen .people a:visible, #screen input[type=text]:visible').all()) {
      const box = await control.boundingBox();
      const name = await control.innerText().catch(() => '');
      if (box) expect({ control: name, tall: box.height >= 44 }).toEqual({ control: name, tall: true });
    }
  }
  await noHorizontalScroll(page);
}

async function switchTo(page: Page, label: string): Promise<void> {
  await click(page, page.locator('.people a', { hasText: label }));
  await expect.poll(() => page.locator('.people a[aria-current="page"]').innerText()).toBe(label);
}

const item = (page: Page, text: string) => page.locator('.term', { hasText: text });
const stage = (page: Page) => page.locator('.progress-steps li.current').innerText();

/** Ticks everything this person can tick: the ordinary terms together, then each deliberate one on its own. */
async function tickEverything(page: Page): Promise<void> {
  const group = page.locator('.next button.group-run');
  if (await group.count()) await click(page, group);
  while (await page.locator('.term button.tick').count()) {
    await click(page, page.locator('.term button.tick').first());
  }
}

/** Opens a demo-menu entry from the welcome screen. */
async function fromMenu(page: Page, title: string): Promise<void> {
  await click(page, page.locator('.menu-link'));
  await click(page, page.locator('.menu-item', { hasText: title }));
}

describe('participant journey', () => {
  it('welcomes with one primary action, keeps examples and tools in the demo menu, and explains the demo in About', async () => {
    for (const viewport of ['desktop', 'mobile'] as const) {
      const page = await openPage(viewport);
      expect(await page.locator('.demo-pill').innerText()).toContain('Synthetic demo');
      expect(await page.locator('.hero .btn.primary').allInnerTexts()).toEqual(['Create a shoot']);
      expect(await page.locator('#screen .btn.primary').count()).toBe(1);
      await shot(page, '1-welcome', viewport);

      await click(page, page.locator('.menu-link'));
      expect((await page.locator('.menu-item strong').allInnerTexts()).slice(0, 5)).toEqual([
        'Two-person shoot, from the start',
        'Shared, with values still open',
        'After a declined request',
        'Three people, two fees',
        'Empty shoot',
      ]);
      expect(await page.locator('.menu-item', { hasText: 'Inspector' }).count()).toBe(1);
      await shot(page, '1-demo-menu', viewport);

      await click(page, page.locator('.menu-item', { hasText: 'About this demo' }));
      const about = await page.locator('#screen').innerText();
      for (const statement of [
        'Invented people, nothing here is real',
        'not the read-only snapshot',
        'Who enters an agreed value in the product is an open question for Cory',
        'It is a structural rule: the list of terms a shoot must contain is not drafted yet',
        'Signing is the next step and is not built in this demo',
        'The no-means-no term — its wording is Cory’s to write (D04).',
        'Real sign-in (D03).',
        'What signing looks like (D04).',
        'Walking away from a collaboration.',
        '“Live” in particular is a candidate word, not a chosen one.',
        'Which section each term sits in (on set, the shoot, fee) is a demo choice, not the term catalogue.',
        'anyone who opens this demo can act as any person by changing the address',
      ]) {
        expect({ statement, shown: about.includes(statement) }).toEqual({ statement, shown: true });
      }
      await shot(page, '1-about', viewport);
      await page.close();
    }
  });

  for (const viewport of ['desktop', 'mobile'] as const) {
    it(`composes a shoot and resolves it, as each person, to READY TO SIGN — and back (${viewport})`, async () => {
      const page = await openPage(viewport);
      await click(page, page.locator('a', { hasText: 'Create a shoot' }));
      expect(await page.locator('.operator-note').innerText()).toContain('You are composing as the demo operator.');
      // No closed-set term, no physical-contact row, no extra rows: exactly these fields.
      expect(await page.locator('.compose .field').evaluateAll((rows) => rows.map((r) => (r as unknown as { dataset: { field: string } }).dataset.field))).toEqual([
        'concept',
        'declaration',
        'callTime',
        'deliveryDate',
        'coverage',
        'deliverables',
        'request',
        'fee',
      ]);
      const form = await page.locator('.compose').innerText();
      expect(form).not.toMatch(/physical contact|closed set/i);
      // Nothing can mark an item required; the form says so.
      expect(form).toContain('Nothing here marks a term as required.');
      expect(await page.locator('.compose input[type=checkbox]').count()).toBe(0);
      // Progressive disclosure: a value box shows only for a state that has a value.
      expect(await page.locator('#f-fee-value').isHidden()).toBe(true);
      expect(await page.locator('#f-coverage-value').isHidden()).toBe(true);

      // A blank supplied value is refused, with feedback on that field.
      const concept = `Rooftop portraits (${viewport})`;
      await page.locator('#f-concept').fill('   ');
      await page.locator('#f-fee-amount').check();
      expect(await page.locator('#f-fee-value').isVisible()).toBe(true);
      await page.locator('#f-fee-value').fill('');
      await page.locator('button', { hasText: 'Create the draft' }).click();
      expect(await page.locator('[data-field="concept"] .field-error').innerText()).toBe('Fill it in.');
      expect(await page.locator('[data-field="fee"] .field-error').innerText()).toBe('Fill it in, or mark it decide together.');
      await shot(page, '2-compose-blank', viewport);

      // Typed input survives a reload.
      await page.locator('#f-concept').fill(concept);
      await page.reload();
      await idle(page);
      expect(await page.locator('#f-concept').inputValue()).toBe(concept);
      expect(await page.locator('#f-fee-amount').isChecked()).toBe(true);

      // This variation: the fee and the delivery date to decide together, coverage left to the Model.
      await page.locator('#f-fee-decide_together').check();
      await shot(page, '2-compose', viewport);
      await click(page, page.locator('button', { hasText: 'Create the draft' }));
      await page.locator('h1', { hasText: concept }).waitFor();
      expect(await stage(page)).toBe('Draft');
      await shot(page, '3-draft', viewport);

      // Sharing is refused until every person has an on-site answer.
      await expectRefusal(page, viewport, () => click(page, page.locator('button.share')), 409);
      expect(await page.locator('.share-error').innerText()).toBe('Every person needs an on-site answer before the brief can be shared.');
      for (const row of await page.locator('.presence-row').all()) await click(page, row.locator('button', { hasText: /^On set$/ }));
      await click(page, page.locator('button.share'));
      await page.locator('h2', { hasText: 'Open the brief as…' }).waitFor();
      expect(await page.locator('.chooser-buttons a').allInnerTexts()).toEqual(['Model', 'Photographer']);
      await shot(page, '4-chooser', viewport);

      // As the Model: the next step is the value only she controls.
      await click(page, page.locator('.chooser-buttons a', { hasText: 'Model' }));
      expect(await page.locator('.people a[aria-current="page"]').innerText()).toBe('Model');
      expect(await stage(page)).toBe('Live');
      expect(await page.locator('.next h2').innerText()).toBe('Set the value only you control');
      await participantInvariants(page, viewport);
      await shot(page, '5-live-model', viewport);

      await click(page, page.locator('.next button', { hasText: 'Set it' }));
      const coverage = item(page, 'Coverage level');
      await coverage.locator('input').fill('Fully clothed');
      await click(page, coverage.locator('button', { hasText: 'Set as Model' }));
      await expect.poll(() => item(page, 'Coverage level').locator('.term-value').innerText()).toBe('Fully clothed');
      expect(await page.locator('.next h2').innerText()).toBe('Decide on a request about you');

      // As the Photographer: no set, no decline; the open values sit in the demo control.
      await switchTo(page, 'Photographer');
      expect(await page.locator('button', { hasText: /Decline as/ }).count()).toBe(0);
      const sim = page.locator('.sim-controls');
      expect(await sim.innerText()).toContain('Enter the value the two of them agreed — who enters it in the product is an open question for Cory.');
      expect(await sim.locator('li').count()).toBe(2);
      await participantInvariants(page, viewport);
      await shot(page, '6-live-photographer', viewport);
      while (await page.locator('.sim-controls li').count()) {
        const row = page.locator('.sim-controls li').first();
        await row.locator('input').fill('Agreed on the day');
        await click(page, row.locator('button', { hasText: 'Enter the agreed value' }));
      }
      expect(await page.locator('.sim-controls').count()).toBe(0);

      await tickEverything(page);
      expect(await stage(page)).toBe('Live');
      // Done for now: a waiting state that says what the brief is waiting on.
      expect(await page.locator('.next.waiting h2').innerText()).toBe('Waiting on the others');
      expect(await page.locator('.waiting-list').innerText()).toMatch(/Model: \d+ terms? to tick/);
      await shot(page, '7-waiting', viewport);

      await switchTo(page, 'Model');
      await tickEverything(page);
      await expect.poll(() => stage(page)).toBe('Ready to sign');
      await expect.poll(() => page.locator('#toast').innerText()).toBe('Everything is ticked — ready to sign.');
      const ready = await page.locator('.ready').innerText();
      expect(ready).toContain('Ready to sign');
      expect(ready).toContain('Signing comes next. It isn’t part of this demo, so nothing here is signed.');
      expect(await page.locator('.term.agreed').count()).toBe(await page.locator('.term').count());
      await participantInvariants(page, viewport);
      await shot(page, '8-ready', viewport);

      // The Photographer sees the same milestone.
      await switchTo(page, 'Photographer');
      await expect.poll(() => stage(page)).toBe('Ready to sign');

      // Any untick returns to Live; a retick restores readiness.
      await click(page, item(page, 'Fee for the shoot').locator('button.untick'));
      await expect.poll(() => stage(page)).toBe('Live');
      await expect.poll(() => page.locator('#toast').innerText()).toBe('No longer ready to sign.');
      await click(page, item(page, 'Fee for the shoot').locator('button.tick'));
      await expect.poll(() => stage(page)).toBe('Ready to sign');

      // Mobile: the person switch stays stuck under the top bar while scrolling.
      if (viewport === 'mobile') {
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await page.waitForTimeout(100);
        expect((await page.locator('.viewing').boundingBox())!.y).toBeLessThanOrEqual(60);
      }

      // Reload keeps the stored state; the wordmark returns to the welcome screen.
      await page.reload();
      await idle(page);
      expect(await stage(page)).toBe('Ready to sign');
      await click(page, page.locator('#shoots-link'));
      expect(await page.locator('.hero h1').count()).toBe(1);
      expect(await page.locator('.shoot-list').innerText()).toContain(concept);
      await page.close();
    });
  }

  it('declines a request as the Model: it disappears, numbering has no gap, and the shoot still reaches READY TO SIGN', async () => {
    const page = await openPage('desktop');
    await fromMenu(page, 'Shared, with values still open');
    await click(page, page.locator('.chooser-buttons a', { hasText: 'Model' }));
    const before = await page.locator('.term').count();
    const coverage = item(page, 'Coverage level');
    await coverage.locator('input').fill('Level 1');
    await click(page, coverage.locator('button', { hasText: 'Set as Model' }));
    expect(await page.locator('.next').innerText()).toContain('Decide on a request about you');
    await click(page, item(page, 'album cover').locator('button', { hasText: 'Decline as Model' }));
    await expect.poll(() => page.locator('#toast').innerText()).toBe('Request removed.');
    expect(await page.locator('.term').count()).toBe(before - 1);
    expect(await page.getByText('album cover').count()).toBe(0);
    const numbers = (await page.locator('.term .pos').allInnerTexts()).map(Number);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    await participantInvariants(page, 'desktop');
    await shot(page, 'declined-model', 'desktop');

    // The Photographer sees no trace of it.
    await switchTo(page, 'Photographer');
    expect(await page.getByText('album cover').count()).toBe(0);
    expect(await page.locator('.term').count()).toBe(before - 1);
    while (await page.locator('.sim-controls li').count()) {
      await page.locator('.sim-controls li input').first().fill('Agreed on the day');
      await click(page, page.locator('.sim-controls li button').first());
    }
    await tickEverything(page);
    await switchTo(page, 'Model');
    await tickEverything(page);
    await expect.poll(() => stage(page)).toBe('Ready to sign');
    await page.close();
  });

  it('keeps an open parameter as the subject’s alone: the other person only sees it waiting', async () => {
    const page = await openPage('mobile');
    await fromMenu(page, 'Shared, with values still open');
    await click(page, page.locator('.chooser-buttons a', { hasText: 'Photographer' }));
    expect(await item(page, 'Coverage level').innerText()).toContain('Waiting for Model');
    expect(await item(page, 'Coverage level').locator('input').count()).toBe(0);
    await participantInvariants(page, 'mobile');
    await page.close();
  });

  it('shows the three-person fee case to each person with only their own fee and no readiness', async () => {
    const page = await openPage('mobile');
    await fromMenu(page, 'Three people, two fees');
    for (const row of await page.locator('.presence-row').all()) await click(page, row.locator('button', { hasText: /^On set$/ }));
    await click(page, page.locator('button.share'));
    expect(await page.locator('.chooser-buttons a').allInnerTexts()).toEqual(['Party A', 'Party B', 'Party C']);
    await click(page, page.locator('.chooser-buttons a', { hasText: 'Party B' }));
    expect(await page.locator('.term[data-layer="money"]').count()).toBe(1);
    expect(await page.locator('#screen').innerText()).not.toContain('300');
    expect(await page.locator('.readiness-note').innerText()).toBe('With more than two people, overall readiness isn’t shown.');
    expect(await page.locator('.doc-section[data-layer="money"] header p').innerText()).toBe('Private money · only you and Party C');
    await participantInvariants(page, 'mobile');
    await shot(page, 'three-person-b', 'mobile');
    await switchTo(page, 'Party A');
    expect(await page.locator('.term[data-layer="money"]').count()).toBe(1);
    expect(await page.locator('.term[data-layer="money"]').innerText()).toContain('300');
    await switchTo(page, 'Party C');
    expect(await page.locator('.term[data-layer="money"]').count()).toBe(2);
    await page.close();
  });

  it('shows the empty shoot, refuses a draft under a person’s screen, and opens the inspector', async () => {
    const page = await openPage('desktop');
    await fromMenu(page, 'Empty shoot');
    expect(await page.locator('h2', { hasText: 'Nobody has joined this shoot yet' }).count()).toBe(1);
    expect(await page.locator('button.share').count()).toBe(0);

    await click(page, page.locator('#shoots-link'));
    await fromMenu(page, 'Two-person shoot, from the start');
    const draftUrl = page.url();
    const party = Object.keys(annotations.projects)[0]!; // any id: a draft is never shown as a person
    await expectRefusal(
      page,
      'desktop',
      async () => {
        await page.goto(`${draftUrl}/as/${party}`);
        await idle(page);
      },
      404,
    );
    expect(await page.locator('h1').innerText()).toBe('Nothing to show as this person');

    await page.goto(`${base}/#/demo`);
    await idle(page);
    await page.locator('.menu-item', { hasText: 'Inspector' }).click();
    await page.locator('.sidebar h1', { hasText: 'Record Inspector' }).waitFor();
    expect(await page.locator('.banner').innerText()).toContain('Synthetic demo · invented people · nothing here is real.');
    await page.close();
  });

  it('keeps labels across a server restart, and a reset clears composed shoots', async () => {
    const port = (server.address() as AddressInfo).port;
    await stopServer();
    await startServer(port);
    const page = await openPage('desktop');
    expect(await page.locator('.shoot-list').innerText()).toContain('Rooftop portraits (desktop)');
    await page.close();

    await stopServer();
    annotations = await resetDemoDatabase({
      host: '127.0.0.1',
      databaseUrl: requireEnv('DATABASE_URL'),
      migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'),
      demoDir,
    });
    await startServer(port);
    const after = await openPage('desktop');
    expect(await after.locator('.your-shoots').count()).toBe(0);
    await after.close();
  });

  it('logged no browser errors', () => {
    expect(pageErrors).toEqual([]);
  });
});
