import { defineReviewThreadStoreConformance } from '../../../src/adapter-conformance/index.ts';
import { stubReviewerSession } from '../../../src/adapters/stub/reviewer-session.ts';
import { stubReviewThreadStore } from '../../../src/adapters/stub/review-thread-store.ts';
import { createStubTrustedReviewerState } from '../../../src/adapters/stub/trusted-reviewer-state.ts';

defineReviewThreadStoreConformance('stub ReviewThreadStore conformance', () => {
  const state = createStubTrustedReviewerState();
  return {
    adapter: stubReviewThreadStore({ state }),
    reviewerSession: stubReviewerSession({ state }),
  };
});
