import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// The reviewer security suite: destructive, and only for the disposable server
// from tests/reviewer-security/harness.sh. Its files are `*.security.ts` so
// `npm test` never collects them; it loads no .env.
export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  test: {
    include: ['tests/reviewer-security/**/*.security.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    allowOnly: false,
  },
});
