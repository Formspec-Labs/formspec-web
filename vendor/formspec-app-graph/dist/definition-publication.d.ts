/** @filedesc Build the trace record for each published Definition from the admitted bundle. */
import type { AppGraphReportProducerResult } from './producer.js';
import type { AppGraphValidationReport } from './types.js';
export interface DefinitionPublicationReportsOptions {
    /**
     * Retain each Definition's scoped `renderedNeedTrace.nodes` array instead of emitting the
     * compact publication proof (`nodes: []`, `inventory: 'omitted'`, `nodeCount`).
     *
     * Defaults to `false` so per-Definition publication payloads remain bounded while preserving
     * `status`, canonical `definitions`/`locales`/`components` digests, phases, diagnostics,
     * schema results, and evidence results.
     */
    includeNodes?: boolean;
}
/**
 * Retains the admission evidence from the whole bundle, with each form's bound trace proof
 * and its redundant-anchor warnings. Emits a compact publication proof (`nodes: []`,
 * `inventory: 'omitted'`, `nodeCount`) by default; pass `{ includeNodes: true }` to retain
 * scoped per-node inventory entries. A refused graph produces no publication records.
 */
export declare function definitionPublicationReports({ report, artifactResolutionReport }: AppGraphReportProducerResult, options?: DefinitionPublicationReportsOptions): AppGraphValidationReport[];
