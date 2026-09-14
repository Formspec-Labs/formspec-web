/** @filedesc Pure planning and output extraction for host-admitted Response Action service requests. */
import type { JsonValue, RuntimeRequest, RuntimeRequestCatalog, RuntimeValueSelector } from '@formspec-org/types';
export declare class ServiceRequestRuntimeError extends Error {
    readonly code = "RESPONSE_ACTION_SERVICE_REQUEST_INVALID";
    constructor(message: string);
}
export interface ServiceRequestSources {
    input: unknown;
    route?: unknown;
    session?: unknown;
    /** Allowlisted internal outputs from prior effects in this invocation. */
    result?: unknown;
}
export interface PlannedServiceRequest {
    requestId: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Same-origin absolute path, including an assembled query when declared. */
    path: string;
    /** Authored, non-authority headers only. Host headers remain separate. */
    headers: Readonly<Record<string, string>>;
    body?: JsonValue;
    /** Exact successful statuses, or undefined to admit any 2xx status. */
    successStatuses?: readonly number[];
}
export interface ExtractedServiceRequestOutputs {
    /** Invocation-private outputs available to later `from: result` selectors. */
    internal: Readonly<Record<string, JsonValue>>;
    /** Public route-transition bindings. */
    transitionBindings: Readonly<Record<string, string>>;
    /** Host-private values to persist in the session store. */
    sessionBindings: Readonly<Record<string, string>>;
}
/** Resolve one closed runtime selector without evaluating code or inherited properties. */
export declare function resolveRuntimeValueSelector(selector: RuntimeValueSelector, sources: ServiceRequestSources): JsonValue;
/** Resolve one request id exactly once; duplicate ids fail closed. */
export declare function resolveServiceRequest(catalog: RuntimeRequestCatalog | null | undefined, requestRef: string): RuntimeRequest;
/** Assemble a transport-neutral request. This function performs no network I/O. */
export declare function planServiceRequest(request: RuntimeRequest, sources: ServiceRequestSources): PlannedServiceRequest;
/** Extract only declared outputs; raw response data is never returned. */
export declare function extractServiceRequestOutputs(request: RuntimeRequest, responseBody: unknown): ExtractedServiceRequestOutputs;
