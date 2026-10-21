import { describe, expect, it } from 'vitest';
import { clearCookie, cookieValues, serializeCookie, wireCookieName } from '../../src/http/cookies.ts';

/**
 * One setting decides every cookie's wire form, both ways: over HTTPS the
 * `__Host-` name (Secure, Path=/, no Domain), otherwise the bare name.
 */

const cookie = { name: 'ms_session', value: 'abc_-1', maxAge: 60, path: '/', sameSite: 'Lax' } as const;

describe('cookie wire form', () => {
  it('over HTTPS: __Host- name, Secure, Path=/ and no Domain', () => {
    expect(wireCookieName('ms_session', true)).toBe('__Host-ms_session');
    expect(serializeCookie(cookie, true)).toBe('__Host-ms_session=abc_-1; Max-Age=60; Path=/; HttpOnly; SameSite=Lax; Secure');
    expect(serializeCookie(clearCookie('ms_signin'), true)).toBe('__Host-ms_signin=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure');
  });

  it('over HTTPS refuses any other path, which a __Host- cookie cannot have', () => {
    expect(() => serializeCookie({ ...cookie, path: '/sign-in' }, true)).toThrow('Path=/');
  });

  it('over plain HTTP: the bare name, without Secure', () => {
    expect(serializeCookie(cookie, false)).toBe('ms_session=abc_-1; Max-Age=60; Path=/; HttpOnly; SameSite=Lax');
  });

  it('reads only the wire name for the setting: never the other form, never a near spelling', () => {
    const header = 'ms_session=bare; __Host-ms_session=prefixed; __host-ms_session=lower; __Secure-ms_session=secure';
    expect(cookieValues(header, 'ms_session', true)).toEqual(['prefixed']);
    expect(cookieValues(header, 'ms_session', false)).toEqual(['bare']);
    expect(cookieValues('__Host-ms_session=a; __Host-ms_session=b', 'ms_session', true)).toEqual(['a', 'b']);
  });
});
