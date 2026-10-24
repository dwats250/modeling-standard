import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createLogger } from '../../src/app/logger.ts';
import { createDemoApplication } from '../../src/demo/application.ts';
import { OPERATOR_COOKIE } from '../../src/demo/demo.ts';
import { FIXTURE_IMAGE_PATHS, fixtureImageForPath } from '../../src/demo/fixture-images.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { SYNTHETIC_OWNERS } from '../../src/demo/toolkit.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { DEFAULT_ARRANGEMENT, FIXTURE_MEDIA } from '../../src/toolkit/fixture-media.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';

/**
 * B1's local demo harness: two fixed synthetic professionals, chosen by an
 * origin-checked action that names only `a` or `b`; ordinary S12 sessions
 * from then on; the toolkit routes owner-only through those sessions; absent
 * from staging's composition; and the generated fixture images.
 */

const ORIGIN = 'http://127.0.0.1:3999';
let database: DatabaseHandle;
let app: FastifyInstance;

beforeAll(async () => {
  const logger = createLogger('silent');
  database = openDatabase(inject('runtimeUrl'), logger);
  const demo = await createDemoApplication({ db: database.db, logger, annotations: temporaryAnnotationStore() });
  demo.origins.push(ORIGIN);
  app = demo.app;
});
afterAll(async () => {
  await app.close();
  await database.close();
});

function sessionFrom(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const session = cookies.find((c) => c.startsWith('ms_session='));
  if (!session) throw new Error('no session cookie');
  return session.split(';')[0]!;
}

async function choose(owner: string, headers: Record<string, string> = { origin: ORIGIN }) {
  return app.inject({ method: 'POST', url: '/demo/toolkit/owner', headers, payload: { owner } });
}

describe('choosing a synthetic professional', () => {
  it('signs the browser in as a fixed account, the same one every time, and leaves operator mode', async () => {
    const first = await choose('a');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ mode: 'account', owner: 'a', label: SYNTHETIC_OWNERS.a.label });
    const cookies = [first.headers['set-cookie']].flat().join('\n');
    expect(cookies).toMatch(/ms_session=[A-Za-z0-9_-]{43}; Max-Age=43200; Path=\/; HttpOnly; SameSite=Lax/);
    expect(cookies).toContain(`${OPERATOR_COOKIE}=;`);

    const cookieA1 = sessionFrom(first.headers['set-cookie']);
    const cookieA2 = sessionFrom((await choose('a')).headers['set-cookie']);
    expect(cookieA2).not.toBe(cookieA1);
    const who = (cookie: string) => app.inject({ method: 'GET', url: '/demo/toolkit/owner', headers: { cookie } }).then((r) => r.json<unknown>());
    expect(await who(cookieA1)).toEqual({ mode: 'account', owner: 'a', label: SYNTHETIC_OWNERS.a.label });
    expect(await who(cookieA2)).toEqual({ mode: 'account', owner: 'a', label: SYNTHETIC_OWNERS.a.label });
    expect((await app.inject({ method: 'GET', url: '/demo/toolkit/owner' })).json()).toEqual({ mode: 'none', owner: null, label: null });
  });

  it('accepts only a or b, nothing else, and never an account id', async () => {
    for (const payload of [{ owner: 'c' }, { owner: '' }, {}, { owner: 'a', accountId: randomUUID() }, { accountId: randomUUID() }, { owner: randomUUID() }]) {
      const res = await app.inject({ method: 'POST', url: '/demo/toolkit/owner', headers: { origin: ORIGIN }, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('is refused from another origin or with no origin, before anything is written', async () => {
    for (const headers of [{}, { origin: 'http://evil.example' }, { origin: 'null' }]) {
      const res = await choose('a', headers);
      expect(res.statusCode).toBe(403);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('switching ends the session the browser had', async () => {
    const a = sessionFrom((await choose('a')).headers['set-cookie']);
    const b = await choose('b', { origin: ORIGIN, cookie: a });
    expect(b.json()).toMatchObject({ owner: 'b' });
    // The old cookie is no session any more: no principal at all.
    expect((await app.inject({ method: 'GET', url: '/me/profile', headers: { cookie: a } })).statusCode).toBe(401);
  });
});

describe('the toolkit through harness sessions', () => {
  const get = (url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } });
  const post = (url: string, cookie: string, payload: object) => app.inject({ method: 'POST', url, headers: { cookie, origin: ORIGIN }, payload });

  it('keeps A and B apart, whatever either sends', async () => {
    const a = sessionFrom((await choose('a')).headers['set-cookie']);
    const b = sessionFrom((await choose('b')).headers['set-cookie']);
    expect((await post('/me/profile', a, { displayName: 'Harness A', profession: 'Model', biography: '' })).statusCode).toBe(200);
    expect((await post('/me/comp-card', a, { tagline: 'A tagline', slots: DEFAULT_ARRANGEMENT })).statusCode).toBe(200);
    expect((await post('/me/profile', b, { displayName: 'Harness B', profession: 'Stylist', biography: '' })).statusCode).toBe(200);

    const bView = (await get('/me/comp-card', b)).json();
    expect(bView.profile.displayName).toBe('Harness B');
    expect(bView.draft.updatedAt).toBeNull();
    expect(JSON.stringify(bView)).not.toContain('Harness A');
    expect((await get('/me/comp-card', a)).json().draft.tagline).toBe('A tagline');
  });

  it('a cookie-bearing write needs the demo origin (cross-site writes refused)', async () => {
    const a = sessionFrom((await choose('a')).headers['set-cookie']);
    const res = await app.inject({ method: 'POST', url: '/me/profile', headers: { cookie: a, origin: 'http://evil.example' }, payload: { displayName: 'X', profession: '', biography: '' } });
    expect(res.statusCode).toBe(403);
  });

  it('the demo operator is not a professional', async () => {
    const operator = await app.inject({ method: 'POST', url: '/demo/operator', headers: { origin: ORIGIN }, payload: {} });
    const cookie = [operator.headers['set-cookie']].flat().find((c) => c?.startsWith(`${OPERATOR_COOKIE}=`))!.split(';')[0]!;
    expect((await app.inject({ method: 'GET', url: '/demo/toolkit/owner', headers: { cookie } })).json()).toEqual({ mode: 'operator', owner: null, label: null });
    expect((await get('/me/profile', cookie)).statusCode).toBe(404);
  });
});

describe('composition', () => {
  it('staging has no harness', () => {
    const staging = createDemoOperations(temporaryAnnotationStore(), { environment: { environment: 'staging', providers: ['google'], operatorKeyRequired: true } });
    expect(staging.some((op) => op.path.startsWith('/demo/toolkit'))).toBe(false);
  });
});

describe('fixture images', () => {
  it('draws every catalogue entry deterministically, marked synthetic, with nothing external', () => {
    expect(FIXTURE_IMAGE_PATHS).toHaveLength(FIXTURE_MEDIA.length);
    for (const path of FIXTURE_IMAGE_PATHS) {
      const svg = fixtureImageForPath(path)!;
      expect(svg).toBe(fixtureImageForPath(path));
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg).toContain('SYNTHETIC FIXTURE');
      expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:|href|<image|<script|on[a-z]+=/i);
    }
  });

  it('answers only catalogue keys', () => {
    for (const path of ['/media/fixtures/nope.svg', '/media/fixtures/../index.html', '/media/fixtures/STUDIO-PORTRAIT-WARM.svg', '/media/fixtures/studio-portrait-warm.png', '/media/fixtures/']) {
      expect(fixtureImageForPath(path)).toBeNull();
    }
  });
});
