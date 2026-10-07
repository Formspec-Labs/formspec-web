import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { createFormEngine } from '@formspec-org/engine/render';
import { createSemanticControlRegistry } from '@formspec-org/react';
import { canonicalResponseHandoffBytes } from '@formspec-org/integrity-canonical';
import { composeSurfaceApp, flattenRegistryEntries, dereferenceBundleExport, resolveDataSourceDescriptor, type BundleExport } from '@formspec-org/surface';
import { deriveSurfaceRuntimeGeneration, responseReviewHash, type ResponseReviewData } from '@formspec-org/surface-react';
import type { DataSourcesDocument, FormResponse, LocaleDocument, ResponseActionsDocument, SigningContent } from '@formspec-org/types';
import { sampleFormDefinition, sampleFormResponse, sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import { createNativePackageSigningHost, captureFields, type NativePackageSigningHostPolicy } from '../../src/shared/native-package-signing-host.ts';
import type { SavedResponseDraft } from '../../src/ports/response-signing.ts';
import { isUuidV7IdempotencyKey } from '../../src/shared/idempotency-key.ts';

beforeAll(() => initFormspecEngine());
const hashResponse = async (response: FormResponse) => createHash('sha256').update(canonicalResponseHandoffBytes(response)).digest('hex');
function fixture(attachment = false) {
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
  const policy: NativePackageSigningHostPolicy = { bundle, moduleId: 'test', definition, registryEntries: [], locales: [], publication: { formId: 'form', formVersionId: 'publication' },
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
  const host = createNativePackageSigningHost(policy);
  const engine = createFormEngine(definition); engine.loadResponseData(response.data as Parameters<typeof engine.loadResponseData>[0]);
  async function attach() { return host.configureRuntime({ engine, definition, draftKey: { formUrl: definition.url, formVersion: definition.version }, claim: null, activeLocale: 'en' }); }
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
  return { policy, host, engine, response, read, prepare, sign, saveDraft, invalidateAuthority, assertOwner, attach, invoke, prepared, load, reviewData };
}

describe('generic native package signing session', () => {
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
      readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' }, controller: { ...test.policy.controller, roles: {} }, bindings: {} };
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
});
