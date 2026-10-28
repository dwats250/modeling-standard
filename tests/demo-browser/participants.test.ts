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
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { enterOperatorMode } from '../support/demo-browser.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * S12 in a real browser: two people, in two separate browser contexts at
 * phone width (390), each open their own invitation link, sign in through the
 * local test identity provider's page, land on the same shoot, and resolve it
 * to READY TO SIGN acting only as themselves. A third context is the demo
 * operator, who invites and enters the agreed value. Screenshots go to
 * test-results/demo/participants-*.
 */

const SHOTS = resolve('test-results/demo');
const PHONE = { width: 390, height: 844 };

let database: DatabaseHandle;
let app: FastifyInstance;
let server: Server;
let base: string;
let browser: Browser;
const pageErrors: string[] = [];

beforeAll(async () => {
  const executablePath = requireEnv('CHROME_PATH');
  await mkdir(SHOTS, { recursive: true });
  const demoDir = await mkdtemp(join(tmpdir(), 'ms-demo-participants-'));
  await resetDemoDatabase({ host: '127.0.0.1', databaseUrl: requireEnv('DATABASE_URL'), migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'), demoDir });
  const logger = createLogger('warn');
  database = openDatabase(demoDatabaseTarget(requireEnv('DATABASE_URL')), logger);
  const store = new AnnotationStore(join(demoDir, ANNOTATIONS_FILE));
  const demo = await createDemoApplication({ db: database.db, logger, annotations: store });
  app = demo.app;
  server = createDemoServer({ app, annotations: store, testIssuer: demo.issuer });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  demo.origins.push(base);
  browser = await chromium.launch({ executablePath });
});

afterAll(async () => {
  await browser?.close();
  server?.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await app?.close();
  await database?.close();
});

async function context(name: string, viewport = PHONE): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${name}: ${m.text()}`);
  });
  return { ctx, page };
}

/** The journey has caught up: nothing in flight and the screen shows the current address. */
async function idle(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate<boolean>(
          "!document.body.hasAttribute('data-busy') && (document.body.dataset.route === (location.hash || '#/') || (location.hash.startsWith('#/i/') && document.body.dataset.route === '#/i/'))",
        ),
      { interval: 20, timeout: 10_000 },
    )
    .toBe(true);
}

async function click(page: Page, target: ReturnType<Page['locator']>): Promise<void> {
  await target.click();
  await idle(page);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.locator('#toast').evaluate((node) => {
    (node as unknown as { hidden: boolean }).hidden = true;
  });
  const [scrollWidth, innerWidth] = await page.evaluate<[number, number]>('[document.documentElement.scrollWidth, window.innerWidth]');
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  await page.screenshot({ path: join(SHOTS, `participants-${name}.png`), fullPage: true, animations: 'disabled' });
}

/** Opens an invitation link, signs in as `testName` on the test provider's page, and lands on the brief. */
async function acceptInvitation(page: Page, link: string, testName: string): Promise<void> {
  await page.goto(link);
  await idle(page);
  await expect.poll(() => page.locator('[data-mode="invitation"] h1').innerText()).toBe('You’re invited to a shoot');
  await page.locator('button.start-sign-in').click();
  await page.waitForURL(/\/test-idp\/authorize\?/);
  expect(await page.locator('h1').innerText()).toBe('Test sign-in — not Google, not Apple');
  await page.locator('button[name="name"]', { hasText: testName }).click();
  await page.waitForURL(/\/#\/brief\/[0-9a-f-]{36}$/);
  await idle(page);
}

/** Ticks everything this person can tick, through the screen's own controls. */
async function tickAll(page: Page): Promise<void> {
  const group = page.locator('.next button.group-run');
  if (await group.count()) await click(page, group);
  while (await page.locator('.term button.tick').count()) await click(page, page.locator('.term button.tick').first());
}

describe('two people, two browsers, one shoot', () => {
  it('each accepts their own invitation, sees the shoot as themselves, and acts only as themselves to READY TO SIGN', async () => {
    // The operator invites, in a separate browser.
    const operator = await context('operator', { width: 1280, height: 900 });
    await enterOperatorMode(operator.page, base);
    await operator.page.goto(`${base}/#/demo`);
    await idle(operator.page);
    await click(operator.page, operator.page.locator('[data-card="unresolved"]'));
    await expect.poll(() => operator.page.evaluate<string>('location.hash')).toMatch(/^#\/shoots\/[0-9a-f-]{36}$/);
    await idle(operator.page);
    const projectId = (await operator.page.evaluate<string>('location.hash')).slice('#/shoots/'.length);
    await click(operator.page, operator.page.locator('button.create-invites'));
    const linkFor = async (label: string) => operator.page.locator('.invite-row', { hasText: label }).locator('input.invite-link').inputValue();
    const modelLink = await linkFor('Model');
    const photographerLink = await linkFor('Photographer');
    expect(modelLink).toMatch(new RegExp(`^${base}/#/i/[A-Za-z0-9_-]{43}$`));
    expect(photographerLink).not.toBe(modelLink);
    await shot(operator.page, 'operator-invite');

    // Two people, two contexts, two phones.
    const model = await context('model');
    const photographer = await context('photographer');
    await acceptInvitation(model.page, modelLink, 'Test person A');
    await acceptInvitation(photographer.page, photographerLink, 'Test person B');
    for (const [who, page] of [['model', model.page], ['photographer', photographer.page]] as const) {
      expect(await page.evaluate<string>('location.hash')).toBe(`#/brief/${projectId}`);
      // Each is signed in as themselves: no switch to anyone else, no operator control.
      expect(await page.locator('.viewing.signed-in .me').innerText()).toBe(who === 'model' ? 'Model' : 'Photographer');
      expect(await page.locator('nav.people').count()).toBe(0);
      expect(await page.locator('.sim-controls').count()).toBe(0);
      // Plain HTTP: the bare session cookie, not Secure (a __Host- one could not be set here).
      const cookies = await page.context().cookies(base);
      expect(cookies.map((c) => [c.name, c.secure, c.path])).toEqual([['ms_session', false, '/']]);
      await shot(page, `${who}-signed-in`);
    }

    // Only the Model can set the coverage level she controls.
    expect(await photographer.page.locator('button', { hasText: /^Set as/ }).count()).toBe(0);
    const coverage = model.page.locator('.term', { has: model.page.locator('button', { hasText: 'Set as Model' }) }).first();
    await coverage.locator('input').fill('Implied nude');
    await click(model.page, coverage.locator('button', { hasText: 'Set as Model' }));

    // The agreed value is the operator's to enter (who enters it is open), in the labelled simulation.
    await operator.page.goto(`${base}/#/shoots/${projectId}`);
    await idle(operator.page);
    await click(operator.page, operator.page.locator('.chooser-buttons a').first());
    while (await operator.page.locator('.sim-controls li').count()) {
      const row = operator.page.locator('.sim-controls li').first();
      await row.locator('input').fill('Within two weeks');
      await click(operator.page, row.locator('button', { hasText: 'Enter the agreed value' }));
    }

    // Each ticks, as themselves, on their own phone.
    for (const page of [model.page, photographer.page]) {
      await page.reload();
      await idle(page);
      await tickAll(page);
    }
    for (const [who, page] of [['model', model.page], ['photographer', photographer.page]] as const) {
      await page.reload();
      await idle(page);
      await expect.poll(() => page.locator('.card.ready h2').count()).toBe(1);
      expect(await page.locator('.card.ready h2').innerText()).toBe('Ready to sign');
      await shot(page, `${who}-ready`);
    }

    // Every tick in the brief belongs to the person who made it: each person's own marks only.
    const ticks = await database.db.execute<{ party_id: string }>(sql`select distinct party_id from brief_tick where project_id = ${projectId}`);
    expect(ticks.rows).toHaveLength(2);

    // A signed-in phone that opens the operator's screens gets the participant home, not the operator.
    const before = pageErrors.length;
    await model.page.goto(`${base}/#/shoots/${projectId}`);
    await idle(model.page);
    expect(await model.page.locator('[data-mode="participant"] h1').innerText()).toBe('You’re signed in as a test participant');
    // The refused operator request is the one console error this step logs.
    const added = pageErrors.splice(before);
    expect(added.every((e) => e.startsWith('model: ') && /403/.test(e))).toBe(true);

    // Signing out leaves this phone in no mode at all — not the operator.
    await click(model.page, model.page.locator('button.sign-out'));
    expect(await model.page.locator('[data-mode="none"]').count()).toBe(1);
    pageErrors.splice(before);

    // The operator's local synthetic finalization is not participant signing.
    // It enables a read-only D10-filtered final-record preview for each person.
    const finalized = await operator.page.evaluate(async (id) => {
      const response = await fetch(`/demo/projects/${id}/record`);
      const record = await response.json() as { brief: { id: string } };
      const result = await fetch(`/demo/sim/briefs/${record.brief.id}/finalize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return { status: result.status, body: await result.json() };
    }, projectId);
    expect(finalized.status).toBe(200);
    const previewResponse = await photographer.page.evaluate(async (id) => {
      const response = await fetch(`/shoots/${id}/final-record`);
      return { status: response.status, body: await response.text() };
    }, projectId);
    expect(previewResponse.status, previewResponse.body).toBe(200);
    await photographer.page.reload();
    await idle(photographer.page);
    const visible = await photographer.page.locator('#screen').innerText();
    expect(visible).toContain('Your final record preview');
    expect(visible).toContain('No participant performed a signing act');
    expect(await photographer.page.locator('.sim-controls').count()).toBe(0);
    expect(await photographer.page.locator('button:not(.sign-out)').count()).toBe(0);
    await shot(photographer.page, 'final-record-preview');
    // The live brief's generic 404 is the expected transition into the
    // separately authorized read-only final-record route.
    expect(pageErrors.splice(0)).toEqual([
      'photographer: Failed to load resource: the server responded with a status of 404 (Not Found)',
    ]);

    for (const c of [operator, model, photographer]) await c.ctx.close();
  });

  it('logged no browser errors', () => {
    expect(pageErrors).toEqual([]);
  });
});
