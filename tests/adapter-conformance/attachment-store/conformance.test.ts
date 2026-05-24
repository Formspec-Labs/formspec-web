import { stubAttachmentStore } from '../../../src/adapters/stub/attachment-store.ts';
import { defineAttachmentStoreConformance } from '../_framework/conformance.ts';

defineAttachmentStoreConformance('stub AttachmentStore conformance', () => ({
  adapter: stubAttachmentStore(),
}));
