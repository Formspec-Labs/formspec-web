import { stubPaymentRailAdapter } from '../../../src/adapters/stub/payment-rail-adapter.ts';
import { definePaymentRailAdapterConformance } from '../_framework/conformance.ts';

definePaymentRailAdapterConformance('stub PaymentRailAdapter conformance', () => {
  const adapter = stubPaymentRailAdapter();
  return { adapter };
});
