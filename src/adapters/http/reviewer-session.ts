import type {
  ReviewerSession,
  ReviewerSessionRedeemResult,
  ReviewerScope,
  ReviewerShare,
} from '../../ports/reviewer-session.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

export interface HttpReviewerSessionConfig extends HttpClientConfig {
  readonly endpointPrefix?: string;
}

/**
 * HTTP reference seed for ReviewerSession.
 *
 * Not wired by the OSS production composition until an adopter/server contract
 * ratifies the endpoint paths. Kept typed so adopters can copy the adapter
 * without changing the port surface.
 */
export class HttpReviewerSession {
  private readonly client: HttpClient;
  private readonly prefix: string;

  constructor(config: HttpReviewerSessionConfig) {
    this.client = new HttpClient(config);
    this.prefix = config.endpointPrefix ?? '/reviewer';
  }

  async mintShare(args: {
    threadId: string;
    requestedScope: ReviewerScope;
    expiresAt?: string;
    audienceHint?: string;
    respondentSessionToken?: string;
    partyRef?: string;
  }): Promise<{ shareId: string; capabilityUrl: string }> {
    return this.client.postJson<{ shareId: string; capabilityUrl: string }>(
      `${this.prefix}/shares`,
      {
        thread_id: args.threadId,
        requested_scope: args.requestedScope,
        expires_at: args.expiresAt,
        audience_hint: args.audienceHint,
        respondent_session_token: args.respondentSessionToken,
        party_ref: args.partyRef,
      },
    );
  }

  async redeem(args: { capabilityUrl: string }): Promise<ReviewerSessionRedeemResult> {
    return this.client.postJson<ReviewerSessionRedeemResult>(
      `${this.prefix}/shares/redeem`,
      { capability_url: args.capabilityUrl },
    );
  }

  async revoke(args: {
    shareId: string;
    reason?: string;
    respondentSessionToken?: string;
  }): Promise<void> {
    await this.client.postJson(`${this.prefix}/shares/${encodeURIComponent(args.shareId)}/revoke`, {
      reason: args.reason,
      respondent_session_token: args.respondentSessionToken,
    });
  }

  async listShares(args: {
    threadId: string;
    respondentSessionToken?: string;
  }): Promise<readonly ReviewerShare[]> {
    return this.client.getJson<ReviewerShare[]>(
      `${this.prefix}/threads/${encodeURIComponent(args.threadId)}/shares`,
      args.respondentSessionToken
        ? { headers: { 'x-formspec-respondent-session': args.respondentSessionToken } }
        : undefined,
    );
  }
}

export function createHttpReviewerSession(
  config: HttpReviewerSessionConfig,
): ReviewerSession {
  return new HttpReviewerSession(config);
}
