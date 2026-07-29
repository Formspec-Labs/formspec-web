import { describe, expect, it, vi } from 'vitest';
import {
  IntegritySurfaceBundleVerifier,
} from '../../../src/adapters/integrity/surface-bundle-verifier.ts';
import { SurfaceBundleVerifierError } from '../../../src/ports/surface-bundle-verifier.ts';
import {
  createVerifierCase,
  snapshotFrom,
} from '../../adapter-conformance/surface-bundle-verifier/fixtures.ts';

describe('IntegritySurfaceBundleVerifier release boundary', () => {
  it('does not advance monotonic state until the host explicitly commits', async () => {
    const fixture = await createVerifierCase('authorized-current');
    const result = await fixture.adapter.verify(fixture.snapshot);

    expect(result.status).toBe('verified');
    expect(fixture.store.commitCalls).toBe(0);
    if (result.status !== 'verified') return;

    const commit = await fixture.adapter.commitRelease({
      snapshot: fixture.snapshot,
      precondition: result.releasePrecondition,
      hostValidation: { status: 'passed' },
    });
    expect(commit).toMatchObject({
      status: 'committed',
      releaseCommit: 'committed',
      snapshotIdentity: fixture.snapshot.identity,
    });
    expect(fixture.store.commitCalls).toBe(1);
    expect(fixture.store.state?.sequence).toBe(42);
  });

  it('rejects a replacement snapshot at final release commit', async () => {
    const fixture = await createVerifierCase('authorized-current');
    const result = await fixture.adapter.verify(fixture.snapshot);
    expect(result.status).toBe('verified');
    if (result.status !== 'verified') return;

    const changed = fixture.snapshot.copyBytes();
    changed[0] = changed[0] ^ 0x01;
    const replacement = await snapshotFrom(changed, 'memory:replacement');

    await expect(
      fixture.adapter.commitRelease({
        snapshot: replacement,
        precondition: result.releasePrecondition,
        hostValidation: { status: 'passed' },
      }),
    ).rejects.toMatchObject({
      name: SurfaceBundleVerifierError.name,
      code: 'invalid-snapshot',
    });
    expect(fixture.store.commitCalls).toBe(0);
  });

  it('ignores an attempted runtime verifier override and uses the configured key resolver', async () => {
    const bypassAttempt = {
      verify: vi.fn(async () => {
        throw new Error('A caller-supplied verifier must never run.');
      }),
    };
    const fixture = await createVerifierCase(
      'authorized-current',
      (config) => {
        // JavaScript callers can supply extra object keys even when TypeScript
        // does not expose them. The adapter must ignore this one at runtime.
        const attemptedOverride = { ...config, verifier: bypassAttempt };
        return new IntegritySurfaceBundleVerifier(attemptedOverride);
      },
    );

    const result = await fixture.adapter.verify(fixture.snapshot);

    expect(result.status).toBe('verified');
    expect(bypassAttempt.verify).not.toHaveBeenCalled();
  });
});
