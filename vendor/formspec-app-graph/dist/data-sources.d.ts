/** @filedesc Data Sources catalog, availability, and Surface widget binding checks. */
import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';
import { type JsonRecord, type SurfaceWidgetSlot } from './surface-widgets.js';
interface BindingFailure {
    reason: string;
    details?: Record<string, unknown>;
}
interface DefinitionResolution {
    status: 'resolved' | 'unresolved' | 'ambiguous';
    manifestMatches: number;
    definitionMatches: number;
    definition?: ResolvedArtifactHandle;
    candidates: ResolvedArtifactHandle[];
}
export declare const DATA_SOURCE_CONTRACT_CODES: {
    readonly definitionDataSchemaMismatch: "DATA-SOURCE-DEFINITION-DATA-SCHEMA";
    readonly definitionDataSchemaIndeterminate: "DATA-SOURCE-DEFINITION-DATA-SCHEMA-INDETERMINATE";
};
export declare function exactDefinitionResolution(context: AppGraphContext, definitionRef: string): DefinitionResolution;
export declare function bindingFailure(context: AppGraphContext, widget: SurfaceWidgetSlot, binding: JsonRecord): BindingFailure | undefined;
/**
 * Validate Data Sources graph membership and Surface widget data references.
 *
 * This pass only examines authored descriptors. It never fetches, caches, or
 * materializes a source payload.
 */
export declare function validateDataSources(context: AppGraphContext): AppGraphDiagnostic[];
export {};
