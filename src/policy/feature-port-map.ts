/**
 * The single source of truth tying every RuntimeFeatureKey to the
 * Composition port slot that backs it. Each future feature ADR adds its
 * (key, portName) entry here so the coherence assertion picks it up
 * automatically.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export type FeaturePortBinding = string | readonly string[];

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
  // FW-0113 preallocation: trusted reviewer requires both ports. A one-slot
  // mapping would let an adopter declare the feature available while one half
  // of the substrate is missing, so the coherence assertion supports
  // one-feature-to-many-port bindings.
  trustedReviewer: ['reviewerSession', 'reviewThreadStore'],
  // FW-0062 future reservation. FW-0051 defers the Assist Provider port shape
  // until consumer code lands, so this key is unavailable-only until its build
  // row replaces the empty binding.
  bringYourOwnAssistant: [],
  // FW-0060 preallocation. FW-0049 names SafeAddressDirectory as the first
  // adopter-shaped seam; masking is render discipline, not the DI port.
  safeAddress: 'safeAddressDirectory',
  // FW-0059 future reservation. FW-0048 explicitly defers the safety-routing
  // port shape until the issuer-webhook and WOS-task adapters are reduced
  // together, so this key is unavailable-only until that build lands.
  duressAware: [],
  // FW-0061 preallocation. FW-0050 rejects a new PartyAuthority port for the
  // current design and extends existing DraftStore / IdentityProvider /
  // SubmitTransport semantics instead. The empty binding keeps the key
  // unavailable-only until FW-0061 materializes a concrete capability proof.
  multiParty: [],
  // FW-0038 preallocation. FW-0034 names the capability `recordLifecycle`;
  // the build owns the LifecycleActionClient transport shape.
  recordLifecycle: 'lifecycleActionClient',
} as const satisfies Readonly<Record<RuntimeFeatureKey, FeaturePortBinding>>;

type FeaturePortEntry = (typeof FEATURE_PORT_MAP)[RuntimeFeatureKey];
type FlattenPortEntry<T> = T extends readonly (infer PortName)[]
  ? PortName & string
  : T & string;

export type CompositionPortName = FlattenPortEntry<FeaturePortEntry>;

export function featurePortNames(featureKey: RuntimeFeatureKey): readonly CompositionPortName[] {
  const entry = FEATURE_PORT_MAP[featureKey] as FeaturePortBinding;
  return (Array.isArray(entry) ? entry : [entry]) as readonly CompositionPortName[];
}
