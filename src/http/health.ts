import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '../app/errors.ts';
import { publicAccess } from '../authorization/access.ts';
import { defineOperation } from './operations.ts';

/** Liveness and database reachability. Public so that a deployment probe can call it. */
export const healthOperation = defineOperation({
  name: 'health',
  method: 'GET',
  path: '/health',
  access: publicAccess('Deployment and CI health probes call this without a principal; it reveals no data.'),
  output: z.strictObject({ status: z.literal('ok') }),
  run: async (_input, { db, log }) => {
    try {
      await db.execute(sql`select 1`);
    } catch (err) {
      log.error({ err }, 'health check could not reach the database');
      throw new AppError(503, 'database_unavailable');
    }
    return { status: 'ok' as const };
  },
});
