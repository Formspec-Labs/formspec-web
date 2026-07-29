import {
  SURFACE_LOCALE_KEY_PREFIX,
  SURFACE_STRING_KEYS,
  type SurfaceStringKey,
} from '@formspec-org/surface';
import {
  LocaleStore,
  preactReactiveRuntime,
} from '@formspec-org/engine';
import type {
  AppGraphContext,
  AppGraphCrossArtifactValidator,
  AppGraphDiagnostic,
} from '@formspec-org/app-graph';
import type { LocaleDocument } from '@formspec-org/types';
import type { SurfaceBundleValidationConfig } from '../admission.ts';

const PUBLIC_ROUTE_CLASSES = new Set(['intake', 'proof']);
const PUBLIC_STARTER_WIDGETS = new Set([
  'x-intake-banner',
  'IntakeBanner',
  'x-receipt-panel',
  'ReceiptPanel',
]);

export interface RespondentPublicAppPolicy {
  readonly appId: string;
  readonly starterModuleId: string;
  readonly receiptResourceUrl: string;
}

export function withRespondentPublicAppValidation(
  validation: SurfaceBundleValidationConfig,
  policy: RespondentPublicAppPolicy,
): SurfaceBundleValidationConfig {
  return {
    ...validation,
    crossArtifactValidators: [
      ...(validation.crossArtifactValidators ?? []),
      createRespondentPublicAppValidator(policy),
    ],
  };
}

export function createRespondentPublicAppValidator(
  policy: RespondentPublicAppPolicy,
): AppGraphCrossArtifactValidator {
  return (context) => [
    ...validateManifestIdentity(context, policy),
    ...validatePublicSurfaces(context, policy),
    ...validateSelectedRespondentFlow(context),
    ...validateRespondentRegistries(context, policy),
    ...validateReceiptSources(context, policy),
    ...validateAppLocales(context, policy),
  ];
}

function validateManifestIdentity(
  context: AppGraphContext,
  policy: RespondentPublicAppPolicy,
): AppGraphDiagnostic[] {
  const manifest = record(context.manifest.document);
  const diagnostics: AppGraphDiagnostic[] = [];
  if (manifest?.id !== policy.appId) {
    diagnostics.push(diagnostic(
        'RESPONDENT-APP-IDENTITY',
        'The admitted App Manifest does not match this respondent deployment.',
        { expectedAppId: policy.appId, observedAppId: manifest?.id },
      ));
  }
  const modules = records(manifest?.modules);
  if (
    modules.length !== 1
    || modules[0]?.id !== policy.starterModuleId
    || typeof modules[0]?.version !== 'string'
  ) {
    diagnostics.push(diagnostic(
      'RESPONDENT-ACTOR-MODULES',
      'The respondent App Manifest must declare exactly one versioned respondent starter module.',
      {
        expectedModule: policy.starterModuleId,
        modules: modules.map((module) => ({
          id: text(module.id),
          version: text(module.version),
        })),
      },
    ));
  }
  return diagnostics;
}

function validatePublicSurfaces(
  context: AppGraphContext,
  policy: RespondentPublicAppPolicy,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const receiptSource = respondentReceiptSource(context, policy);
  let intakeRoutes = 0;
  let proofRoutes = 0;
  let receiptWidgets = 0;
  for (const handle of context.handles.filter((entry) => entry.artifactKind === 'surface')) {
    const surface = record(handle.document);
    const routes = records(surface?.routes);
    for (const route of routes) {
      const routeClass = text(route.routeClass);
      if (!routeClass || !PUBLIC_ROUTE_CLASSES.has(routeClass)) {
        diagnostics.push(diagnostic(
          'RESPONDENT-ACTOR-ROUTE-REFUSED',
          `Public respondent bundles may contain only intake and proof routes; route '${text(route.id) ?? '<unknown>'}' is refused.`,
          { routeId: text(route.id), routeClass },
        ));
        continue;
      }
      if (routeClass === 'intake') intakeRoutes += 1;
      if (routeClass === 'proof') {
        proofRoutes += 1;
        const params = records(route.params);
        const hasCaseRef = (
          route.path === '/receipt/{caseRef}'
          && params.length === 1
          && params[0]?.name === 'caseRef'
          && params[0]?.type === 'string'
        );
        if (!hasCaseRef) {
          diagnostics.push(diagnostic(
            'RESPONDENT-RECEIPT-ROUTE-PARAM',
            'A respondent proof route must declare exactly one string caseRef parameter in its path.',
            { routeId: text(route.id), path: text(route.path) },
          ));
        }
        const incoming = routes.flatMap((sourceRoute) => (
          sourceRoute.routeClass === 'intake'
            ? records(sourceRoute.transitions).filter((transition) => (
                transition.to === route.id
                && exactCaseRefTransitionParams(transition.params)
              ))
            : []
        ));
        if (incoming.length !== 1) {
          diagnostics.push(diagnostic(
            'RESPONDENT-RECEIPT-TRANSITION-PARAM',
            'Exactly one intake transition must supply the proof route caseRef parameter.',
            { routeId: text(route.id), matchingTransitions: incoming.length },
          ));
        }
      }

      for (const slot of records(route.slots)) {
        const slotType = text(slot.slotType);
        const binding = record(slot.binding);
        if (slotType === 'embed-route') {
          diagnostics.push(diagnostic(
            'RESPONDENT-EMBED-ROUTE-REFUSED',
            'The public respondent Surface may not embed another route.',
            { routeId: text(route.id), slotId: text(slot.id) },
          ));
        }
        if (slotType === 'definition-form' && routeClass !== 'intake') {
          diagnostics.push(diagnostic(
            'RESPONDENT-ACTOR-SLOT-REFUSED',
            'A respondent Definition form may run only on an intake route.',
            { routeId: text(route.id), slotId: text(slot.id) },
          ));
        }
        if (slotType !== 'module-widget') continue;
        const moduleId = text(binding?.moduleId);
        const widgetName = text(binding?.widgetName);
        if (binding?.actionBindings !== undefined) {
          diagnostics.push(diagnostic(
            'RESPONDENT-WIDGET-ACTIONS-UNSUPPORTED',
            'The respondent starter widgets may not bind action outputs until this host admits an explicit widget-action boundary.',
            {
              routeId: text(route.id),
              slotId: text(slot.id),
              widgetName,
            },
          ));
        }
        if (
          moduleId !== policy.starterModuleId
          || !widgetName
          || !PUBLIC_STARTER_WIDGETS.has(widgetName)
          || (isReceiptWidget(widgetName) && routeClass !== 'proof')
          || (isIntakeWidget(widgetName) && routeClass !== 'intake')
        ) {
          diagnostics.push(diagnostic(
            'RESPONDENT-ACTOR-WIDGET-REFUSED',
            `Widget '${widgetName ?? '<unknown>'}' is outside the public respondent starter set or route.`,
            {
              routeId: text(route.id),
              routeClass,
              slotId: text(slot.id),
              moduleId,
              widgetName,
            },
          ));
        }
        if (widgetName && isReceiptWidget(widgetName)) {
          receiptWidgets += 1;
          const dataBindings = record(binding?.dataBindings);
          const receiptBinding = record(dataBindings?.receipt);
          if (
            !dataBindings
            || Object.keys(dataBindings).length !== 1
            || !receiptBinding
            || receiptBinding.catalogRef !== receiptSource?.catalogRef
            || receiptBinding.sourceRef !== receiptSource?.sourceRef
          ) {
            diagnostics.push(diagnostic(
              'RESPONDENT-RECEIPT-BINDING',
              'The receipt widget must bind its one named receipt input to the sole admitted receipt source.',
              {
                routeId: text(route.id),
                slotId: text(slot.id),
                expectedCatalogRef: receiptSource?.catalogRef,
                expectedSourceRef: receiptSource?.sourceRef,
              },
            ));
          }
          const availability = record(receiptSource?.source.availability);
          const qualifiedAvailability = (
            availability !== undefined
            && availability.surfaceRef === handle.ref?.url
            && availability.routeRef === route.id
            && (
              availability.level === 'route'
              || (availability.level === 'slot' && availability.slotId === slot.id)
            )
          );
          if (!qualifiedAvailability) {
            diagnostics.push(diagnostic(
              'RESPONDENT-RECEIPT-AVAILABILITY',
              'The sole receipt source must be qualified to the receipt proof route or its ReceiptPanel slot.',
              { routeId: text(route.id), slotId: text(slot.id) },
            ));
          }
        }
      }
    }
  }
  if (intakeRoutes !== 1) {
    diagnostics.push(diagnostic(
      'RESPONDENT-INTAKE-ROUTE-COUNT',
      'The respondent app must contain exactly one intake route.',
      { intakeRoutes },
    ));
  }
  if (proofRoutes !== 1) {
    diagnostics.push(diagnostic(
      'RESPONDENT-PROOF-ROUTE-MISSING',
      'The respondent app must contain exactly one proof route for the real submission receipt.',
      { proofRoutes },
    ));
  }
  if (receiptWidgets !== 1) {
    diagnostics.push(diagnostic(
      'RESPONDENT-RECEIPT-WIDGET-COUNT',
      'The respondent app must contain exactly one ReceiptPanel.',
      { receiptWidgets },
    ));
  }
  return diagnostics;
}

function validateSelectedRespondentFlow(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const manifest = record(context.manifest.document);
  const entrySurface = text(manifest?.entrySurface);
  const surfaceHandles = context.handles.filter(
    (handle) => handle.artifactKind === 'surface',
  );
  const selectedSurfaces = surfaceHandles.filter(
    (handle) => handle.ref?.url === entrySurface,
  );
  if (
    !entrySurface
    || selectedSurfaces.length !== 1
    || surfaceHandles.length !== 1
  ) {
    return [diagnostic(
      'RESPONDENT-ENTRY-SURFACE',
      'The respondent app must contain and select one exact entry Surface.',
      {
        entrySurface,
        selectedMatches: selectedSurfaces.length,
        surfaces: surfaceHandles.length,
      },
    )];
  }
  const surface = record(selectedSurfaces[0]?.document);
  const routes = records(surface?.routes);
  const entryRouteId = text(surface?.entry);
  const selectedRoutes = routes.filter((route) => route.id === entryRouteId);
  if (selectedRoutes.length !== 1 || selectedRoutes[0]?.routeClass !== 'intake') {
    return [diagnostic(
      'RESPONDENT-ENTRY-INTAKE',
      'The selected Surface entry must resolve to one intake route.',
      { entryRouteId, matches: selectedRoutes.length },
    )];
  }
  const intake = selectedRoutes[0] as Record<string, unknown>;
  const definitionSlots = routes.flatMap((route) => (
    records(route.slots)
      .filter((slot) => slot.slotType === 'definition-form')
      .map((slot) => ({ route, slot }))
  ));
  if (
    definitionSlots.length !== 1
    || definitionSlots[0]?.route !== intake
  ) {
    return [diagnostic(
      'RESPONDENT-DEFINITION-FORM-COUNT',
      'The respondent Surface must contain exactly one Definition form, on its selected intake route.',
      {
        definitionForms: definitionSlots.length,
        formRouteId: text(definitionSlots[0]?.route.id),
        entryRouteId,
      },
    )];
  }
  const definitionRef = text(record(definitionSlots[0]?.slot.binding)?.definitionRef);
  const definitions = context.handles.filter((handle) => (
    handle.artifactKind === 'definition'
    && handle.ref?.url === definitionRef
    && record(handle.document)?.url === definitionRef
  ));
  if (!definitionRef || definitions.length !== 1) {
    return [diagnostic(
      'RESPONDENT-DEFINITION-BINDING',
      'The selected Definition form must bind one exact admitted Definition.',
      { definitionRef, matches: definitions.length },
    )];
  }

  const actionDocuments = context.handles.filter(
    (handle) => handle.artifactKind === 'responseActions',
  );
  const actions = actionDocuments.flatMap(
    (handle) => records(record(handle.document)?.actions),
  );
  const targetDefinition = actionDocuments.length === 1
    ? text(record(record(actionDocuments[0]?.document)?.targetDefinition)?.url)
    : undefined;
  const submitActions = actions.filter((action) => action.intent === 'submit');
  if (
    actionDocuments.length !== 1
    || actions.length !== 1
    || submitActions.length !== 1
    || targetDefinition !== definitionRef
  ) {
    return [diagnostic(
      'RESPONDENT-SUBMIT-ACTION',
      'The respondent bundle must contain exactly one Response Action: the submit action for the selected Definition.',
      {
        actionDocuments: actionDocuments.length,
        actions: actions.length,
        submitActions: submitActions.length,
        targetDefinition,
        definitionRef,
      },
    )];
  }

  const proofRoutes = routes.filter((route) => route.routeClass === 'proof');
  const submitAction = submitActions[0] as Record<string, unknown>;
  const preconditions = submitAction.preconditions;
  if (
    (Array.isArray(preconditions) && preconditions.length > 0)
    || (!Array.isArray(preconditions) && preconditions !== undefined)
  ) {
    return [diagnostic(
      'RESPONDENT-SUBMIT-PRECONDITIONS-UNSUPPORTED',
      'The respondent submit action may not declare preconditions because this runtime has no precondition evaluator.',
      {
        preconditions: Array.isArray(preconditions) ? preconditions.length : 1,
      },
    )];
  }
  const validation = record(submitAction.validation);
  if (
    validation !== undefined
    && (
      Object.keys(validation).length !== 3
      || validation.profile !== 'on-submit'
      || validation.blocking !== 'block-on-error'
      || validation.persistence !== 'complete-response'
    )
  ) {
    return [diagnostic(
      'RESPONDENT-SUBMIT-VALIDATION',
      'The submit action must use the canonical blocking, on-submit, complete-response validation behavior.',
      {
        profile: text(validation?.profile),
        blocking: text(validation?.blocking),
        persistence: text(validation?.persistence),
      },
    )];
  }
  const effects = records(submitAction.effects);
  const submitHostEvents = effects.filter((effect) => (
    effect.type === 'hostEvent'
    && effect.eventName === 'formspec-submit'
  ));
  if (
    effects.length !== 1
    || submitHostEvents.length !== 1
    || effects.at(-1) !== submitHostEvents[0]
  ) {
    return [diagnostic(
      'RESPONDENT-SUBMIT-HOST-EVENT',
      "The submit action must contain only the exact 'formspec-submit' host event.",
      {
        effects: effects.length,
        submitHostEvents: submitHostEvents.length,
        finalEffectType: text(effects.at(-1)?.type),
        finalEventName: text(effects.at(-1)?.eventName),
      },
    )];
  }
  const triggerId = text(submitAction.id);
  const transitions = records(intake.transitions).filter((transition) => (
    proofRoutes.some((route) => route.id === transition.to)
    && exactCaseRefTransitionParams(transition.params)
    && (transition.trigger === triggerId || transition.trigger === 'submit')
  ));
  if (transitions.length !== 1) {
    return [diagnostic(
        'RESPONDENT-SUBMIT-RECEIPT-TRANSITION',
        'The selected form submit action must supply exactly one caseRef transition to the receipt proof route.',
        {
          triggerId,
          matchingTransitions: transitions.length,
        },
      )];
  }
  if (transitions[0]?.when !== undefined) {
    return [diagnostic(
      'RESPONDENT-TRANSITION-WHEN-UNSUPPORTED',
      'The respondent submit-to-receipt transition may not declare when because this runtime has no transition-condition evaluator.',
      { triggerId },
    )];
  }
  return [];
}

interface ReceiptSourceIdentity {
  readonly catalogRef: string;
  readonly sourceRef: string;
  readonly source: Record<string, unknown>;
}

function respondentReceiptSource(
  context: AppGraphContext,
  policy: RespondentPublicAppPolicy,
): ReceiptSourceIdentity | undefined {
  const matches: ReceiptSourceIdentity[] = [];
  for (const handle of context.handles.filter((entry) => entry.artifactKind === 'dataSources')) {
    const catalogRef = handle.ref?.url;
    if (typeof catalogRef !== 'string') continue;
    for (const source of records(record(handle.document)?.sources)) {
      const runtime = record(source.runtime);
      const provenance = record(runtime?.provenance);
      if (
        source.kind === 'document-resource'
        && provenance?.source === policy.receiptResourceUrl
        && typeof source.id === 'string'
      ) {
        matches.push({ catalogRef, sourceRef: source.id, source });
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function validateReceiptSources(
  context: AppGraphContext,
  policy: RespondentPublicAppPolicy,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  let receiptSources = 0;
  for (const handle of context.handles.filter((entry) => entry.artifactKind === 'dataSources')) {
    const catalog = record(handle.document);
    for (const source of records(catalog?.sources)) {
      const runtime = record(source.runtime);
      const provenance = record(runtime?.provenance);
      const availability = record(source.availability);
      const isReceipt = (
        source.kind === 'document-resource'
        && source.owner === 'host'
        && (source.scope === 'route' || source.scope === 'resource')
        && runtime?.authorizationBoundary === 'host'
        && runtime.delivery === 'snapshot'
        && runtime.failureMode === 'block-render'
        && provenance?.kind === 'document-resource'
        && provenance.source === policy.receiptResourceUrl
        && record(source.schema) !== undefined
        && (availability?.level === 'route' || availability?.level === 'slot')
      );
      if (isReceipt) {
        receiptSources += 1;
      } else {
        diagnostics.push(diagnostic(
          'RESPONDENT-ACTOR-DATA-SOURCE-REFUSED',
          `Data source '${text(source.id) ?? '<unknown>'}' is not the host-authorized respondent receipt source.`,
          {
            catalogRef: handle.ref?.url,
            sourceRef: text(source.id),
            kind: text(source.kind),
            owner: text(source.owner),
          },
        ));
      }
    }
  }
  if (receiptSources !== 1) {
    diagnostics.push(diagnostic(
      'RESPONDENT-RECEIPT-SOURCE-COUNT',
      'The respondent app must resolve exactly one schema-qualified receipt source.',
      { receiptSources },
    ));
  }
  return diagnostics;
}

function validateRespondentRegistries(
  context: AppGraphContext,
  policy: RespondentPublicAppPolicy,
): AppGraphDiagnostic[] {
  const entries = context.handles
    .filter((handle) => handle.artifactKind === 'registry')
    .flatMap((handle) => records(record(handle.document)?.entries));
  const modules = entries.filter((entry) => entry.category === 'module');
  const respondentModules = modules.filter((entry) => entry.name === policy.starterModuleId);
  const widgets = entries.filter((entry) => entry.category === 'widget');
  const diagnostics: AppGraphDiagnostic[] = [];

  if (
    modules.length !== 1
    || respondentModules.length !== 1
  ) {
    diagnostics.push(diagnostic(
      'RESPONDENT-ACTOR-REGISTRY-REFUSED',
      'The respondent app must declare one exact respondent widget module and no staff or ceremony module.',
      {
        modules: modules.map((entry) => text(entry.name)),
        expectedModule: policy.starterModuleId,
      },
    ));
  }

  const contributions = new Set(
    (Array.isArray(respondentModules[0]?.contributes)
      ? respondentModules[0].contributes
      : [])
      .filter((entry): entry is string => typeof entry === 'string'),
  );
  const nonRespondentWidgets = widgets.filter((entry) => {
    const name = text(record(entry.widgetShape)?.widgetName);
    return (
      !name
      || !PUBLIC_STARTER_WIDGETS.has(name)
      || !contributions.has(String(entry.name))
    );
  });
  if (nonRespondentWidgets.length > 0) {
    diagnostics.push(diagnostic(
      'RESPONDENT-ACTOR-REGISTRY-REFUSED',
      'The respondent Registry may publish only intake and receipt widgets owned by its respondent module.',
      {
        widgets: nonRespondentWidgets.map(
          (entry) => text(record(entry.widgetShape)?.widgetName) ?? text(entry.name),
        ),
      },
    ));
  }

  const actionWidgets = widgets.filter(
    (entry) => record(entry.widgetShape)?.actionOutputs !== undefined,
  );
  if (actionWidgets.length > 0) {
    diagnostics.push(diagnostic(
      'RESPONDENT-WIDGET-ACTIONS-UNSUPPORTED',
      'The respondent Registry may not declare widget action outputs until this host admits an explicit widget-action boundary.',
      {
        widgets: actionWidgets.map(
          (entry) => text(record(entry.widgetShape)?.widgetName) ?? text(entry.name),
        ),
      },
    ));
  }

  const receiptWidgets = widgets.filter((entry) => {
    const name = text(record(entry.widgetShape)?.widgetName);
    return (
      name !== undefined
      && isReceiptWidget(name)
      && contributions.has(String(entry.name))
    );
  });
  const dataInputs = receiptWidgets.length === 1
    ? records(record(receiptWidgets[0]?.widgetShape)?.dataInputs)
    : [];
  if (
    receiptWidgets.length !== 1
    || dataInputs.length !== 1
    || dataInputs[0]?.name !== 'receipt'
    || dataInputs[0]?.required !== true
  ) {
    diagnostics.push(diagnostic(
      'RESPONDENT-RECEIPT-WIDGET-INPUT',
      'The admitted ReceiptPanel must declare exactly one required named receipt input.',
      {
        receiptWidgets: receiptWidgets.length,
        dataInputs: dataInputs.map((entry) => ({
          name: text(entry.name),
          required: entry.required,
        })),
      },
    ));
  }

  return diagnostics;
}

function validateAppLocales(
  context: AppGraphContext,
  policy: RespondentPublicAppPolicy,
): AppGraphDiagnostic[] {
  const appLocales = context.handles
    .filter((handle) => handle.artifactKind === 'locale')
    .map((handle) => handle.document)
    .filter(isLocaleDocument)
    .filter((document) => (
      document.target.kind === 'app'
      && document.target.url === policy.appId
    ));
  if (appLocales.length === 0) {
    return [diagnostic(
      'RESPONDENT-APP-LOCALE-MISSING',
      'The respondent app must provide an App-target Locale 2.0 document.',
    )];
  }

  const store = new LocaleStore(
    preactReactiveRuntime,
    'auto',
    { kind: 'app', url: policy.appId },
  );
  for (const document of appLocales) store.loadLocale(document);

  const diagnostics: AppGraphDiagnostic[] = [];
  for (const locale of store.getAvailableLocales({ kind: 'app', url: policy.appId })) {
    store.setLocale(locale);
    const missing = SURFACE_STRING_KEYS.filter((key) => (
      store.lookupKey(shellLocaleKey(key)) === null
    ));
    if (missing.length > 0) {
      diagnostics.push(diagnostic(
        'RESPONDENT-SHELL-LOCALE-INCOMPLETE',
        `App locale '${locale}' does not resolve every closed Surface shell string through its same-target fallback chain.`,
        { locale, missing },
      ));
    }
  }
  return diagnostics;
}

function shellLocaleKey(key: SurfaceStringKey): string {
  return `${SURFACE_LOCALE_KEY_PREFIX}${key}`;
}

function exactCaseRefTransitionParams(value: unknown): boolean {
  const params = record(value);
  return (
    params !== undefined
    && Object.keys(params).length === 1
    && params.caseRef === 'caseRef'
  );
}

function diagnostic(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): AppGraphDiagnostic {
  return {
    code,
    severity: 'error',
    phase: 'authorization-boundary',
    origin: 'x-formspec-web-respondent',
    message,
    ...(details ? { details } : {}),
  };
}

function isReceiptWidget(widgetName: string): boolean {
  return widgetName === 'ReceiptPanel' || widgetName === 'x-receipt-panel';
}

function isIntakeWidget(widgetName: string): boolean {
  return widgetName === 'IntakeBanner' || widgetName === 'x-intake-banner';
}

function isLocaleDocument(value: unknown): value is LocaleDocument {
  const document = record(value);
  const target = record(document?.target);
  return (
    document?.$formspecLocale === '2.0'
    && typeof document.version === 'string'
    && typeof document.locale === 'string'
    && (target?.kind === 'app' || target?.kind === 'definition')
    && typeof target.url === 'string'
    && record(document.strings) !== undefined
  );
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => record(entry) !== undefined)
    : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
