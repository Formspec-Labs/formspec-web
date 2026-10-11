import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { createFormEngine } from '@formspec-org/engine/render';
import { createSemanticControlRegistry } from '@formspec-org/react';
import { canonicalResponseHandoffBytes, canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import { composeSurfaceApp, flattenRegistryEntries, dereferenceBundleExport, resolveDataSourceDescriptor, planStaticContent, type BundleExport } from '@formspec-org/surface';
import { deriveSurfaceRuntimeGeneration, responseReviewHash, starterWidgetModule, STRUCTURED_PANEL_CONFIG_SCHEMA, STRUCTURED_PANEL_DELIVERY_CONTRACT_ID, STRUCTURED_PANEL_RENDERED_CONFIG_NODES, ACCEPTED_RESPONSE_REVIEW_WIDGET_SHAPE, type ResponseReviewData } from '@formspec-org/surface-react';
import type { DataSourcesDocument, FormResponse, LocaleDocument, ResponseActionsDocument, SigningContent } from '@formspec-org/types';
import { sampleFormDefinition, sampleFormResponse, sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import { createNativePackageSigningHost, captureFields, type NativePackageSigningHostPolicy } from '../../src/shared/native-package-signing-host.ts';
import type { RespondentEngineExchange } from '../../src/app/RespondentRuntime.tsx';
import type { HydratedEvaluationCandidate } from '../../src/ports/evaluation-hydration.ts';
import { computeJcsSha256Digest } from '../../src/adapters/http/response-action-ledger.ts';
import type { SavedResponseDraft } from '../../src/ports/response-signing.ts';
import { isUuidV7IdempotencyKey } from '../../src/shared/idempotency-key.ts';
import { createHttpAdapterCohort } from '../../src/adapters/http/cohort.ts';
import { loadCanonicalSigningContentValidator, validateCanonicalFormResponse } from '../../src/adapters/schema/index.ts';
import { jsonResponse, recordingFetch } from '../adapters/http/test-fetch.ts';

beforeAll(() => initFormspecEngine());
const hashResponse = async (response: FormResponse) => createHash('sha256').update(canonicalResponseHandoffBytes(response)).digest('hex');
function fixture(attachment = false, signingScope?: NativePackageSigningHostPolicy['signingScope'], configure?: (policy: NativePackageSigningHostPolicy) => void) {
  const definition = { ...sampleFormDefinition, items: attachment ? [{ key: 'fullName', type: 'field' as const, dataType: 'attachment' as const, label: 'Photo' }] : sampleFormDefinition.items, instances: { readiness: { readonly: false, data: { owned: false, ready: false } } } };
  const response: FormResponse & { id: string } = { ...sampleFormResponse, id: 'stable-id', data: attachment ? { fullName: { kind: 'attachment-ref', uri: 'attachment:owned', mimeType: 'image/png', contentType: 'image/png', filename: 'photo.png', size: 1, hash: `sha256:${'a'.repeat(64)}` } } : sampleFormResponse.data };
  const source = { ref: `${definition.url}#/extensions/x-formspec-signing-content/entries/en`, version: '1' };
  const content = { source, locale: 'en', documentId: 'doc', signingIntent: 'urn:test:sign', declaration: 'Declaration',
    affirmationText: 'Affirmation', delegatedSigningNotice: 'Notice', paperAlternative: 'Paper', electronicConsent: {
      text: 'Consent', controlLabel: 'Consent', textRef: 'urn:test:consent', version: '1' } } satisfies SigningContent;
  const document: ResponseActionsDocument = { $formspecResponseActions: '1.0', version: '1', scope: 'response', targetDefinition: { url: definition.url },
    actions: ['save', 'prepare', 'sign'].map(id => ({ id, intent: 'x-test', validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
      effects: [{ type: 'serviceRequest', requestRef: id, idempotencyKey: '@invocation.id' }] })) as unknown as ResponseActionsDocument['actions'],
    'x-formspec-runtime': { version: '1.0', requests: ['save', 'prepare', 'sign'].map(id => ({ id, adapter: 'http-json', successStatuses: [200],
      request: { method: id === 'save' || id === 'sign' ? 'POST' : 'PATCH', pathTemplate: id === 'save' ? '/runtime/forms/{formId}/drafts' : id === 'sign' ? '/drafts/{draftId}/sign' : '/drafts/{draftId}',
        pathBindings: id === 'save' ? { formId: { from: 'input', path: 'formId' } } : { draftId: { from: 'input', path: 'draftId' } },
        bodyBindings: { '/canonical_response': { from: 'input', path: 'frozenResponse' } } } })) as unknown as NonNullable<ResponseActionsDocument['x-formspec-runtime']>['requests'] } };
  const names = ['definition', 'presentation', 'content', 'response', 'draft', 'actor', 'signingResult', 'actionLabels', 'review'];
  const catalog: DataSourcesDocument = { $formspecDataSources: '1.0', id: 'urn:test:catalog', version: '1', sources: names.map(name => ({
    id: `host:${name}`, kind: 'host-state', owner: 'host', scope: 'route', availability: { level: 'slot', surfaceRef: 'urn:test:surface', routeRef: 'review', slotId: 'review' },
    runtime: { delivery: 'live', cache: { mode: 'subscribe' }, authorizationBoundary: 'host', failureMode: 'block-render',
      provenance: { kind: 'host-state', source: `${['definition', 'presentation'].includes(name) ? 'admitted-response-review' : 'admitted-signing-cohort'}:${name}` } },
    schema: { type: 'object' } })) as unknown as DataSourcesDocument['sources'] };
  const bundle: BundleExport = { manifest: { modules: [{ id: 'test', version: '0.1.0' }], definitions: [{ url: definition.url }], responseActions: { url: 'urn:test:actions' }, dataSources: [{ url: catalog.id }] },
    documents: { [definition.url]: definition, 'urn:test:actions': document, [catalog.id]: catalog } };
  let version = 0;
  async function saved(value: FormResponse): Promise<SavedResponseDraft> {
    const draft = { id: 'owned-id', version: ++version, responseHash: await hashResponse(value) };
    return { draftKey: { formUrl: definition.url, formVersion: definition.version }, response: value, draft, actor: { id: 'server-actor' },
      evidence: { draft_id: draft.id, draft_version: draft.version, form_version_id: 'publication', subject_ref: 'server-actor', status: 'in_progress', draft_state: value.data, canonical_response: value } };
  }
  const saveDraft = vi.fn(async (input: Parameters<NativePackageSigningHostPolicy['controller']['signing']['saveDraft']>[0]) => saved(input.response));
  const prepare = vi.fn(async (input: Parameters<NativePackageSigningHostPolicy['controller']['signing']['prepare']>[0]) => ({ ...await saved(input.response), content }));
  const sign = vi.fn(async (input: Parameters<NativePackageSigningHostPolicy['controller']['signing']['sign']>[0]) => ({ ...input.preparation, ...await saved({ ...input.preparation.response, authoredSignatures: [{}] as unknown as FormResponse['authoredSignatures'] }), verification: { mode: 'delegated-service-key' as const, provider: 'urn:test:delegated', keyId: 'key' } }));
  const read = vi.fn(async () => new Blob(['actual bytes']));
  const invalidateAuthority = vi.fn(); const assertOwner = vi.fn();
  const policy: NativePackageSigningHostPolicy = { signingScope, bundle, moduleId: 'test', definition, registryEntries: [], locales: [], publication: { formId: 'form', formVersionId: 'publication' },
    responseId: response.id, initialLocale: 'en', clearDraftAccess: vi.fn(async () => {}), readiness: { instance: 'readiness', readyPath: 'ready', ownedPath: 'owned' },
    controller: { roles: Object.fromEntries([['saveInitial', 'save'], ['prepare', 'prepare'], ['sign', 'sign']].map(([role, actionRef]) => [role,
      { document, actionRef, requestRef: actionRef, artifactRef: 'urn:test:actions', artifactDigest: `sha256:${'b'.repeat(64)}`, ...(role === 'sign' ? { widgetSource: { moduleId: 'test', widgetName: 'SigningCeremony', slotId: 'review', outputName: 'sign', route: { surfaceId: 'surface', routeId: 'review', routeClass: 'ceremony', params: {} } }, responseSource: { inputName: 'response', catalogRef: catalog.id, sourceRef: 'host:response' } } : {}) }])),
      signing: { saveDraft, prepare, sign }, submitTransport: { submit: vi.fn() }, validateResponse: () => true, hashResponse },
    buildHandoff: () => sampleIntakeHandoff,
    signingContext: () => ({ source, locale: 'en' }), semanticScope: (responseId, renderInstance) => ({ responseId,
      registry: createSemanticControlRegistry(), renderInstanceId: String(renderInstance), definitionArtifact: { artifactRef: definition.url, artifactDigest: `sha256:${'a'.repeat(64)}` } }),
    bindings: Object.fromEntries(names.map(name => [name, { catalogRef: catalog.id, sourceRef: `host:${name}` }])), actionLabels: () => ({}),
    validatePayload: () => ({ valid: true }), attachmentStore: { upload: vi.fn(), read }, assertOwner, invalidateAuthority,
    reviewResponseDigest: hashResponse, canonicalResponseHandoffBytes };
  configure?.(policy);
  const host = createNativePackageSigningHost(policy);
  const engine = createFormEngine(definition); engine.loadResponseData(response.data as Parameters<typeof engine.loadResponseData>[0]);
  const replacements: ReturnType<typeof createFormEngine>[] = [];
  async function attach() { return host.configureRuntime({ engine, definition,
    ...(configure ? { exchangeEngine: async (request: RespondentEngineExchange) => {
      request.assertCurrent(); request.adopt(); replacements.push(request.engine as ReturnType<typeof createFormEngine>);
    } } : {}), draftKey: { formUrl: definition.url, formVersion: definition.version }, claim: null, activeLocale: 'en' }); }
  async function invoke(lease: Awaited<ReturnType<typeof attach>>, actionRef: string) {
    return lease.responseActionInvoker({ document, actionRef, invocationContext: { invocationId: `node:${actionRef}` },
      ports: { dispatchHostEvent: vi.fn(), submit: () => ({ response, validationReport: engine.getValidationReport({ profile: 'on-submit' }) }) } });
  }
  async function prepared() { const lease = await attach(); await invoke(lease, 'save'); await invoke(lease, 'prepare');
    await vi.waitFor(() => expect(host.getSnapshot().runtime).toBeDefined()); return lease; }
  function load(name: string) { const runtime = host.getSnapshot().runtime!;
    return runtime.dataSourceLoader({ descriptor: resolveDataSourceDescriptor([{ catalogRef: catalog.id, document: catalog }], policy.bindings[name])!,
      context: { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'review', slotId: 'review', params: {}, sessionGeneration: host.getSnapshot().generation } }); }
  async function reviewData() { const loaded = await Promise.all(['definition', 'response', 'presentation'].map(load));
    return Object.fromEntries(loaded.map((result, i) => { if (result.status !== 'loaded') throw Error('not loaded');
      return [['definition', 'response', 'presentation'][i], result.value]; })) as unknown as ResponseReviewData; }
  return { policy, host, engine, response, read, prepare, sign, saveDraft, invalidateAuthority, assertOwner, attach, invoke, prepared, load, reviewData, replacements };
}

function unexecutedHostEvents(bundle: BundleExport, definitionUrl: string) {
  return Object.entries(bundle.documents).flatMap(([artifactRef, raw]) => {
    const document = raw as ResponseActionsDocument;
    return document.targetDefinition?.url === definitionUrl ? (document.actions ?? []).flatMap(action => {
      const effect = action.effects?.length === 1 ? action.effects[0] : undefined;
      return effect?.type === 'hostEvent' ? [{ artifactRef, actionRef: action.id, eventName: effect.eventName,
        handle: async () => { throw new Error('Unexecuted fixture host capability'); } }] : [];
    }) : [];
  });
}

function siblingModulePolicy(test: ReturnType<typeof fixture>) {
  const module = { id: 'x-sibling-review', version: '0.1.0' };
  const registryUrl = 'urn:test:sibling-registry'; const surfaceUrl = 'urn:test:surface';
  const common = { version: '0.1.0', status: 'stable', description: 'Generic sibling widget', compatibility: { formspecVersion: '>=1.0.0' } };
  const registry = { $formspecRegistry: '1.1', publisher: { name: 'Test' }, published: '2026-01-01T00:00:00Z', entries: [
    { ...common, name: module.id, category: 'module', contributes: ['x-sibling-panel', 'x-sibling-accepted'] },
    { ...common, name: 'x-sibling-panel', category: 'widget', widgetShape: {
      widgetName: 'StructuredPanel', props: STRUCTURED_PANEL_CONFIG_SCHEMA,
      deliveryContractId: STRUCTURED_PANEL_DELIVERY_CONTRACT_ID, renderedConfigNodes: STRUCTURED_PANEL_RENDERED_CONFIG_NODES,
    } },
    { ...common, name: 'x-sibling-accepted', category: 'widget', widgetShape: ACCEPTED_RESPONSE_REVIEW_WIDGET_SHAPE },
  ] };
  const bundle: BundleExport = { ...test.policy.bundle, manifest: { ...test.policy.bundle.manifest,
    modules: [...test.policy.bundle.manifest.modules!, module], registries: [{ url: registryUrl }], surfaces: [{ url: surfaceUrl }], entrySurface: surfaceUrl },
    documents: { ...test.policy.bundle.documents, [registryUrl]: registry, [surfaceUrl]: {
      $formspecSurface: '0.2', id: 'surface', entry: 'review', routes: [{ id: 'review', path: '/', slots: [
        { id: 'sibling-panel', slotType: 'module-widget', binding: { moduleId: module.id, widgetName: 'StructuredPanel', config: {} } },
      ] }],
    } } };
  return { ...test.policy, bundle, modules: bundle.manifest.modules,
    registryEntries: flattenRegistryEntries(dereferenceBundleExport(bundle).registries).entries };
}

describe('generic native package signing session', () => {
  it('publishes editable activity only for the current form lease and refuses retired actions', async () => {
    const test = fixture();
    expect(test.host.getSnapshot().editableSessionActive).toBe(false);
    const first = await test.attach();
    expect(test.host.getSnapshot().editableSessionActive).toBe(true);
    expect(test.host.getSnapshot().runtime).toBeUndefined();
    const secondEngine = createFormEngine(test.policy.definition);
    const second = await test.host.configureRuntime({ engine: secondEngine, definition: test.policy.definition,
      draftKey: { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version }, claim: null, activeLocale: 'en' });
    first.dispose(); expect(test.host.getSnapshot().editableSessionActive).toBe(true);
    await expect(test.invoke(first, 'save')).rejects.toThrow('retired');
    second.dispose(); expect(test.host.getSnapshot().editableSessionActive).toBe(false);
    await expect(test.invoke(second, 'save')).rejects.toThrow('retired');
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.prepare).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
    const returning = await test.attach();
    expect(test.host.getSnapshot().editableSessionActive).toBe(true);
    returning.invalidate(); expect(test.host.getSnapshot().editableSessionActive).toBe(false);
    await expect(test.invoke(returning, 'save')).rejects.toThrow('retired');
    returning.dispose();
    const finalLease = await test.attach(); expect(test.host.getSnapshot().editableSessionActive).toBe(true);
    test.host.dispose(); expect(test.host.getSnapshot().editableSessionActive).toBe(false);
    await expect(test.invoke(finalLease, 'save')).rejects.toThrow('retired');
    finalLease.dispose(); secondEngine.dispose(); test.engine.dispose();
  });

  it('admits a maintained native Screener entry without granting applicant authority', () => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    const surfaceUrl = 'urn:test:surface', screenerUrl = 'urn:test:screener';
    const screener = { $formspecScreener: '1.0', url: screenerUrl, version: '1.0.0',
      title: 'Eligibility', items: [{ type: 'field', key: 'eligible', dataType: 'boolean', label: 'Eligible' }],
      evaluation: [{ id: 'route', routes: [{ target: 'surface:intake', when: 'true' }] }] };
    const bundle: BundleExport = { ...test.policy.bundle, manifest: { ...test.policy.bundle.manifest,
      surfaces: [{ url: surfaceUrl }], entrySurface: surfaceUrl, screeners: [{ url: screenerUrl, version: '1.0.0' }] },
      documents: { ...test.policy.bundle.documents, [screenerUrl]: screener,
        [surfaceUrl]: { $formspecSurface: '0.3', id: 'surface', entry: 'screen', routes: [
          { id: 'screen', path: '/', slots: [{ id: 'screen', slotType: 'screener',
            binding: { screenerRef: screenerUrl, allowedTargets: ['surface:intake'] } }] },
          { id: 'intake', path: '/intake', slots: [{ id: 'intake', slotType: 'definition-form', binding: { definitionRef: test.policy.definition.url } }] },
        ] } } };
    const unexecuted = vi.fn(async () => { throw new Error('Unexecuted native Screener port'); });
    const policy: NativePackageSigningHostPolicy = { ...test.policy, bundle,
      screenerEntryGate: { protectedTargets: ['surface:intake'] },
      nativeScreener: { selectionKey: 'fixture-screen', retention: { retain: unexecuted, associate: unexecuted },
        hydration: { hydrate: unexecuted }, context: () => { throw new Error('Unexecuted native Screener owner'); } } };
    const host = createNativePackageSigningHost(policy);
    expect(host.getStartupRoute('/')).toMatchObject({ entryHref: '/', requiresHostState: false, screenerDocuments: [screener] });
    expect(host.getStartupRoute('/intake').screenerDocuments).toBeUndefined();
    expect(host.getStartupRoute('/intake').requiresScreener).toBe(true);
    expect(host.getSnapshot().runtime).toBeUndefined();
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.prepare).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
    expect(unexecuted).not.toHaveBeenCalled();
    host.dispose();
    for (const document of [undefined, { ...screener, version: '2.0.0' }, { ...screener, items: [] }]) {
      const documents = { ...bundle.documents }; delete documents[screenerUrl];
      if (document) documents[screenerUrl] = document;
      expect(() => createNativePackageSigningHost({ ...policy, bundle: { ...bundle,
        documents } })).toThrow('native-entry-screener-unavailable');
    }
  });

  it('admits only an exact deployment-pinned image declared at its native Surface slot', () => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    const source = 'https://travel.state.gov/example.jpeg';
    const site = { surfaceId: 'surface', routeId: 'photo', slotId: 'example' };
    const binding = { kind: 'image' as const, content: source, alt: 'Official photo example' };
    const surfaceUrl = 'urn:test:surface';
    const bundle: BundleExport = { ...test.policy.bundle, manifest: { ...test.policy.bundle.manifest,
      surfaces: [{ url: surfaceUrl }], entrySurface: surfaceUrl }, documents: { ...test.policy.bundle.documents,
      [surfaceUrl]: { $formspecSurface: '0.2', id: site.surfaceId, entry: site.routeId,
        routes: [{ id: site.routeId, path: '/', slots: [{ id: site.slotId, slotType: 'static-content', binding }] }] } } };
    const staticAssets = [{ kind: 'image' as const, source }, { kind: 'image' as const, source: 'https://travel.state.gov/undeclared.jpeg' }];
    const host = createNativePackageSigningHost({ ...test.policy, bundle, staticAssets });
    const resolver = host.staticAssetResolver!;
    staticAssets[0].source = 'https://other.test/changed.jpeg';
    expect(planStaticContent({ binding, site, staticAssetResolver: resolver }).plan).toMatchObject({ kind: 'image', src: source, alt: binding.alt });
    for (const request of [
      { kind: 'image' as const, source: 'https://other.test/example.jpeg', site },
      { kind: 'image' as const, source: 'http://travel.state.gov/example.jpeg', site },
      { kind: 'image' as const, source: 'data:image/png;base64,eA==', site },
      { kind: 'image' as const, source: 'https://travel.state.gov/undeclared.jpeg', site },
      { kind: 'image' as const, source, site: { ...site, slotId: 'other' } },
      { kind: 'video', source, site },
    ]) expect(resolver(request as Parameters<typeof resolver>[0])).toEqual({ status: 'refused' });
    const absent = createNativePackageSigningHost({ ...test.policy, bundle });
    expect(absent.staticAssetResolver).toBeUndefined();
    expect(planStaticContent({ binding, site }).diagnostics[0].code).toBe('STATIC-IMAGE-SOURCE-REFUSED');
    host.dispose(); absent.dispose(); expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
  });

  it('registers only explicit matching modules and keeps sibling accepted review on maintained defaults', () => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    const policy = siblingModulePolicy(test); const host = createNativePackageSigningHost(policy);
    const signing = host.widgetModules.find(module => module.moduleId === test.policy.moduleId)!;
    const sibling = host.widgetModules.find(module => module.moduleId === 'x-sibling-review')!;
    expect(sibling.widgets.AcceptedResponseReview).toBe(starterWidgetModule('x-sibling-review').widgets.AcceptedResponseReview);
    expect(signing.widgets.AcceptedResponseReview).not.toBe(sibling.widgets.AcceptedResponseReview);
    expect(Object.isFrozen(host.widgetModules)).toBe(true); host.dispose();
  });

  it.each(['missing', 'extra', 'duplicate', 'wrong-version', 'delivery'] as const)('refuses %s module registration or delivery correspondence', mode => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    const policy = siblingModulePolicy(test);
    if (mode === 'missing') policy.modules = [test.policy.bundle.manifest.modules![0]];
    if (mode === 'extra') policy.modules = [...policy.modules!, { id: 'x-absent', version: '0.1.0' }];
    if (mode === 'duplicate') policy.modules = [...policy.modules!, policy.modules![0]];
    if (mode === 'wrong-version') policy.modules = [policy.modules![0], { id: 'x-sibling-review', version: '99.0.0' }];
    if (mode === 'delivery') {
      const registry = policy.registryEntries.map(entry => entry.name === 'x-sibling-panel' ? { ...entry,
        widgetShape: { ...entry.widgetShape!, deliveryContractId: 'urn:test:wrong-delivery' } } : entry);
      const changed = structuredClone(policy.bundle);
      changed.documents = { ...changed.documents, 'urn:test:sibling-registry': {
        ...(changed.documents['urn:test:sibling-registry'] as object), entries: registry,
      } };
      policy.bundle = changed; policy.registryEntries = registry;
    }
    expect(() => createNativePackageSigningHost(policy)).toThrow(mode === 'delivery' ? 'native-widget-unadmitted' : 'native-resource-unadmitted');
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
  });

  it('refuses sibling access to applicant prepared data and action authority', async () => {
    const test = fixture(); test.host.dispose();
    const policy = siblingModulePolicy(test); const host = createNativePackageSigningHost(policy);
    const lease = await host.configureRuntime({ engine: test.engine, definition: policy.definition,
      draftKey: { formUrl: policy.definition.url, formVersion: policy.definition.version }, claim: null, activeLocale: 'en' });
    await test.invoke(lease, 'save'); await test.invoke(lease, 'prepare');
    await vi.waitFor(() => expect(host.getSnapshot().runtime).toBeDefined());
    const descriptor = resolveDataSourceDescriptor(host.bundle.dataSources!, policy.bindings.response)!;
    const request = { descriptor, context: { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'review',
      slotId: 'sibling-panel', params: {}, sessionGeneration: host.getSnapshot().generation } };
    expect(await host.getSnapshot().runtime!.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
    const admission = policy.controller.roles.sign!; const prepared = host.getSnapshot().controller!.prepared!;
    const result = await host.widgetExecutor({ document: admission.document, actionRef: admission.actionRef, invocationId: 'sibling:sign',
      source: { ...admission.widgetSource!, moduleId: 'x-sibling-review', slotId: 'sibling-panel' },
      responseContext: { inputName: 'response', source: policy.bindings.response, definition: policy.definition, response: prepared.response },
      input: { draftId: prepared.draft.id, draftVersion: prepared.draft.version, responseId: prepared.response.id!,
        responseHash: prepared.draft.responseHash, source: prepared.content.source as never, locale: 'en', signerName: 'Actual signer', consentAccepted: true } });
    expect('invocation' in result ? result.invocation.status : result.status).toBe('failed'); expect(JSON.stringify(result)).toContain('context-mismatch'); expect(test.sign).not.toHaveBeenCalled();
    lease.dispose(); host.dispose(); test.engine.dispose();
  });


  it('admits one selected Definition within a complete five-Definition bundle', () => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    const siblings = Array.from({ length: 4 }, (_, index) => ({ ...test.policy.definition, url: `urn:test:sibling-definition:${index}` }));
    const bundle: BundleExport = { ...test.policy.bundle, manifest: { ...test.policy.bundle.manifest,
      definitions: [...test.policy.bundle.manifest.definitions!, ...siblings.map(definition => ({ url: definition.url, version: definition.version }))] },
    documents: { ...test.policy.bundle.documents, ...Object.fromEntries(siblings.map(definition => [definition.url, definition])) } };
    const host = createNativePackageSigningHost({ ...test.policy, bundle });
    expect(host.bundle.definitions.size).toBe(5);
    expect(host.bundle.definitions.get(test.policy.definition.url)).toEqual(test.policy.definition);
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled(); host.dispose();
  });

  it.each(['missing', 'duplicate', 'wrong-version', 'different-body'] as const)('refuses a %s selected Definition resource', mode => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    const bundle = structuredClone(test.policy.bundle);
    if (mode === 'missing') bundle.manifest.definitions = [];
    if (mode === 'duplicate') bundle.manifest.definitions = [...bundle.manifest.definitions!, bundle.manifest.definitions![0]];
    if (mode === 'wrong-version') bundle.manifest.definitions = [{ url: test.policy.definition.url, version: '99.0.0' }];
    if (mode === 'different-body') bundle.documents = { ...bundle.documents, [test.policy.definition.url]: { ...test.policy.definition, title: 'Different admitted body' } };
    expect(() => createNativePackageSigningHost({ ...test.policy, bundle })).toThrow('native-resource-unadmitted');
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
  });


  it('initializes qualified submitted state without creating an engine or controller and clears only its draft key', async () => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    const locale: LocaleDocument = { $formspecLocale: '2.0', url: 'urn:test:locale:en', version: '1', locale: 'en',
      target: { kind: 'definition', url: test.policy.definition.url }, strings: {} };
    const createEngine = vi.fn(createFormEngine);
    const policy = { ...test.policy, createEngine, locales: [locale], bundle: { ...test.policy.bundle,
      documents: { ...test.policy.bundle.documents, [locale.url!]: locale } } };
    const host = createNativePackageSigningHost(policy);
    const response = { ...test.response, displayedLocale: { url: locale.url, version: locale.version, locale: locale.locale } };
    const draftKey = { formUrl: response.definitionUrl, formVersion: response.definitionVersion };
    const state = { kind: 'submitted' as const, response, draft: { id: 'actual-owned-draft', version: 6 }, subjectRef: 'anon:owner', formVersionId: 'publication' };
    await host.configureSubmittedRuntime({ definition: policy.definition, draftKey, claim: null, state });
    expect(createEngine).not.toHaveBeenCalled(); expect(host.getSnapshot().controller).toBeUndefined();
    expect(host.getSnapshot().runtime).toBeUndefined();
    expect(host.getSnapshot().submitted).toEqual({ recordKind: 'response', referenceNumber: response.id });
    await expect(host.selectLocale('en')).rejects.toThrow();
    await expect(host.configureSubmittedRuntime({ definition: policy.definition, draftKey, claim: null,
      state: { ...state, formVersionId: 'wrong' } })).rejects.toThrow();
    await host.clearDraftAccess(); expect(policy.clearDraftAccess).toHaveBeenCalledWith(draftKey);
    expect(host.getSnapshot().submitted).toBeUndefined(); host.dispose();
    await expect(host.configureSubmittedRuntime({ definition: policy.definition, draftKey, claim: null, state })).rejects.toThrow();
  });
  it.each([false, true])('retains verified ownership through edits and attachment upload with captured-data reload=%s, then owned PATCH and Prepare', async reload => {
    const test = fixture(); test.host.dispose();
    const source = { ref: `${test.policy.definition.url}#/extensions/x-formspec-signing-content/entries/en`, version: '1' };
    const content: SigningContent = { source, locale: 'en', documentId: 'doc', signingIntent: 'urn:test:sign',
      declaration: 'Declaration', affirmationText: 'Affirmation', delegatedSigningNotice: 'Notice', paperAlternative: 'Paper',
      electronicConsent: { text: 'Consent', controlLabel: 'Consent', textRef: 'urn:test:consent', version: '1' } };
    const definition = { ...test.policy.definition, items: [...test.policy.definition.items,
      { key: 'photo', type: 'field' as const, dataType: 'attachment' as const, label: 'Photo' }],
      extensions: { 'x-formspec-signing-content': { version: '1.0' as const, entries: { en: content } } } };
    const locale: LocaleDocument = { $formspecLocale: '2.0', url: 'urn:test:locale:en', version: '1', locale: 'en',
      target: { kind: 'definition', url: definition.url }, strings: {} };
    const document = structuredClone(test.policy.controller.roles.saveInitial!.document);
    document.actions = ['save-initial', 'save-owned', 'prepare'].map(id => ({ id, intent: 'save-draft',
      validation: { profile: id === 'prepare' ? 'on-submit' : 'off', blocking: id === 'prepare' ? 'block-on-error' : 'non-blocking', persistence: id === 'prepare' ? 'complete-response' : 'draft-checkpoint' },
      effects: [{ type: 'serviceRequest', requestRef: id, idempotencyKey: '@invocation.id' }] })) as unknown as ResponseActionsDocument['actions'];
    document['x-formspec-runtime'] = { version: '1.0', requests: document.actions.map(action => {
      const initial = action.id === 'save-initial';
      return { id: action.id, adapter: 'http-json', successStatuses: [200], request: {
        method: initial ? 'POST' : 'PATCH', pathTemplate: initial ? '/runtime/forms/{formId}/drafts' : '/drafts/{draftId}',
        pathBindings: initial ? { formId: { from: 'input', path: 'formId' } } : { draftId: { from: 'input', path: 'draftId' } },
        bodyBindings: { '/canonical_response': { from: 'input', path: 'frozenResponse' }, '/draft_state': { from: 'input', path: 'frozenResponse.data' },
          ...(!initial ? { '/expected_draft_version': { from: 'input', path: 'draftVersion' } } : {}) } } };
    }) as unknown as NonNullable<ResponseActionsDocument['x-formspec-runtime']>['requests'] };
    const key = { formUrl: definition.url, formVersion: definition.version, subjectRef: 'server-actor' };
    let version = 0; let stored: FormResponse | undefined;
    const view = () => ({ draft_id: 'owned-id', form_version_id: 'publication', subject_ref: 'server-actor', draft_version: version,
      status: 'in_progress', draft_state: stored!.data, canonical_response: structuredClone(stored) });
    const transport = recordingFetch(request => {
      if (request.method === 'GET') return jsonResponse(view());
      const body = request.body as { canonical_response: FormResponse; expected_draft_version?: number };
      if (request.method === 'PATCH') expect(body.expected_draft_version).toBe(version);
      else { expect(request.method).toBe('POST'); expect(request.url).toBe('https://server.example.test/runtime/forms/form/drafts'); expect(version).toBe(0); }
      stored = structuredClone(body.canonical_response); version++; return jsonResponse(view());
    });
    const metadata = new Map<string, unknown>();
    const cohort = createHttpAdapterCohort({ baseUrl: 'https://server.example.test', fetchImpl: transport.fetch,
      formIdResolver: () => 'form', resumeMetadata: { read: slot => metadata.get(slot), write: (slot, value) => { metadata.set(slot, structuredClone(value)); }, remove: slot => { metadata.delete(slot); } },
      responseSigning: { validateResponse: validateCanonicalFormResponse, validateContent: await loadCanonicalSigningContentValidator(),
        signingProfileDigest: async response => createHash('sha256').update(canonicalResponseSignedPayloadBytes(response)).digest('hex'), keyId: 'unused-sign-key' } });
    const roles = Object.fromEntries([['saveInitial', 'save-initial'], ['saveOwned', 'save-owned'], ['prepare', 'prepare']].map(([role, actionRef]) =>
      [role, { document, actionRef, requestRef: actionRef, artifactRef: 'urn:test:actions', artifactDigest: `sha256:${'b'.repeat(64)}` }]));
    const policy: NativePackageSigningHostPolicy = { ...test.policy, definition, locales: [locale],
      bundle: { ...test.policy.bundle, documents: { ...test.policy.bundle.documents, [definition.url]: definition, 'urn:test:actions': document, [locale.url!]: locale } },
      controller: { ...test.policy.controller, signing: cohort.responseSigning!, roles, validateResponse: validateCanonicalFormResponse },
      signingContext: () => ({ source, locale: 'en' }), invalidateAuthority: (_reason, actualKey) => { if (actualKey) cohort.invalidateResponseSigningScope!(actualKey); },
      clearDraftAccess: actualKey => cohort.draftStore.delete(actualKey) };
    let host = createNativePackageSigningHost(policy);
    let engine = createFormEngine(definition); engine.loadLocale(locale); engine.setLocale('en'); engine.setValue('fullName', 'Partial');
    let lease = await host.configureRuntime({ engine, definition, draftKey: key, claim: null, activeLocale: 'en' });
    const invoke = async (actionRef: string) => lease.responseActionInvoker({ document, actionRef,
      invocationContext: { invocationId: `node:${actionRef}` }, ports: { dispatchHostEvent: vi.fn(), submit: () => ({
        response: { ...engine.getResponse({ profile: actionRef === 'prepare' ? 'on-submit' : 'off' }), id: test.response.id },
        validationReport: engine.getValidationReport({ profile: actionRef === 'prepare' ? 'on-submit' : 'off' }) }) } });
    await invoke('save-initial'); expect(host.getSnapshot().controller).toMatchObject({ phase: 'saved' }); expect(host.getSnapshot().controller?.saved?.draft.version).toBe(1);
    engine.setValue('fullName', 'Complete'); engine.setValue('fullName', 'Complete edited');
    const attachment = { kind: 'attachment-ref', uri: 'attachment:uploaded', contentType: 'image/png', mimeType: 'image/png',
      filename: 'uploaded.png', size: 17, hash: `sha256:${'c'.repeat(64)}` };
    engine.setValue('photo', attachment);
    if (reload) {
      const capturedData = structuredClone(engine.getResponse({ profile: 'off' }).data);
      lease.dispose(); host.dispose(); engine.dispose();
      const restored = await cohort.draftStore.load(key);
      expect(restored?.data.photo).toBeNull(); expect(version).toBe(1);
      host = createNativePackageSigningHost(policy);
      engine = createFormEngine(definition); engine.loadLocale(locale); engine.setLocale('en');
      engine.loadResponseData(restored!.data as Parameters<typeof engine.loadResponseData>[0]);
      lease = await host.configureRuntime({ engine, definition, draftKey: key, claim: null, activeLocale: 'en', restoredResponse: restored! });
      engine.loadResponseData(capturedData as Parameters<typeof engine.loadResponseData>[0]);
      expect(engine.getResponse({ profile: 'off' }).data).toEqual(capturedData);
    }
    expect(host.getSnapshot().controller?.owned).toBe(true);
    expect(host.getSnapshot().controller?.saved).toBeUndefined(); expect(host.getSnapshot().runtime).toBeUndefined();
    await invoke('save-owned'); expect(host.getSnapshot().controller?.saved?.draft.version).toBe(2);
    expect(stored!.data.photo).toEqual(attachment);
    expect(transport.requests.filter(request => request.method === 'POST')).toHaveLength(1);
    expect(transport.requests.filter(request => request.method === 'PATCH')).toHaveLength(1);
    await invoke('prepare'); expect(host.getSnapshot().controller?.prepared?.draft.version).toBe(3);
    expect(host.getSnapshot().controller?.prepared?.response).toEqual(stored);
    lease.dispose(); host.dispose(); engine.dispose(); test.engine.dispose();
  });
  it('captures actual localized public form titles without changing authority and retains them across retired leases', async () => {
    const test = fixture(); test.host.dispose();
    test.invalidateAuthority.mockClear();
    const actual = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/native-signing-r5/native-bundle.json'), 'utf8')) as BundleExport;
    const resolved = dereferenceBundleExport(actual); const definition = [...resolved.definitions.values()][0];
    const locales = Object.values(actual.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document) as LocaleDocument[];
    const host = createNativePackageSigningHost({ ...test.policy, bundle: actual, definition, moduleId: actual.manifest.modules![0].id,
      locales, registryEntries: flattenRegistryEntries(resolved.registries).entries, readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' },
      controller: { ...test.policy.controller, roles: {} }, bindings: {}, hostEvents: unexecutedHostEvents(actual, definition.url) });
    expect(host.getSnapshot().formTitle).toBe(definition.title);
    const attach = async () => {
      const engine = createFormEngine(definition); for (const document of locales) engine.loadLocale(document); engine.setLocale('en');
      const lease = await host.configureRuntime({ engine, definition, draftKey: { formUrl: definition.url, formVersion: definition.version }, claim: null, activeLocale: 'en' });
      return { engine, lease };
    };
    const first = await attach(); const english = locales.find(document => document.locale === 'en')!.strings['$form.title'];
    const spanish = locales.find(document => document.locale === 'es-US')!.strings['$form.title'];
    expect(host.getSnapshot().formTitle).toBe(english);
    const epoch = host.getSnapshot().sessionGeneration; const delivery = host.getSnapshot().generation;
    const changed = vi.fn(); const unsubscribe = host.subscribe(changed);
    first.engine.setLocale('es-US'); expect(host.getSnapshot().formTitle).toBe(spanish);
    expect(changed).toHaveBeenCalledOnce(); first.engine.setLocale('es-US'); expect(changed).toHaveBeenCalledOnce();
    expect(host.getSnapshot().sessionGeneration).toBe(epoch); expect(host.getSnapshot().generation).toBe(delivery);
    const second = await attach(); expect(host.getSnapshot().formTitle).toBe(english);
    second.engine.setLocale('es-US'); expect(host.getSnapshot().formTitle).toBe(spanish);
    first.engine.setLocale('en'); expect(host.getSnapshot().formTitle).toBe(spanish);
    first.lease.dispose(); first.engine.dispose(); expect(host.getSnapshot().formTitle).toBe(spanish);
    expect(host.getSnapshot().editableSessionActive).toBe(true);
    second.lease.dispose(); second.engine.dispose(); expect(host.getSnapshot().formTitle).toBe(spanish);
    expect(host.getSnapshot().editableSessionActive).toBe(false);
    expect(host.getSnapshot().sessionGeneration).toBe(epoch); expect(host.getSnapshot().generation).toBe(delivery);
    expect(test.invalidateAuthority).not.toHaveBeenCalled(); unsubscribe(); host.dispose(); test.engine.dispose();
  });
  it('refuses foreign scoped host deliveries and widget actions before backing calls', async () => {
    const scope = { surface: { url: 'urn:test:surface', version: '1' }, surfaceId: 'surface', moduleId: 'test',
      route: 'review', ceremonySlot: 'ceremony', reviewSlot: 'review' };
    const test = fixture(false, scope); const lease = await test.prepared(); const snapshot = test.host.getSnapshot();
    const marker = test.host.allocateSurfaceSessionMarker(snapshot.sessionGeneration);
    const visit = test.host.createSurfaceVisit(marker, snapshot.sessionGeneration); visit.activate();
    const ports = visit.bindRuntime();
    const request = { descriptor: resolveDataSourceDescriptor(test.host.bundle.dataSources!, test.policy.bindings.response)!,
      context: { surfaceId: scope.surfaceId, surfaceRef: scope.surface.url, routeId: scope.route, slotId: scope.reviewSlot,
        moduleId: scope.moduleId, widgetName: 'ResponseReview', params: {}, sessionGeneration: marker } };
    const authorize = vi.spyOn(snapshot.runtime!, 'authorizeDataSource');
    const load = vi.spyOn(snapshot.runtime!, 'dataSourceLoader');
    expect(await ports.authorizeDataSource(request)).toMatchObject({ status: 'authorized' });
    expect(await ports.dataSourceLoader(request)).toMatchObject({ status: 'loaded' });
    authorize.mockClear(); load.mockClear();
    for (const key of ['surfaceId', 'surfaceRef', 'routeId', 'slotId', 'moduleId', 'widgetName'] as const) {
      const foreign = { ...request, context: { ...request.context, [key]: 'foreign' } };
      expect(await ports.authorizeDataSource(foreign)).toMatchObject({ status: 'refused' });
      expect(await ports.dataSourceLoader(foreign)).toMatchObject({ status: 'unavailable' });
      expect(ports.dataSourceRevision(foreign)).toBeUndefined();
    }
    expect(authorize).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
    const role = test.policy.controller.roles.sign!;
    for (const key of ['routeId', 'surfaceRef'] as const) {
      await expect(ports.widgetActionExecutor({ document: role.document, actionRef: role.actionRef, invocationId: 'foreign-act',
        source: { ...role.widgetSource!, slotId: scope.ceremonySlot, route: { ...role.widgetSource!.route, [key]: 'foreign' } },
        input: {} })).rejects.toThrow('native-signing-scope-unadmitted');
    }
    expect(test.sign).not.toHaveBeenCalled();
    visit.dispose(); lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('requires pre-registered maintained Surface markers and retires visits permanently across returns and edits', async () => {
    const test = fixture(); const lease = await test.prepared(); const snapshot = test.host.getSnapshot();
    const app = composeSurfaceApp(test.host.bundle.surfaces);
    const marker = deriveSurfaceRuntimeGeneration({ app, location: '/review', sessionGeneration: test.host.allocateSurfaceSessionMarker(snapshot.sessionGeneration) });
    const visit = test.host.createSurfaceVisit(marker, snapshot.sessionGeneration);
    const ports = visit.bindRuntime();
    const binding = test.policy.bindings.response;
    const descriptor = resolveDataSourceDescriptor(test.host.bundle.dataSources!, binding)!;
    const request = { descriptor, context: { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'review', slotId: 'review', params: {}, sessionGeneration: marker } };
    expect(await ports.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
    visit.activate(); expect(await ports.dataSourceLoader(request)).toMatchObject({ status: 'loaded', revision: snapshot.controller!.prepared!.draft.version });
    const responseRevision = ports.dataSourceRevision(request);
    const reviewRequest = { ...request, descriptor: resolveDataSourceDescriptor(test.host.bundle.dataSources!, test.policy.bindings.review)! };
    const reviewRevision = ports.dataSourceRevision(reviewRequest); const data = await test.reviewData();
    test.host.reviewOptions.onReviewState!({ status: 'ready', contextIdentity: await responseReviewHash(data), responseHash: data.presentation.responseHash,
      actorRef: data.presentation.actorRef, draft: data.presentation.draft, locale: data.presentation.locale, phase: data.presentation.phase });
    expect(ports.dataSourceRevision(request)).toBe(responseRevision);
    expect(ports.dataSourceRevision(reviewRequest)).not.toBe(reviewRevision);
    expect(await ports.dataSourceLoader(request)).toMatchObject({ status: 'loaded', value: snapshot.controller!.prepared!.response });
    expect(await ports.dataSourceLoader({ ...request, context: { ...request.context, sessionGeneration: snapshot.generation } })).toMatchObject({ status: 'unavailable' });
    visit.dispose(); const returnMarker = deriveSurfaceRuntimeGeneration({ app, location: '/review', sessionGeneration: test.host.allocateSurfaceSessionMarker(snapshot.sessionGeneration) });
    expect(returnMarker).not.toBe(marker);
    const returning = test.host.createSurfaceVisit(returnMarker, snapshot.sessionGeneration); returning.activate();
    expect(await ports.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
    const returned = returning.bindRuntime(); expect(await returned.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
    const currentRequest = { ...request, context: { ...request.context, sessionGeneration: returnMarker } };
    expect(await returned.dataSourceLoader(currentRequest)).toMatchObject({ status: 'loaded' });
    test.engine.setValue('fullName', 'Edited'); expect(await returned.dataSourceLoader(currentRequest)).toMatchObject({ status: 'unavailable' });
    returning.dispose(); lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it.each(['sibling', 'ambiguous', 'version'] as const)('refuses %s language selection without crossing Definition identity', async mode => {
    const test = fixture(); test.host.dispose(); test.engine.dispose();
    test.invalidateAuthority.mockClear();
    const sibling = { ...test.policy.definition, url: 'urn:test:sibling' };
    const en: LocaleDocument = { $formspecLocale: '2.0', url: 'urn:test:locale:en', version: '1', locale: 'en',
      target: { kind: 'definition', url: test.policy.definition.url }, strings: {} };
    const es: LocaleDocument = { ...en, url: 'urn:test:locale:es', locale: 'es', target: { kind: 'definition',
      url: mode === 'sibling' ? sibling.url : test.policy.definition.url, ...(mode === 'version' ? { compatibleVersions: '99.0.0' } : {}) } };
    const locales = [en, es, ...(mode === 'ambiguous' ? [{ ...es, url: 'urn:test:locale:es:duplicate' }] : [])];
    const bundle: BundleExport = { ...test.policy.bundle, manifest: { ...test.policy.bundle.manifest,
      definitions: [...test.policy.bundle.manifest.definitions!, { url: sibling.url, version: sibling.version }] },
      documents: { ...test.policy.bundle.documents, [sibling.url]: sibling, ...Object.fromEntries(locales.map(document => [document.url, document])) } };
    const host = createNativePackageSigningHost({ ...test.policy, bundle, locales }); const engine = createFormEngine(test.policy.definition);
    const lease = await host.configureRuntime({ engine, definition: test.policy.definition,
      draftKey: { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version }, claim: null, activeLocale: 'en' });
    await expect(host.selectLocale('es')).rejects.toThrow('native-locale-unavailable');
    expect(host.getSnapshot().locale).toBe('en'); expect(test.invalidateAuthority).not.toHaveBeenCalled();
    lease.dispose(); host.dispose(); engine.dispose();
  });

  it('keeps selected Locale on a returning lease, while a new session adopts the saved pin', async () => {
    const test = fixture(); test.host.dispose();
    const locales: LocaleDocument[] = ['en', 'es'].map(locale => ({ $formspecLocale: '2.0', url: `urn:test:locale:${locale}`,
      version: '1', locale, target: { kind: 'definition', url: test.policy.definition.url }, strings: {} }));
    const policy = { ...test.policy, locales, bundle: { ...test.policy.bundle,
      documents: { ...test.policy.bundle.documents, ...Object.fromEntries(locales.map(document => [document.url, document])) } } };
    const host = createNativePackageSigningHost(policy);
    const attach = async (activeLocale: string) => {
      const engine = createFormEngine(policy.definition); locales.forEach(document => engine.loadLocale(document));
      engine.setLocale(activeLocale); engine.loadResponseData(test.response.data as Parameters<typeof engine.loadResponseData>[0]);
      const lease = await host.configureRuntime({ engine, definition: policy.definition, draftKey: { formUrl: policy.definition.url, formVersion: policy.definition.version }, claim: null, activeLocale });
      return { engine, lease };
    };
    const first = await attach('en'); await host.selectLocale('es');
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.prepare).not.toHaveBeenCalled();
    first.lease.dispose(); first.engine.dispose();
    const returning = await attach('en');
    expect(host.getSnapshot().locale).toBe('es'); expect(returning.engine.getResponse({ profile: 'off' }).displayedLocale?.locale).toBe('es');
    const beforeSave = createNativePackageSigningHost(policy); const oldDraftEngine = createFormEngine(policy.definition);
    locales.forEach(document => oldDraftEngine.loadLocale(document)); oldDraftEngine.setLocale('en');
    const oldDraftLease = await beforeSave.configureRuntime({ engine: oldDraftEngine, definition: policy.definition,
      draftKey: { formUrl: policy.definition.url, formVersion: policy.definition.version }, claim: null, activeLocale: 'en', restoredResponse: test.response });
    expect(beforeSave.getSnapshot().locale).toBe('en');
    oldDraftLease.dispose(); oldDraftEngine.dispose(); beforeSave.dispose();
    const response = { ...returning.engine.getResponse({ profile: 'off' }), id: test.response.id };
    await returning.lease.responseActionInvoker({ document: policy.controller.roles.saveInitial!.document, actionRef: 'save', invocationContext: { invocationId: 'node:locale-save' },
      ports: { dispatchHostEvent: vi.fn(), submit: () => ({ response, validationReport: returning.engine.getValidationReport({ profile: 'on-submit' }) }) } });
    expect(test.saveDraft.mock.calls[0][0].response.displayedLocale?.locale).toBe('es');
    returning.lease.dispose(); returning.engine.dispose(); host.dispose();
    const reloaded = createNativePackageSigningHost(policy); const restoredEngine = createFormEngine(policy.definition);
    locales.forEach(document => restoredEngine.loadLocale(document)); restoredEngine.setLocale('es');
    const restored = await reloaded.configureRuntime({ engine: restoredEngine, definition: policy.definition, draftKey: { formUrl: policy.definition.url, formVersion: policy.definition.version },
      claim: null, activeLocale: 'es', restoredResponse: response });
    expect(reloaded.getSnapshot().locale).toBe('es'); restored.dispose(); restoredEngine.dispose(); reloaded.dispose(); test.engine.dispose();
  });
  it('remains unavailable before explicit Save, publishes one prepared revision and retires only the form lease', async () => {
    const test = fixture(); const lease = await test.attach();
    expect(test.host.getSnapshot().runtime).toBeUndefined(); expect(lease.semanticControlScope?.responseId).toBe(test.response.id);
    const sessionGeneration = test.host.getSnapshot().sessionGeneration;
    await test.invoke(lease, 'save'); await test.invoke(lease, 'prepare');
    await vi.waitFor(() => expect(test.host.getSnapshot().runtime).toBeDefined());
    const revision = test.host.getSnapshot().controller!.prepared!.draft.version;
    expect(test.host.getSnapshot().sessionGeneration).toBe(sessionGeneration);
    for (const name of Object.keys(test.policy.bindings)) expect(await test.load(name)).toMatchObject({ status: 'loaded', recordId: 'owned-id', revision });
    lease.dispose(); test.engine.dispose();
    expect(test.host.getSnapshot().controller?.prepared).toBeDefined(); expect(test.invalidateAuthority).not.toHaveBeenCalled();
    await expect(test.invoke(lease, 'save')).rejects.toThrow('retired'); test.host.dispose();
  });
  it('captures labels and keeps readiness scratch outside Response answers without a recreation loop', async () => {
    const test = fixture(); const lease = await test.prepared();
    const review = await test.reviewData(); expect(review.presentation.fields.fullName.label).toBe('Full name');
    expect(review.response.data).toEqual(test.response.data); expect(review.response.data).not.toHaveProperty('readiness');
    test.engine.setInstanceValue('readiness', 'owned', false);
    expect(test.invalidateAuthority).not.toHaveBeenCalled(); expect(test.prepare).toHaveBeenCalledOnce();
    lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('accepts only complete current review identity and preserves generation when readiness changes', async () => {
    const test = fixture(); const lease = await test.prepared(); const data = await test.reviewData();
    const generation = test.host.getSnapshot().generation;
    const state = { status: 'ready' as const, responseHash: data.presentation.responseHash, actorRef: data.presentation.actorRef,
      draft: data.presentation.draft, locale: data.presentation.locale, phase: data.presentation.phase, contextIdentity: await responseReviewHash(data) };
    test.host.reviewOptions.onReviewState!({ ...state, actorRef: 'other' });
    expect(await test.load('review')).toMatchObject({ value: { state: { status: 'pending' } } });
    test.host.reviewOptions.onReviewState!(state);
    expect(await test.load('review')).toMatchObject({ value: { state: { status: 'ready' } } });
    expect(test.host.getSnapshot().generation).toBe(generation);
    lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('fences genuine answer edits synchronously while preserving the owned branch and requiring new Save', async () => {
    const test = fixture(); const lease = await test.prepared(); const old = test.host.getSnapshot().runtime!;
    const sessionGeneration = test.host.getSnapshot().sessionGeneration;
    test.engine.setValue('fullName', 'Changed answer');
    expect(test.host.getSnapshot().sessionGeneration).toBeGreaterThan(sessionGeneration);
    expect(test.invalidateAuthority).toHaveBeenCalledWith('edit', { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version }); expect(test.host.getSnapshot().runtime).toBeUndefined();
    expect(test.host.getSnapshot().controller?.owned).toBe(true);
    expect(test.host.getSnapshot().editableSessionActive).toBe(true);
    expect(test.host.getSnapshot().controller?.prepared).toBeUndefined();
    lease.dispose(); test.host.dispose(); test.engine.dispose(); expect(old).toBeDefined();
  });
  it('keeps completed unsigned review ready through the Sign phase and publishes a distinct signed review', async () => {
    const test = fixture(); const lease = await test.prepared(); const data = await test.reviewData();
    test.host.reviewOptions.onReviewState!({ status: 'ready', contextIdentity: await responseReviewHash(data),
      responseHash: data.presentation.responseHash, actorRef: data.presentation.actorRef, draft: data.presentation.draft,
      locale: data.presentation.locale, phase: data.presentation.phase });
    const prepared = test.host.getSnapshot().controller!.prepared!;
    const admission = test.policy.controller.roles.sign!;
    const result = await test.host.widgetExecutor({ document: admission.document, actionRef: admission.actionRef, invocationId: 'widget:sign',
      source: admission.widgetSource!, responseContext: { inputName: 'response', source: { catalogRef: 'urn:test:catalog', sourceRef: 'host:response' },
        definition: test.policy.definition, response: prepared.response }, input: { draftId: prepared.draft.id, draftVersion: prepared.draft.version,
        responseId: prepared.response.id!, responseHash: prepared.draft.responseHash, source: prepared.content.source as never,
        locale: 'en', signerName: 'Actual signer', consentAccepted: true } });
    expect('invocation' in result ? result.invocation.status : result.status).toBe('completed');
    expect(test.sign).toHaveBeenCalledOnce();
    await vi.waitFor(async () => expect((await test.reviewData()).presentation.phase).toBe('before-submit'));
    expect(await test.load('review')).toMatchObject({ value: { state: { status: 'pending' } } });
    const signed = test.host.getSnapshot().controller!.signed;
    const sessionGeneration = test.host.getSnapshot().sessionGeneration;
    await expect(test.host.selectLocale('es')).rejects.toThrow('native-locale-frozen');
    expect(test.host.getSnapshot().controller!.signed).toEqual(signed);
    expect(test.host.getSnapshot().sessionGeneration).toBe(sessionGeneration);
    expect(test.host.getSnapshot().locale).toBe('en'); expect(test.invalidateAuthority).not.toHaveBeenCalled();
    lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('refuses unadmitted scratch, action artifacts and module owners before engine or service use', () => {
    const test = fixture();
    expect(() => createNativePackageSigningHost({ ...test.policy, readiness: { ...test.policy.readiness, ownedPath: 'missing' } })).toThrow('readiness');
    expect(() => createNativePackageSigningHost({ ...test.policy, moduleId: 'other' })).toThrow('resource');
    const roles = { ...test.policy.controller.roles, prepare: { ...test.policy.controller.roles.prepare!, artifactRef: 'urn:other' } };
    expect(() => createNativePackageSigningHost({ ...test.policy, controller: { ...test.policy.controller, roles } })).toThrow('action');
    expect(test.saveDraft).not.toHaveBeenCalled(); test.host.dispose(); test.engine.dispose();
  });
  it('selects restored or new UUIDv7 Response identity only after actual hydration without creating a session', async () => {
    const test = fixture(); const host = createNativePackageSigningHost({ ...test.policy, responseId: undefined });
    expect(host.getSnapshot().controller).toBeUndefined(); expect(test.saveDraft).not.toHaveBeenCalled();
    const restored = await host.configureRuntime({ engine: test.engine, definition: test.policy.definition, draftKey: { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version },
      claim: null, activeLocale: 'en', restoredResponse: { ...test.response, id: 'retained-id' } });
    expect(restored.semanticControlScope?.responseId).toBe('retained-id'); expect(host.getSnapshot().controller?.owned).toBe(true);
    restored.dispose(); host.dispose();
    const freshHost = createNativePackageSigningHost({ ...test.policy, responseId: undefined });
    const fresh = await freshHost.configureRuntime({ engine: test.engine, definition: test.policy.definition, draftKey: { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version }, claim: null, activeLocale: 'en' });
    expect(isUuidV7IdempotencyKey(fresh.semanticControlScope!.responseId)).toBe(true); expect(test.saveDraft).not.toHaveBeenCalled();
    fresh.dispose(); freshHost.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('detaches admitted policy metadata and private runtime scope from caller mutation', async () => {
    const test = fixture();
    test.policy.readiness.ownedPath = 'unadmitted'; test.policy.publication.formVersionId = 'other';
    test.policy.controller.roles.saveInitial!.actionRef = 'other';
    const key = { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version };
    const lease = await test.host.configureRuntime({ engine: test.engine, definition: test.policy.definition, draftKey: key, claim: null, activeLocale: 'en' });
    key.formUrl = 'urn:other';
    const original = Object.values(test.policy.bundle.documents).find(document => !!document && typeof document === 'object' && '$formspecResponseActions' in document) as ResponseActionsDocument;
    await lease.responseActionInvoker({ document: original, actionRef: 'save', invocationContext: { invocationId: 'node:save' },
      ports: { dispatchHostEvent: vi.fn(), submit: () => ({ response: test.response, validationReport: test.engine.getValidationReport({ profile: 'on-submit' }) }) } });
    expect(test.saveDraft).toHaveBeenCalledOnce();
    expect(test.saveDraft.mock.calls[0][0].formVersionId).toBe('publication');
    expect(test.saveDraft.mock.calls[0][0].draftKey.formUrl).toBe(test.policy.definition.url);
    expect(test.engine.getInstanceData('readiness', 'owned')).toBe(true);
    lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('captures attachment request pins before asynchronous bytes and ignores later caller changes', async () => {
    const test = fixture(true); const lease = await test.prepared(); const data = await test.reviewData();
    const request = { ...data, path: 'fullName', descriptor: data.response.data.fullName as never };
    let finish!: (blob: Blob) => void; test.read.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const pending = test.host.reviewOptions.readAttachment!(request, { signal: new AbortController().signal });
    request.presentation.actorRef = 'other'; request.path = 'other';
    finish(new Blob(['actual bytes'])); await expect(pending).resolves.toBeInstanceOf(Blob);
    expect(test.assertOwner).toHaveBeenLastCalledWith({ formUrl: test.policy.definition.url, formVersion: test.policy.definition.version }, 'server-actor');
    lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('clears only the captured posthydrate draft through the supplied owner after immediate fencing', async () => {
    const test = fixture(); const lease = await test.prepared();
    let finish!: () => void; const clear = test.policy.clearDraftAccess as ReturnType<typeof vi.fn>;
    clear.mockImplementation(async () => new Promise<void>(resolve => { finish = resolve; }));
    const pending = test.host.clearDraftAccess();
    expect(test.host.getSnapshot().runtime).toBeUndefined(); expect(test.invalidateAuthority).toHaveBeenCalledWith('clear', { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version });
    expect(test.host.getSnapshot().editableSessionActive).toBe(false);
    expect(clear).toHaveBeenCalledWith({ formUrl: test.policy.definition.url, formVersion: test.policy.definition.version });
    finish(); await pending;
    await expect(test.host.configureRuntime({ engine: test.engine, definition: test.policy.definition, draftKey: { formUrl: test.policy.definition.url }, claim: null, activeLocale: 'en' })).rejects.toThrow('refused');
    lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('admits the unchanged r5 maintained Registry and refuses a widened ResponseReview widget shape', () => {
    const test = fixture();
    const actual = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/native-signing-r5/native-bundle.json'), 'utf8')) as BundleExport;
    const resolved = dereferenceBundleExport(actual);
    const policy = { ...test.policy, bundle: actual, moduleId: actual.manifest.modules![0].id, definition: [...resolved.definitions.values()][0],
      locales: Object.values(actual.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document) as LocaleDocument[],
      registryEntries: flattenRegistryEntries(resolved.registries).entries,
      readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' }, controller: { ...test.policy.controller, roles: {} }, bindings: {}, hostEvents: unexecutedHostEvents(actual, [...resolved.definitions.values()][0].url) };
    const host = createNativePackageSigningHost(policy); host.dispose();
    const changed = structuredClone(actual);
    const registry = Object.values(changed.documents).find(document => !!document && typeof document === 'object' && '$formspecRegistry' in document) as unknown as { entries: { widgetShape?: { widgetName: string; props: object } }[] };
    const entry = registry.entries.find(entry => entry.widgetShape?.widgetName === 'ResponseReview')!;
    entry.widgetShape!.props = {};
    expect(() => createNativePackageSigningHost({ ...policy, bundle: changed, registryEntries: flattenRegistryEntries(dereferenceBundleExport(changed).registries).entries })).toThrow('widget');
    test.host.dispose(); test.engine.dispose();
  });
  it('refuses a changed descriptor path before attachment I/O and fences a pending valid read after Clear', async () => {
    const test = fixture(true);
    const lease = await test.prepared(); const data = await test.reviewData();
    const request = { ...data, path: 'fullName', descriptor: data.response.data.fullName as never };
    await expect(test.host.reviewOptions.readAttachment!({ ...request, path: 'other' }, { signal: new AbortController().signal })).rejects.toThrow('refused');
    expect(test.read).not.toHaveBeenCalled();
    let finish!: (blob: Blob) => void; test.read.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const pending = test.host.reviewOptions.readAttachment!(request, { signal: new AbortController().signal });
    lease.invalidate(); finish(new Blob(['late'])); await expect(pending).rejects.toThrow('obsolete');
    expect(test.invalidateAuthority).toHaveBeenCalledWith('clear', { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version }); lease.dispose(); test.host.dispose(); test.engine.dispose();
  });
  it('captures indexed repeats and Locale option labels through public engine views', () => {
    const definition = { ...sampleFormDefinition, items: [{ key: 'rows', type: 'group' as const, label: 'Rows', repeatable: true,
      children: [{ key: 'choice', type: 'field' as const, dataType: 'choice' as const, label: 'Choice', options: [{ value: 'a', label: 'Option A' }] }] }] };
    const engine = createFormEngine(definition); engine.loadLocale({ $formspecLocale: '2.0', url: 'urn:test:locale', version: '1', locale: 'es', target: { kind: 'definition', url: definition.url }, strings: { 'rows.label': 'Filas', 'choice.label': 'Elección', 'choice.options.a.label': 'Opción A' } }); engine.setLocale('es'); engine.loadResponseData({ rows: [{ choice: 'a' }, { choice: 'a' }] });
    const fields = captureFields(engine, { ...sampleFormResponse, data: { rows: [{ choice: 'a' }, { choice: 'a' }] } });
    expect(fields['rows[1].choice']).toEqual({ label: 'Elección', options: [{ value: 'a', label: 'Opción A' }] }); expect(fields.rows.label).toBe('Filas'); engine.dispose();
  });
  it('preserves native label and field refusal errors through the maintained capture helper', () => {
    const engine = createFormEngine(sampleFormDefinition);
    try {
      const labels = vi.spyOn(engine, 'getItemLabelSignal').mockReturnValue(undefined);
      expect(() => captureFields(engine, sampleFormResponse)).toThrow('native-review-label-unavailable');
      labels.mockRestore();
      vi.spyOn(engine, 'getFieldVM').mockReturnValue(undefined);
      expect(() => captureFields(engine, sampleFormResponse)).toThrow('native-review-field-unavailable');
    } finally { engine.dispose(); }
  });
  it('propagates engine reader failures without publishing replacement metadata', () => {
    const engine = createFormEngine(sampleFormDefinition);
    try {
      const refusal = new Error('source-options-unavailable');
      vi.spyOn(engine, 'getFieldVM').mockImplementation(() => { throw refusal; });
      expect(() => captureFields(engine, sampleFormResponse)).toThrow(refusal);
    } finally { engine.dispose(); }
  });
  it('refuses malformed retained repeat rows through the maintained traversal', () => {
    const definition = { ...sampleFormDefinition, items: [{ key: 'rows', type: 'group' as const, label: 'Rows', repeatable: true,
      children: [{ key: 'choice', type: 'field' as const, dataType: 'choice' as const, label: 'Choice' }] }] };
    const engine = createFormEngine(definition);
    try {
      expect(() => captureFields(engine, { ...sampleFormResponse, data: { rows: [null] } })).toThrow('response-review-data-invalid');
    } finally { engine.dispose(); }
  });
});

// A neutral resource action must reach its explicit capability, while signing roles keep their controller.
describe('native authored host event routing', () => {
  function eventFixture() {
    const test = fixture(); test.host.dispose();
    const document = structuredClone(test.policy.controller.roles.saveInitial!.document);
    document.actions.push({ id: 'refresh-resource', intent: 'review', validation: { profile: 'off', blocking: 'non-blocking', persistence: 'none' }, effects: [{ type: 'hostEvent', eventName: 'resource-refresh' }] });
    test.policy.bundle = { ...test.policy.bundle, documents: { ...test.policy.bundle.documents, 'urn:test:actions': document } };
    for (const role of Object.values(test.policy.controller.roles)) role!.document = document;
    const handle = vi.fn<NonNullable<NativePackageSigningHostPolicy['hostEvents']>[number]['handle']>(async () => {});
    test.policy.hostEvents = [{ artifactRef: 'urn:test:actions', actionRef: 'refresh-resource', eventName: 'resource-refresh', handle }];
    const host = createNativePackageSigningHost(test.policy);
    return { ...test, host, document, handle };
  }
  it('routes an exact generic event to the configured capability instead of the signing controller', async () => {
    const test = eventFixture(); const runtime = hostRuntime(test);
    const result = await (await runtime).responseActionInvoker({ document: test.document, actionRef: 'refresh-resource', ports: {
      dispatchHostEvent: vi.fn(), submit: () => ({ response: test.response, validationReport: test.engine.getValidationReport({ profile: 'off' }) }) } });
    expect(result).toMatchObject({ status: 'completed' }); expect(test.handle).toHaveBeenCalledOnce(); expect(test.saveDraft).not.toHaveBeenCalled(); test.host.dispose();
  });
  it('refuses a saved-facts refresh with no current owned saved candidate', async () => {
    const test = eventFixture(); test.handle.mockImplementation(async context => { await context.refreshSavedFacts(); });
    await expect((await hostRuntime(test)).responseActionInvoker({ document: test.document, actionRef: 'refresh-resource', ports: {
      dispatchHostEvent: vi.fn(), submit: () => ({ response: test.response, validationReport: test.engine.getValidationReport({ profile: 'off' }) }) } })).rejects.toThrow('native-host-event-handler-failed'); expect(test.saveDraft).not.toHaveBeenCalled(); test.host.dispose();
  });
  function hostRuntime(test: ReturnType<typeof eventFixture>) {
    return test.host.configureRuntime({ engine: test.engine, definition: test.policy.definition, draftKey: { formUrl: test.policy.definition.url, formVersion: test.policy.definition.version }, claim: null, activeLocale: 'en' });
  }
});

// Synthetic native lifetime tests use maintained public engines, not Source proof qualification.
describe('explicit reviewed-candidate facts renewal', () => {
  function nativeFixture(currentCheck = false) {
    let now = 0; let data = { qualified: true, evidenceRef: 'proof-one' }; let refuse = false;
    let hold: Promise<void> | undefined; let activeGeneration = 0;
    let runId = 'fresh-run-original';
    const qualify = vi.fn(async (saved: SavedResponseDraft, lifetime: { assertCurrent: () => void }) => {
      const issuedData = structuredClone(data); const deadline = now + 90_000; const generation = ++activeGeneration;
      await hold; lifetime.assertCurrent(); if (refuse) throw new Error('Source refusal');
      const view = { version: 1, purpose: 'formspec.instance.hydrate', operation: 'hydrate',
        scope: {}, owner: { subjectRef: saved.actor.id }, selection: { definitionUrl: saved.response.definitionUrl, definitionVersion: saved.response.definitionVersion },
        sources: { facts: 'urn:test:facts' }, draftId: saved.draft.id, draftVersion: saved.draft.version,
        candidateHash: await computeJcsSha256Digest(saved.response), formVersionHash: 'test-form',
        results: [{ status: 'qualified', instanceName: 'facts', sourceRef: 'urn:test:facts', data: issuedData,
          issuedAt: String(now), expiresAt: String(deadline), evidenceRef: String(now), dataHash: 'test' }] } as unknown as HydratedEvaluationCandidate['view'];
      const current = () => { lifetime.assertCurrent(); if (generation !== activeGeneration) throw new Error('facts-generation-retired'); };
      const check = () => { current(); if (now >= deadline) throw new Error('worker-expired'); };
      return { view, ...(currentCheck && saved.response.authoredSignatures?.length ? { nativeCurrentCheck: { selectionHash: `sha256:${'a'.repeat(64)}`, runId, runRevision: 1 } } : {}), assertCurrent: check, assertReady: check, refreshRequired: () => { current(); return now >= deadline; } };
    });
    const test = fixture(true, undefined, policy => {
      policy.definition.binds = [{ path: 'fullName', constraint: "@instance('facts').qualified", constraintMessage: 'Photo needs correction' }];
      policy.definition.instances!.facts = { readonly: true, source: 'urn:test:facts', schema: { qualified: 'boolean', evidenceRef: 'string' } };
      policy.candidateHydration = { qualifySaved: qualify, retireFacts: vi.fn(), dispose: vi.fn() };
      if (currentCheck) policy.buildHandoff = async response => ({ ...sampleIntakeHandoff,
        definitionRef: { url: response.definitionUrl, version: response.definitionVersion },
        responseRef: `response:${response.id}`, responseHash: `sha256:${await hashResponse(response)}`, subjectRef: 'server-actor',
        extensions: { 'x-formspec-response': response } });
      const signRole = policy.controller.roles.sign!;
      const document = signRole.document;
      const signAction = document.actions.find(action => action.id === 'sign')!;
      document.actions.push({ ...structuredClone(signAction), id: 'submit', effects: [{ type: 'serviceRequest', requestRef: 'submit', idempotencyKey: '@invocation.id' }] });
      const request = document['x-formspec-runtime']!.requests.find(request => request.id === 'sign')!;
      document['x-formspec-runtime']!.requests.push({ ...structuredClone(request), id: 'submit', request: { ...request.request, pathTemplate: '/drafts/{draftId}/submit' } });
      policy.controller.roles.submit = { ...signRole, actionRef: 'submit', requestRef: 'submit', widgetSource: { ...signRole.widgetSource!, outputName: 'submit' } };

    });
    const assent = async () => {
      const review = await test.reviewData();
      test.host.reviewOptions.onReviewState!({ status: 'ready', contextIdentity: await responseReviewHash(review),
        responseHash: review.presentation.responseHash, actorRef: review.presentation.actorRef,
        draft: review.presentation.draft, locale: review.presentation.locale, phase: review.presentation.phase });
    };
    const sign = async (invocationId = 'renewed-sign') => {
      const prepared = test.host.getSnapshot().controller!.prepared!; const admission = test.policy.controller.roles.sign!;
      const result = await test.host.widgetExecutor({ document: admission.document, actionRef: admission.actionRef, invocationId,
        source: admission.widgetSource!, responseContext: { inputName: 'response', source: { catalogRef: 'urn:test:catalog', sourceRef: 'host:response' },
          definition: test.policy.definition, response: prepared.response }, input: { draftId: prepared.draft.id, draftVersion: prepared.draft.version,
          responseId: prepared.response.id!, responseHash: prepared.draft.responseHash, source: prepared.content.source as never,
          locale: 'en', signerName: 'Actual signer', consentAccepted: true } });
      return 'invocation' in result ? result.invocation : result;
    };
    const cleanup = () => { test.host.dispose(); test.engine.dispose(); test.replacements.forEach(engine => engine.dispose()); };
    return { ...test, qualify, assent, changeSelector: () => { runId = 'fresh-run-newer'; }, signAction: sign, cleanup, advance: (value: number) => { now = value; },
      change: () => { data = { qualified: false, evidenceRef: 'proof-two' }; },
      changeProvenance: () => { data = { qualified: true, evidenceRef: 'proof-two' }; },
      correct: () => { data = { qualified: true, evidenceRef: 'proof-three' }; }, refuse: () => { refuse = true; }, hold: (value: Promise<void>) => { hold = value; } };
  }
  it('reconciles a failed task Sign through candidate authority without a Screener context', async () => {
    const test = nativeFixture();
    expect(test.policy.nativeScreener).toBeUndefined();
    const generation = test.host.getSnapshot().sessionGeneration;
    const marker = test.host.allocateSurfaceSessionMarker(generation);
    const visit = test.host.createSurfaceVisit(marker, generation); visit.activate();
    const ports = visit.bindRuntime();
    await test.prepared(); await test.assent();
    test.sign.mockRejectedValueOnce(new Error('Sign result not received'));
    expect((await test.signAction()).status).toBe('failed');
    expect(test.host.getSnapshot().controller?.retrySignAvailable).toBe(true);
    const result = await ports.retrySigningResult!();
    expect(('invocation' in result ? result.invocation : result).status).toBe('completed');
    expect(test.sign).toHaveBeenCalledTimes(2);
    expect(test.host.getSnapshot().controller?.signed).toBeDefined();
    expect(test.assertOwner).toHaveBeenCalled();
    visit.dispose(); test.cleanup();
  });
  it('refuses changed task ownership before retrying a Sign effect', async () => {
    const test = nativeFixture();
    const generation = test.host.getSnapshot().sessionGeneration;
    const marker = test.host.allocateSurfaceSessionMarker(generation);
    const visit = test.host.createSurfaceVisit(marker, generation); visit.activate();
    const ports = visit.bindRuntime(); await test.prepared(); await test.assent();
    test.sign.mockRejectedValueOnce(new Error('Sign result not received'));
    expect((await test.signAction()).status).toBe('failed');
    test.assertOwner.mockImplementationOnce(() => { throw new Error('Task owner retired'); });
    await expect(ports.retrySigningResult!()).rejects.toThrow('Task owner retired');
    expect(test.sign).toHaveBeenCalledTimes(1); visit.dispose(); test.cleanup();
  });
  it('refuses a retired task retry visit before any further Sign effect', async () => {
    const test = nativeFixture();
    const generation = test.host.getSnapshot().sessionGeneration;
    const marker = test.host.allocateSurfaceSessionMarker(generation);
    const visit = test.host.createSurfaceVisit(marker, generation); visit.activate();
    const ports = visit.bindRuntime(); await test.prepared(); await test.assent();
    test.sign.mockRejectedValueOnce(new Error('Sign result not received'));
    expect((await test.signAction()).status).toBe('failed');
    visit.dispose();
    await expect(ports.retrySigningResult!()).rejects.toThrow('native-visit-retired');
    expect(test.sign).toHaveBeenCalledTimes(1); test.cleanup();
  });
  it('renews expired exact photo facts after two minutes of reading, preserving completed review', async () => {
    const test = nativeFixture(); await test.prepared(); await test.assent(); const before = test.qualify.mock.calls.length;
    test.advance(120_000);
    const result = await test.signAction();
    expect(result).toMatchObject({ status: 'completed' }); expect(test.sign).toHaveBeenCalledOnce();
    expect(test.qualify.mock.calls.length).toBe(before + 2); // explicit renewal plus committed signed qualification
    expect(test.sign.mock.calls[0][0].preparation.response.data).toEqual(test.response.data);
    test.cleanup();
  });
  it('requires renewed review for changed native validation findings and never signs a failing photo', async () => {
    const test = nativeFixture(); await test.prepared(); await test.assent(); test.advance(120_000); test.change();
    expect((await test.signAction()).status).toBe('failed'); expect(test.sign).not.toHaveBeenCalled();
    expect(await test.load('review')).toMatchObject({ value: { state: { status: 'pending' } } });
    await test.assent(); const calls = test.qualify.mock.calls.length;
    expect((await test.signAction('new-assent')).status).toBe('blocked');
    expect(test.qualify.mock.calls.length).toBe(calls); expect(test.sign).not.toHaveBeenCalled();
    test.cleanup();
  });
  it('renews proof provenance while preserving exact canonical photo review and validation meaning', async () => {
    const test = nativeFixture(); await test.prepared(); await test.assent(); const oldReview = await test.reviewData();
    test.advance(120_000); test.changeProvenance();
    expect((await test.signAction()).status).toBe('completed'); expect(test.sign).toHaveBeenCalledOnce();
    expect(test.sign.mock.calls[0][0].preparation.response).toEqual(oldReview.response);
    test.cleanup();
  });
  it('refuses Source renewal failure before any Sign mutation', async () => {
    const test = nativeFixture(); await test.prepared(); await test.assent(); test.advance(120_000); test.refuse();
    expect((await test.signAction()).status).toBe('failed'); expect(test.sign).not.toHaveBeenCalled();
    expect(test.host.getSnapshot().nativeReadiness).toBe('pending'); expect(test.host.getSnapshot().runtime).toBeUndefined();
    expect(test.host.getSnapshot().controller!.prepared!.response.data).toEqual(test.response.data);
    test.cleanup();
  });
  it('preserves an already committed signature when expired signed Submit renewal is refused', async () => {
    const test = nativeFixture(); await test.prepared(); await test.assent(); expect((await test.signAction()).status).toBe('completed');
    await test.assent(); const signed = structuredClone(test.host.getSnapshot().controller!.signed!);
    test.advance(120_000); test.refuse(); const admission = test.policy.controller.roles.submit!;
    const result = await test.host.widgetExecutor({ document: admission.document, actionRef: admission.actionRef, invocationId: 'submit-after-reading',
      source: admission.widgetSource!, responseContext: { inputName: 'response', source: { catalogRef: 'urn:test:catalog', sourceRef: 'host:response' },
        definition: test.policy.definition, response: signed.response }, input: { draftId: signed.draft.id, draftVersion: signed.draft.version, canonical_response: signed.response as never } });
    expect('invocation' in result ? result.invocation.status : result.status).toBe('failed');
    expect(test.host.getSnapshot().controller!.signed).toEqual(signed);
    expect(test.policy.controller.submitTransport!.submit).not.toHaveBeenCalled(); expect(test.sign).toHaveBeenCalledOnce();
    test.cleanup();
  });
  it('captures one exact external current-check selector for signed Submit and retains it across same-attempt retry', async () => {
    const test = nativeFixture(true); await test.prepared(); await test.assent();
    expect((await test.signAction()).status).toBe('completed'); await test.assent();
    const signed = structuredClone(test.host.getSnapshot().controller!.signed!);
    const signedBytes = JSON.stringify(signed.response); const beforeSignCalls = test.sign.mock.calls.length;
    const transport = test.policy.controller.submitTransport!.submit as ReturnType<typeof vi.fn>;
    transport.mockRejectedValueOnce(new Error('temporary Submit refusal'));
    transport.mockResolvedValue({ referenceNumber: signed.response.id, status: 'accepted', recordKind: 'response' });
    const submit = () => {
      const admission = test.policy.controller.roles.submit!;
      return test.host.widgetExecutor({ document: admission.document, actionRef: admission.actionRef, invocationId: 'same-submit-attempt',
        source: admission.widgetSource!, responseContext: { inputName: 'response', source: { catalogRef: 'urn:test:catalog', sourceRef: 'host:response' },
          definition: test.policy.definition, response: signed.response }, input: { draftId: signed.draft.id, draftVersion: signed.draft.version, canonical_response: signed.response as never } });
    };
    const first = await submit(); expect('invocation' in first ? first.invocation.status : first.status).toBe('failed');
    expect(transport.mock.calls[0][3]).toEqual({ nativeCurrentCheck: { selectionHash: `sha256:${'a'.repeat(64)}`, runId: 'fresh-run-original', runRevision: 1 } });
    test.changeSelector(); test.advance(120_000);
    const second = await submit(); expect('invocation' in second ? second.invocation.status : second.status).toBe('completed');
    expect(transport.mock.calls[1][3]).toEqual(transport.mock.calls[0][3]);
    expect(JSON.stringify(test.host.getSnapshot().controller!.signed!.response)).toBe(signedBytes);
    expect(test.sign.mock.calls.length).toBe(beforeSignCalls); test.cleanup();
  });
  it('joins concurrent explicit actions and refuses a retired owner during renewal', async () => {
    const test = nativeFixture(); await test.prepared(); await test.assent(); test.advance(120_000);
    let release!: () => void; test.hold(new Promise<void>(resolve => { release = resolve; }));
    const calls = test.qualify.mock.calls.length; const a = test.signAction('one'); const b = test.signAction('two');
    await vi.waitFor(() => expect(test.qualify.mock.calls.length).toBe(calls + 1));
    test.host.dispose(); release();
    expect((await a).status).toBe('failed'); expect((await b).status).toBe('failed'); expect(test.sign).not.toHaveBeenCalled();
    test.cleanup();
  });
});
