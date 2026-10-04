import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inject } from 'vitest';

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
});
