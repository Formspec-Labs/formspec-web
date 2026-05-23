import { stubNotificationDelivery } from '../../../src/adapters/stub/notification-delivery.ts';
import { defineNotificationDeliveryConformance } from '../_framework/conformance.ts';

defineNotificationDeliveryConformance('stub NotificationDelivery conformance', () => {
  const adapter = stubNotificationDelivery();
  return {
    adapter,
    deliveries: () => adapter.sent,
  };
});
