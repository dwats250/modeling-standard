import { z } from 'zod';
import { AppError } from '../app/errors.ts';
import { publicAccess, syntheticOnly, type Policy, type Principal } from '../authorization/access.ts';
import { findLiveBriefForProject } from '../briefs/brief.ts';
import { getBriefGreenState, isReady, listBriefPresence } from '../briefs/live.ts';
import { defineBrowserOperation, defineOperation, type AnyOperation } from '../http/operations.ts';
import { sameDigest, tokenDigest } from '../infrastructure/tokens.ts';
import { createDirectInvitation } from '../invitations/invitation.ts';
import { SESSION_COOKIE, clearSessionCookie, endSession } from '../sessions/session.ts';
import { listPairwiseAgreements } from '../projects/agreement.ts';
import { listProjectParties } from '../projects/party.ts';
import { creatorOnly, findProject, listProjectsCreatedBy } from '../projects/project.ts';
import type { AnnotationStore } from './annotations.ts';
import { OPERATOR_COOKIE } from './demo.ts';
import { participantOperations } from './participant.ts';
import { createShootOperations } from './shoots.ts';
import { createSimulatorOperations } from './simulator.ts';

/**
 * Read-only operations for the local synthetic demo's record inspector.
 *
 * They are registered only by the demo server (`src/scripts/demo.ts`) and are
 * never in the production operation list. They go through the same boundary
 * as production operations: declared protected access, strict input and
 * output, authorization on the loaded project with the S01 creator-only
 * policy.
 *
 * The inspector shows the stored record as it is: parties, the internal
 * pair-scope records, and the live brief (S08, S09) with its phase, presence
 * facts and each item's current green state, derived (approvers, who ticks
 * it now, green) — and whether the whole brief is ready to sign. It is not a
 * view any party would get: D10 is decided for photo shoots, but no party
 * view is built. It writes nothing, and shows no time or history because
 * none is stored.
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
    const self = principal as Principal;
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

// A brief item exactly as stored (S08), with its current green state
// derived (S09). No time, order of acts, author, requiredness, finality or
// signature exists to show.
const briefItemDto = z.strictObject({
  id: z.uuid(),
  layer: z.enum(['universal', 'shared', 'money']),
  pairwiseAgreementId: z.uuid().nullable(),
  subjectPartyId: z.uuid().nullable(),
  shape: z.enum(['declaration', 'request', 'open_parameter']).nullable(),
  itemKey: z.enum(['fee', 'no_means_no', 'coverage_level', 'physical_contact', 'stop_rule']).nullable(),
  content: z.string().nullable(),
  value: z.string().nullable(),
  pending: z.enum(['decide_together', 'subject']).nullable(),
  position: z.number().int().positive(),
  approverIds: z.array(z.uuid()),
  tickedBy: z.array(z.uuid()),
  green: z.boolean(),
});

export const readDemoProjectRecordOperation = defineOperation({
  name: 'demo.project.record',
  method: 'GET',
  path: '/demo/projects/:id/record',
  input: { params: z.strictObject({ id: z.uuid() }) },
  output: z.strictObject({
    project: z.strictObject({ id: z.uuid() }),
    parties: z.array(z.strictObject({ id: z.uuid() })),
    agreements: z.array(z.strictObject({ id: z.uuid(), partyIds: z.tuple([z.uuid(), z.uuid()]) })),
    brief: z
      .strictObject({
        id: z.uuid(),
        // `signing` (S10) is internal; the demo never freezes a brief.
        phase: z.enum(['draft', 'live', 'signing']),
        ready: z.boolean(),
        presence: z.array(z.strictObject({ partyId: z.uuid(), onSite: z.boolean() })),
        items: z.array(briefItemDto),
      })
      .nullable(),
  }),
  access: {
    kind: 'protected',
    load: (input, db) => findProject(db, input.params.id),
    policy: creatorOnly,
  },
  run: async (_input, { db, target }) => {
    const parties = await listProjectParties(db, target.id);
    const agreements = await listPairwiseAgreements(db, target.id);
    const found = await findLiveBriefForProject(db, target.id);
    const state = found ? await getBriefGreenState(db, found.id) : null;
    return {
      project: { id: target.id },
      parties: parties.map((p) => ({ id: p.id })),
      agreements: agreements.map((a) => ({ id: a.id, partyIds: [a.partyIds[0], a.partyIds[1]] as [string, string] })),
      brief: state
        ? {
            id: state.brief.id,
            phase: state.brief.phase,
            ready: isReady(state.brief.phase, state.items),
            presence: await listBriefPresence(db, state.brief.id),
            items: state.items.map(({ item, approverIds, tickedBy, green }) => ({
              id: item.id,
              layer: item.layer,
              pairwiseAgreementId: item.pairwiseAgreementId,
              subjectPartyId: item.subjectPartyId,
              shape: item.shape,
              itemKey: item.itemKey,
              content: item.content,
              value: item.value,
              pending: item.pending,
              position: item.position,
              approverIds: [...approverIds],
              tickedBy: [...tickedBy],
              green,
            })),
          }
        : null,
    };
  },
});

/**
 * Invite: one direct invitation per party of a shoot the operator created,
 * each credential returned once (S07). An operator convenience, labelled as
 * such: who sends invitations is not ruled. The page builds each link on its
 * own origin with the credential in the fragment (`/#/i/<credential>`), so it
 * never appears in a request line or a log. Allowed in any phase: a person
 * who claims before the brief is shared sees nothing until it is.
 */
export const inviteDemoPartiesOperation = defineOperation({
  name: 'demo.shoots.invite',
  method: 'POST',
  path: '/demo/shoots/:projectId/invitations',
  successStatus: 201,
  input: { params: z.strictObject({ projectId: z.uuid() }) },
  output: z.strictObject({ invitations: z.array(z.strictObject({ partyId: z.uuid(), credential: z.string() })) }),
  access: {
    kind: 'protected',
    load: (input, db) => findProject(db, input.params.projectId),
    policy: creatorOnly,
  },
  run: async (_input, { db, target }) => {
    const invitations = await db.transaction(async (tx) => {
      const out = [];
      for (const party of await listProjectParties(tx, target.id)) {
        const created = await createDirectInvitation(tx, { projectId: target.id, partyId: party.id });
        out.push({ partyId: party.id, credential: created.credential });
      }
      return out;
    });
    return { invitations };
  },
});

const OPERATOR_COOKIE_SECONDS = 12 * 60 * 60;

/**
 * Operator mode: the explicit demo convenience that makes this browser the
 * demo operator. It ends any session this browser carries and sets the
 * operator cookie to the server's per-process secret. Without this action a
 * browser is never the operator.
 *
 * On staging (S13) the action also needs the operator key, checked here on
 * the server in constant time: it arrives only in this POST's JSON body (never
 * a URL), is never stored, logged or returned, and is not the cookie's value.
 * A missing or wrong key is the same 403, before anything is written. The
 * local demo has no key and refuses one.
 */
function enterOperatorModeOperation(operatorSecret: string | undefined, operatorKey: string | undefined) {
  const expectedKey = operatorKey === undefined ? null : tokenDigest(operatorKey);
  if (operatorKey !== undefined && expectedKey === null) throw new Error('the operator key must be a canonical token');
  return defineBrowserOperation({
    name: 'demo.operator.enter',
    method: 'POST',
    path: '/demo/operator',
    input: { body: z.strictObject({ key: z.string().min(1).max(256).optional() }) },
    output: z.strictObject({}),
    access: publicAccess('the demo convenience that makes this browser the synthetic demo operator; origin-checked; on staging it needs the operator key'),
    run: async (input, { db, cookies, log }) => {
      if (operatorSecret === undefined) throw new AppError(404, 'not_found');
      if (expectedKey === null) {
        if (input.body.key !== undefined) throw new AppError(400, 'invalid_input');
      } else {
        const presented = tokenDigest(input.body.key);
        if (presented === null || !sameDigest(presented, expectedKey)) {
          log.warn('operator key refused');
          throw new AppError(403, 'forbidden');
        }
      }
      for (const token of cookies(SESSION_COOKIE)) await endSession(db, token);
      return {
        kind: 'json',
        body: {},
        cookies: [clearSessionCookie(), { name: OPERATOR_COOKIE, value: operatorSecret, maxAge: OPERATOR_COOKIE_SECONDS, path: '/', sameSite: 'Strict' }],
      };
    },
  });
}

/** What the screens need to know about where they run. Nothing secret. */
export interface DemoEnvironment {
  readonly environment: 'local' | 'staging';
  /** Registered sign-in provider ids (`test` locally, `google` on staging). */
  readonly providers: readonly string[];
  readonly operatorKeyRequired: boolean;
}

const LOCAL_ENVIRONMENT: DemoEnvironment = { environment: 'local', providers: [], operatorKeyRequired: false };

function environmentOperation(environment: DemoEnvironment) {
  return defineOperation({
    name: 'demo.environment',
    method: 'GET',
    path: '/demo/environment',
    output: z.strictObject({
      environment: z.enum(['local', 'staging']),
      providers: z.array(z.string()),
      operatorKeyRequired: z.boolean(),
    }),
    access: publicAccess('tells the demo screens whether they run locally or on synthetic staging, which sign-in to offer and whether operator mode needs a key; nothing secret'),
    run: async () => ({ ...environment, providers: [...environment.providers] }),
  });
}

/** Refused before any lookup: a signed-in account is never the operator. */
const NOT_OPERATOR = Symbol('not the demo operator');

/**
 * Every protected demo operation admits only a synthetic principal. A signed-in
 * account gets the same 403 whatever it names, before anything is loaded.
 */
function operatorOnly(op: AnyOperation): AnyOperation {
  if (op.access.kind !== 'protected') return op;
  const inner = op.access;
  return {
    ...op,
    access: {
      kind: 'protected',
      load: (input: Parameters<typeof inner.load>[0], db: Parameters<typeof inner.load>[1], principal: Principal) =>
        syntheticOnly(principal) ? inner.load(input, db, principal) : Promise.resolve(NOT_OPERATOR),
      policy: (principal: Principal, target: unknown) => target !== NOT_OPERATOR && syntheticOnly(principal) && inner.policy(principal, target),
    },
  };
}

/**
 * Every demo operation: the inspector's reads, the simulator, the composer
 * and scenario cards, the operator's participant simulation, Invite, the
 * explicit operator-mode action and the environment the screens read. The
 * operations that write demo labels are given the annotation store they
 * write to. Every protected one refuses a
 * signed-in account.
 */
export function createDemoOperations(
  annotations: AnnotationStore,
  operator: { secret?: string; key?: string; environment?: DemoEnvironment } = {},
): readonly AnyOperation[] {
  return [
    listDemoProjectsOperation,
    readDemoProjectRecordOperation,
    ...createSimulatorOperations(annotations),
    ...createShootOperations(annotations),
    ...participantOperations,
    inviteDemoPartiesOperation,
    enterOperatorModeOperation(operator.secret, operator.key),
    environmentOperation(operator.environment ?? LOCAL_ENVIRONMENT),
  ].map(operatorOnly);
}
