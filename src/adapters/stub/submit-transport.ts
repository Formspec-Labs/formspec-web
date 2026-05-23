import type {
  IntakeHandoff,
  SubmitConfirmation,
  SubmitTransport,
} from '../../ports/submit-transport.ts';

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
      const existing = replay.get(idempotencyKey);
      if (existing) {
        return existing;
      }
      counter += 1;
      const confirmation: SubmitConfirmation = {
        referenceNumber: `STUB-${counter.toString().padStart(6, '0')}`,
        status: 'accepted',
      };
      replay.set(idempotencyKey, confirmation);
      return confirmation;
    },
  };
}
