import type {
  IntakeHandoff,
  SubmitConfirmation,
  SubmitTransport,
} from '../../ports/submit-transport.ts';
import { assertUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';

/**
 * Stub SubmitTransport — idempotent in-memory.
 * Same idempotencyKey returns the same confirmation; new key generates a
 * new reference number. For tests + scaffold smoke test.
 */
export function stubSubmitTransport(): SubmitTransport {
  const replay = new Map<string, SubmitConfirmation>();
  let counter = 0;

  return {
    async submit(_handoff: IntakeHandoff, idempotencyKey: string) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      const existing = replay.get(idempotencyKey);
      if (existing) {
        return existing;
      }
      counter += 1;
      const refTail = counter.toString().padStart(6, '0');
      const confirmation: SubmitConfirmation = {
        referenceNumber: `STUB-${refTail}`,
        status: 'accepted',
        caseUrn: `urn:wos:case_demo_${refTail}`,
      };
      replay.set(idempotencyKey, confirmation);
      return confirmation;
    },
  };
}
