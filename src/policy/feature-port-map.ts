/**
 * The single source of truth tying every RuntimeFeatureKey to the
 * Composition port slot that backs it. Each future feature ADR adds its
 * (key, portName) entry here so the coherence assertion picks it up
 * automatically.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export const FEATURE_PORT_MAP = {
  respondentPlace: 'respondentPlaceSource',
  status: 'statusReader',
  // FW-0056 slice 1: transitional mapping. The library substrate (wallet +
  // document metadata) is the respondent-place port; the selective-presentation
  // protocol stack (W3C VC Data Model 2.0 + OpenID4VP + SD-JWT or BBS+ per
  // stack-root ADR-0116) has no port yet — per web ADR-0009 §"Not in the
  // constitutional inventory," no port is ratified before a consumer. Slice 1's
  // selection action is local React state only; the cryptographic ceremony is
  // slice-2 work blocked on EXT-18 (HPKE wrapper) + SC-4 (Verifiable
  // Presentation Profile). When the VP port lands, switch this entry to the
  // new port name; FW-0066 covers the FormRuntimePolicyExtractor promotion
  // that this taxonomy extension triggers.
  documentPresentation: 'respondentPlaceSource',
  // FW-0033 slice 1: 1:1 mapping. The AttachmentStore port is the substrate
  // AND the consumer; no transitional slot-sharing. Adopters wire one
  // AttachmentStore implementation (S3 / R2 / Azure Blob / server-bundled /
  // IPFS / etc.) per deployment composition.
  fileUpload: 'attachmentStore',
  // FW-0057 slice 1: 1:1 mapping. The RespondentHistorySource port + the
  // crossIssuerHistory feature key ship together — no transitional slot-
  // sharing. Substrate (multi-issuer auth via XS-2 token bag per stack-root
  // ADR-0068 D-1 + D-3) is the adapter's concern, not the port's; production
  // adapters land post-XS-2.
  crossIssuerHistory: 'respondentHistorySource',
  // FW-0044 slice 1: 1:1 mapping. The OfflineSubmitQueue port + the
  // offlineSubmit feature key ship together — no transitional slot-sharing.
  // Substrate (IndexedDB / OPFS / service-worker) is the adapter's concern;
  // the slice-1 stub is in-memory only and the reference deployment declares
  // 'unavailable'.
  offlineSubmit: 'offlineSubmitQueue',
  // FW-0027 slice 1: 1:1 mapping. The PaymentRailAdapter port + the payment
  // feature key ship together — no transitional slot-sharing. Multi-rail
  // composition (CompositePaymentRailAdapter analogous to FW-0028's
  // CompositeIdentityProvider) is a future row (FW-0094); slice 1 wires one
  // adapter per composition. Reference adapters (Stripe / Square / W3C
  // Payment Request / PayNearMe / in-person POS) are adopter-side rows.
  payment: 'paymentRailAdapter',
  // FW-0040 slice 1: 1:1 mapping. The EmbedTransport port + the embed
  // feature key ship together — no transitional slot-sharing. The Custom
  // Element wrapper (FW-0053) consumes this port; production transport
  // adapters (postMessage RPC, penpal / comlink wrappers) are adopter-side
  // rows (FW-0102 + FW-0103).
  embed: 'embedTransport',
  // FW-0046 slice 1: 1:1 mapping. The ScreenerDocumentSource port + the
  // screener feature key ship together — no transitional slot-sharing.
  // The upstream `<FormspecScreener>` + `useScreener()` from
  // `@formspec-org/react` ship the consumer surface; this port owns
  // "where does the screener catalog live" only. Production adapters
  // (catalog service / static bundle / authoring-tool preview) are
  // adopter-side per web ADR-0004.
  screener: 'screenerDocumentSource',
} as const satisfies Readonly<Record<RuntimeFeatureKey, string>>;

export type CompositionPortName = (typeof FEATURE_PORT_MAP)[RuntimeFeatureKey];
