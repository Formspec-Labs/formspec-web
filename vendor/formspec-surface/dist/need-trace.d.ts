/** @filedesc Canonical Need-anchor extraction shared by Surface planners and bindings. */
export declare function isCanonicalNeedAnchor(value: unknown): value is string;
export declare function generationNeedAnchors(value: unknown): string[];
export declare function mergeNeedAnchors(...groups: readonly (readonly string[] | undefined)[]): string[];
