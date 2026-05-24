import { stubDefinitionSource } from '../adapters/stub/definition-source.ts';
import { stubDraftStore } from '../adapters/stub/draft-store.ts';
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
  type FormRuntimePolicy,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../policy/index.ts';
import type { FormDefinition } from '../ports/definition-source.ts';
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
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
      },
    } satisfies OrgRuntimePolicy,
    // The demo form opts into both seeded features. Other definitions get
    // an empty policy — form-policy is form-owned per ADR-0011 §Form runtime
    // policy, and only the bundled demo form declares these features. When a
    // real x-formspec-runtime-policy form-extension field is standardized,
    // this extractor reads from definition.extensions instead (arch H-3
    // remediation: keeps the form-policy honesty intact).
    getFormRuntimePolicy: (definition: FormDefinition): FormRuntimePolicy =>
      definition.url === demoSampleFormUrl
        ? { features: { respondentPlace: 'optional', status: 'optional' } }
        : { features: {} },
  };
  return freezeComposition(composition);
}
