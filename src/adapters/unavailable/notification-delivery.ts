import type { NotificationDelivery } from '../../ports/notification-delivery.ts';

/** No channel claims delivery until an application supplies a transport. */
export function unavailableNotificationDelivery(): NotificationDelivery {
  return { capabilities: {}, async send() { throw new Error('Notification delivery is not configured'); } };
}
