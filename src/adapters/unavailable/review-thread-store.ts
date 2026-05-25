import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import {
  ReviewThreadStoreError,
  type ReviewThreadStore,
} from '../../ports/review-thread-store.ts';

export function unavailableReviewThreadStore(
  message = 'Review thread store adapter is not configured for this deployment.',
): ReviewThreadStore {
  const adapter: ReviewThreadStore = {
    async ensureThread() {
      throw new ReviewThreadStoreError(message, 'unavailable');
    },
    async read() {
      throw new ReviewThreadStoreError(message, 'unavailable');
    },
    async appendEvent() {
      throw new ReviewThreadStoreError(message, 'unavailable');
    },
    async pinForReceipt() {
      throw new ReviewThreadStoreError(message, 'unavailable');
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'trustedReviewer',
    reason: message,
  });
}
