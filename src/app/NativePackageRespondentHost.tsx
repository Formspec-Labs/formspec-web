import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import canonicalize from 'canonicalize';
import { SurfaceApp, starterWidgetModule, useSurfaceApp, deriveSurfaceRuntimeGeneration, type SurfaceAppProps, type SurfaceRouteTitleResolver } from '@formspec-org/surface-react';
import '@formspec-org/surface-react/formspec-surface.css';
import type { ComponentDocument, LocaleDocument } from '@formspec-org/types';
import type { Composition } from '../composition/types.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import type { NativePackageSigningHost } from '../shared/native-package-signing-host.ts';
import { RespondentDefinitionController, type ResolvedRespondentFormInput } from './RespondentRuntime.tsx';

export interface NativePackageRespondentHostProps {
  host: NativePackageSigningHost;
  composition: Composition;
  config: FormspecWebConfig;
  componentDocument: ComponentDocument;
  localeDocuments: readonly LocaleDocument[];
  location: string;
  onNavigate: SurfaceAppProps['onNavigate'];
}

/** Local qualified package rendering; policy and service authority remain host-owned. */
export function NativePackageRespondentHost(props: NativePackageRespondentHostProps) {
  const state = useSyncExternalStore(props.host.subscribe, props.host.getSnapshot, props.host.getSnapshot);
  const modules = useMemo(() => [starterWidgetModule(props.host.moduleId, { responseReview: props.host.reviewOptions })], [props.host]);
  const model = useSurfaceApp({ bundle: props.host.bundle, widgetModules: modules });
  const sessionMarker = useMemo(() => props.host.allocateSurfaceSessionMarker(state.sessionGeneration), [props.host, props.location, state.sessionGeneration]);
  const marker = deriveSurfaceRuntimeGeneration({ app: model.app, location: props.location, sessionGeneration: sessionMarker });
  const visit = useMemo(() => props.host.createSurfaceVisit(marker, state.sessionGeneration), [props.host, marker, state.sessionGeneration]);
  useLayoutEffect(() => { if (state.cleared) return; visit.activate(); return () => visit.dispose(); }, [visit, state.cleared]);
  const ports = useMemo(() => visit.bindRuntime(), [visit]);
  const locales = useMemo(() => [...props.localeDocuments], [props.localeDocuments]);
  const forms = useMemo(() => new Map<string, { form: ResolvedRespondentFormInput; completed: ResolvedRespondentFormInput['onActionCompleted'] }>(), [props.host, props.componentDocument, locales]);
  const renderDefinitionForm: NonNullable<SurfaceAppProps['renderDefinitionForm']> = useCallback(slot => {
    const key = canonicalize({ definition: slot.plan.definition, theme: slot.grant.themeDocument,
      registry: slot.plan.registryEntries, actions: slot.responseActionsDocument, route: slot.route, locale: state.locale })!;
    let entry = forms.get(key);
    if (!entry) {
      entry = { completed: slot.onActionCompleted, form: { definition: slot.plan.definition, themeDocument: slot.grant.themeDocument,
        registryEntries: slot.plan.registryEntries, responseActionsDocument: slot.responseActionsDocument,
        localeDocuments: locales, activeLocale: state.locale || undefined, componentDocument: props.componentDocument,
        configureRuntime: props.host.configureRuntime, configureSubmittedRuntime: props.composition.draftStore.readState ? props.host.configureSubmittedRuntime : undefined, onActionCompleted: (action, result) => entry!.completed?.(action, result) } };
      forms.set(key, entry);
    }
    entry.completed = slot.onActionCompleted;
    return <RespondentDefinitionController composition={props.composition} config={props.config} form={entry.form} />;
  }, [forms, locales, props.componentDocument, props.host, props.composition, props.config, state.locale]);
  const resolveRouteTitle: SurfaceRouteTitleResolver = useCallback(handle => {
    if (!props.host.bundle.surfaces.includes(handle.surface)
      || !handle.surface.routes.includes(handle.route) || handle.route.title !== undefined) return undefined;
    return state.formTitle || undefined;
  }, [props.host, state.formTitle]);
  if (state.cleared) return null;
  return <SurfaceApp bundle={props.host.bundle} location={props.location} onNavigate={props.onNavigate}
    widgetModules={modules} appTitle={state.formTitle || undefined} resolveRouteTitle={resolveRouteTitle}
    sessionGeneration={sessionMarker} widgetActionExecutor={ports.widgetActionExecutor}
    authorizeDataSource={ports.authorizeDataSource}
    dataSourceLoader={ports.dataSourceLoader}
    dataSourceRevision={ports.dataSourceRevision}
    validateDataSourcePayload={ports.validateDataSourcePayload}
    renderDefinitionForm={renderDefinitionForm} />;
}
