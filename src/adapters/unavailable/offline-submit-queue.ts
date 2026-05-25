import type { OfflineSubmitQueue } from '../../ports/offline-submit-queue.ts';
import { markUnavailableAdapter } from '../../policy/sentinel.ts';

export function unavailableOfflineSubmitQueue(
  message = 'Offline submit queue adapter is not configured for this deployment.',
): OfflineSubmitQueue {
  const adapter: OfflineSubmitQueue = {
    async enqueue() {
      throw new Error(message);
    },
    async replay() {
      throw new Error(message);
    },
    async pending() {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'offlineSubmit',
    reason: message,
  });
}
