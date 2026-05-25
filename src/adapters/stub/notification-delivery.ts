import type {
  NotificationDelivery,
  NotificationDeliveryCapabilities,
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

export interface StubNotificationDeliveryOptions {
  readonly capabilities?: NotificationDeliveryCapabilities;
}

const TEST_ONLY_CAPABILITIES: NotificationDeliveryCapabilities = {
  email: 'test',
  sms: 'test',
  push: 'test',
};

export function stubNotificationDelivery(
  options: StubNotificationDeliveryOptions = {},
): StubNotificationDelivery {
  const seen = new Map<string, NotificationMessage>();
  const sent: Array<{ key: string; message: NotificationMessage }> = [];

  return {
    capabilities: options.capabilities ?? TEST_ONLY_CAPABILITIES,
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
