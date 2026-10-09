import type { AppGraphDiagnostic, AppGraphValidationRequest, AppGraphValidationReport, ResolvedArtifactHandle } from './types.js';
export interface ComponentRouteSelection {
    surface: {
        url: string;
        version: string;
    };
    route: string;
    slot: string;
    role: 'slot';
    definition: {
        url: string;
        version: string;
    };
}
type Snapshot<T> = T extends readonly (infer V)[] ? readonly Snapshot<V>[] : T extends object ? {
    readonly [K in keyof T]: Snapshot<T[K]>;
} : T;
export type ComponentRouteArtifact = Snapshot<ResolvedArtifactHandle>;
export type ComponentRouteDiagnostics = readonly Snapshot<AppGraphDiagnostic>[];
export type ComponentRouteResolution = {
    status: 'ready';
    component: ComponentRouteArtifact;
    diagnostics: ComponentRouteDiagnostics;
} | {
    status: 'unavailable';
    reason: ComponentRouteRefusal;
    diagnostics: ComponentRouteDiagnostics;
};
export type ComponentRouteRefusal = 'graph-not-validated' | 'incomplete-selection' | 'surface-not-exact' | 'route-not-unique' | 'slot-definition-mismatch' | 'definition-not-exact' | 'component-claim-not-unique' | 'component-not-exact' | 'component-definition-mismatch' | 'graph-snapshot-failed';
export type ComponentRouteResolver = (selection: ComponentRouteSelection) => ComponentRouteResolution;
/**
 * Validate the supplied graph and select one authored slot Component. The host
 * supplies current route coordinates; this result establishes no current task,
 * draft, signing, attachment, or render-instance authority. No I/O occurs.
 */
export declare function resolveComponentRouteTarget(graph: AppGraphValidationRequest, selection: ComponentRouteSelection): ComponentRouteResolution;
/** Internal producer seam: the report must come from validation of this exact graph. */
export declare function prepareComponentRouteResolver(graph: AppGraphValidationRequest, report: AppGraphValidationReport): ComponentRouteResolver;
export {};
