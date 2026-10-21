import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * High-entropy bearer secrets (session tokens, sign-in state, nonces, PKCE
 * verifiers, browser-binding secrets): 32 bytes from the operating system's
 * CSPRNG, written as unpadded base64url (43 characters). Only a SHA-256
 * digest of the bytes is ever stored where a digest suffices. They are not
 * passwords, so they are not stretched. Only the canonical spelling is
 * accepted, so each secret has exactly one textual form.
 */

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface NewToken {
  readonly token: string;
  readonly digest: Buffer;
}

export function newToken(): NewToken {
  const bytes = randomBytes(TOKEN_BYTES);
  return { token: bytes.toString('base64url'), digest: digestBytes(bytes) };
}

/** The digest of a canonical token, or null for anything else. */
export function tokenDigest(token: unknown): Buffer | null {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== TOKEN_BYTES || bytes.toString('base64url') !== token) return null;
  return digestBytes(bytes);
}

/** SHA-256 of a UTF-8 string, for values that are not canonical tokens (an ID token's nonce claim). */
export function textDigest(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}

/** Constant-time equality of two digests. */
export function sameDigest(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function digestBytes(bytes: Buffer): Buffer {
  return createHash('sha256').update(bytes).digest();
}
