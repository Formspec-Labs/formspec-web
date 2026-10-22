import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import canonicalize from 'canonicalize';
import { SurfaceApp, useSurfaceApp, deriveSurfaceRuntimeGeneration, renderDefaultDefinitionForm, type SurfaceAppProps, type SurfaceRouteTitleResolver } from '@formspec-org/surface-react';
import '@formspec-org/surface-react/formspec-surface.css';
import { targetDefinitionMatches, type ComponentDocument, type LocaleDocument } from '@formspec-org/types';
import type { ComponentRouteResolver } from '@formspec-org/app-graph';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type { NativePackageSigningHost } from '../shared/native-package-signing-host.ts';
import { RespondentDefinitionController, type ResolvedRespondentFormInput } from './RespondentRuntime.tsx';
import { SessionStatus } from './SessionStatus.tsx';

export interface NativePackageRespondentHostProps {
  host: NativePackageSigningHost;
  composition: Composition;
  config: FormspecWebConfig;
  componentDocument: ComponentDocument;
  componentRouteResolver: ComponentRouteResolver;
  localeDocuments: readonly LocaleDocument[];
  location: string;
  /** Presentation only; never restores or changes a saved response Locale. */
  screenerLocale?: string;
  screenerCompletion?: SurfaceAppProps['screenerCompletion'];
  onNavigate: SurfaceAppProps['onNavigate'];
  resolveNavigationHref?: SurfaceAppProps['resolveNavigationHref'];
}

/** Local qualified package rendering; policy and service authority remain host-owned. */
export function NativePackageRespondentHost(props: NativePackageRespondentHostProps) {
  const state = useSyncExternalStore(props.host.subscribe, props.host.getSnapshot, props.host.getSnapshot);
  const modules = props.host.widgetModules;
  const hasApplicantStatus = Boolean(state.applicantStatus);
  const hasPreparedOrSignedCeremony = Boolean(state.controller?.prepared || state.controller?.signed || state.runtime);
  const effectiveBundle = useMemo(() => {
    const original = props.host.bundle;
    let changed = false;
    const nextSurfaceRefs = original.surfaceRefs ? new Map(original.surfaceRefs) : undefined;
    let nextEntrySurface = original.entrySurface;
    const nextSurfaces = original.surfaces.map(surface => {
      let surfaceChanged = false;
      const nextRoutes = surface.routes.map(route => {
        const slots = route.slots ?? [];
        const hasDefinitionForm = slots.some(slot => slot.slotType === 'definition-form');
        const statusSlotId = props.host.applicantStatusSlot?.slotId ?? 'applicant-case-status';
        const statusModuleId = props.host.applicantStatusSlot?.moduleId ?? 'x-case-file-review';
        const filteredSlots = slots.filter(slot => {
          if (slot.slotType !== 'module-widget') return true;
          const moduleId = record(slot.binding)?.moduleId;
          if (slot.id === statusSlotId && moduleId === statusModuleId && !hasApplicantStatus) {
            return false;
          }
          if (hasDefinitionForm && moduleId === props.host.moduleId && !hasPreparedOrSignedCeremony) {
            return false;
          }
          return true;
        });
        if (filteredSlots.length === slots.length) return route;
        surfaceChanged = true;
        return { ...route, slots: filteredSlots as typeof route.slots };
      });
      if (!surfaceChanged) return surface;
      changed = true;
      const nextSurface: typeof surface = { ...surface, routes: nextRoutes as typeof surface.routes };
      const ref = original.surfaceRefs?.get(surface);
      if (nextSurfaceRefs && ref !== undefined) nextSurfaceRefs.set(nextSurface, ref);
      if (original.entrySurface === surface) nextEntrySurface = nextSurface;
      return nextSurface;
    });
    if (!changed) return original;
    return {
      ...original,
      surfaces: nextSurfaces,
      ...(nextEntrySurface ? { entrySurface: nextEntrySurface } : {}),
      ...(nextSurfaceRefs ? { surfaceRefs: nextSurfaceRefs } : {}),
    };
  }, [props.host.bundle, props.host.moduleId, hasApplicantStatus, hasPreparedOrSignedCeremony]);
  const model = useSurfaceApp({ bundle: effectiveBundle, widgetModules: modules });
  const sessionMarker = useMemo(() => props.host.allocateSurfaceSessionMarker(state.sessionGeneration), [props.host, props.location, state.sessionGeneration]);
  const marker = deriveSurfaceRuntimeGeneration({ app: model.app, location: props.location, sessionGeneration: sessionMarker });
  const visit = useMemo(() => props.host.createSurfaceVisit(marker, state.sessionGeneration), [props.host, marker, state.sessionGeneration]);
  useLayoutEffect(() => {
    if (state.cleared) return; visit.activate();
    return () => visit.dispose();
  }, [visit, state.cleared, props.host]);
  useEffect(() => {
    if (!state.cleared) void props.host.qualifyCurrentVisit?.().catch(() => {});
  }, [visit, state.cleared, props.host]);
  useEffect(() => {
    if (!state.cleared) props.host.syncApplicantStatus?.(props.composition.statusReader);
  }, [props.host, props.composition.statusReader, state.cleared, state.application?.caseLedgerId, state.application?.status, state.locale]);
  const ports = useMemo(() => visit.bindRuntime(), [visit]);
  const locales = useMemo(() => [...props.localeDocuments], [props.localeDocuments]);
  const definitionLocales = useMemo(() => new Map([...props.host.bundle.definitions.values()].map(definition => [definition.url,
    locales.filter(document => document.target.kind === 'definition' && targetDefinitionMatches(document.target, definition))])), [props.host, locales]);
  const forms = useMemo(() => new Map<string, { form: ResolvedRespondentFormInput; completed: ResolvedRespondentFormInput['onActionCompleted'] }>(), [props.host, props.componentDocument, locales]);
  const renderDefinitionForm: NonNullable<SurfaceAppProps['renderDefinitionForm']> = useCallback(slot => {
    const refs = props.host.bundle.manifest.surfaces?.filter(ref => ref.url === slot.route.surfaceRef) ?? [];
    const selected = props.componentRouteResolver({ surface: { url: slot.route.surfaceRef ?? '', version: refs.length === 1 ? refs[0].version ?? '' : '' },
      route: slot.route.routeId, slot: slot.plan.slotId, role: 'slot', definition: { url: slot.plan.definition.url, version: slot.plan.definition.version } });
    if (selected.status !== 'ready') return <p role="alert" data-probe="slot-unavailable">This form's Component is unavailable: {selected.reason}</p>;
    const componentDocument = selected.component.document as ComponentDocument;
    const slotLocales = definitionLocales.get(slot.plan.definition.url) ?? [];
    if (canonicalize(slot.plan.definition) !== canonicalize(props.host.definition)
      || canonicalize(componentDocument) !== canonicalize(props.componentDocument)) {
      const key = canonicalize({ route: slot.route, slot: slot.plan.slotId, definition: slot.plan.definition, componentDocument, locales: slotLocales })!;
      return <Fragment key={key}>{renderDefaultDefinitionForm({ ...slot, componentDocument, localeDocuments: slotLocales,
        activeLocale: state.locale || undefined })}</Fragment>;
    }
    const responseActionsDocument = filterAutoPlacedFormActions(slot.responseActionsDocument, componentDocument, props.host);
    const key = canonicalize({ definition: slot.plan.definition, theme: slot.grant.themeDocument,
      registry: slot.plan.registryEntries, actions: responseActionsDocument, route: slot.route, locale: state.locale, initialData: slot.initialData })!;
    let entry = forms.get(key);
    if (!entry) {
      entry = { completed: slot.onActionCompleted, form: { definition: slot.plan.definition, themeDocument: slot.grant.themeDocument,
        registryEntries: slot.plan.registryEntries, responseActionsDocument, initialData: slot.initialData,
        localeDocuments: slotLocales, activeLocale: state.locale || undefined, componentDocument,
        instanceSourceResolver: props.host.instanceSourceResolver, configureRuntime: props.host.configureRuntime, configureSubmittedRuntime: props.composition.draftStore.readState ? props.host.configureSubmittedRuntime : undefined, onActionCompleted: (action, result) => entry!.completed?.(action, result) } };
      forms.set(key, entry);
    }
    entry.completed = slot.onActionCompleted;
    return <RespondentDefinitionController composition={props.composition} config={props.config} form={entry.form} />;
  }, [forms, definitionLocales, props.componentDocument, props.componentRouteResolver, props.host, props.composition, props.config, state.locale]);
  const resolveRouteTitle: SurfaceRouteTitleResolver = useCallback(handle => {
    if (!effectiveBundle.surfaces.includes(handle.surface)
      || !handle.surface.routes.includes(handle.route) || handle.route.title !== undefined) return undefined;
    const url = effectiveBundle.surfaceRefs?.get(handle.surface);
    const refs = props.host.bundle.manifest.surfaces?.filter(ref => ref.url === url) ?? [];
    const selectedForm = (handle.route.slots ?? []).some(slot => {
      if (slot.slotType !== 'definition-form' || !slot.binding || typeof slot.binding !== 'object'
        || !('definitionRef' in slot.binding) || slot.binding.definitionRef !== props.host.definition.url) return false;
      const selected = props.componentRouteResolver({ surface: { url: url ?? '', version: refs.length === 1 ? refs[0].version ?? '' : '' },
        route: handle.route.id, slot: slot.id, role: 'slot', definition: props.host.definition });
      return selected.status === 'ready' && canonicalize(selected.component.document) === canonicalize(props.componentDocument);
    });
    if (!selectedForm) return undefined;
    return state.formTitle || undefined;
  }, [effectiveBundle, props.host, props.componentRouteResolver, props.componentDocument, state.formTitle]);
  if (state.cleared) return null;
  return <>
    {state.controller?.retrySignAvailable && ports.retrySigningResult ? <SessionStatus>
      <div lang="en">
        <p>Check the result of your previous signing attempt.</p>
        <button type="button" className="locale-button" onClick={() => { void ports.retrySigningResult?.().catch(() => {}); }}>Check previous signing result</button>
      </div>
    </SessionStatus> : null}
    {state.nativeReadiness && state.nativeReadiness !== 'ready' ? <SessionStatus>
      <p role="status" lang="en">{state.nativeReadiness === 'needs-save' ? 'Save progress to refresh checks.' : state.nativeReadiness === 'expired' ? 'Checks expired. Refresh checks before preparing.' : 'Checks pending.'}</p>
    </SessionStatus> : null}
    <SurfaceApp screenerCompletion={props.screenerCompletion ?? props.host.screenerCompletion} activeLocale={props.screenerLocale} localeDocuments={locales} bundle={effectiveBundle} location={props.location} onNavigate={props.onNavigate} resolveNavigationHref={props.resolveNavigationHref}
    staticAssetResolver={props.host.staticAssetResolver}
    widgetModules={modules} appTitle={state.formTitle || undefined} resolveRouteTitle={resolveRouteTitle}
    sessionGeneration={sessionMarker} widgetActionExecutor={ports.widgetActionExecutor}
    authorizeDataSource={ports.authorizeDataSource}
    dataSourceLoader={ports.dataSourceLoader}
    dataSourceRevision={ports.dataSourceRevision}
    validateDataSourcePayload={ports.validateDataSourcePayload}
    renderDefinitionForm={renderDefinitionForm} /></>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function hasExplicitActionButton(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasExplicitActionButton);
  const node = value as Record<string, unknown>;
  if (node.component === 'ActionButton') return true;
  return hasExplicitActionButton(node.children);
}

function filterAutoPlacedFormActions(
  document: ResolvedRespondentFormInput['responseActionsDocument'],
  componentDocument: ComponentDocument,
  host: NativePackageSigningHost,
): ResolvedRespondentFormInput['responseActionsDocument'] {
  if (!document || hasExplicitActionButton(componentDocument.tree)) return document;
  const roles = host.actionRoles;
  if (!roles?.saveInitial || !roles?.saveOwned || roles.saveInitial === roles.saveOwned) return document;
  const initialAction = document.actions.find(action => action.id === roles.saveInitial);
  const ownedAction = document.actions.find(action => action.id === roles.saveOwned);
  if (!initialAction || !ownedAction) return document;
  const duplicateSaveDefinition = canonicalize(initialAction.effects) === canonicalize(ownedAction.effects)
    || canonicalize(initialAction.label) === canonicalize(ownedAction.label);
  if (!duplicateSaveDefinition) return document;
  const actions = document.actions.filter(action => action.id !== roles.saveInitial);
  return { ...document, actions } as typeof document;
}
