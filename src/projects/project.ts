import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Policy, SyntheticPrincipal } from '../authorization/access.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { defineOperation } from '../http/operations.ts';
import { project } from './tables.ts';

/**
 * Projects (slice S01). A project is the common container for a
 * collaboration (D01). The principal that creates one is recorded as an
 * audit and authorization fact only: creating a project does not make that
 * principal a party, a photographer, a payer, a concept author, an obligation
 * holder, or anyone's proxy (D01, D12).
 *
 * Creator authorization lives entirely in this file, so a later change to
 * what "creator" means has one place to land.
 */

type ProjectRow = typeof project.$inferSelect;

// ---- Data access (owned by this module; nothing else writes the table) ----

export async function insertProject(db: Executor, values: { createdByPrincipalId: string }): Promise<ProjectRow> {
  // Columns are mapped explicitly. Request input is never spread into a row.
  const [row] = await db.insert(project).values({ createdByPrincipalId: values.createdByPrincipalId }).returning();
  if (!row) throw new Error('insert returned no row');
  return row;
}

export async function findProject(db: Executor, id: string): Promise<ProjectRow | undefined> {
  const [row] = await db.select().from(project).where(eq(project.id, id)).limit(1);
  return row;
}

// ---- Response shape (the only representation that leaves the server) ----

// The creator and creation time are internal audit and authorization facts
// and are withheld. Parties are not included: who may see a project's roster
// is D10, still open.
const projectDto = z.strictObject({
  id: z.uuid(),
});

function toDto(row: ProjectRow): z.output<typeof projectDto> {
  return { id: row.id };
}

// ---- Policies (next to the behaviour they govern) ----

/** Any present principal may create a project; it is recorded as the creator. */
const anyPrincipalMayCreate: Policy<object> = () => true;

/**
 * Only the creator may read a project through this slice. This is the
 * minimum access needed to exercise S01, not a visibility rule for parties.
 */
const creatorOnly: Policy<ProjectRow> = (principal: SyntheticPrincipal, target) =>
  target.createdByPrincipalId === principal.id;

// ---- Operations ----

export const createProjectOperation = defineOperation({
  name: 'project.create',
  method: 'POST',
  path: '/projects',
  successStatus: 201,
  input: {
    // No fields: what a project describes is not part of S01.
    body: z.strictObject({}),
  },
  output: projectDto,
  access: {
    kind: 'protected',
    // The object acted on is the proposed project itself.
    load: async (input) => input.body,
    policy: anyPrincipalMayCreate,
  },
  run: async (_input, { db, principal }) => {
    // Protected operations always run with a principal; the boundary enforces it.
    const creator = principal as SyntheticPrincipal;
    const row = await insertProject(db, { createdByPrincipalId: creator.id });
    return toDto(row);
  },
});

export const readProjectOperation = defineOperation({
  name: 'project.read',
  method: 'GET',
  path: '/projects/:id',
  input: {
    params: z.strictObject({ id: z.uuid() }),
  },
  output: projectDto,
  access: {
    kind: 'protected',
    load: (input, db) => findProject(db, input.params.id),
    policy: creatorOnly,
  },
  run: async (_input, { target }) => toDto(target),
});
