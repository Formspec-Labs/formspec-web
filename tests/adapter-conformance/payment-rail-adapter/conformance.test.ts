// L-3: thin wrapper by design — the executable conformance contract lives
// in `definePaymentRailAdapterConformance` (the shared suite that every
// PaymentRailAdapter adopter MUST run against their implementation, per
// `src/ports/payment-rail-adapter.ts` §Conformance contract).
import { stubPaymentRailAdapter } from '../../../src/adapters/stub/payment-rail-adapter.ts';
import { definePaymentRailAdapterConformance } from '../_framework/conformance.ts';

definePaymentRailAdapterConformance('stub PaymentRailAdapter conformance', () => {
  const adapter = stubPaymentRailAdapter();
  return { adapter };
});
