/**
 * @filedesc `@formspec-org/surface` — the renderer-independent Surface shell.
 *
 * Reads a bundle export's Surface documents and plans a navigable app: routes,
 * matching, slot dispatch over the closed taxonomy, theme authority, the
 * module-widget runtime seam, and transitions. Renders nothing — a renderer
 * binding (`@formspec-org/surface-react`) turns the plans into elements.
 *
 * See the package README for the design calls this package makes on the
 * platform's behalf and why each is here rather than in every host.
 */
export { SURFACE_DIAGNOSTIC_CODES, SURFACE_DIAGNOSTIC_SEVERITY, documentRootContaminationDiagnostic, surfaceDiagnostic, } from './diagnostics.js';
export { DEFAULT_SURFACE_STRINGS, SURFACE_LOCALE_KEY_PREFIX, SURFACE_STRING_KEYS, resolveSurfaceLocaleStrings, resolveSurfaceStrings, } from './strings.js';
export { compareRouteSpecificity, fillRoutePath, inspectRouteParams, matchRoutePath, matchRouteSegments, parseRoutePath, routeParamMarkers, routePathPatternKey, routePathSegments, } from './route-path.js';
export { composeSurfaceApp, matchRoute, routeHref, routeInSurface, } from './composition.js';
export { ROUTE_CLASS_THEME_REASON, UNCLASSIFIED_THEME_REASON, createThemeAuthority, } from './theme-authority.js';
export { createWidgetRegistry, flattenRegistryEntries, widgetContributionFor, } from './registry.js';
export { STATIC_CONTENT_KINDS, planStaticContent, resolveHeadingLevel, resolveRouteTitleLevel, } from './static-content.js';
export { planExperienceUnit, } from './experience-unit.js';
export { planRoute, } from './slot-plan.js';
export { createDocumentResourceDataSourceLoader, dataSourceAvailableToWidget, loadWidgetDataInputs, resolveDataSourceDescriptor, } from './data-source-loader.js';
export { planTransitions, responseActionsDocumentForDefinition, slotSuppliedTriggers, } from './transitions.js';
export { planMatchedRoute, } from './route-plan.js';
export { bundleIsRenderable, dereferenceBundleExport, } from './bundle.js';
