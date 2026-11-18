/** @filedesc Opt-in strict validation from every authored render node to an adopted, current Need. */
import { type RenderedNeedTraceNode as ReportTraceNode } from '@formspec-org/types';
import { type AppGraphContext, type AppGraphDiagnostic, type AppGraphRenderedNeedTraceRequest, type AppGraphRenderedNeedTraceRecord, type AppGraphSourcePointer, type ResolvedArtifactHandle } from './types.js';
type JsonRecord = Record<string, unknown>;
export declare const RENDERED_NEED_TRACE_CODES: {
    readonly needsUnpaired: "APP-GRAPH-RENDERED-NEEDS-UNPAIRED";
    readonly missing: "APP-GRAPH-RENDERED-NEED-MISSING";
    readonly unresolved: "APP-GRAPH-RENDERED-NEED-UNRESOLVED";
    readonly nonAdopted: "APP-GRAPH-RENDERED-NEED-NON-ADOPTED";
    readonly stale: "APP-GRAPH-RENDERED-NEED-STALE";
    readonly redundant: "APP-GRAPH-RENDERED-NEED-REDUNDANT";
    readonly scopeUnknown: "APP-GRAPH-RENDERED-NODE-SCOPE-UNKNOWN";
    readonly inventoryInvalid: "APP-GRAPH-RENDERED-NODE-INVENTORY-INVALID";
    readonly navigationImplicit: "APP-GRAPH-RENDERED-NAVIGATION-IMPLICIT";
};
export interface RenderedNeedTraceAnchor {
    readonly raw: string;
    readonly needId: string;
    readonly revision: number;
    readonly pointer: string;
}
export interface RenderedNeedTraceInvalidAnchor {
    readonly raw: unknown;
    readonly pointer: string;
    readonly reason: 'need-anchor-not-string' | 'need-anchor-malformed';
}
export interface RenderedNeedTraceTypedNeedRef {
    readonly needId: string;
    readonly pointer: string;
    readonly description?: string;
}
export interface RenderedNeedTraceCollectionFailure {
    readonly code: string;
    readonly message: string;
    readonly reason: string;
    readonly details?: Readonly<JsonRecord>;
    readonly relatedSources?: readonly AppGraphSourcePointer[];
}
/**
 * One authored node whose own content can render in a normal product view.
 *
 * `anchors` contains only canonical, direct `need:<id>@<revision>` links.
 * `invalidAnchors` preserves explicit but malformed links for the strict
 * validator. Neither list includes a parent or sibling node's generation data.
 */
export interface RenderedNeedTraceNode extends ReportTraceNode {
    readonly pointer: string;
    readonly anchors: readonly RenderedNeedTraceAnchor[];
    readonly invalidAnchors: readonly RenderedNeedTraceInvalidAnchor[];
    readonly typedNeedRefs?: readonly RenderedNeedTraceTypedNeedRef[];
    readonly failure?: RenderedNeedTraceCollectionFailure;
}
/** Each authored render node, its direct citations, and its effective publication trace. */
export declare function collectRenderedNeedTraceNodes(context: AppGraphContext, previewScenarios?: readonly ResolvedArtifactHandle[]): readonly RenderedNeedTraceNode[];
/**
 * Strict data-only authoring profile.
 *
 * Trace roots and overrides carry direct traces. Other Definition and Screener
 * nodes inherit through the App Graph owner table. The caller pairs a Needs
 * 1.0 document and each trace resolves to an unambiguous, adopted, current Need.
 *
 * This validator is intentionally not part of AppGraph's built-in set. General
 * Needs coverage remains report-only; callers opt into this error-severity
 * profile through `crossArtifactValidators`.
 */
export declare function validateRenderedNeedTrace(context: AppGraphContext, previewScenarios?: readonly ResolvedArtifactHandle[]): AppGraphDiagnostic[];
/**
 * Run the strict profile under `mode` and return its findings with the
 * report record (Needs spec S10.3) that lets a server check the run instead of
 * re-running it. `definitions` names every loaded Definition the run covered.
 */
export declare function runRenderedNeedTrace(context: AppGraphContext, request: AppGraphRenderedNeedTraceRequest): {
    diagnostics: AppGraphDiagnostic[];
    record: AppGraphRenderedNeedTraceRecord;
};
export {};
