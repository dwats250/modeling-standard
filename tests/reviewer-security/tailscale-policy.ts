import { readFileSync } from 'node:fs';

/**
 * An offline, structural check of the reviewer's replacement tailnet policy.
 * It is not Tailscale's evaluator: it proves the file has the intended shape,
 * and says nothing about what a real tailnet would do. Tailscale's own
 * validation runs its `tests` at activation (TAILSCALE-PACKET.md).
 *
 *   node tests/reviewer-security/tailscale-policy.ts <file> [--filled]
 *
 * `--filled` is for a completed copy: no placeholder may remain and the Asher
 * alias must be a single tailnet address. It reads the file and the network
 * is never touched.
 */

const OPERATORS = 'group:ms-operators';
const REVIEWERS = 'group:ms-reviewers';
const REVIEWER_DST = 'asher';
const REVIEWER_PORT = 'tcp:8443';
/** Sources that would quietly include the reviewer, or everyone. */
const BROAD_SOURCES = new Set(['*', 'autogroup:member', 'autogroup:shared', 'autogroup:danger-all']);
const REQUIRED_REVIEWER_DENIES = ['asher:22', 'asher:80', 'asher:443', 'asher:3141', 'asher:5432', 'asher:5471'];
const REQUIRED_OPERATOR_ACCEPTS = ['asher:22', 'asher:80'];

interface Grant { src?: string[]; dst?: string[]; ip?: string[]; app?: unknown }
interface SshRule { src?: string[]; dst?: string[] }
interface PolicyTest { src?: string; proto?: string; accept?: string[]; deny?: string[] }
interface Policy {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  acls?: unknown[];
  grants?: Grant[];
  ssh?: SshRule[];
  nodeAttrs?: { target?: string[]; attr?: unknown[] }[];
  tests?: PolicyTest[];
  sshTests?: { src?: string; deny?: string[] }[];
}

/** HuJSON to JSON: comments and trailing commas removed, strings left alone. */
export function parseHuJson(text: string): unknown {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === '"') {
      const start = i;
      for (i += 1; i < text.length && text[i] !== '"'; i += text[i] === '\\' ? 2 : 1);
      out += text.slice(start, i + 1);
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i === 0) throw new Error('unterminated comment');
    } else if (c === ',') {
      let j = i + 1;
      for (;;) {
        while (/\s/.test(text[j] ?? '')) j += 1;
        if (text[j] === '/' && text[j + 1] === '/') {
          while (j < text.length && text[j] !== '\n') j += 1;
        } else if (text[j] === '/' && text[j + 1] === '*') {
          j = text.indexOf('*/', j + 2) + 2;
        } else break;
      }
      if (text[j] !== '}' && text[j] !== ']') out += c;
    } else {
      out += c;
    }
  }
  return JSON.parse(out);
}

/** Everything wrong with this policy's shape. Empty means the shape is as intended, not that it is correct. */
export function policyProblems(text: string, options: { filled: boolean }): string[] {
  let policy: Policy;
  try {
    policy = parseHuJson(text) as Policy;
  } catch {
    return ['the file is not valid HuJSON'];
  }
  const problems: string[] = [];
  if ((policy.acls ?? []).length > 0) problems.push('acls: must be absent; a legacy rule would combine with the grants');

  const reviewers = policy.groups?.[REVIEWERS] ?? [];
  const operators = policy.groups?.[OPERATORS] ?? [];
  if (reviewers.length !== 1) problems.push(`groups: ${REVIEWERS} must have exactly one member`);
  if (operators.length !== 1) problems.push(`groups: ${OPERATORS} must have exactly one member`);
  if (reviewers.some((member) => operators.includes(member))) problems.push('groups: the reviewer must not also be an operator');

  const grants = policy.grants ?? [];
  for (const grant of grants) {
    const label = JSON.stringify(grant);
    if ((grant.src ?? []).some((src) => BROAD_SOURCES.has(src))) problems.push(`grants: a broad source would include the reviewer: ${label}`);
    if ((grant.dst ?? []).includes('*')) problems.push(`grants: a wildcard destination names every device, including the reviewer's: ${label}`);
    if ((grant.dst ?? []).includes('autogroup:internet') && (grant.src ?? []).includes(REVIEWERS)) problems.push('grants: the reviewer must not reach exit nodes');
  }
  const reviewerGrants = grants.filter((grant) => (grant.src ?? []).includes(REVIEWERS));
  const only = reviewerGrants[0];
  const exact =
    reviewerGrants.length === 1 &&
    only !== undefined &&
    only.src?.length === 1 &&
    only.dst?.length === 1 && only.dst[0] === REVIEWER_DST &&
    only.ip?.length === 1 && only.ip[0] === REVIEWER_PORT &&
    only.app === undefined;
  if (!exact) problems.push(`grants: the reviewer must have exactly one grant: ${REVIEWER_DST}, ${REVIEWER_PORT}, nothing else`);

  for (const rule of policy.ssh ?? []) {
    if ((rule.src ?? []).some((src) => src === REVIEWERS || BROAD_SOURCES.has(src))) problems.push(`ssh: a rule reaches the reviewer: ${JSON.stringify(rule)}`);
  }
  if ((policy.nodeAttrs ?? []).some((attr) => (attr.attr ?? []).includes('funnel'))) problems.push('nodeAttrs: funnel must not be granted');

  const tests = policy.tests ?? [];
  const reviewerTests = tests.filter((test) => test.src === REVIEWERS);
  const denies = reviewerTests.flatMap((test) => test.deny ?? []);
  if (!reviewerTests.some((test) => (test.accept ?? []).includes('asher:8443'))) problems.push('tests: must accept the reviewer on asher:8443');
  for (const port of REQUIRED_REVIEWER_DENIES) if (!denies.includes(port)) problems.push(`tests: must deny the reviewer ${port}`);
  const accepts = tests.filter((test) => test.src === OPERATORS).flatMap((test) => test.accept ?? []);
  for (const port of REQUIRED_OPERATOR_ACCEPTS) if (!accepts.includes(port)) problems.push(`tests: must accept the operator on ${port}`);
  if (!(policy.sshTests ?? []).some((test) => test.src === REVIEWERS && (test.deny ?? []).length > 0)) problems.push('sshTests: must deny the reviewer');

  if (options.filled) {
    if (/__[A-Z_]+__/.test(text.replace(/^\s*\/\/.*$/gm, ''))) problems.push('placeholders: a __NAME__ value is still unfilled');
    if (!/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(policy.hosts?.[REVIEWER_DST] ?? '')) problems.push('hosts: asher must be one tailnet address');
  }
  return problems;
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('usage: node tests/reviewer-security/tailscale-policy.ts <file> [--filled]\n');
    process.exit(2);
  }
  const problems = policyProblems(readFileSync(file, 'utf8'), { filled: process.argv.includes('--filled') });
  process.stdout.write(problems.length === 0 ? 'Shape as intended. This is not Tailscale validation.\n' : `${problems.map((problem) => `- ${problem}`).join('\n')}\n`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}
