import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type { LifecycleActionClient } from '../../ports/lifecycle-action-client.ts';

export function unavailableLifecycleActionClient(
  message = 'Lifecycle action client is not configured for this deployment.',
): LifecycleActionClient {
  const adapter: LifecycleActionClient = {
    async readLifecycle() {
      throw new Error(message);
    },
    async submitCorrection() {
      throw new Error(message);
    },
    async submitWithdrawal() {
      throw new Error(message);
    },
    async submitDispute() {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'recordLifecycle',
    reason: message,
  });
}
