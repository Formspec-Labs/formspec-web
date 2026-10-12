import { assertSynchronousGuard } from '../../shared/synchronous-guard.ts';
import canonicalize from 'canonicalize';
import type {
  IntakeHandoff,
  SubmitConfirmation,
  SubmitTransport,
  SubmitOptions,
} from '../../ports/submit-transport.ts';
import { assertUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';
import { snapshotNativeCurrentCheck } from './native-current-check.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

export interface HttpSubmitTransportConfig extends HttpClientConfig {
  draftIdResolver: (handoff: IntakeHandoff) => Promise<string | undefined> | string | undefined;
  responseIdResolver?: (handoff: IntakeHandoff) => string | undefined;
  responseDataResolver?: (handoff: IntakeHandoff) => Record<string, unknown>;
  anonymousSessionToken?: string | ((handoff: IntakeHandoff) => Promise<string | undefined> | string | undefined);
  signingRequested?: boolean | ((handoff: IntakeHandoff) => boolean);
}

type CanonicalResponse = Record<string, unknown> & { data: Record<string, unknown> };

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
  private readonly finalizedHandoffs = new Map<string, { handoff: IntakeHandoff; options: SubmitOptions }>();
  private readonly replay = new Map<string, Promise<SubmitConfirmation>>();

  constructor(config: HttpSubmitTransportConfig) {
    this.client = new HttpClient(config);
    this.draftIdResolver = config.draftIdResolver;
    this.responseIdResolver = config.responseIdResolver;
    this.responseDataResolver = config.responseDataResolver;
    this.anonymousSessionToken = config.anonymousSessionToken;
    this.signingRequested = config.signingRequested;
  }

  async submit(handoff: IntakeHandoff, idempotencyKey: string, assertCurrent: () => void = () => {}, options: SubmitOptions = {}): Promise<SubmitConfirmation> {
    const check = () => assertSynchronousGuard(assertCurrent);
    check();
    assertUuidV7IdempotencyKey(idempotencyKey);
    requireCanonicalResponse(handoff);
    const selectedOptions = snapshotSubmitOptions(options);
    const finalized = this.finalizedHandoffs.get(idempotencyKey);
    if (finalized && canonicalize(finalized.handoff) !== canonicalize(handoff)) {
      throw new Error('A submission retry must preserve the finalized Response snapshot');
    }
    if (finalized && canonicalize(finalized.options) !== canonicalize(selectedOptions)) throw new Error('A submission retry must preserve its native selector');
    const snapshot = finalized?.handoff ?? structuredClone(handoff);
    const capturedOptions = finalized?.options ?? selectedOptions;
    const canonicalResponse = requireCanonicalResponse(snapshot);
    this.finalizedHandoffs.set(idempotencyKey, { handoff: snapshot, options: capturedOptions });
    const existing = this.replay.get(idempotencyKey);
    if (existing) {
      return existing;
    }
    const submission = this.submitOnce(snapshot, canonicalResponse, idempotencyKey, check, capturedOptions);
    this.replay.set(idempotencyKey, submission);
    try {
      return await submission;
    } catch (error) {
      this.replay.delete(idempotencyKey);
      throw error;
    }
  }

  private async submitOnce(
    handoff: IntakeHandoff,
    snapshot: CanonicalResponse,
    idempotencyKey: string,
    assertCurrent: () => void,
    options: SubmitOptions,
  ): Promise<SubmitConfirmation> {
    const draftId = await this.draftIdResolver(handoff);
    assertSynchronousGuard(assertCurrent);
    if (!draftId) {
      throw new Error('HTTP SubmitTransport requires a draft id for formspec-server submission');
    }

    const configuredAnswers = this.responseDataResolver?.(handoff);
    const configuredId = this.responseIdResolver?.(handoff);
    const snapshotId = typeof snapshot.id === 'string' ? snapshot.id : undefined;
    if ((configuredAnswers !== undefined && canonicalize(configuredAnswers) !== canonicalize(snapshot.data))
      || (configuredId !== undefined && configuredId !== snapshotId)) {
      throw new Error('Submission data or identity conflicts with the canonical Response');
    }
    const token = await this.resolveAnonymousSessionToken(handoff);
    assertSynchronousGuard(assertCurrent);
    const response = await this.client.postJson<ResponseView>(
      `/drafts/${encodeURIComponent(draftId)}/submit`,
      {
        response_id: configuredId ?? snapshotId,
        response_data: snapshot.data,
        canonical_response: snapshot,
        ...(options.nativeCurrentCheck ? { nativeCurrentCheck: options.nativeCurrentCheck } : {}),
        subject_ref: handoff.subjectRef ?? null,
        party_ref: partyRefFromHandoff(handoff) ?? null,
        anonymous_session_token: token,
        signing_requested: this.resolveSigningRequested(handoff),
      },
      { idempotencyKey, headers: token ? { authorization: `Bearer ${token}` } : {}, assertCurrent: () => assertSynchronousGuard(assertCurrent) },
    );
    if (snapshotId && response.response_id !== snapshotId) {
      throw new Error('Server response identity differs from the canonical Response');
    }
    const confirmation: SubmitConfirmation = {
      recordKind: 'response',
      referenceNumber: response.response_id,
      status: response.status,
    };
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

function requireCanonicalResponse(handoff: IntakeHandoff): CanonicalResponse {
  const response = handoff.extensions?.['x-formspec-response'];
  if (!isRecord(response) || !isRecord(response.data)) {
    throw new Error('HTTP SubmitTransport requires a canonical Response snapshot with object data');
  }
  return response as CanonicalResponse;
}

function partyRefFromHandoff(handoff: IntakeHandoff): string | undefined {
  const candidate = handoff.extensions?.['x-formspec-active-party-ref'];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotSubmitOptions(options: SubmitOptions): SubmitOptions {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => key !== 'nativeCurrentCheck')) throw new Error('Invalid native selector options');
  const value = options.nativeCurrentCheck;
  if (value === undefined) return Object.freeze({});
  return Object.freeze({ nativeCurrentCheck: snapshotNativeCurrentCheck(value) });
}
