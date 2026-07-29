/**
 * @filedesc Route path parsing, matching and filling.
 *
 * ## One grammar. `:name` is literal text.
 *
 * `surface-spec.md` §3 "Route Parameters" pins v0.1 parameters as **simple
 * URI-Template markers** — `/matter/{matterId}` — paired with a `params[]`
 * declaration, and explicitly excludes "colon-prefixed framework syntax as
 * normative parameter syntax". `surface-shell-spec.md` §2.3 states the
 * processor consequence: a `:name` segment, a `*` segment, or a regex is **not
 * a parameter**. Such a segment is a literal, and the shell reports
 * `ROUTE-PARAM-GRAMMAR`.
 *
 * The earlier implementation read both grammars so a signed bundle authoring
 * `/receipt/:caseRef` would not 404. That is the silent-alias shape
 * `token-registry-spec.md` §2.4 forbids by analogy: two grammars both appear to
 * work, the authoring tools are never corrected, and a second conforming
 * renderer 404s the same signed bundle. The counter-argument is real, and it is
 * why the repair is a `pattern` on `Route.path` plus authoring-tool emission
 * (**finding F8**) rather than a renderer that keeps reading both. The route
 * stays reachable by handle — `surface:<route-id>`, a transition, an
 * `embed-route`; only its URL address degrades, and it degrades loudly.
 *
 * ## Segments, not one big regex
 *
 * Matching is segment-wise (§2.3): split both sides on `/`, require equal
 * segment counts, compare literals by exact string after percent-decoding, and
 * let a parameter segment take any single non-empty segment. A compiled regex
 * was the previous shape and it had a defect the segment model cannot have: the
 * escaper skipped `{` and `}` because the marker grammar owned them, so an
 * authored literal `/a{2}` compiled to `^/a{2}/?$` and matched `/aa`. Here a
 * literal segment is compared with `===`; there is no pattern to escape and
 * nothing to get wrong.
 */
import type { SurfaceDocument } from '@formspec-org/types';
import { type SurfaceDiagnostic, type SurfaceDiagnosticSite } from './diagnostics.js';
export type SurfaceRoute = SurfaceDocument['routes'][number];
export interface RouteParamMarker {
    name: string;
}
/**
 * A parsed path segment. Only two kinds exist, which is the whole content of
 * §2.3: a segment either is exactly `{name}` or it is text.
 */
export type RouteSegment = {
    kind: 'literal';
    text: string;
} | {
    kind: 'param';
    name: string;
};
/** Which unpinned grammar a segment read as, for the diagnostic's `details`. */
export type UnpinnedGrammar = 
/** `:name` — Express style. */
'colon'
/** `*` or a `*`-prefixed catch-all. */
 | 'wildcard'
/** `(\d+)` and friends. */
 | 'regex'
/** `;k=v` matrix parameters. */
 | 'matrix'
/** A `?` in the authored path. Query strings are not part of the path. */
 | 'query'
/** `{+name}`, `{name*}`, `{a,b}` — RFC 6570 beyond simple expansion. */
 | 'uri-template-operator'
/** Braces that are not a valid marker: `/a{2}`, `/{}`, `/{1x}`. */
 | 'malformed-marker';
export interface UnpinnedSegment {
    segment: string;
    grammar: UnpinnedGrammar;
}
export interface ParsedRoutePath {
    segments: readonly RouteSegment[];
    markers: readonly RouteParamMarker[];
    unpinned: readonly UnpinnedSegment[];
}
/**
 * Split a path into segments, ignoring a trailing slash on a non-root path
 * (§2.3) so `/apply` and `/apply/` are the same address rather than two.
 */
export declare function routePathSegments(path: string): string[];
/**
 * The one parse every other function in this module goes through. Segments,
 * markers and unpinned grammars come out of the same walk, so a caller cannot
 * hold a marker list that disagrees with the segments it matches against.
 */
export declare function parseRoutePath(path: string): ParsedRoutePath;
export declare function routeParamMarkers(path: string): RouteParamMarker[];
/**
 * A path with every `{name}` marker replaced by a supplied value. A marker with
 * no value is left as-is rather than emptied: `/receipt/{caseRef}` is a broken
 * link, and `/receipt/` is a broken link that looks like a working one.
 *
 * Nothing else is substituted. `/receipt/:caseRef` comes back unchanged
 * whatever values are supplied, because `:caseRef` is literal text and a shell
 * that rewrote it would be deep-linking a grammar the spec does not admit.
 */
export declare function fillRoutePath(path: string, values: Readonly<Record<string, string>>): string;
/**
 * The pattern key two routes collide on: same segment count, same kind at every
 * index, same literal text at every literal index (§2.4).
 *
 * Collision is tested over **matching behaviour, not authored strings**. Two
 * `path` strings differing character-for-character still collide (`/m/{a}` and
 * `/m/{b}` are one address), and a raw-string comparison misses exactly the
 * cases that matter — `/m/{id}` vs `/m/:id`, where the second is genuinely
 * unreachable and a string compare never reports it.
 */
export declare function routePathPatternKey(path: string): string;
/**
 * Parameter values for `pathname`, or `undefined` when the route does not
 * match. An empty object is a match with no parameters — distinct from no
 * match, which is why this returns `undefined` rather than `{}` on failure.
 *
 * Query strings and fragments are not part of the path and MUST NOT participate
 * in matching (§2.3), so they are stripped from the incoming side before the
 * split. On the authored side they are a `ROUTE-PARAM-GRAMMAR` report and stay
 * in the literal, which is what makes such a route unmatchable rather than
 * accidentally matchable.
 */
export declare function matchRoutePath(path: string, pathname: string): Record<string, string> | undefined;
/** {@link matchRoutePath} against segments a caller already parsed. */
export declare function matchRouteSegments(segments: readonly RouteSegment[], pathname: string): Record<string, string> | undefined;
/**
 * Specificity between two routes that both match the same incoming path (§2.4).
 *
 * Compare segment by segment from the left. At the first index where they
 * differ in kind, the candidate with the literal segment wins. If no index
 * differs in kind, the candidates are **colliding** — `0`, which callers MUST
 * read as "resolve to neither" rather than as "pick the first".
 */
export declare function compareRouteSpecificity(a: readonly RouteSegment[], b: readonly RouteSegment[]): number;
/**
 * Everything the shell can say about a route's parameters without leaving the
 * document: which markers exist, which segments used a grammar v0.1 does not
 * pin, and where the markers and the `params[]` declaration disagree.
 *
 * The declaration checks mirror `surface-spec.md` §3 ("Every `{name}` marker in
 * `path` MUST have a matching `params[]` declaration"). Lint owns E610 for the
 * edge-completeness half; this owns the runtime half, because a shell that
 * cannot fill a marker cannot build a working link. **Both checks run whether
 * or not `params[]` is populated** — gating the undeclared-marker check on a
 * non-empty `params[]` exempts the shape most likely to occur, a path with
 * markers and no declaration at all.
 */
export declare function inspectRouteParams(route: SurfaceRoute, site: SurfaceDiagnosticSite): {
    markers: RouteParamMarker[];
    segments: readonly RouteSegment[];
    diagnostics: SurfaceDiagnostic[];
};
