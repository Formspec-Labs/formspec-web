/**
 * NotificationDelivery port — web ADR-0009 §MVP port inventory.
 *
 * Transport only. Opaque to formspec-web. Does NOT shape templates,
 * audience, or delivery semantics — template authoring lives upstream
 * (e.g., `work-spec/schemas/sidecars/wos-delivery.schema.json#/$defs/NotificationsBlock`
 * for the formspec-stack composition).
 *
 * Cross-port composition (web ADR-0009 §Composition lifecycle): adapters
 * that need to send messages (e.g., `MagicLinkAdapter` of `IdentityProvider`)
 * consume this port via constructor injection from the composition root.
 *
 * Conformance invariant: idempotency-key dedup; the same `idempotencyKey`
 * passed twice MUST NOT result in two deliveries.
 */

export type NotificationChannel = 'email' | 'sms' | 'push';

export interface NotificationMessage {
  channel: NotificationChannel;
  /** Channel-specific addressee (email, phone, push token). */
  to: string;
  /** Pre-rendered subject (channel may ignore — e.g., SMS). */
  subject?: string;
  /** Pre-rendered body. */
  body: string;
  /** Channel-specific extension fields (e.g., HTML body for email). */
  extensions?: Record<string, unknown>;
}

export interface NotificationDelivery {
  /**
   * Send a pre-rendered message.
   *
   * `idempotencyKey` enables dedup at the transport layer (per
   * stack-common-idempotency conventions — queue EXT-14). Same key, same
   * message → single delivery; same key, different message → undefined.
   */
  send(message: NotificationMessage, idempotencyKey: string): Promise<void>;
}
