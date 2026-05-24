/**
 * Common error shape for noop-for-narrowed-route adapters (FW-0068, FW-0055).
 *
 * The family is consumed by every narrowed-route factory (today: /status per
 * FW-0068 and /obligations per FW-0055; future routes can adopt the same
 * pattern). Any call indicates a consumer outside the narrowed runtime reached
 * for a port the route-aware composition deliberately did not construct —
 * fail-fast rather than silently boot the production machinery the surface
 * does not need.
 *
 * Pass `routeCite` so the diagnostic names which narrowed route held the
 * decision (e.g., `'/status'`, `'/obligations'`) — when omitted the message
 * still cites FW-0068 as the originating decision so the diagnostic is
 * traceable.
 */
export function notForNarrowedRouteError(portName: string, routeCite?: string): Error {
  const routeSuffix = routeCite ? ` (narrowed by ${routeCite})` : '';
  return new Error(
    `${portName} is not constructed on this narrowed route${routeSuffix} (FW-0068 route-aware composition narrowing). ` +
      `If you see this, a consumer outside the route's runtime is reading the composition.`,
  );
}
