import type {
  IntakeHandoff,
  OfflineSubmitQueue,
  QueuedSubmit,
  ReplayOutcome,
} from '../../ports/offline-submit-queue.ts';
import type { SubmitTransport } from '../../ports/submit-transport.ts';
import { assertUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';
import { markDemoStubAdapter } from '../../policy/sentinel.ts';

export interface StubOfflineSubmitQueueOptions {
  /**
   * The transport `replay()` drains through. Wired at composition construction
   * time (FW-0064 cohort discipline): the queue + the transport are paired
   * here, not at call time.
   */
  readonly transport: SubmitTransport;
  /**
   * Optional clock override for the `enqueuedAt` timestamp. Tests inject a
   * fixed clock for deterministic assertions; production paths use
   * `Date.now()`. Demo-only adapter, so the seam stays narrow.
   */
  readonly now?: () => Date;
}

export interface StubOfflineSubmitQueue extends OfflineSubmitQueue {
  /**
   * Test-only accessor: returns the current pending count without going
   * through the async `pending()` method. Used by the conformance + stub
   * tests to assert state transitions synchronously.
   */
  _internalPendingCount(): number;
}

/**
 * In-memory OfflineSubmitQueue for demo + tests.
 *
 * - Pending entries live in a JS array; FIFO drain order.
 * - Idempotency: a second `enqueue` for the same key returns the previously-
 *   stored `QueuedSubmit` and ignores the second handoff value (first-wins).
 * - Replay calls the injected `SubmitTransport.submit(handoff, key)` per
 *   entry IN ORDER, preserving the original idempotency key on every call.
 *   Successful outcomes drop the entry; failed outcomes keep it pending.
 * - Marked DEMO_STUB_ADAPTER per ADR-0011; the coherence assertion forbids
 *   this adapter in production mode.
 *
 * Production reference adapters (FW-0082) replace the JS array with a
 * durable IndexedDB store + at-rest encryption; the port shape is unchanged.
 */
export function stubOfflineSubmitQueue(
  options: StubOfflineSubmitQueueOptions,
): StubOfflineSubmitQueue {
  const { transport, now = () => new Date() } = options;
  const order: string[] = [];
  const byKey = new Map<string, QueuedSubmit>();

  const adapter: StubOfflineSubmitQueue = {
    async enqueue(handoff: IntakeHandoff, idempotencyKey: string): Promise<QueuedSubmit> {
      assertUuidV7IdempotencyKey(idempotencyKey);
      const existing = byKey.get(idempotencyKey);
      if (existing) {
        return existing;
      }
      const queued: QueuedSubmit = {
        idempotencyKey,
        handoff,
        enqueuedAt: now().toISOString(),
      };
      byKey.set(idempotencyKey, queued);
      order.push(idempotencyKey);
      return queued;
    },

    async replay(): Promise<readonly ReplayOutcome[]> {
      const outcomes: ReplayOutcome[] = [];
      const snapshot = [...order];
      for (const key of snapshot) {
        const entry = byKey.get(key);
        if (!entry) continue;
        try {
          const confirmation = await transport.submit(entry.handoff, entry.idempotencyKey);
          outcomes.push({ kind: 'sent', idempotencyKey: key, confirmation });
          byKey.delete(key);
          const index = order.indexOf(key);
          if (index >= 0) order.splice(index, 1);
        } catch (error) {
          outcomes.push({ kind: 'failed', idempotencyKey: key, error });
        }
      }
      return outcomes;
    },

    async pending(): Promise<readonly QueuedSubmit[]> {
      return order
        .map((key) => byKey.get(key))
        .filter((entry): entry is QueuedSubmit => entry !== undefined);
    },

    _internalPendingCount() {
      return order.length;
    },
  };
  markDemoStubAdapter(adapter, {
    featureKey: 'offlineSubmit',
    reason: 'in-memory queue; pending entries lost on page reload',
  });
  return adapter;
}
