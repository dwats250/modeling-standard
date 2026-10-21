import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { createApp } from '../../src/app/create-app.ts';
import { createLogger } from '../../src/app/logger.ts';
import { demoOperatorPrincipal } from '../../src/demo/demo.ts';
import { createDemoOperations } from '../../src/demo/operations.ts';
import { GOOGLE_AUTHORIZATION_ENDPOINT } from '../../src/identity/google.ts';
import { openDatabase } from '../../src/infrastructure/database/client.ts';
import { temporaryAnnotationStore } from '../support/annotations.ts';

/**
 * The real entry point, run as a separate process: it refuses to start with
 * bad configuration, and with good configuration it boots and answers health.
 * (CI repeats the second check against the built artifact.)
 */

const entry = fileURLToPath(new URL('../../src/main.ts', import.meta.url));

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runToExit(env: Record<string, string>): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { env: { PATH: process.env.PATH ?? '', ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('boot', () => {
  it('exits non-zero, naming the setting, when required configuration is missing', async () => {
    const run = await runToExit({});
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('DATABASE_URL: is required');
  });

  it('exits non-zero without echoing secrets when configuration is malformed', async () => {
    const run = await runToExit({ DATABASE_URL: 'definitely not a url Secret-Value-42', PORT: 'Secret-Value-42' });
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('DATABASE_URL');
    expect(run.stderr).toContain('PORT');
    expect(run.stderr + run.stdout).not.toContain('Secret-Value-42');
  });

  it('exits non-zero, without echoing it, when PUBLIC_BASE_URL is plain HTTP off loopback', async () => {
    const run = await runToExit({ DATABASE_URL: 'postgres://ms_runtime:pw@127.0.0.1:1/none', PUBLIC_BASE_URL: 'http://192.168.77.5:3000' });
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('PUBLIC_BASE_URL');
    expect(run.stderr + run.stdout).not.toContain('192.168.77.5');
  });

  it('exits non-zero when the database is unreachable at boot', async () => {
    const run = await runToExit({ DATABASE_URL: 'postgres://ms_runtime:Pw-Not-Logged@127.0.0.1:1/none', LOG_LEVEL: 'fatal' });
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('database unreachable at boot');
    expect(run.stdout + run.stderr).not.toContain('Pw-Not-Logged');
  });

  it('boots with valid configuration and answers health', async () => {
    const child = spawn(process.execPath, [entry], {
      env: { PATH: process.env.PATH ?? '', DATABASE_URL: inject('runtimeUrl'), PORT: '0' },
    });
    try {
      const address = await new Promise<string>((resolve, reject) => {
        let out = '';
        const timer = setTimeout(() => reject(new Error(`did not start: ${out}`)), 10_000);
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString();
          const match = /Server listening at (http:\/\/[^"\s]+)/.exec(out);
          if (match?.[1]) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child.on('exit', (code) => reject(new Error(`exited with ${String(code)}: ${out}`)));
      });
      const res = await fetch(`${address}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    } finally {
      child.kill('SIGTERM');
    }
  });

  it('exits non-zero, without echoing either value, when the Google client is incomplete or has no public origin (S13)', async () => {
    const id = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
    const secret = 'GOCSPX-Boot-Secret-Value-42';
    for (const env of [
      { GOOGLE_CLIENT_ID: id, PUBLIC_BASE_URL: 'https://ms.example' },
      { GOOGLE_CLIENT_SECRET: secret, PUBLIC_BASE_URL: 'https://ms.example' },
      { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret },
      { GOOGLE_CLIENT_ID: 'Secret-Value-42', GOOGLE_CLIENT_SECRET: secret, PUBLIC_BASE_URL: 'https://ms.example' },
    ]) {
      const run = await runToExit({ DATABASE_URL: 'postgres://ms_runtime:pw@127.0.0.1:1/none', ...env });
      expect(run.code).toBe(1);
      expect(run.stderr).toMatch(/GOOGLE_CLIENT_|PUBLIC_BASE_URL/);
      for (const value of [secret, 'Secret-Value-42', id]) expect(run.stdout + run.stderr).not.toContain(value);
    }
  });

  it('with a complete Google client, sends a real invitation to Google with openid only, and still has no demo or test sign-in (S13)', async () => {
    // A real invitation in the database, written as the synthetic operator in-process (production has no operator).
    const logger = createLogger('silent');
    const database = openDatabase(inject('runtimeUrl'), logger);
    const operator = createApp({ db: database.db, logger, resolvePrincipal: demoOperatorPrincipal, additionalOperations: createDemoOperations(temporaryAnnotationStore()) });
    let credential: string;
    try {
      await operator.ready();
      const shoot = (await operator.inject({ method: 'POST', url: '/demo/shoots/scenarios', payload: { card: 'unresolved' } })).json<{ projectId: string }>();
      credential = (await operator.inject({ method: 'POST', url: `/demo/shoots/${shoot.projectId}/invitations`, payload: {} })).json<{ invitations: { credential: string }[] }>().invitations[0]!.credential;
    } finally {
      await operator.close();
      await database.close();
    }

    const clientId = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
    const child = spawn(process.execPath, [entry], {
      env: {
        PATH: process.env.PATH ?? '',
        DATABASE_URL: inject('runtimeUrl'),
        PORT: '0',
        PUBLIC_BASE_URL: 'https://ms.example',
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: 'GOCSPX-Boot-Secret-Value-42',
      },
    });
    let out = '';
    try {
      const address = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`did not start: ${out}`)), 10_000);
        child.stdout.on('data', (d: Buffer) => {
          out += d.toString();
          const match = /Server listening at (http:\/\/[^"\s]+)/.exec(out);
          if (match?.[1]) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
        child.on('exit', (code) => reject(new Error(`exited with ${String(code)}: ${out}`)));
      });
      const post = (path: string, body: unknown) =>
        fetch(`${address}${path}`, { method: 'POST', headers: { origin: 'https://ms.example', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const started = await post('/sign-in/start', { provider: 'google', invitation: credential });
      expect(started.status).toBe(200);
      expect(started.headers.getSetCookie().find((c) => c.startsWith('ms_signin='))).toMatch(/; Secure$/);
      const url = new URL(((await started.json()) as { authorizationUrl: string }).authorizationUrl);
      expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZATION_ENDPOINT);
      expect(url.searchParams.get('scope')).toBe('openid');
      expect(url.searchParams.get('client_id')).toBe(clientId);
      expect(url.searchParams.get('redirect_uri')).toBe('https://ms.example/sign-in/callback');
      expect(url.toString()).not.toContain('GOCSPX-Boot-Secret-Value-42');
      expect((await post('/sign-in/start', { provider: 'test', invitation: credential })).status).toBe(404);
      expect((await post('/demo/operator', {})).status).toBe(404);
      expect((await fetch(`${address}/demo/environment`)).status).toBe(404);
      expect(out).not.toContain('GOCSPX-Boot-Secret-Value-42');
    } finally {
      child.kill('SIGTERM');
    }
  });
});
