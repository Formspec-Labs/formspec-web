import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import {
  ReviewerSessionError,
  type CapabilityToken,
  type ReviewerScope,
  type ReviewerSession,
  type ReviewerShare,
} from '../../ports/reviewer-session.ts';
import { isRespondentSessionToken } from '../../ports/reviewer-session.ts';
import {
  createStubTrustedReviewerState,
  respondentTokenAuthorizesThread,
  shareIsExpired,
  sharesForThread,
  type StubTrustedReviewerState,
} from './trusted-reviewer-state.ts';

export interface StubReviewerSession extends ReviewerSession {
  readonly _state: StubTrustedReviewerState;
}

export interface StubReviewerSessionOptions {
  readonly state?: StubTrustedReviewerState;
  readonly baseUrl?: string;
}

export function stubReviewerSession(
  options: StubReviewerSessionOptions = {},
): StubReviewerSession {
  const state = options.state ?? createStubTrustedReviewerState();
  const baseUrl = options.baseUrl ?? 'https://review.example.test';

  const adapter: StubReviewerSession = {
    _state: state,

    async mintShare(args) {
      const thread = state.threads.get(args.threadId);
      if (!thread) {
        throw new ReviewerSessionError(
          `Review thread ${args.threadId} does not exist`,
          'capability-invalid',
        );
      }
      if (!args.respondentSessionToken || !isRespondentSessionToken(args.respondentSessionToken)) {
        throw new ReviewerSessionError('mintShare requires a respondent session token', 'policy-forbidden');
      }
      if (!respondentTokenAuthorizesThread(args.respondentSessionToken, args.threadId)) {
        throw new ReviewerSessionError('respondent session token is not scoped to this thread', 'policy-forbidden');
      }
      const grantedScope = boundedScope(args.requestedScope, thread.policySnapshot.posture);
      if (!grantedScope) {
        throw new ReviewerSessionError('trusted reviewer sharing is forbidden for this thread', 'policy-forbidden');
      }
      if (thread.policySnapshot.reviewerAssuranceFloor) {
        throw new ReviewerSessionError(
          'This review requires reviewer identity verification, which is not available in the demo reviewer session.',
          'human-reviewer-unauthorized',
        );
      }
      state.nextShareId += 1;
      const shareId = `stub-share-${state.nextShareId.toString().padStart(6, '0')}`;
      const capabilityToken: CapabilityToken = `capability:${shareId}:${state.nextShareId}`;
      const capabilityUrl = `${baseUrl.replace(/\/+$/, '')}/r/${encodeURIComponent(args.threadId)}/${encodeURIComponent(capabilityToken)}`;
      const share: ReviewerShare = {
        shareId,
        threadId: args.threadId,
        grantedScope,
        capabilityUrl,
        audienceHint: args.audienceHint,
        createdAt: new Date().toISOString(),
        expiresAt: args.expiresAt,
        partyRef: args.partyRef,
      };
      state.shares.set(shareId, share);
      state.capabilityTokens.set(capabilityToken, shareId);
      return { shareId, capabilityUrl };
    },

    async redeem(args) {
      const capability = capabilityTokenFromUrl(args.capabilityUrl);
      const shareId = state.capabilityTokens.get(capability.token);
      if (!shareId) {
        throw new ReviewerSessionError('Reviewer capability URL is invalid', 'capability-invalid');
      }
      const share = state.shares.get(shareId);
      if (!share) {
        throw new ReviewerSessionError(`Reviewer share ${shareId} was not found`, 'share-not-found');
      }
      if (share.revokedAt) {
        throw new ReviewerSessionError(`Reviewer share ${shareId} has been revoked`, 'capability-revoked');
      }
      if (shareIsExpired(share)) {
        throw new ReviewerSessionError(`Reviewer share ${shareId} has expired`, 'capability-expired');
      }
      if (capability.threadId && capability.threadId !== share.threadId) {
        throw new ReviewerSessionError('Reviewer capability URL is not valid for this thread', 'capability-invalid');
      }
      const thread = state.threads.get(share.threadId);
      if (!thread) {
        throw new ReviewerSessionError(`Review thread ${share.threadId} does not exist`, 'capability-invalid');
      }
      return {
        shareId: share.shareId,
        threadId: share.threadId,
        grantedScope: share.grantedScope,
        threadPolicySnapshot: thread.policySnapshot,
        sessionToken: capability.token,
        audienceHint: share.audienceHint,
        expiresAt: share.expiresAt,
      };
    },

    async revoke(args) {
      if (!args.respondentSessionToken || !isRespondentSessionToken(args.respondentSessionToken)) {
        throw new ReviewerSessionError('revoke requires a respondent session token', 'policy-forbidden');
      }
      const share = state.shares.get(args.shareId);
      if (!share) {
        throw new ReviewerSessionError(`Reviewer share ${args.shareId} was not found`, 'share-not-found');
      }
      if (!respondentTokenAuthorizesThread(args.respondentSessionToken, share.threadId)) {
        throw new ReviewerSessionError('respondent session token is not scoped to this thread', 'policy-forbidden');
      }
      state.shares.set(args.shareId, {
        ...share,
        revokedAt: share.revokedAt ?? new Date().toISOString(),
        revokedReason: args.reason,
      });
    },

    async listShares(args) {
      if (!args.respondentSessionToken || !isRespondentSessionToken(args.respondentSessionToken)) {
        throw new ReviewerSessionError('listShares requires a respondent session token', 'policy-forbidden');
      }
      if (!respondentTokenAuthorizesThread(args.respondentSessionToken, args.threadId)) {
        throw new ReviewerSessionError('respondent session token is not scoped to this thread', 'policy-forbidden');
      }
      return sharesForThread(state, args.threadId).map((share) => ({ ...share }));
    },
  };

  return markDemoStubAdapter(adapter, {
    featureKey: 'trustedReviewer',
    reason: 'in-memory trusted-reviewer capability URLs; demo only — shares lost on reload',
  });
}

function capabilityTokenFromUrl(value: string): { token: string; threadId?: string } {
  try {
    const parsed = new URL(value, 'https://review.example.test');
    const segments = parsed.pathname.split('/').filter(Boolean);
    const token = segments.at(-1);
    const threadId = segments[0] === 'r' && segments.length >= 3
      ? decodeURIComponent(segments[1] ?? '')
      : undefined;
    if (token) return { token: decodeURIComponent(token), threadId };
  } catch {
    // Fall through to plain-token handling.
  }
  return { token: value };
}

function boundedScope(
  requestedScope: ReviewerScope,
  posture: 'forbidden' | 'comment-allowed' | 'suggest-allowed',
): ReviewerScope | undefined {
  if (posture === 'forbidden') return undefined;
  if (posture === 'comment-allowed' && requestedScope === 'view+comment+suggest') {
    return 'view+comment';
  }
  return requestedScope;
}
