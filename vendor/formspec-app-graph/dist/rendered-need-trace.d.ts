/** @filedesc Opt-in strict validation from every authored render node to an adopted, current Need. */
import { type AppGraphContext, type AppGraphDiagnostic, type AppGraphSourcePointer, type ResolvedArtifactHandle } from './types.js';
type JsonRecord = Record<string, unknown>;
export declare const RENDERED_NEED_TRACE_CODES: {
    readonly needsUnpaired: "APP-GRAPH-RENDERED-NEEDS-UNPAIRED";
    readonly missing: "APP-GRAPH-RENDERED-NEED-MISSING";
    readonly unresolved: "APP-GRAPH-RENDERED-NEED-UNRESOLVED";
    readonly nonAdopted: "APP-GRAPH-RENDERED-NEED-NON-ADOPTED";
    readonly stale: "APP-GRAPH-RENDERED-NEED-STALE";
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
export interface RenderedNeedTraceNode {
    readonly source: AppGraphSourcePointer;
    readonly kind: string;
    readonly pointer: string;
    readonly label: string;
    readonly anchors: readonly RenderedNeedTraceAnchor[];
    readonly invalidAnchors: readonly RenderedNeedTraceInvalidAnchor[];
    readonly typedNeedRefs?: readonly RenderedNeedTraceTypedNeedRef[];
    readonly failure?: RenderedNeedTraceCollectionFailure;
}
/**
 * Enumerate every authored node that can render in the normal product.
 *
 * This is the authoritative inventory used by strict rendered-Need validation.
 * Consumers may inspect it for review or reporting, but must not infer anchors
 * from a parent, sibling, mounted slot, or related Experience unit.
 *
 * Preview scenarios are supplied separately because they are preview-only
 * inputs, not App Manifest members. Pass loaded handles whose documents use
 * `$formspecSurfaceScenario: "0.1"` to preserve exact source identity.
 */
export declare function collectRenderedNeedTraceNodes(context: AppGraphContext, previewScenarios?: readonly ResolvedArtifactHandle[]): readonly RenderedNeedTraceNode[];
/**
 * Strict data-only authoring profile.
 *
 * The caller must pair at least one valid Needs 1.0 document, and every authored
 * node that directly controls product rendering must carry its own
 * `need:<id>@<revision>` trace. A parent node's anchor never covers a child.
 * The target must be unambiguous, adopted, and pinned to its current revision.
 *
 * This validator is intentionally not part of AppGraph's built-in set. General
 * Needs coverage remains report-only; callers opt into this error-severity
 * profile through `crossArtifactValidators`.
 */
export declare function validateRenderedNeedTrace(context: AppGraphContext, previewScenarios?: readonly ResolvedArtifactHandle[]): AppGraphDiagnostic[];
export {};
