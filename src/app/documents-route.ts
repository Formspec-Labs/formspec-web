/**
 * /documents route parser (FW-0056 slice 1).
 *
 * The documents route takes no URL params — the route IS the request.
 * Identity-bound at the consumer (see design §"Why identity-required").
 */
import type { RouteNarrowing } from '../composition/route-narrowing.ts';

export type DocumentsRouteParams = Record<string, never>;

/**
 * Route-narrowing descriptor for `/documents` (FW-0070).
 *
 * Documents surface reads `respondentPlaceSource` (Respondent Library
 * sidecar `documents[]` + `presentationPolicies[]`) + is identity-bound
 * (J-042 owner-only framing). Form-shaped ports unconditionally noop.
 * See FW-0070 design §"Decision 3".
 */
export const DOCUMENTS_ROUTE_NARROWING: RouteNarrowing = {
  routeCite: '/documents',
  initialDefinitionUrlSentinel: 'about:not-constructed#fw-0056',
  consumesRespondentPlace: true,
  consumesStatus: false,
  consumesHistory: false,
  identityBound: true,
};

export function parseDocumentsRoute(href: string): DocumentsRouteParams | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== '/documents') {
    return null;
  }
  return {};
}
