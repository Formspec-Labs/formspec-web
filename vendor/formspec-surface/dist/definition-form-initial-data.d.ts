/**
 * @filedesc Qualified initial-data loading for `definition-form` slots.
 *
 * Surface authors name one exact Data Source. Runtime delivery follows the
 * same availability -> authorization -> load -> schema-validation order as
 * widget data. A Mapping document is resolved by App Manifest handle and runs
 * only when the authored binding names it; mapping rules never live here.
 */
import type { FormDefinition, MappingDocument } from '@formspec-org/types';
import { type DataSourceActiveContext, type DataSourceAuthorizer, type DataSourceCatalogHandle, type DataSourceDescriptor, type DataSourceLoader, type DataSourcePayloadValidator } from './data-source-loader.js';
import { type SurfaceDiagnostic, type SurfaceDiagnosticSite } from './diagnostics.js';
/** The authored, exact Data Source identity for one form's initial data. */
export interface DefinitionFormInitialDataBinding {
    catalogRef: string;
    sourceRef: string;
    /** App Manifest `mappings[].handle`; never an inline rule set or URL guess. */
    mappingRef?: string | undefined;
}
/** One manifested Mapping document paired with its author-chosen handle. */
export interface MappingDocumentHandle {
    mappingRef: string;
    artifactRef: string;
    document: MappingDocument;
}
export type DefinitionFormInitialDataPlan = {
    status: 'ready';
    binding: DefinitionFormInitialDataBinding;
    descriptor: DataSourceDescriptor;
    mapping?: MappingDocumentHandle | undefined;
} | {
    status: 'unresolved' | 'unavailable';
    reason: string;
    binding?: DefinitionFormInitialDataBinding | undefined;
};
export interface PlanDefinitionFormInitialDataInput {
    binding: unknown;
    definition: FormDefinition;
    definitionRef: string;
    catalogs: readonly DataSourceCatalogHandle[];
    mappings: readonly MappingDocumentHandle[];
    context: Pick<DataSourceActiveContext, 'surfaceRef' | 'routeId' | 'slotId'>;
}
/** Recheck source availability for a Definition form, not for a widget. */
export declare function dataSourceAvailableToDefinitionForm(descriptor: DataSourceDescriptor, input: {
    definitionRef: string;
    surfaceRef?: string | undefined;
    routeId: string;
    slotId: string;
}): boolean;
/**
 * Resolve an authored initial-data binding without filename, catalog-order, or
 * unqualified source fallbacks.
 */
export declare function planDefinitionFormInitialData(input: PlanDefinitionFormInitialDataInput): DefinitionFormInitialDataPlan;
export type DefinitionFormInitialDataFailureReason = 'unresolved' | 'unavailable' | 'unauthorized' | 'load-failed' | 'stale-disallowed' | 'record-id-missing' | 'payload-invalid' | 'mapping-failed' | 'payload-not-object';
/** Data and record identity stay separate; no field is packed into another. */
export type DefinitionFormInitialDataDelivery = {
    status: 'ready';
    data: Readonly<Record<string, unknown>>;
    freshness: 'fresh' | 'stale';
    recordId?: string | undefined;
    generation?: string | number | undefined;
    revision?: string | number | undefined;
    diagnostics: readonly SurfaceDiagnostic[];
} | {
    status: 'unavailable';
    reason: DefinitionFormInitialDataFailureReason;
    diagnostics: readonly SurfaceDiagnostic[];
};
export type DefinitionFormInitialDataMappingResult = {
    status: 'mapped';
    data: unknown;
} | {
    status: 'unavailable';
    reason?: string | undefined;
};
export type DefinitionFormInitialDataMapper = (input: {
    mapping: MappingDocument;
    definition: FormDefinition;
    value: unknown;
}) => DefinitionFormInitialDataMappingResult | Promise<DefinitionFormInitialDataMappingResult>;
export interface LoadDefinitionFormInitialDataInput {
    plan: Extract<DefinitionFormInitialDataPlan, {
        status: 'ready';
    }>;
    definition: FormDefinition;
    definitionRef: string;
    context: DataSourceActiveContext;
    loader?: DataSourceLoader | undefined;
    authorize?: DataSourceAuthorizer | undefined;
    validatePayload?: DataSourcePayloadValidator | undefined;
    map?: DefinitionFormInitialDataMapper | undefined;
    site: SurfaceDiagnosticSite;
}
/**
 * Deliver initial form data through one ordered, fail-closed path.
 *
 * For a direct `definition-response` source, `loaded.value` is already
 * `Response.data` under Data Sources 1.0. This function never hydrates the
 * enclosing Form Response object or mixes record metadata into field data.
 */
export declare function loadDefinitionFormInitialData(input: LoadDefinitionFormInitialDataInput): Promise<DefinitionFormInitialDataDelivery>;
