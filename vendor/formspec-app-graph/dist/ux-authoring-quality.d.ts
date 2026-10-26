/** @filedesc Cross-artifact UX and authoring quality checks for D1 surfaces, forms, and components. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
export declare const UX_AUTHORING_QUALITY_CODES: {
    readonly ungroupedLargeDefinition: "APP-GRAPH-UNGROUPED-LARGE-DEFINITION";
    readonly deadEndFormSlot: "APP-GRAPH-DEAD-END-FORM-SLOT";
    readonly componentRouteParamUnused: "APP-GRAPH-COMPONENT-ROUTE-PARAM-UNUSED";
    readonly routeTitleMissing: "APP-GRAPH-ROUTE-TITLE-MISSING";
    readonly routeTitleSlug: "APP-GRAPH-ROUTE-TITLE-SLUG";
    readonly routeClassMissing: "APP-GRAPH-ROUTE-CLASS-MISSING";
    readonly surfaceWidgetChromeLeak: "APP-GRAPH-SURFACE-WIDGET-CHROME-LEAK";
    readonly inlineBilingualSlash: "APP-GRAPH-INLINE-BILINGUAL-SLASH";
    readonly binaryChoiceDropdown: "APP-GRAPH-BINARY-CHOICE-DROPDOWN";
};
export declare function validateUxAuthoringQuality(context: AppGraphContext): AppGraphDiagnostic[];
