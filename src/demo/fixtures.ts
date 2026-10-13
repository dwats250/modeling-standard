import type { FastifyInstance } from 'fastify';
import type { Database } from '../infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../projects/agreement.ts';
import { addProjectParty } from '../projects/party.ts';

/**
 * Repeatable synthetic fixtures for the local demo.
 *
 * Projects are created through the real `project.create` operation, as the
 * demo operator. Parties and agreements are then written with the S01 and S02
 * data functions directly, because no product path for either exists: how a
 * person becomes a party is D03, and who may create an agreement is open.
 * Writing them here is fixture construction, the same thing the test suites
 * do. It says nothing about who may do this in the product.
 *
 * The labels below are demo annotations. They are returned to the caller for
 * the inspector to display and are never written to the product database,
 * which deliberately holds no role, name or label for a party.
 */

export interface FixtureAnnotations {
  readonly projects: Record<
    string,
    {
      readonly title: string;
      readonly source: string;
      readonly note: string;
      readonly parties: Record<string, string>;
      readonly agreements: Record<string, string>;
    }
  >;
}

async function createProjectThroughOperation(app: FastifyInstance): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/projects', payload: {} });
  if (res.statusCode !== 201) throw new Error(`project.create returned ${res.statusCode}`);
  const body = res.json<{ id: string }>();
  return body.id;
}

export async function loadDemoFixtures(app: FastifyInstance, db: Database): Promise<FixtureAnnotations> {
  const projects: Record<string, FixtureAnnotations['projects'][string]> = {};

  // 1. The D01 first scenario, walked through: two adults who know each other.
  {
    const projectId = await createProjectThroughOperation(app);
    const first = await addProjectParty(db, projectId);
    const second = await addProjectParty(db, projectId);
    const agreement = await createPairwiseAgreement(db, projectId, [first.id, second.id]);
    projects[projectId] = {
      title: 'Fixture 1 — D01 first scenario',
      source: 'decisions/D01-first-scenario.md; 2026-10-05 reconciliation',
      note:
        'Two adults who already know each other. In the walk-through the model created the project and sent it ' +
        'to a photographer she knew. The labels below come from that walk-through only; the stored parties carry ' +
        'no role, and the demo operator who created this project is not either party.',
      parties: {
        [first.id]: 'Party (walk-through: the model)',
        [second.id]: 'Party (walk-through: the photographer)',
      },
      agreements: { [agreement.id]: 'Private pairwise agreement between the two parties' },
    };
  }

  // 2. Topology with three parties: each pairwise agreement relates exactly two.
  {
    const projectId = await createProjectThroughOperation(app);
    const a = await addProjectParty(db, projectId);
    const b = await addProjectParty(db, projectId);
    const c = await addProjectParty(db, projectId);
    const ac = await createPairwiseAgreement(db, projectId, [a.id, c.id]);
    const bc = await createPairwiseAgreement(db, projectId, [b.id, c.id]);
    projects[projectId] = {
      title: 'Fixture 2 — three parties, two pairwise agreements',
      source: 'D02 structure ruling; reconciliation ruling 11',
      note:
        'Commercial and craft agreements are private and pairwise under the project. Parties A and B each have ' +
        'their own agreement with C; neither agreement relates A and B. Who may see which agreement is mostly ' +
        'open (D10), so this inspector is not a party view.',
      parties: { [a.id]: 'Party A', [b.id]: 'Party B', [c.id]: 'Party C' },
      agreements: { [ac.id]: 'Agreement A–C', [bc.id]: 'Agreement B–C' },
    };
  }

  // 3. An empty project, to show the empty states.
  {
    const projectId = await createProjectThroughOperation(app);
    projects[projectId] = {
      title: 'Fixture 3 — empty project',
      source: 'S01',
      note: 'A project with no parties yet. No product path adds a party until D03 is decided.',
      parties: {},
      agreements: {},
    };
  }

  return { projects };
}
