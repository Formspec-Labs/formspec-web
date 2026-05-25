import {
  AttachmentRequirementExtractor,
  CompositeFormRuntimePolicyExtractor,
  OfflineSubmitRequirementExtractor,
  PaymentRequirementExtractor,
} from '../adapters/composing/form-runtime-policy-extractor.ts';
import { stubAttachmentStore } from '../adapters/stub/attachment-store.ts';
import { stubDefinitionSource } from '../adapters/stub/definition-source.ts';
import { stubDraftStore } from '../adapters/stub/draft-store.ts';
import { stubFormRuntimePolicyExtractor } from '../adapters/stub/form-runtime-policy-extractor.ts';
import { stubIdentityProvider } from '../adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { stubOfflineSubmitQueue } from '../adapters/stub/offline-submit-queue.ts';
import { stubPaymentRailAdapter } from '../adapters/stub/payment-rail-adapter.ts';
import { stubRespondentHistorySource } from '../adapters/stub/respondent-history-source.ts';
import { stubRespondentPlaceSource } from '../adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../adapters/stub/submit-transport.ts';
import { demoSampleForm, demoSampleFormUrl } from '../demo/index.ts';
import {
  demoApplicantCaseDetail,
  demoRespondentPlaceSnapshot,
} from '../demo/respondent-place.ts';
import { demoHistorySnapshot } from '../demo/respondent-history.ts';
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

  const submitTransport = stubSubmitTransport();
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
    attachmentStore: stubAttachmentStore(),
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
      // FW-0033 slice 1: in-memory stub adapter satisfies the demo posture.
      // Per the design's §"Demo form posture" decision, the bundled
      // sample-form.json has no attachment field today; the stub is exercised
      // through synthetic-definition tests and the conformance suite.
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
      },
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
    ]),
  };
  return freezeComposition(composition);
}
