/**
 * @filedesc Dotted path normalization and tree item navigation by path.
 *
 * Paths use dot notation: `group.field`, `parent.child.leaf`.
 * Indices `[N]` and wildcards `[*]` are supported.
 */
/** The kind of path segment. */
export declare enum PathSegmentKind {
    /** Exact key: `name` */
    Exact = 0,
    /** Wildcard: `[*]` */
    Wildcard = 1,
    /** Numeric index: `[0]` */
    Indexed = 2,
    /** Special index or property: `[@index]` */
    Special = 3
}
/** A single segment in a dotted path. */
export type PathSegment = {
    kind: PathSegmentKind.Exact;
    key: string;
} | {
    kind: PathSegmentKind.Wildcard;
} | {
    kind: PathSegmentKind.Indexed;
    index: number;
} | {
    kind: PathSegmentKind.Special;
    content: string;
};
/** A parsed dotted path. */
export declare class Path {
    readonly segments: PathSegment[];
    constructor(segments: PathSegment[]);
    /**
     * Parse a dotted path string into a Path object.
     * Handles `a.b.c`, `a[0].b`, `a[*].b`, and `a[@index]`.
     */
    static parse(s: string | null | undefined): Path;
    /** Returns the constituent segments as an array of strings (Exact keys only). */
    splitNormalized(): string[];
    /** Returns the "base" path string with all indices and wildcards removed. */
    stripIndices(): string;
    /** Returns the last segment key as a string. */
    leafKey(): string;
    /** Returns the parent path as a string. */
    parentString(): string;
    /** Serialize back to dotted notation. */
    toString(): string;
}
