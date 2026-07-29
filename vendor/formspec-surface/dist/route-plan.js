import { planRoute } from './slot-plan.js';
import { planTransitions, slotSuppliedTriggers, } from './transitions.js';
export function planMatchedRoute(input) {
    const headingBaseLevel = input.headingBaseLevel ?? 2;
    const site = { surfaceId: input.handle.surfaceId, routeId: input.handle.routeId };
    // The grant is resolved HERE, once, at the route boundary — never per slot
    // and never for an embedded route (§4.4). An embedded route's own class is a
    // floor on its protection, never a ceiling on its host's.
    const grant = input.themeAuthority.grantFor(input.handle.route, site);
    const route = planRoute({
        handle: input.handle,
        experiences: input.experiences,
        definitions: input.definitions,
        registryEntries: input.registryEntries,
        widgets: input.widgets,
        dataSources: input.dataSources,
        surfaceRef: input.surfaceRef,
        headingBaseLevel,
        staticAssetResolver: input.staticAssetResolver,
    });
    const responseActions = input.responseActions ?? [];
    const transitions = planTransitions({
        handle: input.handle,
        app: input.app,
        responseActions,
        hasExecutor: input.hasExecutor ?? false,
        params: input.params ?? {},
        slotSuppliedTriggers: slotSuppliedTriggers(route.slots, responseActions, {
            includeWidgetActions: input.hasWidgetActionExecutor ?? false,
        }),
        ...(input.evaluateCondition !== undefined
            ? { evaluateCondition: input.evaluateCondition }
            : {}),
        ...(input.strings !== undefined ? { strings: input.strings } : {}),
    });
    return {
        handle: input.handle,
        surfaceRef: input.surfaceRef,
        params: input.params ?? {},
        slots: route.slots,
        grant,
        transitions: transitions.transitions,
        headingBaseLevel,
        diagnostics: [...route.diagnostics, ...grant.diagnostics, ...transitions.diagnostics],
    };
}
