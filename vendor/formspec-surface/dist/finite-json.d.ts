/** @filedesc Detached finite JSON snapshots and deterministic private replay identity. */
/** Fixed diagnostic categories; never include response values, keys, or paths. */
export type FiniteJsonSnapshotRefusalReason = "node-limit" | "depth-limit" | "non-finite-number" | "invalid-json-shape";
/** A snapshot refusal remains a TypeError with its original message and name. */
export declare class FiniteJsonSnapshotError extends TypeError {
    readonly reason: FiniteJsonSnapshotRefusalReason;
    constructor(reason: FiniteJsonSnapshotRefusalReason, message: string);
}
/** Classify only owning helper errors; do not inspect arbitrary error properties. */
export declare function finiteJsonSnapshotRefusalReason(error: unknown): FiniteJsonSnapshotRefusalReason | undefined;
/** Explicit traversal capacity for a caller-owned record or aggregate boundary. */
export interface FiniteJsonSnapshotPolicy {
    readonly maxNodes: number;
}
export type FiniteJsonValue = null | boolean | number | string | readonly FiniteJsonValue[] | {
    [key: string]: FiniteJsonValue;
};
export declare function canonicalFiniteJson(value: FiniteJsonValue): string;
/**
 * Preserve JSON data and reject accessors without invoking them. Not schema validation.
 * Explicit policies change only traversal capacity; callers must budget complete
 * records and aggregates independently. Depth and JSON-shape guards remain fixed.
 */
export declare function snapshotFiniteJson(value: unknown, immutable?: boolean, policy?: FiniteJsonSnapshotPolicy): FiniteJsonValue;
