import { describe, expect, it } from 'vitest';
import { unavailableOfflineSubmitQueue } from '../../src/adapters/unavailable/offline-submit-queue.ts';
import { sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { isUnavailableAdapter, UNAVAILABLE_ADAPTER } from '../../src/policy/sentinel.ts';

describe('unavailableOfflineSubmitQueue', () => {
  it('carries the unavailable marker pinned to "offlineSubmit"', () => {
    const adapter = unavailableOfflineSubmitQueue();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('offlineSubmit');
  });

  it('enqueue throws with the adopter-facing message', async () => {
    const adapter = unavailableOfflineSubmitQueue();
    await expect(
      adapter.enqueue(sampleIntakeHandoff, generateIdempotencyKey()),
    ).rejects.toThrow(/not configured/i);
  });

  it('replay throws', async () => {
    const adapter = unavailableOfflineSubmitQueue();
    await expect(adapter.replay()).rejects.toThrow(/not configured/i);
  });

  it('pending throws', async () => {
    const adapter = unavailableOfflineSubmitQueue();
    await expect(adapter.pending()).rejects.toThrow(/not configured/i);
  });

  it('honors a custom adopter-supplied message', async () => {
    const adapter = unavailableOfflineSubmitQueue('Wire your IndexedDB queue here.');
    await expect(adapter.replay()).rejects.toThrow('Wire your IndexedDB queue here.');
  });
});
