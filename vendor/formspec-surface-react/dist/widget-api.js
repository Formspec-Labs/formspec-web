/** Projects a route context onto the identity an action source carries. */
export function routeIdentity(route) {
    return {
        surfaceId: route.surfaceId,
        surfaceRef: route.surfaceRef,
        routeId: route.routeId,
        routeClass: route.routeClass,
        params: route.params,
    };
}
