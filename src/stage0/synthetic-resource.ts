import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Policy, SyntheticPrincipal } from '../authorization/access.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { defineOperation } from '../http/operations.ts';
import { syntheticResource } from './tables.ts';

/**
 * Stage 0 synthetic resource: a fixture that proves the authorization
 * boundary and input/output discipline through the real application. It has
 * an owner and a label and means nothing else. Not a product concept.
 */

type SyntheticResourceRow = typeof syntheticResource.$inferSelect;

// ---- Data access (owned by this module; nothing else touches the table) ----

export async function insertSyntheticResource(
  db: Executor,
  values: { ownerPrincipalId: string; label: string },
): Promise<SyntheticResourceRow> {
  // Columns are mapped explicitly. Request input is never spread into a row.
  const [row] = await db
    .insert(syntheticResource)
    .values({ ownerPrincipalId: values.ownerPrincipalId, label: values.label })
    .returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function findSyntheticResource(db: Executor, id: string): Promise<SyntheticResourceRow | undefined> {
  const [row] = await db.select().from(syntheticResource).where(eq(syntheticResource.id, id)).limit(1);
  return row;
}

// ---- Response shape (the only representation that leaves the server) ----

const syntheticResourceDto = z.strictObject({
  id: z.uuid(),
  label: z.string(),
});

function toDto(row: SyntheticResourceRow): z.output<typeof syntheticResourceDto> {
  return { id: row.id, label: row.label };
}

// ---- Policies (next to the behaviour they govern) ----

/** Any present principal may create a resource; it becomes the owner. */
const anyPrincipalMayCreate: Policy<{ label: string }> = () => true;

/** Only the owner may read a resource. */
const ownerOnly: Policy<SyntheticResourceRow> = (principal: SyntheticPrincipal, target) =>
  target.ownerPrincipalId === principal.id;

// ---- Operations ----

export const createSyntheticResourceOperation = defineOperation({
  name: 'stage0.syntheticResource.create',
  method: 'POST',
  path: '/stage0/synthetic-resources',
  successStatus: 201,
  input: {
    body: z.strictObject({
      // PostgreSQL text cannot hold NUL; reject it here so it is a 400, not a 500.
      label: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((value) => !value.includes('\u0000'), { error: 'must not contain NUL characters' }),
    }),
  },
  output: syntheticResourceDto,
  access: {
    kind: 'protected',
    // The object acted on is the proposed resource itself.
    load: async (input) => input.body,
    policy: anyPrincipalMayCreate,
  },
  run: async (input, { db, principal }) => {
    // Protected operations always run with a principal; the boundary enforces it.
    const owner = principal as SyntheticPrincipal;
    const row = await insertSyntheticResource(db, { ownerPrincipalId: owner.id, label: input.body.label });
    return toDto(row);
  },
});

export const readSyntheticResourceOperation = defineOperation({
  name: 'stage0.syntheticResource.read',
  method: 'GET',
  path: '/stage0/synthetic-resources/:id',
  input: {
    params: z.strictObject({ id: z.uuid() }),
  },
  output: syntheticResourceDto,
  access: {
    kind: 'protected',
    load: (input, db) => findSyntheticResource(db, input.params.id),
    policy: ownerOnly,
  },
  run: async (_input, { target }) => toDto(target),
});
