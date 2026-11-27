/** @filedesc Respondent-scoped receipt reader (`GET /responses/{response_id}/receipt`) with staff-field stripping and indistinguishable refusal. */
import { isAcceptanceTime } from '../../shared/acceptance-time.ts';
import { isRecord } from '../../shared/is-record.ts';
import { HttpClient, type HttpClientConfig } from './http-client.ts';

export type HttpRespondentReceiptReaderConfig = HttpClientConfig;

/** Respondent-safe projection of a server ReceiptView (excludes staff remediation and proof diagnostics). */
export interface RespondentServerReceipt {
  readonly receipt_id: string;
  readonly accepted_at?: string;
  readonly response_hash: string;
  readonly case_ref?: string;
  readonly status?: string;
  readonly tracking_uri?: string;
  readonly form_version_id?: string;
  readonly proof_state?: string;
}

export type RespondentReceiptReadResult =
  | { readonly status: 'loaded'; readonly recordId: string; readonly receipt: RespondentServerReceipt }
  | { readonly status: 'unavailable'; readonly reason: string };

const UNAVAILABLE: RespondentReceiptReadResult = Object.freeze({
  status: 'unavailable',
  reason: 'receipt unavailable',
});

export class HttpRespondentReceiptReader {
  private readonly client: HttpClient;

  constructor(config: HttpRespondentReceiptReaderConfig) {
    this.client = new HttpClient(config);
  }

  /**
   * Read the respondent-scoped receipt for `responseId`.
   * Returns an indistinguishable `unavailable` outcome for unauthorized, other-principal,
   * missing, or malformed receipts, and never forwards staff-only `remediation` fields.
   */
  async read(
    responseId: string,
    options?: { readonly accessToken?: string; readonly assertCurrent?: () => void },
  ): Promise<RespondentReceiptReadResult> {
    if (typeof responseId !== 'string' || responseId.trim().length === 0) {
      return UNAVAILABLE;
    }
    try {
      const raw = await this.client.getJson<unknown>(
        `/responses/${encodeURIComponent(responseId)}/receipt`,
        {
          headers: options?.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {},
          ...(options?.assertCurrent ? { assertCurrent: options.assertCurrent } : {}),
          successStatuses: [200],
        },
      );
      const receipt = qualifyRespondentReceipt(raw);
      if (!receipt) return UNAVAILABLE;
      return Object.freeze({
        status: 'loaded' as const,
        recordId: receipt.receipt_id,
        receipt,
      });
    } catch {
      return UNAVAILABLE;
    }
  }
}

export function qualifyRespondentReceipt(raw: unknown): RespondentServerReceipt | undefined {
  if (!isRecord(raw)) return undefined;
  const receiptId = nonEmptyString(raw.receipt_id);
  const responseHash = nonEmptyString(raw.response_hash);
  if (!receiptId || !responseHash) return undefined;
  const acceptedAt = isAcceptanceTime(raw.accepted_at) ? raw.accepted_at : undefined;
  const caseRef = nonEmptyString(raw.case_ref);
  const status = nonEmptyString(raw.status);
  const trackingUri = nonEmptyString(raw.tracking_uri);
  const formVersionId = nonEmptyString(raw.form_version_id);
  const proofState = nonEmptyString(raw.proof_state);
  return Object.freeze({
    receipt_id: receiptId,
    ...(acceptedAt !== undefined ? { accepted_at: acceptedAt } : {}),
    response_hash: responseHash,
    ...(caseRef !== undefined ? { case_ref: caseRef } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(trackingUri !== undefined ? { tracking_uri: trackingUri } : {}),
    ...(formVersionId !== undefined ? { form_version_id: formVersionId } : {}),
    ...(proofState !== undefined ? { proof_state: proofState } : {}),
  });
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
