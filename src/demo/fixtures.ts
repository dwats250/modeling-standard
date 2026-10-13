import type { FastifyInstance } from 'fastify';
import type { Database } from '../infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../projects/agreement.ts';
import { affirmAgreementTerm, affirmUniversalTerm } from '../projects/affirmations.ts';
import { addProjectParty } from '../projects/party.ts';
import { addAgreementTerm, addUniversalTerm } from '../projects/terms.ts';
import { presentAgreementVersion, presentUniversalVersion } from '../projects/versions.ts';

/**
 * Repeatable synthetic fixtures for the local demo.
 *
 * Projects are created through the real `project.create` operation, as the
 * demo operator. Parties, agreements, terms, presented versions and
 * affirmation rows are then written with the S01 to S05 data functions
 * directly, because no product path for any of them exists: how a person
 * becomes a party and how a party acts is D03 (and D12: nobody affirms for
 * another), and who may create an agreement or author a term is open.
 *
 * Term text is synthetic sample wording, marked as such. Term text is opaque
 * to the product; nothing here is a clause catalog or a minimum term set.
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

    // Universal layer: safety and consent terms for everyone on site (D02).
    // D01 says coverage, touch and wardrobe-adjustment expectations were discussed.
    const universal = [
      await addUniversalTerm(db, projectId, '[synthetic] Coverage expectations, as discussed before the shoot.'),
      await addUniversalTerm(db, projectId, '[synthetic] Touch expectations, as discussed before the shoot.'),
      await addUniversalTerm(db, projectId, '[synthetic] Wardrobe-adjustment expectations, as discussed before the shoot.'),
    ];
    const universalV1 = await presentUniversalVersion(db, projectId, universal.map((t) => t.id));

    // Pairwise layer: private commercial and craft terms between the two (D02).
    // D01: no money; the photographer shot, edited and delivered files; a
    // possible album-cover use by the model was discussed.
    const pairwise = [
      await addAgreementTerm(db, agreement.id, '[synthetic] Edited files are delivered after the shoot.'),
      await addAgreementTerm(db, agreement.id, '[synthetic] Selected images may be used as an album cover.'),
    ];
    const agreementV1 = await presentAgreementVersion(db, agreement.id, pairwise.map((t) => t.id));

    // Each party's own per-term rows. In the product only the party itself
    // could act (D12); how is D03. Here they are fixture rows.
    for (const party of [first, second]) {
      for (const term of universalV1.terms) await affirmUniversalTerm(db, term.id, party.id);
      for (const term of agreementV1.terms) await affirmAgreementTerm(db, term.id, party.id);
    }

    projects[projectId] = {
      title: 'Fixture 1 — D01 first scenario',
      source: 'D01; D02 two layers; D04 per-term ruling; 2026-10-05 reconciliation',
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

    // Universal: one presented safety term; A and C have rows, B has none.
    // Then a term is stored but never presented.
    const safety = await addUniversalTerm(db, projectId, '[synthetic] A shared on-site safety term.');
    const universalV1 = await presentUniversalVersion(db, projectId, [safety.id]);
    for (const party of [a, c]) await affirmUniversalTerm(db, universalV1.terms[0]!.id, party.id);
    await addUniversalTerm(db, projectId, '[synthetic] A stored term that has not been presented.');

    // A–C: version 1 with three terms; A records a row for the first term;
    // then the third term is dropped and the rest resent as version 2 (D02).
    const acTerms = [
      await addAgreementTerm(db, ac.id, '[synthetic] Craft term one between A and C.'),
      await addAgreementTerm(db, ac.id, '[synthetic] Commercial term two between A and C.'),
      await addAgreementTerm(db, ac.id, '[synthetic] Term three, later dropped.'),
    ];
    const acV1 = await presentAgreementVersion(db, ac.id, acTerms.map((t) => t.id));
    await affirmAgreementTerm(db, acV1.terms[0]!.id, a.id);
    await presentAgreementVersion(db, ac.id, [acTerms[0]!.id, acTerms[1]!.id]);

    // B–C: one presented term, no rows yet.
    const bcTerm = await addAgreementTerm(db, bc.id, '[synthetic] Commercial term between B and C.');
    await presentAgreementVersion(db, bc.id, [bcTerm.id]);

    projects[projectId] = {
      title: 'Fixture 2 — three parties, two pairwise agreements',
      source: 'D02 structure and drop-and-resend rulings; D04 per-term ruling; reconciliation ruling 11',
      note:
        'Commercial and craft agreements are private and pairwise under the project. Parties A and B each have ' +
        'their own agreement with C; neither agreement relates A and B. A–C shows drop-and-resend: version 2 ' +
        'leaves term three out and version 1 is unchanged. Who may see which agreement is mostly open (D10), so ' +
        'this inspector is not a party view.',
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
