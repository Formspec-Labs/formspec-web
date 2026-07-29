/** @filedesc Surface transition trigger validation against Response Actions. */
import { diagnosticSourceForHandle } from './report.js';
import { CLOSED_RESPONSE_ACTION_INTENTS, resolvedActionIds, responseActionReferences, } from './response-action-resolution.js';
import { routeHasWidgetActionSource } from './surface-widget-actions.js';
export { CLOSED_RESPONSE_ACTION_INTENTS } from './response-action-resolution.js';
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function stringProp(value, key) {
    const candidate = value && Object.prototype.hasOwnProperty.call(value, key)
        ? value[key]
        : undefined;
    return typeof candidate === 'string' ? candidate : undefined;
}
function ownProp(value, key) {
    return value && Object.prototype.hasOwnProperty.call(value, key)
        ? value[key]
        : undefined;
}
function recordArray(value) {
    if (!Array.isArray(value))
        return [];
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index))
            continue;
        const item = record(value[index]);
        if (item)
            items.push(item);
    }
    return items;
}
function handlesByKind(handles, artifactKind) {
    return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}
function transitionTriggers(surface) {
    const routes = ownProp(record(surface.document), 'routes');
    return recordArray(routes).flatMap((routeRecord, routeIndex) => {
        const transitions = recordArray(ownProp(routeRecord, 'transitions'));
        return transitions.flatMap((transition, transitionIndex) => {
            const trigger = stringProp(transition, 'trigger');
            if (trigger === undefined)
                return [];
            return [{
                    routeIndex,
                    transitionIndex,
                    routeId: stringProp(routeRecord, 'id'),
                    route: routeRecord,
                    trigger,
                }];
        });
    });
}
function triggerSource(surface, trigger) {
    return diagnosticSourceForHandle(surface, `/routes/${trigger.routeIndex}/transitions/${trigger.transitionIndex}/trigger`);
}
function responseActionsSources(handles) {
    return handlesByKind(handles, 'responseActions').map((handle) => diagnosticSourceForHandle(handle, '/actions'));
}
function diagnostic(surface, trigger, references, handles, reason) {
    const knownActions = [...references.actionIds].sort();
    const matchingActionIds = references.closedIntentActionIds.get(trigger.trigger) ?? [];
    return {
        code: 'APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER',
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message: `Surface route '${trigger.routeId ?? '<unknown>'}' transition trigger '${trigger.trigger}' does not resolve to a loaded Response Actions action id or to exactly one loaded Response Actions action with that closed intent.`,
        primarySource: triggerSource(surface, trigger),
        relatedSources: responseActionsSources(handles),
        details: {
            reason,
            routeId: trigger.routeId,
            trigger: trigger.trigger,
            closedIntents: [...CLOSED_RESPONSE_ACTION_INTENTS].sort(),
            knownActionIds: knownActions,
            matchingActionIds: matchingActionIds.sort(),
        },
    };
}
function definitionRefForSlot(slot) {
    if (stringProp(slot, 'slotType') !== 'definition-form')
        return undefined;
    return stringProp(record(ownProp(slot, 'binding')), 'definitionRef');
}
function embeddedRouteRefForSlot(slot) {
    if (stringProp(slot, 'slotType') !== 'embed-route')
        return undefined;
    return stringProp(record(ownProp(slot, 'binding')), 'routeRef');
}
function routeHasTriggerSource(context, surface, trigger, actionIds, references) {
    const routesValue = ownProp(record(surface.document), 'routes');
    const routes = recordArray(routesValue);
    const routesById = new Map();
    for (const route of routes) {
        const id = stringProp(route, 'id');
        if (!id)
            continue;
        routesById.set(id, [...(routesById.get(id) ?? []), route]);
    }
    const visited = new Set();
    const walk = (route) => {
        if (visited.has(route))
            return false;
        visited.add(route);
        const slots = recordArray(ownProp(route, 'slots'));
        for (const slot of slots) {
            const definitionRef = definitionRefForSlot(slot);
            if (definitionRef !== undefined &&
                references.actions.some((action) => actionIds.includes(action.id) &&
                    action.targetDefinition === definitionRef)) {
                return true;
            }
            const routeRef = embeddedRouteRefForSlot(slot);
            if (!routeRef)
                continue;
            const embedded = routesById.get(routeRef) ?? [];
            if (embedded.length === 1 && walk(embedded[0]))
                return true;
        }
        return false;
    };
    return walk(trigger.route)
        || routeHasWidgetActionSource(context, surface, trigger.route, actionIds);
}
function unfireableDiagnostic(surface, trigger, actionIds, handles) {
    return {
        code: 'E611',
        severity: 'warning',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message: `Surface route '${trigger.routeId ?? '<unknown>'}' transition trigger '${trigger.trigger}' resolves, but no definition-form or Registry-declared module-widget source on that route or an embedded route can produce the matching action.`,
        primarySource: triggerSource(surface, trigger),
        relatedSources: responseActionsSources(handles),
        details: {
            reason: 'transition-unfireable',
            routeId: trigger.routeId,
            trigger: trigger.trigger,
            resolvedActionIds: [...actionIds].sort(),
            triggerSourceSlotTypes: ['definition-form', 'module-widget', 'embed-route'],
        },
    };
}
export function validateSurfaceResponseActionTriggers(context) {
    const references = responseActionReferences(context.handles);
    const diagnostics = [];
    for (const surface of handlesByKind(context.handles, 'surface')) {
        for (const trigger of transitionTriggers(surface)) {
            let actionIds = resolvedActionIds(trigger.trigger, references);
            if (actionIds === undefined && CLOSED_RESPONSE_ACTION_INTENTS.has(trigger.trigger)) {
                const matches = references.closedIntentActionIds.get(trigger.trigger) ?? [];
                diagnostics.push(diagnostic(surface, trigger, references, context.handles, matches.length === 0 ? 'closed-intent-unresolved' : 'closed-intent-ambiguous'));
                continue;
            }
            if (actionIds === undefined) {
                diagnostics.push(diagnostic(surface, trigger, references, context.handles, 'trigger-unresolved'));
                continue;
            }
            if (!routeHasTriggerSource(context, surface, trigger, actionIds, references)) {
                diagnostics.push(unfireableDiagnostic(surface, trigger, actionIds, context.handles));
            }
        }
    }
    return diagnostics;
}
