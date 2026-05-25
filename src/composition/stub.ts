import {
  AttachmentRequirementExtractor,
  CompositeFormRuntimePolicyExtractor,
  EmbeddableExtractor,
  OfflineSubmitRequirementExtractor,
  PaymentRequirementExtractor,
  RecordLifecycleExtractor,
  TrustedReviewerPolicyExtractor,
} from '../adapters/composing/form-runtime-policy-extractor.ts';
import { stubDefinitionSource } from '../adapters/stub/definition-source.ts';
import { stubDraftStore } from '../adapters/stub/draft-store.ts';
import { stubEmbedTransport } from '../adapters/stub/embed-transport.ts';
import { stubFormRuntimePolicyExtractor } from '../adapters/stub/form-runtime-policy-extractor.ts';
import { stubIdentityProvider } from '../adapters/stub/identity-provider.ts';
import { stubLifecycleActionClient } from '../adapters/stub/lifecycle-action-client.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { stubOfflineSubmitQueue } from '../adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../adapters/stub/payment-rail-adapter.ts';
import { persistentDemoAttachmentStore } from '../adapters/stub/persistent-attachment-store.ts';
import { createStubTrustedReviewerAdapters } from '../adapters/stub/review-thread-store.ts';
import { stubRespondentHistorySource } from '../adapters/stub/respondent-history-source.ts';
import { stubRespondentPlaceSource } from '../adapters/stub/respondent-place-source.ts';
import { stubScreenerDocumentSource } from '../adapters/stub/screener-document-source.ts';
import { stubStatusReader } from '../adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../adapters/stub/submit-transport.ts';
import { unavailablePreallocatedFeaturePort } from '../adapters/unavailable/preallocated-feature-port.ts';
import { demoSampleForm, demoSampleFormUrl } from '../demo/index.ts';
import { demoLocaleDocuments } from '../demo/locales.ts';
import {
  demoApplicantCaseDetail,
  demoLifecycleActionSnapshot,
  demoRespondentPlaceSnapshot,
} from '../demo/respondent-place.ts';
import { demoHistorySnapshot } from '../demo/respondent-history.ts';
import { demoScreenerCatalog } from '../demo/screener.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../policy/index.ts';
import type { Composition } from './types.ts';

/**
 * All-stub composition for tests + scaffold smoke test.
 * Per web ADR-0009 §Composition lifecycle, the composition root is the only
 * place adapters are wired into ports.
 *
 * Narrowed-route stub compositions (`/status` per FW-0068, `/obligations`
 * per FW-0055, `/documents` per FW-0056) live in `./route-narrowing.ts`
 * and are parameterized by descriptor (FW-0070). This factory owns the
 * full-app form-route composition only.
 */
export function createStubComposition(): Composition {
  const definitionSource = stubDefinitionSource();
  definitionSource.registerDefinition(demoSampleForm.url, demoSampleForm, demoSampleForm.version);
  definitionSource.registerDefinition(demoSampleForm.url, demoSampleForm);
  definitionSource.registerLocaleDocuments(
    demoSampleForm.url,
    demoLocaleDocuments,
    demoSampleForm.version,
  );
  definitionSource.registerLocaleDocuments(demoSampleForm.url, demoLocaleDocuments);

  const submitTransport = stubSubmitTransport();
  const trustedReviewerAdapters = createStubTrustedReviewerAdapters({
    baseUrl: 'https://demo.formspec.test',
  });
  const composition: Composition = {
    mode: 'demo',
    initialDefinitionUrl: demoSampleFormUrl,
    definitionSource,
    draftStore: stubDraftStore(),
    submitTransport,
    identityProvider: stubIdentityProvider(),
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: stubRespondentPlaceSource(demoRespondentPlaceSnapshot()),
    statusReader: stubStatusReader([
      ['urn:wos:case_demo_0001', demoApplicantCaseDetail()],
    ]),
    attachmentStore: persistentDemoAttachmentStore(),
    respondentHistorySource: stubRespondentHistorySource(demoHistorySnapshot()),
    // FW-0044 slice 1: in-memory queue paired with the same stub transport at
    // construction time (FW-0064 cohort discipline). The slice-1 stub loses
    // queued submissions on page reload — that is the 'demo-stub' posture's
    // honest cost; the production IndexedDB adapter (FW-0082) is filed.
    offlineSubmitQueue: stubOfflineSubmitQueue({ transport: submitTransport }),
    // FW-0027 slice 1: in-memory payment-rail adapter. Authorizes / captures /
    // voids against an in-process Map; no real money moves. The bundled demo
    // form does NOT declare `x-formspec-payment-required: true` (FW-0100
    // gates the demo flip on a method-picker UX); the stub is exercised
    // through synthetic-definition tests + the conformance suite.
    paymentRailAdapter: stubPaymentRailAdapter(),
    // FW-0040 slice 1: in-memory embed-transport adapter; defaults to
    // `embedded: false` because the bundled demo loads as the top-level
    // window. Synthetic-definition tests opt into the embedded branch by
    // composing a fresh stub with `{ embedded: true, hostOrigin }`; the
    // bundled demo never exercises the iframe-context gate.
    embedTransport: stubEmbedTransport({ embedded: false }),
    // FW-0046 slice 1: in-memory catalog adapter seeded with the demo
    // three-question screener. Production declares 'unavailable' until
    // adopters wire a real catalog adapter; the stub satisfies the demo
    // posture so the /screener route renders the upstream
    // <FormspecScreener> end-to-end in `npm run dev`.
    screenerDocumentSource: stubScreenerDocumentSource(demoScreenerCatalog()),
    reviewerSession: trustedReviewerAdapters.reviewerSession,
    reviewThreadStore: trustedReviewerAdapters.reviewThreadStore,
    safeAddressDirectory: unavailablePreallocatedFeaturePort('safeAddress', 'SafeAddressDirectory'),
    lifecycleActionClient: stubLifecycleActionClient({
      initialSnapshots: [demoLifecycleActionSnapshot()],
    }),
    instanceCapabilities: {
      respondentPlace: 'demo-stub',
      status: 'demo-stub',
      // FW-0056 design line 121 + arch-review MED-1: NO demo VP stack — the
      // substrate honestly does not exist anywhere, so the demo composition
      // declares documentPresentation 'unavailable' alongside the demo-stub
      // wallet. The shared-slot independent-declarations rule in the
      // coherence assertion (composition-coherence.ts) makes this honest:
      // documentPresentation='unavailable' opts out of the slot, so the
      // demo-stub-marked respondentPlaceSource adapter satisfies the
      // remaining respondentPlace='demo-stub' constraint. When SC-4 + EXT-18
      // land a real VP port, the slot mapping splits and this declaration
      // can move to 'demo-stub' or 'available' as the ceremony allows.
      documentPresentation: 'unavailable',
      // FW-0077: localStorage-backed demo attachment store survives refresh,
      // so the bundled sample form can honestly include an attachment field.
      fileUpload: 'demo-stub',
      // FW-0057 slice 1: in-memory history fixture (4 entries across 2 fake
      // issuers, 3 kinds) satisfies the demo posture. Production declares
      // 'unavailable' until XS-2 lands the multi-issuer fan-out adapter.
      crossIssuerHistory: 'demo-stub',
      // FW-0044 slice 1: in-memory queue adapter satisfies the demo posture.
      // Per the design's §"Demo form posture" decision, the bundled
      // sample-form.json does not declare `x-formspec-offline-submit: true`
      // today; the stub is exercised through synthetic-definition tests +
      // the conformance suite. Production declares 'unavailable' until the
      // IndexedDB adapter (FW-0082) ships a reload-surviving substrate.
      offlineSubmit: 'demo-stub',
      // FW-0027 slice 1: in-memory payment-rail adapter satisfies the demo
      // posture. The bundled demo form does NOT declare
      // `x-formspec-payment-required: true` today (FW-0100 flips the demo
      // once a method-picker UX ships, gated on FW-0089 + FW-0094); the
      // stub is exercised through synthetic-definition tests + the
      // conformance suite + the runtime test matrix.
      payment: 'demo-stub',
      // FW-0040 slice 1: in-memory embed-transport adapter satisfies the
      // demo posture. The bundled demo loads top-level so `isEmbedded()`
      // returns false and the iframe-context gate no-ops; synthetic
      // tests opt into the embedded branch with a freshly-constructed
      // stub. The bundled demo form does NOT declare
      // `x-formspec-embeddable: true` today (FW-0106 gates the demo flip
      // on a worked host-page demo, FW-0053 + FW-0102).
      embed: 'demo-stub',
      // FW-0046 slice 1: in-memory screener catalog seeded with the
      // bundled three-question fixture (J-047 demo). The /screener route
      // exercises the upstream <FormspecScreener> against this fixture
      // end-to-end. Production declares 'unavailable' until adopters
      // wire a real catalog adapter.
      screener: 'demo-stub',
      // FW-0113 slice 1: in-memory reviewer-session + review-thread stubs
      // satisfy the demo posture. Production remains unavailable until an
      // adopter wires durable capability URL + SC-6 storage adapters.
      trustedReviewer: 'demo-stub',
      bringYourOwnAssistant: 'unavailable',
      safeAddress: 'unavailable',
      duressAware: 'unavailable',
      multiParty: 'unavailable',
      recordLifecycle: 'demo-stub',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
        crossIssuerHistory: 'allowed',
        offlineSubmit: 'allowed',
        payment: 'allowed',
        embed: 'allowed',
        screener: 'allowed',
        trustedReviewer: 'allowed',
        bringYourOwnAssistant: 'allowed',
        safeAddress: 'allowed',
        duressAware: 'allowed',
        multiParty: 'allowed',
        recordLifecycle: 'allowed',
      },
      recordLifecycle: {
        correctable: {
          enabled: true,
          correctableFieldSet: ['/fullName', '/householdSize', '/address/street'],
          window: { state: 'open' },
          requiresReason: true,
          requiresEvidence: false,
        },
        withdrawable: {
          enabled: true,
          window: { state: 'closes-at', closesAt: '2026-06-24T23:59:59.000Z' },
          requiresReason: true,
          preDeterminationKernelMode: 'applicant-withdrawn',
          partyScope: 'any-party',
        },
        disputable: {
          enabled: true,
          signerOnly: true,
          requiresReason: true,
        },
      },
      // FW-0040 slice 1: fail-closed default — the bundled demo never
      // mounts in an iframe so no allow-list entry is needed; adopters
      // override per their host integration. The literal '*' opts into
      // any-origin and MUST be documented per the adopter doc warning.
      limits: { embed: { allowedOrigins: [] } },
    } satisfies OrgRuntimePolicy,
    // FW-0066: CompositeFormRuntimePolicyExtractor composes the demo-form
    // URL-keyed seeded-pair opt-in (DemoFormPolicyExtractor) with the
    // attachment-field walker (AttachmentRequirementExtractor), the
    // FW-0044 offline-extension walker (OfflineSubmitRequirementExtractor),
    // and the FW-0027 payment-extension walker (PaymentRequirementExtractor)
    // into one FormRuntimePolicyExtractor port instance. Order matters:
    // later extractors override earlier ones on a key collision, but the
    // four extractors here target disjoint keys (respondentPlace / status
    // vs fileUpload vs offlineSubmit vs payment) so the order is informational.
    formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
      stubFormRuntimePolicyExtractor(),
      new AttachmentRequirementExtractor(),
      new OfflineSubmitRequirementExtractor(),
      new PaymentRequirementExtractor(),
      new EmbeddableExtractor(),
      new TrustedReviewerPolicyExtractor(),
      new RecordLifecycleExtractor(),
    ]),
  };
  return freezeComposition(composition);
}
