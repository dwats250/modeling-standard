/**
 * The few cookies the application reads and writes, parsed and serialized
 * here and nowhere else. Names are fixed; values are base64url (or empty, to
 * clear). Nothing here decides what a cookie means.
 *
 * One server setting, `secure` (the app is served over HTTPS), decides the
 * wire form of every cookie, both ways. Secure: each name carries the
 * `__Host-` prefix, so the browser accepts it only with `Secure`, `Path=/`
 * and no `Domain` from an HTTPS response, and a plain-HTTP site on the same
 * host name cannot set or shadow it; only prefixed names are read. Not secure
 * (the local and LAN demo): bare names, read and written as bare names.
 */

/** A cookie an operation asks the boundary to set (or, with `maxAge: 0`, clear). */
export interface ResponseCookie {
  readonly name: string;
  /** base64url or empty. */
  readonly value: string;
  /** Seconds. 0 clears the cookie. */
  readonly maxAge: number;
  readonly path: string;
  readonly sameSite: 'Lax' | 'Strict';
}

const COOKIE_NAME = /^[a-z][a-z_]{0,31}$/;
const COOKIE_VALUE = /^[A-Za-z0-9_-]{0,128}$/;
const COOKIE_PATH = /^\/[A-Za-z0-9/_-]{0,64}$/;
const HOST_PREFIX = '__Host-';

/** The name a cookie has on the wire: `__Host-name` over HTTPS, `name` otherwise. */
export function wireCookieName(name: string, secure: boolean): string {
  return secure ? `${HOST_PREFIX}${name}` : name;
}

/** A cookie that clears `name` at `path`. */
export function clearCookie(name: string, path = '/', sameSite: ResponseCookie['sameSite'] = 'Lax'): ResponseCookie {
  return { name, value: '', maxAge: 0, path, sameSite };
}

/**
 * The `Set-Cookie` header value. Always `HttpOnly`; over HTTPS also `Secure`
 * and the `__Host-` name, which requires `Path=/`. Never a `Domain`. Throws
 * on anything outside the fixed shapes, so a malformed cookie is a 500, never
 * a header.
 */
export function serializeCookie(cookie: ResponseCookie, secure: boolean): string {
  if (!COOKIE_NAME.test(cookie.name)) throw new Error('invalid cookie name');
  if (!COOKIE_VALUE.test(cookie.value)) throw new Error('invalid cookie value');
  if (!COOKIE_PATH.test(cookie.path)) throw new Error('invalid cookie path');
  if (!Number.isInteger(cookie.maxAge) || cookie.maxAge < 0) throw new Error('invalid cookie max-age');
  if (secure && cookie.path !== '/') throw new Error('a __Host- cookie needs Path=/');
  const parts = [`${wireCookieName(cookie.name, secure)}=${cookie.value}`, `Max-Age=${cookie.maxAge}`, `Path=${cookie.path}`, 'HttpOnly', `SameSite=${cookie.sameSite}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Every value sent for `name`, in its wire form for `secure`, in a `Cookie`
 * header. Usually zero or one; a caller that needs exactly one treats more
 * than one as malformed. Over HTTPS a bare `name` is never read.
 */
export function cookieValues(header: string | undefined, name: string, secure: boolean): string[] {
  if (typeof header !== 'string') return [];
  name = wireCookieName(name, secure);
  const found: string[] = [];
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) found.push(part.slice(at + 1).trim());
  }
  return found;
}
