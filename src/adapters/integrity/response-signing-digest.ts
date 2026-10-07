import { canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';

/** Signing-profile consistency only; this does not verify a signature. */
export async function responseSigningDigest(response: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure signing digest computation is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', canonicalResponseSignedPayloadBytes(response));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
