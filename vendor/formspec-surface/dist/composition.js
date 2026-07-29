import { surfaceDiagnostic } from './diagnostics.js';
import { compareRouteSpecificity, fillRoutePath, inspectRouteParams, matchRouteSegments, routePathPatternKey, } from './route-path.js';
export function composeSurfaceApp(surfaces, options = {}) {
    const diagnostics = [];
    const routes = [];
    const groups = [];
    const byPattern = new Map();
    const byHandle = new Map();
    /** Per-Surface entry handle, in manifest order. */
    const surfaceEntries = [];
    for (const surface of surfaces) {
        const surfaceId = surface.id;
        const label = options.surfaceLabel?.(surface) ?? surface.title ?? surfaceId;
        const groupRoutes = [];
        let surfaceEntry;
        for (const route of surface.routes) {
            const site = { surfaceId, routeId: route.id };
            const inspected = inspectRouteParams(route, site);
            diagnostics.push(...inspected.diagnostics);
            const handle = {
                surface,
                surfaceId,
                surfaceLabel: label,
                route,
                routeId: route.id,
                path: route.path,
                segments: inspected.segments,
                markers: inspected.markers,
                isSurfaceEntry: route.id === surface.entry,
                pathCollides: false,
            };
            if (handle.isSurfaceEntry && surfaceEntry === undefined)
                surfaceEntry = handle;
            const pattern = routePathPatternKey(route.path);
            const claimants = byPattern.get(pattern);
            if (claimants)
                claimants.push(handle);
            else
                byPattern.set(pattern, [handle]);
            const handleKey = `${surfaceId}\u0000${route.id}`;
            const handleClaimants = byHandle.get(handleKey);
            if (handleClaimants)
                handleClaimants.push(handle);
            else
                byHandle.set(handleKey, [handle]);
            routes.push(handle);
            groupRoutes.push(handle);
        }
        if (surfaceEntry === undefined) {
            diagnostics.push(surfaceDiagnostic('SURFACE-ENTRY-UNRESOLVED', `Surface "${surfaceId}" names entry route "${surface.entry}", which it does not declare.`, { surfaceId }, { entry: surface.entry }));
        }
        surfaceEntries.push(surfaceEntry);
        groups.push({ surfaceId, label, routes: groupRoutes });
    }
    // One diagnostic per colliding GROUP, naming every member (§7.3). Fired after
    // the walk because a group is not known to be one until its second member
    // arrives, and reporting per-arrival would name only half the group.
    for (const [pattern, claimants] of byPattern) {
        if (claimants.length < 2)
            continue;
        const members = claimants.map((handle) => `${handle.surfaceId}/${handle.routeId}`);
        for (const handle of claimants)
            handle.pathCollides = true;
        diagnostics.push(surfaceDiagnostic('ROUTE-PATH-COLLISION', `Routes ${members.map((member) => `"${member}"`).join(' and ')} claim the same address (${claimants
            .map((handle) => `"${handle.path}"`)
            .join(', ')}). The shell answers that address with none of them. Their qualified route records remain available to the host, but the shell promises no person-facing route to either claimant.`, { surfaceId: claimants[0]?.surfaceId ?? '', routeId: claimants[0]?.routeId ?? '' }, { pattern, routes: members, paths: claimants.map((handle) => handle.path) }));
    }
    const ambiguousHandles = new Set();
    for (const [handleKey, claimants] of byHandle) {
        if (claimants.length < 2)
            continue;
        ambiguousHandles.add(handleKey);
        const members = claimants.map((handle) => `${handle.surfaceId}/${handle.routeId}`);
        diagnostics.push(surfaceDiagnostic('ROUTE-HANDLE-AMBIGUOUS', `Route handle "${members[0]}" names more than one route. The shell resolves the handle to none of them.`, {
            surfaceId: claimants[0]?.surfaceId ?? '',
            routeId: claimants[0]?.routeId ?? '',
        }, {
            routes: members,
            paths: claimants.map((handle) => handle.path),
        }));
    }
    const selectedSurface = options.entrySurface === undefined
        ? surfaces[0]
        : options.entrySurface;
    const selectedSurfaceIndexes = selectedSurface === null || selectedSurface === undefined
        ? []
        : surfaces.flatMap((surface, index) => (surface === selectedSurface ? [index] : []));
    if (selectedSurface !== null &&
        selectedSurface !== undefined &&
        selectedSurfaceIndexes.length !== 1) {
        diagnostics.push(surfaceDiagnostic('APP-ENTRY-SURFACE-UNRESOLVED', 'The selected entry Surface does not identify exactly one composed Surface object.', {}, {
            reason: 'entry-surface-object-unresolved',
            loadedMatches: selectedSurfaceIndexes.length,
        }));
    }
    // §2.5: only the selected Surface's entry, or nothing. Never another Surface's.
    const selectedSurfaceIndex = selectedSurfaceIndexes.length === 1
        ? selectedSurfaceIndexes[0]
        : undefined;
    const candidateEntry = selectedSurfaceIndex === undefined
        ? undefined
        : surfaceEntries[selectedSurfaceIndex];
    const entry = candidateEntry === undefined ||
        ambiguousHandles.has(`${candidateEntry.surfaceId}\u0000${candidateEntry.routeId}`)
        ? undefined
        : candidateEntry;
    return { routes, groups, entry, diagnostics };
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
export function matchRoute(app, pathname) {
    const candidates = [];
    for (const handle of app.routes) {
        const params = matchRouteSegments(handle.segments, pathname);
        if (params)
            candidates.push({ handle, params });
    }
    if (candidates.length === 0) {
        return {
            match: undefined,
            refusal: 'unmatched',
            diagnostics: [
                surfaceDiagnostic('ROUTE-UNMATCHED', `No page in this app answers "${pathname}".`, {}, { path: pathname }),
            ],
        };
    }
    let best = candidates[0];
    let tied = false;
    for (const candidate of candidates.slice(1)) {
        const order = compareRouteSpecificity(candidate.handle.segments, best.handle.segments);
        if (order > 0) {
            best = candidate;
            tied = false;
        }
        else if (order === 0) {
            tied = true;
        }
    }
    if (tied)
        return { match: undefined, refusal: 'collision', diagnostics: [] };
    return { match: { handle: best.handle, params: best.params }, refusal: undefined, diagnostics: [] };
}
export function routeHref(handle, params = {}) {
    const missing = handle.markers.filter((marker) => params[marker.name] === undefined);
    const diagnostics = missing.map((marker) => surfaceDiagnostic('ROUTE-PARAM-UNSUPPLIED', `Route "${handle.surfaceId}/${handle.routeId}" needs a value for "${marker.name}" before it can be linked to. Nothing in the bundle supplies one.`, { surfaceId: handle.surfaceId, routeId: handle.routeId }, { path: handle.path, name: marker.name }));
    const refusal = handle.pathCollides
        ? 'collision'
        : diagnostics.length > 0
            ? 'parameters'
            : undefined;
    return { href: fillRoutePath(handle.path, params), diagnostics, refusal };
}
/** The route a transition targets, resolved within the transition's own Surface. */
export function routeInSurface(app, surfaceId, routeId) {
    const matches = app.routes.filter((handle) => handle.surfaceId === surfaceId && handle.routeId === routeId);
    return matches.length === 1 ? matches[0] : undefined;
}
