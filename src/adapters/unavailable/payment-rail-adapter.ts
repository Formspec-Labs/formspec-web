import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type { PaymentRailAdapter } from '../../ports/payment-rail-adapter.ts';

export function unavailablePaymentRailAdapter(
  message = 'Payment rail adapter is not configured for this deployment.',
): PaymentRailAdapter {
  const adapter: PaymentRailAdapter = {
    async authorize() {
      throw new Error(message);
    },
    async capture() {
      throw new Error(message);
    },
    async voidAuthorization() {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'payment',
    reason: message,
  });
}
