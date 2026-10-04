import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRINCIPAL_HEADER, startTestApp, type TestApp } from '../support/app.ts';

describe('health, request ids, error boundary and logging', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('answers health with a declared body and a request id header', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes with the uniform error shape', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', requestId: res.headers['x-request-id'] } });
  });

  it('logs request id, method, path and status, and no headers', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/stage0/synthetic-resources/00000000-0000-4000-8000-000000000000',
      headers: { [PRINCIPAL_HEADER]: 'principal-should-not-be-logged', authorization: 'Bearer should-not-be-logged' },
    });
    const requestId = res.headers['x-request-id'];
    const lines = t.logs.lines.filter((line) => line['reqId'] === requestId);

    expect(lines.some((l) => JSON.stringify(l['req']) === JSON.stringify({ method: 'GET', url: '/stage0/synthetic-resources/00000000-0000-4000-8000-000000000000' }))).toBe(true);
    expect(lines.some((l) => (l['res'] as { statusCode?: number } | undefined)?.statusCode === res.statusCode)).toBe(true);
    const text = t.logs.text();
    expect(text).not.toContain('principal-should-not-be-logged');
    expect(text).not.toContain('should-not-be-logged');
  });
});

describe('health reports an unreachable database without leaking credentials', () => {
  it('returns 503 and logs the failure without the password', async () => {
    const t = await startTestApp({ databaseUrl: 'postgres://ms_runtime:Leaky-Password-123@127.0.0.1:1/none' });
    try {
      const res = await t.app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('database_unavailable');
      expect(t.logs.text()).toContain('health check could not reach the database');
      expect(t.logs.text()).not.toContain('Leaky-Password-123');
    } finally {
      await t.close();
    }
  });
});
