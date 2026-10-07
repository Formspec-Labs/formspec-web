import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act, fireEvent } from '@testing-library/react';
import { dereferenceBundleExport, flattenRegistryEntries, type BundleExport } from '@formspec-org/surface';
import { createFormEngine, hashSigningContent } from '@formspec-org/engine/render';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { FormspecForm, createSemanticControlRegistry } from '@formspec-org/react';
import { canonicalResponseHandoffBytes, canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import type { ComponentDocument, LocaleDocument, FormResponse, SigningContent, SurfaceDocument } from '@formspec-org/types';
import { NativePackageRuntime } from '../../src/app/NativePackageRuntime.tsx';
import { AnonymousSessionBridge } from '../../src/adapters/http/anonymous-session.ts';
import { delegatedSignedResponseFixture } from '../adapters/http/delegated-signed-response-fixture.ts';
import { NativePackageRespondentHost } from '../../src/app/NativePackageRespondentHost.tsx';
import { createNativePackageSigningHost, type NativePackageSigningHost, type NativePackageSigningHostPolicy } from '../../src/shared/native-package-signing-host.ts';
import type { SavedResponseDraft } from '../../src/ports/response-signing.ts';
import type { SubmitTransport } from '../../src/ports/submit-transport.ts';
import { sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import type { ResolvedRespondentFormInput } from '../../src/app/RespondentRuntime.tsx';
import type * as RespondentRuntimeModule from '../../src/app/RespondentRuntime.tsx';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { createHttpAdapterCohort } from '../../src/adapters/http/cohort.ts';
import { loadCanonicalSigningContentValidator, validateCanonicalFormResponse } from '../../src/adapters/schema/index.ts';
import { jsonResponse, recordingFetch } from '../adapters/http/test-fetch.ts';

const observed = vi.hoisted(() => ({ forms: [] as unknown[], real: false }));
vi.mock('../../src/app/RespondentRuntime.tsx', async importOriginal => {
  const actual = await importOriginal<typeof RespondentRuntimeModule>();
  return { ...actual, RespondentDefinitionController: (props: Parameters<typeof actual.RespondentDefinitionController>[0]) => {
    observed.forms.push(props.form);
    return observed.real ? <actual.RespondentDefinitionController {...props} /> : <div data-testid="admitted-form">{props.form!.definition.title}</div>;
  } };
});
const root = resolve(process.cwd(), 'tests/fixtures/native-signing-r5');
const bundle = JSON.parse(readFileSync(resolve(root, 'native-bundle.json'), 'utf8')) as BundleExport;
const component = JSON.parse(readFileSync(resolve(root, 'passport-renewal.component.json'), 'utf8')) as ComponentDocument;
beforeAll(() => initFormspecEngine());
afterEach(() => { cleanup(); observed.forms.length = 0; observed.real = false; vi.unstubAllGlobals(); });
function fixture() {
  const configureRuntime = vi.fn(); const dispose = vi.fn();
  const state = { generation: 0, sessionGeneration: 0, locale: 'en', formTitle: '', cleared: false, controller: undefined, runtime: undefined, submitted: undefined };
  const host = { getStartupRoute: () => ({ entryHref: '/', entryTitle: undefined, requiresHostState: false }), moduleId: 'x-demo-signing', bundle: dereferenceBundleExport(structuredClone(bundle)), reviewOptions: {}, configureRuntime, configureSubmittedRuntime: vi.fn(), dispose,
    allocateSurfaceSessionMarker: () => 'fixture-visit',
    createSurfaceVisit: () => ({ activate: vi.fn(), dispose: vi.fn(), bindRuntime: () => ({ authorizeDataSource: () => ({ status: 'refused' as const, reason: 'unavailable' }), dataSourceLoader: () => ({ status: 'unavailable' as const, reason: 'unavailable' }), validateDataSourcePayload: () => ({ valid: true }), dataSourceRevision: () => undefined, widgetActionExecutor: vi.fn() }) }),
    widgetExecutor: vi.fn(), getSnapshot: () => state, subscribe: () => () => {}, selectLocale: vi.fn(), clearDraftAccess: vi.fn() } satisfies NativePackageSigningHost;
  const props = { host, composition: createStubComposition(), config: departmentAppProfile, componentDocument: component,
    localeDocuments: [], location: '/', onNavigate: vi.fn() };
  return { props, host, configureRuntime, dispose };
}
async function actualFixture() {
    observed.real = true; vi.stubGlobal('crypto', webcrypto);
    const Url = URL; vi.stubGlobal('URL', class extends Url { static override createObjectURL() { return 'blob:test-photo'; } static override revokeObjectURL() {} });
    const photoBytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhOsAAAAASUVORK5CYII=', 'base64'));
    const resolved = dereferenceBundleExport(bundle); const definition = [...resolved.definitions.values()][0];
    const locales = Object.values(bundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document) as LocaleDocument[];
    const document = resolved.responseActions[0]; const surface = resolved.surfaces[0]; const route = surface.routes.find(route => route.path === '/review-sign')!;
    type Binding = { moduleId: string; widgetName: string; dataBindings: Record<string, { catalogRef: string; sourceRef: string }>; actionBindings: Record<string, { actionRef: string; responseInput: string }> };
    const ceremony = route.slots!.find(slot => slot.slotType === 'module-widget' && (slot.binding as Binding).widgetName === 'SigningCeremony')!;
    const review = route.slots!.find(slot => slot.slotType === 'module-widget' && (slot.binding as Binding).widgetName === 'ResponseReview')!;
    const binding = ceremony.binding as Binding;
    const bindings = Object.fromEntries(Object.entries({ ...(review.binding as Binding).dataBindings, ...binding.dataBindings }).map(([name, source]) => [name, { catalogRef: source.catalogRef, sourceRef: source.sourceRef }]));
    const roles: NativePackageSigningHostPolicy['controller']['roles'] = {};
    for (const [name, actionRef] of Object.entries({ saveInitial: 'save-draft-initial', saveOwned: 'save-draft-owned', prepare: 'prepare', sign: 'sign', submit: 'submit', paper: 'paper' })) {
      const action = document.actions.find(action => action.id === actionRef)!; const effect = action.effects![0];
      const output = Object.entries(binding.actionBindings).find(([, value]) => value.actionRef === actionRef);
      roles[name as keyof typeof roles] = { document, actionRef, artifactRef: bundle.manifest.responseActionDocuments![0].url, artifactDigest: `sha256:${'b'.repeat(64)}`,
        ...(effect.type === 'serviceRequest' ? { requestRef: effect.requestRef } : {}), ...(output ? {
          responseSource: { inputName: output[1].responseInput, ...bindings[output[1].responseInput] },
          widgetSource: { moduleId: binding.moduleId, widgetName: binding.widgetName, slotId: ceremony.id, outputName: output[0],
            route: { surfaceId: surface.id, surfaceRef: resolved.surfaceRefs?.get(surface), routeId: route.id, routeClass: route.routeClass, params: {} } } } : {}) };
    }
    const hashResponse = async (response: FormResponse) => createHash('sha256').update(canonicalResponseHandoffBytes(response)).digest('hex');
    let revision = 0;
    const saved = async (input: { draftKey: SavedResponseDraft['draftKey']; response: FormResponse }): Promise<SavedResponseDraft> => ({ draftKey: input.draftKey, response: input.response,
      draft: { id: 'owned-draft', version: ++revision, responseHash: await hashResponse(input.response) }, actor: { id: 'server-actor' },
      evidence: { draft_id: 'owned-draft', draft_version: revision, form_version_id: 'publication', subject_ref: 'server-actor', canonical_response: input.response, draft_state: input.response.data, status: 'in_progress' } });
    const contents = (definition.extensions!['x-formspec-signing-content'] as { entries: Record<string, SigningContent> }).entries;
    const content = (locale: string) => Object.values(contents).find(content => content.locale === locale)!;
    const saveDraft = vi.fn(saved); const prepare = vi.fn(async (input: Parameters<NativePackageSigningHostPolicy['controller']['signing']['prepare']>[0]) => ({ ...await saved(input), content: content(input.locale) }));
    const sign = vi.fn(async (input: Parameters<NativePackageSigningHostPolicy['controller']['signing']['sign']>[0]) => {
      const preparation = input.preparation; const content = preparation.content; const signedAt = '2026-10-07T12:00:00Z';
      const documentHash = await hashSigningContent(content, () => true);
      const candidate: FormResponse = { ...structuredClone(preparation.response), extensions: { ...preparation.response.extensions,
        'x-formspec-signing-content': { version: '1.0', content, documentHash, documentHashAlgorithm: 'sha-256', actorRef: preparation.actor.id,
          draftId: preparation.draft.id, draftVersion: ++revision, signerName: input.assent.signerName, signedAt, consentAccepted: true } } };
      const response: FormResponse = { ...candidate, authoredSignatures: [{ signatureId: 'port-double-signature', ceremonyId: 'port-double-ceremony',
        signatureProvider: 'urn:test:delegated-port', documentId: content.documentId, signingIntent: content.signingIntent,
        signatureValue: 'cG9ydC1kb3VibGU=', signerId: preparation.actor.id, signerName: input.assent.signerName, consentAccepted: true,
        consentTextRef: content.electronicConsent.textRef, consentVersion: content.electronicConsent.version,
        affirmationText: content.affirmationText, documentHash, documentHashAlgorithm: 'sha-256', signedPayload: {
          canonicalization: 'formspec-response-signing-v1', digestAlgorithm: 'sha-256', digest: createHash('sha256').update(canonicalResponseSignedPayloadBytes(candidate)).digest('hex'),
          responseId: candidate.id!, definitionUrl: candidate.definitionUrl, definitionVersion: candidate.definitionVersion, signedAt, signingIntent: content.signingIntent } }] };
      return { ...await saved({ draftKey: preparation.draftKey, response }), content, verification: { mode: 'delegated-service-key' as const, provider: 'urn:test:delegated-port', keyId: 'test-key' } };
    });
    const submit = vi.fn<SubmitTransport['submit']>(async () => ({ status: 'accepted' as const, referenceNumber: 'owned-result', recordKind: 'response' as const }));
    let completeRead!: (blob: Blob) => void;
    const read = vi.fn(async () => new Promise<Blob>(resolve => { completeRead = resolve; }));
    const clear = vi.fn(async () => {}); const invalidateAuthority = vi.fn();
    const policy: NativePackageSigningHostPolicy = { bundle, definition, moduleId: binding.moduleId, locales, initialLocale: 'en',
      registryEntries: flattenRegistryEntries(resolved.registries).entries, publication: { formId: 'form', formVersionId: 'publication' },
      readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' }, clearDraftAccess: clear,
      controller: { roles, signing: { saveDraft, prepare, sign }, submitTransport: { submit }, validateResponse: () => true, hashResponse },
      buildHandoff: async response => ({ ...sampleIntakeHandoff, definitionRef: { url: response.definitionUrl, version: response.definitionVersion },
        responseRef: `response:${response.id}`, responseHash: `sha256:${await hashResponse(response)}`, subjectRef: 'server-actor',
        extensions: { ...sampleIntakeHandoff.extensions, 'x-formspec-response': response } }), signingContext: locale => ({ source: content(locale).source, locale }),
      semanticScope: (responseId, renderInstance) => ({ responseId, renderInstanceId: String(renderInstance), registry: createSemanticControlRegistry(), definitionArtifact: { artifactRef: definition.url, artifactDigest: `sha256:${'a'.repeat(64)}` } }),
      bindings, actionLabels: locale => Object.fromEntries(Object.values(roles).filter(role => role.widgetSource).map(role => {
        const reference = document.actions.find(action => action.id === role.actionRef)!.label as { ref: string };
        return [reference.ref, locales.find(document => document.locale === locale)!.strings[reference.ref] as string]; })),
      validatePayload: () => ({ valid: true }), attachmentStore: { upload: vi.fn(), read }, assertOwner: vi.fn(), invalidateAuthority,
      reviewResponseDigest: hashResponse, canonicalResponseHandoffBytes };
    const host = createNativePackageSigningHost(policy);
    const reports: string[] = []; const report = host.reviewOptions.onReviewState!;
    host.reviewOptions.onReviewState = state => {
      reports.push(state.status);
      if (reports.length > 32) throw new Error(`review-callback-loop: ${reports.join(' -> ')}`);
      report(state);
    };
    const configure = host.configureRuntime;
    const terminals: { status: string; valid: boolean | undefined }[] = [];
    const invokerFailures: unknown[] = [];
    let mountedEngine!: Parameters<typeof configure>[0]['engine'];
    host.configureRuntime = async input => {
      mountedEngine = input.engine;
      input.engine.setValue('declarationAcknowledged', true);
      input.engine.setValue('photo', { kind: 'attachment-ref', uri: 'attachment:owned', filename: 'saved.png', mimeType: 'image/png', contentType: 'image/png', size: photoBytes.length, hash: `sha256:${createHash('sha256').update(photoBytes).digest('hex')}` });
      const configured = await configure(input);
      return { ...configured, responseActionInvoker: async action => {
        let result: Awaited<ReturnType<typeof configured.responseActionInvoker>>;
        try { result = await configured.responseActionInvoker(action); } catch (error) { invokerFailures.push(error); throw error; }
        const terminal = 'invocation' in result ? result.invocation : result;
        terminals.push({ status: terminal.status, valid: terminal.detail?.validationReport?.valid }); return result;
      } };
    };
    const composition = createStubComposition(); const navigate = vi.fn();
    const props = { host, composition, config: departmentAppProfile, componentDocument: component, localeDocuments: locales, location: '/', onNavigate: navigate };
    return { policy, host, props, saveDraft, prepare, navigate, terminals, getEngine: () => mountedEngine, invokerFailures, read, reports, photoBytes, completeRead: (blob: Blob) => completeRead(blob), clear, sign, submit };
}
describe('maintained native package Surface host', () => {
  it('mounts a fresh owner-checked submitted revision 6 on the widget route as a receipt with no engine or writes', async () => {
    const test = await actualFixture(); test.host.dispose();
    const definition = test.policy.definition; const key = { formUrl: definition.url, formVersion: definition.version };
    const seed = createFormEngine(definition); test.policy.locales.forEach(locale => seed.loadLocale(locale)); seed.setLocale('es-US');
    const response = { ...seed.getResponse({ profile: 'off' }), id: 'submitted-response-id', status: 'completed' as const }; seed.dispose();
    const content = Object.values((definition.extensions!['x-formspec-signing-content'] as { entries: Record<string, SigningContent> }).entries)
      .find(content => content.locale === 'es-US')!;
    const signed = await delegatedSignedResponseFixture({ response, content, actor: 'anon:owner', draftId: 'retained-draft', candidateVersion: 4, keyId: 'test-key' });
    const context = { baseUrl: 'https://server.example.test', tenantBinding: { kind: 'bound' as const,
      scope: { tenant: 'tenant', workspace: 'workspace', environment: 'test', cell: 'cell' } } };
    const transport = recordingFetch(request => {
      expect(request.method).toBe('GET'); expect(request.url).toBe(`${context.baseUrl}/drafts/retained-draft`);
      expect(request.headers.get('authorization')).toBe('Bearer retained-grant');
      return jsonResponse({ draft_id: 'retained-draft', draft_version: 6, form_version_id: 'publication', subject_ref: 'anon:owner',
        status: 'submitted', canonical_response: signed, draft_state: signed.data });
    });
    const values = new Map<string, unknown>([['grant:form', { sessionId: 'retained-session', sessionToken: 'retained-grant', subjectRef: 'anon:owner', formId: 'form', expiresAt: '2099-01-01T00:00:00Z' }],
      ['draft-handles', [{ key, formId: 'form', draftId: 'retained-draft', draftVersion: 5 }]]]);
    const resumeMetadata = { read: (slot: string) => values.get(slot), write: (slot: string, value: unknown) => { values.set(slot, structuredClone(value)); }, remove: (slot: string) => { values.delete(slot); } };
    const bridge = new AnonymousSessionBridge({ ...context, fetchImpl: transport.fetch, resumeMetadata, formIdResolver: () => 'form' });
    const cohort = createHttpAdapterCohort({ ...context, fetchImpl: transport.fetch, resumeMetadata, anonymousSessions: bridge, formIdResolver: () => 'form',
      qualifiedDraftState: { definition, formVersionId: 'publication', localeDocuments: test.policy.locales },
      responseSigning: { keyId: 'test-key', validateResponse: validateCanonicalFormResponse, validateContent: await loadCanonicalSigningContentValidator(),
        signingProfileDigest: async response => createHash('sha256').update(canonicalResponseSignedPayloadBytes(response)).digest('hex') } });
    const createEngine = vi.fn(createFormEngine);
    const host = createNativePackageSigningHost({ ...test.policy, createEngine, clearDraftAccess: key => cohort.draftStore.delete(key) });
    const composition = createStubComposition(); composition.draftStore = cohort.draftStore;
    composition.nativePackageRespondent = { load: async () => ({ composition, host, componentDocument: component, localeDocuments: test.policy.locales,
      moduleId: host.moduleId, initialLocale: 'en', resumeSubmitted: async () => {
        const state = await cohort.draftStore.readState!(key);
        if (state?.kind === 'submitted') await host.configureSubmittedRuntime({ definition, draftKey: key, claim: null, state });
        return state?.kind ?? 'absent';
      } }) };
    window.history.replaceState(null, '', '/review-sign?form=form&package=%2Fpackage.json');
    const mounted = render(<NativePackageRuntime composition={composition} config={departmentAppProfile} />);
    await screen.findByText(signed.id!); expect(screen.getByRole('heading', { name: 'Respuestas recibidas' })).toBeTruthy();
    expect(createEngine).not.toHaveBeenCalled(); expect(mounted.container.querySelector('.fs-surface-app')).toBeNull();
    expect(screen.queryByRole('button', { name: /Enviar|Firmar|Guardar/ })).toBeNull();
    expect(transport.requests).toHaveLength(1); expect(host.getSnapshot().controller).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar el acceso guardado' }));
    await screen.findByRole('heading', { name: 'Acceso guardado borrado' }); expect(values.size).toBe(0);
    expect(transport.requests).toHaveLength(1); mounted.unmount(); host.dispose();
    const freshHost = createNativePackageSigningHost({ ...test.policy, createEngine });
    const freshComposition = createStubComposition(); freshComposition.draftStore = cohort.draftStore;
    freshComposition.nativePackageRespondent = { load: async () => ({ composition: freshComposition, host: freshHost, componentDocument: component,
      localeDocuments: test.policy.locales, moduleId: freshHost.moduleId, initialLocale: 'en', resumeSubmitted: async () => {
        const state = await cohort.draftStore.readState!(key); return state?.kind ?? 'absent';
      } }) };
    const restarted = render(<NativePackageRuntime composition={freshComposition} config={departmentAppProfile} />);
    const entry = await screen.findByRole('link', { name: 'Passport renewal' });
    expect(entry.getAttribute('href')).toBe('/?form=form&package=%2Fpackage.json');
    expect(screen.queryByText(signed.id!)).toBeNull(); expect(screen.queryByRole('textbox')).toBeNull();
    expect(restarted.container.querySelector('.fs-surface-app')).toBeNull(); expect(createEngine).not.toHaveBeenCalled();
    expect(transport.requests).toHaveLength(1); expect(values.size).toBe(0);
    expect(screen.queryByText('This browser no longer has saved access to this draft.')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Passport renewal' }));
    restarted.unmount(); freshHost.dispose(); window.history.replaceState(null, '', '/');
  });
  it.each(['non-slash', 'missing', 'parameter', 'collision', 'no-definition', 'embedded-required', 'embedded-definition'] as const)('qualifies the authored %s entry through maintained route plans', async variant => {
    const test = await actualFixture(); test.host.dispose();
    const exported = structuredClone(test.policy.bundle);
    const surface = exported.documents[exported.manifest.entrySurface!] as SurfaceDocument;
    const entry = surface.routes.find(route => route.id === surface.entry)!;
    if (variant === 'non-slash') entry.path = '/start-here';
    if (variant === 'missing') surface.entry = 'missing';
    if (variant === 'parameter') entry.path = '/start/{subject}';
    if (variant === 'collision') surface.routes.push({ ...structuredClone(entry), id: 'duplicate' });
    if (variant === 'no-definition') entry.slots = [{ id: 'static-entry', slotType: 'static-content', binding: { content: [] } }];
    if (variant === 'embedded-required') {
      const ceremony = surface.routes.find(route => route.path === '/review-sign')!;
      surface.routes.push({ id: 'wrapper', path: '/embedded-review', slots: [{ id: 'embedded', slotType: 'embed-route', binding: { routeRef: ceremony.id } }] });
    }
    if (variant === 'embedded-definition') {
      surface.routes.push({ id: 'entry-wrapper', path: '/embedded-entry', slots: [{ id: 'embedded-form', slotType: 'embed-route', binding: { routeRef: entry.id } }] });
      surface.entry = 'entry-wrapper';
    }
    const host = createNativePackageSigningHost({ ...test.policy, bundle: exported });
    if (variant === 'non-slash') {
      expect(host.getStartupRoute('/review-sign')).toMatchObject({ entryHref: '/start-here', requiresHostState: true });
      expect(host.getStartupRoute('/start-here')).toMatchObject({ entryHref: '/start-here', requiresHostState: false });
    } else if (variant === 'embedded-required') expect(host.getStartupRoute('/embedded-review')).toMatchObject({ entryHref: '/', requiresHostState: true });
    else if (variant === 'embedded-definition') expect(host.getStartupRoute('/review-sign')).toMatchObject({ entryHref: '/embedded-entry', requiresHostState: true });
    else expect(() => host.getStartupRoute('/review-sign')).toThrow('native-entry-route-unavailable');
    host.dispose();
  });
  it('refuses an unknown state-aware port result before mounting editable controls', async () => {
    const test = await actualFixture();
    test.props.composition.draftStore.readState = async () => ({ kind: 'unknown' }) as unknown as Awaited<ReturnType<NonNullable<typeof test.props.composition.draftStore.readState>>>;
    render(<NativePackageRespondentHost {...test.props} />);
    await screen.findByRole('alert');
    expect(test.getEngine()).toBeUndefined(); expect(screen.queryByRole('textbox')).toBeNull();
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled(); expect(test.submit).not.toHaveBeenCalled();
    test.host.dispose();
  });
  it('writes restored owned data through the actual authored r5 Save button and HTTP cohort before Prepare', async () => {
    const fixture = await actualFixture(); fixture.host.dispose();
    const definition = fixture.policy.definition;
    const key = { formUrl: definition.url, formVersion: definition.version, subjectRef: 'server-actor' };
    const seed = createFormEngine(definition); fixture.policy.locales.forEach(locale => seed.loadLocale(locale)); seed.setLocale('es-US');
    seed.setValue('email', ''); seed.setValue('photo', null); seed.setValue('declarationAcknowledged', false);
    const partial = { ...seed.getResponse({ profile: 'off' }), id: '01a114cf-c305-73ff-a317-7f7a92c695ad' };
    const capturedData = { ...structuredClone(partial.data), email: 'complete@example.test', declarationAcknowledged: true,
      photo: { kind: 'attachment-ref', uri: 'urn:formspec:attachment:owned-photo', filename: 'uploaded.png', mimeType: 'image/png', contentType: 'image/png',
        size: fixture.photoBytes.length, hash: `sha256:${createHash('sha256').update(fixture.photoBytes).digest('hex')}` } };
    seed.dispose();
    let response: FormResponse = partial; let revision = 0;
    const view = () => ({ draft_id: 'owned-draft', form_version_id: 'publication', subject_ref: 'server-actor', status: 'in_progress',
      draft_version: revision, draft_state: response.data, canonical_response: structuredClone(response) });
    const transport = recordingFetch(request => {
      if (request.method === 'GET') return jsonResponse(view());
      const body = request.body as { canonical_response: FormResponse; expected_draft_version?: number };
      if (request.method === 'PATCH') { expect(request.url).toBe('https://server.example.test/drafts/owned-draft'); expect(body.expected_draft_version).toBe(revision); }
      else { expect(request.method).toBe('POST'); expect(revision).toBe(0); }
      response = structuredClone(body.canonical_response); revision++; return jsonResponse(view());
    });
    const metadata = new Map<string, unknown>();
    const signingPolicy = { validateResponse: validateCanonicalFormResponse, validateContent: await loadCanonicalSigningContentValidator(),
      signingProfileDigest: async (response: FormResponse) => createHash('sha256').update(canonicalResponseSignedPayloadBytes(response)).digest('hex'), keyId: 'unused-sign-key' };
    const makeCohort = () => createHttpAdapterCohort({ baseUrl: 'https://server.example.test', fetchImpl: transport.fetch, formIdResolver: () => 'form',
      resumeMetadata: { read: slot => metadata.get(slot), write: (slot, value) => { metadata.set(slot, structuredClone(value)); }, remove: slot => { metadata.delete(slot); } }, responseSigning: signingPolicy });
    await makeCohort().draftStore.save(key, partial);
    const cohort = makeCohort();
    const host = createNativePackageSigningHost({ ...fixture.policy, initialLocale: 'es-US',
      controller: { ...fixture.policy.controller, signing: cohort.responseSigning!, validateResponse: validateCanonicalFormResponse },
      invalidateAuthority: (_reason, key) => { if (key) cohort.invalidateResponseSigningScope!(key); }, clearDraftAccess: key => cohort.draftStore.delete(key) });
    const configure = host.configureRuntime; const invocations: unknown[] = []; let engine!: Parameters<typeof configure>[0]['engine'];
    host.configureRuntime = async input => {
      engine = input.engine; const configured = await configure(input);
      return { ...configured, responseActionInvoker: async action => { const result = await configured.responseActionInvoker(action); invocations.push(result); return result; } };
    };
    const composition = createStubComposition(); composition.draftStore = cohort.draftStore;
    composition.identityProvider.authenticate = async () => ({ provider: 'test-owner', adapter: 'test', subjectRef: 'server-actor',
      credentialType: 'other', subjectBinding: 'respondent', assuranceLevel: 'L1', privacyTier: 'anonymous' });
    composition.identityProvider.subscribe = () => () => {};
    const mounted = render(<NativePackageRespondentHost {...fixture.props} host={host} composition={composition} />);
    await screen.findByRole('button', { name: 'Guardar borrador' });
    await act(async () => { engine.loadResponseData(capturedData as Parameters<typeof engine.loadResponseData>[0]); });
    await vi.waitFor(() => expect(engine.getResponse({ profile: 'off' }).data).toEqual(capturedData));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(engine.getInstanceData('draftReadiness')).toEqual({ ready: true, owned: true });
    const save = await screen.findByRole('button', { name: 'Guardar borrador' }); save.focus();
    // jsdom does not synthesize a button click from Enter; include its native activation click.
    fireEvent.keyDown(save, { key: 'Enter' }); fireEvent.click(save); fireEvent.keyUp(save, { key: 'Enter' });
    await vi.waitFor(() => expect(host.getSnapshot().controller?.phase, JSON.stringify({ invocations, requests: transport.requests, scratch: engine.getInstanceData('draftReadiness'), initialWhen: engine.compileExpression("@instance('draftReadiness').ready and not(@instance('draftReadiness').owned)", '')(), ownedWhen: engine.compileExpression("@instance('draftReadiness').ready and @instance('draftReadiness').owned", '')(), snapshot: host.getSnapshot().controller })).toBe('saved'));
    expect(invocations).toHaveLength(1);
    expect(invocations[0]).toMatchObject({ status: 'completed', resolution: { action: { id: 'save-draft-owned' } } });
    expect(revision).toBe(2); expect(response.id).toBe(partial.id); expect(response.data).toEqual(capturedData);
    expect(transport.requests.filter(request => request.method === 'POST')).toHaveLength(1);
    expect(transport.requests.filter(request => request.method === 'PATCH')).toHaveLength(1);
    expect(transport.requests.filter(request => request.method === 'GET')).toHaveLength(3);
    fireEvent.click(await screen.findByRole('button', { name: 'Preparar la respuesta guardada' }));
    await vi.waitFor(() => expect(host.getSnapshot().controller?.phase).toBe('prepared'));
    expect(revision).toBe(3); expect(host.getSnapshot().controller?.prepared?.response).toEqual(response);
    mounted.unmount(); host.dispose();
  });
  it('uses the qualified form title and existing provider container across languages without writes', async () => {
    const { host, props, saveDraft, prepare, sign, submit, getEngine } = await actualFixture();
    // Model the real anonymous service's same selected owner across Locale remounts.
    const authenticate = props.composition.identityProvider.authenticate;
    let owner: ReturnType<typeof authenticate> | undefined;
    props.composition.identityProvider.authenticate = option => owner ??= authenticate(option);
    const mounted = render(<NativePackageRespondentHost {...props} />);
    await screen.findByRole('heading', { level: 1, name: 'Passport renewal' });
    const input = await screen.findByRole('textbox', { name: 'Full legal name *' });
    const container = input.closest('.formspec-container') as HTMLElement;
    expect(container).not.toBeNull();
    expect(mounted.container.querySelectorAll('.formspec-container')).toHaveLength(1);
    expect(container.style.getPropertyValue('--formspec-color-primary')).not.toBe('');
    expect(getEngine().getFormVM().title.value).toBe('Passport renewal');
    expect(document.title).toBe('Passport renewal');
    await act(async () => { await host.selectLocale('es-US'); });
    await screen.findByRole('heading', { level: 1, name: 'Renovación de pasaporte' });
    expect(document.title).toBe('Renovación de pasaporte');
    const translatedInput = await screen.findByRole('textbox', { name: 'Nombre legal completo *' });
    expect(mounted.container.querySelectorAll('.formspec-container')).toHaveLength(1);
    expect(translatedInput.closest('.formspec-container')).not.toBeNull();
    expect(saveDraft).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    mounted.unmount(); expect(host.getSnapshot().formTitle).toBe('Renovación de pasaporte'); host.dispose();
  });
  it('preserves an explicit authored route title while presenting the qualified app title', () => {
    const test = fixture(); test.host.getSnapshot().formTitle = 'Qualified form title';
    test.host.bundle.surfaces[0].routes[0].title = 'Authored route heading';
    render(<NativePackageRespondentHost {...test.props} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Authored route heading' })).toBeDefined();
    expect(document.title).toBe('Qualified form title');
  });

  it('retains the actual session owner through child unmount and retries a failed scoped Clear', async () => {
    const { host, props, saveDraft, clear } = await actualFixture();
    const mounted = render(<NativePackageRespondentHost {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(host.getSnapshot().controller?.phase).toBe('saved'));
    const key = saveDraft.mock.calls[0][0].draftKey;
    clear.mockRejectedValueOnce(new Error('delete-failed'));
    const pending = host.clearDraftAccess(); mounted.unmount();
    await expect(pending).rejects.toThrow('delete-failed');
    await host.clearDraftAccess(); expect(clear).toHaveBeenCalledTimes(2);
    expect(clear.mock.calls).toEqual([[key], [key]]);
    host.dispose();
  });
  it('runs actual r5 Save, Prepare, independently reviewed Sign and exact signed Submit through maintained controls', async () => {
    const { host, props, saveDraft, prepare, navigate, terminals, getEngine, read, reports, photoBytes, completeRead, sign, submit } = await actualFixture();
    const mounted = render(<NativePackageRespondentHost {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(host.getSnapshot().controller?.phase).toBe('saved'));
    expect(getEngine().getValidationReport({ profile: 'on-submit' }).results).toEqual([]);
    const prepareButton = await screen.findByRole('button', { name: 'Prepare saved response' });
    await vi.waitFor(() => expect((prepareButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(prepareButton);
    await vi.waitFor(() => expect(host.getSnapshot().controller?.phase).not.toBe('saved'));
    expect(host.getSnapshot().controller?.reason).toBeUndefined();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    expect(host.getSnapshot().controller).toMatchObject({ phase: 'prepared' });
    expect(terminals.at(-1)).toEqual({ status: 'completed', valid: true });
    const prepared = host.getSnapshot().controller!.prepared!; expect(prepared.response.id).toBeTruthy();
    mounted.rerender(<NativePackageRespondentHost {...props} location="/review-sign" />);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    expect(await screen.findByText('Alex Rivera')).toBeDefined(); expect(screen.getByText('000000000')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Sign demo response' }) as HTMLButtonElement).disabled).toBe(true);
    expect(host.getSnapshot().controller!.prepared!.response).toEqual(prepared.response);
    completeRead(new Blob([photoBytes], { type: 'image/png' }));
    fireEvent.load(await screen.findByRole('img', { name: /saved photo/i }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(reports.join(' -> ')).not.toContain('unavailable');
    expect(read).toHaveBeenCalledOnce(); expect(screen.getByText('000000000')).toBeDefined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your name for this demonstration' }), { target: { value: 'Demo signer' } });
    fireEvent.scroll(screen.getByRole('region', { name: 'Review and sign this demo response' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I have read the complete sample text.' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I consent to electronic signing for this demo response.' }));
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Sign demo response' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Sign demo response' }));
    await vi.waitFor(() => expect(host.getSnapshot().controller?.phase).toBe('signed'));
    expect(sign).toHaveBeenCalledOnce(); expect(submit).not.toHaveBeenCalled();
    const signed = host.getSnapshot().controller!.signed!;
    expect(signed.response.id).toBe(prepared.response.id); expect(signed.response.data).toEqual(prepared.response.data);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect((screen.getByRole('button', { name: 'Submit demo response' }) as HTMLButtonElement).disabled).toBe(true);
    completeRead(new Blob([photoBytes], { type: 'image/png' }));
    fireEvent.load(await screen.findByRole('img', { name: /saved photo/i }));
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Submit demo response' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Submit demo response' }));
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0].extensions!['x-formspec-response']).toEqual(signed.response);
    expect(host.getSnapshot().controller!.signed!.response).toEqual(signed.response);
    expect(saveDraft).toHaveBeenCalledOnce(); expect(prepare).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/review-sign'); mounted.unmount(); host.dispose();
  });
  it('mounts the actual authored r5 Definition slot and passes the qualified Component and ownership seam unchanged', () => {
    const test = fixture(); const mounted = render(<NativePackageRespondentHost {...test.props} />);
    expect(screen.getByTestId('admitted-form')).toBeDefined();
    const form = observed.forms.at(-1) as ResolvedRespondentFormInput;
    expect(form.definition).toEqual(bundle.documents[bundle.manifest.definitions![0].url]);
    expect(form.componentDocument).toBe(component); expect(form.configureRuntime).toBe(test.configureRuntime);
    expect(form.activeLocale).toBe('en');
    mounted.rerender(<NativePackageRespondentHost {...test.props} />);
    expect(observed.forms.at(-1)).toBe(form);
  });
  it('renders the maintained ceremony as unavailable before owned preparation without losing the session on route change', async () => {
    const test = fixture(); const mounted = render(<NativePackageRespondentHost {...test.props} />);
    mounted.rerender(<NativePackageRespondentHost {...test.props} location="/review-sign" />);
    expect(screen.queryByTestId('admitted-form')).toBeNull();
    expect(test.configureRuntime).not.toHaveBeenCalled(); expect(test.dispose).not.toHaveBeenCalled();
    mounted.unmount(); await act(async () => {}); expect(test.dispose).not.toHaveBeenCalled();
  });
  it('survives StrictMode lifecycle replay and leaves global disposal to the session owner', async () => {
    const test = fixture(); const mounted = render(<StrictMode><NativePackageRespondentHost {...test.props} /></StrictMode>);
    await act(async () => {}); expect(test.dispose).not.toHaveBeenCalled();
    mounted.unmount(); await act(async () => {}); expect(test.dispose).not.toHaveBeenCalled();
  });
  it('renders only the actual Component Save branch and adds Prepare after ownership, keeping ceremony actions off intake', async () => {
    const resolved = dereferenceBundleExport(bundle);
    const definition = [...resolved.definitions.values()][0];
    const entries = flattenRegistryEntries(resolved.registries).entries;
    const engine = createFormEngine(definition, { registryEntries: [...entries] });
    const locales = Object.values(bundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document) as LocaleDocument[];
    for (const document of locales) engine.loadLocale(document);
    engine.setLocale('en'); engine.setInstanceValue('draftReadiness', 'ready', true);
    render(<FormspecForm engine={engine} componentDocument={component} responseActionsDocument={resolved.responseActions[0]} />);
    expect(screen.getAllByRole('button', { name: 'Save draft' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Prepare saved response' })).toBeNull();
    await act(async () => engine.setInstanceValue('draftReadiness', 'owned', true));
    expect(screen.getAllByRole('button', { name: 'Save draft' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Prepare saved response' })).toBeDefined();
    for (const actionId of ['sign', 'submit', 'paper']) {
      const ref = resolved.responseActions[0].actions.find(action => action.id === actionId)!.label as { ref: string };
      const label = locales.find(document => document.locale === 'en' && Object.hasOwn(document.strings, ref.ref))!.strings[ref.ref];
      expect(screen.queryByRole('button', { name: String(label) })).toBeNull();
    }
    cleanup(); engine.dispose();
  });
});

function persistentFeedback(container: HTMLElement) {
  return [...container.querySelectorAll('.formspec-action-status[role="status"]')].map(node => node.textContent).join('');
}
function pauseActualSave(test: Awaited<ReturnType<typeof actualFixture>>) {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const original = test.saveDraft.getMockImplementation()!;
  test.saveDraft.mockImplementationOnce(async input => { await pending; return original(input); });
  return finish;
}

describe('actual native initial Save persistent feedback', () => {
  it('keeps one completion across Save branch replacement and localizes it within the same provider', async () => {
    const test = await actualFixture();
    // Model the maintained anonymous bridge's stable owner across Locale bootstrap.
    const authenticate = test.props.composition.identityProvider.authenticate;
    let owner: ReturnType<typeof authenticate> | undefined;
    test.props.composition.identityProvider.authenticate = option => owner ??= authenticate(option);
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    const initial = await screen.findByRole('button', { name: 'Save draft' });
    fireEvent.click(initial);
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    expect(initial.isConnected).toBe(false);
    expect(screen.getAllByRole('button', { name: 'Save draft' })).toHaveLength(1);
    expect(test.host.getSnapshot().controller).toMatchObject({ phase: 'saved', owned: true });
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.terminals).toEqual([{ status: 'completed', valid: undefined }]);
    const engine = test.getEngine();
    await act(async () => { engine.setLocale('es-US'); });
    await screen.findByRole('button', { name: 'Guardar borrador' });
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completado.'));
    expect(test.getEngine()).toBe(engine);
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.terminals).toHaveLength(1);
    mounted.unmount(); test.host.dispose();
  });


  it('retires previous feedback and a late owned Save across actual native Locale bootstrap without reinvoking', async () => {
    const test = await actualFixture();
    const authenticate = test.props.composition.identityProvider.authenticate;
    let owner: ReturnType<typeof authenticate> | undefined;
    test.props.composition.identityProvider.authenticate = option => owner ??= authenticate(option);
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    const engine = test.getEngine(); const finish = pauseActualSave(test);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledTimes(2));
    await act(async () => { await test.host.selectLocale('es-US'); });
    await screen.findByRole('button', { name: 'Guardar borrador' });
    expect(test.getEngine()).not.toBe(engine); expect(persistentFeedback(mounted.container)).toBe('');
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(test.invokerFailures).toHaveLength(1));
    expect(test.terminals).toEqual([{ status: 'completed', valid: undefined }]);
    expect(test.saveDraft).toHaveBeenCalledTimes(2); expect(persistentFeedback(mounted.container)).toBe('');
    mounted.unmount(); test.host.dispose();
  });
  it('keeps the native pending control focusable and joins repeated activation before one callback', async () => {
    const test = await actualFixture(); const finish = pauseActualSave(test);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    const initial = await screen.findByRole('button', { name: 'Save draft' }); initial.focus();
    fireEvent.keyDown(initial, { key: 'Enter' }); fireEvent.click(initial); fireEvent.keyUp(initial, { key: 'Enter' });
    await vi.waitFor(() => expect(initial.getAttribute('aria-busy')).toBe('true'));
    expect(initial.hasAttribute('disabled')).toBe(false); expect(initial.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(initial);
    fireEvent.click(initial); await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    const status = mounted.container.querySelector<HTMLElement>('.formspec-action-status[role="status"]')!;
    expect(initial.isConnected).toBe(false); expect(status.isConnected).toBe(true);
    expect(status.tabIndex).toBe(-1); expect(document.activeElement).toBe(status);
    expect(focus.mock.instances.filter(target => target === status)).toHaveLength(1);
    expect(test.terminals).toEqual([{ status: 'completed', valid: undefined }]); expect(test.saveDraft).toHaveBeenCalledOnce();
    await act(async () => { test.getEngine().setLocale('es-US'); });
    await vi.waitFor(() => expect(status.textContent).toBe('Completado.'));
    expect(document.activeElement).toBe(status); expect(focus.mock.instances.filter(target => target === status)).toHaveLength(1);
    focus.mockRestore();
    mounted.unmount(); test.host.dispose();
  });

  it('retires settled feedback on UI edits and public data replacement, and rejects late edited completion', async () => {
    const test = await actualFixture(); const mounted = render(<NativePackageRespondentHost {...test.props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    fireEvent.input(screen.getByRole('textbox', { name: 'Full legal name *' }), { target: { value: 'Edited name' } });
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe(''));
    expect(test.getEngine().getResponse({ profile: 'off' }).data.fullName).toBe('Edited name');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    const finish = pauseActualSave(test);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledTimes(3));
    await act(async () => { test.getEngine().loadResponseData({ ...test.getEngine().getResponse({ profile: 'off' }).data, fullName: 'Replacement name' }); });
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe(''));
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(test.invokerFailures).toHaveLength(1));
    expect(test.terminals).toHaveLength(2); expect(persistentFeedback(mounted.container)).toBe('');
    expect(test.getEngine().getResponse({ profile: 'off' }).data.fullName).toBe('Replacement name');
    mounted.unmount(); test.host.dispose();
  });

  it('withdraws pending feedback on actual scoped Clear and refuses late completion authority', async () => {
    const test = await actualFixture(); const finish = pauseActualSave(test);
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    await act(async () => { await test.host.clearDraftAccess(); });
    expect(test.clear).toHaveBeenCalledOnce(); expect(test.host.getSnapshot().cleared).toBe(true);
    expect(persistentFeedback(mounted.container)).toBe('');
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(test.invokerFailures).toHaveLength(1));
    expect(test.terminals).toHaveLength(0); expect(test.host.getSnapshot().controller?.phase).not.toBe('saved');
    expect(persistentFeedback(mounted.container)).toBe('');
    mounted.unmount(); test.host.dispose();
  });
});


describe('actual native Save completion focus custody', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['move', 'blur'] as const)('does not steal focus after deliberate user %s while initial Save is pending', async departure => {
    const test = await actualFixture(); const finish = pauseActualSave(test);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const mounted = render(<><button>Outside the form</button><NativePackageRespondentHost {...test.props} /></>);
    const initial = await screen.findByRole('button', { name: 'Save draft' }); initial.focus(); fireEvent.click(initial);
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    const outside = screen.getByRole('button', { name: 'Outside the form' });
    if (departure === 'move') outside.focus(); else initial.blur();
    const expectedFocus = document.activeElement;
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    const status = mounted.container.querySelector<HTMLElement>('.formspec-action-status[role="status"]')!;
    expect(initial.isConnected).toBe(false); expect(status.isConnected).toBe(true);
    expect(document.activeElement).toBe(expectedFocus);
    expect(focus.mock.instances.filter(target => target === status)).toHaveLength(0);
    expect(test.terminals).toHaveLength(1); expect(test.saveDraft).toHaveBeenCalledOnce();
    mounted.unmount(); test.host.dispose();
  });

  it('keeps the surviving focused control on non-success and never focuses its status', async () => {
    const test = await actualFixture(); test.saveDraft.mockRejectedValueOnce(new Error('test-port-refused'));
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    const initial = await screen.findByRole('button', { name: 'Save draft' }); initial.focus(); fireEvent.click(initial);
    await vi.waitFor(() => expect(test.terminals).toHaveLength(1));
    expect(test.terminals[0].status).not.toBe('completed'); expect(initial.isConnected).toBe(true);
    expect(document.activeElement).toBe(initial);
    const status = mounted.container.querySelector<HTMLElement>('.formspec-action-status[role="status"]')!;
    expect(focus.mock.instances.filter(target => target === status)).toHaveLength(0);
    mounted.unmount(); test.host.dispose();
  });

  it.each(['edit', 'clear'] as const)('never recovers focus for a late retired %s completion', async retirement => {
    const test = await actualFixture(); const finish = pauseActualSave(test);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const mounted = render(<><button>Outside the form</button><NativePackageRespondentHost {...test.props} /></>);
    const initial = await screen.findByRole('button', { name: 'Save draft' }); initial.focus(); fireEvent.click(initial);
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    if (retirement === 'edit') await act(async () => { test.getEngine().setValue('fullName', 'Retired answer'); });
    else await act(async () => { await test.host.clearDraftAccess(); });
    const outside = screen.getByRole('button', { name: 'Outside the form' }); outside.focus();
    const focusCallCount = focus.mock.calls.length;
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(test.invokerFailures).toHaveLength(1));
    expect(document.activeElement).toBe(outside); expect(focus.mock.calls).toHaveLength(focusCallCount);
    expect(test.terminals).toHaveLength(0); expect(persistentFeedback(mounted.container)).toBe('');
    mounted.unmount(); test.host.dispose();
  });

  it('does not recover focus when a surviving owned Save control is removed in a later readiness change', async () => {
    const test = await actualFixture(); const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    const owned = screen.getByRole('button', { name: 'Save draft' }); owned.focus(); fireEvent.click(owned);
    await vi.waitFor(() => expect(test.terminals).toHaveLength(2));
    expect(owned.isConnected).toBe(true); expect(document.activeElement).toBe(owned);
    const status = mounted.container.querySelector<HTMLElement>('.formspec-action-status[role="status"]')!;
    const recoveryCount = focus.mock.instances.filter(target => target === status).length;
    await act(async () => { test.getEngine().setInstanceValue('draftReadiness', 'ready', false); });
    expect(owned.isConnected).toBe(false); expect(document.activeElement).not.toBe(status);
    expect(focus.mock.instances.filter(target => target === status)).toHaveLength(recoveryCount);
    expect(test.saveDraft).toHaveBeenCalledTimes(2); expect(test.terminals).toHaveLength(2);
    mounted.unmount(); test.host.dispose();
  });
});


describe('actual native Save modeled connected focusout ordering', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['completion-commit', 'before-settlement'] as const)('recovers through modeled connected focusout during real renderer deletion: %s', async timing => {
    const test = await actualFixture(); const finish = pauseActualSave(test);
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    const initial = await screen.findByRole('button', { name: 'Save draft' }); initial.focus(); fireEvent.click(initial);
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    const status = mounted.container.querySelector<HTMLElement>('.formspec-action-status[role="status"]')!;
    const focus = vi.spyOn(status, 'focus');
    const observedOrder: { connected: boolean; active: boolean }[] = [];
    const nativeRemove = Node.prototype.removeChild;
    // Model the reported event order inside actual React deletion and delegate real removal.
    // This is a policy regression, not evidence of native browser event ordering.
    vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(this: Node, child: T): T {
      if (child.contains(initial) && initial.isConnected && document.activeElement === initial) {
        observedOrder.push({ connected: initial.isConnected, active: document.activeElement === initial });
        initial.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      }
      return nativeRemove.call(this, child) as T;
    });
    if (timing === 'before-settlement') await act(async () => { test.getEngine().setInstanceValue('draftReadiness', 'owned', true); });
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    expect(observedOrder).toEqual([{ connected: true, active: true }]); expect(initial.isConnected).toBe(false);
    expect(status.isConnected).toBe(true); expect(status.tabIndex).toBe(-1); expect(document.activeElement).toBe(status);
    expect(focus).toHaveBeenCalledExactlyOnceWith();
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.terminals).toEqual([{ status: 'completed', valid: undefined }]);
    mounted.unmount(); test.host.dispose();
  });

  it('permanently refuses recovery for connected focusout before renderer detachment', async () => {
    const test = await actualFixture(); const finish = pauseActualSave(test);
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    const initial = await screen.findByRole('button', { name: 'Save draft' }); initial.focus(); fireEvent.click(initial);
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    const status = mounted.container.querySelector<HTMLElement>('.formspec-action-status[role="status"]')!;
    const focus = vi.spyOn(status, 'focus');
    expect(initial.isConnected).toBe(true);
    initial.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    await act(async () => { finish(); });
    await vi.waitFor(() => expect(persistentFeedback(mounted.container)).toBe('Completed.'));
    expect(initial.isConnected).toBe(false); expect(document.activeElement).not.toBe(status);
    expect(focus).not.toHaveBeenCalled(); expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.terminals).toHaveLength(1);
    mounted.unmount(); test.host.dispose();
  });
});
