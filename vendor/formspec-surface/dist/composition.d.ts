/**
 * @filedesc Cross-surface composition — N Surface documents, one navigable app.
 *
 * A bundle manifest admits `surfaces[]`, each with its own `entry` route, and
 * nothing anywhere stated how they compose into one running app: whether they
 * share a URL space, which one the app opens on, or how an actor moves between
 * them. `surface-shell-spec.md` §2 states the rules; this implements them.
 *
 * 1. **One flat URL space, manifest order** (§2.1). Route paths are taken
 *    verbatim; Surfaces are not namespaced under a prefix, because `path` is
 *    authored as an absolute app path and prefixing would make the same route
 *    resolve at different URLs depending on manifest position.
 * 2. **A collision resolves to NO route** (§2.4). Both handles stay in the
 *    table and stay reachable by handle; the *address* answers with nothing and
 *    `ROUTE-PATH-COLLISION` names every member of the group. Picking a winner
 *    by declaration order is the fail-open shape: one signed, authored,
 *    validated route silently becomes unreachable and nothing on screen says
 *    so. Collision is tested over **patterns**, not authored strings — see
 *    `routePathPatternKey`.
 * 3. **App Manifest 2.4 selects one exact entry Surface** (§2.5), and that
 *    Surface's own `entry` selects the route. Selection is carried as the loaded
 *    Surface object so local ids and array order cannot become aliases. Older
 *    2.x callers that supply no selection retain their historical first-Surface
 *    rule. An unresolved selection or route yields no app entry at all.
 * 4. **A group's label is `surface.title ?? surface.id`, and nothing else.**
 *    `SurfaceDocument.title` is optional and the spike's bundle omits it on
 *    both Surfaces, which is how the spike ended up typing "For the person
 *    applying" into a shell. A shell inventing product copy for an artifact
 *    that declined to carry it is a shell putting words in the author's mouth.
 *    A host that wants better labels supplies
 *    {@link SurfaceCompositionOptions.surfaceLabel}; the default falls back to
 *    the id and the missing title stays visible.
 */
import type { SurfaceDocument } from '@formspec-org/types';
import { type SurfaceDiagnostic } from './diagnostics.js';
import { type RouteParamMarker, type RouteSegment, type SurfaceRoute } from './route-path.js';
export interface SurfaceRouteHandle {
    surface: SurfaceDocument;
    surfaceId: string;
    /** What a person reads above this Surface's routes in a navigation. */
    surfaceLabel: string;
    route: SurfaceRoute;
    routeId: string;
    /** The authored path, markers intact. */
    path: string;
    /** The parsed path. Literal-vs-parameter is decided once, here. */
    segments: readonly RouteSegment[];
    markers: readonly RouteParamMarker[];
    /** True when this route is its own Surface's `entry`. */
    isSurfaceEntry: boolean;
    /**
     * True when another composed route claims the same pattern. Such a route
     * keeps its handle and loses its address (§2.4).
     */
    pathCollides: boolean;
}
export interface SurfaceRouteGroup {
    surfaceId: string;
    label: string;
    routes: readonly SurfaceRouteHandle[];
}
export interface SurfaceApp {
    routes: readonly SurfaceRouteHandle[];
    groups: readonly SurfaceRouteGroup[];
    /**
     * Where the app opens: the selected Surface's entry route.
     * `undefined` when Surface or route selection failed; the shell reports
     * rather than searching (§2.5).
     */
    entry: SurfaceRouteHandle | undefined;
    diagnostics: readonly SurfaceDiagnostic[];
}
export interface SurfaceCompositionOptions {
    /**
     * Exact loaded Surface object selected by App Manifest 2.4.
     *
     * Omit or pass `undefined` only for a pre-2.4 caller, whose historical rule
     * selects the first Surface. `null` explicitly selects none and never falls
     * back by order.
     */
    entrySurface?: SurfaceDocument | null | undefined;
    /**
     * Host-supplied navigation label. Called only when the shell needs a label;
     * returning `undefined` falls back to `title ?? id`. This is the seam for a
     * host that has product copy the bundle does not carry — it is a host input,
     * not a shell invention.
     */
    surfaceLabel?: (surface: SurfaceDocument) => string | undefined;
}
export declare function composeSurfaceApp(surfaces: readonly SurfaceDocument[], options?: SurfaceCompositionOptions): SurfaceApp;
export interface SurfaceRouteMatch {
    handle: SurfaceRouteHandle;
    params: Readonly<Record<string, string>>;
}
/** Why an address answered with no route, when it did. */
export type SurfaceRouteRefusal = 
/** Nothing in the table matched. `ROUTE-UNMATCHED` is in `diagnostics`. */
'unmatched'
/**
 * Candidates matched and tied on specificity. `ROUTE-PATH-COLLISION` was
 * already reported once at compose time and is not repeated per navigation
 * (§7.3: `ROUTE-UNMATCHED` does not fire when the collision rule owns it).
 */
 | 'collision';
export interface SurfaceRouteResolution {
    match: SurfaceRouteMatch | undefined;
    /** Why `match` is absent. `undefined` when a route resolved. */
    refusal: SurfaceRouteRefusal | undefined;
    diagnostics: readonly SurfaceDiagnostic[];
}
/**
 * The route for an incoming path, plus what the shell has to say about it.
 *
 * Not a first-match scan. Every candidate that matches is collected, then §2.4's
 * specificity rule picks the one whose leftmost differing segment is literal.
 * A tie is a **collision** and resolves to no route: answering the URL with one
 * of them makes a signed, authored, validated route silently unreachable.
 *
 * Returning the resolution rather than `handle | undefined` is what closes the
 * `ROUTE-UNMATCHED` half — a state with no code is a state a host cannot act
 * on, and a broken deep link becomes invisible to operations.
 */
export declare function matchRoute(app: SurfaceApp, pathname: string): SurfaceRouteResolution;
/**
 * A candidate URL plus the reason it cannot become live navigation.
 *
 * Collision claimants retain their authored path and qualified route record,
 * but `refusal: "collision"` prevents bindings and transition handlers from
 * publishing that path as a destination. Markers with no supplied value stay
 * in the string and raise `ROUTE-PARAM-UNSUPPLIED`; their
 * `refusal: "parameters"` likewise prevents a link that goes nowhere. The
 * shell never substitutes the parameter's name or its `example`, which are the
 * two substitutions §2.7 forbids by name.
 */
export type SurfaceRouteHrefRefusal = 'collision' | 'parameters';
export declare function routeHref(handle: SurfaceRouteHandle, params?: Readonly<Record<string, string>>): {
    href: string;
    diagnostics: readonly SurfaceDiagnostic[];
    refusal: SurfaceRouteHrefRefusal | undefined;
};
/** The route a transition targets, resolved within the transition's own Surface. */
export declare function routeInSurface(app: SurfaceApp, surfaceId: string, routeId: string): SurfaceRouteHandle | undefined;
