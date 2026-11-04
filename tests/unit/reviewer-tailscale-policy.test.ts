import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHuJson, policyProblems } from '../reviewer-security/tailscale-policy.ts';

/**
 * The replacement policy's shape, offline. Nothing here reaches a tailnet, and
 * passing says nothing about what Tailscale's evaluator would do with it.
 */

const TEMPLATE = readFileSync(resolve('docs/engineering/reviewer-access/tailscale-policy.replacement.hujson'), 'utf8');

interface Grant { src: string[]; dst: string[]; ip: string[]; app?: unknown }
interface Mutable {
  groups: Record<string, string[]>;
  hosts: Record<string, string>;
  grants: Grant[];
  ssh: { action: string; src: string[]; dst: string[]; users: string[] }[];
  tests?: { src: string; accept?: string[]; deny?: string[] }[];
  sshTests?: unknown[];
  acls?: unknown[];
  nodeAttrs?: unknown[];
}
const mutated = (change: (policy: Mutable) => void): string => {
  const policy = parseHuJson(TEMPLATE) as Mutable;
  change(policy);
  return JSON.stringify(policy);
};
const problems = (text: string) => policyProblems(text, { filled: false }).join('\n');
const CORY = '__CORY_IDENTITY__';
const REVIEWER_IDENTITY = 'reviewer@example.invalid';
const fill = (asher = '100.64.0.7') =>
  TEMPLATE.replaceAll('__DUSTIN_IDENTITY__', 'operator@example.invalid')
    .replaceAll(CORY, REVIEWER_IDENTITY)
    .replaceAll('__ASHER_TAILNET_IP__', asher)
    .replaceAll('__ANOTHER_TAILNET_DEVICE_IP__', '100.64.0.9')
    .replaceAll('__ASHER_LOGIN_USER__', 'operator');

describe('the reviewer replacement policy', () => {
  it('has the intended shape, and is not yet usable', () => {
    expect(policyProblems(TEMPLATE, { filled: false })).toEqual([]);
    const filled = policyProblems(TEMPLATE, { filled: true, reviewer: REVIEWER_IDENTITY }).join('\n');
    expect(filled).toMatch(/placeholders/);
    expect(filled).toMatch(/hosts: asher/);
  });

  it('names no person: identities and addresses are placeholders', () => {
    const policy = parseHuJson(TEMPLATE) as Mutable;
    expect(policy.groups).toEqual({ 'group:ms-operators': ['__DUSTIN_IDENTITY__'] });
    expect(policy.grants.filter((g) => g.src.includes(CORY))).toEqual([{ src: [CORY], dst: ['asher'], ip: ['tcp:8443'] }]);
    expect(TEMPLATE).not.toContain('group:ms-reviewers');
    expect(policy.hosts.asher).toBe('__ASHER_TAILNET_IP__');
  });

  it('refuses a wildcard left in, or added beside the narrow grant', () => {
    expect(problems(mutated((p) => p.grants.push({ src: ['*'], dst: ['*'], ip: ['*'] })))).toMatch(/broad source/);
    expect(problems(mutated((p) => p.grants.push({ src: ['autogroup:member'], dst: ['asher'], ip: ['*'] })))).toMatch(/broad source/);
    expect(problems(mutated((p) => (p.acls = [{ action: 'accept', src: ['*'], dst: ['*:*'] }])))).toMatch(/acls/);
    expect(problems(mutated((p) => (p.grants[0]!.dst = ['*'])))).toMatch(/wildcard destination/);
  });

  it('refuses any widening of the reviewer', () => {
    const reviewer = (p: Mutable): Grant => p.grants.find((g) => g.src.includes(CORY))!;
    for (const change of [
      (p: Mutable) => (reviewer(p).ip = ['tcp:8443', 'tcp:22']),
      (p: Mutable) => (reviewer(p).ip = ['*']),
      (p: Mutable) => (reviewer(p).ip = ['8443']),
      (p: Mutable) => (reviewer(p).dst = ['asher', 'other']),
      (p: Mutable) => (reviewer(p).src = [CORY, 'group:ms-operators']),
      (p: Mutable) => (reviewer(p).app = { 'example.com/cap': [{}] }),
      (p: Mutable) => p.grants.push({ src: [CORY], dst: ['asher'], ip: ['tcp:80'] }),
      (p: Mutable) => (reviewer(p).src = ['group:ms-reviewers']),
      (p: Mutable) => p.grants.splice(p.grants.indexOf(reviewer(p)), 1),
    ]) {
      expect(problems(mutated(change))).toMatch(/exactly one grant/);
    }
    expect(problems(mutated((p) => (p.groups['group:ms-reviewers'] = [CORY])))).toMatch(/must not be in any group/);
    expect(problems(mutated((p) => p.groups['group:ms-operators']!.push(CORY)))).toMatch(/must not be in any group/);
  });

  it('refuses Funnel and reviewer SSH', () => {
    expect(problems(mutated((p) => (p.nodeAttrs = [{ target: ['autogroup:member'], attr: ['funnel'] }])))).toMatch(/funnel/);
    expect(problems(mutated((p) => p.ssh.push({ action: 'accept', src: [CORY], dst: ['autogroup:self'], users: ['root'] })))).toMatch(/ssh:/);
    expect(problems(mutated((p) => p.ssh.push({ action: 'accept', src: ['autogroup:member'], dst: ['autogroup:self'], users: ['root'] })))).toMatch(/ssh:/);
  });

  it('refuses a policy that stops testing what it promises', () => {
    expect(problems(mutated((p) => delete p.tests))).toMatch(/must accept the reviewer/);
    expect(problems(mutated((p) => (p.tests![0]!.deny = p.tests![0]!.deny!.filter((d) => d !== 'asher:22'))))).toMatch(/must deny the reviewer asher:22/);
    expect(problems(mutated((p) => p.tests!.pop()))).toMatch(/must accept the operator on asher:80/);
    expect(problems(mutated((p) => delete p.sshTests))).toMatch(/sshTests/);
  });

  it('accepts a complete copy, and refuses one with a range for Asher', () => {
    expect(policyProblems(fill(), { filled: true, reviewer: REVIEWER_IDENTITY })).toEqual([]);
    for (const wide of ['100.64.0.0/10', '*', '192.168.1.1']) expect(policyProblems(fill(wide), { filled: true, reviewer: REVIEWER_IDENTITY }).join('\n')).toMatch(/hosts: asher/);
  });

  it('a complete copy is checked against one exact identity, named by whoever fills it', () => {
    expect(policyProblems(fill(), { filled: true }).join('\n')).toMatch(/--reviewer must name one exact identity/);
    for (const selector of ['group:ms-reviewers', 'autogroup:shared', 'autogroup:member', 'tag:reviewer', '*', 'reviewer', '']) {
      expect(policyProblems(fill(), { filled: true, reviewer: selector }).join('\n')).toMatch(/--reviewer must name one exact identity/);
    }
    // Not the identity the policy's grant names: nothing about it is checked, so it is refused.
    expect(policyProblems(fill(), { filled: true, reviewer: 'someone-else@example.invalid' }).join('\n')).toMatch(/exactly one grant/);
    const inAGroup = fill().replace('"group:ms-operators": [', '"group:other": ["reviewer@example.invalid"], "group:ms-operators": [');
    expect(policyProblems(inAGroup, { filled: true, reviewer: REVIEWER_IDENTITY }).join('\n')).toMatch(/must not be in any group/);
  });

  it('reads HuJSON without touching strings', () => {
    expect(parseHuJson('{ // c\n "a": "x//y", /* c */ "b": ["1",], }')).toEqual({ a: 'x//y', b: ['1'] });
    expect(policyProblems('{ not json', { filled: false })).toEqual(['the file is not valid HuJSON']);
  });
});
