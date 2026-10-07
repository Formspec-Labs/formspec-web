export function presentedRouteTitle(handle, resolve) {
    return resolve?.(handle) ?? handle.route.title ?? handle.routeId;
}
