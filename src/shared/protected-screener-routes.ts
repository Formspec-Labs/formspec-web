/** Host-selected protected destinations; authored Screener results alone are not an access policy. */
export function createProtectedScreenerRoutes<Route>(input: {
  readonly allowedTargets: readonly string[];
  readonly protectedTargets: readonly string[];
  readonly resolve: (target: string) => readonly Route[];
  readonly accepted: (target: string) => boolean;
}): { requiresScreening(route: Route): boolean } {
  const targets = [...input.protectedTargets];
  if (!targets.length || new Set(targets).size !== targets.length || targets.some(target => !input.allowedTargets.includes(target)))
    throw new Error('native-entry-screener-protected-targets-unavailable');
  const routes = new Map<Route, string>();
  for (const target of targets) {
    const matches = input.resolve(target);
    if (matches.length !== 1 || routes.has(matches[0])) throw new Error('native-entry-screener-target-unavailable');
    routes.set(matches[0], target);
  }
  const accepted = input.accepted.bind(input);
  return Object.freeze({ requiresScreening: (route: Route) => {
    const target = routes.get(route);
    return target !== undefined && !accepted(target);
  } });
}
