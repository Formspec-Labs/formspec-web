import { describe, expect, it } from 'vitest';
import { stubOfflineSubmitQueue } from '../../src/adapters/stub/offline-submit-queue.ts';
import {
  createRecordingSubmitTransport,
} from '../../src/adapter-conformance/conformance.ts';
import { sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import { generateIdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { DEMO_STUB_ADAPTER, isDemoStubAdapter } from '../../src/policy/sentinel.ts';

describe('stubOfflineSubmitQueue', () => {
  it('carries the demo-stub provenance marker pinned to "offlineSubmit"', () => {
    const recording = createRecordingSubmitTransport();
    const adapter = stubOfflineSubmitQueue({ transport: recording.transport });
    expect(isDemoStubAdapter(adapter)).toBe(true);
    if (!isDemoStubAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[DEMO_STUB_ADAPTER].featureKey).toBe('offlineSubmit');
  });

  it('_internalPendingCount tracks enqueue / replay state transitions', async () => {
    const recording = createRecordingSubmitTransport();
    const adapter = stubOfflineSubmitQueue({ transport: recording.transport });
    expect(adapter._internalPendingCount()).toBe(0);
    await adapter.enqueue(sampleIntakeHandoff, generateIdempotencyKey());
    expect(adapter._internalPendingCount()).toBe(1);
    await adapter.enqueue(sampleIntakeHandoff, generateIdempotencyKey());
    expect(adapter._internalPendingCount()).toBe(2);
    await adapter.replay();
    expect(adapter._internalPendingCount()).toBe(0);
  });

  it('uses the injected clock for enqueuedAt', async () => {
    const recording = createRecordingSubmitTransport();
    const fixed = new Date('2026-05-24T12:34:56.789Z');
    const adapter = stubOfflineSubmitQueue({
      transport: recording.transport,
      now: () => fixed,
    });
    const queued = await adapter.enqueue(sampleIntakeHandoff, generateIdempotencyKey());
    expect(queued.enqueuedAt).toBe(fixed.toISOString());
  });

  it('preserves the same enqueuedAt on a duplicate-key enqueue (first-wins)', async () => {
    const recording = createRecordingSubmitTransport();
    let tick = 0;
    const adapter = stubOfflineSubmitQueue({
      transport: recording.transport,
      now: () => new Date(Date.UTC(2026, 4, 24, 0, 0, tick++)),
    });
    const key = generateIdempotencyKey();
    const first = await adapter.enqueue(sampleIntakeHandoff, key);
    const second = await adapter.enqueue(sampleIntakeHandoff, key);
    expect(second.enqueuedAt).toBe(first.enqueuedAt);
  });
});
