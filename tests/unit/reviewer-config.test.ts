import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config/config.ts';
import { newToken } from '../../src/infrastructure/tokens.ts';
import { loadReviewerConfig, parseExactHttpsOrigin } from '../../src/demo/reviewer.ts';

/**
 * Reviewer mode's configuration fails closed: every setting that matters is
 * exact and required, anything that would make it staging or production is
 * refused, and no message echoes a value.
 */

const KEY = newToken().token;
const DB = 'postgres://ms_runtime:Secret-42@127.0.0.1:5461/modeling_standard';

function good(): Record<string, string> {
  return { DATABASE_URL: DB, REVIEWER_PUBLIC_ORIGIN: 'https://review.example.ts.net:8444', REVIEWER_ACCESS_KEY: KEY, HOST: '127.0.0.1', PORT: '3140' };
}

function problemsOf(env: Record<string, string | undefined>): readonly string[] {
  try {
    loadReviewerConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems;
  }
  throw new Error('expected a ConfigError');
}

describe('reviewer configuration', () => {
  it('accepts a complete configuration: exact origin, authority as the browser sends it, default session length', () => {
    const config = loadReviewerConfig(good());
    expect(config.publicOrigin).toBe('https://review.example.ts.net:8444');
    expect(config.publicAuthority).toBe('review.example.ts.net:8444');
    expect(config.accessKey).toBe(KEY);
    expect(config.sessionSeconds).toBe(4 * 60 * 60);
    expect(config.app.port).toBe(3140);
    expect(config.app.google).toBeNull();
    // A default-port origin has no port in its authority, as the browser spells Host.
    expect(loadReviewerConfig({ ...good(), REVIEWER_PUBLIC_ORIGIN: 'https://review.example.ts.net' }).publicAuthority).toBe('review.example.ts.net');
    expect(loadReviewerConfig({ ...good(), REVIEWER_PUBLIC_ORIGIN: 'https://review.example.ts.net/' }).publicOrigin).toBe('https://review.example.ts.net');
    expect(loadReviewerConfig({ ...good(), REVIEWER_SESSION_SECONDS: '600' }).sessionSeconds).toBe(600);
  });

  it('refuses every origin that is not exactly one https origin', () => {
    const bad = [
      undefined,
      '',
      'http://review.example.ts.net:8444',
      'review.example.ts.net:8444',
      'https://review.example.ts.net:8444/demo',
      'https://review.example.ts.net:8444?x=1',
      'https://review.example.ts.net:8444#x',
      'https://u:p@review.example.ts.net:8444',
      'https://*.example.ts.net',
      'https://review.example.ts.net:8444, https://other.example',
      'https://review.example.ts.net:8444 ',
      'https://REVIEW.example.ts.net:08444',
      'https://review.example.ts.net:99999',
      'https://',
      'javascript:alert(1)',
      'ftp://review.example.ts.net',
    ];
    for (const origin of bad) {
      const problems = problemsOf({ ...good(), REVIEWER_PUBLIC_ORIGIN: origin });
      expect({ origin, problems: problems.map((p) => p.split(':')[0]) }).toEqual({ origin, problems: ['REVIEWER_PUBLIC_ORIGIN'] });
    }
    expect(parseExactHttpsOrigin('https://[::1]:8444')).toEqual({ publicOrigin: 'https://[::1]:8444', publicAuthority: '[::1]:8444' });
  });

  it('refuses a missing, short, padded, patterned or non-canonical access key, without echoing it', () => {
    for (const key of [undefined, '', 'reviewer', 'a'.repeat(43), `${KEY}=`, KEY.slice(0, 42), `${KEY}x`, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'abababababababababababababababababababababa']) {
      const problems = problemsOf({ ...good(), REVIEWER_ACCESS_KEY: key });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^REVIEWER_ACCESS_KEY: /);
      if (key) expect(problems[0]).not.toContain(key);
    }
  });

  it('refuses anything that would make it staging or production', () => {
    const expectOnly = (env: Record<string, string | undefined>, setting: string) => {
      const problems = problemsOf(env);
      expect(problems.map((p) => p.split(':')[0])).toEqual([setting]);
      expect(problems.join(' ')).not.toContain('Secret-42');
    };
    // A Google client needs PUBLIC_BASE_URL to be a valid app configuration at all; reviewer mode refuses both.
    const google = problemsOf({ ...good(), GOOGLE_CLIENT_ID: '1234-abcd.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GOCSPX-abcdefghijklmnop', PUBLIC_BASE_URL: 'https://review.example.ts.net:8444' });
    expect(google.map((p) => p.split(':')[0]).sort()).toEqual(['GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET', 'PUBLIC_BASE_URL']);
    expect(google.join(' ')).not.toContain('GOCSPX');
    expectOnly({ ...good(), PUBLIC_BASE_URL: 'https://review.example.ts.net:8444' }, 'PUBLIC_BASE_URL');
    expectOnly({ ...good(), MIGRATION_DATABASE_URL: 'postgres://ms_migrator:Secret-42@127.0.0.1:5461/modeling_standard' }, 'MIGRATION_DATABASE_URL');
    expectOnly({ ...good(), STAGING_OPERATOR_KEY: newToken().token }, 'STAGING_OPERATOR_KEY');
    expectOnly({ ...good(), DATABASE_URL: 'postgres://ms_runtime:Secret-42@127.0.0.1:5461/modeling_standard_staging' }, 'DATABASE_URL');
    expectOnly({ ...good(), HOST: '0.0.0.0' }, 'HOST');
    expectOnly({ ...good(), HOST: '100.64.0.7' }, 'HOST');
    for (const seconds of ['0', '59', '43201', '-5', '1e3', 'ten', '3600.5']) expectOnly({ ...good(), REVIEWER_SESSION_SECONDS: seconds }, 'REVIEWER_SESSION_SECONDS');
  });

  it('reports every problem at once and never a value', () => {
    const problems = problemsOf({ DATABASE_URL: 'not a url Secret-42', REVIEWER_PUBLIC_ORIGIN: 'http://x', REVIEWER_ACCESS_KEY: 'short-Secret-42' });
    expect(problems.map((p) => p.split(':')[0]).sort()).toEqual(['DATABASE_URL', 'REVIEWER_ACCESS_KEY', 'REVIEWER_PUBLIC_ORIGIN']);
    expect(problems.join(' ')).not.toContain('Secret-42');
  });
});
