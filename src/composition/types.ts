import type {
  DefinitionSource,
  DraftStore,
  IdentityProvider,
  NotificationDelivery,
  SubmitTransport,
} from '../ports/index.ts';

/**
 * Composition root contract — web ADR-0009 §Composition root pattern.
 *
 * Adopters fork only the composition file (typically <100 lines). They do
 * NOT fork the shell, the ports, or the reference adapters.
 *
 * Out of this interface (deliberately, per ADR-0009 §"Not in the constitutional inventory"):
 *  (a) Issuer resolution — engine-owned (formspec-engine IssuerStore);
 *      composition wires a FetchIssuerFetcher at boot, not a port.
 *  (b) Post-MVP ports — StatusReader, BundleSource, Verifier ratified per-port
 *      when consumer code lands.
 *  (c) Adopter-side seams — PaymentRail, BotProtection, EmbedTransport per
 *      ADR-0004 §exception become ports as consumer code lands.
 *  (d) Cross-stack TS shapes — stack-common / integrity-stack mirrors tracked
 *      in the upstream extension queue.
 */
export interface Composition {
  definitionSource: DefinitionSource;
  draftStore: DraftStore;
  submitTransport: SubmitTransport;
  identityProvider: IdentityProvider;
  /** Optional — only required when an adapter consumes it (e.g., MagicLinkAdapter). */
  notificationDelivery?: NotificationDelivery;
}
