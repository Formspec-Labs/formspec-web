/**
 * MVP port surface per web ADR-0009 §MVP port inventory.
 *
 * Five ports total. Issuer resolution is engine-owned (formspec-engine
 * IssuerStore); composition wires a FetchIssuerFetcher, not a port.
 * Post-MVP ports (StatusReader, BundleSource, Verifier) ratified per-port
 * when consumer code lands.
 */

export type { DefinitionSource, FormDefinition } from './definition-source.ts';
export type { DraftStore, DraftKey, FormResponse } from './draft-store.ts';
export type { SubmitTransport, IntakeHandoff, SubmitConfirmation } from './submit-transport.ts';
export type {
  IdentityProvider,
  IdentityClaim,
  IdpOption,
  AssuranceLevel,
  Unsubscribe,
} from './identity-provider.ts';
export type {
  NotificationDelivery,
  NotificationMessage,
  NotificationChannel,
} from './notification-delivery.ts';
