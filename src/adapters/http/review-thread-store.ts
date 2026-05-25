import type {
  ReviewThread,
  ReviewThreadDraftRef,
  ReviewThreadEvent,
  ReviewThreadPolicySnapshot,
  ReviewThreadStore,
} from '../../ports/review-thread-store.ts';
import type { CapabilityToken, RespondentSessionToken } from '../../ports/reviewer-session.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

export interface HttpReviewThreadStoreConfig extends HttpClientConfig {
  readonly endpointPrefix?: string;
}

/**
 * HTTP reference seed for ReviewThreadStore.
 *
 * The endpoint names are intentionally conventional until SC-6 hardens. The
 * port shape, not these paths, is the adopter contract.
 */
export class HttpReviewThreadStore {
  private readonly client: HttpClient;
  private readonly prefix: string;

  constructor(config: HttpReviewThreadStoreConfig) {
    this.client = new HttpClient(config);
    this.prefix = config.endpointPrefix ?? '/reviewer';
  }

  async ensureThread(args: {
    threadId: string;
    draftRef: ReviewThreadDraftRef;
    policySnapshot: ReviewThreadPolicySnapshot;
  }): Promise<ReviewThread> {
    return this.client.postJson<ReviewThread>(
      `${this.prefix}/threads/${encodeURIComponent(args.threadId)}`,
      {
        draft_ref: args.draftRef,
        policy_snapshot: args.policySnapshot,
      },
    );
  }

  async read(args: { threadId: string }): Promise<ReviewThread> {
    return this.client.getJson<ReviewThread>(
      `${this.prefix}/threads/${encodeURIComponent(args.threadId)}`,
    );
  }

  async appendEvent(args: {
    threadId: string;
    sessionToken: CapabilityToken | RespondentSessionToken;
    author: ReviewThreadEvent['author'];
    payload: ReviewThreadEvent['payload'];
  }): Promise<ReviewThreadEvent> {
    return this.client.postJson<ReviewThreadEvent>(
      `${this.prefix}/threads/${encodeURIComponent(args.threadId)}/events`,
      {
        session_token: args.sessionToken,
        author: args.author,
        payload: args.payload,
      },
    );
  }

  async pinForReceipt(args: {
    threadId: string;
    sessionToken: RespondentSessionToken;
  }): Promise<{ threadHash: string; bindingArtifactRef: string }> {
    return this.client.postJson<{ threadHash: string; bindingArtifactRef: string }>(
      `${this.prefix}/threads/${encodeURIComponent(args.threadId)}/receipt-pin`,
      { session_token: args.sessionToken },
    );
  }
}

export function createHttpReviewThreadStore(
  config: HttpReviewThreadStoreConfig,
): ReviewThreadStore {
  return new HttpReviewThreadStore(config);
}
