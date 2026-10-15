import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '../app/errors.ts';
import type { SyntheticPrincipal } from '../authorization/access.ts';
import type { Executor } from '../infrastructure/database/client.ts';
import { defineOperation, type AnyOperation } from '../http/operations.ts';
import { affirmAgreementTerm, affirmUniversalTerm, PresentedTermNotFoundError } from '../projects/affirmations.ts';
import { createPairwiseAgreement, findPairwiseAgreement, type PairwiseAgreementRecord } from '../projects/agreement.ts';
import { addProjectParty } from '../projects/party.ts';
import { creatorOnly, findProject, insertProject } from '../projects/project.ts';
import { agreementVersionTerm, universalVersionTerm } from '../projects/tables.ts';
import { addAgreementTerm, addUniversalTerm } from '../projects/terms.ts';
import {
  findAgreementVersion,
  findUniversalVersion,
  listAgreementVersions,
  listUniversalVersions,
  presentAgreementVersion,
  presentUniversalVersion,
  TermNotInContainerError,
} from '../projects/versions.ts';

/**
 * The demo's scenario simulator. Demo-only operations, registered only by the
 * demo server, that drive the S01 to S05 data functions so a viewer can watch
 * terms being presented, a pairwise term dropped and resent (D02), and tick
 * rows (S05 per-term affirmation evidence) appear.
 *
 * Demo-only restrictions for truthfulness (Cory, 2026-10-14/15). Production
 * S04 does not enforce either yet; this simulator does, so the demo cannot
 * demonstrate a rule the product rejects:
 *
 * - No escalation (D02): a later version may keep or leave out terms of the
 *   version before it, but may not add a term that version did not hold
 *   (`term_added_after_presentation`).
 * - No universal omission (D02, D04): a later shared version must keep every
 *   term of the version before it (`universal_term_omitted`).
 *
 * Every one of these is a SIMULATION. The product has no path for any of
 * them yet:
 *
 * - The demo operator adds and presents terms. Who may drop a declined term
 *   is open (R2); the operator stands in.
 * - The demo operator records a tick row naming a chosen party. In the
 *   product only the party itself may tick (D12), acting as the party bound
 *   to their own sign-in account (D03 decided; S06 stores the binding; no
 *   sign-in is built). These rows are fixture evidence, not anyone's act, and
 *   not a signature: signing comes only after every term is green for
 *   everyone, and is not built.
 * - A presented version must hold at least one term: the database requires
 *   a positive term count (S04), a current storage restriction rather than a
 *   product rule, and the simulator checks it up front. Not presenting a term
 *   twice is this simulator's own input rule.
 *
 * Everything else is enforced by the database exactly as in S03 to S05:
 * frozen versions, gapless numbering, rows only on a sole version 1 (a
 * temporary S05 guard), one row per party per presented term. Errors from those rules are reported
 * as 409s with a stable code.
 *
 * Authorization: every operation loads the project it acts on (directly or
 * through the agreement) and applies the S01 creator-only policy, so the
 * operator can only touch its own projects.
 */

const termContent = z
  .string()
  .max(2000)
  .refine((value) => /\S/u.test(value), { error: 'must contain a non-space character' });

const termIds = z
  .array(z.uuid())
  .min(1)
  .max(200)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, { error: 'must not repeat a term' });

const presentedTermAndParty = z.strictObject({ presentedTermId: z.uuid(), partyId: z.uuid() });

const idOutput = z.strictObject({ id: z.uuid() });

type ProjectRow = NonNullable<Awaited<ReturnType<typeof findProject>>>;

interface AgreementTarget {
  readonly agreement: PairwiseAgreementRecord;
  readonly project: ProjectRow;
}

async function loadAgreement(db: Executor, id: string): Promise<AgreementTarget | undefined> {
  const agreement = await findPairwiseAgreement(db, id);
  if (!agreement) return undefined;
  const project = await findProject(db, agreement.projectId);
  return project ? { agreement, project } : undefined;
}

const agreementCreatorOnly = (principal: SyntheticPrincipal, target: AgreementTarget): boolean =>
  creatorOnly(principal, target.project);

/** Maps the database's own rule violations to stable 409 codes. */
function asConflict(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof TermNotInContainerError) throw new AppError(409, 'term_not_in_container');
  if (error instanceof PresentedTermNotFoundError) throw new AppError(409, 'presented_term_not_found');
  const e = error as { code?: unknown; constraint?: unknown; cause?: { code?: unknown; constraint?: unknown } };
  const code = typeof e.code === 'string' ? e.code : e.cause?.code;
  const rawConstraint = typeof e.constraint === 'string' ? e.constraint : e.cause?.constraint;
  const constraint = typeof rawConstraint === 'string' ? rawConstraint : '';
  if (constraint.endsWith('_single_version_only')) throw new AppError(409, 'version_not_affirmable');
  if (constraint.endsWith('_after_presentation')) throw new AppError(409, 'affirmed_too_soon');
  if (code === '23505' && constraint.includes('affirmation')) throw new AppError(409, 'already_affirmed');
  if (code === '23505') throw new AppError(409, 'duplicate');
  if (code === '23514' && constraint.includes('party')) throw new AppError(409, 'party_not_in_agreement');
  if (code === '23503') throw new AppError(409, 'not_in_container');
  if (code === '23514') throw new AppError(409, 'rejected_by_database');
  throw error;
}

/**
 * The source-term ids of a container's latest presented version, or null if
 * none has been presented. Demo-only: used to refuse resends Cory has ruled
 * out. Not a lock: the demo operator is a single synthetic actor.
 */
async function latestPresentedSources(
  versions: readonly { id: string; sequence: number }[],
  find: (id: string) => Promise<{ readonly terms: readonly { readonly sourceTermId: string }[] } | undefined>,
): Promise<Set<string> | null> {
  const latest = versions.at(-1);
  if (!latest) return null;
  const version = await find(latest.id);
  return new Set((version?.terms ?? []).map((t) => t.sourceTermId.toLowerCase()));
}

/** Refuses a later version that adds a term, or (shared layer) omits one. */
function refuseRuledOutResend(previous: Set<string> | null, chosen: readonly string[], layer: 'universal' | 'pairwise'): void {
  if (previous === null) return;
  const next = new Set(chosen.map((id) => id.toLowerCase()));
  for (const id of next) if (!previous.has(id)) throw new AppError(409, 'term_added_after_presentation');
  if (layer === 'universal') {
    for (const id of previous) if (!next.has(id)) throw new AppError(409, 'universal_term_omitted');
  }
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return asConflict(error);
  }
}

// ---- Start a scenario ----

export const startScenarioOperation = defineOperation({
  name: 'demo.sim.scenario.start',
  method: 'POST',
  path: '/demo/sim/scenarios',
  successStatus: 201,
  input: { body: z.strictObject({}) },
  output: idOutput,
  access: { kind: 'protected', load: async () => ({}), policy: () => true },
  run: async (_input, { db, principal }) => {
    // A fresh project with two parties and one pairwise agreement between
    // them: the D01 shape, as fixture construction.
    const self = principal as SyntheticPrincipal;
    const project = await insertProject(db, { createdByPrincipalId: self.id });
    const one = await addProjectParty(db, project.id);
    const two = await addProjectParty(db, project.id);
    await createPairwiseAgreement(db, project.id, [one.id, two.id]);
    return { id: project.id };
  },
});

// ---- Universal layer ----

const projectParams = z.strictObject({ id: z.uuid() });
const projectAccess = {
  kind: 'protected' as const,
  load: (input: { params: { id: string } }, db: Executor) => findProject(db, input.params.id),
  policy: creatorOnly,
};

export const addUniversalTermOperation = defineOperation({
  name: 'demo.sim.universal.term.add',
  method: 'POST',
  path: '/demo/sim/projects/:id/terms',
  successStatus: 201,
  input: { params: projectParams, body: z.strictObject({ content: termContent }) },
  output: idOutput,
  access: projectAccess,
  run: async (input, { db, target }) =>
    guarded(async () => ({ id: (await addUniversalTerm(db, target.id, input.body.content)).id })),
});

export const presentUniversalVersionOperation = defineOperation({
  name: 'demo.sim.universal.version.present',
  method: 'POST',
  path: '/demo/sim/projects/:id/versions',
  successStatus: 201,
  input: { params: projectParams, body: z.strictObject({ termIds }) },
  output: idOutput,
  access: projectAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      const previous = await latestPresentedSources(await listUniversalVersions(db, target.id), (id) =>
        findUniversalVersion(db, id),
      );
      refuseRuledOutResend(previous, input.body.termIds, 'universal');
      return { id: (await presentUniversalVersion(db, target.id, input.body.termIds)).id };
    }),
});

export const affirmUniversalTermOperation = defineOperation({
  name: 'demo.sim.universal.affirm',
  method: 'POST',
  path: '/demo/sim/projects/:id/affirmations',
  successStatus: 201,
  input: { params: projectParams, body: presentedTermAndParty },
  output: idOutput,
  access: projectAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      // The presented term must belong to this project, not merely exist.
      const [term] = await db
        .select({ id: universalVersionTerm.id })
        .from(universalVersionTerm)
        .where(and(eq(universalVersionTerm.id, input.body.presentedTermId), eq(universalVersionTerm.projectId, target.id)))
        .limit(1);
      if (!term) throw new AppError(409, 'presented_term_not_found');
      return { id: (await affirmUniversalTerm(db, term.id, input.body.partyId)).id };
    }),
});

// ---- Pairwise layer ----

const agreementAccess = {
  kind: 'protected' as const,
  load: (input: { params: { id: string } }, db: Executor) => loadAgreement(db, input.params.id),
  policy: agreementCreatorOnly,
};

export const addAgreementTermOperation = defineOperation({
  name: 'demo.sim.agreement.term.add',
  method: 'POST',
  path: '/demo/sim/agreements/:id/terms',
  successStatus: 201,
  input: { params: projectParams, body: z.strictObject({ content: termContent }) },
  output: idOutput,
  access: agreementAccess,
  run: async (input, { db, target }) =>
    guarded(async () => ({ id: (await addAgreementTerm(db, target.agreement.id, input.body.content)).id })),
});

export const presentAgreementVersionOperation = defineOperation({
  name: 'demo.sim.agreement.version.present',
  method: 'POST',
  path: '/demo/sim/agreements/:id/versions',
  successStatus: 201,
  input: { params: projectParams, body: z.strictObject({ termIds }) },
  output: idOutput,
  access: agreementAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      const previous = await latestPresentedSources(await listAgreementVersions(db, target.agreement.id), (id) =>
        findAgreementVersion(db, id),
      );
      refuseRuledOutResend(previous, input.body.termIds, 'pairwise');
      return { id: (await presentAgreementVersion(db, target.agreement.id, input.body.termIds)).id };
    }),
});

export const affirmAgreementTermOperation = defineOperation({
  name: 'demo.sim.agreement.affirm',
  method: 'POST',
  path: '/demo/sim/agreements/:id/affirmations',
  successStatus: 201,
  input: { params: projectParams, body: presentedTermAndParty },
  output: idOutput,
  access: agreementAccess,
  run: async (input, { db, target }) =>
    guarded(async () => {
      const [term] = await db
        .select({ id: agreementVersionTerm.id })
        .from(agreementVersionTerm)
        .where(
          and(
            eq(agreementVersionTerm.id, input.body.presentedTermId),
            eq(agreementVersionTerm.pairwiseAgreementId, target.agreement.id),
          ),
        )
        .limit(1);
      if (!term) throw new AppError(409, 'presented_term_not_found');
      return { id: (await affirmAgreementTerm(db, term.id, input.body.partyId)).id };
    }),
});

export const simulatorOperations: readonly AnyOperation[] = [
  startScenarioOperation,
  addUniversalTermOperation,
  presentUniversalVersionOperation,
  affirmUniversalTermOperation,
  addAgreementTermOperation,
  presentAgreementVersionOperation,
  affirmAgreementTermOperation,
];
