import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Local runs read .env; CI sets the variables directly. If neither provides
// them, the global setup fails the run instead of skipping database suites.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/support/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    allowOnly: false,
  },
});
