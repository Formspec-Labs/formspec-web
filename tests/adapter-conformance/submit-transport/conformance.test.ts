import { stubSubmitTransport } from '../../../src/adapters/stub/submit-transport.ts';
import { defineSubmitTransportConformance } from '../_framework/conformance.ts';

defineSubmitTransportConformance('stub SubmitTransport conformance', () => ({
  adapter: stubSubmitTransport(),
}));
