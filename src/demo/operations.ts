import { z } from 'zod';
import type { Policy, SyntheticPrincipal } from '../authorization/access.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { listPairwiseAgreements } from '../projects/agreement.ts';
import { listAgreementAffirmations, listUniversalAffirmations, type AffirmationRecord } from '../projects/affirmations.ts';
import { listAgreementTerms, listUniversalTerms } from '../projects/terms.ts';
import {
  findAgreementVersion,
  findUniversalVersion,
  listAgreementVersions,
  listUniversalVersions,
  type PresentedTerm,
} from '../projects/versions.ts';
import { listProjectParties } from '../projects/party.ts';
import { creatorOnly, findProject, listProjectsCreatedBy } from '../projects/project.ts';
import { simulatorOperations } from './simulator.ts';

/**
 * Read-only operations for the local synthetic demo's record inspector.
 *
 * They are registered only by the demo server (`src/scripts/demo.ts`) and are
 * never in the production operation list. They go through the same boundary
 * as production operations: declared protected access, strict input and
 * output, authorization on the loaded project with the S01 creator-only
 * policy.
 *
 * The inspector shows the stored record as it is. It is not a view any party
 * would get: what each party sees is D10, still open. It writes nothing.
 */

const anyPrincipalMayListOwn: Policy<object> = () => true;

const projectSummary = z.strictObject({
  id: z.uuid(),
  partyCount: z.number().int().nonnegative(),
  agreementCount: z.number().int().nonnegative(),
});

export const listDemoProjectsOperation = defineOperation({
  name: 'demo.projects.list',
  method: 'GET',
  path: '/demo/projects',
  output: z.strictObject({ projects: z.array(projectSummary) }),
  access: {
    kind: 'protected',
    // The listing is always scoped to the requesting principal's own projects.
    load: async () => ({}),
    policy: anyPrincipalMayListOwn,
  },
  run: async (_input, { db, principal }) => {
    const self = principal as SyntheticPrincipal;
    const rows = await listProjectsCreatedBy(db, self.id);
    const projects = [];
    for (const row of rows) {
      const parties = await listProjectParties(db, row.id);
      const agreements = await listPairwiseAgreements(db, row.id);
      projects.push({ id: row.id, partyCount: parties.length, agreementCount: agreements.length });
    }
    return { projects };
  },
});

// Stored terms (S03), sealed presented versions (S04) and per-term
// affirmation rows (S05), exactly as stored. Deliberately no finality,
// requiredness, "pending" or "declined": none of those is decided, and the
// absence of an affirmation row means nothing (S05).
const storedTerm = z.strictObject({ id: z.uuid(), position: z.number().int(), content: z.string() });
const presentedVersion = z.strictObject({
  id: z.uuid(),
  sequence: z.number().int(),
  presentedAt: z.iso.datetime({ offset: true }),
  terms: z.array(z.strictObject({ id: z.uuid(), sourceTermId: z.uuid(), position: z.number().int(), content: z.string() })),
  affirmations: z.array(
    z.strictObject({ presentedTermId: z.uuid(), partyId: z.uuid(), affirmedAt: z.iso.datetime({ offset: true }) }),
  ),
});

function versionDto(
  version: { id: string; sequence: number; presentedAt: Date; terms: readonly PresentedTerm[] },
  affirmations: readonly AffirmationRecord[],
): z.output<typeof presentedVersion> {
  return {
    id: version.id,
    sequence: version.sequence,
    presentedAt: version.presentedAt.toISOString(),
    terms: version.terms.map((t) => ({ id: t.id, sourceTermId: t.sourceTermId, position: t.position, content: t.content })),
    affirmations: affirmations.map((a) => ({
      presentedTermId: a.presentedTermId,
      partyId: a.partyId,
      affirmedAt: a.affirmedAt.toISOString(),
    })),
  };
}

export const readDemoProjectRecordOperation = defineOperation({
  name: 'demo.project.record',
  method: 'GET',
  path: '/demo/projects/:id/record',
  input: { params: z.strictObject({ id: z.uuid() }) },
  output: z.strictObject({
    project: z.strictObject({ id: z.uuid() }),
    parties: z.array(z.strictObject({ id: z.uuid() })),
    universal: z.strictObject({ terms: z.array(storedTerm), versions: z.array(presentedVersion) }),
    agreements: z.array(
      z.strictObject({
        id: z.uuid(),
        partyIds: z.tuple([z.uuid(), z.uuid()]),
        terms: z.array(storedTerm),
        versions: z.array(presentedVersion),
      }),
    ),
  }),
  access: {
    kind: 'protected',
    load: (input, db) => findProject(db, input.params.id),
    policy: creatorOnly,
  },
  run: async (_input, { db, target }) => {
    const parties = await listProjectParties(db, target.id);
    const agreements = await listPairwiseAgreements(db, target.id);

    const universalVersions = [];
    for (const { id } of await listUniversalVersions(db, target.id)) {
      const version = await findUniversalVersion(db, id);
      if (version) universalVersions.push(versionDto(version, await listUniversalAffirmations(db, id)));
    }

    const agreementDtos = [];
    for (const agreement of agreements) {
      const versions = [];
      for (const { id } of await listAgreementVersions(db, agreement.id)) {
        const version = await findAgreementVersion(db, id);
        if (version) versions.push(versionDto(version, await listAgreementAffirmations(db, id)));
      }
      agreementDtos.push({
        id: agreement.id,
        partyIds: [agreement.partyIds[0], agreement.partyIds[1]] as [string, string],
        terms: (await listAgreementTerms(db, agreement.id)).map((t) => ({ id: t.id, position: t.position, content: t.content })),
        versions,
      });
    }

    return {
      project: { id: target.id },
      parties: parties.map((p) => ({ id: p.id })),
      universal: {
        terms: (await listUniversalTerms(db, target.id)).map((t) => ({ id: t.id, position: t.position, content: t.content })),
        versions: universalVersions,
      },
      agreements: agreementDtos,
    };
  },
});

export const demoOperations: readonly AnyOperation[] = [
  listDemoProjectsOperation,
  readDemoProjectRecordOperation,
  ...simulatorOperations,
];
