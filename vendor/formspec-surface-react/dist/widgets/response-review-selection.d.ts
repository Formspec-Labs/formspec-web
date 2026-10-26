export interface AcceptedReviewFieldSelection {
    /** Canonical authored native paths; retained separately from the complete Response. */
    readonly fieldPaths: readonly string[];
    /** True only for a declared selected leaf (including a concrete repeated row). */
    includes(path: string): boolean;
    /** True when a group/row contains at least one selected declared leaf. */
    contains(path: string): boolean;
}
/** Resolve against the Definition, so an absent optional answer is still a valid selector.
 * Wildcards expand only while walking recorded group rows; they never select unknown keys.
 * This is a display policy and establishes no authorization or Response integrity. */
export declare function createAcceptedReviewFieldSelection(items: unknown, fieldPaths: unknown): AcceptedReviewFieldSelection;
/** Expand selected declared fields to concrete recorded paths, never to unknown answers.
 * Selected optional fields without values contribute no path. Malformed selected groups
 * fail closed rather than exposing their raw object/array as a fallback. */
export declare function resolveAcceptedReviewFieldPaths(items: unknown, responseData: unknown, fieldPaths: unknown): readonly string[];
export interface AcceptedResponseReviewFieldSelectionPolicy {
    /** Authored display identity; grants no access or signing authority. */
    readonly policyId: string;
    readonly definitionUrl: string;
    readonly definitionVersion: string;
    readonly fieldPaths: readonly string[];
}
export interface AcceptedResponseReviewFieldSelection {
    readonly policyId: string;
    readonly definitionUrl: string;
    readonly definitionVersion: string;
    /** Sorted concrete recorded declared leaf paths; optional absent answers are omitted. */
    readonly permittedPaths: readonly string[];
}
/** Same maintained resolver for qualified host presentation and renderer admission. */
export declare function resolveAcceptedResponseReviewFieldSelection(definition: import('@formspec-org/types').FormDefinition, response: import('@formspec-org/types').FormResponse, policy: AcceptedResponseReviewFieldSelectionPolicy): AcceptedResponseReviewFieldSelection;
