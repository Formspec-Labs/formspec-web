/** @filedesc Advisory matching from Experience Need completion declarations to statically usable outputs. */
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
export declare const NEED_USABLE_OUTCOME_CODES: {
    readonly missing: "APP-GRAPH-NEED-USABLE-OUTCOME-MISSING";
    readonly proseOnly: "APP-GRAPH-NEED-USABLE-OUTCOME-PROSE-ONLY";
    readonly cantTell: "APP-GRAPH-NEED-USABLE-OUTCOME-CANT-TELL";
};
export declare const NEED_COMPLETION_SHAPES: readonly ["action", "submitted-definition", "resource", "navigation", "observable-result"];
export type NeedCompletionShape = typeof NEED_COMPLETION_SHAPES[number];
/**
 * Advisory usable-outcome profile.
 *
 * Callers opt in through `crossArtifactValidators`. A clean result means only
 * that the loaded static graph contains a directly current-Need-traced output
 * whose mounting and structural shape can be proven. This validator never
 * evaluates authorization, applicability, preconditions, effects, or runtime
 * completion, and it does not change ordinary Needs coverage.
 */
export declare function validateNeedUsableOutcomes(context: AppGraphContext): AppGraphDiagnostic[];
