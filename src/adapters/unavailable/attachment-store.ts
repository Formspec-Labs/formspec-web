import {
  AttachmentUploadError,
  type AttachmentStore,
  type AttachmentUploadMetadata,
} from '../../ports/attachment-store.ts';
import { markUnavailableAdapter } from '../../policy/sentinel.ts';

export function unavailableAttachmentStore(
  message = 'File upload adapter is not configured for this deployment.',
): AttachmentStore {
  const adapter: AttachmentStore = {
    async upload(_blob: Blob, _metadata: AttachmentUploadMetadata) {
      throw new AttachmentUploadError(message, { code: 'unavailable' });
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'fileUpload',
    reason: message,
  });
}
