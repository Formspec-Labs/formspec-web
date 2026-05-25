/**
 * ReviewerSession port — FW-0113 / FW-0042 trusted reviewer slice.
 *
 * Owns capability-URL minting, redemption, revocation, and share listing.
 * Review content stays in ReviewThreadStore; do not collapse these ports.
 */
import type { ReviewThreadPolicySnapshot } from './review-thread-store.ts';

export type ReviewerScope = 'view' | 'view+comment' | 'view+comment+suggest';
export type CapabilityToken = string;
export type RespondentSessionToken = string;

export interface ReviewerShare {
  readonly shareId: string;
  readonly threadId: string;
  readonly grantedScope: ReviewerScope;
  readonly capabilityUrl: string;
  readonly audienceHint?: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly revokedReason?: string;
  readonly partyRef?: string;
}

export interface ReviewerSessionRedeemResult {
  readonly shareId: string;
  readonly threadId: string;
  readonly grantedScope: ReviewerScope;
  readonly threadPolicySnapshot: ReviewThreadPolicySnapshot;
  readonly sessionToken: CapabilityToken;
  readonly audienceHint?: string;
  readonly expiresAt?: string;
}

export type ReviewerSessionErrorCode =
  | 'unavailable'
  | 'capability-invalid'
  | 'capability-revoked'
  | 'capability-expired'
  | 'share-not-found'
  | 'human-reviewer-unauthorized'
  | 'policy-forbidden';

export class ReviewerSessionError extends Error {
  constructor(
    message: string,
    readonly code: ReviewerSessionErrorCode,
  ) {
    super(message);
    this.name = 'ReviewerSessionError';
  }
}

export interface ReviewerSession {
  mintShare(args: {
    threadId: string;
    requestedScope: ReviewerScope;
    expiresAt?: string;
    audienceHint?: string;
    respondentSessionToken?: RespondentSessionToken;
    partyRef?: string;
  }): Promise<{ shareId: string; capabilityUrl: string }>;

  redeem(args: { capabilityUrl: string }): Promise<ReviewerSessionRedeemResult>;

  revoke(args: {
    shareId: string;
    reason?: string;
    respondentSessionToken?: RespondentSessionToken;
  }): Promise<void>;

  listShares(args: {
    threadId: string;
    respondentSessionToken?: RespondentSessionToken;
  }): Promise<readonly ReviewerShare[]>;
}

export function respondentSessionToken(value: string): RespondentSessionToken {
  return `respondent:${value}`;
}

export function isRespondentSessionToken(value: string): value is RespondentSessionToken {
  return value.startsWith('respondent:');
}
