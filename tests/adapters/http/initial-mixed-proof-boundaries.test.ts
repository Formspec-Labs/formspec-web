import { describe, expect, it, vi } from 'vitest';
import { HttpInitialMixedProofReader } from '../../../src/adapters/http/initial-mixed-proof-reader.ts';
import { verifyInitialImageObjectIntegrity } from '../../../src/adapters/http/initial-image-object-integrity.ts';
import type { InitialInstanceProof, InitialNativeRequest } from '../../../src/ports/initial-mixed-proof.ts';
import type { HttpJsonResponseWithBytes } from '../../../src/adapters/http/http-client.ts';

// Deliberately invalid wire values: guards must refuse before parsing or credentials.
const invalidHydration = {} as HttpJsonResponseWithBytes<unknown>;
const invalidRequest = {} as InitialNativeRequest;
const invalidImage = {} as Extract<InitialInstanceProof, { kind: 'image' }>;

describe('initial proof authority boundaries', () => {
  for (const outcome of ['resolved', 'rejected'] as const) {
    it(`refuses a ${outcome} async owner guard before acquiring credentials`, async () => {
      const token = vi.fn(() => 'current-owner');
      const fetch = vi.fn(() => { throw new Error('must not dispatch'); });
      const reader = new HttpInitialMixedProofReader({ baseUrl: 'https://source.test', accessToken: token,
        fetchImpl: fetch, tenantBinding: { kind: 'bound', scope: { tenant: 'tenant', workspace: 'workspace', environment: 'test', cell: 'cell' } },
        limits: { aggregateProofWireBytes: 50 * 1024 * 1024, wholeOperationMilliseconds: 60_000 }, monotonicNow: () => 100 });
      const assertCurrent = () => outcome === 'resolved' ? Promise.resolve() : Promise.reject(new Error('owner changed'));
      await expect(reader.readAll(invalidHydration, invalidRequest,
        { signal: new AbortController().signal, startedMonotonic: 100, assertCurrent })).rejects.toThrow('Current-context guard must be synchronous');
      expect(token).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it(`refuses a ${outcome} async image guard before parsing caller proof`, async () => {
      const assertCurrent = () => outcome === 'resolved' ? Promise.resolve() : Promise.reject(new Error('owner changed'));
      await expect(verifyInitialImageObjectIntegrity(invalidImage, assertCurrent)).rejects.toThrow('Current-context guard must be synchronous');
    });
  }

  it('refuses an expired whole-operation anchor before credentials', async () => {
    const token = vi.fn(() => 'current-owner');
    const fetch = vi.fn(() => { throw new Error('must not dispatch'); });
    const reader = new HttpInitialMixedProofReader({ baseUrl: 'https://source.test', accessToken: token,
      fetchImpl: fetch, tenantBinding: { kind: 'bound', scope: { tenant: 'tenant', workspace: 'workspace', environment: 'test', cell: 'cell' } },
      limits: { aggregateProofWireBytes: 50 * 1024 * 1024, wholeOperationMilliseconds: 60_000 }, monotonicNow: () => 60_100 });
    await expect(reader.readAll(invalidHydration, invalidRequest,
      { signal: new AbortController().signal, startedMonotonic: 100, assertCurrent: () => {} })).rejects.toThrow('whole deadline expired');
    expect(token).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
