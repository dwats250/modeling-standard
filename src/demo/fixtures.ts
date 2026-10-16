import type { FastifyInstance } from 'fastify';
import { addBriefItem, openLiveBrief } from '../briefs/brief.ts';
import type { Database } from '../infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../projects/agreement.ts';
import { addProjectParty } from '../projects/party.ts';

/**
 * Repeatable synthetic fixtures for the local demo.
 *
 * Projects are created through the real `project.create` operation, as the
 * demo operator. Parties, pair-scope records and draft brief items are then
 * written with the S01, S02 and S08 data functions directly, because no
 * product path for any of them is built: a person reaches a party by
 * invitation and sign-in (D03; S06 and S07 store the binding and the
 * invitation, sign-in is not built), and who may compose a draft is the
 * participant surface's question.
 *
 * Every text is synthetic sample wording, marked `[synthetic]`. Nothing here
 * is a clause catalogue or a minimum term set, and there is deliberately no
 * no-means-no item: its wording is Cory's to write (D04), and a placeholder
 * would read as document text. Writing items here is fixture construction,
 * the same thing the test suites do; it says nothing about who may do this in
 * the product.
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

  // 1. The D01 first scenario: two adults who know each other, no money.
  {
    const projectId = await createProjectThroughOperation(app);
    const model = await addProjectParty(db, projectId);
    const photographer = await addProjectParty(db, projectId);
    const pair = await createPairwiseAgreement(db, projectId, [model.id, photographer.id]);
    const brief = await openLiveBrief(db, projectId);

    // A universal item with a subject: a declaration by one party (Q7).
    await addBriefItem(db, brief.id, {
      layer: 'universal',
      subjectPartyId: model.id,
      shape: 'declaration',
      content: '[synthetic] A safety declaration this party makes to everyone on site.',
    });
    // A shared, project-wide item.
    await addBriefItem(db, brief.id, { layer: 'shared', content: '[synthetic] Edited files are delivered after the shoot.' });
    // A pair-scoped shared request with a subject. Shared items are seen by
    // every party (D10); the pair scope says who it is between, not who sees it.
    await addBriefItem(db, brief.id, {
      layer: 'shared',
      pairwiseAgreementId: pair.id,
      subjectPartyId: model.id,
      shape: 'request',
      content: '[synthetic] Selected images may be used as an album cover.',
    });
    // An open parameter awaiting its subject.
    await addBriefItem(db, brief.id, {
      layer: 'shared',
      subjectPartyId: model.id,
      shape: 'open_parameter',
      itemKey: 'coverage_level',
      content: '[synthetic] The coverage level this party sets.',
      pending: 'subject',
    });
    // A decide-together item: not yet supplied (A3).
    await addBriefItem(db, brief.id, {
      layer: 'shared',
      content: '[synthetic] The delivery date for edited files.',
      pending: 'decide_together',
    });

    projects[projectId] = {
      title: 'Fixture 1 — D01 first scenario',
      source: 'D01; D02 and D10 layers; Q7 subject and shape; S08 draft brief',
      note:
        'Two adults who already know each other. In the walk-through the model created the project and sent it ' +
        'to a photographer she knew; no money changed hands, so this brief has no fee. The labels below come from ' +
        'that walk-through only; the stored parties carry no role, and the demo operator who created this project ' +
        'is not either party. The draft holds one item of each draft shape the S08 topology admits, in synthetic wording.',
      parties: {
        [model.id]: 'Party (walk-through: the model)',
        [photographer.id]: 'Party (walk-through: the photographer)',
      },
      agreements: { [pair.id]: 'Pair: the model ↔ the photographer' },
    };
  }

  // 2. Three parties, two pairs: money is private to each pair.
  {
    const projectId = await createProjectThroughOperation(app);
    const a = await addProjectParty(db, projectId);
    const b = await addProjectParty(db, projectId);
    const c = await addProjectParty(db, projectId);
    const ac = await createPairwiseAgreement(db, projectId, [a.id, c.id]);
    const bc = await createPairwiseAgreement(db, projectId, [b.id, c.id]);
    const brief = await openLiveBrief(db, projectId);

    await addBriefItem(db, brief.id, { layer: 'universal', content: '[synthetic] A shared on-site safety term.' });
    await addBriefItem(db, brief.id, { layer: 'shared', content: '[synthetic] Call time and location for everyone.' });
    // A fee per pair (Q6: money is one field, the fee).
    await addBriefItem(db, brief.id, {
      layer: 'money',
      pairwiseAgreementId: ac.id,
      itemKey: 'fee',
      content: '[synthetic] Fee.',
      value: '[synthetic] 300',
    });
    await addBriefItem(db, brief.id, {
      layer: 'money',
      pairwiseAgreementId: bc.id,
      itemKey: 'fee',
      content: '[synthetic] Fee.',
      pending: 'decide_together',
    });

    projects[projectId] = {
      title: 'Fixture 2 — three parties, two pairs',
      source: 'D02 pairwise topology; D10 money privacy; Q6 one fee per pair; S08 draft brief',
      note:
        'Parties A and B each have a pair with C; there is no A–B pair. Each pair has its own fee: A–C has a value, ' +
        'B–C is to be decided together. Each fee is private to its pair (D10); the universal and shared items are ' +
        'seen by everyone. This inspector shows the whole record and is not a party view.',
      parties: { [a.id]: 'Party A', [b.id]: 'Party B', [c.id]: 'Party C' },
      agreements: { [ac.id]: 'Pair A–C', [bc.id]: 'Pair B–C' },
    };
  }

  // 3. An empty project, with an empty draft brief, to show the empty states.
  {
    const projectId = await createProjectThroughOperation(app);
    await openLiveBrief(db, projectId);
    projects[projectId] = {
      title: 'Fixture 3 — empty project',
      source: 'S01; S08',
      note: 'A project with no parties yet and an empty draft brief. D03 is decided, but no product path adds a party until invitation and sign-in are built.',
      parties: {},
      agreements: {},
    };
  }

  return { projects };
}
