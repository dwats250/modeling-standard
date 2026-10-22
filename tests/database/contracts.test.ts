import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { resolveAccountForLogin } from '../../src/accounts/account.ts';
import { bindPartyToAccount } from '../../src/accounts/binding.ts';
import { createLogger } from '../../src/app/logger.ts';
import { addBriefItem, BriefActionRefusedError, BriefItemNotFoundError, listBriefItems, openLiveBrief, type BriefItemSpec } from '../../src/briefs/brief.ts';
import {
  briefFingerprint,
  declineBriefRequest,
  freezeBriefForSigning,
  getBriefGreenState,
  getBriefSigningState,
  isBriefReadyToSign,
  readFingerprintSnapshot,
  setDraftPartyPresence,
  setOpenParameterBySubject,
  settleDecideTogetherItem,
  shareLiveBrief,
  tickBriefItem,
  untickBriefItem,
  type FingerprintSnapshot,
} from '../../src/briefs/live.ts';
import {
  ContractNotFoundError,
  contractViewFor,
  finalizeBrief,
  findContractForBrief,
  getContract,
  getContractVisibleTo,
  signatureRecordHash,
  verifyContractChain,
  verifyContractRecord,
  type FullContract,
  type SignatureEvidence,
} from '../../src/contracts/contract.ts';
import { renderContractHtml } from '../../src/contracts/rendering.ts';
import { openDatabase, type DatabaseHandle } from '../../src/infrastructure/database/client.ts';
import { createPairwiseAgreement } from '../../src/projects/agreement.ts';
import { addProjectParty } from '../../src/projects/party.ts';
import { insertProject } from '../../src/projects/project.ts';
import { CHECK_VIOLATION, INSUFFICIENT_PRIVILEGE, sqlErrorCode, withClient } from '../support/sql.ts';

/**
 * S11 final contract against real PostgreSQL, migrated by the production
 * path and used as the runtime role: finalization preconditions and
 * refusals, the verbatim copy, the signature chain (application and
 * database computing the same hashes), the database's own guards on a
 * finalization written by direct SQL, serialized outcomes against untick
 * and against a second finalization, immutability by privilege, the final
 * phase's rigidity, and the per-party view and proposal rendering leaking
 * nothing.
 */

let database: DatabaseHandle;
beforeAll(() => {
  database = openDatabase(inject('runtimeUrl'), createLogger('silent'));
});
afterAll(async () => {
  await database.close();
});

const db = () => database.db;
const runtime = <T>(fn: (c: pg.Client) => Promise<T>) => withClient(inject('runtimeUrl'), fn);
const owner = <T>(fn: (c: pg.Client) => Promise<T>) => withClient(inject('migrationUrl'), fn);

async function failure(fn: () => Promise<unknown>): Promise<{ code?: string; constraint?: string; reason?: string; name?: string } | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    if (error instanceof BriefActionRefusedError) return { reason: error.reason };
    const e = error as { name?: string; code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
    const code = e.code ?? e.cause?.code;
    const constraint = e.constraint ?? e.cause?.constraint;
    if (!code) return { name: e.name ?? 'Error' };
    return constraint ? { code, constraint } : { code };
  }
}
const refused = (reason: string) => ({ reason });
const violation = (constraint: string) => ({ code: CHECK_VIOLATION, constraint });

interface World {
  projectId: string;
  briefId: string;
  /** Photographer and model, each bound to an account. */
  p: string;
  m: string;
  pAccount: string;
  mAccount: string;
  pm: string;
  items: { universal: string; shared: string; together: string; parameter: string; request: string; fee: string };
}

const item = (briefId: string, spec: BriefItemSpec) => addBriefItem(db(), briefId, spec);

async function account(): Promise<string> {
  return (await resolveAccountForLogin(db(), { provider: 'google', providerSubject: `s11-${randomUUID()}` })).id;
}

/**
 * The S10 ready world, with each party bound to its own account. `bind:
 * false` leaves both unbound; `freeze` (default) leaves it signing.
 */
async function world({ content = '[s11] safety', bind = true, freeze = true, photographerOnSite = true } = {}): Promise<World> {
  const project = await insertProject(db(), { createdByPrincipalId: `s11-${randomUUID()}` });
  const p = (await addProjectParty(db(), project.id)).id;
  const m = (await addProjectParty(db(), project.id)).id;
  const pm = (await createPairwiseAgreement(db(), project.id, [p, m])).id;
  const briefId = (await openLiveBrief(db(), project.id)).id;
  const universal = (await item(briefId, { layer: 'universal', subjectPartyId: m, shape: 'declaration', content })).id;
  const shared = (await item(briefId, { layer: 'shared', content: '[s11] call time' })).id;
  const together = (await item(briefId, { layer: 'shared', content: '[s11] delivery', pending: 'decide_together' })).id;
  const parameter = (
    await item(briefId, { layer: 'shared', subjectPartyId: m, shape: 'open_parameter', itemKey: 'coverage_level', content: '[s11] coverage', pending: 'subject' })
  ).id;
  const request = (await item(briefId, { layer: 'shared', pairwiseAgreementId: pm, subjectPartyId: m, shape: 'request', content: '[s11] album cover' })).id;
  const fee = (await item(briefId, { layer: 'money', pairwiseAgreementId: pm, itemKey: 'fee', content: '[s11] fee', value: '[s11] 400' })).id;
  await setDraftPartyPresence(db(), briefId, p, photographerOnSite);
  await setDraftPartyPresence(db(), briefId, m, true);
  await shareLiveBrief(db(), briefId);
  await settleDecideTogetherItem(db(), together, '[s11] the 20th');
  await setOpenParameterBySubject(db(), parameter, m, '[s11] level two');
  for (const state of (await getBriefGreenState(db(), briefId)).items) {
    for (const party of state.approverIds) await tickBriefItem(db(), state.item.id, party);
  }
  expect(await isBriefReadyToSign(db(), briefId)).toBe(true);
  const pAccount = await account();
  const mAccount = await account();
  if (bind) {
    await bindPartyToAccount(db(), { projectId: project.id, partyId: p, accountId: pAccount });
    await bindPartyToAccount(db(), { projectId: project.id, partyId: m, accountId: mAccount });
  }
  if (freeze) await freezeBriefForSigning(db(), briefId);
  return { projectId: project.id, briefId, p, m, pAccount, mAccount, pm, items: { universal, shared, together, parameter, request, fee } };
}

async function fingerprintOf(w: World): Promise<string> {
  const { fingerprint } = await getBriefSigningState(db(), w.briefId);
  if (fingerprint === null) throw new Error('not signing');
  return fingerprint;
}

async function signaturesOf(w: World, overrides: Partial<Record<'p' | 'm', Partial<SignatureEvidence>>> = {}): Promise<[SignatureEvidence, SignatureEvidence]> {
  const fingerprint = (await getBriefSigningState(db(), w.briefId)).fingerprint ?? '0'.repeat(64);
  return [
    { partyId: w.p, accountId: w.pAccount, fingerprint, ...overrides.p },
    { partyId: w.m, accountId: w.mAccount, fingerprint, ...overrides.m },
  ];
}

const finalize = async (w: World, overrides?: Parameters<typeof signaturesOf>[1]) => finalizeBrief(db(), w.briefId, await signaturesOf(w, overrides));

async function contractRowCount(projectId: string): Promise<number> {
  return runtime(async (c) => (await c.query<{ n: number }>('select count(*)::int as n from contract where project_id = $1', [projectId])).rows[0]!.n);
}

/** Every brief and contract row of the world's project, for nothing-written comparisons. */
async function rowsOf(w: World): Promise<Record<string, unknown[]>> {
  return runtime(async (c) => ({
    brief: (await c.query('select * from live_brief where id = $1', [w.briefId])).rows,
    items: (await c.query('select * from brief_item where brief_id = $1 order by id', [w.briefId])).rows,
    ticks: (await c.query('select * from brief_tick where project_id = $1 order by brief_item_id, party_id', [w.projectId])).rows,
    presence: (await c.query('select * from brief_party_presence where brief_id = $1 order by party_id', [w.briefId])).rows,
    contract: (await c.query('select * from contract where project_id = $1', [w.projectId])).rows,
    contractParty: (await c.query('select * from contract_party where project_id = $1', [w.projectId])).rows,
    contractItem: (await c.query('select * from contract_item where project_id = $1', [w.projectId])).rows,
    contractSignature: (await c.query('select * from contract_signature where project_id = $1', [w.projectId])).rows,
  }));
}

async function untilBlocked(blocker: pg.Client): Promise<void> {
  const blockerPid = (await blocker.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;
  for (let i = 0; i < 250; i += 1) {
    const blocked = await runtime(async (c) =>
      (await c.query<{ n: number }>(`select count(*)::int as n from pg_stat_activity where $1 = any(pg_blocking_pids(pid))`, [blockerPid])).rows[0]!.n,
    );
    if (blocked > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('no backend became blocked on a lock');
}

// ---- A finalization written by direct runtime SQL, for the database's own guards ----

interface RawOptions {
  /** Changes to the contract items as copied (by brief item id). */
  readonly item?: (row: RawItem) => RawItem | null;
  /** Leave out the second signature. */
  readonly oneSignature?: boolean;
  /** Write the signatures in the opposite (wrong) chain order. */
  readonly reversed?: boolean;
  /** Supply a backdated time and invented hashes. */
  readonly forged?: boolean;
  /** Skip the phase change (the contract would be left behind). */
  readonly noFinal?: boolean;
  readonly isolation?: string;
}
interface RawItem {
  id: string;
  ordinal: number;
  layer: string;
  pairwise_agreement_id: string | null;
  subject_party_id: string | null;
  shape: string | null;
  item_key: string | null;
  content: string;
  value: string | null;
  position: number;
  approvers: string[];
}

async function rawFinalize(w: World, options: RawOptions = {}): Promise<{ code?: string | undefined; constraint?: string | undefined } | null> {
  const snapshot = await readFingerprintSnapshot(db(), { id: w.briefId, projectId: w.projectId, phase: 'signing' });
  const fingerprint = await fingerprintOf(w);
  return runtime(async (c) => {
    await c.query(`begin isolation level ${options.isolation ?? 'read committed'}`);
    try {
      const contractId = (
        await c.query<{ id: string }>('insert into contract (project_id, brief_id, fingerprint) values ($1, $2, $3) returning id', [w.projectId, w.briefId, fingerprint])
      ).rows[0]!.id;
      const accountOf: Record<string, string> = { [w.p]: w.pAccount, [w.m]: w.mAccount };
      for (const party of snapshot.parties) {
        await c.query('insert into contract_party (contract_id, project_id, party_id, account_id, on_site) values ($1, $2, $3, $4, $5)', [
          contractId,
          w.projectId,
          party.id,
          accountOf[party.id],
          party.onSite,
        ]);
      }
      const ordered = [...snapshot.items].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
      for (const [index, i] of ordered.entries()) {
        const base: RawItem = {
          id: i.id,
          ordinal: index + 1,
          layer: i.layer,
          pairwise_agreement_id: i.pairwiseAgreementId,
          subject_party_id: i.subjectPartyId,
          shape: i.shape,
          item_key: i.itemKey,
          content: i.content!,
          value: i.value,
          position: i.position,
          approvers: [...i.approverIds].sort(),
        };
        const row = options.item ? options.item(base) : base;
        if (row === null) continue;
        await c.query(
          `insert into contract_item (contract_id, project_id, item_id, position, layer, pairwise_agreement_id, subject_party_id, shape, item_key, content, value, approver_party_ids)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [contractId, w.projectId, row.id, row.ordinal, row.layer, row.pairwise_agreement_id, row.subject_party_id, row.shape, row.item_key, row.content, row.value, row.approvers],
        );
      }
      let signers = [w.p, w.m].sort();
      if (options.reversed) signers = signers.reverse();
      if (options.oneSignature) signers = signers.slice(0, 1);
      for (const [index, party] of signers.entries()) {
        const forged = options.forged ? ['2001-01-01T00:00:00Z', 'a'.repeat(64), 'b'.repeat(64)] : [new Date().toISOString(), '0'.repeat(64), '0'.repeat(64)];
        await c.query(
          `insert into contract_signature (contract_id, project_id, sequence, party_id, account_id, fingerprint, signed_at, prev_hash, record_hash)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [contractId, w.projectId, options.reversed ? 2 - index : index + 1, party, accountOf[party], fingerprint, ...forged],
        );
      }
      if (!options.noFinal) {
        await c.query(`update live_brief set phase = 'final', fingerprint = null where id = $1`, [w.briefId]);
        await c.query('delete from brief_tick where project_id = $1', [w.projectId]);
        await c.query('delete from brief_item where brief_id = $1', [w.briefId]);
      }
      await c.query('commit');
      return null;
    } catch (error) {
      await c.query('rollback').catch(() => undefined);
      const e = error as { code?: string; constraint?: string };
      return e.constraint ? { code: e.code, constraint: e.constraint } : { code: e.code };
    }
  });
}

// ---- Tests ----

describe('finalization preconditions and refusals', () => {
  it('refuses a draft and a live brief (not_signing), writing nothing', async () => {
    const live = await world({ freeze: false });
    const before = await rowsOf(live);
    expect(await failure(() => finalize(live))).toEqual(refused('not_signing'));
    expect(await rowsOf(live)).toEqual(before);

    const project = await insertProject(db(), { createdByPrincipalId: `s11-${randomUUID()}` });
    const draft = await openLiveBrief(db(), project.id);
    const sig = { partyId: randomUUID(), accountId: randomUUID(), fingerprint: '0'.repeat(64) };
    expect(await failure(() => finalizeBrief(db(), draft.id, [sig, { ...sig, partyId: randomUUID() }]))).toEqual(refused('not_signing'));
    expect(await contractRowCount(project.id)).toBe(0);
  });

  it('refuses a party not in the project, the same party twice, and a missing or wrong binding, writing nothing', async () => {
    const w = await world();
    const before = await rowsOf(w);
    const stranger = (await addProjectParty(db(), (await insertProject(db(), { createdByPrincipalId: 'x' })).id)).id;
    expect(await failure(() => finalize(w, { m: { partyId: stranger } }))).toEqual(refused('not_a_party'));
    expect(await failure(() => finalize(w, { m: { partyId: w.p, accountId: w.pAccount } }))).toEqual(refused('not_a_party'));
    // D12: each signature is the party's own bound account.
    expect(await failure(() => finalize(w, { p: { accountId: w.mAccount }, m: { accountId: w.pAccount } }))).toEqual(refused('not_bound_account'));
    const other = await account();
    expect(await failure(() => finalize(w, { m: { accountId: other } }))).toEqual(refused('not_bound_account'));
    expect(await rowsOf(w)).toEqual(before);

    const unbound = await world({ bind: false });
    expect(await failure(() => finalize(unbound))).toEqual(refused('not_bound_account'));
    expect(await contractRowCount(unbound.projectId)).toBe(0);
  });

  it('refuses a signature over any other fingerprint, including one from before a withdrawal and a changed re-freeze', async () => {
    const w = await world();
    const stale = await fingerprintOf(w);
    expect(await failure(() => finalize(w, { m: { fingerprint: 'f'.repeat(64) } }))).toEqual(refused('fingerprint_mismatch'));
    // Withdraw, let the subject decline the request, re-freeze: a changed brief, a new fingerprint.
    expect(await untickBriefItem(db(), w.items.request, w.m)).toBe(true);
    await declineBriefRequest(db(), w.items.request, w.m);
    await freezeBriefForSigning(db(), w.briefId);
    expect(await fingerprintOf(w)).not.toBe(stale);
    expect(await failure(() => finalize(w, { p: { fingerprint: stale }, m: { fingerprint: stale } }))).toEqual(refused('fingerprint_mismatch'));
    expect(await contractRowCount(w.projectId)).toBe(0);
    // The current fingerprint finalizes.
    await finalize(w);
    expect(await contractRowCount(w.projectId)).toBe(1);
  });

  it('refuses a second finalization (already_final)', async () => {
    const w = await world();
    const signatures = await signaturesOf(w);
    await finalizeBrief(db(), w.briefId, signatures);
    expect(await failure(() => finalizeBrief(db(), w.briefId, signatures))).toEqual(refused('already_final'));
    expect(await contractRowCount(w.projectId)).toBe(1);
  });
});

describe('the final contract', () => {
  it('is a verbatim copy of the frozen brief, with both signatures, and leaves the brief final with no items or ticks', async () => {
    const w = await world();
    const fingerprint = await fingerprintOf(w);
    const snapshot = await readFingerprintSnapshot(db(), { id: w.briefId, projectId: w.projectId, phase: 'signing' });
    const itemsBefore = await listBriefItems(db(), w.briefId);
    const presenceBefore = (await rowsOf(w)).presence;
    const startedAt = Date.now();

    // Given in model-then-photographer order: the chain order is by party id regardless.
    const [ps, ms] = await signaturesOf(w);
    const { contractId } = await finalizeBrief(db(), w.briefId, [ms, ps]);

    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'final', fingerprint: null });
    const after = await rowsOf(w);
    expect(after.items).toEqual([]);
    expect(after.ticks).toEqual([]);
    expect(after.presence).toEqual(presenceBefore);

    const full = await getContract(db(), contractId);
    expect(full.contract).toEqual({ id: contractId, projectId: w.projectId, briefId: w.briefId, fingerprint });
    expect(await findContractForBrief(db(), w.briefId)).toEqual(full.contract);
    expect(full.parties).toEqual(
      [
        { partyId: w.p, accountId: w.pAccount, onSite: true },
        { partyId: w.m, accountId: w.mAccount, onSite: true },
      ].sort((a, b) => (a.partyId < b.partyId ? -1 : 1)),
    );
    // Every item, in display order 1..n, every stored column verbatim, approvers as the S10 snapshot derived them.
    const approvers = new Map(snapshot.items.map((i) => [i.id, [...i.approverIds].sort()]));
    expect(full.items).toEqual(
      itemsBefore.map((i, index) => ({
        itemId: i.id,
        position: index + 1,
        layer: i.layer,
        pairwiseAgreementId: i.pairwiseAgreementId,
        subjectPartyId: i.subjectPartyId,
        shape: i.shape,
        itemKey: i.itemKey,
        content: i.content,
        value: i.value,
        approverPartyIds: approvers.get(i.id),
      })),
    );
    expect(full.signatures.map((s) => ({ sequence: s.sequence, partyId: s.partyId, accountId: s.accountId, fingerprint: s.fingerprint }))).toEqual(
      [w.p, w.m].sort().map((party, index) => ({ sequence: index + 1, partyId: party, accountId: party === w.p ? w.pAccount : w.mAccount, fingerprint })),
    );
    // Database time, one moment for both, truncated to milliseconds.
    const [first, second] = full.signatures;
    expect(first!.signedAt.getTime()).toBe(second!.signedAt.getTime());
    expect(first!.signedAt.getTime()).toBeGreaterThanOrEqual(startedAt - 5_000);
    expect(first!.signedAt.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
    expect(first!.ip).toBeNull();
    expect(first!.userAgent).toBeNull();
  });

  it('carries the fingerprint the brief was frozen with; its own rows recompute it and the chain verifies', async () => {
    const w = await world();
    const snapshot = await readFingerprintSnapshot(db(), { id: w.briefId, projectId: w.projectId, phase: 'signing' });
    const fingerprint = await fingerprintOf(w);
    expect(briefFingerprint(snapshot)).toBe(fingerprint);
    const { contractId, fingerprint: stored } = await finalize(w);
    expect(stored).toBe(fingerprint);
    expect(await verifyContractChain(db(), contractId)).toEqual({ valid: true, problems: [] });

    const full = await getContract(db(), contractId);
    const [first, second] = full.signatures;
    expect(first!.prevHash).toBe(fingerprint);
    expect(second!.prevHash).toBe(first!.recordHash);
    // The application and the database compute the same record hash.
    for (const s of full.signatures) expect(signatureRecordHash(contractId, s)).toBe(s.recordHash);
  });

  it('fails verification when any stored field is altered, in memory', () => {
    // Verification is pure over a record; build one and tamper with each field.
    const base = sampleContract();
    expect(verifyContractRecord(base)).toEqual({ valid: true, problems: [] });
    const tampered: FullContract[] = [
      { ...base, contract: { ...base.contract, fingerprint: 'e'.repeat(64) } },
      { ...base, parties: base.parties.map((p, i) => (i === 0 ? { ...p, onSite: !p.onSite } : p)) },
      { ...base, parties: base.parties.map((p, i) => (i === 0 ? { ...p, accountId: randomUUID() } : p)) },
      { ...base, items: base.items.map((x, i) => (i === 0 ? { ...x, content: `${x.content} ` } : x)) },
      { ...base, items: base.items.map((x, i) => (i === 0 ? { ...x, value: 'other' } : x)) },
      { ...base, items: base.items.map((x, i) => (i === 0 ? { ...x, approverPartyIds: [] } : x)) },
      { ...base, items: base.items.slice(1) },
      { ...base, signatures: base.signatures.slice(0, 1) },
      { ...base, signatures: [...base.signatures].reverse() },
      { ...base, signatures: base.signatures.map((s, i) => (i === 1 ? { ...s, signedAt: new Date(s.signedAt.getTime() + 1) } : s)) },
      { ...base, signatures: base.signatures.map((s, i) => (i === 0 ? { ...s, ip: '10.0.0.1' } : s)) },
      { ...base, signatures: base.signatures.map((s, i) => (i === 0 ? { ...s, userAgent: 'other' } : s)) },
      { ...base, signatures: base.signatures.map((s, i) => (i === 1 ? { ...s, prevHash: 'c'.repeat(64) } : s)) },
      { ...base, signatures: base.signatures.map((s, i) => (i === 1 ? { ...s, recordHash: 'd'.repeat(64) } : s)) },
    ];
    for (const record of tampered) expect(verifyContractRecord(record).valid).toBe(false);
  });

  it('copies awkward text byte-exact, with a party off site, and stores request evidence in the chain', async () => {
    const awkward = '[s11] "quoted" \\ back\nnew\tline \u0001\u001f ünïcødé 🎞️   end';
    const w = await world({ content: awkward, photographerOnSite: false });
    const { contractId } = await finalize(w, {
      p: { evidence: { ip: '203.0.113.7', userAgent: 'Synthetic "UA" \\ ✓' } },
      m: { evidence: { ip: '2001:db8::1' } },
    });
    const full = await getContract(db(), contractId);
    const universal = full.items.find((i) => i.itemId === w.items.universal)!;
    expect(universal.content).toBe(awkward);
    expect(universal.approverPartyIds).toEqual([w.m]);
    expect(full.parties.find((p) => p.partyId === w.p)!.onSite).toBe(false);
    const byParty = new Map(full.signatures.map((s) => [s.partyId, s]));
    expect(byParty.get(w.p)).toMatchObject({ ip: '203.0.113.7', userAgent: 'Synthetic "UA" \\ ✓' });
    expect(byParty.get(w.m)).toMatchObject({ ip: '2001:db8::1', userAgent: null });
    expect(await verifyContractChain(db(), contractId)).toEqual({ valid: true, problems: [] });
  });

  it('refuses a network address or an oversized user agent as evidence', async () => {
    const w = await world();
    expect(await failure(() => finalize(w, { p: { evidence: { ip: '10.0.0.0/8' } } }))).toEqual(violation('contract_signature_ip_is_host'));
    expect(await failure(() => finalize(w, { p: { evidence: { userAgent: 'x'.repeat(513) } } }))).toEqual(violation('contract_signature_user_agent_bounded'));
    expect(await getBriefSigningState(db(), w.briefId)).toMatchObject({ phase: 'signing' });
    expect(await contractRowCount(w.projectId)).toBe(0);
  });
});

describe('the database guards a finalization written by direct SQL', () => {
  it('admits a complete verbatim one, and sets the time and hashes itself', async () => {
    const w = await world();
    expect(await rawFinalize(w, { forged: true })).toBeNull();
    const contract = (await findContractForBrief(db(), w.briefId))!;
    const full = await getContract(db(), contract.id);
    expect(full.signatures.every((s) => s.signedAt.getUTCFullYear() > 2001)).toBe(true);
    expect(full.signatures[0]!.prevHash).toBe(contract.fingerprint);
    expect(await verifyContractChain(db(), contract.id)).toEqual({ valid: true, problems: [] });
  });

  it('refuses one signature without the other', async () => {
    const w = await world();
    expect(await rawFinalize(w, { oneSignature: true })).toEqual(violation('live_brief_final_requires_signatures'));
    expect(await contractRowCount(w.projectId)).toBe(0);
  });

  it('refuses signatures out of chain order', async () => {
    const w = await world();
    expect(await rawFinalize(w, { reversed: true })).toEqual(violation('contract_signature_chain_order'));
  });

  it('refuses a copy that is not verbatim: changed wording or value, a raw position, a missing item, changed approvers', async () => {
    const changes: ((row: RawItem) => RawItem | null)[] = [
      (row) => (row.position === 1 ? { ...row, content: `${row.content}.` } : row),
      (row) => (row.item_key === 'fee' ? { ...row, value: '[s11] 4000' } : row),
      (row) => (row.ordinal === 1 ? { ...row, ordinal: 99 } : row),
      (row) => (row.item_key === 'fee' ? null : row),
      (row) => (row.item_key === 'fee' ? { ...row, approvers: row.approvers.slice(0, 1) } : row),
      (row) => (row.item_key === 'fee' ? { ...row, approvers: [...row.approvers].reverse() } : row),
    ];
    for (const change of changes) {
      const w = await world();
      expect(await rawFinalize(w, { item: change })).toEqual(violation('live_brief_final_copy_mismatch'));
      expect(await getBriefSigningState(db(), w.briefId)).toMatchObject({ phase: 'signing' });
    }
  });

  it('refuses a contract left behind without finalizing, at commit', async () => {
    const w = await world();
    expect(await rawFinalize(w, { noFinal: true })).toEqual(violation('contract_requires_final_brief'));
    expect(await contractRowCount(w.projectId)).toBe(0);
    await finalize(w);
  });

  it('refuses a contract for a brief that is not signing, with another fingerprint, or outside READ COMMITTED', async () => {
    const live = await world({ freeze: false });
    const insert = (w: World, fingerprint: string, isolation = 'read committed') =>
      runtime(async (c) => {
        await c.query(`begin isolation level ${isolation}`);
        try {
          await c.query('insert into contract (project_id, brief_id, fingerprint) values ($1, $2, $3)', [w.projectId, w.briefId, fingerprint]);
          return null;
        } catch (error) {
          const e = error as { code?: string; constraint?: string };
          return { code: e.code, constraint: e.constraint };
        } finally {
          await c.query('rollback');
        }
      });
    expect(await insert(live, 'a'.repeat(64))).toEqual(violation('contract_requires_signing_brief'));
    const w = await world();
    expect(await insert(w, 'a'.repeat(64))).toEqual(violation('contract_requires_signing_brief'));
    expect(await insert(w, await fingerprintOf(w), 'repeatable read')).toEqual(violation('contract_read_committed_only'));
    expect(await rawFinalize(w, { isolation: 'serializable' })).toEqual(violation('contract_read_committed_only'));
  });

  it('refuses signing → final outside READ COMMITTED, and without the contract for that fingerprint (WS2 §D 15)', async () => {
    const w = await world();
    const toFinal = (isolation: string) =>
      runtime(async (c) => {
        await c.query(`begin isolation level ${isolation}`);
        try {
          await c.query(`update live_brief set phase = 'final', fingerprint = null where id = $1`, [w.briefId]);
          return null;
        } catch (error) {
          const e = error as { code?: string; constraint?: string };
          return { code: e.code, constraint: e.constraint };
        } finally {
          await c.query('rollback');
        }
      });
    expect(await toFinal('repeatable read')).toEqual(violation('live_brief_final_read_committed_only'));
    expect(await toFinal('serializable')).toEqual(violation('live_brief_final_read_committed_only'));
    expect(await toFinal('read committed')).toEqual(violation('live_brief_final_requires_contract'));
    expect(await getBriefSigningState(db(), w.briefId)).toMatchObject({ phase: 'signing' });
  });

  it('refuses a signature over another fingerprint than its contract\'s', async () => {
    const w = await world();
    const fingerprint = await fingerprintOf(w);
    const outcome = await runtime(async (c) => {
      await c.query('begin');
      try {
        const id = (await c.query<{ id: string }>('insert into contract (project_id, brief_id, fingerprint) values ($1, $2, $3) returning id', [w.projectId, w.briefId, fingerprint])).rows[0]!.id;
        for (const [party, account, onSite] of [[w.p, w.pAccount, true], [w.m, w.mAccount, true]] as const) {
          await c.query('insert into contract_party (contract_id, project_id, party_id, account_id, on_site) values ($1, $2, $3, $4, $5)', [id, w.projectId, party, account, onSite]);
        }
        const first = [w.p, w.m].sort()[0]!;
        await c.query(
          `insert into contract_signature (contract_id, project_id, sequence, party_id, account_id, fingerprint, prev_hash, record_hash) values ($1, $2, 1, $3, $4, $5, $5, $5)`,
          [id, w.projectId, first, first === w.p ? w.pAccount : w.mAccount, 'e'.repeat(64)],
        );
        return null;
      } catch (error) {
        const e = error as { code?: string; constraint?: string };
        return { code: e.code, constraint: e.constraint };
      } finally {
        await c.query('rollback');
      }
    });
    expect(outcome).toEqual(violation('contract_signature_fingerprint_mismatch'));
  });

  it('refuses a contract party whose account is not its binding, or whose presence differs', async () => {
    const w = await world();
    const fingerprint = await fingerprintOf(w);
    const outcome = (account: string, onSite: boolean) =>
      runtime(async (c) => {
        await c.query('begin');
        try {
          const id = (await c.query<{ id: string }>('insert into contract (project_id, brief_id, fingerprint) values ($1, $2, $3) returning id', [w.projectId, w.briefId, fingerprint])).rows[0]!.id;
          await c.query('insert into contract_party (contract_id, project_id, party_id, account_id, on_site) values ($1, $2, $3, $4, $5)', [id, w.projectId, w.p, account, onSite]);
          return null;
        } catch (error) {
          const e = error as { code?: string; constraint?: string };
          return { code: e.code, constraint: e.constraint };
        } finally {
          await c.query('rollback');
        }
      });
    expect(await outcome(w.mAccount, true)).toEqual(violation('contract_party_requires_binding'));
    expect(await outcome(w.pAccount, false)).toEqual(violation('contract_party_presence_mismatch'));
    expect(await outcome(w.pAccount, true)).toBeNull();
  });
});

describe('serialized outcomes', () => {
  it('untick before finalize: withdrawn, and the finalization is refused (not_signing)', async () => {
    const w = await world();
    const signatures = await signaturesOf(w);
    expect(await untickBriefItem(db(), w.items.fee, w.p)).toBe(true);
    expect(await failure(() => finalizeBrief(db(), w.briefId, signatures))).toEqual(refused('not_signing'));
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
    expect(await contractRowCount(w.projectId)).toBe(0);
  });

  it('finalize before untick: the contract stands and the untick is refused', async () => {
    const w = await world();
    await finalize(w);
    expect(await failure(() => untickBriefItem(db(), w.items.fee, w.p))).toEqual({ name: BriefItemNotFoundError.name });
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'final', fingerprint: null });
  });

  it('racing finalize and untick end in exactly one serialized outcome, never a contract beside a live brief', async () => {
    for (let round = 0; round < 6; round += 1) {
      const w = await world();
      const signatures = await signaturesOf(w);
      const finalizing = () => finalizeBrief(db(), w.briefId, signatures);
      const unticking = () => untickBriefItem(db(), w.items.fee, w.p);
      const [fin, untick] =
        round % 2 === 0
          ? await Promise.allSettled([finalizing(), unticking()])
          : await Promise.allSettled([unticking(), finalizing()]).then(([u, f]) => [f, u] as const);
      const state = await getBriefSigningState(db(), w.briefId);
      const rows = await rowsOf(w);
      if (fin.status === 'fulfilled') {
        expect(untick.status).toBe('rejected');
        expect(state).toEqual({ phase: 'final', fingerprint: null });
        expect(rows.items).toEqual([]);
        expect(await verifyContractChain(db(), fin.value.contractId)).toEqual({ valid: true, problems: [] });
      } else {
        expect((fin.reason as BriefActionRefusedError).reason).toBe('not_signing');
        expect(untick).toEqual({ status: 'fulfilled', value: true });
        expect(state).toEqual({ phase: 'live', fingerprint: null });
        expect(rows.contract).toEqual([]);
      }
    }
  });

  it('two concurrent finalizations: one contract, one refusal', async () => {
    const w = await world();
    const signatures = await signaturesOf(w);
    const outcomes = await Promise.allSettled([finalizeBrief(db(), w.briefId, signatures), finalizeBrief(db(), w.briefId, signatures)]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(((outcomes.find((o) => o.status === 'rejected') as PromiseRejectedResult).reason as BriefActionRefusedError).reason).toBe('already_final');
    expect(await contractRowCount(w.projectId)).toBe(1);
  });

  it('a raw withdrawal in flight is waited for: the finalization then finds the brief live (WS2 §D 14, as narrowed)', async () => {
    const w = await world();
    const signatures = await signaturesOf(w);
    await runtime(async (c) => {
      await c.query('begin');
      // The untick-withdrawal by direct SQL: back to live first, then the tick goes.
      await c.query(`update live_brief set phase = 'live', fingerprint = null where id = $1`, [w.briefId]);
      await c.query('delete from brief_tick where brief_item_id = $1 and party_id = $2', [w.items.fee, w.p]);
      const finalizing = failure(() => finalizeBrief(db(), w.briefId, signatures));
      await untilBlocked(c);
      await c.query('commit');
      expect(await finalizing).toEqual(refused('not_signing'));
    });
    expect(await getBriefSigningState(db(), w.briefId)).toEqual({ phase: 'live', fingerprint: null });
    expect(await contractRowCount(w.projectId)).toBe(0);
  });

  it('a raw contract write in flight is waited for, cannot commit without finalizing, and the finalization then succeeds', async () => {
    const w = await world();
    const fingerprint = await fingerprintOf(w);
    const signatures = await signaturesOf(w);
    await runtime(async (c) => {
      await c.query('begin');
      await c.query('insert into contract (project_id, brief_id, fingerprint) values ($1, $2, $3)', [w.projectId, w.briefId, fingerprint]);
      const finalizing = finalizeBrief(db(), w.briefId, signatures);
      await untilBlocked(c);
      expect(await failure(() => c.query('commit'))).toEqual(violation('contract_requires_final_brief'));
      const { contractId } = await finalizing;
      expect(await verifyContractChain(db(), contractId)).toEqual({ valid: true, problems: [] });
    });
    expect(await contractRowCount(w.projectId)).toBe(1);
  });
});

describe('immutability', () => {
  const CONTRACT_TABLES = ['contract', 'contract_party', 'contract_item', 'contract_signature'];

  it('the runtime role cannot update, delete or truncate any contract table; the owner can, so privilege is the boundary', async () => {
    const w = await world();
    await finalize(w);
    await runtime(async (c) => {
      for (const table of CONTRACT_TABLES) {
        expect({ table, code: await sqlErrorCode(c, `update ${table} set project_id = project_id where project_id = $1`, [w.projectId]) }).toEqual({ table, code: INSUFFICIENT_PRIVILEGE });
        expect({ table, code: await sqlErrorCode(c, `delete from ${table} where project_id = $1`, [w.projectId]) }).toEqual({ table, code: INSUFFICIENT_PRIVILEGE });
        expect({ table, code: await sqlErrorCode(c, `truncate ${table} cascade`) }).toEqual({ table, code: INSUFFICIENT_PRIVILEGE });
      }
    });
    await owner(async (c) => {
      await c.query('begin');
      expect(await sqlErrorCode(c, 'delete from contract_signature where project_id = $1', [w.projectId])).toBeNull();
      await c.query('rollback');
    });
    expect(await verifyContractChain(db(), (await findContractForBrief(db(), w.briefId))!.id)).toEqual({ valid: true, problems: [] });
  });

  it('a final brief refuses every change, and nothing can be added to its contract', async () => {
    const w = await world();
    const { contractId } = await finalize(w);
    const fingerprint = (await getContract(db(), contractId)).contract.fingerprint;
    const raw = (sql: string, params: unknown[] = []) => failure(() => runtime((c) => c.query(sql, params)));
    expect(await raw(`update live_brief set phase = 'live' where id = $1`, [w.briefId])).toEqual(violation('live_brief_phase_transition'));
    expect(await raw(`update live_brief set phase = 'signing', fingerprint = $2 where id = $1`, [w.briefId, fingerprint])).toEqual(violation('live_brief_phase_transition'));
    expect(await raw(`update live_brief set fingerprint = $2 where id = $1`, [w.briefId, fingerprint])).toEqual(violation('live_brief_fingerprint_fixed'));
    expect(await raw(`insert into brief_item (brief_id, project_id, layer, content, position) values ($1, $2, 'shared', 'x', 99)`, [w.briefId, w.projectId])).toEqual(
      violation('brief_item_final_fixed'),
    );
    expect(await raw('update brief_party_presence set on_site = false where brief_id = $1', [w.briefId])).toEqual(violation('brief_party_presence_live_fixed'));
    expect(await raw('insert into project_party (project_id) values ($1)', [w.projectId])).toEqual(violation('project_party_roster_closed'));
    expect(await raw('insert into pairwise_agreement (project_id, party_one_id, party_two_id) values ($1, $2, $3)', [w.projectId, w.p, w.m])).toEqual(
      violation('pairwise_agreement_final_fixed'),
    );
    expect(await raw('insert into contract (project_id, brief_id, fingerprint) values ($1, $2, $3)', [w.projectId, w.briefId, fingerprint])).toEqual(
      violation('contract_requires_signing_brief'),
    );
    expect(await raw(`insert into contract_item (contract_id, project_id, item_id, position, layer, content, approver_party_ids) values ($1, $2, $3, 99, 'shared', 'added', '{}')`, [contractId, w.projectId, randomUUID()])).toEqual(
      violation('contract_part_requires_signing_brief'),
    );
    expect(await raw('insert into contract_party (contract_id, project_id, party_id, account_id, on_site) values ($1, $2, $3, $4, true)', [contractId, w.projectId, w.p, w.pAccount])).toEqual(
      violation('contract_part_requires_signing_brief'),
    );
    expect(await raw(`insert into contract_signature (contract_id, project_id, sequence, party_id, account_id, fingerprint, prev_hash, record_hash) values ($1, $2, 2, $3, $4, $5, $5, $5)`, [contractId, w.projectId, w.p, w.pAccount, fingerprint])).toEqual(
      violation('contract_part_requires_signing_brief'),
    );
    // The S09/S10 functions refuse it too.
    expect(await failure(() => freezeBriefForSigning(db(), w.briefId))).toEqual(refused('not_live'));
  });

  it('no foreign key cascades to or from a contract table, and none points at a brief item', async () => {
    const rows = await runtime((c) =>
      c.query<{ name: string; rel: string; target: string; ondelete: string }>(
        `select conname as name, conrelid::regclass::text as rel, confrelid::regclass::text as target, confdeltype as ondelete
         from pg_constraint where contype = 'f' and (conrelid::regclass::text like 'contract%' or confrelid::regclass::text like 'contract%') order by 1`,
      ),
    );
    expect(rows.rows.map((r) => `${r.rel}.${r.name} -> ${r.target}`)).toEqual([
      'contract.contract_brief_in_project_fk -> live_brief',
      'contract_item.contract_item_in_contract_fk -> contract',
      'contract_item.contract_item_pair_in_project_fk -> pairwise_agreement',
      'contract_item.contract_item_subject_in_project_fk -> project_party',
      'contract_party.contract_party_account_id_account_id_fk -> account',
      'contract_party.contract_party_in_contract_fk -> contract',
      'contract_party.contract_party_party_in_project_fk -> project_party',
      'contract.contract_project_id_project_id_fk -> project',
      'contract_signature.contract_signature_by_contract_party_fk -> contract_party',
      'contract_signature.contract_signature_in_contract_fk -> contract',
    ]);
    for (const fk of rows.rows) expect({ fk: fk.name, ondelete: fk.ondelete }).toEqual({ fk: fk.name, ondelete: 'a' });
  });
});

describe('the contract tables', () => {
  const columnsOf = async (table: string) =>
    (
      await runtime((c) =>
        c.query<{ column_name: string; data_type: string; is_nullable: string }>(
          `select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position`,
          [table],
        ),
      )
    ).rows.map((r) => `${r.column_name}:${r.data_type}:${r.is_nullable}`);

  it('hold exactly these columns', async () => {
    expect(await columnsOf('contract')).toEqual(['id:uuid:NO', 'project_id:uuid:NO', 'brief_id:uuid:NO', 'fingerprint:text:NO']);
    expect(await columnsOf('contract_party')).toEqual(['contract_id:uuid:NO', 'project_id:uuid:NO', 'party_id:uuid:NO', 'account_id:uuid:NO', 'on_site:boolean:NO']);
    expect(await columnsOf('contract_item')).toEqual([
      'contract_id:uuid:NO',
      'project_id:uuid:NO',
      'item_id:uuid:NO',
      'position:integer:NO',
      'layer:text:NO',
      'pairwise_agreement_id:uuid:YES',
      'subject_party_id:uuid:YES',
      'shape:text:YES',
      'item_key:text:YES',
      'content:text:NO',
      'value:text:YES',
      'approver_party_ids:ARRAY:NO',
    ]);
    expect(await columnsOf('contract_signature')).toEqual([
      'contract_id:uuid:NO',
      'project_id:uuid:NO',
      'sequence:integer:NO',
      'party_id:uuid:NO',
      'account_id:uuid:NO',
      'fingerprint:text:NO',
      'signed_at:timestamp with time zone:NO',
      'ip:inet:YES',
      'user_agent:text:YES',
      'prev_hash:text:NO',
      'record_hash:text:NO',
    ]);
  });

  it('name no author, proposer, status, history, decline, tick, affirmation, name, email, reference or retention', async () => {
    const excluded = ['author', 'propos', 'status', 'version', 'revision', 'history', 'declin', 'tick', 'affirm', 'name', 'email', 'reference', 'retention', 'purge', 'pending'];
    const names = await runtime((c) =>
      c.query<{ name: string }>(`select table_name || '.' || column_name as name from information_schema.columns where table_schema = 'public' and table_name like 'contract%'`),
    );
    expect(names.rows.map((r) => r.name).filter((n) => excluded.some((w) => n.split('.')[1]!.includes(w)))).toEqual([]);
  });

  it('no identifier in src/ or migrations/ is affirmed_by or signed_by (AC-20)', () => {
    const roots = [join(import.meta.dirname, '../../src'), join(import.meta.dirname, '../../migrations')];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    roots.forEach(walk);
    const hits = files.filter((f) => /affirmed_?by|signed_?by/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe('the per-party view and the proposal rendering', () => {
  it('each party sees every clause of a two-party contract, its own fee included, and nothing else', async () => {
    const w = await world();
    const { contractId } = await finalize(w);
    const full = await getContract(db(), contractId);
    for (const party of [w.p, w.m]) {
      const view = await getContractVisibleTo(db(), contractId, party.toUpperCase());
      expect(view.partyId).toBe(party);
      expect(view.clauses.map((c) => c.content)).toEqual(full.items.map((i) => i.content));
      expect(Object.keys(view).sort()).toEqual(['clauses', 'contractId', 'parties', 'partyId', 'projectId']);
      for (const clause of view.clauses) {
        expect(Object.keys(clause).sort()).toEqual(['approverPartyIds', 'between', 'content', 'itemKey', 'layer', 'shape', 'subjectPartyId', 'value']);
      }
    }
  });

  it('a non-party, and an unknown contract, get not found, never an empty record', async () => {
    const w = await world();
    const { contractId } = await finalize(w);
    expect(await failure(() => getContractVisibleTo(db(), contractId, randomUUID()))).toEqual({ name: ContractNotFoundError.name });
    expect(await failure(() => getContractVisibleTo(db(), randomUUID(), w.p))).toEqual({ name: ContractNotFoundError.name });
  });

  it('hides another pair\'s money clause (a three-party record, in memory)', () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()].sort();
    const ac = randomUUID();
    const bc = randomUUID();
    const base = sampleContract();
    const full: FullContract = {
      ...base,
      parties: [a!, b!, c!].map((id) => ({ partyId: id, accountId: randomUUID(), onSite: true })),
      pairs: [
        { id: ac, partyIds: [a!, c!] },
        { id: bc, partyIds: [b!, c!] },
      ],
      items: [
        { ...base.items[0]!, itemId: randomUUID(), position: 1, layer: 'shared', pairwiseAgreementId: null, itemKey: null, content: 'shared', value: null },
        { ...base.items[0]!, itemId: randomUUID(), position: 2, layer: 'money', pairwiseAgreementId: ac, itemKey: 'fee', content: 'fee A–C', value: 'AC-SECRET' },
        { ...base.items[0]!, itemId: randomUUID(), position: 3, layer: 'money', pairwiseAgreementId: bc, itemKey: 'fee', content: 'fee B–C', value: 'BC-SECRET' },
      ],
    };
    const seen = (party: string) => contractViewFor(full, party).clauses.map((cl) => cl.value ?? cl.content);
    expect(seen(a!)).toEqual(['shared', 'AC-SECRET']);
    expect(seen(b!)).toEqual(['shared', 'BC-SECRET']);
    expect(seen(c!)).toEqual(['shared', 'AC-SECRET', 'BC-SECRET']);
    expect(JSON.stringify(contractViewFor(full, a!))).not.toContain('BC-SECRET');
    expect(renderContractHtml(contractViewFor(full, a!))).not.toContain('BC-SECRET');
  });

  it('the view and the rendering contain no signature time, IP, user agent, hash, fingerprint, account or position', async () => {
    const w = await world();
    const { contractId } = await finalize(w, { p: { evidence: { ip: '198.51.100.23', userAgent: 'UA-EVIDENCE-MARKER' } } });
    const full = await getContract(db(), contractId);
    const evidence = [
      full.contract.fingerprint,
      w.pAccount,
      w.mAccount,
      '198.51.100.23',
      'UA-EVIDENCE-MARKER',
      ...full.signatures.flatMap((s) => [s.prevHash, s.recordHash, s.signedAt.toISOString(), String(s.signedAt.getTime())]),
    ];
    for (const party of [w.p, w.m]) {
      const view = await getContractVisibleTo(db(), contractId, party);
      const text = `${JSON.stringify(view)}\n${renderContractHtml(view)}`;
      for (const value of evidence) expect({ party, value, found: text.includes(value) }).toEqual({ party, value, found: false });
      expect(JSON.stringify(view)).not.toMatch(/"position"|signedAt|recordHash|prevHash|accountId|fingerprint/);
    }
  });

  it('the rendering is self-contained, labelled a proposal, escapes stored text, and holds every visible clause', async () => {
    const w = await world({ content: '[s11] <script>alert(1)</script> & "quotes"' });
    const { contractId } = await finalize(w);
    const view = await getContractVisibleTo(db(), contractId, w.m);
    const html = renderContractHtml(view);
    expect(html).toContain("Proposal rendering for Cory's reaction — synthetic.");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script|<link|<img|<iframe|src=|href=|https?:\/\//i);
    expect(html).toContain('[s11] &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
    const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    for (const clause of view.clauses) {
      expect(html).toContain(escape(clause.content));
      if (clause.value !== null) expect(html).toContain(escape(clause.value));
    }
    // No participant signing words.
    expect(html).not.toMatch(/I agree|\bsign here\b|legally binding/i);
  });
});

/** A small, internally consistent stored contract, for pure verification and view tests. */
function sampleContract(): FullContract {
  const [p, m] = [randomUUID(), randomUUID()].sort() as [string, string];
  const pair = randomUUID();
  const contractId = randomUUID();
  const briefId = randomUUID();
  const projectId = randomUUID();
  const parties = [
    { partyId: p, accountId: randomUUID(), onSite: true },
    { partyId: m, accountId: randomUUID(), onSite: true },
  ];
  const items = [
    { itemId: randomUUID(), position: 1, layer: 'universal' as const, pairwiseAgreementId: null, subjectPartyId: m, shape: 'declaration' as const, itemKey: null, content: 'safety', value: null, approverPartyIds: [p, m] },
    { itemId: randomUUID(), position: 2, layer: 'money' as const, pairwiseAgreementId: pair, subjectPartyId: null, shape: null, itemKey: 'fee' as const, content: 'fee', value: '400', approverPartyIds: [p, m] },
  ];
  const pairs = [{ id: pair, partyIds: [p, m] as [string, string] }];
  const snapshot: FingerprintSnapshot = {
    briefId,
    projectId,
    parties: parties.map((x) => ({ id: x.partyId, onSite: x.onSite })),
    pairs,
    items: items.map((i) => ({ ...i, id: i.itemId, approverIds: i.approverPartyIds })),
  };
  const fingerprint = briefFingerprint(snapshot);
  const signedAt = new Date(Date.UTC(2026, 9, 21, 12, 0, 0, 123));
  const first = { sequence: 1, partyId: p, accountId: parties[0]!.accountId, fingerprint, signedAt, ip: null, userAgent: null, prevHash: fingerprint };
  const firstHash = signatureRecordHash(contractId, first);
  const second = { sequence: 2, partyId: m, accountId: parties[1]!.accountId, fingerprint, signedAt, ip: null, userAgent: null, prevHash: firstHash };
  return {
    contract: { id: contractId, projectId, briefId, fingerprint },
    parties,
    items,
    signatures: [
      { ...first, recordHash: firstHash },
      { ...second, recordHash: signatureRecordHash(contractId, second) },
    ],
    pairs,
  };
}
