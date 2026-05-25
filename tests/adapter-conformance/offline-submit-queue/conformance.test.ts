import { stubOfflineSubmitQueue } from '../../../src/adapters/stub/offline-submit-queue.ts';
import {
  createRecordingSubmitTransport,
  defineOfflineSubmitQueueConformance,
} from '../_framework/conformance.ts';

defineOfflineSubmitQueueConformance('stub OfflineSubmitQueue conformance', () => {
  const recordingTransport = createRecordingSubmitTransport();
  const adapter = stubOfflineSubmitQueue({ transport: recordingTransport.transport });
  return { adapter, recordingTransport };
});
