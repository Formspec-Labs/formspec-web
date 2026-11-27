/** @filedesc Declarative Mapping (`materialize_mapping` / `createMappingEngine`) feeding `ReceiptPanel` from a respondent-scoped receipt (`fs-c0cc`). */
import { createMappingEngine, type IRuntimeMappingEngine } from '@formspec-org/engine';
import type { ReceiptFact, ReceiptPanelData } from '@formspec-org/surface-react';
import type { MappingDocument } from '@formspec-org/types';
import type { RespondentServerReceipt } from '../../adapters/http/response-receipt.ts';
import { isAcceptanceTime } from '../../shared/acceptance-time.ts';
import { isRecord } from '../../shared/is-record.ts';

export const RESPONDENT_RECEIPT_MAPPING_URL = 'urn:formspec:web:respondent:receipt-mapping';

/**
 * Canonical declarative MappingDocument mapping respondent-scoped server receipt fields
 * (`receipt_id`, `accepted_at`, `response_hash`, `case_ref`) into `ReceiptPanelData`.
 */
export const RESPONDENT_RECEIPT_MAPPING_DOCUMENT: MappingDocument = Object.freeze<MappingDocument>({
  $formspecMapping: '1.0',
  version: '1.0.0',
  definitionRef: RESPONDENT_RECEIPT_MAPPING_URL,
  definitionVersion: '1.0.0',
  direction: 'forward',
  targetSchema: {
    format: 'json',
    name: 'ReceiptPanelData',
  },
  adapters: {
    json: {
      nullHandling: 'omit',
    },
  },
  rules: [
    { sourcePath: 'case_ref', targetPath: 'caseRef', transform: 'preserve' },
    { sourcePath: 'receipt_id', targetPath: 'receiptId', transform: 'preserve' },
    { sourcePath: 'accepted_at', targetPath: 'submittedAt', transform: 'preserve' },
    { sourcePath: 'response_hash', targetPath: 'fingerprint', transform: 'preserve' },
  ],
});

export interface RespondentReceiptMappingInput {
  readonly case_ref?: string;
  readonly receipt_id?: string;
  readonly accepted_at?: string;
  readonly response_hash?: string;
  readonly status?: string;
  readonly tracking_uri?: string;
}

/**
 * Materialize `ReceiptPanelData` from a respondent-scoped receipt via `createMappingEngine`.
 * Preserves valid ISO 8601 server acceptance time and omits missing or malformed timestamps
 * without substituting the client clock.
 */
export function materializeRespondentReceiptPanel(
  receipt: RespondentServerReceipt | RespondentReceiptMappingInput,
  mappingDocument: MappingDocument = RESPONDENT_RECEIPT_MAPPING_DOCUMENT,
): ReceiptPanelData {
  const validAcceptedAt = isAcceptanceTime(receipt.accepted_at) ? receipt.accepted_at : null;
  const sourcePayload = {
    case_ref: typeof receipt.case_ref === 'string' && receipt.case_ref.length > 0 ? receipt.case_ref : null,
    receipt_id: typeof receipt.receipt_id === 'string' && receipt.receipt_id.length > 0 ? receipt.receipt_id : null,
    accepted_at: validAcceptedAt,
    response_hash: typeof receipt.response_hash === 'string' && receipt.response_hash.length > 0 ? receipt.response_hash : null,
  } as Parameters<IRuntimeMappingEngine['forward']>[0];

  const engine = createMappingEngine(mappingDocument);
  const result = engine.forward(sourcePayload);
  if (result.diagnostics.length > 0 || !isRecord(result.output)) {
    throw new Error(`Respondent receipt mapping failed (${result.diagnostics[0]?.errorCode ?? 'INVALID_OUTPUT'})`);
  }

  const out = result.output;
  const facts: ReceiptFact[] = [];
  if (typeof receipt.status === 'string' && receipt.status.length > 0) {
    facts.push(Object.freeze({ label: 'Submission status', value: receipt.status }));
  }
  if (typeof receipt.tracking_uri === 'string' && receipt.tracking_uri.length > 0) {
    facts.push(Object.freeze({ label: 'Tracking link', value: receipt.tracking_uri }));
  }

  return Object.freeze({
    ...(typeof out.caseRef === 'string' && out.caseRef.length > 0 ? { caseRef: out.caseRef } : {}),
    ...(typeof out.receiptId === 'string' && out.receiptId.length > 0 ? { receiptId: out.receiptId } : {}),
    ...(typeof out.submittedAt === 'string' && isAcceptanceTime(out.submittedAt) ? { submittedAt: out.submittedAt } : {}),
    ...(typeof out.fingerprint === 'string' && out.fingerprint.length > 0 ? { fingerprint: out.fingerprint } : {}),
    ...(facts.length > 0 ? { facts: Object.freeze(facts) } : {}),
  });
}
