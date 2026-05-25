import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import {
  ReviewerSessionError,
  type ReviewerSession,
} from '../../ports/reviewer-session.ts';

export function unavailableReviewerSession(
  message = 'Reviewer session adapter is not configured for this deployment.',
): ReviewerSession {
  const adapter: ReviewerSession = {
    async mintShare() {
      throw new ReviewerSessionError(message, 'unavailable');
    },
    async redeem() {
      throw new ReviewerSessionError(message, 'unavailable');
    },
    async revoke() {
      throw new ReviewerSessionError(message, 'unavailable');
    },
    async listShares() {
      throw new ReviewerSessionError(message, 'unavailable');
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'trustedReviewer',
    reason: message,
  });
}
