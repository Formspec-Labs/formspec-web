import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { responseSigningDigest } from '../../../src/adapters/integrity/response-signing-digest.ts';

afterEach(() => vi.unstubAllGlobals());

describe('Response signing digest', () => {
  it('uses genuine SHA-256 over the maintained signing profile and omits all signatures', async () => {
    vi.stubGlobal('crypto', webcrypto);
    // Independent Node digest of the Rust-authoritative framed profile for this fixture.
    const { createHash } = await import('node:crypto');
    const expected = createHash('sha256').update('formspec.response.signed-payload.v1\0{"data":{"name":"Sample"},"id":"sample"}').digest('hex');
    const unsigned = { id: 'sample', data: { name: 'Sample' } };
    expect(await responseSigningDigest(unsigned)).toBe(expected);
    expect(await responseSigningDigest({ ...unsigned, authoredSignatures: [{ example: 'signature' }] })).toBe(expected);
    expect(await responseSigningDigest({ ...unsigned, data: { name: 'Changed' } })).not.toBe(expected);
  });

  it('refuses an unavailable secure digest without a fallback', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(responseSigningDigest({})).rejects.toThrow('Secure signing digest computation is unavailable.');
  });
});
