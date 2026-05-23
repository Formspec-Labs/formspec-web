/**
 * @filedesc Dotted path normalization and tree item navigation by path.
 *
 * Paths use dot notation: `group.field`, `parent.child.leaf`.
 * Indices `[N]` and wildcards `[*]` are supported.
 */
/** The kind of path segment. */
export var PathSegmentKind;
(function (PathSegmentKind) {
    /** Exact key: `name` */
    PathSegmentKind[PathSegmentKind["Exact"] = 0] = "Exact";
    /** Wildcard: `[*]` */
    PathSegmentKind[PathSegmentKind["Wildcard"] = 1] = "Wildcard";
    /** Numeric index: `[0]` */
    PathSegmentKind[PathSegmentKind["Indexed"] = 2] = "Indexed";
    /** Special index or property: `[@index]` */
    PathSegmentKind[PathSegmentKind["Special"] = 3] = "Special";
})(PathSegmentKind || (PathSegmentKind = {}));
/** A parsed dotted path. */
export class Path {
    constructor(segments) {
        this.segments = segments;
    }
    /**
     * Parse a dotted path string into a Path object.
     * Handles `a.b.c`, `a[0].b`, `a[*].b`, and `a[@index]`.
     */
    static parse(s) {
        if (!s)
            return new Path([]);
        const segments = [];
        let current = '';
        let i = 0;
        while (i < s.length) {
            const char = s[i];
            if (char === '.') {
                if (current) {
                    segments.push({ kind: PathSegmentKind.Exact, key: current });
                    current = '';
                }
                i++;
            }
            else if (char === '[') {
                if (current) {
                    segments.push({ kind: PathSegmentKind.Exact, key: current });
                    current = '';
                }
                const start = i + 1;
                let end = start;
                while (end < s.length && s[end] !== ']') {
                    end++;
                }
                if (end < s.length) {
                    const content = s.slice(start, end);
                    if (content === '*') {
                        segments.push({ kind: PathSegmentKind.Wildcard });
                    }
                    else if (/^\d+$/.test(content)) {
                        // Strict non-negative integer to match Rust `content.parse::<usize>()`.
                        // `parseInt` is too lenient: it accepts `0abc`, `-5`, `1e3`, etc.,
                        // and would produce silent cross-runtime drift vs Rust.
                        segments.push({ kind: PathSegmentKind.Indexed, index: Number(content) });
                    }
                    else {
                        segments.push({ kind: PathSegmentKind.Special, content });
                    }
                    i = end + 1;
                }
                else {
                    // Unclosed bracket, treat remainder as part of current segment
                    current += '[';
                    i++;
                }
            }
            else {
                current += char;
                i++;
            }
        }
        if (current) {
            segments.push({ kind: PathSegmentKind.Exact, key: current });
        }
        return new Path(segments);
    }
    /** Returns the constituent segments as an array of strings (Exact keys only). */
    splitNormalized() {
        return this.segments
            .filter((s) => s.kind === PathSegmentKind.Exact)
            .map((s) => s.key);
    }
    /** Returns the "base" path string with all indices and wildcards removed. */
    stripIndices() {
        return this.splitNormalized().join('.');
    }
    /** Returns the last segment key as a string. */
    leafKey() {
        const last = this.segments[this.segments.length - 1];
        if (!last)
            return '';
        if (last.kind === PathSegmentKind.Exact)
            return last.key;
        if (last.kind === PathSegmentKind.Wildcard)
            return '[*]';
        if (last.kind === PathSegmentKind.Indexed)
            return `[${last.index}]`;
        return `[${last.content}]`;
    }
    /** Returns the parent path as a string. */
    parentString() {
        if (this.segments.length === 0)
            return '';
        const parent = new Path(this.segments.slice(0, -1));
        return parent.toString();
    }
    /** Serialize back to dotted notation. */
    toString() {
        let result = '';
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (i > 0 && seg.kind === PathSegmentKind.Exact) {
                result += '.';
            }
            switch (seg.kind) {
                case PathSegmentKind.Exact:
                    result += seg.key;
                    break;
                case PathSegmentKind.Wildcard:
                    result += '[*]';
                    break;
                case PathSegmentKind.Indexed:
                    result += `[${seg.index}]`;
                    break;
                case PathSegmentKind.Special:
                    result += `[${seg.content}]`;
                    break;
                default:
                    break;
            }
        }
        return result;
    }
}
