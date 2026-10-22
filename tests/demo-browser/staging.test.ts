import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest, type Server } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../../src/demo/annotations.ts';
import { createDemoApplication, type StagingApplication } from '../../src/demo/application.ts';
import { syntheticAdminTarget, syntheticDatabaseTarget } from '../../src/demo/demo.ts';
import { resetSyntheticDatabase } from '../../src/demo/reset.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { connectionConfig, openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { createFakeGoogle, type FakeGoogle } from '../support/fake-google.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * S13 staging in a real browser, as phones would reach it: over HTTPS at a
 * public name, through a local TLS reverse proxy that stands in for
 * Tailscale Serve (it terminates TLS, keeps the Host header and adds
 * forwarding and identity headers, which staging must ignore), to the
 * staging server on loopback.
 *
 * Google's pages are intercepted in the browser and answered by a fake
 * (`tests/support/fake-google.ts`): the person "picks an account" and Google
 * redirects back with a code. The provider and the verification are the real
 * code. This is not a test of real Google.
 *
 * Two people at phone width (390) each open their own invitation link, sign
 * in with their own (fake) Google account and resolve the shoot to READY TO
 * SIGN acting only as themselves; a third browser is the operator, who
 * enters with the operator key. Screenshots go to test-results/demo/staging-*.
 *
 * A plain-HTTP site on the same host name (another port, as Options
 * Observatory is on Asher) tries to toss cookies into the phones: the
 * `__Host-` names are refused by the browser, and the bare names it can set
 * are never read by staging.
 */

const SHOTS = resolve('test-results/demo');
const PHONE = { width: 390, height: 844 };
const PUBLIC_NAME = 'staging.example.invalid';
const OPERATOR_KEY = newToken().token;
// A test-only name: this suite never touches a database named like staging's own.
const STAGING_DATABASE = 'modeling_standard_staging_browser_test';

let database: DatabaseHandle;
let staging: StagingApplication;
let server: Server;
let proxy: HttpsServer;
let tosser: Server;
let tosserBase: string;
/** What the plain-HTTP site sets next: name → value. */
const tossed = new Map<string, string>();
let base: string;
let browser: Browser;
let google: FakeGoogle;
let migrationUrl: string;
const pageErrors: string[] = [];
const proxiedHosts: string[] = [];

beforeAll(async () => {
  const executablePath = requireEnv('CHROME_PATH');
  await mkdir(SHOTS, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'ms-staging-browser-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(work, 'key.pem'), '-out', join(work, 'cert.pem'), '-days', '1', '-subj', `/CN=${PUBLIC_NAME}`, '-addext', `subjectAltName=DNS:${PUBLIC_NAME}`], { stdio: 'ignore' });

  migrationUrl = requireEnv('MIGRATION_DATABASE_URL');
  await resetSyntheticDatabase({ database: STAGING_DATABASE, databaseUrl: requireEnv('DATABASE_URL'), migrationDatabaseUrl: migrationUrl, annotationsDir: work });
  const logger = createLogger('warn');
  database = openDatabase(syntheticDatabaseTarget(requireEnv('DATABASE_URL'), STAGING_DATABASE), logger);
  google = await createFakeGoogle();

  // The proxy's port is the public port, so it is known before the app is built.
  proxy = createHttpsServer({ key: await readFile(join(work, 'key.pem')), cert: await readFile(join(work, 'cert.pem')) });
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done));
  const publicPort = (proxy.address() as AddressInfo).port;
  base = `https://${PUBLIC_NAME}:${publicPort}`;

  const store = new AnnotationStore(join(work, ANNOTATIONS_FILE));
  staging = await createDemoApplication({ db: database.db, logger, annotations: store, staging: { publicOrigin: base, operatorKey: OPERATOR_KEY, providers: [google.provider] } });
  server = createDemoServer({ app: staging.app, annotations: store, publicAuthority: `${PUBLIC_NAME}:${publicPort}` });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const upstream = (server.address() as AddressInfo).port;

  // Like Tailscale Serve: keep Host, add forwarding and identity headers.
  proxy.on('request', (req, res) => {
    proxiedHosts.push(String(req.headers.host));
    const headers = { ...req.headers, 'x-forwarded-for': '100.64.0.7', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.example', 'tailscale-user-login': 'someone@example.com' };
    const out = httpRequest({ host: '127.0.0.1', port: upstream, method: req.method, path: req.url, headers, setHost: false }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    out.on('error', () => res.destroy());
    req.pipe(out);
  });

  // The same host name over plain HTTP: it sets every cookie it is told to,
  // by header and by script, prefixed or not.
  tosser = createHttpServer((_req, res) => {
    const lines = [...tossed].map(([name, value]) => `${name}=${value}; Path=/; Max-Age=600`);
    const script = [...tossed].map(([name, value]) => `document.cookie = ${JSON.stringify(`${name}=${value}; path=/; max-age=600`)};`).join('\n');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': lines });
    res.end(`<!doctype html><title>other site</title><script>${script}</script><p>other site</p>`);
  });
  await new Promise<void>((done) => tosser.listen(0, '127.0.0.1', done));
  tosserBase = `http://${PUBLIC_NAME}:${(tosser.address() as AddressInfo).port}`;

  browser = await chromium.launch({ executablePath, args: [`--host-resolver-rules=MAP ${PUBLIC_NAME} 127.0.0.1`] });
});

afterAll(async () => {
  await browser?.close();
  tosser?.closeAllConnections();
  await new Promise<void>((done) => tosser.close(() => done()));
  proxy?.closeAllConnections();
  await new Promise<void>((done) => proxy.close(() => done()));
  server?.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await staging?.app.close();
  await database?.close();
  const admin = new pg.Client(connectionConfig(syntheticAdminTarget(migrationUrl, STAGING_DATABASE)));
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${STAGING_DATABASE} WITH (FORCE)`);
  await admin.end();
});

let subjectCounter = 200000000000000000000n;

async function context(name: string, viewport = PHONE): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  // Google's pages, answered by the fake: this person picks their own (fake) Google account.
  const subject = String((subjectCounter += 1n));
  await ctx.route('https://accounts.google.com/**', async (route) => {
    const { code, state, redirectUri } = google.approve(route.request().url(), subject);
    await route.fulfill({ status: 302, headers: { location: `${redirectUri}?${new URLSearchParams({ code, state, scope: 'openid', authuser: '0', prompt: 'consent' }).toString()}` } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${name}: ${m.text()}`);
  });
  return { ctx, page };
}

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
  await page.screenshot({ path: join(SHOTS, `staging-${name}.png`), fullPage: true, animations: 'disabled' });
}

async function tickAll(page: Page): Promise<void> {
  const group = page.locator('.next button.group-run');
  if (await group.count()) await click(page, group);
  while (await page.locator('.term button.tick').count()) await click(page, page.locator('.term button.tick').first());
}

/** The plain-HTTP site on the same host name sets `cookies` in this context, by header and by script. */
async function toss(ctx: BrowserContext, cookies: Record<string, string>): Promise<void> {
  tossed.clear();
  for (const [name, value] of Object.entries(cookies)) tossed.set(name, value);
  const page = await ctx.newPage();
  await page.goto(`${tosserBase}/`);
  await page.close();
}

/** This context's cookies for staging, by name. */
async function stagingCookies(ctx: BrowserContext): Promise<Map<string, { value: string; secure: boolean; httpOnly: boolean; sameSite: string; path: string; domain: string }>> {
  return new Map((await ctx.cookies(base)).map((c) => [c.name, c]));
}

/** Nothing this page stored or put in its address holds the operator key. */
async function keyNowhere(page: Page): Promise<void> {
  const stored = await page.evaluate<string>('JSON.stringify([location.href, document.cookie, Object.entries(localStorage), Object.entries(sessionStorage), [...document.querySelectorAll("input")].map((i) => i.value)])');
  expect(stored).not.toContain(OPERATOR_KEY);
}

describe('synthetic staging in a browser, behind an HTTPS proxy', () => {
  it('the operator enters with the key; two people sign in with Google on their own phones and act only as themselves to READY TO SIGN', async () => {
    // The operator, with the key, on a laptop.
    const operator = await context('operator', { width: 1280, height: 900 });
    await operator.page.goto(`${base}/`);
    await idle(operator.page);
    expect(await operator.page.locator('.staging-band').innerText()).toContain('Synthetic staging');
    expect(await operator.page.locator('[data-mode="none"] button.enter-operator').innerText()).toBe('Enter operator mode');
    // A wrong key is refused and leaves no mode.
    await operator.page.locator('input.operator-key').fill(newToken().token);
    await click(operator.page, operator.page.locator('button.enter-operator'));
    expect(await operator.page.locator('[data-mode="none"]').count()).toBe(1);
    expect(await operator.page.locator('input.operator-key').inputValue()).toBe('');
    pageErrors.splice(0); // the refused POST is the expected console error
    await operator.page.locator('input.operator-key').fill(OPERATOR_KEY);
    await click(operator.page, operator.page.locator('button.enter-operator'));
    expect(await operator.page.locator('.operator-mode').count()).toBe(1);
    await keyNowhere(operator.page);
    const operatorCookie = (await stagingCookies(operator.ctx)).get('__Host-ms_demo_operator');
    expect(operatorCookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Strict', path: '/', domain: PUBLIC_NAME });
    expect([...(await stagingCookies(operator.ctx)).keys()]).toEqual(['__Host-ms_demo_operator']);
    await shot(operator.page, 'operator-home');

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
    expect(modelLink).toMatch(new RegExp(`^${base.replaceAll('.', '\\.')}/#/i/[A-Za-z0-9_-]{43}$`));

    // Two people, two phones, two Google accounts.
    const model = await context('model');
    const photographer = await context('photographer');
    for (const [who, page, link] of [['model', model.page, modelLink], ['photographer', photographer.page, photographerLink]] as const) {
      await page.goto(link);
      await idle(page);
      await expect.poll(() => page.locator('[data-mode="invitation"] h1').innerText()).toBe('You’re invited to a shoot');
      expect(await page.locator('button.start-sign-in').allInnerTexts()).toEqual(['Continue with Google']);
      await shot(page, `${who}-invitation`);
      await page.locator('button.start-sign-in').click();
      // The browser binding cookie is __Host- named (seen on Google's side of the redirect).
      await page.waitForURL(new RegExp(`/#/brief/${projectId}$`));
      await idle(page);
      expect(await page.locator('.viewing.signed-in .me').innerText()).toBe(who === 'model' ? 'Model' : 'Photographer');
      expect(await page.locator('nav.people').count()).toBe(0);
      expect(await page.locator('.sim-controls').count()).toBe(0);
      expect(await page.locator('.viewing.signed-in .simulation-note').innerText()).toMatch(/^Signed in with Google \(not verification/);
      expect(await page.locator('body').innerText()).not.toMatch(/test sign-in/i);
      // Signed in: exactly one cookie, the __Host- session; the binding cookie was cleared by the callback.
      const cookies = await stagingCookies(page.context());
      expect([...cookies.keys()]).toEqual(['__Host-ms_session']);
      expect(cookies.get('__Host-ms_session')).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/', domain: PUBLIC_NAME });
      await shot(page, `${who}-signed-in`);
    }

    // The plain-HTTP site on the same name tries to take the model's phone
    // over: prefixed cookies (refused by the browser) carrying the
    // photographer's real session, and bare ones carrying the photographer's
    // session and the operator's secret (set, but never read by staging).
    const modelSession = (await stagingCookies(model.ctx)).get('__Host-ms_session')!.value;
    const photographerSession = (await stagingCookies(photographer.ctx)).get('__Host-ms_session')!.value;
    const evil = {
      '__Host-ms_session': photographerSession,
      '__Host-ms_demo_operator': operatorCookie!.value,
      '__Host-ms_signin': newToken().token,
      ms_session: photographerSession,
      ms_demo_operator: operatorCookie!.value,
      ms_signin: newToken().token,
    };
    await toss(model.ctx, evil);
    const after = await stagingCookies(model.ctx);
    expect(after.get('__Host-ms_session')?.value).toBe(modelSession);
    expect(after.has('__Host-ms_demo_operator') || after.has('__Host-ms_signin')).toBe(false);
    // The bare ones did land, and the browser sends them to staging too.
    expect(after.get('ms_session')?.value).toBe(photographerSession);
    expect(after.get('ms_demo_operator')?.value).toBe(operatorCookie!.value);
    await model.page.reload();
    await idle(model.page);
    expect(await model.page.locator('.viewing.signed-in .me').innerText()).toBe('Model');
    expect(await model.page.evaluate<number>(`fetch('/demo/projects').then((r) => r.status)`)).toBe(403);
    pageErrors.splice(0); // that refused fetch is the expected console error

    // A phone with no session, given only the bare cookies, is nobody: not the photographer, not the operator.
    const stranger = await context('stranger');
    await toss(stranger.ctx, evil);
    expect([...(await stagingCookies(stranger.ctx)).keys()].sort()).toEqual(['ms_demo_operator', 'ms_session', 'ms_signin']);
    await stranger.page.goto(`${base}/`);
    await idle(stranger.page);
    expect(await stranger.page.locator('[data-mode="none"]').count()).toBe(1);
    expect(await stranger.page.evaluate<number[]>(`Promise.all(['/demo/projects', '/shoots/${projectId}'].map((u) => fetch(u).then((r) => r.status)))`)).toEqual([401, 401]);
    expect(pageErrors.splice(0).every((e) => e.startsWith('stranger: ') && /401/.test(e))).toBe(true);
    await stranger.ctx.close();

    // Only the Model sets the coverage level she controls.
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

    for (const page of [model.page, photographer.page]) {
      await page.reload();
      await idle(page);
      await tickAll(page);
    }
    for (const [who, page] of [['model', model.page], ['photographer', photographer.page]] as const) {
      await page.reload();
      await idle(page);
      await expect.poll(() => page.locator('.card.ready h2').count()).toBe(1);
      await shot(page, `${who}-ready`);
    }

    // Each person's ticks are their own: two parties, two Google accounts.
    const parties = await database.db.execute<{ n: number }>(sql`select count(distinct party_id)::int as n from brief_tick where project_id = ${projectId}`);
    expect(parties.rows[0]!.n).toBe(2);
    const accounts = await database.db.execute<{ n: number }>(
      sql`select count(distinct b.account_id)::int as n from party_account_binding b join account a on a.id = b.account_id where b.project_id = ${projectId} and a.login_provider = 'google'`,
    );
    expect(accounts.rows[0]!.n).toBe(2);

    // Signing out leaves the phone in no mode — not the operator.
    await model.page.goto(`${base}/#/`);
    await idle(model.page);
    await click(model.page, model.page.locator('button.sign-out'));
    expect(await model.page.locator('[data-mode="none"]').count()).toBe(1);
    expect((await stagingCookies(model.ctx)).has('__Host-ms_session')).toBe(false);
    // The start screen asks for the operator's list: refused while signed in
    // (403) and after signing out (401). Those are the expected console errors.
    const added = pageErrors.splice(0);
    expect(added.every((e) => e.startsWith('model: ') && /40[13]/.test(e))).toBe(true);
    await keyNowhere(model.page);

    // Every request reached staging through the public name.
    expect(new Set(proxiedHosts)).toEqual(new Set([`${PUBLIC_NAME}:${new URL(base).port}`]));
    // Signing out ended the session itself, not only the cookie.
    const reuse = await browser.newContext({ ignoreHTTPSErrors: true });
    await reuse.addCookies([{ name: '__Host-ms_session', value: modelSession, url: `${base}/`, secure: true, httpOnly: true, sameSite: 'Lax' }]);
    const reusePage = await reuse.newPage();
    await reusePage.goto(`${base}/health`);
    expect(await reusePage.evaluate<number>(`fetch('/shoots/${projectId}').then((r) => r.status)`)).toBe(401);
    await reuse.close();
    for (const c of [operator, model, photographer]) await c.ctx.close();
  });

  it('logged no browser errors', () => {
    expect(pageErrors).toEqual([]);
  });
});
