import canonicalize from 'canonicalize';
import { createFormEngine, preactReactiveRuntime, type IFormEngine, type RegistryEntry } from '@formspec-org/engine/render';
import type { SemanticControlScope } from '@formspec-org/react';
import { composeSurfaceApp, createThemeAuthority, createWidgetRegistry, dataSourceAvailableToWidget, dereferenceBundleExport, flattenRegistryEntries, planMatchedRoute, resolveDataSourceDescriptor, type BundleExport } from '@formspec-org/surface';
import { RESPONSE_REVIEW_WIDGET_SHAPE, SIGNING_CEREMONY_WIDGET_SHAPE, responseReviewHash, starterWidgetModule, type ResponseReviewData, type ResponseReviewOptions, type ResponseReviewState } from '@formspec-org/surface-react';
import type { FormDefinition, FormResponse, LocaleDocument, ValidationReport } from '@formspec-org/types';
import type { AttachmentStore } from '../ports/attachment-store.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { RespondentOwnedRuntimeInput, RespondentOwnedRuntime, RespondentSubmittedRuntimeInput } from '../app/RespondentRuntime.tsx';
import { createResponseActionController, type ResponseActionControllerConfig, type ResponseActionControllerSnapshot } from './response-action-controller.ts';
import { createFrozenHostStateDataSourceRuntime } from './frozen-host-state-data.ts';
import { generateIdempotencyKey } from './idempotency-key.ts';

export interface NativePackageSigningHostPolicy {
  bundle: BundleExport;
  moduleId: string;
  definition: FormDefinition;
  registryEntries: readonly RegistryEntry[];
  locales: readonly LocaleDocument[];
  controller: Omit<ResponseActionControllerConfig, 'context' | 'restoredResponse' | 'validateFrozenResponse' | 'reviewReady' | 'signingContext' | 'buildHandoff'>;
  buildHandoff: (response: FormResponse, report: ValidationReport,
    context: Pick<RespondentOwnedRuntimeInput, 'draftKey' | 'claim'>) => ReturnType<ResponseActionControllerConfig['buildHandoff']>;
  publication: { formId: string; formVersionId: string };
  responseId?: string;
  initialLocale: string;
  clearDraftAccess: (key: DraftKey) => Promise<void>;
  /** Qualified host pins; this function must not derive pins from widget input. */
  signingContext: (locale: string) => ReturnType<ResponseActionControllerConfig['signingContext']>;
  semanticScope: (responseId: string, renderInstance: number) => SemanticControlScope;
  readiness: { instance: string; readyPath: string; ownedPath: string };
  bindings: Readonly<Record<string, { catalogRef: string; sourceRef: string }>>;
  /** Resolved mapped action labels from the exact admitted Locale. */
  actionLabels: (locale: string) => Readonly<Record<string, string>>;
  validatePayload: Parameters<typeof createFrozenHostStateDataSourceRuntime>[0]['validatePayload'];
  attachmentStore: AttachmentStore;
  assertOwner: (key: DraftKey, actor: string) => void;
  /** Owner-supplied retirement; never clear unresolved operation metadata here. */
  invalidateAuthority: (reason: 'edit' | 'locale' | 'clear' | 'dispose', key: DraftKey | undefined) => void;
  /** Explicit maintained Response digest profile, independent of review context identity. */
  reviewResponseDigest: (response: FormResponse) => Promise<string>;
  canonicalResponseHandoffBytes: NonNullable<ResponseReviewOptions['canonicalResponseHandoffBytes']>;
  createEngine?: typeof createFormEngine;
}

/** One host session survives form-route unmount. Renderer leases never own the ceremony. */
export function createNativePackageSigningHost(policy: NativePackageSigningHostPolicy) {
  policy = { ...policy, bundle: structuredClone(policy.bundle), definition: structuredClone(policy.definition),
    registryEntries: structuredClone(policy.registryEntries), locales: structuredClone(policy.locales), bindings: structuredClone(policy.bindings),
    readiness: structuredClone(policy.readiness), publication: structuredClone(policy.publication),
    controller: { ...policy.controller, roles: structuredClone(policy.controller.roles) } };
  freezeMetadata(policy.bundle); freezeMetadata(policy.definition); freezeMetadata(policy.registryEntries); freezeMetadata(policy.locales);
  freezeMetadata(policy.bindings); freezeMetadata(policy.readiness); freezeMetadata(policy.publication); freezeMetadata(policy.controller.roles);
  const bundle = dereferenceBundleExport(policy.bundle);
  const flattened = flattenRegistryEntries(bundle.registries);
  const loadedLocales = Object.values(policy.bundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document);
  if (bundle.definitions.size !== 1 || !same(bundle.definitions.get(policy.definition.url), policy.definition)
    || flattened.diagnostics.length || !same(flattened.entries, policy.registryEntries)
    || loadedLocales.length !== policy.locales.length || policy.locales.some(document => loadedLocales.filter(loaded => same(loaded, document)).length !== 1)
    || !policy.bundle.manifest.modules?.some(module => module.id === policy.moduleId && module.version === '0.1.0')) throw new Error('native-resource-unadmitted');
  const widgets = createWidgetRegistry({ registryEntries: flattened.entries, modules: [starterWidgetModule(policy.moduleId)] });
  const app = composeSurfaceApp(bundle.surfaces);
  for (const handle of app.routes) {
    const plan = planMatchedRoute({ handle, app, definitions: bundle.definitions, experiences: bundle.experiences,
      registryEntries: flattened.entries, widgets, dataSources: bundle.dataSources, surfaceRef: bundle.surfaceRefs?.get(handle.surface),
      responseActions: bundle.responseActions, themeAuthority: createThemeAuthority({ tenantTheme: bundle.tenantTheme }),
      hasExecutor: true, hasWidgetActionExecutor: true });
    for (const slot of plan.slots) {
      if (slot.slotType !== 'module-widget') continue;
      if (slot.resolution.status !== 'resolved' || !slot.resolution.declared) throw new Error('native-widget-unadmitted');
      const shape = slot.key.widgetName === SIGNING_CEREMONY_WIDGET_SHAPE.widgetName ? SIGNING_CEREMONY_WIDGET_SHAPE
        : slot.key.widgetName === RESPONSE_REVIEW_WIDGET_SHAPE.widgetName ? RESPONSE_REVIEW_WIDGET_SHAPE : undefined;
      if (!shape || !same(slot.resolution.entry?.widgetShape, shape)) throw new Error('native-widget-shape-unadmitted');
    }
  }
  const scratch = policy.definition.instances?.[policy.readiness.instance];
  if (scratch?.readonly !== false || policy.readiness.readyPath === policy.readiness.ownedPath
    || atPath(scratch.data, policy.readiness.readyPath) !== false || atPath(scratch.data, policy.readiness.ownedPath) !== false) throw new Error('native-readiness-unadmitted');
  for (const admission of Object.values(policy.controller.roles)) {
    if (!admission || !same(policy.bundle.documents[admission.artifactRef], admission.document)
      || bundle.responseActions.filter(document => same(document, admission.document)).length !== 1) {
      throw new Error('native-action-unadmitted');
    }
  }
  const catalogs = bundle.dataSources ?? [];
  const entries = Object.entries(policy.bindings).map(([name, binding]) => {
    const descriptor = resolveDataSourceDescriptor(catalogs, binding);
    const producer = ['definition', 'presentation'].includes(name) ? 'admitted-response-review' : 'admitted-signing-cohort';
    if (!descriptor || descriptor.source.runtime.provenance.source !== `${producer}:${name}`) throw new Error('native-source-unadmitted');
    return { name, descriptor };
  });
  let controller: ReturnType<typeof createResponseActionController> | undefined;
  let input: RespondentOwnedRuntimeInput | undefined;
  let rendererEngine: IFormEngine | undefined;
  let locale = policy.initialLocale;
  let formTitle = typeof policy.definition.title === 'string' ? policy.definition.title : '';
  let generation = 0;
  let authorityGeneration = 0;
  let visitEpoch = 0;
  let visitMarkerSequence = 0;
  let renderInstance = 0;
  let responseId = policy.responseId;
  let disposed = false;
  let cleared = false;
  let clearing: Promise<void> | undefined;
  let unsubscribeController: (() => void) | undefined;
  let runtime: ReturnType<typeof createFrozenHostStateDataSourceRuntime> | undefined;
  let review: ResponseReviewData | undefined;
  let expectedReviewIdentity: string | undefined;
  let reviewState: ResponseReviewState | undefined;
  let publicSnapshot: ResponseActionControllerSnapshot | undefined;
  // Ownership survives retiring candidate evidence after edits. This detached
  // snapshot selects the owned branch only; the cohort requalifies its handle.
  let ownedResponseSeed: FormResponse | undefined;
  let deliveryIdentity: string | undefined;
  let submitted: { referenceNumber: string; recordKind: 'response' } | undefined;
  let submittedKey: DraftKey | undefined;
  const listeners = new Set<() => void>();
  const reads = new Set<AbortController>();
  const sourceRevisions = new Map<string, { value: string; revision: number }>();
  const engineFactory = policy.createEngine ?? createFormEngine;
  let hostSnapshot = { generation, sessionGeneration: authorityGeneration, locale, formTitle, cleared, controller: publicSnapshot, runtime, submitted };
  const emit = () => { hostSnapshot = Object.freeze({ generation, sessionGeneration: authorityGeneration, locale, formTitle, cleared, controller: publicSnapshot, runtime, submitted }); for (const listener of listeners) listener(); };
  function fence() {
    generation++; runtime = undefined; review = undefined; expectedReviewIdentity = undefined; reviewState = undefined;
    for (const read of reads) read.abort();
    reads.clear();
  }
  function current(expected: number) { if (disposed || generation !== expected) throw new Error('native-context-obsolete'); }
  function stop(reason: Parameters<NativePackageSigningHostPolicy['invalidateAuthority']>[0]) {
    if (reason === 'clear' || reason === 'dispose') { ownedResponseSeed = undefined; submitted = undefined; }
    rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, false);
    authorityGeneration++; deliveryIdentity = undefined; fence(); controller?.invalidate(); policy.invalidateAuthority(reason, input ? structuredClone(input.draftKey) : submittedKey ? structuredClone(submittedKey) : undefined);
  }
  async function isolated(response: FormResponse, activeLocale: string, run: (engine: IFormEngine) => unknown) {
    const engine = engineFactory(policy.definition, { registryEntries: [...policy.registryEntries], runtimeContext: { locale: activeLocale } });
    try {
      for (const document of policy.locales) engine.loadLocale(document);
      engine.setLocale(activeLocale); engine.loadResponseData(response.data as Parameters<IFormEngine['loadResponseData']>[0]);
      await engine.waitForInstanceSources(); await engine.waitForRemoteOptions();
      return await run(engine);
    } finally { engine.dispose(); }
  }
  async function delivery(snapshot: ResponseActionControllerSnapshot) {
    const selected = snapshot.signed ?? snapshot.prepared;
    if (!selected || !input) return;
    fence(); const expected = generation;
    const phase = snapshot.signed ? 'before-submit' : 'before-sign';
    const fields = await isolated(selected.response, locale, engine => captureFields(engine, selected.response)) as ResponseReviewData['presentation']['fields'];
    current(expected); policy.assertOwner(input.draftKey, selected.actor.id);
    if (await policy.reviewResponseDigest(selected.response) !== selected.draft.responseHash) throw new Error('native-review-digest-profile-mismatch');
    const captured: ResponseReviewData = structuredClone({ definition: policy.definition, response: selected.response,
      presentation: { responseHash: selected.draft.responseHash, definitionUrl: selected.response.definitionUrl,
        definitionVersion: selected.response.definitionVersion, locale, actorRef: selected.actor.id,
        draft: { id: selected.draft.id, version: selected.draft.version }, phase, fields } });
    const identity = await responseReviewHash(captured); current(expected);
    review = captured; expectedReviewIdentity = identity;
    reviewState = { status: 'pending', responseHash: selected.draft.responseHash, actorRef: selected.actor.id,
      draft: { id: selected.draft.id, version: selected.draft.version }, locale, phase };
    rebuildRuntime(snapshot, expected); emit();
  }
  function rebuildRuntime(snapshot: ResponseActionControllerSnapshot, expected: number) {
    const selected = snapshot.signed ?? snapshot.prepared;
    if (!selected || !review || !reviewState || !expectedReviewIdentity || !input) return;
    const values: Record<string, unknown> = { content: selected.content, response: selected.response,
      draft: selected.draft, actor: selected.actor, signingResult: snapshot.signed
        ? { state: 'signed', response: selected.response, draft: { id: selected.draft.id, version: selected.draft.version }, verification: snapshot.signed.verification }
        : { state: 'unsigned' }, actionLabels: policy.actionLabels(locale),
      review: { contextIdentity: expectedReviewIdentity, state: reviewState },
      definition: review.definition, presentation: review.presentation };
    const frozenEntries = entries.map(entry => {
      if (!Object.hasOwn(values, entry.name)) throw new Error('native-source-name-unsupported');
      const key = JSON.stringify([entry.descriptor.catalogRef, entry.descriptor.sourceRef]);
      const value = canonicalize(values[entry.name])!; const previous = sourceRevisions.get(key);
      if (previous?.value !== value) sourceRevisions.set(key, { value, revision: (previous?.revision ?? 0) + 1 });
      return { descriptor: entry.descriptor, value: values[entry.name] };
    });
    runtime = createFrozenHostStateDataSourceRuntime({ entries: frozenEntries, generation: expected, recordId: selected.draft.id, revision: selected.draft.version,
    assertCurrent: () => { current(expected); policy.assertOwner(input!.draftKey, selected.actor.id); }, validatePayload: policy.validatePayload });
  }
  function start(restoredResponse?: FormResponse) {
    if (!input) throw new Error('native-runtime-not-attached');
    if (restoredResponse) { ownedResponseSeed = structuredClone(restoredResponse); freezeMetadata(ownedResponseSeed); }
    unsubscribeController?.();
    const expected = authorityGeneration;
    controller = createResponseActionController({ ...policy.controller, restoredResponse: ownedResponseSeed,
      context: { definition: policy.definition, draftKey: input.draftKey, publication: policy.publication,
        responseId: responseId!, generation: String(expected) }, signingContext: () => policy.signingContext(locale),
      validateFrozenResponse: async (response, validationTuple) => {
        const result = await isolated(response, locale, engine => ({ response, validationTuple,
          validationReport: engine.getValidationReport({ profile: validationTuple.profile }) }));
        if (disposed || authorityGeneration !== expected) throw new Error('native-context-obsolete');
        return result as Awaited<ReturnType<ResponseActionControllerConfig['validateFrozenResponse']>>;
      },
      buildHandoff: async response => {
        const report = await isolated(response, locale, engine => engine.getValidationReport({ profile: 'on-submit' })) as ValidationReport;
        if (disposed || authorityGeneration !== expected || !report.valid || report.definitionUrl !== response.definitionUrl
          || report.definitionVersion !== response.definitionVersion) throw new Error('native-handoff-validation-refused');
        return policy.buildHandoff(response, report, structuredClone({ draftKey: input!.draftKey, claim: input!.claim }));
      },
      reviewReady: (context, stage) => {
        if (!review || !reviewState || reviewState.status !== 'ready' || reviewState.contextIdentity !== expectedReviewIdentity
          || !same(context.response, review.response) || !same(context.draft, { ...review.presentation.draft, responseHash: review.presentation.responseHash })
          || context.actor.id !== review.presentation.actorRef || context.locale !== locale
          || reviewState.phase !== (stage === 'signed' ? 'before-submit' : 'before-sign')) return false;
        policy.assertOwner(input!.draftKey, context.actor.id); return true;
      },
    });
    publicSnapshot = controller.getSnapshot();
    rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.ownedPath, publicSnapshot.owned);
    unsubscribeController = controller.subscribe(() => {
      publicSnapshot = controller!.getSnapshot();
      if (authorityGeneration === expected && publicSnapshot.saved) { ownedResponseSeed = structuredClone(publicSnapshot.saved.response); freezeMetadata(ownedResponseSeed); }
      rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.ownedPath, publicSnapshot.owned);
      const selected = publicSnapshot.signed ?? publicSnapshot.prepared;
      const identity = selected ? canonicalize({ selected, locale, signed: !!publicSnapshot.signed }) : undefined;
      if (selected && identity !== deliveryIdentity) {
        deliveryIdentity = identity;
        const producing = generation + 1;
        void delivery(publicSnapshot).catch(() => { if (generation === producing) { runtime = undefined; reviewState = undefined; emit(); } });
      }
      emit();
    });
  }
  const reviewOptions: ResponseReviewOptions = {
    canonicalResponseHandoffBytes: policy.canonicalResponseHandoffBytes,
    onReviewState(state) {
      if (!review || !same({ ...state, status: 'pending', contextIdentity: undefined },
        { ...reviewState, status: 'pending', contextIdentity: undefined }) || (state.status === 'ready' && state.contextIdentity !== expectedReviewIdentity)) return;
      if (same(state, reviewState)) return;
      reviewState = structuredClone(state); rebuildRuntime(publicSnapshot!, generation); emit();
    },
    async readAttachment(request, options) {
      request = structuredClone(request); freezeMetadata(request);
      const expected = generation;
      const expectedVisit = visitEpoch;
      if (!input || !review || !same(request.definition, review.definition) || !same(request.response, review.response)
        || !same(request.presentation, review.presentation) || !same(atPath(review.response.data, request.path), request.descriptor)
        || !policy.attachmentStore.read) throw new Error('native-attachment-context-refused');
      current(expected); policy.assertOwner(input.draftKey, review.presentation.actorRef);
      const abort = new AbortController(); const cancel = () => abort.abort(); options.signal.addEventListener('abort', cancel, { once: true });
      if (options.signal.aborted) abort.abort(); reads.add(abort);
      try {
        const bytes = await policy.attachmentStore.read(request.descriptor, { signal: abort.signal });
        current(expected); if (visitEpoch !== expectedVisit) throw new Error('native-visit-retired'); policy.assertOwner(input.draftKey, request.presentation.actorRef);
        if (!review || !same(request.definition, review.definition) || !same(request.response, review.response)
          || !same(request.presentation, review.presentation) || !same(atPath(review.response.data, request.path), request.descriptor)) throw new Error('native-attachment-context-refused');
        if (abort.signal.aborted) throw new Error('native-attachment-aborted'); return bytes;
      } finally { reads.delete(abort); options.signal.removeEventListener('abort', cancel); }
    },
  };
  async function selectLocale(value: string) {
    if (submitted || publicSnapshot?.signed || publicSnapshot?.confirmation) throw new Error('native-locale-frozen');
    const selected = policy.locales.find(document => document.locale.toLowerCase() === value.toLowerCase());
    if (disposed || cleared || !input || !selected) throw new Error('native-locale-unavailable');
    value = selected.locale;
    const saved = publicSnapshot?.saved?.response; stop('locale'); locale = value;
    rendererEngine?.setLocale(value); start(saved);
    rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, true); emit();
  }
  return {
    bundle, moduleId: policy.moduleId, reviewOptions, selectLocale,
    allocateSurfaceSessionMarker(sessionGeneration: number) {
      if (disposed || sessionGeneration !== authorityGeneration) throw new Error('native-visit-retired');
      return `native-visit:${sessionGeneration}:${++visitMarkerSequence}`;
    },
    /** Register the maintained shell identity before loads, independently of request data. */
    createSurfaceVisit(marker: string, sessionGeneration: number) {
      if (!marker) throw new Error('native-visit-unqualified');
      let ticket: number | undefined;
      const assertVisit = () => {
        if (disposed || cleared || ticket === undefined || ticket !== visitEpoch || sessionGeneration !== authorityGeneration) throw new Error('native-visit-retired');
      };
      return {
        activate() {
          if (disposed || cleared || sessionGeneration !== authorityGeneration) throw new Error('native-visit-retired');
          ticket = ++visitEpoch; for (const read of reads) read.abort(); reads.clear();
        },
        dispose() { if (ticket === visitEpoch) { visitEpoch++; for (const read of reads) read.abort(); reads.clear(); } ticket = undefined; },
        bindRuntime() {
          const requestFor = (request: Parameters<NonNullable<typeof runtime>['dataSourceLoader']>[0]) => {
            const delivery = runtime; const deliveryGeneration = generation;
            assertVisit(); current(deliveryGeneration);
            if (request.context.sessionGeneration !== marker) throw new Error('native-visit-unqualified');
            return { delivery, request: { ...request, context: { ...request.context, sessionGeneration: deliveryGeneration } } };
          };
          return {
            authorizeDataSource: ((request) => {
              try { const captured = requestFor(request); return captured.delivery?.authorizeDataSource(captured.request) ?? { status: 'refused', reason: 'native-state-unavailable' }; }
              catch { return { status: 'refused', reason: 'native-visit-retired' }; }
            }) satisfies NonNullable<typeof runtime>['authorizeDataSource'],
            dataSourceLoader: ((request) => {
              try { const captured = requestFor(request); return captured.delivery?.dataSourceLoader(captured.request) ?? { status: 'unavailable', reason: 'native-state-unavailable' }; }
              catch { return { status: 'unavailable', reason: 'native-visit-retired' }; }
            }) satisfies NonNullable<typeof runtime>['dataSourceLoader'],
            dataSourceRevision: (request: Parameters<NonNullable<typeof runtime>['dataSourceLoader']>[0]) => {
              try {
                const captured = requestFor(request);
                const selected = publicSnapshot?.signed ?? publicSnapshot?.prepared;
                if (!captured.delivery || !input || !selected || !entries.some(entry => same(entry.descriptor, request.descriptor))
                  || !dataSourceAvailableToWidget(request.descriptor, request.context)) return undefined;
                policy.assertOwner(input.draftKey, selected.actor.id);
                return sourceRevisions.get(JSON.stringify([request.descriptor.catalogRef, request.descriptor.sourceRef]))?.revision;
              } catch { return undefined; }
            },
            validateDataSourcePayload: policy.validatePayload,
            widgetActionExecutor: async (action: Parameters<NonNullable<typeof controller>['widgetExecutor']>[0]) => {
              assertVisit(); if (!controller) throw new Error('native-runtime-unavailable');
              const result = await controller.widgetExecutor(action); assertVisit(); return result;
            },
          };
        },
      };
    },
    async clearDraftAccess() {
      if (clearing) return clearing;
      const selectedKey = input?.draftKey ?? submittedKey;
      if (disposed || !selectedKey) throw new Error('native-runtime-unavailable');
      const key = structuredClone(selectedKey);
      if (!cleared) { stop('clear'); cleared = true; emit(); }
      clearing = policy.clearDraftAccess(key);
      try { await clearing; } finally { clearing = undefined; }
    },
    getSnapshot: () => hostSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    widgetExecutor: ((action: Parameters<NonNullable<typeof controller>['widgetExecutor']>[0]) => {
      if (!controller || disposed || cleared) throw new Error('native-runtime-unavailable'); return controller.widgetExecutor(action);
    }),
    async configureSubmittedRuntime(next: RespondentSubmittedRuntimeInput): Promise<Pick<RespondentOwnedRuntime, 'invalidate' | 'dispose'>> {
      const response = next.state.response;
      const responseLocale = response.displayedLocale;
      const selectedLocale = policy.locales.find(document => document.url === responseLocale?.url
        && document.version === responseLocale?.version && document.locale.toLowerCase() === responseLocale?.locale.toLowerCase());
      if (disposed || cleared || controller || input || next.state.kind !== 'submitted'
        || !same(next.definition, policy.definition) || next.state.formVersionId !== policy.publication.formVersionId
        || next.draftKey.formUrl !== policy.definition.url || next.draftKey.formVersion !== policy.definition.version
        || (next.draftKey.subjectRef !== undefined && next.draftKey.subjectRef !== next.state.subjectRef)
        || (next.claim && next.claim.subjectRef !== next.state.subjectRef) || !selectedLocale || !response.id
        || response.definitionUrl !== policy.definition.url || response.definitionVersion !== policy.definition.version) {
        throw new Error('native-submitted-context-refused');
      }
      submittedKey = structuredClone(next.draftKey); freezeMetadata(submittedKey);
      responseId = response.id; locale = selectedLocale.locale;
      submitted = Object.freeze({ referenceNumber: response.id, recordKind: 'response' });
      fence(); emit();
      return { invalidate: () => { if (!disposed) { stop('clear'); emit(); } }, dispose: () => {} };
    },
    async configureRuntime(next: RespondentOwnedRuntimeInput): Promise<RespondentOwnedRuntime> {
      if (disposed || cleared || submitted || !same(next.definition, policy.definition) || (responseId && next.restoredResponse && next.restoredResponse.id !== responseId)
        || (input && !same(input.draftKey, next.draftKey))) throw new Error('native-runtime-context-refused');
      responseId ??= next.restoredResponse?.id ?? generateIdempotencyKey();
      // A returning form lease keeps the session's selected language. The first
      // lease alone adopts Runtime's already-qualified saved Locale pin.
      if (input) next.engine.setLocale(locale);
      else locale = next.activeLocale;
      next = { ...next, draftKey: structuredClone(next.draftKey), claim: structuredClone(next.claim),
        restoredResponse: next.restoredResponse ? structuredClone(next.restoredResponse) : undefined, activeLocale: locale };
      input = next;
      freezeMetadata(input.draftKey); freezeMetadata(input.claim); freezeMetadata(input.restoredResponse);
      rendererEngine = next.engine;
      const title = next.engine.getFormVM().title.value;
      if (typeof title === 'string') formTitle = title;
      if (!controller) start(next.restoredResponse);
      const scope = policy.semanticScope(responseId, ++renderInstance);
      if (scope.responseId !== responseId) throw new Error('native-response-scope-refused');
      next.engine.setInstanceValue(policy.readiness.instance, policy.readiness.ownedPath, publicSnapshot!.owned);
      next.engine.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, true); emit();
      const answers = () => canonicalize(next.engine.getFieldPaths().map(path => [path, next.engine.signals[path]?.value]));
      let previous = answers();
      let active = true;
      const releaseTitle = preactReactiveRuntime.effect(() => {
        if (!active || disposed || rendererEngine !== next.engine) return;
        const title = next.engine.getFormVM().title.value;
        if (typeof title === 'string' && title !== formTitle) { formTitle = title; emit(); }
      });
      const release = preactReactiveRuntime.effect(() => {
        void next.engine.structureVersion.value;
        for (const path of next.engine.getFieldPaths()) void next.engine.signals[path]?.value;
        const value = answers();
        if (active && value !== previous) {
          previous = value; const saved = publicSnapshot?.saved?.response; stop('edit'); start(saved);
          next.engine.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, true); emit();
        }
      });
      return { responseActionInvoker: async action => {
        const expected = authorityGeneration;
        if (!active || disposed) throw new Error('native-renderer-retired');
        const result = await controller!.definitionInvoker(action);
        if (!active || disposed || authorityGeneration !== expected) throw new Error('native-renderer-retired');
        return result;
      }, semanticControlScope: scope,
      getCompletionGeneration: () => authorityGeneration,
      invalidate: () => { if (active) stop('clear'); }, dispose: () => { active = false; release(); releaseTitle(); next.engine.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, false); if (rendererEngine === next.engine) rendererEngine = undefined; } };
    },
    dispose() { if (disposed) return; stop('dispose'); disposed = true; unsubscribeController?.(); listeners.clear(); },
  };
}

export function captureFields(engine: IFormEngine, response: FormResponse): ResponseReviewData['presentation']['fields'] {
  const fields: Record<string, { label: string; options?: { value: string; label: string }[] }> = {};
  function walk(items: FormDefinition['items'], values: Record<string, unknown>, prefix = '') {
    for (const item of items) {
      if (!Object.hasOwn(values, item.key)) continue;
      const path = prefix ? `${prefix}.${item.key}` : item.key;
      const label = engine.getItemLabelSignal(path)?.value;
      if (typeof label !== 'string' || !label) throw new Error('native-review-label-unavailable');
      const field = item.type === 'field' ? engine.getFieldVM(path) : undefined;
      if (item.type === 'field' && !field) throw new Error('native-review-field-unavailable');
      const options = field ? field.options.value.map(option => ({ value: option.value, label: option.label })) : [];
      fields[path] = { label, ...(options.length ? { options } : {}) };
      if (item.type === 'group' && item.children) {
        const value = values[item.key];
        if (Array.isArray(value)) value.forEach((row, index) => walk(item.children!, row as Record<string, unknown>, `${path}[${index}]`));
        else if (value && typeof value === 'object') walk(item.children, value as Record<string, unknown>, path);
      }
    }
  }
  walk(engine.definition.items, response.data); return fields;
}
function same(a: unknown, b: unknown) { return canonicalize(a) === canonicalize(b); }
function atPath(data: unknown, path: string): unknown {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce<unknown>((value, key) => value && typeof value === 'object'
    && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined, data);
}
export type NativePackageSigningHost = ReturnType<typeof createNativePackageSigningHost>;
function freezeMetadata(value: unknown): void {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeMetadata(child); Object.freeze(value); }
}
