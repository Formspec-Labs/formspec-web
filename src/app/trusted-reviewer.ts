import type { DraftKey } from '../ports/draft-store.ts';
import type {
  ReviewThread,
  ReviewThreadDraftRef,
  ReviewThreadPolicySnapshot,
} from '../ports/review-thread-store.ts';
import type { ReviewerScope } from '../ports/reviewer-session.ts';
import {
  getTrustedReviewerRuntimeConfig,
  type ResolvedRuntimeProfile,
  type TrustedReviewerRuntimeConfig,
} from '../policy/index.ts';

export interface ReviewerRouteParams {
  readonly threadId: string;
  readonly capabilityUrl: string;
}

export function reviewerThreadIdForDraft(draftKey: DraftKey): string {
  return [
    'review-thread',
    encodeURIComponent(draftKey.subjectRef ?? 'anonymous'),
    encodeURIComponent(draftKey.formUrl),
    encodeURIComponent(draftKey.formVersion ?? 'latest'),
  ].join(':');
}

export function reviewerDraftRefForDraft(draftKey: DraftKey): ReviewThreadDraftRef {
  return {
    formUrl: draftKey.formUrl,
    formVersion: draftKey.formVersion,
    subjectRef: draftKey.subjectRef,
  };
}

export function trustedReviewerPolicySnapshot(
  profile: ResolvedRuntimeProfile,
): ReviewThreadPolicySnapshot | undefined {
  const config = getTrustedReviewerRuntimeConfig(profile);
  if (!config || config.posture === 'forbidden') return undefined;
  return {
    posture: config.posture,
    allowedRoles: config.allowedRoles,
    reviewerAssuranceFloor: config.reviewerAssuranceFloor,
    maxActiveSharesPerDraft: config.maxActiveSharesPerDraft,
    defaultShareExpiresAtRule: config.defaultShareExpiresAtRule,
    respondentOnlyFieldPointers: config.respondentOnlyFieldPointers,
    reviewerSessionBindingRef: config.reviewerSessionBindingRef,
    reviewThreadStoreBindingRef: config.reviewThreadStoreBindingRef,
  };
}

export function reviewerScopeForPosture(
  posture: TrustedReviewerRuntimeConfig['posture'],
): ReviewerScope {
  return posture === 'suggest-allowed' ? 'view+comment+suggest' : 'view+comment';
}

export function activeReviewerCount(thread: ReviewThread): number {
  const reviewerIds = new Set<string>();
  for (const event of thread.events) {
    if (event.author.kind === 'reviewer') {
      reviewerIds.add(event.author.shareId);
    }
  }
  return reviewerIds.size;
}

export function verifierReviewCapacityLine({
  reviewerCount,
  signerName,
}: {
  reviewerCount?: number;
  signerName: string;
}): string {
  if (!reviewerCount || reviewerCount < 1) {
    return `signed by ${signerName}`;
  }
  const partyLabel = reviewerCount === 1 ? '1 party' : `${reviewerCount} parties`;
  return `signed by ${signerName} · reviewed by ${partyLabel} before signing`;
}

export function reviewAttestationStatus(thread: ReviewThread | undefined): string {
  if (!thread) {
    return 'thread not available';
  }
  return `thread available · ${activeReviewerCount(thread)} reviewer(s)`;
}
