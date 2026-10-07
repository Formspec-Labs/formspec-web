/** @filedesc Detached finite JSON snapshots and deterministic private replay identity. */
export type FiniteJsonValue = null | boolean | number | string | readonly FiniteJsonValue[] | {
    [key: string]: FiniteJsonValue;
};
export declare function canonicalFiniteJson(value: FiniteJsonValue): string;
/** Preserve JSON data and reject accessors without invoking them. Not schema validation. */
export declare function snapshotFiniteJson(value: unknown, immutable?: boolean): FiniteJsonValue;
