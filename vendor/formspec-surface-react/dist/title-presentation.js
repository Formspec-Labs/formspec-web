export function presentedRouteTitle(handle, resolve) {
    return resolve?.(handle) ?? handle.route.title ?? handle.routeId;
}
export function presentedRouteLabel(handle, resolve) {
    return handle.route.navigation?.label ?? presentedRouteTitle(handle, resolve);
}
