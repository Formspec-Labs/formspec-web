import type { ReviewerShare } from '../../ports/reviewer-session.ts';
import type {
  ReviewThread,
  ReviewThreadEvent,
} from '../../ports/review-thread-store.ts';

export interface StubTrustedReviewerState {
  readonly threads: Map<string, ReviewThread>;
  readonly shares: Map<string, ReviewerShare>;
  readonly capabilityTokens: Map<string, string>;
  nextShareId: number;
  nextEventId: number;
}

export function createStubTrustedReviewerState(): StubTrustedReviewerState {
  return {
    threads: new Map(),
    shares: new Map(),
    capabilityTokens: new Map(),
    nextShareId: 0,
    nextEventId: 0,
  };
}

export function sharesForThread(
  state: StubTrustedReviewerState,
  threadId: string,
): ReviewerShare[] {
  return Array.from(state.shares.values()).filter((share) => share.threadId === threadId);
}

export function eventsForThread(
  thread: ReviewThread,
): ReviewThreadEvent[] {
  return [...thread.events];
}
