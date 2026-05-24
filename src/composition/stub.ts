import {
  noopDefinitionSource,
  noopDraftStore,
  noopIdentityProvider,
  noopSubmitTransport,
} from '../adapters/noop-for-narrowed-route/index.ts';
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
      // FW-0056 slice 1: documentPresentation transitionally shares the
      // respondentPlaceSource slot (see feature-port-map.ts). Demo declares
      // 'demo-stub' to match the demo-stub-marked place adapter; the UI
      // surface (DocumentsRuntime) still renders the deferred-presentation
      // copy on the "Use this document…" action because no real VP
      // ceremony exists in slice 1 — the action's copy is gated by the
      // consumer, not by this declaration. When SC-4 + EXT-18 land a real
      // ceremony, this declaration and the slot mapping split.
      documentPresentation: 'demo-stub',
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

/**
 * Obligations-route sibling of {@link createStubComposition} (FW-0055
 * slice 1, coordinated with FW-0068).
 *
 * Wires the same demo `respondentPlaceSource` + `statusReader` + identity stubs
 * the full stub composition uses, plus the demo `identityProvider` (the
 * /obligations surface is identity-bound). Form-shaped MVP ports
 * (definition / draft / submit) are noop because the obligations route never
 * reads them. `instanceCapabilities` continues to describe what the demo
 * deployment CAN do; the narrowing is the noop form ports only.
 */
export function createStubObligationsRouteComposition(): Composition {
  const composition: Composition = {
    mode: 'demo',
    initialDefinitionUrl: 'about:not-constructed#fw-0055',
    definitionSource: noopDefinitionSource('/obligations'),
    draftStore: noopDraftStore('/obligations'),
    submitTransport: noopSubmitTransport('/obligations'),
    identityProvider: stubIdentityProvider(),
    respondentPlaceSource: stubRespondentPlaceSource(demoRespondentPlaceSnapshot()),
    statusReader: stubStatusReader([
      ['urn:wos:case_demo_0001', demoApplicantCaseDetail()],
    ]),
    instanceCapabilities: {
      respondentPlace: 'demo-stub',
      status: 'demo-stub',
      // FW-0056 slice 1: documentPresentation transitionally shares the
      // respondentPlaceSource slot (see feature-port-map.ts). Stub mode
      // declares 'demo-stub' so the same demo-stub-marked place adapter
      // coheres for both keys. The UI surface (DocumentsRuntime) still
      // renders the deferred-presentation copy on the "Use this document…"
      // action — because no real VP ceremony exists in any composition yet,
      // the action's copy is gated by the consumer, not by this declaration.
      // When the real VP port lands (SC-4 + EXT-18 + a future port ADR),
      // this declaration AND the slot mapping split; until then, the
      // coherence assertion's "same slot, same provenance" rule keeps both
      // declarations honest.
      documentPresentation: 'demo-stub',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
      },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
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
    definitionSource: noopDefinitionSource('/status'),
    draftStore: noopDraftStore('/status'),
    submitTransport: noopSubmitTransport('/status'),
    identityProvider: noopIdentityProvider('/status'),
    respondentPlaceSource: stubRespondentPlaceSource(demoRespondentPlaceSnapshot()),
    statusReader: stubStatusReader([
      ['urn:wos:case_demo_0001', demoApplicantCaseDetail()],
    ]),
    instanceCapabilities: {
      respondentPlace: 'demo-stub',
      status: 'demo-stub',
      // FW-0056 slice 1: documentPresentation transitionally shares the
      // respondentPlaceSource slot (see feature-port-map.ts). Stub mode
      // declares 'demo-stub' so the same demo-stub-marked place adapter
      // coheres for both keys. The UI surface (DocumentsRuntime) still
      // renders the deferred-presentation copy on the "Use this document…"
      // action — because no real VP ceremony exists in any composition yet,
      // the action's copy is gated by the consumer, not by this declaration.
      // When the real VP port lands (SC-4 + EXT-18 + a future port ADR),
      // this declaration AND the slot mapping split; until then, the
      // coherence assertion's "same slot, same provenance" rule keeps both
      // declarations honest.
      documentPresentation: 'demo-stub',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
      },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
}
