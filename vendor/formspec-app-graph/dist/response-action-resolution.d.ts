/** @filedesc Shared Response Actions identity and trigger resolution. */
import type { ResolvedArtifactHandle } from './types.js';
/**
 * Closed-core intents a Surface transition may use as an action selector.
 */
export declare const CLOSED_RESPONSE_ACTION_INTENTS: ReadonlySet<string>;
export interface ResponseActionReference {
    id: string;
    intent?: string;
    scope: 'app' | 'response' | 'invalid';
    targetDefinition?: string;
    handle: ResolvedArtifactHandle;
    actionIndex: number;
}
export interface ResponseActionReferences {
    actionIds: Set<string>;
    closedIntentActionIds: Map<string, string[]>;
    actions: ResponseActionReference[];
}
export declare function responseActionReferences(handles: readonly ResolvedArtifactHandle[]): ResponseActionReferences;
/**
 * Resolve a Surface transition trigger to exact action IDs.
 *
 * A direct id must identify exactly one loaded action. A closed intent must
 * likewise select exactly one loaded action. Ambiguous and unresolved values
 * return undefined so callers never choose by document order.
 */
export declare function resolvedActionIds(trigger: string, references: ResponseActionReferences): string[] | undefined;
