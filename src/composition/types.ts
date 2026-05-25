import type {
  AttachmentStore,
  DefinitionSource,
  DraftStore,
  EmbedTransport,
  FormRuntimePolicyExtractor,
  IdentityProvider,
  LifecycleActionClient,
  NotificationDelivery,
  OfflineSubmitQueue,
  PaymentRailAdapter,
  ReviewerSession,
  ReviewThreadStore,
  RespondentHistorySource,
  RespondentPlaceSource,
  SafeAddressDirectory,
  ScreenerDocumentSource,
  StatusReader,
  SubmitTransport,
} from '../ports/index.ts';
import type {
  InstanceCapabilities,
  OrgRuntimePolicy,
} from '../policy/index.ts';

/**
 * Composition root contract — web ADR-0009 §Composition root pattern.
 *
 * Adopters fork only the composition file (typically <100 lines). They do
 * NOT fork the shell, the ports, or the reference adapters.
 *
 * Out of this interface (deliberately, per ADR-0009 §"Not in the constitutional inventory"):
 *  (a) Issuer resolution — engine-owned (formspec-engine IssuerStore);
 *      composition wires a FetchIssuerFetcher at boot, not a port.
 *  (b) Remaining post-MVP ports — BundleSource and Verifier ratified per-port
 *      when consumer code lands. StatusReader is active per ADR-0010.
 *  (c) Adopter-side seams — PaymentRail, BotProtection, EmbedTransport per
 *      ADR-0004 §exception become ports as consumer code lands.
 *  (d) Cross-stack TS shapes — stack-common / integrity-stack mirrors tracked
 *      in the upstream extension queue.
 */
export interface Composition {
  mode: 'demo' | 'production';
  initialDefinitionUrl: string;
  definitionSource: DefinitionSource;
  draftStore: DraftStore;
  submitTransport: SubmitTransport;
  identityProvider: IdentityProvider;
  /** Optional — only required when an adapter consumes it (e.g., MagicLinkAdapter). */
  notificationDelivery?: NotificationDelivery;
  /** ADR-0010: respondent-held obligations, documents, and history. */
  respondentPlaceSource: RespondentPlaceSource;
  /** ADR-0010/FW-0039: WOS applicant API resource shapes, not a web status vocabulary. */
  statusReader: StatusReader;
  /** FW-0033 slice 1: object-store seam for attachment uploads (web ADR-0011 fileUpload). */
  attachmentStore: AttachmentStore;
  /**
   * FW-0057 slice 1: cross-issuer respondent-history seam (web ADR-0011
   * crossIssuerHistory). Reads drafts + submissions + signed records
   * aggregated across senders (post-XS-2 client-side fan-out). Slice 1 wires
   * a stub fixture in demo and the unavailable sentinel in production.
   */
  respondentHistorySource: RespondentHistorySource;
  /**
   * FW-0044 slice 1: queued offline-submit seam (web ADR-0011 offlineSubmit).
   * The runtime routes through this adapter when the device is offline AND
   * the resolved profile enables `offlineSubmit`; otherwise the synchronous
   * `submitTransport` path runs unchanged. Production wires the unavailable
   * sentinel today; the stub composition wires an in-memory queue paired
   * with the stub transport via FW-0064-style construction injection.
   */
  offlineSubmitQueue: OfflineSubmitQueue;
  /**
   * FW-0027 slice 1: payment-rail seam (web ADR-0011 payment). The runtime
   * orchestrates authorize → submit → capture-or-void around the existing
   * submit path when the resolved profile enables `payment`; otherwise the
   * synchronous `submitTransport` path runs unchanged. Production wires the
   * unavailable sentinel today (no OSS reference rail adapter ships);
   * adopters fork to wire Stripe / Square / W3C Payment Request /
   * PayNearMe / in-person POS per their merchant relationships. Multi-rail
   * composition (CompositePaymentRailAdapter) is FW-0094.
   */
  paymentRailAdapter: PaymentRailAdapter;
  /**
   * FW-0040 slice 1: embed-transport seam (web ADR-0011 embed). The runtime
   * detects an iframe-mount context at form load and verifies the host
   * origin against `orgRuntimePolicy.limits.embed.allowedOrigins`; when
   * the form is loaded directly (top-level window) the transport is unused.
   * Production wires the unavailable sentinel today (no OSS reference
   * host-page adapter ships); adopters fork to wire raw postMessage,
   * penpal / comlink, or the future Custom Element message channel
   * (FW-0053, FW-0102, FW-0103).
   */
  embedTransport: EmbedTransport;
  /**
   * FW-0046 slice 1: screener-document seam (web ADR-0011 screener). The
   * `/screener?doc={urn}` route loads a Screener Document through this
   * port and mounts the upstream `<FormspecScreener>` from
   * `@formspec-org/react` to drive the three-questions-not-four-hundred
   * pre-flight surface (J-047). Production wires the unavailable sentinel
   * today (no OSS reference catalog adapter ships); demo wires
   * `stubScreenerDocumentSource` seeded with the bundled three-question
   * fixture; adopters fork to wire a catalog service, a static bundle,
   * an IPFS-pinned JSON, or an authoring-tool preview path per their
   * deployment.
   */
  screenerDocumentSource: ScreenerDocumentSource;
  /**
   * FW-0113: trusted reviewer requires both ports. ReviewerSession owns
   * capability-URL mint/redeem/revoke. ReviewThreadStore owns the SC-6
   * sidecar event log. Do not collapse the pair into one adapter slot.
   */
  reviewerSession: ReviewerSession;
  reviewThreadStore: ReviewThreadStore;
  /**
   * 2026-05-25 namespace preallocation: real interfaces land with their
   * feature builds. These sentinel-backed slots exist so ADR-0011
   * FEATURE_PORT_MAP can reserve the names without allowing a production
   * composition to declare the capabilities available by accident.
   */
  safeAddressDirectory: SafeAddressDirectory;
  /**
   * FW-0038: signed-record lifecycle actions on the status surface. The port
   * owns correction/amendment routing, withdrawal requests, dispute notes,
   * and EXT-5 lifecycle-event snapshots. UI keeps user vocabulary distinct
   * from upstream event names.
   */
  lifecycleActionClient: LifecycleActionClient;
  /** ADR-0011 §Instance capabilities — declared alongside the wired adapters. */
  instanceCapabilities: InstanceCapabilities;
  /** ADR-0011 §Org runtime policy — supplied by the composition root. */
  orgRuntimePolicy: OrgRuntimePolicy;
  /**
   * ADR-0011 §Form runtime policy — extracts the form's runtime-policy
   * declaration from the loaded Definition. Promoted to a named
   * `FormRuntimePolicyExtractor` port at FW-0066 (closure-typed slot retired
   * per project no-shims discipline once the FW-0033 attachment-field walker
   * tripped the promotion threshold). Reference adapters live at
   * `src/adapters/composing/form-runtime-policy-extractor.ts` and
   * `src/adapters/stub/form-runtime-policy-extractor.ts`; conformance suite at
   * `tests/adapter-conformance/form-runtime-policy-extractor/`.
   */
  formRuntimePolicyExtractor: FormRuntimePolicyExtractor;
}
