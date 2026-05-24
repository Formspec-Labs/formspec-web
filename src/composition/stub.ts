import {
  AttachmentRequirementExtractor,
  CompositeFormRuntimePolicyExtractor,
} from '../adapters/composing/form-runtime-policy-extractor.ts';
import { stubAttachmentStore } from '../adapters/stub/attachment-store.ts';
import { stubDefinitionSource } from '../adapters/stub/definition-source.ts';
import { stubDraftStore } from '../adapters/stub/draft-store.ts';
import { stubFormRuntimePolicyExtractor } from '../adapters/stub/form-runtime-policy-extractor.ts';
import { stubIdentityProvider } from '../adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../adapters/stub/submit-transport.ts';
import { demoSampleForm, demoSampleFormUrl } from '../demo/index.ts';
import {
  demoApplicantCaseDetail,
  demoRespondentPlaceSnapshot,
} from '../demo/respondent-place.ts';
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

  const composition: Composition = {
    mode: 'demo',
    initialDefinitionUrl: demoSampleFormUrl,
    definitionSource,
    draftStore: stubDraftStore(),
    submitTransport: stubSubmitTransport(),
    identityProvider: stubIdentityProvider(),
    notificationDelivery: stubNotificationDelivery(),
    respondentPlaceSource: stubRespondentPlaceSource(demoRespondentPlaceSnapshot()),
    statusReader: stubStatusReader([
      ['urn:wos:case_demo_0001', demoApplicantCaseDetail()],
    ]),
    attachmentStore: stubAttachmentStore(),
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
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
      },
    } satisfies OrgRuntimePolicy,
    // FW-0066: CompositeFormRuntimePolicyExtractor composes the demo-form
    // URL-keyed seeded-pair opt-in (DemoFormPolicyExtractor) with the
    // attachment-field walker (AttachmentRequirementExtractor) into one
    // FormRuntimePolicyExtractor port instance. Order matters: later
    // extractors override earlier ones on a key collision, but the two
    // extractors here target disjoint keys (respondentPlace / status vs
    // fileUpload) so the order is informational.
    formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
      stubFormRuntimePolicyExtractor(),
      new AttachmentRequirementExtractor(),
    ]),
  };
  return freezeComposition(composition);
}
