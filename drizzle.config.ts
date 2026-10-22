import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from the Drizzle table definitions for review.
// `drizzle-kit push` is never used. Grants are hand-written custom migrations.
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/stage0/tables.ts', './src/projects/tables.ts', './src/accounts/tables.ts', './src/invitations/tables.ts', './src/briefs/tables.ts', './src/sessions/tables.ts', './src/identity/tables.ts', './src/contracts/tables.ts'],
  out: './migrations',
});
