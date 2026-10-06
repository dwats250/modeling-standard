import type { Executor } from '../infrastructure/database/client.ts';
import { projectParty } from './tables.ts';

/**
 * Project-local parties (slice S01).
 *
 * This is a data function, not an HTTP operation. It records that a party
 * exists within a project and nothing more. It does not invite anyone,
 * identify or verify anyone, record acceptance or a signature, assign a
 * role, or give any principal (including the project's creator) authority to
 * act for the party (D12). How a person becomes a party, and how a party is
 * bound to a person, is D03, still open; that binding is meant to be added
 * here without changing the project container.
 */

export interface ProjectPartyRecord {
  readonly id: string;
  readonly projectId: string;
}

export async function addProjectParty(db: Executor, projectId: string): Promise<ProjectPartyRecord> {
  const [row] = await db
    .insert(projectParty)
    .values({ projectId })
    .returning({ id: projectParty.id, projectId: projectParty.projectId });
  if (!row) throw new Error('insert returned no row');
  return row;
}
