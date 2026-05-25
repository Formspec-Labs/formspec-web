import { stubScreenerDocumentSource } from '../../../src/adapters/stub/screener-document-source.ts';
import { defineScreenerDocumentSourceConformance } from '../_framework/conformance.ts';

defineScreenerDocumentSourceConformance('stub ScreenerDocumentSource conformance', () => {
  const adapter = stubScreenerDocumentSource();
  return {
    adapter,
    registerScreener: (document) => adapter.registerScreener(document),
  };
});
