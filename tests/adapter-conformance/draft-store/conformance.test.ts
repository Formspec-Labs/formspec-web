import { stubDraftStore } from '../../../src/adapters/stub/draft-store.ts';
import { defineDraftStoreConformance } from '../_framework/conformance.ts';

defineDraftStoreConformance('stub DraftStore conformance', () => ({
  adapter: stubDraftStore(),
}));
