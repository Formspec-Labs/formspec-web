import { initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine/init-formspec-engine';
import type { ScreenerHydration } from '../ports/screener-hydration.ts';
import type { SavedCandidateHydration } from '../ports/evaluation-hydration.ts';
import type { HttpResponseSigningPolicy } from '../adapters/http/response-signing.ts';
import type { IdentityClaim } from '../ports/identity-provider.ts';
import canonicalize from 'canonicalize';
import { assertTaskCompletionRequest } from '../shared/task-response-completion.ts';
import { createTaskComposition } from './task.ts';
import { bindPackageDefinitionSource } from './package-definition-source.ts';
import { taskRequiresExternalHydration } from '../adapters/http/task-candidate-hydration.ts';
import { targetDefinitionMatches } from '@formspec-org/types';
import { canonicalResponseHandoffBytes as handoffBytes } from '@formspec-org/integrity-canonical';
import { resolveServiceRequest, resolveAuthoredSigningContent, resolveResponseAction } from '@formspec-org/engine/render';
import { createSemanticControlRegistry } from '@formspec-org/react';
import { dereferenceBundleExport, flattenRegistryEntries, type BundleExport } from '@formspec-org/surface';
import { SIGNING_CEREMONY_WIDGET_SHAPE } from '@formspec-org/surface-react';
import type { NativePackageSigningConfig } from '../config/native-package-signing.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { PinnedPackageDefinitionSource } from '../adapters/http/pinned-package-definition-source.ts';
import { HttpDefinitionSource } from '../adapters/http/definition-source.ts';
import { HttpClient } from '../adapters/http/http-client.ts';
import { readApplicationLifecycleCapabilities } from '../adapters/http/application-lifecycle.ts';
import { createHttpAdapterCohort } from '../adapters/http/cohort.ts';
import { AnonymousSessionBridge } from '../adapters/http/anonymous-session.ts';
import { HttpScreenerRetention } from '../adapters/http/screener-retention.ts';
import { HttpScreenerHydration } from '../adapters/http/screener-hydration.ts';
import type { BrowserAuthSessionState } from '../ports/browser-auth-session.ts';
import { HttpAttachmentStore } from '../adapters/http/attachment-store.ts';
import { createBrowserDraftResumeMetadataStore } from '../adapters/browser/draft-resume-metadata.ts';
import { computeJcsSha256Digest } from '../adapters/http/response-action-ledger.ts';
import { responseSigningDigest } from '../adapters/integrity/response-signing-digest.ts';
import { createSigningDataSourcePayloadValidator, loadCanonicalSigningContentValidator, loadCanonicalModulePayloadSchemaResources, validateCanonicalFormResponse } from '../adapters/schema/surface-bundle-schema-validators.ts';
import { createNativePackageSigningHost } from '../shared/native-package-signing-host.ts';
import type { QualifiedResponseActionRole, ResponseActionRole } from '../shared/response-action-controller.ts';
import { admitNativeSigningScope, nativeSigningActionMappings } from '../shared/native-signing-scope.ts';
import { generateIdempotencyKey } from '../shared/idempotency-key.ts';
import { buildIntakeHandoff, responseHash } from '../app/respondent-flow.ts';
import type { DraftKey, DraftReadState } from '../ports/draft-store.ts';
import type { AdmittedResponseAction, ResponseSigning, SavedResponseDraft } from '../ports/response-signing.ts';
import { freezeComposition } from '../policy/index.ts';
import type { Composition } from './types.ts';

import type { NativePackageBoot, NativePackageCompositionOptions } from './native-package.ts';
import { atNativeAdmissionStage } from './native-package-admission-error.ts';
import { diagnoseNativePrepare } from './native-package-action-diagnostic.ts';

/** Called only by the explicit native boot load; all admission precedes credentials. */
export async function loadNativePackage(config: FormspecWebConfig, options: NativePackageCompositionOptions, deferred: Composition): Promise<NativePackageBoot> {
  return atNativeAdmissionStage('package', () => loadQualifiedNativePackage(config, options, deferred));
}

async function loadQualifiedNativePackage(config: FormspecWebConfig, options: NativePackageCompositionOptions, deferred: Composition): Promise<NativePackageBoot> {
  const adapter = config.referenceAdapters!.formspecStack!;
  const base = { baseUrl: adapter.formspecServerUrl!, tenantBinding: config.tenantBinding,
    accessToken: options.identityBinding?.accessToken };
  const payloadSchemaResources = await loadCanonicalModulePayloadSchemaResources();
  const modulePins = options.signing.modules ?? [options.signing.module];
  const source = new PinnedPackageDefinitionSource(options.packageUrl, {
    moduleAdmission: { allowedModules: [...modulePins] }, moduleSupport: { payloadSchemaResources },
  }, options.signing.component);
  const [definition, bundle, componentDocument, localeDocuments, componentRouteResolver] = await Promise.all([
    source.getDefinition(), source.getNativeBundleExport(), source.getComponentDocument(), source.getLocaleDocuments(), source.getComponentRouteResolver(),
  ]);
  const pins = options.signing;
  if (!bundle || !componentDocument || !componentRouteResolver || definition.url !== pins.definition.url || definition.version !== pins.definition.version
    || bundle.manifest.id !== pins.bundle.id || bundle.manifest.version !== pins.bundle.version
    || bundle.manifest.modules?.length !== modulePins.length
    || modulePins.some(pin => bundle.manifest.modules!.filter(module => same(module, pin)).length !== 1)) throw new Error('Native package differs from its explicit deployment pins');
  const resolved = dereferenceBundleExport(bundle);
  const ownedDraftRestorationSites: { surfaceRef: string; routeId: string; slotId: string }[] = [];
  for (const surface of resolved.surfaces) {
    const url = resolved.surfaceRefs?.get(surface);
    const refs = bundle.manifest.surfaces?.filter(ref => ref.url === url) ?? [];
    for (const route of surface.routes) for (const slot of route.slots ?? []) {
      if (slot.slotType !== 'definition-form') continue;
      const form = resolved.definitions.get(String(record(slot.binding)?.definitionRef));
      const selected = componentRouteResolver({ surface: { url: url ?? '', version: refs.length === 1 ? refs[0].version ?? '' : '' },
        route: route.id, slot: slot.id, role: 'slot', definition: { url: form?.url ?? '', version: form?.version ?? '' } });
      if (selected.status !== 'ready') throw new Error(`Native form Component is unavailable: ${selected.reason}`);
      if (url && same(form, definition) && same(selected.component.document, componentDocument))
        ownedDraftRestorationSites.push({ surfaceRef: url, routeId: route.id, slotId: slot.id });
    }
  }
  const needsInitialDataMapping = resolved.surfaces.some(surface => surface.routes.some(route => (route.slots ?? []).some(slot =>
    slot.slotType === 'definition-form' && typeof record(record(slot.binding)?.initialData)?.mappingRef === 'string')));
  if (needsInitialDataMapping) {
    await initFormspecEngine();
    await initFormspecEngineTools();
  }
  const localeFor = (locale: string) => {
    const matches = localeDocuments.filter(document => document.locale === locale
      && document.target.kind === 'definition' && targetDefinitionMatches(document.target, definition));
    if (matches.length !== 1) throw new Error('Native package Locale pin is unavailable or ambiguous');
    return matches[0];
  };
  localeFor(pins.initialLocale);
  const signingScope = admitNativeSigningScope(bundle, pins.module.id, pins.signingScope);
  const roles = await qualifyRoles(bundle, pins, signingScope);
  for (const [name, binding] of Object.entries(pins.bindings)) {
    const authored = (signingScope ? [signingScope.ceremony, signingScope.review]
      : resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => route.slots ?? []))).flatMap(slot => {
      if (slot.slotType !== 'module-widget' || record(slot.binding)?.moduleId !== pins.module.id) return [];
      const source = record(record(record(slot.binding)?.dataBindings)?.[name]);
      return source ? [{ catalogRef: source.catalogRef, sourceRef: source.sourceRef }] : [];
    });
    if (!authored.length || authored.some(source => !same(source, binding))) throw new Error('Native source binding differs from the authored Surface');
  }
  const validateContent = await loadCanonicalSigningContentValidator();
  const ceremonies = signingScope ? [signingScope.ceremony] : resolved.surfaces.flatMap(surface => surface.routes.flatMap(route => route.slots ?? []))
    .filter(slot => slot.slotType === 'module-widget' && record(slot.binding)?.moduleId === pins.module.id
      && record(slot.binding)?.widgetName === SIGNING_CEREMONY_WIDGET_SHAPE.widgetName);
  if (ceremonies.length !== 1) throw new Error('Native signing ceremony is ambiguous');
  const contentRefs = record(record(ceremonies[0].binding)?.config)?.contentRefs;
  const signingContext = (locale: string) => {
    localeFor(locale);
    const entry = record(record(contentRefs)?.[locale]);
    if (!entry || typeof entry.ref !== 'string' || typeof entry.version !== 'string') throw new Error('Authored signing content is unavailable for this Locale');
    const source = { ref: entry.ref, version: entry.version };
    resolveAuthoredSigningContent({ definition, response: { definitionUrl: definition.url, definitionVersion: definition.version },
      source, locale, validateContent });
    return { source, locale };
  };
  signingContext(pins.initialLocale);
  const actionLabels = (locale: string) => {
    const document = localeFor(locale);
    return Object.fromEntries((['sign', 'submit', 'paper'] as const).map(name => {
      const action = resolveResponseAction(roles[name].document, roles[name].actionRef).action;
      const ref = action?.label && 'ref' in action.label ? action.label.ref : undefined;
      const value = ref ? document.strings[ref] : undefined;
      if (typeof value !== 'string' || !value.trim()) throw new Error('Authored action label is unavailable for this Locale');
      return [ref!, value];
    }));
  };
  actionLabels(pins.initialLocale);
  const publication = await atNativeAdmissionStage('publication', () => new HttpDefinitionSource(base).getPublishedDefinition(options.initialDefinitionUrl, definition));
  const formIdResolver = (url: string, version?: string) => {
    if ((url !== options.initialDefinitionUrl && url !== definition.url) || (version !== undefined && version !== definition.version)) throw new Error('Native package form scope differs from its qualified publication');
    return publication.form_id;
  };
  const resumeMetadata = createBrowserDraftResumeMetadataStore({ ...base,
    ...(options.nativeTask ? { taskContext: { taskId: options.nativeTask.launch.taskId,
      expectedTaskRevision: options.nativeTask.launch.expectedTaskRevision } } : {}),
    ...(options.identityBinding ? { identityContext: { issuer: config.identity.oidc!.issuer, clientId: config.identity.oidc!.clientId } } : {}) });
  const anonymousSessions = options.identityBinding ? undefined : new AnonymousSessionBridge({ ...base, resumeMetadata, formIdResolver,
    validateFormContext: async (url, version) => { formIdResolver(url, version); } });
  const ownedAccessToken = options.identityBinding ? async () => {
    const token = await options.identityBinding!.accessToken!();
    if (!token) throw new Error('Selected OIDC session is unavailable');
    return token;
  } : undefined;
  if (pins.applicationLifecycle && !options.identityBinding) throw new Error('Application lifecycle requires the selected authenticated session');
  const lifecycleCapabilities = pins.applicationLifecycle
    ? await readApplicationLifecycleCapabilities(new HttpClient({ ...base, accessToken: ownedAccessToken }), { formId: publication.form_id, formVersionId: publication.form_version_id }) : undefined;
  let host: ReturnType<typeof createNativePackageSigningHost> | undefined;
  const nativePins = options.nativeScreener;
  if (nativePins) {
    const selected = nativePins.selection.evaluationSelection;
    if (selected.formId !== publication.form_id || selected.formVersionId !== publication.form_version_id
      || selected.definitionUrl !== definition.url || selected.definitionVersion !== definition.version
      || selected.definitionHash !== publication.definition_hash || !nativePins.selectionKey.trim()
      || nativePins.selectionHash !== await computeJcsSha256Digest(nativePins.selection)) throw new Error('Native Screener publication pins mismatch');
  }
  const taskPins = options.nativeTask;
  const taskNeedsHydration = !!taskPins && taskRequiresExternalHydration(definition);
  if (taskPins) {
    const submit = roles.submit;
    if (!submit?.requestRef) throw new Error('Native task submit request is unavailable');
    assertTaskCompletionRequest(taskPins.completion, resolveServiceRequest(submit.document['x-formspec-runtime'], submit.requestRef));
  }
  const session = options.identityBinding?.browserAuthSession;
  let authState: BrowserAuthSessionState | null = null;
  let authSequence = 0; let authLifetime = new AbortController();
  const releaseAuth = nativePins || taskPins || options.ownedDraftResume ? session!.subscribe(next => {
    authSequence++; authLifetime.abort(); authLifetime = new AbortController(); authState = next ? structuredClone(next) : null;
    host?.retireCandidateAuthority?.();
  }) : undefined;
  let taskCandidate: SavedCandidateHydration | undefined;
  let selectedScreenerHydration: ScreenerHydration | undefined;
  try {
    if (nativePins || taskPins || options.ownedDraftResume) {
      const sequence = authSequence;
      const initial = await session!.getSession();
      if (sequence === authSequence) authState = initial ? structuredClone(initial) : null;
    }
    const taskCurrent = () => {
      authLifetime.signal.throwIfAborted();
      const state = authState;
      if (!state || state.issuer !== config.identity.oidc!.issuer || !Number.isFinite(Date.parse(state.expiresAt))
        || Date.parse(state.expiresAt) <= Date.now() || state.subject !== taskPins!.hydration.identity.subject
        || state.issuer !== taskPins!.hydration.identity.issuer || config.identity.oidc!.clientId !== taskPins!.hydration.identity.clientId)
        throw new Error('Native task browser session retired');
    };
    const signingPolicy = { keyId: pins.keyId, validateResponse: validateCanonicalFormResponse,
      validateContent, signingProfileDigest: responseSigningDigest,
      ...(nativePins || taskNeedsHydration ? { prePrepareCandidate: async (input: Parameters<NonNullable<HttpResponseSigningPolicy['prePrepareCandidate']>>[0]) => {
        if (!host?.prePrepareCandidate) throw new Error('Native candidate host unavailable');
        return host.prePrepareCandidate(input);
      }, preSignCandidate: async (input: Parameters<NonNullable<HttpResponseSigningPolicy['preSignCandidate']>>[0]) => {
        if (!host?.preSignCandidate) throw new Error('Native candidate host unavailable');
        return host.preSignCandidate(input);
      } } : {}) };
    if (taskPins && (taskPins.launch.formVersionId !== publication.form_version_id
      || taskPins.hydration.selection.formId !== publication.form_id || taskPins.hydration.selection.definitionHash !== publication.definition_hash
      || taskPins.hydration.selection.formVersionId !== publication.form_version_id)) throw new Error('Native task publication pins mismatch');
    const taskCohort = taskPins ? await createTaskComposition({ source: { ...base, accessToken: ownedAccessToken },
      wos: taskPins.wos, launch: taskPins.launch, completion: taskPins.completion,
      draftKey: { formUrl: definition.url, formVersion: definition.version, subjectRef: taskPins.subjectRef },
      formId: publication.form_id, definition, locales: localeDocuments, signing: signingPolicy, resumeMetadata,
      assertCurrentSource: taskCurrent, assertCurrentWos: taskPins.assertCurrentWos,
      launchOperationId: taskPins.launchOperationId, taskHydration: taskPins.hydration },
      { signal: authLifetime.signal, assertCurrent: taskCurrent }) : undefined;
    taskCandidate = taskCohort?.candidateHydration;
  const cohort = taskCohort ?? createHttpAdapterCohort({ ...base, accessToken: ownedAccessToken, resumeMetadata, formIdResolver, anonymousSessions,
    applicationLifecycle: lifecycleCapabilities ? { capabilities: lifecycleCapabilities, action: roles.startApplication as AdmittedResponseAction } : undefined,
    qualifiedDraftState: { definition, formVersionId: publication.form_version_id, localeDocuments },
    responseSigning: signingPolicy });
  let owner: { key: DraftKey; actor: string } | undefined = taskCohort ? { key: { formUrl: definition.url, formVersion: definition.version, subjectRef: taskPins!.subjectRef }, actor: taskPins!.subjectRef } : undefined;
  const remember = <T extends SavedResponseDraft>(result: T): T => {
    owner = { key: structuredClone(result.draftKey), actor: result.actor.id }; return result;
  };
  const signingPort: ResponseSigning = cohort.responseSigning!;
  const signing: ResponseSigning = {
    saveDraft: (input, execution) => cohort.responseSigning!.saveDraft(input, execution).then(remember),
    prepare: input => diagnoseNativePrepare(() => cohort.responseSigning!.prepare(input)).then(remember),
    sign: input => cohort.responseSigning!.sign(input).then(remember),
    ...(signingPort.restorePending ? { restorePending: (input: Parameters<NonNullable<ResponseSigning['restorePending']>>[0], operationId: string) => signingPort.restorePending!(input, operationId).then(result => result.kind === 'signed' ? { ...result, signed: remember(result.signed) } : { ...result, preparation: remember(result.preparation) }) } : {}),
  };
  const rememberOwnedState = (state: DraftReadState | undefined) => {
    if (state?.kind === 'active') {
      const saved = state.signed ?? state.savedDraft ?? state.pendingSign;
      if (saved) remember(saved);
    }
  };
  const draftStore = { ...cohort.draftStore, readState: async (key: DraftKey) => {
    const state = await cohort.draftStore.readState!(key); rememberOwnedState(state); return state;
  }, ...(cohort.draftStore.resumeState ? { resumeState: async (key: DraftKey, selection: NonNullable<NativePackageCompositionOptions['ownedDraftResume']>, assertCurrent: () => void) => {
    const state = await cohort.draftStore.resumeState!(key, selection, assertCurrent); rememberOwnedState(state); return state;
  } } : {}) };
  const attachmentStore = new HttpAttachmentStore({ ...base, formId: publication.form_id,
    maxUploadBytes: adapter!.attachments?.maxUploadBytes,
    ...(taskCohort ? { taskBinding: { draftId: taskCohort.launched.draft_id, fieldPaths: taskPins!.attachmentFieldPaths,
      lifetime: { signal: authLifetime.signal, assertCurrent: taskCurrent } } } : {}),
    accessToken: ownedAccessToken
      ?? (async () => (await anonymousSessions!.sessionForForm(definition.url, definition.version)).sessionToken) });
  const composition = freezeComposition({ ...deferred, nativePackageRespondent: undefined,
    definitionSource: bindPackageDefinitionSource(source, [options.initialDefinitionUrl, definition.url]),
    draftStore, submitTransport: cohort.submitTransport, responseSigning: signing, attachmentStore,
    instanceCapabilities: { ...deferred.instanceCapabilities, fileUpload: 'available' as const } });
  const registryEntries = flattenRegistryEntries(resolved.registries);
  if (registryEntries.diagnostics.length) throw new Error('Native Registry entries are ambiguous');
  const semantics = createSemanticControlRegistry();
  const definitionDigest = await computeJcsSha256Digest(definition);
    host = createNativePackageSigningHost({ ownedDraftRestorationSites, candidateHydration: taskCohort?.candidateHydration, initialDataSources: options.initialDataSources, hostEvents: options.hostEvents, screenerEntryGate: nativePins?.entryGate,
      ...(nativePins ? { nativeScreener: { selectionKey: nativePins.selectionKey,
        retention: new HttpScreenerRetention({ ...base, accessToken: ownedAccessToken, ...nativePins }),
        hydration: selectedScreenerHydration = nativePins.hydrationFactory
          ? nativePins.hydrationFactory({ source: { ...base, accessToken: ownedAccessToken }, definition, publication,
            selection: nativePins.selection, selectionHash: nativePins.selectionHash, compositionRegistrationHash: nativePins.compositionRegistrationHash })
          : new HttpScreenerHydration({ ...base, accessToken: ownedAccessToken, ...nativePins, definition }),
        context: () => {
          const state = authState; const sequence = authSequence; const lifetime = authLifetime;
          const assertCurrent = () => { lifetime.signal.throwIfAborted();
            if (!state || state.issuer !== config.identity.oidc!.issuer || sequence !== authSequence
              || Date.parse(state.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(state.expiresAt))) throw new Error('Native Screener browser session retired'); };
          assertCurrent();
          return { identity: { issuer: state!.issuer, subject: state!.subject, clientId: config.identity.oidc!.clientId }, signal: lifetime.signal, assertCurrent };
        } } } : {}), signingScope: signingScope?.identity, bundle, definition, moduleId: pins.module.id, modules: modulePins, structuredPanelWidgets: pins.structuredPanelWidgets, staticAssets: pins.staticAssets, registryEntries: registryEntries.entries,
      locales: localeDocuments, initialLocale: pins.initialLocale,
      clearDraftAccess: async key => { formIdResolver(key.formUrl, key.formVersion); await cohort.draftStore.delete(key); owner = undefined; }, publication: { formId: publication.form_id, formVersionId: publication.form_version_id },
      applicationReadiness: pins.applicationLifecycle,
      controller: { ...(taskCohort ? { completion: taskCohort.completion } : {}), applicationLifecycle: cohort.applicationLifecycle, roles, signing, submitTransport: cohort.submitTransport, validateResponse: validateCanonicalFormResponse, hashResponse: handoffHash },
      ...(!taskCohort ? { buildHandoff: (response: Parameters<typeof buildIntakeHandoff>[0]['response'], report: Parameters<typeof buildIntakeHandoff>[0]['validationReport'], context: { draftKey: DraftKey; claim: IdentityClaim | null }) => buildIntakeHandoff({ definition, response, validationReport: report,
        draftKey: context.draftKey, claim: context.claim, idempotencyKey: generateIdempotencyKey() }) } : {}),
      semanticScope: (responseId, renderInstance) => ({ registry: semantics, renderInstanceId: `native:${renderInstance}`,
        definitionArtifact: { artifactRef: definition.url, artifactDigest: definitionDigest },
        responseActionsArtifact: { artifactRef: roles.saveInitial.artifactRef, artifactDigest: roles.saveInitial.artifactDigest }, responseId }),
      readiness: pins.readiness, bindings: pins.bindings, actionLabels, signingContext,
      validatePayload: createSigningDataSourcePayloadValidator(), attachmentStore,
      assertOwner: (key, actor) => { if (taskPins) taskCurrent(); if (!owner || !same(owner.key, key) || owner.actor !== actor) throw new Error('Native private draft owner is unavailable or differs'); },
      invalidateAuthority: (_reason, key) => { if (key) cohort.invalidateResponseSigningScope!(key); },
      reviewResponseDigest: handoffHash, canonicalResponseHandoffBytes: handoffBytes,
    });
    const admittedHost = host;
    const disposeHost = admittedHost.dispose;
    admittedHost.dispose = () => { releaseAuth?.(); authLifetime.abort(); disposeHost(); };
    let resuming: ReturnType<NonNullable<NativePackageBoot['resumeSubmitted']>> | undefined;
    return { composition, host: admittedHost, componentDocument, componentRouteResolver, localeDocuments, moduleId: pins.module.id, initialLocale: pins.initialLocale, screenerCompletion: admittedHost.screenerCompletion ?? options.screenerCompletion,
      resumeSubmitted: () => resuming ??= atNativeAdmissionStage('saved-access', async () => {
        const lifetime = authLifetime, sequence = authSequence;
        const current = () => { lifetime.signal.throwIfAborted();
          if (sequence !== authSequence || options.ownedDraftResume && options.identityBinding && (!authState
            || authState.issuer !== config.identity.oidc?.issuer || !Number.isFinite(Date.parse(authState.expiresAt))
            || Date.parse(authState.expiresAt) <= Date.now())) throw new Error('Native recovery session retired'); };
        current();
        // Validate retained credentials through the bridge; recovery never issues an owner.
        if (anonymousSessions && resumeMetadata.read(`grant:${publication.form_id}`) !== undefined) {
          await anonymousSessions.sessionForForm(definition.url, definition.version, true);
        }
        let claim = null;
        if (options.identityBinding) {
          claim = await atNativeAdmissionStage('identity', async () => {
            // Do not start a redirect during recovery; the respondent shell owns sign-in.
            if (!await options.identityBinding!.browserAuthSession!.getSession()) return null;
            const choices = await options.identityBinding!.provider.discover(config.identity.oidc?.minAssurance);
            const selected = choices.find(choice => choice.kind === 'oidc' && choice.issuer === config.identity.oidc?.issuer);
            if (!selected) throw new Error('Selected OIDC identity is unavailable for native recovery');
            return options.identityBinding!.provider.authenticate(selected);
          });
          current(); if (!claim) return 'absent';
        }
        const draftKey = { formUrl: definition.url, formVersion: definition.version, subjectRef: claim?.subjectRef };
        if (taskPins && claim?.subjectRef !== taskPins.subjectRef) throw new Error('Native task recovery owner mismatch');
        if (options.ownedDraftResume && !draftStore.resumeState) throw new Error('Owned draft resume capability unavailable');
        const state = options.ownedDraftResume
          ? await draftStore.resumeState!(draftKey, options.ownedDraftResume, current) : await draftStore.readState(draftKey);
        current();
        if (state?.kind === 'active' && state.savedDraft && !state.signed && !state.pendingSign)
          await admittedHost.restoreOwnedDraftAccess(state.savedDraft, current);
        if (state?.kind === 'submitted') await admittedHost.configureSubmittedRuntime({ definition, draftKey, claim, state });
        return state?.kind ?? 'absent';
      }) };
  } catch (error) {
    releaseAuth?.();
    authLifetime.abort();
    if (host) host.dispose(); else { taskCandidate?.dispose(); selectedScreenerHydration?.dispose?.(); }
    throw error;
  }
}
async function qualifyRoles(bundle: BundleExport, pins: NativePackageSigningConfig, signingScope: ReturnType<typeof admitNativeSigningScope>): Promise<Record<ResponseActionRole, QualifiedResponseActionRole>> {
  const resolved = dereferenceBundleExport(bundle);
  const result = {} as Record<ResponseActionRole, QualifiedResponseActionRole>;
  for (const [name, selected] of Object.entries(pins.roles) as [ResponseActionRole, { artifactRef: string; actionRef: string }][]) {
    const document = resolved.responseActions.find(document => same(document, bundle.documents[selected.artifactRef]));
    if (!document || resolved.responseActions.filter(document => document.actions.some(action => action.id === selected.actionRef)).length !== 1) throw new Error('Native mapped action is unavailable or ambiguous');
    const action = resolveResponseAction(document, selected.actionRef).action;
    if (!action) throw new Error('Native mapped action is unavailable');
    const effect = action.effects?.length === 1 ? action.effects[0] : undefined;
    if (name !== 'paper' && effect?.type !== 'serviceRequest') throw new Error('Native role requires one declared service request');
    const role: QualifiedResponseActionRole = { ...selected, document, artifactDigest: await computeJcsSha256Digest(document),
      ...(effect?.type === 'serviceRequest' ? { requestRef: effect.requestRef } : {}) };
    const mapped = nativeSigningActionMappings(resolved, selected.actionRef, signingScope?.identity);
    if (['sign', 'submit', 'paper'].includes(name) && mapped.length !== 1) throw new Error('Native role requires one exact widget mapping');
    if (mapped.length) {
      if (mapped.length !== 1) throw new Error('Native widget action mapping is ambiguous');
      const { surface, route, slot, outputName, mapping } = mapped[0];
      const inputName = mapping.responseInput;
      const source = typeof inputName === 'string' ? record(record(record(slot.binding)?.dataBindings)?.[inputName]) : undefined;
      if (!source || !same({ catalogRef: source.catalogRef, sourceRef: source.sourceRef }, pins.bindings[inputName as string])) throw new Error('Native widget Response source differs from the admitted binding');
      role.responseSource = { inputName: inputName as string, catalogRef: source.catalogRef as string, sourceRef: source.sourceRef as string };
      role.widgetSource = { moduleId: record(slot.binding)?.moduleId as string, widgetName: record(slot.binding)?.widgetName as string,
        slotId: slot.id, outputName, route: { surfaceId: surface.id, surfaceRef: resolved.surfaceRefs?.get(surface),
          routeId: route.id, routeClass: route.routeClass, params: {} } };
    }
    result[name] = role;
  }
  // One Definition renderer publishes one exact Response Actions owner identity.
  if (Object.values(result).some(role => role.artifactRef !== result.saveInitial.artifactRef)) throw new Error('Native Definition controls require one Response Actions artifact');
  return result;
}
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function same(a: unknown, b: unknown) { return canonicalize(a) === canonicalize(b); }

async function handoffHash(response: Parameters<typeof responseHash>[0]): Promise<string> {
  return (await responseHash(response)).slice('sha256:'.length);
}
