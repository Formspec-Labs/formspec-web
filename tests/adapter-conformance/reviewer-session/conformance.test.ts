import {
  defineReviewerSessionConformance,
  sampleReviewThreadPolicySnapshot,
} from '../../../src/adapter-conformance/index.ts';
import { stubReviewerSession } from '../../../src/adapters/stub/reviewer-session.ts';
import { stubReviewThreadStore } from '../../../src/adapters/stub/review-thread-store.ts';
import { createStubTrustedReviewerState } from '../../../src/adapters/stub/trusted-reviewer-state.ts';
import type { ReviewThreadPolicySnapshot } from '../../../src/ports/review-thread-store.ts';

defineReviewerSessionConformance('stub ReviewerSession conformance', () => {
  const state = createStubTrustedReviewerState();
  const adapter = stubReviewerSession({ state });
  const threadStore = stubReviewThreadStore({ state });
  return {
    adapter,
    async ensureThread(threadId: string, policySnapshot: ReviewThreadPolicySnapshot) {
      await threadStore.ensureThread({
        threadId,
        draftRef: { formUrl: 'https://forms.example.test/conformance' },
        policySnapshot: policySnapshot ?? sampleReviewThreadPolicySnapshot,
      });
    },
  };
});
