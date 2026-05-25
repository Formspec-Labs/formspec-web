import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import {
  ReviewThreadStoreError,
  type ReviewThread,
  type ReviewThreadEvent,
  type ReviewThreadStore,
} from '../../ports/review-thread-store.ts';
import { isRespondentSessionToken } from '../../ports/reviewer-session.ts';
import {
  createStubTrustedReviewerState,
  eventsForThread,
  respondentTokenAuthorizesThread,
  shareIsExpired,
  sharesForThread,
  type StubTrustedReviewerState,
} from './trusted-reviewer-state.ts';
import { stubReviewerSession } from './reviewer-session.ts';

export interface StubReviewThreadStore extends ReviewThreadStore {
  readonly _state: StubTrustedReviewerState;
}

export interface StubReviewThreadStoreOptions {
  readonly state?: StubTrustedReviewerState;
}

export function stubReviewThreadStore(
  options: StubReviewThreadStoreOptions = {},
): StubReviewThreadStore {
  const state = options.state ?? createStubTrustedReviewerState();

  const adapter: StubReviewThreadStore = {
    _state: state,

    async ensureThread(args) {
      const existing = state.threads.get(args.threadId);
      if (existing) {
        if (args.draftSnapshot) {
          const now = new Date().toISOString();
          const updated: ReviewThread = {
            ...existing,
            draftSnapshot: cloneDraftSnapshot(args.draftSnapshot),
            updatedAt: now,
          };
          state.threads.set(args.threadId, updated);
          return snapshotThread(state, updated);
        }
        return snapshotThread(state, existing);
      }

      const now = new Date().toISOString();
      const thread: ReviewThread = {
        $formspecReviewThread: '1.0',
        threadId: args.threadId,
        draftRef: args.draftRef,
        draftSnapshot: args.draftSnapshot ? cloneDraftSnapshot(args.draftSnapshot) : undefined,
        policySnapshot: args.policySnapshot,
        shares: [],
        events: [],
        createdAt: now,
      };
      state.threads.set(args.threadId, thread);
      return snapshotThread(state, thread);
    },

    async read(args) {
      const thread = state.threads.get(args.threadId);
      if (!thread) {
        throw new ReviewThreadStoreError(
          `Review thread ${args.threadId} was not found`,
          'thread-not-found',
        );
      }
      assertTokenCanReadThread(state, args.threadId, args.sessionToken);
      return snapshotThread(state, thread);
    },

    async appendEvent(args) {
      const thread = state.threads.get(args.threadId);
      if (!thread) {
        throw new ReviewThreadStoreError(
          `Review thread ${args.threadId} was not found`,
          'thread-not-found',
        );
      }
      const share = assertTokenMatchesAuthor(state, args.threadId, args.sessionToken, args.author);
      assertPayloadAllowed(state, thread, args.payload, args.sessionToken, share);

      state.nextEventId += 1;
      const now = new Date().toISOString();
      const event: ReviewThreadEvent = {
        eventId: `stub-review-event-${state.nextEventId.toString().padStart(6, '0')}`,
        threadId: args.threadId,
        occurredAt: now,
        author: args.author,
        payload: args.payload,
      };
      state.threads.set(args.threadId, {
        ...thread,
        events: [...thread.events, event],
        updatedAt: now,
      });
      return { ...event };
    },

    async pinForReceipt(args) {
      if (
        !isRespondentSessionToken(args.sessionToken)
        || !respondentTokenAuthorizesThread(args.sessionToken, args.threadId)
      ) {
        throw new ReviewThreadStoreError(
          'pinForReceipt requires a respondent session token scoped to this thread',
          'session-role-mismatch',
        );
      }
      const thread = state.threads.get(args.threadId);
      if (!thread) {
        throw new ReviewThreadStoreError(
          `Review thread ${args.threadId} was not found`,
          'thread-not-found',
        );
      }
      const threadHash = await hashThread(snapshotThread(state, thread));
      return {
        threadHash,
        bindingArtifactRef: `review-thread:${args.threadId}:${threadHash}`,
      };
    },
  };

  return markDemoStubAdapter(adapter, {
    featureKey: 'trustedReviewer',
    reason: 'in-memory review-thread sidecar; demo only — thread state lost on reload',
  });
}

export function createStubTrustedReviewerAdapters(options: { baseUrl?: string } = {}) {
  const state = createStubTrustedReviewerState();
  return {
    reviewerSession: stubReviewerSession({ state, baseUrl: options.baseUrl }),
    reviewThreadStore: stubReviewThreadStore({ state }),
  };
}

function assertTokenMatchesAuthor(
  state: StubTrustedReviewerState,
  threadId: string,
  sessionToken: string,
  author: ReviewThreadEvent['author'],
): ReviewThread['shares'][number] | undefined {
  if (isRespondentSessionToken(sessionToken)) {
    if (!respondentTokenAuthorizesThread(sessionToken, threadId)) {
      throw new ReviewThreadStoreError(
        'Respondent session token is not scoped to this thread',
        'session-role-mismatch',
      );
    }
    if (author.kind !== 'respondent') {
      throw new ReviewThreadStoreError(
        'Respondent session token cannot author reviewer events',
        'session-role-mismatch',
      );
    }
    return undefined;
  }

  const shareId = state.capabilityTokens.get(sessionToken);
  if (!shareId) {
    throw new ReviewThreadStoreError('Reviewer capability token is invalid', 'session-role-mismatch');
  }
  const share = state.shares.get(shareId);
  if (!share || share.revokedAt || shareIsExpired(share)) {
    throw new ReviewThreadStoreError('Reviewer capability token is not active', 'session-role-mismatch');
  }
  if (share.threadId !== threadId) {
    throw new ReviewThreadStoreError(
      'Reviewer capability token is not scoped to this thread',
      'session-role-mismatch',
    );
  }
  if (author.kind !== 'reviewer' || author.shareId !== shareId) {
    throw new ReviewThreadStoreError(
      'Reviewer session token must match the reviewer author share',
      'session-role-mismatch',
    );
  }
  return share;
}

function assertTokenCanReadThread(
  state: StubTrustedReviewerState,
  threadId: string,
  sessionToken: string,
): void {
  if (isRespondentSessionToken(sessionToken)) {
    if (!respondentTokenAuthorizesThread(sessionToken, threadId)) {
      throw new ReviewThreadStoreError(
        'Respondent session token is not scoped to this thread',
        'session-role-mismatch',
      );
    }
    return;
  }

  const shareId = state.capabilityTokens.get(sessionToken);
  if (!shareId) {
    throw new ReviewThreadStoreError('Reviewer capability token is invalid', 'session-role-mismatch');
  }
  const share = state.shares.get(shareId);
  if (!share || share.revokedAt || shareIsExpired(share)) {
    throw new ReviewThreadStoreError('Reviewer capability token is not active', 'session-role-mismatch');
  }
  if (share.threadId !== threadId) {
    throw new ReviewThreadStoreError(
      'Reviewer capability token is not scoped to this thread',
      'session-role-mismatch',
    );
  }
}

function assertPayloadAllowed(
  state: StubTrustedReviewerState,
  thread: ReviewThread,
  payload: ReviewThreadEvent['payload'],
  sessionToken: string,
  reviewerShare: ReviewThread['shares'][number] | undefined,
): void {
  const respondentToken = isRespondentSessionToken(sessionToken);
  if (
    payload.type === 'share-minted' ||
    payload.type === 'share-revoked' ||
    payload.type === 'suggestion-accepted' ||
    payload.type === 'suggestion-declined'
  ) {
    if (!respondentToken) {
      throw new ReviewThreadStoreError(
        `${payload.type} requires a respondent session token`,
        'session-role-mismatch',
      );
    }
    const shareId = 'shareId' in payload ? payload.shareId : undefined;
    if (shareId) {
      const share = state.shares.get(shareId);
      if (!share || share.threadId !== thread.threadId) {
        throw new ReviewThreadStoreError(
          `${payload.type} must target a share on the same thread`,
          'session-role-mismatch',
        );
      }
    }
  }

  if (payload.type === 'comment-added' && reviewerShare?.grantedScope === 'view') {
    throw new ReviewThreadStoreError(
      'Reviewer comment requires a view+comment scope',
      'scope-forbidden',
    );
  }

  if (payload.type === 'suggestion-added') {
    if (!reviewerShare) {
      throw new ReviewThreadStoreError(
        'Reviewer suggestion requires a reviewer capability token',
        'session-role-mismatch',
      );
    }
    if (reviewerShare.grantedScope !== 'view+comment+suggest') {
      throw new ReviewThreadStoreError(
        'Reviewer suggestion requires a view+comment+suggest scope',
        'scope-forbidden',
      );
    }
    if (thread.policySnapshot.posture !== 'suggest-allowed') {
      throw new ReviewThreadStoreError(
        'Reviewer suggestions are not allowed by the thread policy snapshot',
        'suggestion-forbidden',
      );
    }
    if (thread.policySnapshot.respondentOnlyFieldPointers.includes(payload.anchor.fieldPointer)) {
      throw new ReviewThreadStoreError(
        'Reviewer suggestions are forbidden on respondent-only fields',
        'respondent-only-field',
      );
    }
  }
}

function snapshotThread(
  state: StubTrustedReviewerState,
  thread: ReviewThread,
): ReviewThread {
  return {
    ...thread,
    draftSnapshot: thread.draftSnapshot ? cloneDraftSnapshot(thread.draftSnapshot) : undefined,
    shares: sharesForThread(state, thread.threadId).map((share) => ({ ...share })),
    events: eventsForThread(thread).map((event) => ({ ...event })),
  };
}

function cloneDraftSnapshot(
  draftSnapshot: NonNullable<ReviewThread['draftSnapshot']>,
): NonNullable<ReviewThread['draftSnapshot']> {
  return {
    ...draftSnapshot,
    fields: draftSnapshot.fields.map((field) => ({ ...field })),
  };
}

async function hashThread(thread: ReviewThread): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(thread));
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
