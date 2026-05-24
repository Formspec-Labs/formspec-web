/**
 * Common error shape for noop-for-status-route adapters (FW-0068).
 *
 * The "for-status-route" name is historical; the family is reused by every
 * narrowed-route factory (status + obligations + future routes) for ports the
 * narrowed surface never reads. Any call indicates a consumer outside the
 * narrowed runtime reached for a port the route-aware composition deliberately
 * did not construct — fail-fast rather than silently boot the production
 * machinery the surface does not need.
 */
export function notForStatusRouteError(portName: string): Error {
  return new Error(
    `${portName} is not constructed on this narrowed route (FW-0068 route-aware composition narrowing). ` +
      `If you see this, a consumer outside the route's runtime is reading the composition.`,
  );
}
