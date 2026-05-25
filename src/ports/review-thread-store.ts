/**
 * ReviewThreadStore port — FW-0113 / FW-0042 trusted reviewer slice.
 *
 * Persists the SC-6 review-thread sidecar outside the signed Response. The
 * append path carries a session token so adapters can cross-check reviewer vs
 * respondent authority before accepting an event.
 */
import type { CapabilityToken, RespondentSessionToken, ReviewerShare } from './reviewer-session.ts';

export type TrustedReviewerPosture = 'forbidden' | 'comment-allowed' | 'suggest-allowed';
export type ReviewerAssuranceFloor = 'L1' | 'L2' | 'L3' | 'L4';

export interface ReviewThreadPolicySnapshot {
  readonly posture: TrustedReviewerPosture;
  readonly allowedRoles?: readonly string[];
  readonly reviewerAssuranceFloor?: ReviewerAssuranceFloor;
  readonly maxActiveSharesPerDraft?: number;
  readonly defaultShareExpiresAtRule?: string;
  readonly respondentOnlyFieldPointers: readonly string[];
  readonly reviewerSessionBindingRef?: string;
  readonly reviewThreadStoreBindingRef?: string;
}

export interface ReviewThreadDraftRef {
  readonly formUrl: string;
  readonly formVersion?: string;
  readonly subjectRef?: string;
  readonly partyRef?: string;
}

export interface ReviewThreadFieldSnapshot {
  readonly fieldPointer: string;
  readonly fieldKey: string;
  readonly label: string;
  readonly respondentOnly: boolean;
  readonly value?: unknown;
  readonly valueHashAtSnapshot?: string;
}

export interface ReviewThreadDraftSnapshot {
  readonly capturedAt: string;
  readonly responseHash?: string;
  readonly fields: readonly ReviewThreadFieldSnapshot[];
}

export interface ReviewThread {
  readonly $formspecReviewThread: '1.0';
  readonly threadId: string;
  readonly draftRef: ReviewThreadDraftRef;
  readonly draftSnapshot?: ReviewThreadDraftSnapshot;
  readonly policySnapshot: ReviewThreadPolicySnapshot;
  readonly shares: readonly ReviewerShare[];
  readonly events: readonly ReviewThreadEvent[];
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export type ReviewThreadAuthor =
  | {
      readonly kind: 'respondent';
      readonly subjectRef?: string;
      readonly displayName?: string;
    }
  | {
      readonly kind: 'reviewer';
      readonly shareId: string;
      readonly displayName: string;
      readonly identityBindingRef?: string;
    };

export interface FieldAnchor {
  readonly fieldPointer: string;
  readonly valueHashAtAnchor?: string;
}

export type ReviewThreadEventPayload =
  | {
      readonly type: 'share-minted';
      readonly shareId: string;
      readonly audienceHint?: string;
    }
  | {
      readonly type: 'share-revoked';
      readonly shareId: string;
      readonly reason?: string;
    }
  | {
      readonly type: 'comment-added';
      readonly anchor: FieldAnchor;
      readonly body: string;
    }
  | {
      readonly type: 'comment-resolved';
      readonly eventId: string;
    }
  | {
      readonly type: 'suggestion-added';
      readonly anchor: FieldAnchor;
      readonly proposedValue: unknown;
    }
  | {
      readonly type: 'suggestion-accepted';
      readonly suggestionEventId: string;
      readonly appliedValue?: unknown;
    }
  | {
      readonly type: 'suggestion-declined';
      readonly suggestionEventId: string;
      readonly reason?: string;
    };

export interface ReviewThreadEvent {
  readonly eventId: string;
  readonly threadId: string;
  readonly occurredAt: string;
  readonly author: ReviewThreadAuthor;
  readonly payload: ReviewThreadEventPayload;
}

export type ReviewThreadStoreErrorCode =
  | 'unavailable'
  | 'thread-not-found'
  | 'session-role-mismatch'
  | 'scope-forbidden'
  | 'suggestion-forbidden'
  | 'respondent-only-field'
  | 'invalid-thread';

export class ReviewThreadStoreError extends Error {
  constructor(
    message: string,
    readonly code: ReviewThreadStoreErrorCode,
  ) {
    super(message);
    this.name = 'ReviewThreadStoreError';
  }
}

export interface ReviewThreadStore {
  /**
   * Creates the sidecar if absent and returns the existing thread otherwise.
   *
   * Assumption while SC-6 is still PROPOSAL-status: the web reference shell
   * needs a deterministic way to seed a thread before `mintShare()`. If SC-6
   * later ratifies a different create verb, this method is the only adjustment
   * point.
   */
  ensureThread(args: {
    threadId: string;
    draftRef: ReviewThreadDraftRef;
    draftSnapshot?: ReviewThreadDraftSnapshot;
    policySnapshot: ReviewThreadPolicySnapshot;
  }): Promise<ReviewThread>;

  read(args: {
    threadId: string;
    sessionToken: CapabilityToken | RespondentSessionToken;
  }): Promise<ReviewThread>;

  appendEvent(args: {
    threadId: string;
    sessionToken: CapabilityToken | RespondentSessionToken;
    author: ReviewThreadEvent['author'];
    payload: ReviewThreadEvent['payload'];
  }): Promise<ReviewThreadEvent>;

  pinForReceipt(args: {
    threadId: string;
    sessionToken: RespondentSessionToken;
  }): Promise<{ threadHash: string; bindingArtifactRef: string }>;
}
