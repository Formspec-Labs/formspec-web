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
      if (!state.threads.has(args.threadId)) {
        throw new ReviewerSessionError(
          `Review thread ${args.threadId} does not exist`,
          'capability-invalid',
        );
      }
      if (args.respondentSessionToken && !isRespondentSessionToken(args.respondentSessionToken)) {
        throw new ReviewerSessionError('mintShare requires a respondent session token', 'policy-forbidden');
      }
      state.nextShareId += 1;
      const shareId = `stub-share-${state.nextShareId.toString().padStart(6, '0')}`;
      const capabilityToken: CapabilityToken = `capability:${shareId}:${state.nextShareId}`;
      const capabilityUrl = `${baseUrl.replace(/\/+$/, '')}/r/${encodeURIComponent(args.threadId)}/${encodeURIComponent(capabilityToken)}`;
      const share: ReviewerShare = {
        shareId,
        threadId: args.threadId,
        grantedScope: boundedScope(args.requestedScope),
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
      const token = capabilityTokenFromUrl(args.capabilityUrl);
      const shareId = state.capabilityTokens.get(token);
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
      if (share.expiresAt && Date.parse(share.expiresAt) <= Date.now()) {
        throw new ReviewerSessionError(`Reviewer share ${shareId} has expired`, 'capability-expired');
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
        sessionToken: token,
        audienceHint: share.audienceHint,
        expiresAt: share.expiresAt,
      };
    },

    async revoke(args) {
      if (args.respondentSessionToken && !isRespondentSessionToken(args.respondentSessionToken)) {
        throw new ReviewerSessionError('revoke requires a respondent session token', 'policy-forbidden');
      }
      const share = state.shares.get(args.shareId);
      if (!share) {
        throw new ReviewerSessionError(`Reviewer share ${args.shareId} was not found`, 'share-not-found');
      }
      state.shares.set(args.shareId, {
        ...share,
        revokedAt: share.revokedAt ?? new Date().toISOString(),
        revokedReason: args.reason,
      });
    },

    async listShares(args) {
      if (args.respondentSessionToken && !isRespondentSessionToken(args.respondentSessionToken)) {
        throw new ReviewerSessionError('listShares requires a respondent session token', 'policy-forbidden');
      }
      return sharesForThread(state, args.threadId).map((share) => ({ ...share }));
    },
  };

  return markDemoStubAdapter(adapter, {
    featureKey: 'trustedReviewer',
    reason: 'in-memory trusted-reviewer capability URLs; demo only — shares lost on reload',
  });
}

function capabilityTokenFromUrl(value: string): string {
  try {
    const parsed = new URL(value, 'https://review.example.test');
    const last = parsed.pathname.split('/').filter(Boolean).at(-1);
    if (last) return decodeURIComponent(last);
  } catch {
    // Fall through to plain-token handling.
  }
  return value;
}

function boundedScope(scope: ReviewerScope): ReviewerScope {
  return scope;
}
