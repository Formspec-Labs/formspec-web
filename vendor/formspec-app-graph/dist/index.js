/** @filedesc Public exports for the AppGraphValidator report kernel. */
export * from './types.js';
export { artifactIdentityKey, compareDiagnostics, createAppGraphReport, diagnosticSourceForHandle, normalizeDiagnostics, } from './report.js';
export { componentNodeIdentityKey, } from './component-identity.js';
export { produceBundleExportAppGraphValidationReport, produceAppGraphValidationReport, } from './producer.js';
export { artifactResolutionGraphInput, resolveArtifacts, resolveBundleExportArtifacts, } from './artifact-resolver.js';
export { evaluateActorPostureAdmission, evaluateModulePostureAdmission, } from './posture-admission.js';
export { moduleResolverInputFromAppGraph, resolveModules, } from './module-resolver.js';
export { validateComponentGraphContexts, } from './component-graph-context.js';
export { validateAppEntry, } from './app-entry.js';
export { validateComponentRouteTargets, } from './component-routes.js';
export { validateExperienceActionRefs, } from './experience-action-refs.js';
export { validateDataSources, } from './data-sources.js';
export { normalizeLocaleTag, validateLocaleAssociations, } from './locale-associations.js';
export { validateNeedsCoverage, } from './needs-coverage.js';
export { validateScreenerSurfaceTargets, } from './screener-surface-targets.js';
export { validateSurfaceDefinitionSlots, } from './surface-definition-slots.js';
export { validateSurfaceExperienceUnits, } from './surface-experience-units.js';
export { CLOSED_RESPONSE_ACTION_INTENTS, validateSurfaceResponseActionTriggers, } from './surface-response-action-triggers.js';
export { routeHasWidgetActionSource, validateSurfaceWidgetActions, } from './surface-widget-actions.js';
export { validateThemeTokenRegistry, } from './theme-token-registry.js';
export { PLATFORM_BRAND_TOKEN_KEY, PLATFORM_TOKEN_KEYS, } from './platform-token-keys.js';
export { resolveWidgetContribution, } from './widget-contribution.js';
// `ROUTE_CLASS_THEME_AUTHORITY` is a RENDERING rule that until now only a
// validator could import: it was exported from its module but not from this
// index, and the package `exports` field only exposes `.`. A rule a renderer
// cannot reach is a rule that only fires at authoring time — which is exactly
// the state the surface-render-v10 spike measured (gap ledger
// `theme-authority-unexported`). Re-exported here so the runtime half of
// THEME-ROUTE-CLASS has an owner. Consumers MUST read the map; they MUST NOT
// restate which classes admit.
export { ROUTE_CLASS_THEME_AUTHORITY, TENANT_THEMING_REFUSING_ROUTE_CLASSES, validateUiGraphPolicy, } from './ui-graph-policy.js';
export { artifactHandlesFor, validateAppGraph, } from './validator.js';
