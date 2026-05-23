import { stubStatusReader } from '../../../src/adapters/stub/status-reader.ts';
import { defineStatusReaderConformance } from '../_framework/conformance.ts';

defineStatusReaderConformance('stub StatusReader conformance', () => {
  const adapter = stubStatusReader();
  return {
    adapter,
    registerStatus(key, projection) {
      adapter.registerStatus(key, projection);
    },
  };
});
