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

export type { IntakeHandoff } from '@formspec-org/types';

export interface SubmitConfirmation {
  /** Human-displayable reference number (per FW-0013 plain-language errors). */
  referenceNumber: string;
  /** Submission status as reported by the upstream service. */
  status: 'accepted' | 'queued' | 'rejected';
  /** Optional URI for the respondent to track the submission. */
  trackingUri?: string;
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
