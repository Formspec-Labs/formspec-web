import type {
  IntakeHandoff,
  SubmitConfirmation,
  SubmitTransport,
} from '../../ports/submit-transport.ts';
import { assertUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

export interface HttpSubmitTransportConfig extends HttpClientConfig {
  draftIdResolver: (handoff: IntakeHandoff) => Promise<string | undefined> | string | undefined;
  responseIdResolver?: (handoff: IntakeHandoff) => string | undefined;
  responseDataResolver?: (handoff: IntakeHandoff) => Record<string, unknown>;
  anonymousSessionToken?: string | ((handoff: IntakeHandoff) => Promise<string | undefined> | string | undefined);
  signingRequested?: boolean | ((handoff: IntakeHandoff) => boolean);
}

interface ResponseView {
  response_id: string;
  status: 'accepted' | 'queued' | 'rejected';
}

export class HttpSubmitTransport implements SubmitTransport {
  private readonly client: HttpClient;
  private readonly draftIdResolver: HttpSubmitTransportConfig['draftIdResolver'];
  private readonly responseIdResolver?: HttpSubmitTransportConfig['responseIdResolver'];
  private readonly responseDataResolver?: HttpSubmitTransportConfig['responseDataResolver'];
  private readonly anonymousSessionToken?: HttpSubmitTransportConfig['anonymousSessionToken'];
  private readonly signingRequested?: HttpSubmitTransportConfig['signingRequested'];
  private readonly replay = new Map<string, SubmitConfirmation>();

  constructor(config: HttpSubmitTransportConfig) {
    this.client = new HttpClient(config);
    this.draftIdResolver = config.draftIdResolver;
    this.responseIdResolver = config.responseIdResolver;
    this.responseDataResolver = config.responseDataResolver;
    this.anonymousSessionToken = config.anonymousSessionToken;
    this.signingRequested = config.signingRequested;
  }

  async submit(handoff: IntakeHandoff, idempotencyKey: string): Promise<SubmitConfirmation> {
    assertUuidV7IdempotencyKey(idempotencyKey);
    const existing = this.replay.get(idempotencyKey);
    if (existing) {
      return existing;
    }
    const draftId = await this.draftIdResolver(handoff);
    if (!draftId) {
      throw new Error('HTTP SubmitTransport requires a draft id for formspec-server submission');
    }

    const response = await this.client.postJson<ResponseView>(
      `/drafts/${encodeURIComponent(draftId)}/submit`,
      {
        response_id: this.responseIdResolver?.(handoff),
        response_data: this.responseDataResolver?.(handoff) ?? responseDataFromHandoff(handoff),
        subject_ref: handoff.subjectRef ?? null,
        anonymous_session_token: await this.resolveAnonymousSessionToken(handoff),
        signing_requested: this.resolveSigningRequested(handoff),
      },
      { idempotencyKey },
    );
    const confirmation: SubmitConfirmation = {
      referenceNumber: response.response_id,
      status: response.status,
    };
    this.replay.set(idempotencyKey, confirmation);
    return confirmation;
  }

  private async resolveAnonymousSessionToken(handoff: IntakeHandoff): Promise<string | null> {
    if (typeof this.anonymousSessionToken === 'function') {
      return (await this.anonymousSessionToken(handoff)) ?? null;
    }
    return this.anonymousSessionToken ?? null;
  }

  private resolveSigningRequested(handoff: IntakeHandoff): boolean {
    if (typeof this.signingRequested === 'function') {
      return this.signingRequested(handoff);
    }
    return this.signingRequested ?? false;
  }
}

export function createHttpSubmitTransport(
  config: HttpSubmitTransportConfig,
): HttpSubmitTransport {
  return new HttpSubmitTransport(config);
}

function responseDataFromHandoff(handoff: IntakeHandoff): Record<string, unknown> {
  const candidate = handoff.extensions?.['x-formspec-response-data'];
  if (isRecord(candidate)) {
    return candidate;
  }
  const response = handoff.extensions?.['x-formspec-response'];
  if (isRecord(response) && isRecord(response.data)) {
    return response.data;
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
