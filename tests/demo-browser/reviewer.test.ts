import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { request as httpRequest, type Server } from 'node:http';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { ANNOTATIONS_FILE, AnnotationStore } from '../../src/demo/annotations.ts';
import { createDemoApplication, type DemoApplication } from '../../src/demo/application.ts';
import { syntheticAdminTarget, syntheticDatabaseTarget } from '../../src/demo/demo.ts';
import { resetSyntheticDatabase } from '../../src/demo/reset.ts';
import { REVIEWER_COOKIE, createReviewerGate, type ReviewerGate } from '../../src/demo/reviewer.ts';
import { createDemoServer } from '../../src/demo/server.ts';
import { connectionConfig, openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { requireEnv } from '../support/urls.ts';

/**
 * Reviewer mode in a real browser, as a reviewer's device would reach it:
 * over HTTPS at a public name, through a local TLS reverse proxy that stands
 * in for Tailscale Serve (it terminates TLS with a certificate made for this
 * run only, keeps the Host header, and adds forwarding and Tailscale identity
 * headers, which the demo must ignore), to the demo server on loopback.
 *
 * Two reviewers at phone width (390) each sign in at the gate with the one
 * access key, then choose different synthetic professionals and see only
 * their own data; a third browser with every identity header but no key is
 * kept out. Screenshots go to test-results/demo/reviewer-*.
 *
 * No tailnet, no real certificate authority, no public name: the name is
 * reserved (`.invalid`) and mapped to loopback inside Chrome only.
 */

const SHOTS = resolve('test-results/demo');
const PHONE = { width: 390, height: 844 };
const PUBLIC_NAME = 'reviewer.example.invalid';
const ACCESS_KEY = newToken().token;
const WIRE_COOKIE = `__Host-${REVIEWER_COOKIE}`;
// A test-only name: this suite never touches the demo's or staging's own database.
const DATABASE = 'modeling_standard_reviewer_browser_test';

let database: DatabaseHandle;
let demo: DemoApplication;
let gate: ReviewerGate;
let server: Server;
let proxy: HttpsServer;
let base: string;
let browser: Browser;
let migrationUrl: string;
const pageErrors: string[] = [];
const proxiedHosts: string[] = [];

beforeAll(async () => {
  const executablePath = requireEnv('CHROME_PATH');
  await mkdir(SHOTS, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'ms-reviewer-browser-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(work, 'key.pem'), '-out', join(work, 'cert.pem'), '-days', '1', '-subj', `/CN=${PUBLIC_NAME}`, '-addext', `subjectAltName=DNS:${PUBLIC_NAME}`], { stdio: 'ignore' });

  migrationUrl = requireEnv('MIGRATION_DATABASE_URL');
  await resetSyntheticDatabase({ database: DATABASE, databaseUrl: requireEnv('DATABASE_URL'), migrationDatabaseUrl: migrationUrl, annotationsDir: work });
  const logger = createLogger('warn');
  database = openDatabase(syntheticDatabaseTarget(requireEnv('DATABASE_URL'), DATABASE), logger);

  // The proxy's port is the public port, so it is known before the app is built.
  proxy = createHttpsServer({ key: await readFile(join(work, 'key.pem')), cert: await readFile(join(work, 'cert.pem')) });
  await new Promise<void>((done) => proxy.listen(0, '127.0.0.1', done));
  const publicPort = (proxy.address() as AddressInfo).port;
  base = `https://${PUBLIC_NAME}:${publicPort}`;

  const store = new AnnotationStore(join(work, ANNOTATIONS_FILE));
  demo = await createDemoApplication({ db: database.db, logger, annotations: store, reviewer: { publicOrigin: base } });
  gate = createReviewerGate({ publicOrigin: base, accessKey: ACCESS_KEY, sessionSeconds: 600 });
  server = createDemoServer({ app: demo.app, annotations: store, publicAuthority: `${PUBLIC_NAME}:${publicPort}`, testIssuer: demo.issuer, reviewer: gate });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const upstream = (server.address() as AddressInfo).port;

  // Like Tailscale Serve: keep Host, add forwarding and identity headers.
  proxy.on('request', (req, res) => {
    proxiedHosts.push(String(req.headers.host));
    const headers = {
      ...req.headers,
      'x-forwarded-for': '100.64.0.7',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'evil.example',
      'tailscale-user-login': 'someone@example.com',
      'tailscale-user-name': 'Some One',
    };
    const out = httpRequest({ host: '127.0.0.1', port: upstream, method: req.method, path: req.url, headers, setHost: false }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    out.on('error', () => res.destroy());
    req.pipe(out);
  });

  browser = await chromium.launch({ executablePath, args: [`--host-resolver-rules=MAP ${PUBLIC_NAME} 127.0.0.1`] });
});

afterAll(async () => {
  await browser?.close();
  proxy?.closeAllConnections();
  await new Promise<void>((done) => proxy.close(() => done()));
  server?.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await demo?.app.close();
  await database?.close();
  const admin = new pg.Client(connectionConfig(syntheticAdminTarget(migrationUrl, DATABASE)));
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  await admin.end();
});

async function context(name: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: PHONE, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${name}: ${m.text()}`);
  });
  return { ctx, page };
}

async function idle(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate<boolean>("!document.body.hasAttribute('data-busy') && document.body.dataset.route === (location.hash || '#/')"), { interval: 20, timeout: 10_000 })
    .toBe(true);
}

async function shot(page: Page, name: string): Promise<void> {
  const toast = page.locator('#toast');
  if (await toast.count()) {
    await toast.evaluate((node) => {
      (node as unknown as { hidden: boolean }).hidden = true;
    });
  }
  const [scrollWidth, innerWidth] = await page.evaluate<[number, number]>('[document.documentElement.scrollWidth, window.innerWidth]');
  expect(scrollWidth, `${name}: no horizontal scroll`).toBeLessThanOrEqual(innerWidth);
  await page.screenshot({ path: join(SHOTS, `reviewer-${name}.png`), fullPage: true, animations: 'disabled' });
}

/** This context's cookies for the public origin, by name. */
async function cookies(ctx: BrowserContext): Promise<Map<string, { value: string; secure: boolean; httpOnly: boolean; sameSite: string; path: string; domain: string }>> {
  return new Map((await ctx.cookies(base)).map((c) => [c.name, c]));
}

/** Nothing this page stored or put in its address holds the access key. */
async function keyNowhere(page: Page): Promise<void> {
  const stored = await page.evaluate<string>('JSON.stringify([location.href, document.cookie, Object.entries(localStorage), Object.entries(sessionStorage), [...document.querySelectorAll("input")].map((i) => i.value)])');
  expect(stored).not.toContain(ACCESS_KEY);
}

async function signInAtGate(page: Page, key: string): Promise<void> {
  await page.locator('#reviewer-key').fill(key);
  await Promise.all([page.waitForLoadState('load'), page.locator('form.reviewer-form button[type="submit"]').click()]);
}

async function chooseOwner(page: Page, owner: 'a' | 'b'): Promise<void> {
  await page.goto(`${base}/#/me`);
  await idle(page);
  await expect.poll(() => page.locator('[data-mode="toolkit-chooser"] h1').innerText()).toBe('Your profile, comp card and portfolio');
  await page.locator(`button.tk-choose[data-owner="${owner}"]`).click();
  await idle(page);
  await expect.poll(() => page.locator('.tk-owner').innerText()).toBe(`Synthetic professional ${owner.toUpperCase()}`);
}

describe('reviewer mode in a browser, behind an HTTPS proxy', () => {
  it('keeps a device with every identity header but no key out; lets two reviewers in with the key, each as their own synthetic professional', async () => {
    // A device on the "tailnet" (the proxy adds the identity headers) without the key.
    const stranger = await context('stranger');
    await stranger.page.goto(`${base}/`);
    await stranger.page.waitForLoadState('load');
    expect(new URL(stranger.page.url()).pathname).toBe('/reviewer');
    expect(await stranger.page.locator('[data-reviewer="sign-in"] h1').innerText()).toBe('Reviewer sign-in');
    expect(await stranger.page.locator('body').innerText()).toMatch(/invented|synthetic/i);
    for (const path of ['/demo/environment', '/me/profile', '/annotations.json', '/journey.js']) {
      expect(await stranger.page.evaluate<number>(`fetch(${JSON.stringify(path)}).then((r) => r.status)`)).toBe(401);
    }
    pageErrors.splice(0); // those refused fetches are the expected console errors
    await shot(stranger.page, 'gate');
    // A wrong key is refused on the same page, with nothing set.
    await signInAtGate(stranger.page, newToken().token);
    expect(new URL(stranger.page.url()).pathname).toBe('/reviewer/sign-in');
    expect(await stranger.page.locator('.reviewer-notice').innerText()).toBe('That key was not accepted.');
    expect((await cookies(stranger.ctx)).size).toBe(0);
    await shot(stranger.page, 'gate-refused');
    await stranger.ctx.close();

    // Two reviewers, two phones, the one key.
    const one = await context('reviewer-1');
    const two = await context('reviewer-2');
    for (const [who, { ctx, page }] of [['one', one], ['two', two]] as const) {
      await page.goto(`${base}/#/me`);
      await page.waitForLoadState('load');
      expect(new URL(page.url()).pathname).toBe('/reviewer');
      await signInAtGate(page, ACCESS_KEY);
      await expect.poll(() => new URL(page.url()).pathname).toBe('/');
      await idle(page);
      await keyNowhere(page);
      const jar = await cookies(ctx);
      expect([...jar.keys()]).toEqual([WIRE_COOKIE]);
      expect(jar.get(WIRE_COOKIE)).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/', domain: PUBLIC_NAME });
      expect(jar.get(WIRE_COOKIE)!.value).not.toBe(ACCESS_KEY);
      expect(await page.locator('body').innerText()).not.toMatch(/staging/i);
      if (who === 'one') await shot(page, 'home');
    }
    expect((await cookies(one.ctx)).get(WIRE_COOKIE)!.value).not.toBe((await cookies(two.ctx)).get(WIRE_COOKIE)!.value);

    await chooseOwner(one.page, 'a');
    await chooseOwner(two.page, 'b');
    // Demo cookies are __Host- too, beside the reviewer's.
    expect([...(await cookies(one.ctx)).keys()].sort()).toEqual(['__Host-ms_session', WIRE_COOKIE].sort());
    expect((await cookies(one.ctx)).get('__Host-ms_session')).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });

    // One saves a profile; two sees none of it.
    await one.page.locator('#displayName').fill('Amara Okafor');
    await one.page.locator('#profession').fill('Model');
    await one.page.locator('button.tk-save').click();
    await expect.poll(() => one.page.locator('.tk-status:visible').first().getAttribute('data-state')).toBe('saved');
    await shot(one.page, 'a-profile');
    await two.page.reload();
    await idle(two.page);
    expect(await two.page.locator('.tk-owner').innerText()).toBe('Synthetic professional B');
    expect(await two.page.locator('#displayName').inputValue()).toBe('');
    expect(await two.page.evaluate<string>(`fetch('/me/profile').then((r) => r.text())`)).toBe('{"profile":null}');
    expect(await one.page.evaluate<string>(`fetch('/me/profile').then((r) => r.text())`)).toContain('Amara Okafor');

    // Reviewer two signs out of reviewer access: the demo is gone for that phone, whatever demo cookies remain.
    await two.page.goto(`${base}/reviewer`);
    await two.page.waitForLoadState('load');
    expect(await two.page.locator('[data-reviewer="signed-in"] h1').innerText()).toBe('Signed in as a reviewer');
    await shot(two.page, 'signed-in');
    await Promise.all([two.page.waitForLoadState('load'), two.page.locator('form[action="/reviewer/sign-out"] button').click()]);
    expect(new URL(two.page.url()).pathname).toBe('/reviewer');
    expect(await two.page.locator('[data-reviewer="sign-in"]').count()).toBe(1);
    expect((await cookies(two.ctx)).has(WIRE_COOKIE)).toBe(false);
    expect(await two.page.evaluate<number>(`fetch('/me/profile').then((r) => r.status)`)).toBe(401);
    pageErrors.splice(0);
    await two.page.goto(`${base}/#/me`);
    await two.page.waitForLoadState('load');
    expect(new URL(two.page.url()).pathname).toBe('/reviewer');

    // Revoking everything (what a restart does) ends reviewer one too, mid-session.
    gate.revokeAll();
    expect(await one.page.evaluate<number>(`fetch('/me/profile').then((r) => r.status)`)).toBe(401);
    pageErrors.splice(0);
    await one.page.reload();
    await one.page.waitForLoadState('load');
    expect(new URL(one.page.url()).pathname).toBe('/reviewer');

    // Every request reached the demo through the public name, and the proxy's identity headers signed nobody in.
    expect(new Set(proxiedHosts)).toEqual(new Set([`${PUBLIC_NAME}:${new URL(base).port}`]));
    for (const c of [one, two]) await c.ctx.close();
  });

  it('logged no browser errors', () => {
    expect(pageErrors).toEqual([]);
  });
});
