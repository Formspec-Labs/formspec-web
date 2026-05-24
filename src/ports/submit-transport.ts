/**
 * SubmitTransport port — web ADR-0009 §MVP port inventory.
 *
 * Conformance invariant: accepts an `IntakeHandoff` per
 * `formspec/schemas/intake-handoff.schema.json` with
 * `initiationMode: "publicIntake"`. Idempotent on retry — caller supplies a
 * client-generated UUIDv7 idempotency key (per queue EXT-14 conventions);
 * same key returns same response.
 */

import type { IntakeHandoff } from '@formspec-org/types';
import type { WosResourceUrn } from './status-reader.ts';

export type { IntakeHandoff } from '@formspec-org/types';

export interface SubmitConfirmation {
  /** Human-displayable reference number (per FW-0013 plain-language errors). */
  referenceNumber: string;
  /** Submission status as reported by the upstream service. */
  status: 'accepted' | 'queued' | 'rejected';
  /** Optional URI for the respondent to track the submission. */
  trackingUri?: string;
  /**
   * Optional WOS case URN for the submitted application (FW-0039 slice 1).
   * Populated by transports whose backend already knows the case identity at
   * submit time. The web shell hands this through to a `/status?case={urn}`
   * tracking link. Consumer code MUST handle undefined; producer code MUST
   * NOT populate this field unless the backend really has a case identity to
   * report — arch-review F-7. HTTP transport leaves this undefined until the
   * production status adapter lands.
   */
  caseUrn?: WosResourceUrn;
}

export interface SubmitTransport {
  /**
   * Submit one validated response.
   *
   * `idempotencyKey` MUST be a client-generated UUIDv7 (queue EXT-14).
   * The same key passed twice MUST yield the same response.
   */
  submit(handoff: IntakeHandoff, idempotencyKey: string): Promise<SubmitConfirmation>;
}
