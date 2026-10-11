import { NATIVE_SOURCE_OPERATION_MILLISECONDS } from './native-operation-budget.ts';
import { admitNativeHostEvents, type NativeHostEventCapability } from './native-host-events.ts';
import type { NativeStructuredPanelWidget } from '../config/native-package-signing.ts';
import { abortable } from './abortable.ts';
import { createNativeInitialDataSourceRuntime, type NativeInitialDataSourcePorts } from './native-initial-data-source.ts';
export type { NativeInitialDataSourcePorts } from './native-initial-data-source.ts';
import { createProtectedScreenerRoutes } from './protected-screener-routes.ts';
import { signingScopeAllows, type NativeSigningScopeIdentity } from './native-signing-scope.ts';
import { assertSynchronousGuard } from './synchronous-guard.ts';
import canonicalize from 'canonicalize';
import { createFormEngine, preactReactiveRuntime, type IFormEngine, type RegistryEntry } from '@formspec-org/engine/render';
import type { SemanticControlScope } from '@formspec-org/react';
import { captureResponseFieldMetadata, composeSurfaceApp, matchRoute, routeHref, createThemeAuthority, createWidgetRegistry, dataSourceAvailableToWidget, dereferenceBundleExport, flattenRegistryEntries, planMatchedRoute, resolveDataSourceDescriptor, type BundleExport, type DataSourceDescriptor, type SlotPlan, type SurfaceStaticAssetResolver } from '@formspec-org/surface';
import { RESPONSE_REVIEW_WIDGET_SHAPE, SIGNING_CEREMONY_WIDGET_SHAPE, responseReviewHash, starterWidgetModule, type ResponseReviewData, type ResponseReviewOptions, type ResponseReviewState } from '@formspec-org/surface-react';
import { targetDefinitionMatches, type FormDefinition, type FormResponse, type LocaleDocument, type ScreenerDocument, type ValidationReport } from '@formspec-org/types';
import type { AttachmentStore } from '../ports/attachment-store.ts';
import type { DraftKey } from '../ports/draft-store.ts';
import type { RespondentOwnedRuntimeInput, RespondentOwnedRuntime, RespondentSubmittedRuntimeInput } from '../app/RespondentRuntime.tsx';
import { createResponseActionController, type ResponseActionControllerConfig, type ResponseActionControllerSnapshot } from './response-action-controller.ts';
import { createFrozenHostStateDataSourceRuntime } from './frozen-host-state-data.ts';
import { createNativeScreenerCoordinator, type NativeScreenerCoordinatorConfig } from './native-screener-coordinator.ts';
import { createEvaluationInstanceResolver } from './evaluation-instance-resolver.ts';
import { replaceNativeFormEngine } from './native-engine-replacement.ts';
import { computeJcsSha256Digest } from '../adapters/http/response-action-ledger.ts';
import type { HydratedEvaluationCandidate, SavedCandidateHydration } from '../ports/evaluation-hydration.ts';
import type { SavedResponseDraft } from '../ports/response-signing.ts';
import { generateIdempotencyKey } from './idempotency-key.ts';

export type NativeInitialDataSourceFactory = (context: {
  readonly bundle: ReturnType<typeof dereferenceBundleExport>;
  /** Exact admitted export, including Component and every manifested document family. */
  readonly bundleExport: BundleExport;
  readonly definition: FormDefinition;
  readonly publication: { readonly formId: string; readonly formVersionId: string };
  readonly sessionGeneration: string;
  readonly assertCurrent: () => void;
}) => NativeInitialDataSourcePorts;

export interface NativePackageSigningHostPolicy {
  bundle: BundleExport;
  moduleId: string;
  signingScope?: NativeSigningScopeIdentity;
  /** Explicit deployment module pins; omission preserves the single signing-module host. */
  modules?: readonly { id: string; version: string }[];
  structuredPanelWidgets?: readonly NativeStructuredPanelWidget[];
  staticAssets?: readonly { kind: 'image'; source: string }[];
  definition: FormDefinition;
  registryEntries: readonly RegistryEntry[];
  locales: readonly LocaleDocument[];
  controller: Omit<ResponseActionControllerConfig, 'context' | 'restoredResponse' | 'validateFrozenResponse' | 'reviewReady' | 'signingContext' | 'buildHandoff'>;
  buildHandoff?: (response: FormResponse, report: ValidationReport,
    context: Pick<RespondentOwnedRuntimeInput, 'draftKey' | 'claim'>) => ReturnType<NonNullable<ResponseActionControllerConfig['buildHandoff']>>;
  publication: { formId: string; formVersionId: string };
  responseId?: string;
  initialLocale: string;
  clearDraftAccess: (key: DraftKey) => Promise<void>;
  /** Qualified host pins; this function must not derive pins from widget input. */
  signingContext: (locale: string) => ReturnType<ResponseActionControllerConfig['signingContext']>;
  semanticScope: (responseId: string, renderInstance: number) => SemanticControlScope;
  applicationReadiness?: { instance: string; canStartPath: string; startedPath: string; persistentSavingPath: string };
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
  /** Explicit trusted native policy. Omission preserves the existing host behavior. */
  nativeScreener?: NativeScreenerCoordinatorConfig;
  /** Trusted external pre-mount sources; business/scenario values remain outside Web. */
  initialDataSources?: NativeInitialDataSourceFactory;
  hostEvents?: readonly NativeHostEventCapability[];
  /** Trusted host policy; allowedTargets alone does not grant or restrict route access. */
  /** Explicit checked saved-candidate source; cannot substitute for entry Screener evidence. */
  candidateHydration?: SavedCandidateHydration;
  screenerEntryGate?: { readonly protectedTargets: readonly string[] };
}

/** One host session survives form-route unmount. Renderer leases never own the ceremony. */
export function createNativePackageSigningHost(policy: NativePackageSigningHostPolicy) {
  if (policy.nativeScreener && policy.candidateHydration) throw new Error('native-candidate-hydration-selection-ambiguous');
  const selectedHydration = policy.candidateHydration;
  policy = { ...policy, candidateHydration: selectedHydration ? Object.freeze({
    qualifySaved: selectedHydration.qualifySaved.bind(selectedHydration),
    retireFacts: selectedHydration.retireFacts.bind(selectedHydration),
    dispose: selectedHydration.dispose.bind(selectedHydration),
  }) : undefined, screenerEntryGate: policy.screenerEntryGate ? structuredClone(policy.screenerEntryGate) : undefined, signingScope: policy.signingScope ? structuredClone(policy.signingScope) : undefined, modules: structuredClone(policy.modules), structuredPanelWidgets: structuredClone(policy.structuredPanelWidgets), staticAssets: structuredClone(policy.staticAssets), bundle: structuredClone(policy.bundle), definition: structuredClone(policy.definition),
    registryEntries: structuredClone(policy.registryEntries), locales: structuredClone(policy.locales), bindings: structuredClone(policy.bindings),
    applicationReadiness: structuredClone(policy.applicationReadiness), readiness: structuredClone(policy.readiness), publication: structuredClone(policy.publication),
    nativeScreener: policy.nativeScreener ? Object.freeze({ ...policy.nativeScreener }) : undefined,
    controller: { ...policy.controller, roles: structuredClone(policy.controller.roles) } };
  freezeMetadata(policy.structuredPanelWidgets); freezeMetadata(policy.modules); freezeMetadata(policy.staticAssets); freezeMetadata(policy.bundle); freezeMetadata(policy.definition); freezeMetadata(policy.registryEntries); freezeMetadata(policy.locales);
  freezeMetadata(policy.signingScope); freezeMetadata(policy.screenerEntryGate);
  freezeMetadata(policy.bindings); freezeMetadata(policy.readiness); freezeMetadata(policy.publication); freezeMetadata(policy.controller.roles);
  const bundle = dereferenceBundleExport(policy.bundle);
  const flattened = flattenRegistryEntries(bundle.registries);
  const loadedLocales = Object.values(policy.bundle.documents).filter(document => !!document && typeof document === 'object' && '$formspecLocale' in document);
  const selectedDefinitions = policy.bundle.manifest.definitions?.filter(reference => reference.url === policy.definition.url) ?? [];
  if (selectedDefinitions.length !== 1
    || selectedDefinitions[0].version !== undefined && selectedDefinitions[0].version !== policy.definition.version
    || !same(bundle.definitions.get(policy.definition.url), policy.definition)
    || flattened.diagnostics.length || !same(flattened.entries, policy.registryEntries)
    || loadedLocales.length !== policy.locales.length || policy.locales.some(document => loadedLocales.filter(loaded => same(loaded, document)).length !== 1)
    || !policy.bundle.manifest.modules?.some(module => module.id === policy.moduleId && module.version === '0.1.0')) throw new Error('native-resource-unadmitted');
  const modulePins = policy.modules ?? [{ id: policy.moduleId, version: '0.1.0' }];
  if (!modulePins.length || new Set(modulePins.map(module => module.id)).size !== modulePins.length
    || !modulePins.some(module => module.id === policy.moduleId)
    || policy.modules && policy.bundle.manifest.modules?.length !== modulePins.length
    || modulePins.some(pin => policy.bundle.manifest.modules?.filter(module => same(module, pin)).length !== 1)) throw new Error('native-resource-unadmitted');
  const panelPins = policy.structuredPanelWidgets ?? [];
  if (policy.structuredPanelWidgets && (!panelPins.length || new Set(panelPins.map(pin => pin.moduleId)).size !== panelPins.length
    || panelPins.some(pin => !modulePins.some(module => module.id === pin.moduleId)
      || !['0.1.0', '0.1.1'].includes(pin.registryEntryVersion)))) throw new Error('native-resource-unadmitted');
  const panelVersions = new Map(panelPins.map(pin => [pin.moduleId, pin.registryEntryVersion]));
  const registerModules = (review?: ResponseReviewOptions) => modulePins.map(module => starterWidgetModule(module.id, {
    ...(module.id === policy.moduleId && review ? { responseReview: review } : {}),
    ...(panelVersions.has(module.id) ? {
      structuredPanelRegistryEntryVersion: panelVersions.get(module.id),
    } : {}),
  }));
  const widgets = createWidgetRegistry({ registryEntries: flattened.entries, modules: registerModules() });
  const app = composeSurfaceApp(bundle.surfaces, { entrySurface: bundle.entrySurface });
  const staticAssetResolver: SurfaceStaticAssetResolver | undefined = policy.staticAssets ? request => {
    if (request.kind !== 'image' || !policy.staticAssets!.some(pin => pin.kind === request.kind && pin.source === request.source)) return { status: 'refused' };
    let url: URL;
    try { url = new URL(request.source); } catch { return { status: 'refused' }; }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return { status: 'refused' };
    const declared = app.routes.some(handle => handle.surfaceId === request.site.surfaceId && handle.routeId === request.site.routeId
      && handle.route.slots?.some(slot => slot.id === request.site.slotId && slot.slotType === 'static-content'
        && 'kind' in slot.binding && slot.binding.kind === request.kind
        && 'content' in slot.binding && slot.binding.content === request.source));
    return declared ? { status: 'admitted', source: request.source } : { status: 'refused' };
  } : undefined;
  const initialDataSites: { descriptor: DataSourceDescriptor; handle: typeof app.routes[number]; slotId: string; definitionRef: string }[] = [];
  const requiredHostRoutes = new Set<typeof app.routes[number]>();
  const supportedEntryRoutes = new Set<typeof app.routes[number]>();
  const entryScreenerSlots: Extract<SlotPlan<unknown>, { slotType: 'screener' }>[] = [];
  const screenerRoutes = new Map<typeof app.routes[number], readonly ScreenerDocument[]>();
  const signedReviewRoutes = new Set<typeof app.routes[number]>();
  const submitSource = policy.controller.roles.submit?.widgetSource;
  for (const handle of app.routes) {
    const plan = planMatchedRoute({ handle, app, definitions: bundle.definitions, experiences: bundle.experiences,
      registryEntries: flattened.entries, widgets, dataSources: bundle.dataSources, mappings: bundle.mappings, surfaceRef: bundle.surfaceRefs?.get(handle.surface),
      responseActions: bundle.responseActions, themeAuthority: createThemeAuthority({ tenantTheme: bundle.tenantTheme }),
      staticAssetResolver, screenerHandles: bundle.screenerHandles,
      hasExecutor: true, hasWidgetActionExecutor: true });
    if (plan.slots.some(slot => slot.slotType === 'embed-route'
      && [...walkAdmittedSlots(slot.slots)].some(child => child.slotType === 'definition-form'))) {
      throw new Error('native-embedded-form-unsupported');
    }
    const slots = [...walkAdmittedSlots(plan.slots)];
    for (const slot of slots) {
      if (slot.slotType !== 'definition-form' || !slot.initialData) continue;
      if (slot.status !== 'ready' || !slot.definition || slot.initialData.status !== 'ready') throw new Error('native-initial-data-binding-unavailable');
      initialDataSites.push({ descriptor: slot.initialData.descriptor, handle, slotId: slot.slotId, definitionRef: slot.definition.url });
    }
    if (submitSource && handle.surfaceId === submitSource.route.surfaceId
      && bundle.surfaceRefs?.get(handle.surface) === submitSource.route.surfaceRef
      && handle.routeId === submitSource.route.routeId && handle.route.routeClass === submitSource.route.routeClass
      && slots.some(slot => slot.slotType === 'module-widget' && slot.slotId === submitSource.slotId
        && slot.key.moduleId === submitSource.moduleId && slot.key.widgetName === submitSource.widgetName
        && slot.actionOutputs.some(output => output.name === submitSource.outputName
          && output.actionRef === policy.controller.roles.submit?.actionRef && !!output.action))) signedReviewRoutes.add(handle);
    if (slots.some(slot => slot.slotType === 'module-widget' && slot.dataInputs.some(input => input.required && input.descriptor?.source.kind === 'host-state'))) requiredHostRoutes.add(handle);
    if (handle === app.entry) entryScreenerSlots.push(...slots.filter((slot): slot is Extract<SlotPlan<unknown>, { slotType: 'screener' }> => slot.slotType === 'screener'));
    const screeners = slots.flatMap(slot => slot.slotType === 'screener' && slot.status === 'ready' && slot.screener ? [slot.screener.document] : []);
    if (screeners.length && !slots.some(slot => slot.slotType === 'definition-form' || slot.slotType === 'module-widget')) screenerRoutes.set(handle, Object.freeze(screeners));
    if (slots.some(slot => (slot.slotType === 'definition-form' || slot.slotType === 'screener') && slot.status === 'ready')) supportedEntryRoutes.add(handle);
    for (const slot of slots) {
      if (slot.slotType !== 'module-widget') continue;
      if (slot.resolution.status !== 'resolved' || !slot.resolution.declared) throw new Error('native-widget-unadmitted');
      if (slot.key.moduleId !== policy.moduleId) continue;
      const shape = slot.key.widgetName === SIGNING_CEREMONY_WIDGET_SHAPE.widgetName ? SIGNING_CEREMONY_WIDGET_SHAPE
        : slot.key.widgetName === RESPONSE_REVIEW_WIDGET_SHAPE.widgetName ? RESPONSE_REVIEW_WIDGET_SHAPE : undefined;
      if (!shape || !same(slot.resolution.entry?.widgetShape, shape)) throw new Error('native-widget-shape-unadmitted');
    }
  }
  if (initialDataSites.length && !policy.initialDataSources) throw new Error('native-initial-data-source-capability-unavailable');
  if (entryScreenerSlots.length && (!policy.nativeScreener || !policy.screenerEntryGate)) throw new Error('native-entry-screener-completion-unavailable');
  if (!!policy.applicationReadiness !== !!policy.controller.applicationLifecycle || !!policy.applicationReadiness !== !!policy.controller.roles.startApplication
    || policy.controller.applicationLifecycle && policy.controller.applicationLifecycle.capabilities.formVersionId !== policy.publication.formVersionId) throw new Error('native-application-policy-unadmitted');
  if (policy.applicationReadiness) {
    const paths = policy.applicationReadiness; const scratch = policy.definition.instances?.[paths.instance];
    if (scratch?.readonly !== false || [paths.canStartPath, paths.startedPath, paths.persistentSavingPath].some(path => atPath(scratch.data, path) !== false)
      || new Set([paths.canStartPath, paths.startedPath, paths.persistentSavingPath]).size !== 3
      || (paths.instance === policy.readiness.instance && [paths.canStartPath, paths.startedPath, paths.persistentSavingPath].some(path => [policy.readiness.readyPath, policy.readiness.ownedPath].includes(path)))) throw new Error('native-application-readiness-unadmitted');
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
  const hostEvents = admitNativeHostEvents({ documents: policy.bundle.documents, definitionUrl: policy.definition.url,
    controllerActions: Object.values(policy.controller.roles).filter(value => value !== undefined), capabilities: policy.hostEvents });
  const catalogs = bundle.dataSources ?? [];
  const entries = Object.entries(policy.bindings).map(([name, binding]) => {
    const descriptor = resolveDataSourceDescriptor(catalogs, binding);
    const producer = ['definition', 'presentation'].includes(name) ? 'admitted-response-review' : 'admitted-signing-cohort';
    if (!descriptor || descriptor.source.runtime.provenance.source !== `${producer}:${name}`) throw new Error('native-source-unadmitted');
    return { name, descriptor };
  });
  if (initialDataSites.some(site => entries.some(entry => site.descriptor.catalogRef === entry.descriptor.catalogRef
    && site.descriptor.sourceRef === entry.descriptor.sourceRef))) throw new Error('native-initial-data-source-ownership-ambiguous');
  let application: ResponseActionControllerSnapshot['application'];
  let applicationLookup: ResponseActionControllerSnapshot['applicationLookup'];
  let checkpointState: 'unsaved' | 'saving' | 'saved' | 'failed' = 'unsaved';
  let pendingCheckpoint = false;
  const applicationFlags = () => {
    const paths = policy.applicationReadiness; const capabilities = policy.controller.applicationLifecycle?.capabilities;
    if (!rendererEngine || !paths || !capabilities) return;
    rendererEngine.setInstanceValue(paths.instance, paths.canStartPath, capabilities.earlyCaseCreation && !applicationLookup);
    rendererEngine.setInstanceValue(paths.instance, paths.startedPath, !!application);
    rendererEngine.setInstanceValue(paths.instance, paths.persistentSavingPath, capabilities.persistentSaving);
  };
  let controller: ReturnType<typeof createResponseActionController> | undefined;
  let input: RespondentOwnedRuntimeInput | undefined;
  let rendererEngine: IFormEngine | undefined;
  let rendererLease: { active: boolean; exchange: RespondentOwnedRuntimeInput['exchangeEngine']; rebind: (engine: IFormEngine) => void } | undefined;
  let nativeLifetime = new AbortController();
  let nativeStage: AbortController | undefined;
  let qualificationSequence = 0;
  let nativeReadiness: 'pending' | 'ready' | 'needs-save' | undefined = policy.nativeScreener || policy.candidateHydration ? 'pending' : undefined;
  let nativeCandidate: { saved: SavedResponseDraft; facts: HydratedEvaluationCandidate } | undefined;

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
  let reviewValidation: ValidationReport | undefined;
  let publicSnapshot: ResponseActionControllerSnapshot | undefined;
  // Ownership survives retiring candidate evidence after edits. This detached
  // snapshot selects the owned branch only; the cohort requalifies its handle.
  let ownedResponseSeed: FormResponse | undefined;
  let deliveryIdentity: string | undefined;
  let pendingDelivery: Promise<void> | undefined;
  let submitted: { referenceNumber: string; recordKind: 'response' } | undefined;
  let submittedKey: DraftKey | undefined;
  const listeners = new Set<() => void>();
  const reads = new Set<AbortController>();
  const sourceRevisions = new Map<string, { value: string; revision: number }>();
  const engineFactory = policy.createEngine ?? createFormEngine;
  const screener = policy.nativeScreener ? createNativeScreenerCoordinator({ ...policy.nativeScreener, routeContext: policy.nativeScreener.context, onRouteChange: () => emit(), context: () => {
    const parent = policy.nativeScreener!.context(); const expectedAuthority = authorityGeneration;
    const expectedVisit = visitEpoch; const lease = rendererLease; const lifetime = nativeLifetime; const expectedSequence = qualificationSequence;
    return { identity: parent.identity, signal: AbortSignal.any([parent.signal, lifetime.signal, ...(nativeStage ? [nativeStage.signal] : [])]), assertCurrent: () => {
      parent.signal.throwIfAborted(); assertSynchronousGuard(parent.assertCurrent.bind(parent)); lifetime.signal.throwIfAborted();
      if (disposed || cleared || expectedSequence !== qualificationSequence || expectedAuthority !== authorityGeneration || expectedVisit !== visitEpoch
        || lease && (!lease.active || rendererLease !== lease)) throw new Error('native-facts-context-retired');
    } };
  } }) : undefined;
  const native = screener ?? policy.candidateHydration;
  const qualifySaved = (saved: SavedResponseDraft, assertCurrent: () => void) => screener
    ? screener.qualifySaved(saved, assertCurrent)
    : policy.candidateHydration!.qualifySaved(saved, { signal: AbortSignal.any([nativeLifetime.signal,
      ...(nativeStage ? [nativeStage.signal] : [])]), assertCurrent });
  const entrySlot = entryScreenerSlots[0];
  if (entryScreenerSlots.length > 1 || entrySlot && (entrySlot.status !== 'ready' || !entrySlot.screener)) throw new Error('native-entry-screener-unavailable');
  const protectedScreenerRoutes = entrySlot ? createProtectedScreenerRoutes({ allowedTargets: entrySlot.allowedTargets,
    protectedTargets: policy.screenerEntryGate!.protectedTargets,
    resolve: target => app.routes.filter(handle => `surface:${handle.routeId}` === target && !handle.pathCollides && !routeHref(handle).refusal),
    accepted: target => !!screener?.routeAllowed(target, entrySlot.screener!.document) }) : undefined;
  const unavailableSources = () => ({ status: 'unavailable' as const, reason: 'native-facts-pending' });
  function retireNative() {
    controller?.retireSignRetry();
    qualificationSequence++; nativeStage?.abort(); nativeStage = undefined;
    nativeLifetime.abort(); nativeLifetime = new AbortController(); native?.retireFacts();
    nativeCandidate = undefined; if (native) { nativeReadiness = 'pending'; fence(); emit(); }
  }
  async function exactFacts(response: FormResponse, expected: SavedResponseDraft | undefined) {
    const candidate = nativeCandidate;
    if (!candidate || !expected || !same(candidate.saved.draft, expected.draft) || !same(candidate.saved.actor, expected.actor)
      || candidate.facts.view.draftId !== expected.draft.id || candidate.facts.view.draftVersion !== expected.draft.version
      || !same(candidate.saved.response, response)
      || candidate.facts.view.candidateHash !== await computeJcsSha256Digest(response)) throw new Error('native-facts-candidate-mismatch');
    candidate.facts.assertReady(); return candidate.facts;
  }
  async function qualifyCommitted(saved: SavedResponseDraft, caller?: { signal: AbortSignal; assertCurrent: () => void }) {
    if (!native) return;
    const sequence = ++qualificationSequence; nativeStage?.abort();
    nativeReadiness = 'pending'; nativeCandidate = undefined; fence(); emit();
    const lease = rendererLease; const old = rendererEngine;
    const stage = new AbortController(); nativeStage = stage;
    const timer = setTimeout(() => stage.abort(new Error('native-facts-deadline')), NATIVE_SOURCE_OPERATION_MILLISECONDS);
    const expectedAuthority = authorityGeneration; const expectedVisit = visitEpoch;
    const assertCurrent = () => {
      stage.signal.throwIfAborted(); caller?.signal.throwIfAborted(); caller?.assertCurrent();
      if (disposed || cleared || sequence !== qualificationSequence || expectedAuthority !== authorityGeneration || expectedVisit !== visitEpoch
        || lease && (!lease.active || rendererLease !== lease)) throw new Error('native-facts-context-retired');
    };
    try {
      const facts = await abortable(AbortSignal.any([stage.signal, ...(caller ? [caller.signal] : [])]), qualifySaved(saved, assertCurrent)); assertCurrent();
      if (!await installFacts(facts, saved, old, lease, AbortSignal.any([stage.signal, nativeLifetime.signal, ...(caller ? [caller.signal] : [])]), assertCurrent)) {
        nativeReadiness = 'needs-save'; emit(); return;
      }
      nativeCandidate = { saved: structuredClone(saved), facts };
      facts.assertReady(); nativeReadiness = 'ready';
      if (publicSnapshot?.prepared || publicSnapshot?.signed) await delivery(publicSnapshot);
    } catch { if (sequence === qualificationSequence && expectedAuthority === authorityGeneration && expectedVisit === visitEpoch && !disposed) nativeReadiness = 'pending'; }
    finally { clearTimeout(timer); emit(); }
  }
  async function installFacts(facts: HydratedEvaluationCandidate, saved: SavedResponseDraft,
    old: typeof rendererEngine, lease: typeof rendererLease, signal: AbortSignal, assertCurrent: () => void): Promise<boolean> {
    if (!old || !lease?.active) return true;
    if (!lease.exchange) throw new Error('native-renderer-exchange-unavailable');
    const replacement = await replaceNativeFormEngine({ currentEngine: old,
      engineOptions: { registryEntries: [...policy.registryEntries], instanceSourceResolver: createEvaluationInstanceResolver(facts) },
      localeDocuments: policy.locales, signal, assertCurrent: facts.assertCurrent, createEngine: engineFactory });
    if (replacement.status !== 'replaced') throw new Error('native-renderer-replacement-unsupported');
    try {
      assertCurrent();
      await lease.exchange({ expected: old, engine: replacement.engine, adopt: replacement.adopt, signal,
        assertCurrent: () => { assertCurrent(); facts.assertCurrent(); } });
      assertCurrent(); lease.rebind(replacement.engine);
    } catch (error) { replacement.dispose(); throw error; }
    return same(replacement.engine.getResponse({ profile: 'off' }).data, saved.response.data);
  }
  let reviewedRefresh: { identity: string; promise: Promise<void> } | undefined;
  async function refreshReviewedFacts(saved: SavedResponseDraft) {
    if (!native) return;
    // Refresh belongs to this explicit action and exact completed review. It is
    // never started by expiry, rendering, or a background timer.
    const capturedReview = review; const capturedState = reviewState; const previous = nativeCandidate;
    const lease = rendererLease; const old = rendererEngine;
    const authority = authorityGeneration; const visit = visitEpoch; const selectedLocale = locale; const deliveryGeneration = generation;
    if (!input || !capturedReview || !reviewValidation || capturedState?.status !== 'ready' || !previous
      || !same(previous.saved, saved) || !same(capturedReview.response, saved.response)) throw new Error('native-review-refresh-unready');
    const identity = canonicalize({ saved, authority, visit, selectedLocale, deliveryGeneration, reviewIdentity: capturedState.contextIdentity })!;
    if (reviewedRefresh) {
      if (reviewedRefresh.identity !== identity) throw new Error('native-review-refresh-conflict');
      return reviewedRefresh.promise;
    }
    const capturedValidation = structuredClone(reviewValidation);
    const sequence = ++qualificationSequence; nativeStage?.abort();
    const stage = new AbortController(); nativeStage = stage;
    const signal = AbortSignal.any([stage.signal, nativeLifetime.signal]);
    const checkAuthority = () => {
      signal.throwIfAborted();
      if (disposed || cleared || authorityGeneration !== authority || visitEpoch !== visit || locale !== selectedLocale
        || sequence !== qualificationSequence || rendererLease !== lease || lease && !lease.active
        || !same(publicSnapshot?.signed ?? publicSnapshot?.prepared, saved)) throw new Error('native-review-refresh-retired');
      policy.assertOwner(input!.draftKey, saved.actor.id);
    };
    const check = () => {
      checkAuthority();
      if (generation !== deliveryGeneration || review !== capturedReview || reviewState !== capturedState) throw new Error('native-review-refresh-retired');
    };
    check(); nativeReadiness = 'pending'; emit();
    const timer = setTimeout(() => stage.abort(new Error('native-facts-deadline')), NATIVE_SOURCE_OPERATION_MILLISECONDS);
    const promise = (async () => {
      try {
        const facts = await abortable(signal, qualifySaved(saved, checkAuthority)); check(); facts.assertReady();
        const outputs = await isolated(saved.response, selectedLocale, engine => ({
          fields: captureFields(engine, saved.response), validationReport: engine.getValidationReport({ profile: 'on-submit' }),
        }), saved, facts) as { fields: ResponseReviewData['presentation']['fields']; validationReport: ValidationReport };
        check();
        const unchanged = same(outputs.fields, capturedReview.presentation.fields) && same(validationMeaning(outputs.validationReport), validationMeaning(capturedValidation));
        if (!await installFacts(facts, saved, old, lease, signal, check)) throw new Error('native-isolated-candidate-changed');
        check(); facts.assertReady();
        nativeCandidate = { saved: structuredClone(saved), facts }; nativeReadiness = 'ready';
        if (!unchanged) {
          await delivery(publicSnapshot!);
          throw new Error('native-review-renewed-assent-required');
        }
        // The full primary Response, captured public review and validation gates
        // remain exact. Source proof provenance renews under separate guards.
        emit();
      } catch (error) {
        if (sequence === qualificationSequence && authority === authorityGeneration && visit === visitEpoch
          && !disposed && nativeReadiness !== 'ready') {
          nativeCandidate = undefined; nativeReadiness = 'pending'; fence(); emit();
        }
        throw error;
      } finally { clearTimeout(timer); }
    })();
    reviewedRefresh = { identity, promise };
    try { await promise; } finally { if (reviewedRefresh?.promise === promise) reviewedRefresh = undefined; }
  }
  const applicationStatus = (): Pick<ResponseActionControllerSnapshot, 'application' | 'applicationLookup'> => ({
    ...(application ? { application } : {}), ...(applicationLookup ? { applicationLookup } : {}) });
  const checkpointStatus = (): { checkpointState?: 'unsaved' | 'saving' | 'saved' | 'failed' } => policy.controller.applicationLifecycle ? { checkpointState } : {};
  const nativeStatus = (): { nativeReadiness?: 'pending' | 'ready' | 'needs-save' } => native ? { nativeReadiness } : {};
  let hostSnapshot = { ...checkpointStatus(), ...applicationStatus(), ...nativeStatus(), generation, sessionGeneration: authorityGeneration, locale, formTitle, cleared, editableSessionActive: !!rendererEngine && !disposed && !cleared, controller: publicSnapshot, runtime, submitted };
  const emit = () => { hostSnapshot = Object.freeze({ ...checkpointStatus(), ...applicationStatus(), ...nativeStatus(), generation, sessionGeneration: authorityGeneration, locale, formTitle, cleared, editableSessionActive: !!rendererEngine && !disposed && !cleared, controller: publicSnapshot, runtime, submitted }); for (const listener of listeners) listener(); };
  function fence() {
    generation++; runtime = undefined; review = undefined; expectedReviewIdentity = undefined; reviewState = undefined; reviewValidation = undefined;
    for (const read of reads) read.abort();
    reads.clear();
  }
  function current(expected: number) { if (disposed || generation !== expected) throw new Error('native-context-obsolete'); }
  function stop(reason: Parameters<NativePackageSigningHostPolicy['invalidateAuthority']>[0]) {
    if (reason === 'clear' || reason === 'dispose') { application = undefined; applicationLookup = undefined; ownedResponseSeed = undefined; submitted = undefined; }
    retireNative();
    rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, false);
    authorityGeneration++; deliveryIdentity = undefined; fence(); controller?.invalidate(); policy.invalidateAuthority(reason, input ? structuredClone(input.draftKey) : submittedKey ? structuredClone(submittedKey) : undefined);
  }
  async function isolated(response: FormResponse, activeLocale: string, run: (engine: IFormEngine) => unknown, saved?: SavedResponseDraft, qualifiedFacts?: HydratedEvaluationCandidate) {
    const facts = native ? qualifiedFacts ?? await exactFacts(response, saved) : undefined;
    if (qualifiedFacts && (!saved || qualifiedFacts.view.draftId !== saved.draft.id
      || qualifiedFacts.view.draftVersion !== saved.draft.version || !same(response, saved.response)
      || qualifiedFacts.view.candidateHash !== await computeJcsSha256Digest(response))) throw new Error('native-gate-candidate-mismatch');
    facts?.assertReady();
    const expected = authorityGeneration; const visit = visitEpoch; const lifetime = nativeLifetime;
    const stage = new AbortController(); const timer = setTimeout(() => stage.abort(new Error('native-isolated-deadline')), 10_000);
    const signal = AbortSignal.any([stage.signal, lifetime.signal]);
    const check = () => { signal.throwIfAborted(); facts?.assertCurrent(); if (disposed || expected !== authorityGeneration || visit !== visitEpoch) throw new Error('native-isolated-retired'); };
    const engine = engineFactory(policy.definition, { registryEntries: [...policy.registryEntries], runtimeContext: { locale: activeLocale },
      responseData: response.data as Parameters<IFormEngine['loadResponseData']>[0],
      ...(native ? { instanceSourceResolver: facts ? createEvaluationInstanceResolver(facts) : unavailableSources } : {}) });
    try {
      for (const document of policy.locales) engine.loadLocale(document);
      engine.setLocale(activeLocale);
      await abortable(signal, engine.waitForInstanceSources()); check();
      await abortable(signal, engine.waitForRemoteOptions()); check();
      if (native && !same(engine.getResponse({ profile: 'off' }).data, response.data)) throw new Error('native-isolated-candidate-changed');
      return await run(engine);
    } finally { clearTimeout(timer); engine.dispose(); }
  }
  async function delivery(snapshot: ResponseActionControllerSnapshot) {
    const selected = snapshot.signed ?? snapshot.prepared;
    if (!selected || !input) return;
    fence(); const expected = generation;
    const phase = snapshot.signed ? 'before-submit' : 'before-sign';
    const capturedOutputs = await isolated(selected.response, locale, engine => ({ fields: captureFields(engine, selected.response),
      validationReport: engine.getValidationReport({ profile: 'on-submit' }) }), selected) as { fields: ResponseReviewData['presentation']['fields']; validationReport: ValidationReport };
    const fields = capturedOutputs.fields;
    current(expected); policy.assertOwner(input.draftKey, selected.actor.id);
    if (await policy.reviewResponseDigest(selected.response) !== selected.draft.responseHash) throw new Error('native-review-digest-profile-mismatch');
    const captured: ResponseReviewData = structuredClone({ definition: policy.definition, response: selected.response,
      presentation: { responseHash: selected.draft.responseHash, definitionUrl: selected.response.definitionUrl,
        definitionVersion: selected.response.definitionVersion, locale, actorRef: selected.actor.id,
        draft: { id: selected.draft.id, version: selected.draft.version }, phase, fields } });
    const identity = await responseReviewHash(captured); current(expected);
    review = captured; reviewValidation = structuredClone(capturedOutputs.validationReport); expectedReviewIdentity = identity;
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
    controller = createResponseActionController({ ...policy.controller, ...(native ? { afterCommittedDraft: qualifyCommitted, reconcileSignRetries: true } : {}), restoredApplication: application, restoredApplicationLookup: applicationLookup, restoredResponse: ownedResponseSeed,
      context: { definition: policy.definition, draftKey: input.draftKey, publication: policy.publication,
        responseId: responseId!, generation: String(expected) }, signingContext: () => policy.signingContext(locale),
      validateFrozenResponse: async (response, validationTuple) => {
        const selected = publicSnapshot?.signed ?? publicSnapshot?.prepared;
        if (native && selected && same(response, selected.response) && (reviewedRefresh || nativeCandidate?.facts.refreshRequired?.())) await refreshReviewedFacts(selected);
        const result = await isolated(response, locale, engine => ({ response, validationTuple,
          validationReport: engine.getValidationReport({ profile: validationTuple.profile }) }), publicSnapshot?.signed ?? publicSnapshot?.prepared);
        if (disposed || authorityGeneration !== expected) throw new Error('native-context-obsolete');
        return result as Awaited<ReturnType<ResponseActionControllerConfig['validateFrozenResponse']>>;
      },
      captureSubmitOptions: async signed => {
        if (!native) return {};
        const facts = await exactFacts(signed.response, signed);
        return facts.nativeCurrentCheck ? { nativeCurrentCheck: structuredClone(facts.nativeCurrentCheck) } : {};
      },
      buildHandoff: async response => {
        const report = await isolated(response, locale, engine => engine.getValidationReport({ profile: 'on-submit' }), publicSnapshot?.signed) as ValidationReport;
        if (disposed || authorityGeneration !== expected || !report.valid || report.definitionUrl !== response.definitionUrl
          || report.definitionVersion !== response.definitionVersion) throw new Error('native-handoff-validation-refused');
        if (!policy.buildHandoff) throw new Error('Intake handoff builder is unavailable');
        return policy.buildHandoff(response, report, structuredClone({ draftKey: input!.draftKey, claim: input!.claim }));
      },
      reviewReady: (context, stage) => {
        if (!review || !reviewState || reviewState.status !== 'ready' || reviewState.contextIdentity !== expectedReviewIdentity
          || !same(context.response, review.response) || !same(context.draft, { ...review.presentation.draft, responseHash: review.presentation.responseHash })
          || context.actor.id !== review.presentation.actorRef || context.locale !== locale
          || reviewState.phase !== (stage === 'signed' ? 'before-submit' : 'before-sign')) return false;
        if (native) { try { nativeCandidate?.facts.assertReady(); if (!nativeCandidate || !same(nativeCandidate.saved.response, context.response) || nativeReadiness !== 'ready') return false; } catch { return false; } }
      policy.assertOwner(input!.draftKey, context.actor.id); return true;
      },
    });
    publicSnapshot = controller.getSnapshot();
    rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.ownedPath, publicSnapshot.owned);
    unsubscribeController = controller.subscribe(() => {
      publicSnapshot = controller!.getSnapshot();
      application = publicSnapshot.application; applicationLookup = publicSnapshot.applicationLookup; applicationFlags();
      if (['saveInitial', 'saveOwned'].includes(publicSnapshot.phase) || publicSnapshot.phase === 'startApplication' && !publicSnapshot.owned) {
        pendingCheckpoint = true; checkpointState = 'saving';
      } else if (pendingCheckpoint) {
        if (publicSnapshot.saved && ['saved', 'startApplication'].includes(publicSnapshot.phase)) { checkpointState = 'saved'; pendingCheckpoint = false; }
        else if (['failed', 'refused'].includes(publicSnapshot.phase)) { checkpointState = 'failed'; pendingCheckpoint = false; }
      }
      if (authorityGeneration === expected && publicSnapshot.saved) { ownedResponseSeed = structuredClone(publicSnapshot.saved.response); freezeMetadata(ownedResponseSeed); }
      rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.ownedPath, publicSnapshot.owned);
      const selected = publicSnapshot.signed ?? publicSnapshot.prepared;
      const identity = selected ? canonicalize({ selected, locale, signed: !!publicSnapshot.signed }) : undefined;
      if (!native && selected && identity !== deliveryIdentity) {
        deliveryIdentity = identity;
        const producing = generation + 1;
        pendingDelivery = delivery(publicSnapshot);
        void pendingDelivery.catch(() => { if (generation === producing) { runtime = undefined; reviewState = undefined; emit(); } });
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
        const bytes = await policy.attachmentStore.read(request.descriptor, { signal: abort.signal, fieldPath: request.path });
        current(expected); if (visitEpoch !== expectedVisit) throw new Error('native-visit-retired'); policy.assertOwner(input.draftKey, request.presentation.actorRef);
        if (!review || !same(request.definition, review.definition) || !same(request.response, review.response)
          || !same(request.presentation, review.presentation) || !same(atPath(review.response.data, request.path), request.descriptor)) throw new Error('native-attachment-context-refused');
        if (abort.signal.aborted) throw new Error('native-attachment-aborted'); return bytes;
      } finally { reads.delete(abort); options.signal.removeEventListener('abort', cancel); }
    },
  };
  async function selectLocale(value: string) {
    if (submitted || publicSnapshot?.signed || publicSnapshot?.confirmation) throw new Error('native-locale-frozen');
    const matches = policy.locales.filter(document => document.locale.toLowerCase() === value.toLowerCase()
      && document.target.kind === 'definition' && targetDefinitionMatches(document.target, policy.definition));
    const selected = matches.length === 1 ? matches[0] : undefined;
    if (disposed || cleared || !input || !selected) throw new Error('native-locale-unavailable');
    value = selected.locale;
    checkpointState = 'unsaved';
    const saved = publicSnapshot?.saved?.response; stop('locale'); locale = value;
    rendererEngine?.setLocale(value); start(saved);
    rendererEngine?.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, true); emit();
  }
  const widgetModules = registerModules(reviewOptions); freezeMetadata(widgetModules);
  return {
    bundle, definition: policy.definition,
    ...(native ? { ...(screener ? { screenerCompletion: screener.completionPolicy } : {}), instanceSourceResolver: unavailableSources, retireCandidateAuthority: retireNative,
      preSignCandidate: async (input: Readonly<{ saved: SavedResponseDraft; operationId: string; assertCurrent: () => void }>) => {
        qualificationSequence++; nativeStage?.abort(); nativeStage = new AbortController();
        nativeReadiness = 'pending'; nativeCandidate = undefined;
        const facts = await qualifySaved(input.saved, input.assertCurrent);
        facts.assertReady();
        await isolated(input.saved.response, locale, () => undefined, input.saved, facts);
        facts.assertReady();
        return Object.freeze({ assertCurrent: facts.assertCurrent });
      },
      qualifyCurrentVisit: async () => { const saved = publicSnapshot?.saved; if (saved) await qualifyCommitted(saved); },
    } : {}), moduleId: policy.moduleId, widgetModules, ...(staticAssetResolver ? { staticAssetResolver } : {}),
    ...(policy.controller.applicationLifecycle ? { applicationCapabilities: policy.controller.applicationLifecycle.capabilities,
      async refreshApplication() {
        if (controller) return controller.refreshApplication();
        if (disposed || cleared || !submittedKey || (!application && !applicationLookup)) throw new Error('native-application-unavailable');
        const expected = authorityGeneration;
        const receipt = await policy.controller.applicationLifecycle!.load(submittedKey);
        if (disposed || cleared || authorityGeneration !== expected || application && (!receipt || receipt.caseLedgerId !== application.caseLedgerId
          || receipt.draftRef !== application.draftRef || application.status === 'submitted' && receipt.status !== 'submitted')) throw new Error('native-application-context-retired');
        application = receipt ? structuredClone(receipt) : undefined; applicationLookup = undefined; freezeMetadata(application); emit();
      } } : {}), reviewOptions, selectLocale,
    getStartupRoute(pathname: string): { entryHref: string; entryTitle?: string; requiresHostState: boolean; requiresScreener?: boolean; screenerDocuments?: readonly ScreenerDocument[]; signedReviewHref?: string; signedReviewTitle?: string } {
      const match = matchRoute(app, pathname).match;
      const entry = app.entry;
      if (!match || !entry || !supportedEntryRoutes.has(entry) || requiredHostRoutes.has(entry)) throw new Error('native-entry-route-unavailable');
      const destination = routeHref(entry);
      if (destination.refusal) throw new Error('native-entry-route-unavailable');
      const requiresScreener = protectedScreenerRoutes?.requiresScreening(match.handle) ?? false;
      let signedReviewHref: string | undefined;
      let signedReviewTitle: string | undefined;
      if (signedReviewRoutes.size === 1 && submitSource) {
        const review = [...signedReviewRoutes][0];
        const target = routeHref(review, submitSource.route.params);
        if (requiredHostRoutes.has(review) && !target.refusal && review !== match.handle) {
          signedReviewHref = target.href; signedReviewTitle = review.route.title;
        }
      }
      return { entryHref: destination.href, entryTitle: entry.route.title, requiresHostState: requiredHostRoutes.has(match.handle), requiresScreener, screenerDocuments: screenerRoutes.get(match.handle),
        signedReviewHref, signedReviewTitle };
    },
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
          ticket = ++visitEpoch; retireNative(); for (const read of reads) read.abort(); reads.clear();
        },
        dispose() { if (ticket === visitEpoch) { visitEpoch++; retireNative(); for (const read of reads) read.abort(); reads.clear(); } ticket = undefined; },
        bindRuntime() {
          const initial = createNativeInitialDataSourceRuntime({ sessionGeneration: marker, assertCurrent: assertVisit,
            sites: initialDataSites.map(site => ({ descriptor: site.descriptor, context: { surfaceId: site.handle.surfaceId,
              surfaceRef: bundle.surfaceRefs?.get(site.handle.surface), routeId: site.handle.routeId, slotId: site.slotId, definitionRef: site.definitionRef } })),
            createPorts: policy.initialDataSources ? () => policy.initialDataSources!({ bundle, bundleExport: policy.bundle, definition: policy.definition,
              publication: policy.publication, sessionGeneration: marker, assertCurrent: assertVisit }) : undefined });
          const requestFor = (request: Parameters<NonNullable<typeof runtime>['dataSourceLoader']>[0]) => {
            const delivery = runtime; const deliveryGeneration = generation;
            assertVisit(); current(deliveryGeneration);
            if (policy.signingScope && !signingScopeAllows(policy.signingScope, request.context)) throw new Error('native-signing-scope-unadmitted');
            if (request.context.sessionGeneration !== marker) throw new Error('native-visit-unqualified');
            return { delivery, request: { ...request, context: { ...request.context, sessionGeneration: deliveryGeneration } } };
          };
          return {
            ...(native ? { retrySigningResult: async () => {
              assertVisit();
              const authority = policy.nativeScreener!.context(); authority.signal.throwIfAborted();
              assertSynchronousGuard(authority.assertCurrent.bind(authority));
              const candidate = publicSnapshot?.prepared;
              if (!controller || !input || !candidate) throw new Error('native-sign-retry-unavailable');
              policy.assertOwner(input.draftKey, candidate.actor.id);
              const result = await controller.retrySign();
              // The durable result is already published; later retirement affects only this visit.
              try { assertVisit(); authority.signal.throwIfAborted(); assertSynchronousGuard(authority.assertCurrent.bind(authority)); }
              catch { retireNative(); }
              return result;
            } } : {}),
            authorizeDataSource: ((request) => {
              if (initial.owns(request)) return initial.authorizeDataSource(request);
              try { const captured = requestFor(request); return captured.delivery?.authorizeDataSource(captured.request) ?? { status: 'refused', reason: 'native-state-unavailable' }; }
              catch { return { status: 'refused', reason: 'native-visit-retired' }; }
            }) satisfies NonNullable<typeof runtime>['authorizeDataSource'],
            dataSourceLoader: ((request) => {
              if (initial.owns(request)) return initial.dataSourceLoader(request);
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
            validateDataSourcePayload: (request: Parameters<NativeInitialDataSourcePorts['validateDataSourcePayload']>[0]) => initial.owns(request)
              ? initial.validateDataSourcePayload(request) : policy.validatePayload(request),
            widgetActionExecutor: async (action: Parameters<NonNullable<typeof controller>['widgetExecutor']>[0]) => {
              assertVisit(); if (!controller) throw new Error('native-runtime-unavailable');
              if (policy.signingScope && (!signingScopeAllows(policy.signingScope, { ...action.source.route, slotId: action.source.slotId, moduleId: action.source.moduleId, widgetName: action.source.widgetName })
                || action.source.slotId !== policy.signingScope.ceremonySlot || action.source.moduleId !== policy.signingScope.moduleId
                || action.source.widgetName !== SIGNING_CEREMONY_WIDGET_SHAPE.widgetName)) throw new Error('native-signing-scope-unadmitted');
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
      application = next.state.application ? structuredClone(next.state.application) : undefined; freezeMetadata(application);
      applicationLookup = next.state.applicationLookup ? structuredClone(next.state.applicationLookup) : undefined; freezeMetadata(applicationLookup);
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
        restoredResponse: next.restoredResponse ? structuredClone(next.restoredResponse) : undefined,
        restoredSigning: next.restoredSigning ? structuredClone(next.restoredSigning) : undefined,
        restoredPendingSign: next.restoredPendingSign ? structuredClone(next.restoredPendingSign) : undefined, activeLocale: locale };
      if (!input) checkpointState = next.restoredResponse ? 'saved' : 'unsaved';
      if (!input && next.restoredApplication) { application = structuredClone(next.restoredApplication); freezeMetadata(application); }
      if (!input && next.restoredApplicationLookup) { applicationLookup = structuredClone(next.restoredApplicationLookup); freezeMetadata(applicationLookup); }
      input = next;
      freezeMetadata(input.draftKey); freezeMetadata(input.claim); freezeMetadata(input.restoredResponse);
      rendererEngine = next.engine;
      const title = next.engine.getFormVM().title.value;
      if (typeof title === 'string') formTitle = title;
      if (!controller) {
        start(next.restoredResponse);
        if (next.restoredPendingSign) await controller!.restorePending(next.restoredPendingSign, native && !next.restoredPendingSign.response.extensions?.['x-formspec-signing-content'] ? true : undefined);
        if (next.restoredSigning) {
          if (!same(next.restoredSigning.response, next.restoredResponse)) throw new Error('native-signed-restoration-mismatch');
          const expected = authorityGeneration;
          await controller!.restoreSigned(next.restoredSigning);
          await pendingDelivery;
          if (disposed || authorityGeneration !== expected || !native && !runtime) throw new Error('native-signed-restoration-retired');
        }
      }
      const scope = policy.semanticScope(responseId, ++renderInstance);
      if (scope.responseId !== responseId) throw new Error('native-response-scope-refused');
      applicationFlags();
      next.engine.setInstanceValue(policy.readiness.instance, policy.readiness.ownedPath, publicSnapshot!.owned);
      next.engine.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, true); emit();
      let active = true;
      let leasedEngine = next.engine;
      let release = () => {}; let releaseTitle = () => {};
      const lease = { active: true, exchange: next.exchangeEngine, rebind: (engine: IFormEngine) => {
        release(); releaseTitle(); leasedEngine = engine; rendererEngine = engine; bind(); applicationFlags();
        engine.setInstanceValue(policy.readiness.instance, policy.readiness.ownedPath, publicSnapshot!.owned);
        engine.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, true); emit();
      } };
      rendererLease = lease;
      function bind() {
        const watched = leasedEngine;
        const answers = () => canonicalize(watched.getFieldPaths().map(path => [path, watched.signals[path]?.value]));
        let previous = answers();
        releaseTitle = preactReactiveRuntime.effect(() => {
          if (!active || disposed || rendererEngine !== watched) return;
          const title = watched.getFormVM().title.value;
          if (typeof title === 'string' && title !== formTitle) { formTitle = title; emit(); }
        });
        release = preactReactiveRuntime.effect(() => {
          void watched.structureVersion.value;
          for (const path of watched.getFieldPaths()) void watched.signals[path]?.value;
          const value = answers();
          if (active && value !== previous) {
            previous = value; checkpointState = 'unsaved'; pendingCheckpoint = false; const saved = publicSnapshot?.saved?.response; stop('edit'); start(saved);
            watched.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, true); emit();
          }
        });
      }
      bind();
      return { responseActionInvoker: async action => {
        const expected = authorityGeneration; const expectedVisit = visitEpoch;
        if (!active || disposed) throw new Error('native-renderer-retired');
        if (native && action.actionRef === policy.controller.roles.prepare?.actionRef && nativeReadiness !== 'ready') throw new Error('native-facts-pending-save-required');
        const assertCurrent = () => {
          if (!active || disposed || cleared || authorityGeneration !== expected || visitEpoch !== expectedVisit || rendererLease !== lease) throw new Error('native-renderer-retired');
        };
        const refreshSavedFacts = async (lifetime: { signal: AbortSignal; assertCurrent: () => void }) => {
          lifetime.signal.throwIfAborted(); lifetime.assertCurrent(); assertCurrent();
          const saved = publicSnapshot?.saved;
          if (!native || !saved || checkpointState !== 'saved' || !same(leasedEngine.getResponse({ profile: 'off' }).data, saved.response.data))
            throw new Error('native-saved-facts-refresh-unavailable');
          const assertSavedCurrent = () => {
            lifetime.signal.throwIfAborted(); lifetime.assertCurrent(); assertCurrent();
            if (checkpointState !== 'saved' || !same(publicSnapshot?.saved, saved)
              || !same(leasedEngine.getResponse({ profile: 'off' }).data, saved.response.data)) throw new Error('native-saved-facts-context-retired');
            policy.assertOwner(saved.draftKey, saved.actor.id);
          };
          assertSavedCurrent();
          await qualifyCommitted(saved, { signal: lifetime.signal, assertCurrent: assertSavedCurrent }); assertSavedCurrent();
          if (!nativeCandidate || nativeReadiness !== 'ready' || !same(nativeCandidate.saved, saved)) throw new Error('native-saved-facts-refresh-unavailable');
          nativeCandidate.facts.assertReady();
        };
        const result = hostEvents.owns(action.document, action.actionRef)
          ? await hostEvents.invoke(action, { signal: nativeLifetime.signal, assertCurrent, refreshSavedFacts })
          : await controller!.definitionInvoker(action);
        if (!active || disposed || authorityGeneration !== expected) throw new Error('native-renderer-retired');
        return result;
      }, semanticControlScope: scope,
      ...(native ? { afterMount: async () => { const saved = publicSnapshot?.saved; if (saved && active) await qualifyCommitted(saved); } } : {}),
      getCompletionGeneration: () => authorityGeneration,
      invalidate: () => { if (active) { active = false; lease.active = false; stop('clear'); if (rendererEngine === leasedEngine) rendererEngine = undefined; emit(); } },
      dispose: () => {
        active = false; lease.active = false; release(); releaseTitle(); leasedEngine.setInstanceValue(policy.readiness.instance, policy.readiness.readyPath, false);
        if (rendererLease === lease) { rendererLease = undefined; retireNative(); }
        if (rendererEngine === leasedEngine) { rendererEngine = undefined; emit(); }
      } };

    },
    dispose() { if (disposed) return; disposed = true; stop('dispose'); native?.dispose(); emit(); unsubscribeController?.(); listeners.clear(); },
  };
}

function* walkAdmittedSlots<T>(slots: readonly SlotPlan<T>[]): Generator<SlotPlan<T>> {
  for (const slot of slots) {
    yield slot;
    if (slot.slotType === 'embed-route') yield* walkAdmittedSlots(slot.slots);
  }
}

export function captureFields(engine: IFormEngine, response: FormResponse): ResponseReviewData['presentation']['fields'] {
  return captureResponseFieldMetadata(engine.definition, response, {
    label(path) {
      const label = engine.getItemLabelSignal(path)?.value;
      if (typeof label !== 'string' || !label) throw new Error('native-review-label-unavailable');
      return label;
    },
    options(path) {
      const field = engine.getFieldVM(path);
      if (!field) throw new Error('native-review-field-unavailable');
      return field.options.value;
    },
  });
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

/** ValidationReport.timestamp records when validation ran, rather than its findings. */
function validationMeaning(report: ValidationReport) {
  const { timestamp: _validatedAt, ...findings } = report;
  return findings;
}
