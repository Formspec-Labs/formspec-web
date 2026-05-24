import type {
  AttachmentStore,
  DefinitionSource,
  DraftStore,
  FormRuntimePolicyExtractor,
  IdentityProvider,
  NotificationDelivery,
  RespondentPlaceSource,
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
