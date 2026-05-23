import type {
  NotificationDelivery,
  NotificationMessage,
} from '../../ports/notification-delivery.ts';
import { assertUuidV7IdempotencyKey } from '../../shared/idempotency-key.ts';

/**
 * Stub NotificationDelivery — no-op with replay-key dedup.
 * Records messages for test assertions; no actual delivery.
 */
export interface StubNotificationDelivery extends NotificationDelivery {
  sent: ReadonlyArray<{ key: string; message: NotificationMessage }>;
}

export function stubNotificationDelivery(): StubNotificationDelivery {
  const seen = new Map<string, NotificationMessage>();
  const sent: Array<{ key: string; message: NotificationMessage }> = [];

  return {
    sent,
    async send(message, idempotencyKey) {
      assertUuidV7IdempotencyKey(idempotencyKey);
      if (seen.has(idempotencyKey)) {
        return;
      }
      seen.set(idempotencyKey, message);
      sent.push({ key: idempotencyKey, message });
    },
  };
}
