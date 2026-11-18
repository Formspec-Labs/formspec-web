import type { FormResponse, ResponseSelection, ResponseSelectionContext, SelectResponses } from "@formspec-org/types";
import type { DataSourceActiveContext, DataSourceCatalogHandle, DataSourceLoader, DataSourceLoadResult } from "./data-source-loader.js";
/** An exact source identity within one manifested Data Sources catalog. */
export interface DefinitionResponseSourceBinding {
    catalogRef: string;
    sourceRef: string;
}
export type DefinitionResponseRecordRefusalReason = "source-unavailable" | "invocation-id-missing" | "invocation-payload-conflict" | "response-definition-mismatch" | "response-status-mismatch" | "response-id-missing" | "response-authored-invalid" | "response-data-not-finite-json";
export type DefinitionResponseRecordResult = {
    status: "recorded";
    /** Whether this delivery is among the selected Responses for this read. */
    selected: boolean;
} | {
    status: "duplicate";
} | {
    status: "refused";
    reason: DefinitionResponseRecordRefusalReason;
};
type ReadInputs = Pick<DataSourceActiveContext, "params" | "subject">;
export interface RecordDefinitionResponseInput {
    binding: DefinitionResponseSourceBinding;
    /** Stable action-effect delivery identity within the exact source. */
    invocationId: string;
    response: FormResponse;
    context?: ReadInputs;
    /** Host-owned respondent identity for a subjectless catalog delivery. */
    implicitSubjectId?: string;
}
export interface PreviewDefinitionResponseStoreOptions {
    /** Use the initialized engine's tools WebAssembly selector. */
    selectResponses: SelectResponses;
    /** Use the engine's Response timestamp check at delivery admission. */
    isValidResponseAuthored(authored: string): boolean;
    /** Supply facts for a known upstream Definition, or undefined when it is unavailable. */
    selectionContext(binding: DefinitionResponseSourceBinding, selection: ResponseSelection, inputs?: ReadInputs): Pick<ResponseSelectionContext, "upstreamSubject" | "dispositions" | "pin"> | undefined;
}
/** Overlays observed preview deliveries on the host's fresh baseline. */
export interface PreviewDefinitionResponseStore {
    record(input: RecordDefinitionResponseInput): DefinitionResponseRecordResult;
    overlay(binding: DefinitionResponseSourceBinding, baseline: DataSourceLoadResult, inputs?: ReadInputs): DataSourceLoadResult;
    wrapLoader(baselineLoader: DataSourceLoader): DataSourceLoader;
}
/** Create an isolated in-memory store for an already admitted preview catalog. */
export declare function createPreviewDefinitionResponseStore(catalogs: readonly DataSourceCatalogHandle[], options: PreviewDefinitionResponseStoreOptions): PreviewDefinitionResponseStore;
export {};
