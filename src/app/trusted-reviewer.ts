import type {
  FormDefinition,
  FormResponse,
} from '@formspec-org/types';
import type { DraftKey } from '../ports/draft-store.ts';
import type {
  ReviewThread,
  ReviewThreadDraftSnapshot,
  ReviewThreadDraftRef,
  ReviewThreadFieldSnapshot,
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
  reviewerTraceAttached = false,
  reviewerCount,
  signerName,
}: {
  reviewerTraceAttached?: boolean;
  reviewerCount?: number;
  signerName: string;
}): string {
  if (!reviewerTraceAttached || !reviewerCount || reviewerCount < 1) {
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

export async function reviewerDraftSnapshotForResponse({
  capturedAt = new Date().toISOString(),
  definition,
  policySnapshot,
  response,
}: {
  capturedAt?: string;
  definition: FormDefinition;
  policySnapshot: ReviewThreadPolicySnapshot;
  response: FormResponse;
}): Promise<ReviewThreadDraftSnapshot> {
  const respondentOnly = new Set(policySnapshot.respondentOnlyFieldPointers);
  const fields = await collectFieldSnapshots({
    items: Array.isArray(definition.items) ? definition.items : [],
    data: response.data,
    respondentOnly,
  });
  return {
    capturedAt,
    responseHash: await hashJsonValue(response.data),
    fields,
  };
}

export function formatReviewDraftValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not answered';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'Value unavailable';
  }
}

async function collectFieldSnapshots({
  data,
  items,
  path = [],
  respondentOnly,
}: {
  data: Record<string, unknown>;
  items: readonly unknown[];
  path?: readonly string[];
  respondentOnly: ReadonlySet<string>;
}): Promise<ReviewThreadFieldSnapshot[]> {
  const fields: ReviewThreadFieldSnapshot[] = [];
  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const key = typeof item.key === 'string' ? item.key : undefined;
    if (!key) continue;
    const fieldPath = [...path, key];
    const pointer = `/data/${fieldPath.map(escapeJsonPointer).join('/')}`;
    const value = valueAtPath(data, fieldPath);
    const children = Array.isArray(item.items) ? item.items : [];

    if (item.type === 'field') {
      const fieldIsRespondentOnly = respondentOnly.has(pointer);
      const snapshot: ReviewThreadFieldSnapshot = {
        fieldPointer: pointer,
        fieldKey: fieldPath.join('.'),
        label: typeof item.label === 'string' ? item.label : key,
        respondentOnly: fieldIsRespondentOnly,
        valueHashAtSnapshot: await hashJsonValue(value),
      };
      if (!fieldIsRespondentOnly) {
        fields.push({ ...snapshot, value });
      } else {
        fields.push(snapshot);
      }
      continue;
    }

    if (children.length > 0) {
      fields.push(...await collectFieldSnapshots({
        data,
        items: children,
        path: fieldPath,
        respondentOnly,
      }));
    }
  }
  return fields;
}

function valueAtPath(data: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = data;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

async function hashJsonValue(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value ?? null));
  if (!globalThis.crypto?.subtle) {
    return `sha256:${fallbackHash(encoded)}`;
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function fallbackHash(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return hash.toString(16).padStart(8, '0');
}
