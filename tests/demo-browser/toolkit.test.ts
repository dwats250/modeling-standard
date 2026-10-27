import { mkdir, mkdtemp } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../../src/demo/annotations.ts';
import { createDemoApplication } from '../../src/demo/application.ts';
import { demoDatabaseTarget } from '../../src/demo/demo.ts';
import { resetDemoDatabase } from '../../src/demo/reset.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { FIXTURE_KEYS } from '../../src/toolkit/fixture-media.ts';
import { PORTFOLIO_MAX_ITEMS } from '../../src/toolkit/tables.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * B1 and B2 in a real browser: two synthetic professionals in two separate
 * browser contexts, A at desktop width (1280) and B at phone width (390), each
 * building their own private profile, comp-card draft and portfolio draft
 * with pointer and keyboard; unsafe text shown as text; save, reload, and a full application
 * restart; crafted requests refused. Screenshots go to
 * test-results/demo/toolkit-*.
 */

const SHOTS = resolve('test-results/demo');
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const UNSAFE = '<img src=x onerror="window.__pwned=1">Bold <b>claims</b>';

let database: DatabaseHandle;
let store: AnnotationStore;
let browser: Browser;
const pageErrors: string[] = [];

interface Running {
  app: FastifyInstance;
  server: Server;
  base: string;
}
let running: Running;

async function start(): Promise<Running> {
  const logger = createLogger('warn');
  const demo = await createDemoApplication({ db: database.db, logger, annotations: store });
  const server = createDemoServer({ app: demo.app, annotations: store, testIssuer: demo.issuer });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  demo.origins.push(base);
  return { app: demo.app, server, base };
}

async function stop(r: Running): Promise<void> {
  r.server.closeAllConnections();
  await new Promise<void>((done) => r.server.close(() => done()));
  await r.app.close();
}

beforeAll(async () => {
  const executablePath = requireEnv('CHROME_PATH');
  await mkdir(SHOTS, { recursive: true });
  const demoDir = await mkdtemp(join(tmpdir(), 'ms-demo-toolkit-'));
  await resetDemoDatabase({ host: '127.0.0.1', databaseUrl: requireEnv('DATABASE_URL'), migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'), demoDir });
  database = openDatabase(demoDatabaseTarget(requireEnv('DATABASE_URL')), createLogger('warn'));
  store = new AnnotationStore(join(demoDir, ANNOTATIONS_FILE));
  running = await start();
  browser = await chromium.launch({ executablePath });
});

afterAll(async () => {
  await browser?.close();
  if (running) await stop(running);
  await database?.close();
});

async function context(name: string, viewport: { width: number; height: number }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${name}: ${m.text()}`);
  });
  return { ctx, page };
}

/** Nothing in flight and the screen shows the current address. */
async function idle(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate<boolean>("!document.body.hasAttribute('data-busy') && document.body.dataset.route === (location.hash || '#/')"), { interval: 20, timeout: 10_000 })
    .toBe(true);
}

async function go(page: Page, hash: string): Promise<void> {
  await page.goto(`${running.base}/${hash}`);
  await idle(page);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.locator('#toast').evaluate((node) => {
    (node as unknown as { hidden: boolean }).hidden = true;
  });
  const [scrollWidth, innerWidth] = await page.evaluate<[number, number]>('[document.documentElement.scrollWidth, window.innerWidth]');
  expect(scrollWidth, `${name}: no horizontal scroll`).toBeLessThanOrEqual(innerWidth);
  await page.screenshot({ path: join(SHOTS, `toolkit-${name}.png`), fullPage: true, animations: 'disabled' });
}

const status = (page: Page) => page.locator('.tk-status:visible').first();
const checked = (page: Page, slot: string) => page.locator(`input[name="slot-${slot}"]:checked`).getAttribute('value');
const keysIn = (page: Page, selector: string) => page.locator(selector).evaluateAll((nodes) => nodes.map((n) => (n as unknown as { dataset: { key: string } }).dataset.key));
const orderKeys = (page: Page) => keysIn(page, '.pf-order .pf-item');
const previewKeys = (page: Page) => keysIn(page, '.tk-aside .pf-grid li, .pf-sheet.full .pf-grid li');
const pick = (page: Page, key: string) => page.locator(`.pf-pick[data-key="${key}"]`);
const move = (page: Page, key: string, action: 'up' | 'down' | 'remove') => page.locator(`.pf-item[data-key="${key}"] [data-action="${action}"]`);
const focusedLabel = (page: Page) => page.evaluate<string | null>("document.activeElement?.getAttribute('aria-label') ?? null");
const k = (i: number) => FIXTURE_KEYS[i]!;
const heroSrc = (page: Page) => page.locator('.tk-aside .cc-hero img, .cc-card.full .cc-hero img').first().getAttribute('src');

async function chooseOwner(page: Page, owner: 'a' | 'b'): Promise<void> {
  await go(page, '#/me');
  await expect.poll(() => page.locator('[data-mode="toolkit-chooser"] h1').innerText()).toBe('Your profile, comp card and portfolio');
  await page.locator(`button.tk-choose[data-owner="${owner}"]`).click();
  await idle(page);
  await expect.poll(() => page.locator('.tk-owner').innerText()).toBe(`Synthetic professional ${owner.toUpperCase()}`);
}

describe('the professional toolkit', () => {
  it('is reachable from the start screen and the demo menu, and asks for a synthetic professional first', async () => {
    const { ctx, page } = await context('visitor', PHONE);
    await go(page, '#/');
    expect(await page.locator('.tk-teaser h2').innerText()).toBe('Your profile, comp card and portfolio');
    expect(await page.locator('#screen').innerText()).not.toMatch(/\b(null|undefined)\b/);
    await go(page, '#/demo');
    expect(await page.locator('a.menu-item[href="#/me"]').count()).toBe(1);
    await go(page, '#/me');
    expect(await page.locator('.tk-chooser').innerText()).toContain('not built yet');
    expect(await page.locator('.tk-band').count()).toBe(0);
    for (const button of await page.locator('.tk-choose').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await shot(page, 'phone-chooser');
    // Nothing of anyone's is reachable without choosing.
    expect((await page.request.get(`${running.base}/me/profile`)).status()).toBe(401);
    await ctx.close();
  });

  it('A (desktop) and B (phone) each build, save and reopen their own profile and comp card', async () => {
    const a = await context('A', DESKTOP);
    const b = await context('B', PHONE);
    await chooseOwner(a.page, 'a');
    await chooseOwner(b.page, 'b');

    // ---- A: profile, with a refused save, then the keyboard ----
    expect(await status(a.page).innerText()).toBe('Not saved yet');
    await a.page.locator('button.tk-save').click();
    expect(await a.page.locator('[data-field="displayName"] .field-error').innerText()).toBe('Enter a display name.');
    expect(await status(a.page).getAttribute('data-state')).toBe('error');
    expect(await a.page.evaluate<string>('document.activeElement?.id')).toBe('displayName');
    await a.page.keyboard.type('Amara Okafor');
    await a.page.keyboard.press('Tab');
    await a.page.keyboard.type('Model');
    await a.page.keyboard.press('Tab');
    await a.page.keyboard.type(UNSAFE);
    expect(await status(a.page).innerText()).toBe('Not saved yet');
    await a.page.locator('#profession').press('Enter'); // Enter in a field submits the form
    await idle(a.page);
    await expect.poll(() => status(a.page).getAttribute('data-state')).toBe('saved');
    expect(await status(a.page).innerText()).toMatch(/^Saved at /);
    expect(await a.page.locator('h1').innerText()).toBe('Amara Okafor');
    // Saved again after an edit: the control is ready for the next save.
    expect(await a.page.locator('button.tk-save').isEnabled()).toBe(true);
    await a.page.locator('#profession').fill('Model and actor');
    expect(await status(a.page).innerText()).toBe('Unsaved changes');
    await a.page.locator('button.tk-save').click();
    await idle(a.page);
    await expect.poll(() => status(a.page).getAttribute('data-state')).toBe('saved');
    await a.page.locator('#profession').fill('Model');
    await a.page.locator('button.tk-save').click();
    await idle(a.page);
    await expect.poll(() => status(a.page).getAttribute('data-state')).toBe('saved');
    await shot(a.page, 'desktop-profile');

    // ---- B: own profile on the phone; sees nothing of A's ----
    expect(await b.page.locator('#displayName').inputValue()).toBe('');
    await b.page.locator('#displayName').fill('Jun Park');
    await b.page.locator('#profession').fill('Photographer');
    await b.page.locator('#biography').fill('Portraits and fashion.\nBased in Vancouver.');
    for (const control of [b.page.locator('button.tk-save'), ...(await b.page.locator('.tk-tab').all())]) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await b.page.locator('button.tk-save').click();
    await idle(b.page);
    await expect.poll(() => status(b.page).getAttribute('data-state')).toBe('saved');
    expect(await b.page.content()).not.toContain('Amara');
    await shot(b.page, 'phone-profile');

    // ---- A: arrange with the keyboard; a choice already used swaps ----
    await go(a.page, '#/me/card');
    expect(await status(a.page).innerText()).toContain('Not saved yet');
    expect(await checked(a.page, 'hero')).toBe('studio-portrait-warm');
    await a.page.locator('input[name="slot-hero"]:checked').focus();
    await a.page.keyboard.press('ArrowRight');
    expect(await checked(a.page, 'hero')).toBe('studio-portrait-slate');
    expect(await heroSrc(a.page)).toBe('/media/fixtures/studio-portrait-slate.svg');
    expect(await status(a.page).innerText()).toBe('Unsaved changes');
    await a.page.locator('label[for="slot-beauty-full-length-studio"]').click(); // Full body's image
    expect(await checked(a.page, 'beauty')).toBe('full-length-studio');
    expect(await checked(a.page, 'fullBody')).toBe('beauty-close');
    expect(await a.page.locator('#toast').innerText()).toBe('Swapped with Full body.');
    await a.page.locator('#tagline').fill('Available for editorial work');
    expect(await a.page.locator('.tk-aside .cc-tagline').innerText()).toBe('Available for editorial work');
    // The unsafe biography is text on the card, never markup.
    expect(await a.page.locator('.tk-aside .cc-bio').innerText()).toContain('<img src=x onerror=');
    expect(await a.page.locator('.cc-bio img, .cc-bio b').count()).toBe(0);
    expect(await a.page.evaluate<unknown>('window.__pwned')).toBeUndefined();
    // Preview with unsaved changes, then back: the edits are still there.
    await a.page.locator('.tk-subtab[href="#/me/card/preview"]').click();
    await idle(a.page);
    expect(await a.page.locator('[data-unsaved]').innerText()).toContain('Showing unsaved changes');
    expect(await heroSrc(a.page)).toBe('/media/fixtures/studio-portrait-slate.svg');
    await a.page.locator('.tk-tab[href="#/me/card"]').click();
    await idle(a.page);
    expect(await checked(a.page, 'hero')).toBe('studio-portrait-slate');
    // Save with the keyboard.
    await a.page.locator('button.tk-save:visible').focus();
    await a.page.keyboard.press('Enter');
    await idle(a.page);
    await expect.poll(() => status(a.page).getAttribute('data-state')).toBe('saved');
    await shot(a.page, 'desktop-card');

    // ---- B: phone arrangement and save ----
    await go(b.page, '#/me/card');
    expect(await checked(b.page, 'hero')).toBe('studio-portrait-warm');
    await b.page.locator('label[for="slot-hero-beauty-natural-light"]').click();
    for (const thumb of (await b.page.locator('.tk-thumb').all()).slice(0, 3)) expect((await thumb.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await b.page.locator('button.tk-save:visible').click();
    await idle(b.page);
    await expect.poll(() => status(b.page).getAttribute('data-state')).toBe('saved');
    await shot(b.page, 'phone-card');

    // ---- Reload: both reopen exactly what they saved ----
    await a.page.reload();
    await idle(a.page);
    expect([await checked(a.page, 'hero'), await checked(a.page, 'fullBody'), await checked(a.page, 'beauty')]).toEqual(['studio-portrait-slate', 'beauty-close', 'full-length-studio']);
    expect(await a.page.locator('#tagline').inputValue()).toBe('Available for editorial work');
    await b.page.reload();
    await idle(b.page);
    expect(await checked(b.page, 'hero')).toBe('beauty-natural-light');

    // ---- Preview at both widths ----
    await go(a.page, '#/me/card/preview');
    expect(await a.page.locator('.cc-card.full .cc-name').innerText()).toBe('AMARA OKAFOR'); // uppercase is CSS
    expect(await a.page.locator('.cc-card.full .cc-bio').innerText()).toContain(UNSAFE);
    expect(await a.page.locator('[data-unsaved]').count()).toBe(0);
    await shot(a.page, 'desktop-preview');
    await go(b.page, '#/me/card/preview');
    expect(await b.page.locator('.cc-card.full .cc-name').innerText()).toBe('JUN PARK');
    expect(await b.page.content()).not.toContain('Amara');
    await shot(b.page, 'phone-preview');

    // ---- Crafted requests from B's browser reach only B ----
    const origin = { origin: running.base };
    expect((await b.page.request.post(`${running.base}/me/profile`, { headers: origin, data: { displayName: 'Hijack', profession: '', biography: '', accountId: 'a' } })).status()).toBe(400);
    expect((await b.page.request.post(`${running.base}/me/comp-card?owner=a`, { headers: origin, data: { tagline: 'Hijack', slots: {} } })).status()).toBe(400);
    expect((await b.page.request.post(`${running.base}/me/comp-card`, { headers: origin, data: { tagline: '', slots: { hero: 'https://example.com/x.jpg', fullBody: 'a', profileView: 'b', lifestyle: 'c', beauty: 'd' } } })).status()).toBe(400);
    expect(((await (await b.page.request.get(`${running.base}/me/profile`)).json()) as { profile: { displayName: string } }).profile.displayName).toBe('Jun Park');
    expect(((await (await a.page.request.get(`${running.base}/me/profile`)).json()) as { profile: { displayName: string } }).profile.displayName).toBe('Amara Okafor');

    // ---- Switching owner in one browser shows the other owner's own work only ----
    await go(b.page, '#/me');
    await b.page.locator('button.tk-switch').click();
    await idle(b.page);
    await expect.poll(() => b.page.locator('.tk-owner').innerText()).toBe('Synthetic professional A');
    expect(await b.page.locator('#displayName').inputValue()).toBe('Amara Okafor');

    await a.ctx.close();
    await b.ctx.close();
  });

  it('A (desktop) and B (phone) each organize, save and reopen their own portfolio (B2)', async () => {
    const a = await context('A portfolio', DESKTOP);
    const b = await context('B portfolio', PHONE);
    await chooseOwner(a.page, 'a');
    await chooseOwner(b.page, 'b');

    // ---- A: empty to start, clearly ----
    await go(a.page, '#/me/portfolio');
    expect(await a.page.locator('.tk-tab[aria-current="page"]').innerText()).toBe('Portfolio');
    expect(await a.page.locator('.tk-subtab[aria-current="page"]').innerText()).toBe('Organize');
    expect(await status(a.page).innerText()).toBe('Not saved yet');
    expect(await a.page.locator('.pf-count').innerText()).toBe(`0 of ${PORTFOLIO_MAX_ITEMS} selected`);
    expect(await a.page.locator('[data-empty="selection"]').isVisible()).toBe(true);
    expect(await a.page.locator('.tk-aside [data-empty="portfolio"]').innerText()).toBe('No images yet');

    // ---- Select four, reorder by pointer and keyboard, remove two ----
    for (const i of [3, 0, 7, 5]) await pick(a.page, k(i)).click();
    expect(await orderKeys(a.page)).toEqual([k(3), k(0), k(7), k(5)]);
    expect(await previewKeys(a.page)).toEqual([k(3), k(0), k(7), k(5)]);
    expect(await pick(a.page, k(7)).getAttribute('aria-pressed')).toBe('true');
    expect(await pick(a.page, k(7)).innerText()).toContain('Added · 3');
    expect(await move(a.page, k(3), 'up').isDisabled()).toBe(true);
    expect(await move(a.page, k(5), 'down').isDisabled()).toBe(true);
    await move(a.page, k(3), 'down').click();
    expect(await orderKeys(a.page)).toEqual([k(0), k(3), k(7), k(5)]);
    // Focus stays on the control that moved, so the keyboard can keep going.
    expect(await focusedLabel(a.page)).toMatch(/^Move .+ later$/);
    await a.page.keyboard.press('Enter');
    expect(await orderKeys(a.page)).toEqual([k(0), k(7), k(3), k(5)]);
    await move(a.page, k(7), 'remove').click();
    expect(await orderKeys(a.page)).toEqual([k(0), k(3), k(5)]);
    await pick(a.page, k(5)).click(); // a chosen image, chosen again, comes out
    expect(await orderKeys(a.page)).toEqual([k(0), k(3)]);
    expect(await status(a.page).innerText()).toBe('Unsaved changes');

    // ---- Unsaved edits go to the preview and back ----
    await a.page.locator('.tk-subtab[href="#/me/portfolio/preview"]').click();
    await idle(a.page);
    expect(await a.page.locator('[data-unsaved]').innerText()).toContain('Showing unsaved changes');
    expect(await previewKeys(a.page)).toEqual([k(0), k(3)]);
    await a.page.locator('.tk-subtab[href="#/me/portfolio"]').click();
    await idle(a.page);
    expect(await orderKeys(a.page)).toEqual([k(0), k(3)]);

    // ---- Save, reload, the same order ----
    await a.page.locator('button.tk-save:visible').click();
    await idle(a.page);
    await expect.poll(() => status(a.page).getAttribute('data-state')).toBe('saved');
    await a.page.reload();
    await idle(a.page);
    expect(await orderKeys(a.page)).toEqual([k(0), k(3)]);
    expect(await previewKeys(a.page)).toEqual([k(0), k(3)]);
    expect(await status(a.page).getAttribute('data-state')).toBe('saved');

    // ---- Up to the maximum: then nothing more can be added ----
    const full = [k(0), k(3), ...FIXTURE_KEYS.filter((key) => key !== k(0) && key !== k(3)).slice(0, PORTFOLIO_MAX_ITEMS - 2)];
    for (const key of full.slice(2)) await pick(a.page, key).click();
    expect(await orderKeys(a.page)).toEqual(full);
    expect(await a.page.locator('.pf-count').innerText()).toBe(`${PORTFOLIO_MAX_ITEMS} of ${PORTFOLIO_MAX_ITEMS} selected`);
    expect(await a.page.locator('[data-full]').isVisible()).toBe(true);
    const left = FIXTURE_KEYS.filter((key) => !full.includes(key));
    for (const key of left) expect(await pick(a.page, key).isDisabled()).toBe(true);
    await a.page.locator('button.tk-save:visible').click();
    await idle(a.page);
    await expect.poll(() => status(a.page).getAttribute('data-state')).toBe('saved');
    await shot(a.page, 'desktop-portfolio');
    await go(a.page, '#/me/portfolio/preview');
    expect(await previewKeys(a.page)).toEqual(full);
    expect(await a.page.locator('.pf-sheet.full .pf-name').innerText()).toBe('AMARA OKAFOR');
    expect(await a.page.locator('.pf-sheet.full .pf-foot').innerText()).toMatch(/private draft/i);
    expect(await a.page.locator('[data-unsaved]').count()).toBe(0);
    await shot(a.page, 'desktop-portfolio-preview');

    // ---- B on the phone: none of A's, its own order ----
    await go(b.page, '#/me/portfolio');
    expect(await orderKeys(b.page)).toEqual([]);
    expect(await b.page.content()).not.toContain('Amara');
    await pick(b.page, k(9)).click();
    await pick(b.page, k(1)).click();
    await move(b.page, k(1), 'up').click();
    expect(await orderKeys(b.page)).toEqual([k(1), k(9)]);
    for (const control of [...(await b.page.locator('.pf-move').all()), ...(await b.page.locator('.pf-pick').all()).slice(0, 3), ...(await b.page.locator('.tk-subtab').all()), b.page.locator('button.tk-save:visible')]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await b.page.locator('button.tk-save:visible').click();
    await idle(b.page);
    await expect.poll(() => status(b.page).getAttribute('data-state')).toBe('saved');
    await shot(b.page, 'phone-portfolio');
    await go(b.page, '#/me/portfolio/preview');
    expect(await previewKeys(b.page)).toEqual([k(1), k(9)]);
    expect(await b.page.locator('.pf-sheet.full .pf-name').innerText()).toBe('JUN PARK');
    await shot(b.page, 'phone-portfolio-preview');

    // ---- Crafted requests from B's browser reach only B ----
    const origin = { origin: running.base };
    for (const data of [{ items: [k(0)], accountId: 'a' }, { items: FIXTURE_KEYS.slice(0, PORTFOLIO_MAX_ITEMS + 1) }, { items: [k(0), k(0)] }, { items: ['https://example.com/x.jpg'] }]) {
      expect((await b.page.request.post(`${running.base}/me/portfolio`, { headers: origin, data })).status()).toBe(400);
    }
    type Portfolio = { draft: { items: string[] } };
    expect(((await (await b.page.request.get(`${running.base}/me/portfolio`)).json()) as Portfolio).draft.items).toEqual([k(1), k(9)]);
    expect(((await (await a.page.request.get(`${running.base}/me/portfolio`)).json()) as Portfolio).draft.items).toEqual(full);

    // ---- B empties the portfolio and saves: an empty draft, said plainly ----
    await go(b.page, '#/me/portfolio');
    await move(b.page, k(1), 'remove').click();
    await move(b.page, k(9), 'remove').click();
    expect(await b.page.locator('[data-empty="selection"]').isVisible()).toBe(true);
    await b.page.locator('button.tk-save:visible').click();
    await idle(b.page);
    await expect.poll(() => status(b.page).getAttribute('data-state')).toBe('saved');
    await go(b.page, '#/me/portfolio/preview');
    expect(await b.page.locator('.tk-notice').innerText()).toContain('no images yet');
    expect(await b.page.locator('.pf-sheet.full [data-empty="portfolio"]').isVisible()).toBe(true);
    await shot(b.page, 'phone-portfolio-empty');

    await a.ctx.close();
    await b.ctx.close();
  });

  it('keeps everything across a full application restart', async () => {
    await stop(running);
    running = await start();
    const { ctx, page } = await context('A after restart', DESKTOP);
    await chooseOwner(page, 'a');
    expect(await page.locator('#displayName').inputValue()).toBe('Amara Okafor');
    expect(await page.locator('#biography').inputValue()).toBe(UNSAFE);
    await go(page, '#/me/card');
    expect(await checked(page, 'hero')).toBe('studio-portrait-slate');
    expect(await status(page).getAttribute('data-state')).toBe('saved');
    await go(page, '#/me/portfolio');
    expect((await orderKeys(page)).length).toBe(PORTFOLIO_MAX_ITEMS);
    expect((await orderKeys(page)).slice(0, 2)).toEqual([k(0), k(3)]);
    expect(await status(page).getAttribute('data-state')).toBe('saved');
    await ctx.close();
  });

  it('sign out leaves no owner; the operator screens and the toolkit stay separate', async () => {
    const { ctx, page } = await context('sign-out', PHONE);
    await chooseOwner(page, 'b');
    // Signed in, the start screen is the signed-in home, still with the way back to the toolkit.
    await go(page, '#/');
    expect(await page.locator('.tk-teaser').count()).toBe(1);
    await page.request.post(`${running.base}/demo/operator`, { headers: { origin: running.base } });
    await go(page, '#/');
    expect(await page.locator('#screen').innerText()).not.toMatch(/\b(null|undefined)\b/); // the operator's start screen, no shoots yet
    await chooseOwner(page, 'b');
    await page.locator('.tk-band button.sign-out').click();
    await idle(page);
    expect((await page.request.get(`${running.base}/me/profile`)).status()).toBe(401);
    await go(page, '#/me');
    expect(await page.locator('.tk-chooser').count()).toBe(1);
    await ctx.close();
  });

  it('raised no browser errors', () => {
    // The start screen learns what a browser is by asking for the operator's
    // shoots: 401 for no mode, 403 for a signed-in account. The browser logs
    // those responses. Anything else is an error.
    expect(pageErrors.filter((e) => !/Failed to load resource: the server responded with a status of 40[13]/.test(e))).toEqual([]);
  });
});
