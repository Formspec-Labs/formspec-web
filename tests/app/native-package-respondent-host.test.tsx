import { useState } from 'react';
import { nativeFactsProductHttpFixture } from '../adapters/http/native-facts-product-http-fixture.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act, fireEvent } from '@testing-library/react';
import { dereferenceBundleExport, flattenRegistryEntries, type BundleExport } from '@formspec-org/surface';
import { createFormEngine, hashSigningContent } from '@formspec-org/engine/render';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { starterWidgetModule, type SurfaceScreenerCompletionPolicy, type SurfaceScreenerCompletionRequest } from '@formspec-org/surface-react';
import { FormspecForm, createSemanticControlRegistry } from '@formspec-org/react';
import { canonicalResponseHandoffBytes, canonicalResponseSignedPayloadBytes } from '@formspec-org/integrity-canonical';
import type { ComponentDocument, LocaleDocument, FormResponse, SigningContent, SurfaceDocument } from '@formspec-org/types';
import type { ComponentRouteResolver } from '@formspec-org/app-graph';
import { replaceNativeFormEngine } from '../../src/shared/native-engine-replacement.ts';
import { createNativeScreenerCoordinator } from '../../src/shared/native-screener-coordinator.ts';
import { hydrationFixture } from '../adapters/http/screener-hydration-fixture.ts';
import type { ScreenerRetention } from '../../src/ports/screener-retention.ts';
import { NativePackageRuntime } from '../../src/app/NativePackageRuntime.tsx';
import { AnonymousSessionBridge } from '../../src/adapters/http/anonymous-session.ts';
import { delegatedSignedResponseFixture } from '../adapters/http/delegated-signed-response-fixture.ts';
import { NativePackageRespondentHost } from '../../src/app/NativePackageRespondentHost.tsx';
import { createNativePackageSigningHost, type NativePackageSigningHost, type NativePackageSigningHostPolicy } from '../../src/shared/native-package-signing-host.ts';
import type { ApplicationLifecycle } from '../../src/ports/application-lifecycle.ts';
import { computeJcsSha256Digest } from '../../src/adapters/http/response-action-ledger.ts';
import type { FormDefinition, ScreenerDocument } from '@formspec-org/types';
import type { SavedResponseDraft } from '../../src/ports/response-signing.ts';
import type { SubmitTransport } from '../../src/ports/submit-transport.ts';
import { sampleIntakeHandoff } from '../../src/adapter-conformance/fixtures.ts';
import type { ResolvedRespondentFormInput } from '../../src/app/RespondentRuntime.tsx';
import type * as RespondentRuntimeModule from '../../src/app/RespondentRuntime.tsx';
import { createTestComposition, testDefinition } from '../fixtures/composition.ts';
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
const lifecycleRoot = resolve('public/demo-packages/d1-passport/v0.1.7');
const lifecycleBundle = JSON.parse(readFileSync(resolve(lifecycleRoot, 'native-bundle.json'), 'utf8')) as BundleExport;
const lifecycleComponent = JSON.parse(readFileSync(resolve(lifecycleRoot, 'passport-renewal.component.json'), 'utf8')) as ComponentDocument;
const componentResolver = (document: ComponentDocument) => vi.fn<ComponentRouteResolver>(() => ({ status: 'ready', diagnostics: [],
  component: { artifactKind: 'component', slot: 'component', status: 'loaded', document } }));
beforeAll(() => initFormspecEngine());
afterEach(() => { cleanup(); observed.forms.length = 0; observed.real = false; vi.unstubAllGlobals(); });
function fixture() {
  const configureRuntime = vi.fn(); const dispose = vi.fn();
  const state = { generation: 0, sessionGeneration: 0, locale: 'en', formTitle: '', cleared: false, editableSessionActive: false, controller: undefined, runtime: undefined, submitted: undefined };
  const host = { getStartupRoute: () => ({ entryHref: '/', entryTitle: undefined, requiresHostState: false }), definition: [...dereferenceBundleExport(bundle).definitions.values()][0], moduleId: 'x-demo-signing', widgetModules: [starterWidgetModule('x-demo-signing', { responseReview: {} })], bundle: dereferenceBundleExport(structuredClone(bundle)), reviewOptions: {}, configureRuntime, configureSubmittedRuntime: vi.fn(), dispose,
    allocateSurfaceSessionMarker: () => 'fixture-visit',
    createSurfaceVisit: () => ({ activate: vi.fn(), dispose: vi.fn(), bindRuntime: () => ({ authorizeDataSource: () => ({ status: 'refused' as const, reason: 'unavailable' }), dataSourceLoader: () => ({ status: 'unavailable' as const, reason: 'unavailable' }), validateDataSourcePayload: () => ({ valid: true }), dataSourceRevision: () => undefined, widgetActionExecutor: vi.fn() }) }),
    restoreOwnedDraftAccess: vi.fn(async () => {}), widgetExecutor: vi.fn(), getSnapshot: () => state, subscribe: () => () => {}, selectLocale: vi.fn(), clearDraftAccess: vi.fn() } satisfies NativePackageSigningHost;
  const props = { host, composition: createTestComposition({ definition: testDefinition }), config: departmentAppProfile, componentDocument: component, componentRouteResolver: componentResolver(component),
    localeDocuments: [], location: '/', onNavigate: vi.fn() };
  return { props, host, configureRuntime, dispose };
}
async function actualFixture(options?: { bundle?: BundleExport; component?: ComponentDocument; lifecycle?: NonNullable<NativePackageSigningHostPolicy['controller']['applicationLifecycle']>; candidateHydration?: NativePackageSigningHostPolicy['candidateHydration']; nativeScreener?: NativePackageSigningHostPolicy['nativeScreener']; screenerEntryGate?: NativePackageSigningHostPolicy['screenerEntryGate']; createEngine?: NativePackageSigningHostPolicy['createEngine']; onSaved?: (response: FormResponse, revision: number) => void }) {
    const sourceBundle = options?.bundle ?? bundle;
    const admittedComponent = options?.component ?? component;
    observed.real = true; vi.stubGlobal('crypto', webcrypto);
    const Url = URL; vi.stubGlobal('URL', class extends Url { static override createObjectURL() { return 'blob:test-photo'; } static override revokeObjectURL() {} });
    const photoBytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhOsAAAAASUVORK5CYII=', 'base64'));
    const resolved = dereferenceBundleExport(sourceBundle); const definition = [...resolved.definitions.values()][0];
    const locales = Object.values(sourceBundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document) as LocaleDocument[];
    const document = resolved.responseActions[0]; const surface = resolved.surfaces[0]; const route = surface.routes.find(route => route.path === '/review-sign')!;
    type Binding = { moduleId: string; widgetName: string; dataBindings: Record<string, { catalogRef: string; sourceRef: string }>; actionBindings: Record<string, { actionRef: string; responseInput: string }> };
    const ceremony = route.slots!.find(slot => slot.slotType === 'module-widget' && (slot.binding as Binding).widgetName === 'SigningCeremony')!;
    const review = route.slots!.find(slot => slot.slotType === 'module-widget' && (slot.binding as Binding).widgetName === 'ResponseReview')!;
    const binding = ceremony.binding as Binding;
    const bindings = Object.fromEntries(Object.entries({ ...(review.binding as Binding).dataBindings, ...binding.dataBindings }).map(([name, source]) => [name, { catalogRef: source.catalogRef, sourceRef: source.sourceRef }]));
    const roles: NativePackageSigningHostPolicy['controller']['roles'] = {};
    for (const [name, actionRef] of Object.entries({ ...(options?.lifecycle ? { startApplication: 'start-application' } : {}), saveInitial: 'save-draft-initial', saveOwned: 'save-draft-owned', prepare: 'prepare', sign: 'sign', submit: 'submit', paper: 'paper' })) {
      const action = document.actions.find(action => action.id === actionRef)!; const effect = action.effects![0];
      const output = Object.entries(binding.actionBindings).find(([, value]) => value.actionRef === actionRef);
      roles[name as keyof typeof roles] = { document, actionRef, artifactRef: sourceBundle.manifest.responseActionDocuments![0].url, artifactDigest: `sha256:${'b'.repeat(64)}`,
        ...(effect.type === 'serviceRequest' ? { requestRef: effect.requestRef } : {}), ...(output ? {
          responseSource: { inputName: output[1].responseInput, ...bindings[output[1].responseInput] },
          widgetSource: { moduleId: binding.moduleId, widgetName: binding.widgetName, slotId: ceremony.id, outputName: output[0],
            route: { surfaceId: surface.id, surfaceRef: resolved.surfaceRefs?.get(surface), routeId: route.id, routeClass: route.routeClass, params: {} } } } : {}) };
    }
    const hashResponse = async (response: FormResponse) => createHash('sha256').update(canonicalResponseHandoffBytes(response)).digest('hex');
    let revision = 0;
    const saved = async (input: { draftKey: SavedResponseDraft['draftKey']; response: FormResponse }): Promise<SavedResponseDraft> => {
      const version = ++revision;
      options?.onSaved?.(input.response, version);
      return { draftKey: input.draftKey, response: input.response,
        draft: { id: 'owned-draft', version, responseHash: await hashResponse(input.response) }, actor: { id: 'server-actor' },
        evidence: { draft_id: 'owned-draft', draft_version: version, form_version_id: 'publication', subject_ref: 'server-actor', canonical_response: input.response, draft_state: input.response.data, status: 'in_progress' } };
    };
    const contents = (definition.extensions!['x-formspec-signing-content'] as { entries: Record<string, SigningContent> }).entries;
    const content = (locale: string) => Object.values(contents).find(content => content.locale === locale)!;
    const saveDraft = vi.fn(saved); const prepare = vi.fn(async (input: Parameters<NativePackageSigningHostPolicy['controller']['signing']['prepare']>[0]) => ({ ...await saved(input), content: content(input.locale) }));
    const signWrites = vi.fn();
    const signingActs = new Map<string, { candidate: FormResponse; version: number }>();
    const sign = vi.fn(async (input: Parameters<NativePackageSigningHostPolicy['controller']['signing']['sign']>[0]) => {
      const preparation = input.preparation; const content = preparation.content; const signedAt = '2026-10-07T12:00:00Z';
      const documentHash = await hashSigningContent(content, () => true);
      const candidate: FormResponse = signingActs.get(input.operationId)?.candidate ?? { ...structuredClone(preparation.response), extensions: { ...preparation.response.extensions,
        'x-formspec-signing-content': { version: '1.0', content, documentHash, documentHashAlgorithm: 'sha-256', actorRef: preparation.actor.id,
          draftId: preparation.draft.id, draftVersion: ++revision, signerName: input.assent.signerName, signedAt, consentAccepted: true } } };
      if (!signingActs.has(input.operationId)) signingActs.set(input.operationId, { candidate, version: revision });
      const candidateVersion = signingActs.get(input.operationId)!.version;
      if (options?.nativeScreener) {
        const gateCandidate: SavedResponseDraft = { ...preparation, response: candidate,
          draft: { ...preparation.draft, version: candidateVersion, responseHash: await hashResponse(candidate) },
          evidence: { ...preparation.evidence, draft_version: candidateVersion, canonical_response: candidate, draft_state: candidate.data } };
        const guard = await host.preSignCandidate!({ saved: gateCandidate, operationId: input.operationId, assertCurrent() {} }); guard.assertCurrent();
      }
      const response: FormResponse = { ...candidate, authoredSignatures: [{ signatureId: 'port-double-signature', ceremonyId: 'port-double-ceremony',
        signatureProvider: 'urn:test:delegated-port', documentId: content.documentId, signingIntent: content.signingIntent,
        signatureValue: 'cG9ydC1kb3VibGU=', signerId: preparation.actor.id, signerName: input.assent.signerName, consentAccepted: true,
        consentTextRef: content.electronicConsent.textRef, consentVersion: content.electronicConsent.version,
        affirmationText: content.affirmationText, documentHash, documentHashAlgorithm: 'sha-256', signedPayload: {
          canonicalization: 'formspec-response-signing-v1', digestAlgorithm: 'sha-256', digest: createHash('sha256').update(canonicalResponseSignedPayloadBytes(candidate)).digest('hex'),
          responseId: candidate.id!, definitionUrl: candidate.definitionUrl, definitionVersion: candidate.definitionVersion, signedAt, signingIntent: content.signingIntent } }] };
      signWrites();
      return { ...await saved({ draftKey: preparation.draftKey, response }), content, verification: { mode: 'delegated-service-key' as const, provider: 'urn:test:delegated-port', keyId: 'test-key' } };
    });
    const submit = vi.fn<SubmitTransport['submit']>(async () => ({ status: 'accepted' as const, referenceNumber: 'owned-result', recordKind: 'response' as const }));
    let completeRead!: (blob: Blob) => void;
    const read = vi.fn(async () => new Promise<Blob>(resolve => { completeRead = resolve; }));
    const clear = vi.fn(async () => {}); const invalidateAuthority = vi.fn();
    const policy: NativePackageSigningHostPolicy = { candidateHydration: options?.candidateHydration, screenerEntryGate: options?.screenerEntryGate, nativeScreener: options?.nativeScreener, createEngine: options?.createEngine, bundle: sourceBundle, definition, moduleId: binding.moduleId, locales, initialLocale: 'en',
      registryEntries: flattenRegistryEntries(resolved.registries).entries, publication: { formId: 'form', formVersionId: 'publication' },
      readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' }, clearDraftAccess: clear,
      applicationReadiness: options?.lifecycle ? { instance: 'draftReadiness', canStartPath: 'canStart', startedPath: 'started', persistentSavingPath: 'persistentSaving' } : undefined,
      controller: { applicationLifecycle: options?.lifecycle, roles, signing: { saveDraft, prepare, sign }, submitTransport: { submit }, validateResponse: () => true, hashResponse },
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
    let runtimeInput!: Parameters<typeof configure>[0];
    host.configureRuntime = async input => {
      mountedEngine = input.engine; runtimeInput = input;
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
    const composition = createTestComposition({ definition: testDefinition }); const navigate = vi.fn();
    const props = { host, composition, config: departmentAppProfile, componentDocument: admittedComponent, componentRouteResolver: componentResolver(admittedComponent), localeDocuments: locales, location: '/', onNavigate: navigate };
    return { policy, host, props, saveDraft, prepare, navigate, terminals, getEngine: () => mountedEngine, getRuntimeInput: () => runtimeInput, invokerFailures, read, reports, photoBytes, completeRead: (blob: Blob) => completeRead(blob), clear, sign, signWrites, submit };
}
function lifecycleFixture(earlyCaseCreation = true, persistentSaving = true) {
  const receipt = { caseLedgerId: 'urn:wos:real-case', caseReference: 'APP-001', draftRef: 'urn:formspec:draft:owned-draft', status: 'in-progress' as const };
  const lifecycle = { capabilities: { earlyCaseCreation, persistentSaving, formVersionId: 'publication' },
    start: vi.fn<ApplicationLifecycle['start']>(async () => receipt), load: vi.fn<ApplicationLifecycle['load']>(async () => receipt) };
  return { lifecycle, receipt };
}
describe('independent native Screener language', () => {
  function screenerFixture(mutate?: (locales: LocaleDocument[], documents: NonNullable<ReturnType<typeof dereferenceBundleExport>['screenerHandles']>[number]['document'][]) => void, screenerCompletion?: SurfaceScreenerCompletionPolicy) {
    const candidate = JSON.parse(readFileSync(resolve('tests/fixtures/native-screener-locale-v2.1.bundle.json'), 'utf8')) as BundleExport;
    const resolved = dereferenceBundleExport(candidate);
    const test = fixture();
    const locales = [...structuredClone(resolved.localeDocuments ?? [])];
    const documents = resolved.screenerHandles!.map(handle => handle.document);
    mutate?.(locales, documents);
    test.host.bundle = resolved;
    (test.host as NativePackageSigningHost).getStartupRoute = (path: string) => ({ entryHref: '/eligibility', requiresHostState: false,
      ...(path === '/eligibility' ? { screenerDocuments: documents } : {}) });
    const selectLocale = vi.fn(async () => { throw new Error('saved Locale version mismatch'); });
    test.host.selectLocale = selectLocale;
    let snapshot = test.host.getSnapshot(); const listeners = new Set<() => void>();
    test.host.getSnapshot = () => snapshot;
    (test.host as NativePackageSigningHost).subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
    const composition = createTestComposition({ definition: testDefinition });
    composition.nativePackageRespondent = { load: async () => ({ host: test.host, composition,
      componentDocument: component, componentRouteResolver: componentResolver(component), localeDocuments: locales,
      moduleId: test.host.moduleId, initialLocale: 'en', screenerCompletion }) };
    window.history.replaceState(null, '', '/eligibility');
    const mounted = render(<NativePackageRuntime composition={composition} config={departmentAppProfile} />);
    return { test, locales, documents, selectLocale, mounted,
      advanceSession: () => { snapshot = { ...snapshot, sessionGeneration: snapshot.sessionGeneration + 1 }; listeners.forEach(listener => listener()); } };
  }

  it('passes host-required policy from boot and refuses a missing completion callback', async () => {
    const { mounted } = screenerFixture(undefined, { mode: 'host-required', selectionKey: 'selected-policy' });
    await screen.findByRole('button', { name: /continue|check/i });
    for (const field of mounted.container.querySelectorAll('select')) fireEvent.change(field, { target: { value: 'no' } });
    fireEvent.click(mounted.container.querySelector('.formspec-screener-continue')!);
    expect((await screen.findByRole('alert')).getAttribute('data-finding')).toBe('screener-completion-host-unavailable');
    expect(window.location.pathname).toBe('/eligibility');
    expect(mounted.container.querySelectorAll('select')).toHaveLength(8);
    mounted.unmount(); window.history.replaceState(null, '', '/');
  });

  it('awaits the public host callback and retries the same act with false answers intact', async () => {
    let finish!: (value: { status: 'refused'; reason: string; retry: 'same-act' }) => void;
    const calls: SurfaceScreenerCompletionRequest[] = [];
    const complete = vi.fn((request: SurfaceScreenerCompletionRequest) => {
      calls.push(request);
      return new Promise<{ status: 'refused'; reason: string; retry: 'same-act' }>(resolve => { finish = resolve; });
    });
    const { mounted } = screenerFixture(undefined, { mode: 'host-required', selectionKey: 'selected-policy', complete });
    await screen.findByRole('button', { name: /continue|check/i });
    for (const field of mounted.container.querySelectorAll('select')) fireEvent.change(field, { target: { value: 'no' } });
    const submit = mounted.container.querySelector<HTMLButtonElement>('.formspec-screener-continue')!;
    fireEvent.click(submit);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(submit.disabled).toBe(true);
    expect(window.location.pathname).toBe('/eligibility');
    expect(calls[0]?.selectionKey).toBe('selected-policy');
    expect(calls[0]?.target).toBe('surface:paper-help');
    expect(Object.values(calls[0]!.answers)).toEqual(Array(8).fill(false));
    await act(async () => { finish({ status: 'refused', reason: 'source-unavailable', retry: 'same-act' }); });
    expect((await screen.findByRole('alert')).getAttribute('data-finding')).toBe('source-unavailable');
    fireEvent.click(submit);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
    expect(calls[1]?.completionId).toBe(calls[0]?.completionId);
    expect(calls[1]?.answers).toEqual(calls[0]?.answers);
    mounted.unmount();
    expect(calls[1]?.signal.aborted).toBe(true);
    await act(async () => { finish({ status: 'refused', reason: 'retired', retry: 'same-act' }); }); window.history.replaceState(null, '', '/');
  });
  it('uses the real Surface act with coordinator retry semantics and unchanged false answers', async () => {
    const f = await hydrationFixture();
    const retain = vi.fn<ScreenerRetention['retain']>().mockRejectedValueOnce(new Error('ambiguous retention')).mockImplementation(async () => {
      const run = structuredClone(f.input.run);
      Object.assign(run, { acceptance: { checkedAt: run.acceptance!.checkedAt, qualification: { status: 'pending', reason: 'expired' } } });
      return run;
    });
    const coordinator = createNativeScreenerCoordinator({ selectionKey: 'selected-policy', retention: { retain, associate: vi.fn() },
      hydration: { hydrate: vi.fn() }, context: () => ({ identity: f.input.identity, signal: f.input.signal, assertCurrent: f.input.assertCurrent }) });
    const { mounted } = screenerFixture(undefined, coordinator.completionPolicy);
    await screen.findByRole('button', { name: /continue|check/i });
    for (const field of mounted.container.querySelectorAll('select')) fireEvent.change(field, { target: { value: 'no' } });
    const submit = mounted.container.querySelector<HTMLButtonElement>('.formspec-screener-continue')!;
    fireEvent.click(submit);
    await screen.findByRole('alert');
    fireEvent.click(submit);
    await vi.waitFor(() => expect(retain).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole('alert')).getAttribute('data-finding')).toBe('expired');
    expect(retain.mock.calls[1][0].completionId).toBe(retain.mock.calls[0][0].completionId);
    expect(Object.values(retain.mock.calls[1][0].answers)).toEqual(Array(8).fill(false));
    fireEvent.click(submit);
    await vi.waitFor(() => expect(retain).toHaveBeenCalledTimes(3));
    expect(retain.mock.calls[2][0].completionId).not.toBe(retain.mock.calls[1][0].completionId);
    expect(window.location.pathname).toBe('/eligibility');
    mounted.unmount(); coordinator.dispose(); window.history.replaceState(null, '', '/');
  });

  it('switches the exact 47-document candidate without a renewal controller or draft mutation', async () => {
    const { test, locales, documents, selectLocale, mounted, advanceSession } = screenerFixture((locales) => {
      const spanish = locales.find(locale => locale.target.kind === 'screener' && locale.locale === 'es-US')!;
      locales.push({ ...spanish, locale: 'fr', target: { kind: 'screener', url: 'urn:foreign:screener' } });
    });
    const spanish = locales.find(locale => locale.target.kind === 'screener' && locale.locale === 'es-US')!;
    const english = locales.find(locale => locale.target.kind === 'screener' && locale.locale === 'en')!;
    const firstKey = documents[0].items[0].key;
    await screen.findByText(english.strings[`${firstKey}.label`]);
    const spanishButton = screen.getByRole('button', { name: /español/i });
    expect(spanishButton.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: /français/i })).toBeNull();
    const fields = mounted.container.querySelectorAll('input, select, textarea');
    expect(fields.length).toBe(8);
    fireEvent.click(mounted.container.querySelector('.formspec-screener-continue')!);
    const answer = fields[0] as HTMLSelectElement;
    fireEvent.change(answer, { target: { value: 'no' } }); expect(answer.value).toBe('no');
    fireEvent.click(spanishButton);
    await screen.findByText(spanish.strings[`${firstKey}.label`]);
    expect(spanishButton.getAttribute('aria-pressed')).toBe('true'); expect(answer.value).toBe('no');
    const requiredKey = documents[0].items[1].key;
    expect(screen.getAllByText(spanish.strings[`${requiredKey}.requiredMessage`]).length).toBe(7);
    fireEvent.click(screen.getByRole('button', { name: /^English$/i }));
    await screen.findByText(english.strings[`${firstKey}.label`]); expect(answer.value).toBe('no');
    fireEvent.click(spanishButton); act(advanceSession);
    await screen.findByText(english.strings[`${firstKey}.label`]);
    expect(screen.getByRole('button', { name: /^English$/i }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(spanishButton);
    act(() => { window.history.replaceState(null, '', '/not-a-route'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByRole('button', { name: /español/i }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(spanishButton); // A retired route's detached control cannot select the new visit.
    act(() => { window.history.replaceState(null, '', '/eligibility'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await screen.findByText(english.strings[`${firstKey}.label`]);
    expect(screen.getByRole('button', { name: /^English$/i }).getAttribute('aria-pressed')).toBe('true');
    expect(test.host.getSnapshot().locale).toBe('en'); expect(test.host.getSnapshot().controller).toBeUndefined();
    expect(selectLocale).not.toHaveBeenCalled(); expect(test.configureRuntime).not.toHaveBeenCalled(); expect(test.host.widgetExecutor).not.toHaveBeenCalled();
    mounted.unmount(); window.history.replaceState(null, '', '/');
  });
  it.each(['duplicate', 'dialect', 'version'])('offers no Screener language when native admission refuses %s', async kind => {
    const { mounted } = screenerFixture(locales => {
      const selected = locales.find(locale => locale.target.kind === 'screener')!;
      if (kind === 'duplicate') locales.push(structuredClone(selected));
      if (kind === 'dialect') selected.$formspecLocale = '2.0';
      if (kind === 'version') selected.target.compatibleVersions = '>=99.0.0';
    });
    await screen.findByText('Before you apply', { selector: 'a' });
    expect(mounted.container.querySelectorAll('.respondent-toolbar .locale-button').length).toBe(0);
    mounted.unmount(); window.history.replaceState(null, '', '/');
  });
  it('offers only the common exact-target languages for a route with multiple Screeners', async () => {
    const { mounted } = screenerFixture((locales, documents) => {
      const second = { ...documents[0], url: 'urn:second:admitted-screener' }; documents.push(second);
      const english = locales.find(locale => locale.target.kind === 'screener' && locale.locale === 'en')!;
      locales.push({ ...english, target: { kind: 'screener', url: second.url } });
    });
    await screen.findByRole('button', { name: /^English$/i });
    expect(screen.queryByRole('button', { name: /español/i })).toBeNull();
    mounted.unmount(); window.history.replaceState(null, '', '/');
  });
});

describe('authored optional application lifecycle', () => {
  it.each([[true, true], [true, false], [false, true], [false, false]])('admits backend options early=%s saving=%s through native controls', async (early, saving) => {
    const { lifecycle } = lifecycleFixture(early, saving);
    const test = await actualFixture({ bundle: lifecycleBundle, component: lifecycleComponent, lifecycle });
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    await screen.findByRole('button', { name: saving ? 'Save progress' : 'Prepare signing copy' });
    expect(!!screen.queryByRole('button', { name: 'Start application' })).toBe(early);
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(lifecycle.start).not.toHaveBeenCalled(); expect(lifecycle.load).not.toHaveBeenCalled();
    await act(async () => { test.getEngine().setValue('fullName', ''); });
    expect(test.getEngine().getValidationReport({ profile: 'on-submit' }).results.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: saving ? 'Save progress' : 'Prepare signing copy' }));
    await vi.waitFor(() => expect(test.host.getSnapshot().checkpointState).toBe('saved'));
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.saveDraft.mock.calls[0][0].response.data.fullName).toBe('');
    expect(lifecycle.start).not.toHaveBeenCalled(); mounted.unmount(); test.host.dispose();
  });
  it.each(['missing', 'alias', 'publication'])('refuses unqualified lifecycle %s before native mounting', async change => {
    const { lifecycle } = lifecycleFixture();
    const test = await actualFixture({ bundle: lifecycleBundle, component: lifecycleComponent, lifecycle }); test.host.dispose();
    const policy = { ...test.policy, applicationReadiness: { ...test.policy.applicationReadiness! } };
    if (change === 'missing') policy.applicationReadiness.startedPath = 'missing';
    if (change === 'alias') policy.applicationReadiness.startedPath = 'ready';
    if (change === 'publication') policy.publication = { ...policy.publication, formVersionId: 'different-publication' };
    expect(() => createNativePackageSigningHost(policy)).toThrow(/native-application/);
    expect(test.saveDraft).not.toHaveBeenCalled(); expect(lifecycle.start).not.toHaveBeenCalled();
  });
  it('retries Start with the same saved draft and retains the case across edits and Locale changes', async () => {
    const { lifecycle, receipt } = lifecycleFixture(); lifecycle.start.mockRejectedValueOnce(new Error('lost case reply'));
    const test = await actualFixture({ bundle: lifecycleBundle, component: lifecycleComponent, lifecycle });
    const authenticate = test.props.composition.identityProvider.authenticate;
    let owner: ReturnType<typeof authenticate> | undefined;
    test.props.composition.identityProvider.authenticate = option => owner ??= authenticate(option);
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    await screen.findByRole('button', { name: 'Start application' });
    await act(async () => { test.getEngine().setValue('fullName', ''); });
    expect(test.getEngine().getValidationReport({ profile: 'on-submit' }).results.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start application' }));
    await vi.waitFor(() => expect(test.host.getSnapshot().controller?.phase).toBe('failed'));
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.host.getSnapshot().controller?.owned).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Start application' }));
    await vi.waitFor(() => expect(test.host.getSnapshot().application).toEqual(receipt));
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(lifecycle.start).toHaveBeenCalledTimes(2);
    expect(lifecycle.start.mock.calls[0][0]).toEqual(lifecycle.start.mock.calls[1][0]);
    await act(async () => { test.getEngine().setValue('fullName', 'Edited owner'); });
    expect(test.host.getSnapshot().application).toEqual(receipt);
    expect(test.host.getSnapshot().checkpointState).toBe('unsaved');
    await act(async () => { await test.host.selectLocale('es-US'); });
    expect(test.host.getSnapshot().application).toEqual(receipt);
    await act(async () => { await test.host.refreshApplication!(); });
    expect(lifecycle.load).toHaveBeenCalledOnce(); expect(lifecycle.start).toHaveBeenCalledTimes(2);
    mounted.unmount(); test.host.dispose();
  });
});

describe('maintained native package Surface host', () => {
  it.each([false, true])('renders a slot-selected sibling Component in an isolated native engine with different Definition=%s', async differentDefinition => {
    const test = fixture();
    const exported = structuredClone(bundle);
    const selectedDefinition = test.host.definition;
    const siblingDefinition = differentDefinition ? { ...selectedDefinition, url: 'urn:test:sibling-definition' } : selectedDefinition;
    if (differentDefinition) {
      exported.manifest.definitions = [...exported.manifest.definitions!, { url: siblingDefinition.url, version: siblingDefinition.version }];
      exported.documents = { ...exported.documents, [siblingDefinition.url]: siblingDefinition };
    }
    const surface = Object.values(exported.documents).find(document => document && typeof document === 'object' && '$formspecSurface' in document) as SurfaceDocument;
    surface.routes.push({ id: 'sibling', path: '/sibling', slots: [{ id: 'sibling-form', slotType: 'definition-form', binding: { definitionRef: siblingDefinition.url } }] });
    test.host.bundle = dereferenceBundleExport(exported);
    const siblingComponent: ComponentDocument = { ...component, url: 'urn:test:sibling-component', targetDefinition: { url: siblingDefinition.url },
      tree: { component: 'Stack', children: [{ component: 'Text', text: 'Sibling presentation' }] } };
    test.props.componentRouteResolver = componentResolver(siblingComponent);
    const load = vi.spyOn(test.props.composition.draftStore, 'load');
    const getDefinition = vi.spyOn(test.props.composition.definitionSource, 'getDefinition');
    render(<NativePackageRespondentHost {...test.props} location="/sibling" />);
    await screen.findByText('Sibling presentation');
    expect(observed.forms).toHaveLength(0); expect(test.configureRuntime).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled(); expect(getDefinition).not.toHaveBeenCalled();
    expect(test.props.componentRouteResolver).toHaveBeenCalledWith(expect.objectContaining({ route: 'sibling', slot: 'sibling-form',
      definition: { url: siblingDefinition.url, version: siblingDefinition.version } }));
  });

  it('shows an exact slot refusal without selecting the signing Component or touching Source', () => {
    const test = fixture();
    test.props.componentRouteResolver.mockReturnValue({ status: 'unavailable', reason: 'component-claim-not-unique', diagnostics: [] });
    const load = vi.spyOn(test.props.composition.draftStore, 'load');
    render(<NativePackageRespondentHost {...test.props} />);
    expect(screen.getByRole('alert').textContent).toContain('component-claim-not-unique');
    expect(observed.forms).toHaveLength(0); expect(test.configureRuntime).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
  });

  it('configures the first runtime with the already-admitted identity subject', async () => {
    const test = await actualFixture();
    const claim = { provider: 'https://idp.example.test', adapter: 'test-oidc', subjectRef: 'oidc:admitted',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const,
      assuranceLevel: 'L1' as const, privacyTier: 'pseudonymous' as const };
    const authenticate = vi.fn(async () => claim);
    test.props.composition.identityProvider = {
      discover: async () => [{ kind: 'oidc', issuer: claim.provider, displayName: 'Test identity', minAssurance: 'L1' }],
      authenticate, revoke: vi.fn(async () => {}),
      subscribe: listener => { listener(claim); return () => {}; },
    };
    const configure = vi.spyOn(test.host, 'configureRuntime');
    render(<NativePackageRespondentHost {...test.props} />);
    expect(await screen.findByRole('textbox', { name: 'Full legal name *' })).toBeTruthy();
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure.mock.calls[0][0].draftKey.subjectRef).toBe(claim.subjectRef);
    expect(authenticate).not.toHaveBeenCalled();
    expect(screen.queryByText('native-runtime-context-refused')).toBeNull();
  });
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
    const composition = createTestComposition({ definition: testDefinition }); composition.draftStore = cohort.draftStore;
    composition.nativePackageRespondent = { load: async () => ({ composition, host, componentDocument: component, componentRouteResolver: componentResolver(component), localeDocuments: test.policy.locales,
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
    const freshComposition = createTestComposition({ definition: testDefinition }); freshComposition.draftStore = cohort.draftStore;
    freshComposition.nativePackageRespondent = { load: async () => ({ composition: freshComposition, host: freshHost, componentDocument: component, componentRouteResolver: componentResolver(component),
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
  it.each(['non-slash', 'missing', 'parameter', 'collision', 'no-definition', 'embedded-required', 'embedded-definition', 'nested-embedded-definition', 'sibling-definition', 'missing-sibling-definition'] as const)('qualifies the authored %s entry through maintained route plans', async variant => {
    const test = await actualFixture(); test.host.dispose();
    const exported = structuredClone(test.policy.bundle);
    const surface = exported.documents[exported.manifest.entrySurface!] as SurfaceDocument;
    const entry = surface.routes.find(route => route.id === surface.entry)!;
    if (variant === 'non-slash') entry.path = '/start-here';
    if (variant === 'missing') surface.entry = 'missing';
    if (variant === 'parameter') entry.path = '/start/{subject}';
    if (variant === 'collision') surface.routes.push({ ...structuredClone(entry), id: 'duplicate' });
    if (variant === 'no-definition') entry.slots = [{ id: 'static-entry', slotType: 'static-content', binding: { content: [] } }];
    if (variant === 'sibling-definition' || variant === 'missing-sibling-definition') {
      const sibling = { ...test.policy.definition, url: 'urn:test:eligibility' };
      if (variant === 'sibling-definition') {
        exported.manifest.definitions = [...exported.manifest.definitions!, { url: sibling.url, version: sibling.version }];
        exported.documents = { ...exported.documents, [sibling.url]: sibling };
      }
      entry.slots = [{ id: 'eligibility', slotType: 'definition-form', binding: { definitionRef: sibling.url } }];
    }
    if (variant === 'embedded-required') {
      const ceremony = surface.routes.find(route => route.path === '/review-sign')!;
      surface.routes.push({ id: 'wrapper', path: '/embedded-review', slots: [{ id: 'embedded', slotType: 'embed-route', binding: { routeRef: ceremony.id } }] });
    }
    if (variant === 'embedded-definition' || variant === 'nested-embedded-definition') {
      surface.routes.push({ id: 'entry-wrapper', path: '/embedded-entry', slots: [{ id: 'embedded-form', slotType: 'embed-route', binding: { routeRef: entry.id } }] });
      surface.entry = 'entry-wrapper';
      if (variant === 'nested-embedded-definition') {
        surface.routes.push({ id: 'nested-entry', path: '/nested-entry', slots: [{ id: 'nested-form', slotType: 'embed-route', binding: { routeRef: 'entry-wrapper' } }] });
        surface.entry = 'nested-entry';
      }
      expect(() => createNativePackageSigningHost({ ...test.policy, bundle: exported })).toThrow('native-embedded-form-unsupported');
      expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
      return;
    }
    const host = createNativePackageSigningHost({ ...test.policy, bundle: exported });
    if (variant === 'non-slash') {
      expect(host.getStartupRoute('/review-sign')).toMatchObject({ entryHref: '/start-here', requiresHostState: true });
      expect(host.getStartupRoute('/start-here')).toMatchObject({ entryHref: '/start-here', requiresHostState: false });
    } else if (variant === 'sibling-definition') {
      expect(host.getStartupRoute('/')).toMatchObject({ entryHref: '/', requiresHostState: false });
      const sibling = host.bundle.definitions.get('urn:test:eligibility')!;
      const engine = createFormEngine(sibling);
      try {
        await expect(host.configureRuntime({ engine, definition: sibling,
          draftKey: { formUrl: sibling.url, formVersion: sibling.version }, claim: null, activeLocale: 'en' }))
          .rejects.toThrow('native-runtime-context-refused');
      } finally { engine.dispose(); }
      expect(host.getSnapshot().controller).toBeUndefined();
      expect(test.saveDraft).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled();
    } else if (variant === 'embedded-required') expect(host.getStartupRoute('/embedded-review')).toMatchObject({ entryHref: '/', requiresHostState: true });
    else expect(() => host.getStartupRoute('/review-sign')).toThrow('native-entry-route-unavailable');
    host.dispose();
  });
  it.each(['renamed', 'collision', 'parameter', 'wrong-slot', 'wrong-output', 'wrong-surface'] as const)('derives signed-review navigation from the admitted %s Submit route', async variant => {
    const test = await actualFixture(); test.host.dispose();
    const policy = { ...test.policy, bundle: structuredClone(test.policy.bundle),
      controller: { ...test.policy.controller, roles: structuredClone(test.policy.controller.roles) } };
    const surface = policy.bundle.documents[policy.bundle.manifest.entrySurface!] as SurfaceDocument;
    const review = surface.routes.find(route => route.path === '/review-sign')!;
    if (variant === 'renamed') review.path = '/check-signed-response';
    if (variant === 'collision') surface.routes.push({ ...structuredClone(review), id: 'duplicate-review' });
    if (variant === 'parameter') review.path = '/review/{unknown}';
    if (variant === 'wrong-slot') policy.controller.roles.submit!.widgetSource!.slotId = 'missing';
    if (variant === 'wrong-output') policy.controller.roles.submit!.widgetSource!.outputName = 'missing';
    if (variant === 'wrong-surface') policy.controller.roles.submit!.widgetSource!.route.surfaceRef = 'missing';
    const host = createNativePackageSigningHost(policy);
    expect(host.getStartupRoute('/').signedReviewHref).toBe(variant === 'renamed' ? '/check-signed-response' : undefined);
    if (variant === 'renamed') expect(host.getStartupRoute('/check-signed-response').signedReviewHref).toBeUndefined();
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
    const composition = createTestComposition({ definition: testDefinition }); composition.draftStore = cohort.draftStore;
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
  it.each(['legacy', 'early', 'after-submit'] as const)('runs %s Save, Prepare, Sign, fresh signed recovery and exact Submit through maintained controls', async mode => {
    const application = mode === 'legacy' ? undefined : lifecycleFixture(mode === 'early');
    const selectedComponent = application ? lifecycleComponent : component;
    const { host, props, policy, saveDraft, prepare, navigate, terminals, getEngine, read, reports, photoBytes, completeRead, sign, submit } = await actualFixture(application ? { bundle: lifecycleBundle, component: selectedComponent, lifecycle: application.lifecycle } : undefined);
    const claim = { provider: 'https://idp.example.test', adapter: 'test-oidc', subjectRef: 'server-actor',
      credentialType: 'oidc-token' as const, subjectBinding: 'respondent' as const, assuranceLevel: 'L1' as const };
    props.composition.identityProvider = { discover: async () => [{ kind: 'oidc', issuer: claim.provider, displayName: 'Test identity', minAssurance: 'L1' }],
      authenticate: vi.fn(async () => claim), revoke: vi.fn(async () => {}), subscribe: listener => { listener(claim); return () => {}; } };
    const mounted = render(<NativePackageRespondentHost {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: application ? 'Save progress' : 'Save draft' }));
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
    mounted.unmount(); host.dispose();
    const freshHost = createNativePackageSigningHost(policy);
    props.composition.draftStore.readState = vi.fn(async () => ({ kind: 'active' as const, response: signed.response, signed, ...(application ? { application: application.receipt } : {}) }));
    props.composition.nativePackageRespondent = { load: async () => ({ composition: props.composition, host: freshHost,
      componentDocument: selectedComponent, componentRouteResolver: componentResolver(selectedComponent), localeDocuments: policy.locales, moduleId: freshHost.moduleId, initialLocale: 'en' }) };
    window.history.replaceState(null, '', '/?form=form&package=%2Fpackage.json');
    const restored = render(<NativePackageRuntime composition={props.composition} config={props.config} />);
    await screen.findByRole('textbox', { name: 'Full legal name *' });
    await vi.waitFor(() => expect(freshHost.getSnapshot().controller?.phase).toBe('signed'));
    await vi.waitFor(() => expect(freshHost.getSnapshot().runtime).toBeDefined());
    expect(freshHost.getSnapshot().controller!.signed!.response).toEqual(signed.response);
    if (application) expect(freshHost.getSnapshot().application).toEqual(application.receipt);
    expect(saveDraft).toHaveBeenCalledOnce(); expect(prepare).toHaveBeenCalledOnce(); expect(sign).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare saved response' }));
    await vi.waitFor(() => expect(freshHost.getSnapshot().controller?.phase).toBe('refused'));
    expect(prepare).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByRole('button', { name: 'Review signed response' }));
    expect(window.location.pathname).toBe('/review-sign');
    expect(window.location.search).toBe('?form=form&package=%2Fpackage.json');
    expect(screen.queryByRole('button', { name: 'Review signed response' })).toBeNull();
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect((screen.getByRole('button', { name: 'Submit demo response' }) as HTMLButtonElement).disabled).toBe(true);
    completeRead(new Blob([photoBytes], { type: 'image/png' }));
    fireEvent.load(await screen.findByRole('img', { name: /saved photo/i }));
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Submit demo response' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Submit demo response' }));
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(submit.mock.calls[0][0].extensions!['x-formspec-response']).toEqual(signed.response);
    expect(freshHost.getSnapshot().controller!.signed!.response).toEqual(signed.response);
    expect(saveDraft).toHaveBeenCalledOnce(); expect(prepare).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/review-sign'); restored.unmount(); freshHost.dispose();
    if (application) {
      const createEngine = vi.fn(createFormEngine);
      const terminalHost = createNativePackageSigningHost({ ...policy, createEngine });
      const submittedCase = { ...application.receipt, status: 'submitted' as const };
      await terminalHost.configureSubmittedRuntime({ definition: policy.definition, draftKey: signed.draftKey, claim,
        state: { kind: 'submitted', response: signed.response, draft: { id: signed.draft.id, version: signed.draft.version + 1 },
          subjectRef: claim.subjectRef, formVersionId: 'publication', application: submittedCase } });
      application.lifecycle.load.mockResolvedValue(submittedCase);
      props.composition.nativePackageRespondent = { load: async () => ({ composition: props.composition, host: terminalHost,
        componentDocument: selectedComponent, componentRouteResolver: componentResolver(selectedComponent), localeDocuments: policy.locales, moduleId: terminalHost.moduleId, initialLocale: 'en' }) };
      const terminal = render(<NativePackageRuntime composition={props.composition} config={props.config} />);
      await screen.findByText('Application submitted: APP-001');
      expect(terminalHost.getSnapshot().controller).toBeUndefined(); expect(createEngine).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Refresh application status' }));
      await vi.waitFor(() => expect(application.lifecycle.load).toHaveBeenCalledOnce());
      expect(application.lifecycle.start).not.toHaveBeenCalled(); expect(submit).toHaveBeenCalledOnce();
      expect(saveDraft).toHaveBeenCalledOnce(); expect(prepare).toHaveBeenCalledOnce(); expect(sign).toHaveBeenCalledOnce();
      terminal.unmount(); terminalHost.dispose();
    }
  }, 15000);
  it('forwards host selection to real navigation anchors while preserving bare callbacks', () => {
    const test = fixture();
    const signRoute = test.host.bundle.surfaces.flatMap(surface => surface.routes).find(route => route.path === '/review-sign')!;
    signRoute.navigation = { ...signRoute.navigation, visible: true };
    const resolveNavigationHref = vi.fn((href: string) => `${href}?form=neutral&package=%2Fneutral.json`);
    const mounted = render(<NativePackageRespondentHost {...test.props} resolveNavigationHref={resolveNavigationHref} />);
    const anchor = mounted.container.querySelector<HTMLAnchorElement>('nav a[href^="/review-sign"]')!;
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute('href')).toBe('/review-sign?form=neutral&package=%2Fneutral.json');
    expect(test.props.onNavigate).not.toHaveBeenCalled();
    fireEvent.click(anchor);
    expect(test.props.onNavigate).toHaveBeenCalledExactlyOnceWith('/review-sign');
    mounted.rerender(<NativePackageRespondentHost {...test.props} resolveNavigationHref={href => `${href}?form=successor`} />);
    expect(anchor.getAttribute('href')).toBe('/review-sign?form=successor');
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
  it('renders a neutral authored Prepare guard independently from the ordinary Save guard', async () => {
    const resolved = dereferenceBundleExport(bundle); const definition = structuredClone([...resolved.definitions.values()][0]);
    Object.assign(definition.instances!.draftReadiness.data!, { prepareReady: false });
    const selectedComponent = structuredClone(component);
    const guardPrepare = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const value = node as Record<string, unknown>;
      if (value.actionRef === 'prepare') value.when = "@instance('draftReadiness').ready and @instance('draftReadiness').owned and @instance('draftReadiness').prepareReady";
      Object.values(value).forEach(child => { if (Array.isArray(child)) child.forEach(guardPrepare); else guardPrepare(child); });
    };
    guardPrepare(selectedComponent);
    const engine = createFormEngine(definition, { registryEntries: [...flattenRegistryEntries(resolved.registries).entries] });
    for (const document of Object.values(bundle.documents)) if (document && typeof document === 'object' && '$formspecLocale' in document) engine.loadLocale(document as LocaleDocument);
    engine.setLocale('en'); engine.setInstanceValue('draftReadiness', 'ready', true); engine.setInstanceValue('draftReadiness', 'owned', true);
    render(<FormspecForm engine={engine} componentDocument={selectedComponent} responseActionsDocument={resolved.responseActions[0]} />);
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDefined(); expect(screen.queryByRole('button', { name: 'Prepare saved response' })).toBeNull();
    await act(async () => engine.setInstanceValue('draftReadiness', 'prepareReady', true));
    expect(screen.getByRole('button', { name: 'Prepare saved response' })).toBeDefined();
    await act(async () => engine.setInstanceValue('draftReadiness', 'prepareReady', false));
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDefined(); expect(screen.queryByRole('button', { name: 'Prepare saved response' })).toBeNull();
    cleanup(); engine.dispose();
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


describe('Runtime ownership of mounted native engine exchange', () => {
  it.each(['commit', 'abort', 'rollback', 'unmount', 'async-guard', 'async-adopt', 'async-layout', 'reload'] as const)('settles %s after adoption without exposing a disposed engine', async outcome => {
    const test = await actualFixture(); const mounted = render(<NativePackageRespondentHost {...test.props} />);
    await screen.findByRole('button', { name: 'Save draft' });
    const input = test.getRuntimeInput(); const old = input.engine; const oldDispose = vi.spyOn(old, 'dispose');
    const stage = new AbortController();
    const result = await replaceNativeFormEngine({ currentEngine: old,
      engineOptions: { instanceSourceResolver: () => ({ status: 'unavailable' }) },
      localeDocuments: test.props.localeDocuments, signal: stage.signal, assertCurrent() {} });
    if (result.status !== 'replaced') throw new Error(result.reason);
    result.engine.setValue('fullName', 'Replacement name');
    const newDispose = vi.spyOn(result.engine, 'dispose'); let rejectAtCommit = false; let guardCalls = 0;
    let exchange!: Promise<void>;
    await act(async () => {
      exchange = input.exchangeEngine!({ expected: old, engine: result.engine, signal: stage.signal,
        adopt: () => { if (outcome === 'async-adopt') return Promise.reject(new Error('async adoption')); result.adopt(); if (outcome === 'async-layout') rejectAtCommit = true; if (outcome === 'abort') stage.abort(new Error('retired before React commit')); if (outcome === 'rollback') rejectAtCommit = true; },
        assertCurrent: () => { guardCalls++; if (outcome === 'async-guard' || (outcome === 'async-layout' && rejectAtCommit)) return Promise.reject(new Error('async guard')); if (rejectAtCommit) throw new Error('retired at React commit'); } });
      void exchange.catch(() => {});
      // Adoption has happened; React has not committed. Both engines must still be live.
      expect(oldDispose).not.toHaveBeenCalled(); expect(newDispose).not.toHaveBeenCalled();
      if (outcome === 'unmount') mounted.unmount();
      if (outcome === 'reload') mounted.rerender(<NativePackageRespondentHost {...test.props} composition={{ ...test.props.composition }} />);
    });
    if (outcome === 'commit') {
      await exchange; expect(oldDispose).toHaveBeenCalledOnce(); expect(newDispose).not.toHaveBeenCalled();
      expect((screen.getByRole('textbox', { name: /full.*name/i }) as HTMLInputElement).value).toBe('Replacement name');
      stage.abort(); result.dispose(); expect(newDispose).not.toHaveBeenCalled();
      mounted.unmount(); expect(newDispose).toHaveBeenCalledOnce();
    } else if (outcome === 'reload') {
      // React commits the queued Provider before passive bootstrap reload cleanup.
      await exchange; expect(guardCalls).toBe(2);
      await vi.waitFor(() => expect(test.getRuntimeInput().engine).not.toBe(old));
      expect(test.getRuntimeInput().engine).not.toBe(result.engine);
      expect(oldDispose).toHaveBeenCalledOnce(); expect(newDispose).toHaveBeenCalledOnce();
      await screen.findByRole('button', { name: 'Save draft' });
      mounted.unmount(); expect(oldDispose).toHaveBeenCalledOnce(); expect(newDispose).toHaveBeenCalledOnce();
    } else {
      await expect(exchange).rejects.toThrow(); if (outcome === 'async-guard' || outcome === 'async-adopt') result.engine.dispose(); expect(newDispose).toHaveBeenCalledOnce();
      if (outcome !== 'unmount') {
        expect(oldDispose).not.toHaveBeenCalled();
        expect((screen.getByRole('textbox', { name: /full.*name/i }) as HTMLInputElement).value).not.toBe('Replacement name');
        mounted.unmount();
      }
      expect(oldDispose).toHaveBeenCalledOnce();
    }
    test.host.dispose();
  });
  it('refuses a stale expected engine before adoption and commits successive replacements once', async () => {
    const test = await actualFixture(); const mounted = render(<NativePackageRespondentHost {...test.props} />);
    await screen.findByRole('button', { name: 'Save draft' });
    const exchange = test.getRuntimeInput().exchangeEngine!;
    let current = test.getRuntimeInput().engine;
    const initialDispose = vi.spyOn(current, 'dispose');
    const make = async () => {
      const result = await replaceNativeFormEngine({ currentEngine: current,
        engineOptions: { instanceSourceResolver: () => ({ status: 'unavailable' }) },
        localeDocuments: test.props.localeDocuments, signal: new AbortController().signal, assertCurrent() {} });
      if (result.status !== 'replaced') throw new Error(result.reason);
      return result;
    };
    const stale = await make(); const adopted = vi.fn(stale.adopt); const staleDispose = vi.spyOn(stale.engine, 'dispose');
    await expect(exchange({ expected: stale.engine, engine: stale.engine, adopt: adopted,
      signal: new AbortController().signal, assertCurrent() {} })).rejects.toThrow('retired');
    expect(adopted).not.toHaveBeenCalled(); expect(initialDispose).not.toHaveBeenCalled();
    stale.dispose(); expect(staleDispose).toHaveBeenCalledOnce();
    const disposals = [initialDispose];
    for (const name of ['First replacement', 'Second replacement']) {
      const result = await make(); result.engine.setValue('fullName', name);
      const disposed = vi.spyOn(result.engine, 'dispose'); let settled!: Promise<void>;
      await act(async () => { settled = exchange({ expected: current, engine: result.engine,
        adopt: result.adopt, signal: new AbortController().signal, assertCurrent() {} }); });
      await settled;
      expect(disposals.at(-1)).toHaveBeenCalledOnce(); expect(disposed).not.toHaveBeenCalled();
      expect((screen.getByRole('textbox', { name: /full.*name/i }) as HTMLInputElement).value).toBe(name);
      disposals.push(disposed); current = result.engine;
    }
    mounted.unmount(); for (const disposed of disposals) expect(disposed).toHaveBeenCalledOnce();
    test.host.dispose();
  });

});


async function nativeFactsFixture(options: { eligible?: boolean; unavailable?: boolean; associationFailure?: boolean; signedPending?: boolean; http?: boolean; refuseSigned?: boolean } = {}) {
  const exported = structuredClone(bundle); const f = await hydrationFixture();
  const def = Object.values(exported.documents).find(document => document && typeof document === 'object' && '$formspec' in document) as FormDefinition;
  def.instances = { ...def.instances, facts: { source: 'screening', readonly: true }, ...(options.unavailable ? { other: { source: 'other', readonly: true } } : {}) };
  def.items.push({ type: 'field', key: 'nativeEligible', dataType: 'boolean', label: 'Source eligibility', initialValue: false });
  def.binds!.push({ path: 'nativeEligible', calculate: "if @instance('facts').eligible = true then true else false" });
  const authoredComponent = structuredClone(component);
  if (!('children' in authoredComponent.tree) || !authoredComponent.tree.children) throw new Error('Fixture Stack required');
  authoredComponent.tree.children.push({ component: 'Toggle', bind: 'nativeEligible' });
  const source = JSON.parse(readFileSync(resolve('tests/fixtures/native-screener-locale-v2.1.bundle.json'), 'utf8')) as BundleExport;
  const screenDoc = structuredClone(source.documents['urn:formspec:demo:d1:passport-eligibility']) as ScreenerDocument;
  const replaceTargets = (value: unknown): void => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (key === 'target') Object.assign(value, { [key]: 'surface:intake' }); else replaceTargets(child); } };
  replaceTargets(screenDoc);
  exported.documents = { ...exported.documents, [screenDoc.url!]: screenDoc }; exported.manifest.screeners = [{ url: screenDoc.url!, version: screenDoc.version }];
  const surface = Object.values(exported.documents).find(document => document && typeof document === 'object' && '$formspecSurface' in document) as SurfaceDocument;
  surface.$formspecSurface = '0.3';
  surface.routes.unshift({ id: 'eligibility', path: '/eligibility', routeClass: 'intake', title: 'Before you apply',
    slots: [{ id: 'screen', slotType: 'screener', binding: { screenerRef: screenDoc.url!, allowedTargets: ['surface:intake'] } }] });
  surface.entry = 'eligibility';
  let attachmentReferences: unknown[] = [];
  const http = options.http ? await nativeFactsProductHttpFixture({ definition: def, screener: screenDoc, unavailable: options.unavailable,
    refuseSigned: options.refuseSigned, attachmentReferences: () => attachmentReferences }) : undefined;
  const retained = vi.fn<ScreenerRetention['retain']>(async request => http ? http.retention.retain(request) : ({ ...f.input.run,
    run: { ...f.input.run.run, qualification: { status: 'ready', target: request.target } }, acceptance: { checkedAt: f.view.qualifiedAt, qualification: { status: 'ready', target: request.target } } }));
  const associate = vi.fn<ScreenerRetention['associate']>(async request => {
    if (http) return http.retention.associate(request);
    if (options.associationFailure) throw new Error('association ambiguous');
    return { ...f.input.association, draftId: request.saved.draft.id, draftVersion: request.saved.draft.version, candidateHash: await computeJcsSha256Digest(request.saved.response) };
  });
  const candidates: SavedResponseDraft[] = [];
  const hydrate = vi.fn<NonNullable<NativePackageSigningHostPolicy['nativeScreener']>['hydration']['hydrate']>(async request => {
    candidates.push(structuredClone(request.saved));
    if (http) return http.hydration.hydrate(request);
    if (options.signedPending && request.saved.response.authoredSignatures?.length) throw new Error('signed facts Pending');
    const view = { ...structuredClone(f.view), draftId: request.saved.draft.id, draftVersion: request.saved.draft.version,
      candidateHash: await computeJcsSha256Digest(request.saved.response), sources: { facts: 'screening', ...(options.unavailable ? { other: 'other' } : {}) },
      selection: { ...f.view.selection, definitionUrl: def.url!, definitionVersion: def.version },
      results: [{ ...f.view.results[0], data: { eligible: options.eligible ?? false } }, ...(options.unavailable ? [{ status: 'unavailable' as const, instanceName: 'other', sourceRef: 'other', reason: 'not-qualified' }] : [])] };
    return { view, ...(request.nativeCurrentCheck ? { nativeCurrentCheck: request.nativeCurrentCheck } : {}), assertCurrent: request.assertCurrent, assertReady: () => { request.assertCurrent(); if (options.unavailable) throw new Error('selected source unavailable'); } };
  });
  const engines: ReturnType<typeof createFormEngine>[] = [];
  const test = await actualFixture({ bundle: exported, component: authoredComponent,
    onSaved: (response, revision) => { attachmentReferences = response.data.photo ? [structuredClone(response.data.photo)] : [];
      if (response.authoredSignatures?.length) http?.markSigned(revision); },
    screenerEntryGate: { protectedTargets: ['surface:intake'] },
    nativeScreener: { selectionKey: 'native', retention: { retain: retained, associate }, hydration: { hydrate }, context: () => f.input },
    createEngine: (definition, options) => { const engine = createFormEngine(definition, options); engines.push(engine); return engine; } });
  return { ...test, retained, associate, hydrate, candidates, engines, options, http };
}

async function completeNativeScreener(test: Awaited<ReturnType<typeof nativeFactsFixture>>, mounted: ReturnType<typeof render>) {
  mounted.rerender(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
  await screen.findByRole('button', { name: /continue|check/i });
  for (const field of mounted.container.querySelectorAll('select')) fireEvent.change(field, { target: { value: 'yes' } });
  fireEvent.click(mounted.container.querySelector('.formspec-screener-continue')!);
  await vi.waitFor(() => expect(test.retained).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(test.navigate).toHaveBeenCalled());
  mounted.rerender(<NativePackageRespondentHost {...test.props} location="/" />);
  await screen.findByRole('button', { name: 'Save draft' });
}

describe('actual native facts product caller', () => {
  it.each(['false', 'changed', 'unavailable', 'association-failure'] as const)('mounts maintained Runtime and preserves Save with %s source results', async mode => {
    const fetch = vi.fn(async () => { throw new Error('default source fetch forbidden'); }); vi.stubGlobal('fetch', fetch);
    const test = await nativeFactsFixture({ eligible: mode === 'changed', unavailable: mode === 'unavailable', associationFailure: mode === 'association-failure' });
    const mounted = render(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
    await completeNativeScreener(test, mounted);
    const old = test.getEngine(); const oldDispose = vi.spyOn(old, 'dispose');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.terminals.at(-1)?.status).toBe('completed'));
    expect(test.host.getSnapshot().controller).toMatchObject({ phase: 'saved', owned: true });
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.associate).toHaveBeenCalledOnce();
    if (mode === 'association-failure') {
      expect(test.host.getSnapshot().nativeReadiness).toBe('pending'); expect(oldDispose).not.toHaveBeenCalled();
    } else {
      expect(oldDispose).toHaveBeenCalledOnce();
      const replacement = test.engines[0]; expect(replacement.signals.nativeEligible.value).toBe(mode === 'changed');
      expect((screen.getByRole('switch', { name: /source eligibility/i }) as HTMLInputElement).checked).toBe(mode === 'changed');
      expect(test.candidates[0]).toEqual(test.host.getSnapshot().controller!.saved);
      if (mode === 'changed') {
        expect(test.host.getSnapshot().nativeReadiness).toBe('needs-save');
        expect(screen.getByText('Save progress to refresh checks.')).toBeDefined();
        fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
        await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
        expect(test.host.getSnapshot().controller!.saved!.response.data.nativeEligible).toBe(true);
      } else expect(test.host.getSnapshot().nativeReadiness).toBe(mode === 'unavailable' ? 'pending' : 'ready');
    }
    expect(fetch).not.toHaveBeenCalled(); mounted.unmount(); test.host.dispose();
  });
  it('qualifies a returning form after its new renderer attaches', async () => {
    const test = await nativeFactsFixture();
    const mounted = render(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
    await completeNativeScreener(test, mounted);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
    const before = test.candidates.length;
    const saved = test.host.getSnapshot().controller!.saved!;
    const originalRenderer = test.getEngine();
    mounted.rerender(<NativePackageRespondentHost {...test.props} location="/review-sign" />);
    await vi.waitFor(() => expect(test.candidates.length).toBeGreaterThan(before));
    mounted.rerender(<NativePackageRespondentHost {...test.props} location="/" />);
    await screen.findByRole('button', { name: 'Save draft' });
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
    expect(test.candidates.at(-1)!.draft).toEqual(saved.draft);
    expect(test.candidates.at(-1)!.response).toEqual(saved.response);
    expect(test.retained).toHaveBeenCalledOnce(); expect(test.saveDraft).toHaveBeenCalledOnce();
    expect(test.engines.at(-1)).not.toBe(originalRenderer);
    expect(test.engines.at(-1)!.getInstanceData('facts')).toEqual({ eligible: false });
    expect((screen.getByRole('switch', { name: /source eligibility/i }) as HTMLInputElement).checked).toBe(false);
    mounted.unmount(); test.host.dispose();
  });

  it('ignores an older qualification failure after the replacement qualification is Ready', async () => {
    const test = await nativeFactsFixture();
    const mounted = render(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
    await completeNativeScreener(test, mounted);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
    const hydrationCount = test.hydrate.mock.calls.length;
    let reject!: (error: Error) => void;
    test.hydrate.mockImplementationOnce(() => new Promise((_resolve, failure) => { reject = failure; }));
    const older = test.host.qualifyCurrentVisit!();
    await vi.waitFor(() => expect(reject).toBeDefined());
    let latest!: Promise<void>;
    await act(async () => { latest = test.host.qualifyCurrentVisit!(); });
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
    await latest;
    expect(test.hydrate).toHaveBeenCalledTimes(hydrationCount + 2);
    expect(test.saveDraft).toHaveBeenCalledOnce();
    reject(new Error('old transport failed')); await older;
    expect(test.host.getSnapshot().nativeReadiness).toBe('ready');
    mounted.unmount(); test.host.dispose();
  });

  it('keeps Save committed and Prepare unavailable when a selected HTTP source remains unavailable', async () => {
    const test = await nativeFactsFixture({ http: true, unavailable: true });
    const mounted = render(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
    await completeNativeScreener(test, mounted);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.terminals.at(-1)?.status).toBe('completed'));
    expect(test.host.getSnapshot().controller?.phase).toBe('saved');
    expect(test.host.getSnapshot().nativeReadiness).toBe('pending');
    fireEvent.click(screen.getByRole('button', { name: 'Prepare saved response' }));
    await vi.waitFor(() => expect(test.invokerFailures).toHaveLength(1));
    expect((test.invokerFailures[0] as Error).message).toBe('native-facts-pending-save-required');
    expect(test.host.getSnapshot().controller?.phase).toBe('saved');
    expect(test.prepare).not.toHaveBeenCalled(); expect(test.sign).not.toHaveBeenCalled(); expect(test.submit).not.toHaveBeenCalled();
    expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.http!.requests.some(request => request.url.endsWith('/evaluation-instances'))).toBe(true);
    mounted.unmount(); test.host.dispose();
  });

  it.each(['draft-id', 'draft-version', 'settled-data'] as const)('refuses fresh commitment qualification with mismatched %s', async mismatch => {
    const test = await nativeFactsFixture();
    const mounted = render(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
    await completeNativeScreener(test, mounted);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
    const original = test.hydrate.getMockImplementation()!;
    test.hydrate.mockImplementationOnce(async request => {
      const facts = await original(request);
      if (mismatch === 'draft-id') Object.assign(facts.view, { draftId: 'different-draft' });
      if (mismatch === 'draft-version') Object.assign(facts.view, { draftVersion: facts.view.draftVersion + 1 });
      if (mismatch === 'settled-data' && facts.view.results[0].status === 'qualified') Object.assign(facts.view.results[0], { data: { eligible: true } });
      return facts;
    });
    const candidate = test.host.getSnapshot().controller!.saved!;
    await expect(test.host.preSignCandidate!({ saved: candidate, operationId: 'gate-act', assertCurrent() {} })).rejects.toThrow();
    expect(test.sign).not.toHaveBeenCalled(); expect(test.submit).not.toHaveBeenCalled();
    expect(test.saveDraft).toHaveBeenCalledOnce();
    expect(test.host.getSnapshot().controller!.saved).toEqual(candidate);
    mounted.unmount(); test.host.dispose();
  });

  it.each(['normal', 'committed-lost-reply', 'uncommitted-retry', 'retired-visit', 'http-legacy', 'http-refused', 'current-recovery'] as const)('qualifies exact prepared review and commitment with %s signing outcome', async mode => {
    const test = await nativeFactsFixture({ signedPending: !mode.startsWith('http-'), http: mode.startsWith('http-'), refuseSigned: mode === 'http-refused' });
    const visitSpy = vi.spyOn(test.host, 'createSurfaceVisit');
    const originalSign = test.sign.getMockImplementation()!;
    let committed: Awaited<ReturnType<typeof originalSign>> | undefined;
    if (mode === 'committed-lost-reply' || mode === 'retired-visit') test.sign.mockImplementation(async input => {
      if (committed) return committed;
      committed = await originalSign(input);
      throw new Error('committed reply lost');
    });
    if (mode === 'uncommitted-retry') {
      const gate = test.host.preSignCandidate!;
      vi.spyOn(test.host, 'preSignCandidate').mockImplementationOnce(async input => {
        await gate(input); throw new Error('transport interrupted before signing');
      });
    }
    const mounted = render(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
    await completeNativeScreener(test, mounted);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare saved response' }));
    await vi.waitFor(() => expect(test.terminals.at(-1)?.status).toBe('completed'));
    await vi.waitFor(() => expect(test.host.getSnapshot().controller?.prepared).toBeDefined());
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
    const prepared = test.host.getSnapshot().controller!.prepared!;
    const preparedContext = test.candidates.at(-1)!;
    expect(preparedContext.draft).toEqual(prepared.draft); expect(preparedContext.response).toEqual(prepared.response);
    expect(test.engines.at(-1)!.getResponse({ profile: 'off' }).data).toEqual(prepared.response.data);
    const issued = await test.retained.mock.results[0].value;
    expect(test.engines.at(-1)!.getInstanceData('facts')).toEqual(test.http ? { eligible: false, evidenceRef: issued.run.evidenceRef } : { eligible: false });
    mounted.rerender(<NativePackageRespondentHost {...test.props} location="/review-sign" />);
    await vi.waitFor(() => expect(test.read).toHaveBeenCalledOnce());
    expect(test.candidates.at(-1)!.draft).toEqual(prepared.draft);
    test.completeRead(new Blob([test.photoBytes], { type: 'image/png' }));
    fireEvent.load(await screen.findByRole('img', { name: /saved photo/i }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your name for this demonstration' }), { target: { value: 'Native signer' } });
    fireEvent.scroll(screen.getByRole('region', { name: 'Review and sign this demo response' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I have read the complete sample text.' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I consent to electronic signing for this demo response.' }));
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Sign demo response' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Sign demo response' }));
    if (['committed-lost-reply', 'uncommitted-retry', 'retired-visit'].includes(mode)) {
      await vi.waitFor(() => expect(test.host.getSnapshot().controller?.phase).toBe('failed'));
      const retry = await screen.findByRole('button', { name: 'Check previous signing result' });
      if (mode === 'retired-visit') {
        const previous = visitSpy.mock.results.at(-1)!.value.bindRuntime();
        mounted.rerender(<NativePackageRespondentHost {...test.props} location="/" />);
        expect(test.host.getSnapshot().controller?.retrySignAvailable).toBeUndefined();
        await expect(previous.retrySigningResult!()).rejects.toThrow('retired');
        expect(test.sign).toHaveBeenCalledOnce();
        mounted.unmount(); test.host.dispose(); return;
      }
      expect(retry.tabIndex).toBe(0);
      retry.focus(); expect(document.activeElement).toBe(retry);
      fireEvent.click(retry); fireEvent.click(retry);
    }
    await vi.waitFor(() => expect(test.host.getSnapshot().controller?.phase).toBe('signed'));
    await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('pending'));
    expect(test.signWrites).toHaveBeenCalledOnce();
    expect(test.sign).toHaveBeenCalledTimes(['normal', 'http-legacy', 'http-refused', 'current-recovery'].includes(mode) ? 1 : 2); expect(test.submit).not.toHaveBeenCalled();
    if (['committed-lost-reply', 'uncommitted-retry'].includes(mode)) {
      expect(test.sign.mock.calls[1][0].operationId).toBe(test.sign.mock.calls[0][0].operationId);
      expect(test.sign.mock.calls[1][0].preparation).toBe(test.sign.mock.calls[0][0].preparation);
    }
    const commitmentCandidates = test.candidates.filter(saved => !!saved.response.extensions?.['x-formspec-signing-content'] && !saved.response.authoredSignatures?.length);
    expect(commitmentCandidates).toHaveLength(mode === 'uncommitted-retry' ? 2 : 1);
    if (mode === 'uncommitted-retry') expect(commitmentCandidates[1]).toEqual(commitmentCandidates[0]);
    const commitment = test.candidates.find(saved => !!saved.response.extensions?.['x-formspec-signing-content'] && !saved.response.authoredSignatures?.length)!;
    expect(commitment.draft.version).toBe(prepared.draft.version + 1);
    expect(commitment.response).not.toEqual(prepared.response);
    const signedResult = test.host.getSnapshot().controller!.signed!;
    expect(test.candidates.at(-1)!.response).toEqual(signedResult.response);
    expect(test.candidates.at(-1)!.draft).toEqual(signedResult.draft);
    expect(signedResult.response.authoredSignatures).toHaveLength(1);
    expect(test.host.getSnapshot().runtime).toBeUndefined();
    expect(screen.getByText('Checks pending.')).toBeDefined();
    if (mode === 'current-recovery') {
      const frozen = JSON.stringify(signedResult);
      const writes = { save: test.saveDraft.mock.calls.length, prepare: test.prepare.mock.calls.length, sign: test.sign.mock.calls.length };
      const associations = test.associate.mock.calls.length;
      test.options.signedPending = false;
      const retain = test.retained.getMockImplementation()!;
      test.retained.mockImplementation(async request => {
        const issued = await retain(request);
        return { ...issued, run: { ...issued.run, runId: 'authored-fresh-recovery-run' } };
      });
      fireEvent.click(screen.getByRole('link', { name: 'Before you apply' }));
      expect(test.navigate).toHaveBeenLastCalledWith('/eligibility');
      mounted.rerender(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
      for (const field of mounted.container.querySelectorAll('select')) fireEvent.change(field, { target: { value: 'yes' } });
      fireEvent.click(await screen.findByRole('button', { name: /continue|check/i }));
      await vi.waitFor(() => expect(test.retained).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(test.navigate).toHaveBeenLastCalledWith('/'));
      mounted.rerender(<NativePackageRespondentHost {...test.props} location="/" />);
      await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
      mounted.rerender(<NativePackageRespondentHost {...test.props} location="/review-sign" />);
      await vi.waitFor(() => expect(test.host.getSnapshot().runtime).toBeDefined());
      expect(test.hydrate.mock.calls.at(-1)![0].nativeCurrentCheck?.runId).toBe('authored-fresh-recovery-run');
      expect(JSON.stringify(test.host.getSnapshot().controller!.signed)).toBe(frozen);
      expect(test.saveDraft).toHaveBeenCalledTimes(writes.save);
      expect(test.prepare).toHaveBeenCalledTimes(writes.prepare);
      expect(test.sign).toHaveBeenCalledTimes(writes.sign);
      expect(test.associate).toHaveBeenCalledTimes(associations);
      const retiredOwner = test.hydrate.mock.calls.at(-1)![0].assertCurrent;
      test.host.dispose();
      expect(retiredOwner).toThrow();
    }
    if (test.http) {
      const signedHash = await computeJcsSha256Digest(signedResult.response);
      const signedRequests = test.http.requests.filter(request => (request.body as { candidateHash?: string }).candidateHash === signedHash);
      expect(signedRequests.map(request => new URL(request.url).pathname)).toEqual([]);
      for (const request of signedRequests) expect((request.body as { draftVersion: number }).draftVersion).toBe(signedResult.draft.version);
      expect(test.saveDraft).toHaveBeenCalledOnce(); expect(test.sign).toHaveBeenCalledOnce();
    }
    mounted.unmount(); test.host.dispose();
  });

});


describe('generic saved candidate hydration without an entry Screener', () => {
  it('keeps a committed Save when checked candidate facts are unavailable', async () => {
    const qualifySaved = vi.fn<NonNullable<NativePackageSigningHostPolicy['candidateHydration']>['qualifySaved']>(async (_saved, lifetime) => {
      lifetime.signal.throwIfAborted(); lifetime.assertCurrent(); throw new Error('selected task origin unavailable');
    });
    const retireFacts = vi.fn(); const dispose = vi.fn();
    const test = await actualFixture({ candidateHydration: { qualifySaved, retireFacts, dispose } });
    expect(test.host.screenerCompletion).toBeUndefined();
    expect(test.host.preSignCandidate).toBeTypeOf('function');
    const mounted = render(<NativePackageRespondentHost {...test.props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
    await vi.waitFor(() => expect(test.saveDraft).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(qualifySaved).toHaveBeenCalled());
    await vi.waitFor(() => expect(test.host.getSnapshot().controller?.saved).toBeDefined());
    expect(test.host.getSnapshot().nativeReadiness).toBe('pending');
    expect(test.prepare).not.toHaveBeenCalled();
    mounted.unmount(); test.host.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

it('uses selected generic candidate facts for the maintained isolated check and pre-sign path', async () => {
  const base = await hydrationFixture();
  const ready = vi.fn();
  const qualifySaved = vi.fn<NonNullable<NativePackageSigningHostPolicy['candidateHydration']>['qualifySaved']>(async (saved, lifetime) => {
    lifetime.assertCurrent(); lifetime.signal.throwIfAborted();
    return { view: { ...base.view, selection: { ...base.view.selection, definitionUrl: test.policy.definition.url,
      definitionVersion: test.policy.definition.version, requiredSources: [] }, draftId: saved.draft.id,
      draftVersion: saved.draft.version, candidateHash: await computeJcsSha256Digest(saved.response), sources: {}, results: [], providerReceipt: null },
      assertCurrent: () => { lifetime.signal.throwIfAborted(); lifetime.assertCurrent(); }, assertReady: ready };
  });
  const test = await actualFixture({ candidateHydration: { qualifySaved, retireFacts: vi.fn(), dispose: vi.fn() } });
  const mounted = render(<NativePackageRespondentHost {...test.props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save draft' }));
  await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
  const saved = test.host.getSnapshot().controller!.saved!;
  const proof = await test.host.preSignCandidate!({ saved, operationId: 'generic-sign', assertCurrent: vi.fn() });
  proof.assertCurrent();
  expect(qualifySaved).toHaveBeenCalledTimes(2);
  expect(ready).toHaveBeenCalled();
  expect(test.host.screenerCompletion).toBeUndefined();
  mounted.unmount(); test.host.dispose();
});

// Discriminate route-change cleanup from real Source/proof failures without business reads.
it('native route transition rebuilds prepared sources after the old renderer unmounts', async () => {
  const test = await nativeFactsFixture();
  let signingRoute = false; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held: Parameters<NonNullable<NativePackageSigningHostPolicy['nativeScreener']>['hydration']['hydrate']>[0][] = [];
  const hydrate = test.hydrate.getMockImplementation()!;
  test.hydrate.mockImplementation(async request => { if (signingRoute) { held.push(request); await gate; } return hydrate(request); });
  const visit = vi.spyOn(test.host, 'createSurfaceVisit');
  function Harness() {
    const [location, setLocation] = useState('/eligibility');
    return <NativePackageRespondentHost {...test.props} location={location} onNavigate={href => { test.navigate(href); signingRoute = href === '/review-sign'; setLocation(href); }} />;
  }
  const mounted = render(<Harness />);
  await screen.findByRole('button', { name: /continue|check/i });
  for (const field of mounted.container.querySelectorAll('select')) fireEvent.change(field, { target: { value: 'yes' } });
  fireEvent.click(mounted.container.querySelector('.formspec-screener-continue')!);
  await screen.findByRole('button', { name: 'Save draft' });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare saved response' }));
  await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
  await act(async () => { await Promise.resolve(); });
  expect(test.host.getSnapshot().controller?.prepared).toBeDefined();
  expect(test.host.getSnapshot().nativeReadiness).toBe('pending');
  expect(held.at(-1)!.signal.aborted).toBe(false);
  await act(async () => { release(); });
  await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
  await vi.waitFor(() => expect(test.host.getSnapshot().runtime).toBeDefined());
  await vi.waitFor(() => expect(test.read).toHaveBeenCalledOnce());
  test.completeRead(new Blob([test.photoBytes], { type: 'image/png' }));
  fireEvent.load(await screen.findByRole('img', { name: /saved photo/i }));
  await screen.findByRole('textbox', { name: 'Your name for this demonstration' });
  expect(visit.mock.results[0].value.bindRuntime().authorizeDataSource({} as never)).toEqual({ status: 'refused', reason: 'native-visit-retired' });
  expect(test.prepare).toHaveBeenCalledOnce(); expect(test.sign).not.toHaveBeenCalled(); expect(test.submit).not.toHaveBeenCalled();
  mounted.unmount(); test.host.dispose();
});

it.each(['current', 'expired'] as const)('settles one %s-facts Prepare across its committed successor engine exchange', async mode => {
  const test = await nativeFactsFixture();
  let expired = false;
  const originalHydrate = test.hydrate.getMockImplementation()!;
  test.hydrate.mockImplementationOnce(async request => {
    const facts = await originalHydrate(request);
    return { ...facts, assertReady: () => { facts.assertReady(); if (expired) throw new Error('proof expired'); } };
  });
  Object.assign(test.policy.nativeScreener!.retention, { refresh: vi.fn(async () => { throw new Error('unexpected fresh act'); }) });
  const mounted = render(<NativePackageRespondentHost {...test.props} location="/eligibility" />);
  await completeNativeScreener(test, mounted);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await vi.waitFor(() => expect(test.host.getSnapshot().nativeReadiness).toBe('ready'));
  expired = mode === 'expired';
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const hydrate = test.hydrate.getMockImplementation()!;
  test.hydrate.mockImplementationOnce(async request => { await hold; return hydrate(request); });
  const before = test.terminals.length;
  fireEvent.click(screen.getByRole('button', { name: 'Prepare saved response' }));
  if (mode === 'current') {
    await vi.waitFor(() => expect(test.prepare).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(test.host.getSnapshot().controller?.prepared).toBeDefined());
  } else await vi.waitFor(() => expect(test.hydrate).toHaveBeenCalledTimes(2));
  await act(async () => { release(); });
  await vi.waitFor(() => expect(test.terminals.length).toBeGreaterThan(before));
  expect(test.terminals.at(-1)).toEqual({ status: 'completed', valid: true });
  expect(test.host.getSnapshot().controller?.prepared).toBeDefined();
  await vi.waitFor(() => expect(test.navigate).toHaveBeenCalledWith('/review-sign'));
  mounted.unmount(); test.host.dispose();
});
