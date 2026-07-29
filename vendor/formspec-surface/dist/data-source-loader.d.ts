/**
 * @filedesc Canonical runtime delivery for Data Sources 1.0.
 *
 * A Data Sources document declares where a value comes from and how consumers
 * must treat failure. It does not fetch the value. This module supplies the
 * one framework-neutral port hosts implement, plus the ordered checks a
 * Surface widget must pass before it receives a named input:
 *
 * availability -> host authorization -> load -> payload validation.
 *
 * The loader receives an already-qualified descriptor. It never discovers a
 * catalog by filename, a source by unqualified id, or a value from widget
 * configuration.
 */
import type { DataSource, DataSourcesDocument, WidgetDataInput } from '@formspec-org/types';
import { type SurfaceDiagnostic, type SurfaceDiagnosticSite } from './diagnostics.js';
/** A loaded catalog together with the exact App Manifest URL that admitted it. */
export interface DataSourceCatalogHandle {
    catalogRef: string;
    document: DataSourcesDocument;
}
/** The exact `(catalogRef, sourceRef)` pair a Surface binding resolved. */
export interface DataSourceDescriptor {
    catalogRef: string;
    sourceRef: string;
    catalog: DataSourcesDocument;
    source: DataSource;
}
/**
 * Runtime context available at the use site. `sessionGeneration` is an opaque
 * host/shell generation marker, not identity or authorization evidence.
 */
export interface DataSourceActiveContext {
    surfaceId: string;
    surfaceRef?: string | undefined;
    routeId: string;
    slotId: string;
    moduleId: string;
    widgetName: string;
    params: Readonly<Record<string, string>>;
    sessionGeneration?: string | number | undefined;
}
export interface DataSourceLoadRequest {
    descriptor: DataSourceDescriptor;
    context: DataSourceActiveContext;
}
export type DataSourceLoadResult = {
    status: 'loaded';
    value: unknown;
    /** Loaders must state staleness; the shell never infers it from time. */
    freshness: 'fresh' | 'stale';
} | {
    status: 'unavailable';
    reason: string;
};
/** The sole payload-loading port. Authorization is deliberately not folded in. */
export type DataSourceLoader = (request: DataSourceLoadRequest) => DataSourceLoadResult | Promise<DataSourceLoadResult>;
export type DataSourceAuthorizationResult = {
    status: 'authorized';
} | {
    status: 'refused';
    reason?: string | undefined;
};
/**
 * Coarse admission at the boundary named by
 * `source.runtime.authorizationBoundary`. Fine-grained policy stays in the
 * host's authorization engine; this port carries only its verdict.
 */
export type DataSourceAuthorizer = (request: DataSourceLoadRequest) => DataSourceAuthorizationResult | Promise<DataSourceAuthorizationResult>;
export type DataSourcePayloadValidationResult = {
    valid: true;
} | {
    valid: false;
    reason?: string | undefined;
};
/** Host JSON-Schema validator for a source that declares `source.schema`. */
export type DataSourcePayloadValidator = (request: DataSourceLoadRequest & {
    schema: object;
    value: unknown;
}) => DataSourcePayloadValidationResult | Promise<DataSourcePayloadValidationResult>;
/**
 * A declared Registry input after exact Surface/Data Sources resolution.
 * Malformed or incomplete graphs remain representable so the runtime can fail
 * closed and report them even when validation was bypassed.
 */
export type WidgetDataInputPlan = {
    name: string;
    required: boolean;
    status: 'ready';
    descriptor: DataSourceDescriptor;
} | {
    name: string;
    required: boolean;
    status: 'unbound' | 'unresolved' | 'unavailable';
    reason: string;
    descriptor?: DataSourceDescriptor | undefined;
};
export type WidgetDataFailureReason = 'unbound' | 'unresolved' | 'unavailable' | 'unauthorized' | 'load-failed' | 'stale-disallowed' | 'payload-invalid';
export interface WidgetDataInputFailure {
    inputName: string;
    required: boolean;
    reason: WidgetDataFailureReason;
    message: string;
    failureMode?: DataSource['runtime']['failureMode'] | undefined;
}
export type WidgetDataDelivery = {
    status: 'ready';
    /** Frozen, named input map. Unbound optional inputs are absent. */
    data: Readonly<Record<string, unknown>>;
    /** Optional `degraded-widget` failures omitted from `data`. */
    degradedInputs: readonly WidgetDataInputFailure[];
    diagnostics: readonly SurfaceDiagnostic[];
} | {
    status: 'unavailable';
    failures: readonly WidgetDataInputFailure[];
    diagnostics: readonly SurfaceDiagnostic[];
};
export interface LoadWidgetDataInputsRequest {
    inputs: readonly WidgetDataInputPlan[];
    context: DataSourceActiveContext;
    loader?: DataSourceLoader | undefined;
    authorize?: DataSourceAuthorizer | undefined;
    validatePayload?: DataSourcePayloadValidator | undefined;
    site: SurfaceDiagnosticSite;
}
/**
 * Resolve only an exact manifested catalog URL and an exact source id within
 * it. Repeated matches are ambiguous and resolve to nothing.
 */
export declare function resolveDataSourceDescriptor(catalogs: readonly DataSourceCatalogHandle[], binding: {
    catalogRef: string;
    sourceRef: string;
}): DataSourceDescriptor | undefined;
/**
 * Data Sources §5 availability at a module-widget use site.
 * Definition-only availability never covers a widget.
 */
export declare function dataSourceAvailableToWidget(descriptor: DataSourceDescriptor, context: DataSourceActiveContext): boolean;
/**
 * Load every declared input in Registry order. No partial object reaches the
 * widget unless every required input succeeds. `degraded-widget` may omit a
 * failed optional input; no other failure mode manufactures a success value.
 */
export declare function loadWidgetDataInputs(request: LoadWidgetDataInputsRequest): Promise<WidgetDataDelivery>;
export interface DocumentResourceReadRequest extends DataSourceLoadRequest {
    /** Exact provenance pointer from the Data Sources document. */
    url: string;
}
export type DocumentResourceReader = (request: DocumentResourceReadRequest) => DataSourceLoadResult | Promise<DataSourceLoadResult>;
/**
 * Production bridge for the `document-resource` URL family. The host injects
 * its HTTP client so origin policy, credentials, telemetry, and retries remain
 * host concerns. Non-HTTP provenance and other source families fail closed.
 */
export declare function createDocumentResourceDataSourceLoader(read: DocumentResourceReader): DataSourceLoader;
/** Keep the generated declaration visible in API docs without duplicating it. */
export type DeclaredWidgetDataInput = WidgetDataInput;
