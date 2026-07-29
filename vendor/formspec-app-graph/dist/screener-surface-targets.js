/** @filedesc Screener surface:<route-id> terminal-hop validation for app graphs. */
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
    return diagnostics;
}
