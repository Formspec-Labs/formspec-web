/** @filedesc Plan an explicit creation control and qualify its store-returned destination. */
import { parseRouteSubjectKey, resolveDraftStartTarget } from '@formspec-org/app-graph';
import { formHref, matchRoute, routeHref } from './composition.js';
export function planDraftStart(app, handle, source, binding, definitions, params) {
    if (handle.surface.$formspecSurface !== '0.4')
        return;
    const target = resolveDraftStartTarget(handle.surface.routes, source, binding, ref => definitions.get(ref));
    if (!target)
        return;
    const destination = app.routes.find(candidate => candidate.surface === handle.surface && candidate.route === target.route);
    if (!destination || destination.pathCollides)
        return;
    const inherited = [];
    for (const param of target.inherited) {
        if (!Object.hasOwn(params, param) || !params[param])
            return;
        inherited.push([param, params[param]]);
    }
    const parents = [];
    for (const { key, parameter, dataType, minted } of target.keys) {
        if (minted)
            continue;
        const value = parseRouteSubjectKey(dataType, params[parameter]);
        if (value === undefined)
            return;
        parents.push([key, value]);
    }
    return { app, destination, label: target.label, slotId: target.slotId, keys: target.keys, params: Object.fromEntries(inherited),
        definitionUrl: target.definition.url, definitionVersion: target.definition.version,
        subject: { type: target.type, keys: Object.fromEntries(parents) } };
}
export function draftStartHref(plan, subject) {
    if (subject.type !== plan.subject.type || Object.keys(subject.keys).length !== plan.keys.length)
        return;
    const minted = [];
    for (const { key, minted: assigned, parameter } of plan.keys) {
        if (!Object.hasOwn(subject.keys, key))
            return;
        const value = subject.keys[key];
        if (assigned) {
            if (typeof value !== 'string' || !value)
                return;
            minted.push([parameter, value]);
        }
        else if (value !== plan.subject.keys[key])
            return;
    }
    const link = routeHref(plan.destination, { ...plan.params, ...Object.fromEntries(minted) });
    if (link.refusal || matchRoute(plan.app, link.href).match?.handle !== plan.destination)
        return;
    return formHref(link.href, plan.slotId);
}
