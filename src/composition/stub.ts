import { stubDefinitionSource } from '../adapters/stub/definition-source.ts';
import { stubDraftStore } from '../adapters/stub/draft-store.ts';
import { stubIdentityProvider } from '../adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../adapters/stub/status-reader.ts';
import { stubSubmitTransport } from '../adapters/stub/submit-transport.ts';
import { demoSampleForm, demoSampleFormUrl } from '../demo/index.ts';
import {
  demoApplicantStatusResource,
  demoRespondentPlaceSnapshot,
} from '../demo/respondent-place.ts';
import {
  assertCompositionCoherence,
  type FormRuntimePolicy,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../policy/index.ts';
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
      ['urn:wos:case_demo_0001', demoApplicantStatusResource()],
    ]),
    instanceCapabilities: {
      respondentPlace: 'demo-stub',
      status: 'demo-stub',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    // The demo form opts into both seeded features. In demo mode the
    // demo-stub adapters can satisfy them; the resolver enables them and the
    // shell renders the respondent-place panel. Without this opt-in the
    // resolver would mark both `not-requested` (org=allowed + form=silent)
    // and Task 12b's gating would hide the panel.
    getFormRuntimePolicy: (): FormRuntimePolicy => ({
      features: { respondentPlace: 'optional', status: 'optional' },
    }),
  };
  assertCompositionCoherence(composition);
  return composition;
}
