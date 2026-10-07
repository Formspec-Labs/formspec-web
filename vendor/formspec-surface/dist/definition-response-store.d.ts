import type { FormResponse } from "@formspec-org/types";
import type { DataSourceCatalogHandle, DataSourceLoader, DataSourceLoadResult } from "./data-source-loader.js";
/** An exact source identity within one manifested Data Sources catalog. */
export interface DefinitionResponseSourceBinding {
    catalogRef: string;
    sourceRef: string;
}
export type DefinitionResponseRecordRefusalReason = "source-unavailable" | "invocation-id-missing" | "invocation-payload-conflict" | "response-definition-mismatch" | "response-version-mismatch" | "response-status-mismatch" | "response-id-missing" | "response-authored-invalid" | "response-data-not-finite-json";
export type DefinitionResponseRecordResult = {
    status: "recorded";
    /** Whether this delivery is now the source's selected latest Response. */
    selected: boolean;
} | {
    status: "duplicate";
} | {
    status: "refused";
    reason: DefinitionResponseRecordRefusalReason;
};
export interface RecordDefinitionResponseInput {
    binding: DefinitionResponseSourceBinding;
    /**
     * Stable action-effect delivery identity. Deduplication is scoped to the
     * exact source so two independent sources cannot suppress one another.
     */
    invocationId: string;
    response: FormResponse;
}
/**
 * Small host-facing API for preview and test infrastructure.
 *
 * `overlay` replaces a fresh baseline payload with the selected Response data.
 * It returns unavailable and stale baselines unchanged. `wrapLoader` applies
 * the same rule to an existing generic DataSourceLoader.
 */
export interface PreviewDefinitionResponseStore {
    record(input: RecordDefinitionResponseInput): DefinitionResponseRecordResult;
    overlay(binding: DefinitionResponseSourceBinding, baseline: DataSourceLoadResult): DataSourceLoadResult;
    wrapLoader(baselineLoader: DataSourceLoader): DataSourceLoader;
}
/**
 * Create an isolated in-memory store for preview and test use.
 *
 * Production hosts must use durable, authorized persistence instead. This
 * helper intentionally loses all data when its process ends.
 */
export declare function createPreviewDefinitionResponseStore(catalogs: readonly DataSourceCatalogHandle[]): PreviewDefinitionResponseStore;
