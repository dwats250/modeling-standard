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
import { DEMO_DATABASE, demoDatabaseTarget } from '../../src/demo/demo.ts';
import type { FixtureAnnotations } from '../../src/demo/fixtures.ts';
import { resetDemoDatabase } from '../../src/demo/reset.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { enterOperatorMode } from '../support/demo-browser.ts';
import { seedThreePartyFinalRecord } from '../support/three-party-final-record.ts';
import { requireEnv, withDatabase } from '../support/urls.ts';

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
let fixtures: FixtureAnnotations;
const pageErrors: string[] = [];

beforeAll(async () => {
  const executablePath = requireEnv('CHROME_PATH');
  await mkdir(SHOTS, { recursive: true });
  const demoDir = await mkdtemp(join(tmpdir(), 'ms-demo-participants-'));
  fixtures = await resetDemoDatabase({ host: '127.0.0.1', databaseUrl: requireEnv('DATABASE_URL'), migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'), demoDir });
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
    expect(visible).toContain('Between you and Model');
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

describe('three people, one synthetic final record', () => {
  const LONG_VALUE = `[synthetic] ${'unbroken-long-value-'.repeat(12)}`;
  const FEE = { a: '[synthetic] 111 CAD for A and C', b: '[synthetic] 222 CAD for B and C' };
  type Person = Awaited<ReturnType<typeof context>>;
  let people: { a: Person; b: Person; c: Person };
  let projectId: string;

  /** Text and markup both: a payment hidden by the screen but present in the page would still be a leak. */
  const payments = async (page: Page) => {
    const html = await page.content();
    return { a: html.includes('111 CAD'), b: html.includes('222 CAD') };
  };

  // Run from inside the first test: the sign-in helpers poll, which vitest allows only in a test.
  let prepared: Promise<void> | undefined;
  const ready = () => (prepared ??= prepare());
  const prepare = async () => {
    const operator = await context('operator', { width: 1280, height: 900 });
    await enterOperatorMode(operator.page, base);
    await operator.page.goto(`${base}/#/demo`);
    await idle(operator.page);
    const [fixtureId, annotation] = Object.entries(fixtures.projects).find(([, x]) => x.title.startsWith('Fixture 2'))!;
    projectId = fixtureId;
    const byLabel = Object.fromEntries(Object.entries(annotation.parties).map(([id, label]) => [label, id]));
    const invited = await operator.page.evaluate(async (id) => {
      const response = await fetch(`/demo/shoots/${id}/invitations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      return { status: response.status, body: await response.json() as { invitations: { partyId: string; credential: string }[] } };
    }, projectId);
    expect(invited.status).toBe(201);
    const linkFor = (label: string) => `${base}/#/i/${invited.body.invitations.find((i) => i.partyId === byLabel[label])!.credential}`;
    people = { a: await context('a'), b: await context('b'), c: await context('c') };
    await acceptInvitation(people.a.page, linkFor('Party A'), 'Test person A');
    await acceptInvitation(people.b.page, linkFor('Party B'), 'Test person B');
    await acceptInvitation(people.c.page, linkFor('Party C'), 'Test person C');

    const brief = await database.db.execute<{ id: string }>(sql`select id from live_brief where project_id = ${projectId}`);
    const pairs = await database.db.execute<{ id: string; party_one_id: string; party_two_id: string }>(sql`select id, party_one_id, party_two_id from pairwise_agreement where project_id = ${projectId}`);
    const pairWith = (label: string) => pairs.rows.find((row) => [row.party_one_id, row.party_two_id].includes(byLabel[label]!))!.id;
    const [a, b, c] = [byLabel['Party A']!, byLabel['Party B']!, byLabel['Party C']!];
    // Stored past the two-party guards: see three-party-final-record.ts. No product path makes this record.
    await seedThreePartyFinalRecord(withDatabase(requireEnv('MIGRATION_DATABASE_URL'), DEMO_DATABASE), {
      projectId,
      briefId: brief.rows[0]!.id,
      clauses: [
        { layer: 'universal', content: '[synthetic] Stop whenever anyone asks.', approverPartyIds: [a, b, c] },
        { layer: 'shared', content: '[synthetic] Call time 9:00 at the studio.', value: LONG_VALUE, approverPartyIds: [a, b, c] },
        { layer: 'shared', pairwiseAgreementId: pairWith('Party A'), content: '[synthetic] Selected images may be used in a lookbook.', approverPartyIds: [a, c] },
        { layer: 'money', pairwiseAgreementId: pairWith('Party A'), itemKey: 'fee', content: '[synthetic] Fee.', value: FEE.a, approverPartyIds: [a, c] },
        { layer: 'money', pairwiseAgreementId: pairWith('Party B'), itemKey: 'fee', content: '[synthetic] Fee.', value: FEE.b, approverPartyIds: [b, c] },
      ],
    });
    await operator.ctx.close();
    pageErrors.splice(0);
  };

  afterAll(async () => {
    for (const person of Object.values(people ?? {})) await person.ctx.close();
    pageErrors.splice(0);
  });

  it.each([
    { who: 'a', sees: { a: true, b: false }, notes: ['Between you and Party C'] },
    { who: 'b', sees: { a: false, b: true }, notes: ['Between you and Party C'] },
    { who: 'c', sees: { a: true, b: true }, notes: ['Between you and Party A', 'Between you and Party B'] },
  ] as const)('$who sees the shared terms and only their own payments, labelled as shared or private', async ({ who, sees, notes }) => {
    await ready();
    const { page } = people[who];
    await page.reload();
    await idle(page);
    const screen = page.locator('#screen');
    const visible = await screen.innerText();
    expect(visible).toContain('Your final record preview');
    expect(visible).toContain('No participant performed a signing act');
    for (const shared of ['Stop whenever anyone asks.', 'Call time 9:00 at the studio.', 'Selected images may be used in a lookbook.']) expect(visible).toContain(shared);
    expect(await payments(page)).toEqual(sees);

    for (const layer of ['universal', 'shared']) expect(await screen.locator(`.doc-section[data-layer="${layer}"] > header p`).innerText()).toMatch(/^Shared/);
    const money = screen.locator('.doc-section[data-layer="money"]');
    expect(await money.locator('h2').innerText()).toBe('Your payment terms');
    expect(await money.locator('> header p').innerText()).toMatch(/^Private/);
    expect(await money.locator('.term-notes').allInnerTexts()).toEqual(notes);

    // A person outside a pair-scoped shared term still reads it, and who it is between (D10).
    const between = await screen.locator('.doc-section[data-layer="shared"] .term-notes').allInnerTexts();
    expect(between).toEqual([who === 'b' ? 'Between Party A and Party C' : who === 'a' ? 'Between you and Party C' : 'Between you and Party A']);

    // Numbered as this person's own record: no gap gives away a clause they cannot see.
    const numbers = await screen.locator('.term .num').allInnerTexts();
    expect(numbers).toEqual(numbers.map((_, index) => String(index + 1)));
    // Read-only: no signing control, form or field; the band's sign-out is the only button.
    expect(await screen.locator('button:not(.sign-out), form, input, select, textarea').count()).toBe(0);
    expect(visible).not.toMatch(/\bsign (this|here|now)\b|history of changes|previous version/i);

    // At 320 the shared top bar itself runs wide on every screen; this record's own content must still fit.
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate<number>("[...document.querySelectorAll('.participant-final-record *')].filter((node) => node.getBoundingClientRect().right > window.innerWidth).length")).toBe(0);
    for (const width of [360, 390, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      await shot(page, `final-record-${who}-${width}`);
      // The cards are separated, not stacked edge to edge.
      const gap = await page.evaluate<number>("document.querySelector('.participant-final-record .doc').getBoundingClientRect().top - document.querySelector('.participant-final-record .card').getBoundingClientRect().bottom");
      expect(gap).toBeGreaterThanOrEqual(16);
    }
    await page.setViewportSize(PHONE);
    expect(pageErrors.splice(0).every((e) => e === `${who}: Failed to load resource: the server responded with a status of 404 (Not Found)`)).toBe(true);
  });

  it('says so when a person has no payment terms, or the record has no terms at all', async () => {
    await ready();
    const { page } = people.b;
    const serve = (keep: (clause: { layer: string }) => boolean) =>
      page.route('**/shoots/*/final-record', async (route) => {
        const response = await route.fetch();
        const body = await response.json() as { record: { clauses: { layer: string }[] } };
        body.record.clauses = body.record.clauses.filter(keep);
        await route.fulfill({ response, json: body });
      });
    await serve((clause) => clause.layer !== 'money');
    await page.reload();
    await idle(page);
    expect(await page.locator('.doc-section[data-layer="money"] .final-record-empty').innerText()).toBe('No payment terms of yours are in this record.');
    expect(await payments(page)).toEqual({ a: false, b: false });
    await shot(page, 'final-record-no-payment');

    await page.unroute('**/shoots/*/final-record');
    await serve(() => false);
    await page.reload();
    await idle(page);
    expect(await page.locator('.doc-section[data-layer="shared"] .final-record-empty').innerText()).toBe('No shared terms are in this record.');
    expect(await page.locator('.doc-section[data-layer="money"] .final-record-empty').count()).toBe(1);
    expect(await page.locator('.term').count()).toBe(0);
    await page.unroute('**/shoots/*/final-record');
    pageErrors.splice(0);
  });

  it('a lost session and a server failure show their own states, and no terms', async () => {
    await ready();
    const { page } = people.b;
    await page.route('**/shoots/*/final-record', (route) => route.fulfill({ status: 401, json: { error: { code: 'unauthenticated' } } }));
    await page.reload();
    await idle(page);
    expect(await page.locator('#screen h1').innerText()).toBe('You’re not signed in');
    expect(await page.locator('.participant-final-record').count()).toBe(0);
    await page.unroute('**/shoots/*/final-record');

    await page.route('**/shoots/*/final-record', (route) => route.fulfill({ status: 500, json: { error: { code: 'internal' } } }));
    await page.reload();
    await idle(page);
    expect(await page.locator('#screen .state.error').innerText()).toContain('Could not load this screen.');
    expect(await page.locator('.participant-final-record').count()).toBe(0);
    await page.unroute('**/shoots/*/final-record');
    pageErrors.splice(0);
  });
});
