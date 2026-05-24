/**
 * Common error shape for noop-for-status-route adapters (FW-0068).
 *
 * Adapters in this family stand in for ports the /status route never reads.
 * Any call indicates a consumer outside StatusRuntime reached for a port the
 * route-aware composition deliberately did not construct — fail-fast rather
 * than silently boot the production machinery the surface does not need.
 */
export function notForStatusRouteError(portName: string): Error {
  return new Error(
    `${portName} is not constructed on the /status route (FW-0068 route-aware composition narrowing). ` +
      `If you see this, a consumer outside StatusRuntime is reading the composition on the /status route.`,
  );
}
