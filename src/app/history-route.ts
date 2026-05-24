/**
 * /history route parser (FW-0057 slice 1).
 *
 * The history route takes no URL params — the route IS the request.
 * Identity-bound at the consumer (see design §"Why identity-required").
 */
import type { RouteNarrowing } from '../composition/route-narrowing.ts';

export type HistoryRouteParams = Record<string, never>;

/**
 * Route-narrowing descriptor for `/history` (FW-0057 + FW-0070).
 *
 * History surface reads `respondentHistorySource` (cross-issuer aggregation
 * via XS-2 token bag in production, demo fixture in stub mode) + is
 * identity-bound (J-043 "my own paperwork" owner-only framing). Form-shaped
 * ports unconditionally noop. Does NOT consume the respondent-place sidecar
 * — history is a separate adapter shape (FW-0057 design §"Decision on port
 * shape").
 */
export const HISTORY_ROUTE_NARROWING: RouteNarrowing = {
  routeCite: '/history',
  initialDefinitionUrlSentinel: 'about:not-constructed#fw-0057',
  consumesRespondentPlace: false,
  consumesStatus: false,
  consumesHistory: true,
  identityBound: true,
};

export function parseHistoryRoute(href: string): HistoryRouteParams | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== '/history') {
    return null;
  }
  return {};
}
