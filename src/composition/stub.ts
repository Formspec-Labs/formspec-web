import {
  noopDefinitionSource,
  noopDraftStore,
  noopIdentityProvider,
  noopSubmitTransport,
} from '../adapters/noop-for-status-route/index.ts';
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
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
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

/**
 * Status-route sibling of {@link createStubComposition} (FW-0068).
 *
 * Wires the same demo `statusReader` + `respondentPlaceSource` stubs the full
 * stub composition uses so the inline arch-review Finding 1 reshape holds —
 * `instanceCapabilities` continues to describe what the demo deployment can
 * do, not what the slot wires. The narrowing on the /status surface is the
 * noop MVP ports; the gated keys keep their existing `demo-stub` declarations
 * and the coherence assertion still funnels through `freezeComposition`.
 */
export function createStubStatusRouteComposition(): Composition {
  const composition: Composition = {
    mode: 'demo',
    initialDefinitionUrl: 'about:not-constructed#fw-0068',
    definitionSource: noopDefinitionSource(),
    draftStore: noopDraftStore(),
    submitTransport: noopSubmitTransport(),
    identityProvider: noopIdentityProvider(),
    respondentPlaceSource: stubRespondentPlaceSource(demoRespondentPlaceSnapshot()),
    statusReader: stubStatusReader([
      ['urn:wos:case_demo_0001', demoApplicantCaseDetail()],
    ]),
    instanceCapabilities: {
      respondentPlace: 'demo-stub',
      status: 'demo-stub',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
}
