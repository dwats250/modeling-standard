import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The demo regression: a real browser against the real demo server and the
// demo database. Run with `npm run test:demo`; it needs CHROME_PATH (a
// Chrome or Chromium executable) and the same database configuration as
// `npm test`. It resets modeling_standard_demo.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['tests/demo-browser/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    allowOnly: false,
  },
});
