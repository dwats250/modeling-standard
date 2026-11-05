import { mkdir, mkdtemp } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../../src/demo/annotations.ts';
import { createDemoApplication } from '../../src/demo/application.ts';
import { demoDatabaseTarget } from '../../src/demo/demo.ts';
import { resetDemoDatabase } from '../../src/demo/reset.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { SHOWCASE_COMP_CARD, SHOWCASE_PORTFOLIO, SHOWCASE_PROFILE } from '../../src/demo/showcase.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * The explicit showcase reset (`npm run demo:reset -- --showcase`) in a real
 * browser: the same visible content after every reset, read back from the
 * database on reload; the ordinary reset stays blank; B sees none of A's; and
 * B4's stale-save refusal holds on the seeded draft. Screenshots go to
 * test-results/demo/showcase-*.
 */

const SHOTS = resolve('test-results/demo');
const SIZES = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } } as const;

let browser: Browser;
let demoDir: string;
const pageErrors: string[] = [];

interface Running {
  database: DatabaseHandle;
  app: FastifyInstance;
  server: Server;
  base: string;
}

/** Resets with the real function, then serves it. A reset refuses while a server is connected, so each run starts one. */
async function resetAndServe(showcase: boolean): Promise<Running> {
  await resetDemoDatabase({ host: '127.0.0.1', databaseUrl: requireEnv('DATABASE_URL'), migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'), demoDir, showcase });
  const logger = createLogger('warn');
  const database = openDatabase(demoDatabaseTarget(requireEnv('DATABASE_URL')), logger);
  const store = new AnnotationStore(join(demoDir, ANNOTATIONS_FILE));
  const demo = await createDemoApplication({ db: database.db, logger, annotations: store });
  const server = createDemoServer({ app: demo.app, annotations: store, testIssuer: demo.issuer });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  demo.origins.push(base);
  return { database, app: demo.app, server, base };
}

async function stop(r: Running): Promise<void> {
  r.server.closeAllConnections();
  await new Promise<void>((done) => r.server.close(() => done()));
  await r.app.close();
  await r.database.close();
}

async function open(viewport: { width: number; height: number }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  return { ctx, page };
}

async function idle(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate<boolean>("!document.body.hasAttribute('data-busy') && document.body.dataset.route === (location.hash || '#/')"), { interval: 20, timeout: 10_000 })
    .toBe(true);
}

async function go(page: Page, base: string, hash: string): Promise<void> {
  await page.goto(`${base}/${hash}`);
  await idle(page);
}

async function signInAs(page: Page, base: string, owner: 'a' | 'b'): Promise<void> {
  await go(page, base, '#/me');
  await page.locator(`button.tk-choose[data-owner="${owner}"]`).click();
  await page.locator('.tk-owner').waitFor();
  await idle(page);
}

/** Reads one thing from every node a selector matches, in the page. */
function read(page: Page, selector: string, expression: string): Promise<string[]> {
  return page.evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((node) => ${expression})`);
}

/** What a person reads on each toolkit screen. The one exception is the status line's real save time. */
async function visibleContent(page: Page, base: string): Promise<Record<string, unknown>> {
  await go(page, base, '#/me');
  const profile = {
    heading: await page.locator('h1').innerText(),
    fields: await read(page, '.tk-profile .input', 'node.value'),
    identity: await page.locator('[data-identity]').innerText(),
  };
  await go(page, base, '#/me/card/preview');
  const card = {
    text: await page.locator('.cc-card.full').innerText(),
    images: await read(page, '.cc-card.full img', 'node.getAttribute("src")'),
  };
  await go(page, base, '#/me/portfolio/preview');
  const portfolio = {
    text: await page.locator('.pf-sheet.full').innerText(),
    images: await read(page, '.pf-sheet.full img', 'node.getAttribute("src")'),
  };
  return { profile, card, portfolio };
}

/** A settled screen for the evidence: no passing toast, from the top of the page. */
async function shot(page: Page, name: string): Promise<void> {
  await page.locator('#toast').evaluate((node) => {
    (node as unknown as { hidden: boolean }).hidden = true;
  });
  await page.evaluate('window.scrollTo(0, 0)');
  await page.screenshot({ path: join(SHOTS, `showcase-${name}.png`), fullPage: true, animations: 'disabled' });
}

async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')).toBeLessThanOrEqual(0);
}

beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
  demoDir = await mkdtemp(join(tmpdir(), 'ms-demo-showcase-'));
  browser = await chromium.launch({ executablePath: requireEnv('CHROME_PATH') });
});

afterAll(async () => {
  await browser?.close();
});

describe('the showcase reset', () => {
  it('shows the same content after every reset, and reload reads what the database holds', async () => {
    let first: Record<string, unknown>;
    {
      const running = await resetAndServe(true);
      try {
        const { ctx, page } = await open(SIZES.desktop);
        await signInAs(page, running.base, 'a');
        first = await visibleContent(page, running.base);
        await ctx.close();
      } finally {
        await stop(running);
      }
    }

    const running = await resetAndServe(true);
    try {
      const { ctx, page } = await open(SIZES.desktop);
      await signInAs(page, running.base, 'a');
      expect(await visibleContent(page, running.base)).toEqual(first);

      // What was asked for is what shows.
      await go(page, running.base, '#/me');
      expect(await page.locator('h1').innerText()).toBe(SHOWCASE_PROFILE.displayName);
      await go(page, running.base, '#/me/portfolio/preview');
      expect(await read(page, '.pf-sheet.full li', 'node.dataset.key')).toEqual(SHOWCASE_PORTFOLIO.items);
      expect(await page.locator('.pf-sheet.full .pf-cap').allInnerTexts()).toEqual(SHOWCASE_PORTFOLIO.items.map((key) => SHOWCASE_PORTFOLIO.captions[key]));
      await go(page, running.base, '#/me/card/preview');
      expect(await page.locator('.cc-card.full .cc-tagline').innerText()).toBe(SHOWCASE_COMP_CARD.tagline);

      // Nothing in the page's memory: a reload asks the server, and the
      // server answers from the rows. Change a row behind the page's back and the reload shows it.
      await go(page, running.base, '#/me');
      const asked: string[] = [];
      page.on('response', (r) => {
        if (new URL(r.url()).pathname === '/me/profile' && r.request().method() === 'GET') asked.push(String(r.status()));
      });
      await page.reload();
      await idle(page);
      expect(asked).toEqual(['200']);
      expect(await page.locator('h1').innerText()).toBe(SHOWCASE_PROFILE.displayName);
      await running.database.db.execute(sql`update professional_profile set biography = 'Changed in the database by this test.'`);
      await page.reload();
      await idle(page);
      expect(await page.locator('#biography').inputValue()).toBe('Changed in the database by this test.');
      await ctx.close();
    } finally {
      await stop(running);
    }
    expect(pageErrors.splice(0)).toEqual([]);
  });

  it('labels the invented professional as invented, everywhere it appears', async () => {
    expect(SHOWCASE_PROFILE.profession).toMatch(/fictional/i);
    expect(SHOWCASE_PROFILE.biography).toMatch(/invented/i);
    expect(SHOWCASE_PROFILE.biography).toMatch(/not a real person/i);
    expect(SHOWCASE_COMP_CARD.tagline).toMatch(/fictional/i);
    // Reads as finished sample work: the provenance is stated, not repeated as a label on every line.
    expect(JSON.stringify([SHOWCASE_PROFILE, SHOWCASE_COMP_CARD, SHOWCASE_PORTFOLIO])).not.toMatch(/placeholder|testcard/i);

    const running = await resetAndServe(true);
    try {
      for (const [size, viewport] of Object.entries(SIZES)) {
        const { ctx, page } = await open(viewport);
        await signInAs(page, running.base, 'a');
        const screens = { profile: '#/me', card: '#/me/card', 'card-preview': '#/me/card/preview', portfolio: '#/me/portfolio', 'portfolio-preview': '#/me/portfolio/preview' };
        for (const [name, hash] of Object.entries(screens)) {
          await go(page, running.base, hash);
          const text = await page.locator('#screen').innerText();
          expect(text, name).toMatch(/invented/i);
          if (name.endsWith('preview')) expect(text, name).toMatch(/synthetic fixture images/i);
          // A person who is not real is never presented as a member, an endorser or a verified anything.
          expect(text, name).not.toMatch(/\b(verified|endorse[sd]?|testimonial|member since|trusted by)\b/i);
          await noOverflow(page);
          await shot(page, `${name}-${size}`);
        }
        await ctx.close();
      }
    } finally {
      await stop(running);
    }
    expect(pageErrors.splice(0)).toEqual([]);
  });

  it('keeps the seeded draft owner-only and under B4: B sees none of it, and a stale save is refused with the edits kept', async () => {
    const running = await resetAndServe(true);
    try {
      const b = await open(SIZES.mobile);
      await signInAs(b.page, running.base, 'b');
      expect(await b.page.locator('h1').innerText()).toBe('Set up your profile');
      expect(await b.page.locator('#screen').innerText()).not.toContain(SHOWCASE_PROFILE.displayName);
      expect(await b.page.evaluate<unknown>("fetch('/me/profile').then((r) => r.json())")).toEqual({ profile: null });
      await shot(b.page, 'blank-b-mobile');
      await b.ctx.close();

      const a = await open(SIZES.desktop);
      await signInAs(a.page, running.base, 'a');
      const second = await a.ctx.newPage();
      await go(a.page, running.base, '#/me/portfolio');
      await go(second, running.base, '#/me/portfolio');
      const caption = second.locator('.pf-item').first().locator('.pf-caption');
      await caption.fill('Saved from the second tab');
      await second.locator('button.tk-save:visible').click();
      await second.locator('.tk-status[data-state="saved"]:visible').first().waitFor();

      const mine = a.page.locator('.pf-item').first().locator('.pf-caption');
      await mine.fill('Edited in the first tab');
      await a.page.locator('button.tk-save:visible').click();
      await a.page.locator('[data-conflict]').waitFor();
      expect(await mine.inputValue()).toBe('Edited in the first tab');
      const saved = await a.page.evaluate<{ draft: { revision: number; captions: Record<string, string> } }>("fetch('/me/portfolio').then((r) => r.json())");
      expect(saved.draft.revision).toBe(2);
      expect(saved.draft.captions[SHOWCASE_PORTFOLIO.items[0]!]).toBe('Saved from the second tab');
      await shot(a.page, 'conflict-desktop');
      await a.ctx.close();
    } finally {
      await stop(running);
    }
  });

  it('is opt-in: the ordinary reset leaves every professional blank', async () => {
    const running = await resetAndServe(false);
    try {
      const { rows } = await running.database.db.execute<{ n: number }>(sql`select (select count(*) from professional_profile)::int + (select count(*) from comp_card_draft)::int + (select count(*) from portfolio_draft)::int as n`);
      expect(rows[0]!.n).toBe(0);
      const { ctx, page } = await open(SIZES.desktop);
      await signInAs(page, running.base, 'a');
      expect(await page.locator('h1').innerText()).toBe('Set up your profile');
      await ctx.close();
    } finally {
      await stop(running);
    }
  });
});
