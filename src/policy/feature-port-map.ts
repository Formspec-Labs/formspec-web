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
} as const satisfies Readonly<Record<RuntimeFeatureKey, string>>;

export type CompositionPortName = (typeof FEATURE_PORT_MAP)[RuntimeFeatureKey];
