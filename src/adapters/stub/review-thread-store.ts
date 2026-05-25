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
      if (existing) return snapshotThread(state, existing);

      const now = new Date().toISOString();
      const thread: ReviewThread = {
        $formspecReviewThread: '1.0',
        threadId: args.threadId,
        draftRef: args.draftRef,
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
      assertTokenMatchesAuthor(state, args.sessionToken, args.author);
      assertPayloadAllowed(thread, args.payload, args.sessionToken);

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
      if (!isRespondentSessionToken(args.sessionToken)) {
        throw new ReviewThreadStoreError(
          'pinForReceipt requires a respondent session token',
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
  sessionToken: string,
  author: ReviewThreadEvent['author'],
): void {
  if (isRespondentSessionToken(sessionToken)) {
    if (author.kind !== 'respondent') {
      throw new ReviewThreadStoreError(
        'Respondent session token cannot author reviewer events',
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
  if (!share || share.revokedAt) {
    throw new ReviewThreadStoreError('Reviewer capability token is not active', 'session-role-mismatch');
  }
  if (author.kind !== 'reviewer' || author.shareId !== shareId) {
    throw new ReviewThreadStoreError(
      'Reviewer session token must match the reviewer author share',
      'session-role-mismatch',
    );
  }
}

function assertPayloadAllowed(
  thread: ReviewThread,
  payload: ReviewThreadEvent['payload'],
  sessionToken: string,
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
  }

  if (payload.type === 'suggestion-added') {
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
    shares: sharesForThread(state, thread.threadId).map((share) => ({ ...share })),
    events: eventsForThread(thread).map((event) => ({ ...event })),
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
