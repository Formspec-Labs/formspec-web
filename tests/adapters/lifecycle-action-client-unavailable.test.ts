import { describe, expect, it } from 'vitest';
import { unavailableLifecycleActionClient } from '../../src/adapters/unavailable/lifecycle-action-client.ts';
import { isUnavailableAdapter, UNAVAILABLE_ADAPTER } from '../../src/policy/sentinel.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';

describe('unavailableLifecycleActionClient', () => {
  it('carries the unavailable marker pinned to recordLifecycle', () => {
    const adapter = unavailableLifecycleActionClient();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('recordLifecycle');
  });

  it('throws with the adopter-facing message', async () => {
    const adapter = unavailableLifecycleActionClient('Wire a lifecycle adapter here.');
    await expect(
      adapter.readLifecycle({ caseUrn: 'urn:wos:case_demo_0001' }),
    ).rejects.toThrow('Wire a lifecycle adapter here.');
    await expect(
      adapter.submitWithdrawal(
        { caseUrn: 'urn:wos:case_demo_0001', reason: 'Changed intent.' },
        generateIdempotencyKey(),
      ),
    ).rejects.toThrow('Wire a lifecycle adapter here.');
  });
});
