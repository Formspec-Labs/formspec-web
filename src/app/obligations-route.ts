/**
 * /obligations route parser (FW-0055 slice 1).
 *
 * The obligations route takes no URL params — the route IS the request.
 * Identity-bound at the consumer (see design §"Why identity-required").
 */
import type { RouteNarrowing } from '../composition/route-narrowing.ts';

export type ObligationsRouteParams = Record<string, never>;

/**
 * Route-narrowing descriptor for `/obligations` (FW-0070).
 *
 * Obligations surface reads `respondentPlaceSource` (Respondent Library
 * sidecar) + is identity-bound (J-039 owner-only framing). Form-shaped
 * ports unconditionally noop. See FW-0070 design §"Decision 3".
 */
export const OBLIGATIONS_ROUTE_NARROWING: RouteNarrowing = {
  routeCite: '/obligations',
  initialDefinitionUrlSentinel: 'about:not-constructed#fw-0055',
  consumesRespondentPlace: true,
  consumesStatus: false,
  identityBound: true,
};

export function parseObligationsRoute(href: string): ObligationsRouteParams | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== '/obligations') {
    return null;
  }
  return {};
}
