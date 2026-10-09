/** @filedesc Screener surface:<route-id> terminal-hop validation for app graphs. */
import { isExactVersion } from './component-routes.js';
import { diagnosticSourceForHandle } from './report.js';
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function stringProp(value, key) {
    const candidate = value?.[key];
    return typeof candidate === 'string' ? candidate : undefined;
}
function handlesByKind(handles, artifactKind) {
    return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}
function screenerRefsFromManifest(manifest) {
    const screeners = record(manifest)?.screeners;
    if (!Array.isArray(screeners))
        return [];
    return screeners.flatMap((entry) => {
        const ref = record(entry);
        const url = stringProp(ref, 'url');
        if (!url)
            return [];
        return [{ url, version: stringProp(ref, 'version') }];
    });
}
function handleMatchesManifestRef(handle, ref) {
    const handleRef = record(handle.ref);
    if (stringProp(handleRef, 'url') !== ref.url)
        return false;
    return ref.version === undefined || stringProp(handleRef, 'version') === ref.version;
}
function associatedScreeners(context) {
    const refs = screenerRefsFromManifest(context.manifest.document);
    if (refs.length === 0)
        return [];
    return handlesByKind(context.handles, 'screener').filter((handle) => refs.some((ref) => handleMatchesManifestRef(handle, ref)));
}
function surfaceRoutes(handle) {
    const routes = record(handle.document)?.routes;
    if (!Array.isArray(routes))
        return [];
    return routes.flatMap((route, index) => {
        const routeRecord = record(route);
        const routeId = stringProp(routeRecord, 'id');
        return routeId ? [{ handle, index, routeId }] : [];
    });
}
function screenerSurfaceTargets(handle) {
    const evaluation = record(handle.document)?.evaluation;
    if (!Array.isArray(evaluation))
        return [];
    return evaluation.flatMap((phase, evaluationIndex) => {
        const routes = record(phase)?.routes;
        if (!Array.isArray(routes))
            return [];
        return routes.flatMap((route, routeIndex) => {
            const target = stringProp(record(route), 'target');
            if (!target?.startsWith('surface:'))
                return [];
            const routeId = target.slice('surface:'.length);
            return [{ evaluationIndex, routeIndex, target, routeId }];
        });
    });
}
function targetSource(handle, target) {
    return diagnosticSourceForHandle(handle, `/evaluation/${target.evaluationIndex}/routes/${target.routeIndex}/target`);
}
function routeIdSource(route) {
    return diagnosticSourceForHandle(route.handle, `/routes/${route.index}/id`);
}
function routesSource(handle) {
    return diagnosticSourceForHandle(handle, '/routes');
}
function diagnostic(message, primarySource, relatedSources, details) {
    return {
        code: 'APP-GRAPH-SCREENER-SURFACE-TARGET',
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message,
        primarySource,
        relatedSources,
        details,
    };
}
export function validateScreenerSurfaceTargets(context) {
    const surfaces = handlesByKind(context.handles, 'surface');
    const routes = surfaces.flatMap(surfaceRoutes);
    const diagnostics = [];
    for (const screener of associatedScreeners(context)) {
        for (const target of screenerSurfaceTargets(screener)) {
            const matches = routes.filter((route) => route.routeId === target.routeId);
            if (matches.length === 1)
                continue;
            diagnostics.push(diagnostic(matches.length === 0
                ? `Screener target '${target.target}' does not resolve to a loaded Surface route.`
                : `Screener target '${target.target}' resolves to multiple loaded Surface routes.`, targetSource(screener, target), matches.length === 0
                ? surfaces.map(routesSource)
                : matches.map(routeIdSource), matches.length === 0
                ? {
                    reason: 'route-unresolved',
                    target: target.target,
                    routeId: target.routeId,
                }
                : {
                    reason: 'route-ambiguous',
                    target: target.target,
                    routeId: target.routeId,
                    matches: matches.length,
                }));
        }
    }
    const refs = screenerRefsFromManifest(context.manifest.document);
    const loaded = handlesByKind(context.handles, 'screener');
    for (const surface of surfaces) {
        const document = record(surface.document);
        const authoredRoutes = document?.routes;
        if (!Array.isArray(authoredRoutes))
            continue;
        authoredRoutes.forEach((route, routeIndex) => {
            const slots = record(route)?.slots;
            if (!Array.isArray(slots))
                return;
            slots.forEach((slot, slotIndex) => {
                if (stringProp(record(slot), 'slotType') !== 'screener')
                    return;
                const binding = record(record(slot)?.binding);
                const url = stringProp(binding, 'screenerRef');
                const memberships = refs.filter(ref => ref.url === url);
                const matches = loaded.filter(handle => stringProp(record(handle.ref), 'url') === url);
                const ref = memberships.length === 1 ? memberships[0] : undefined;
                const screener = matches.length === 1 ? matches[0] : undefined;
                const allowed = binding?.allowedTargets;
                const authored = new Set(screener ? screenerSurfaceTargets(screener).map(target => target.target) : []);
                const reason = document?.$formspecSurface !== '0.3' ? 'surface-version-unsupported'
                    : !ref || !isExactVersion(ref.version) || !screener || stringProp(record(screener.ref), 'version') !== ref.version || stringProp(record(screener.document), 'url') !== url || stringProp(record(screener.document), 'version') !== ref.version ? 'screener-pin-unresolved'
                        : !Array.isArray(allowed) || !allowed.length || new Set(allowed).size !== allowed.length || allowed.some(target => typeof target !== 'string' || !authored.has(target) || routes.filter(route => `surface:${route.routeId}` === target).length !== 1) ? 'allowed-target-invalid' : undefined;
                if (reason)
                    diagnostics.push(diagnostic('Native Screener slot cannot resolve its exact Screener and allowed destinations.', diagnosticSourceForHandle(surface, `/routes/${routeIndex}/slots/${slotIndex}/binding`), undefined, { reason }));
            });
        });
    }
    return diagnostics;
}
