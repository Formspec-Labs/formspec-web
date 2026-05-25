import type { RouteNarrowing } from '../composition/route-narrowing.ts';
import type { WosResourceUrn } from '../ports/status-reader.ts';

export interface StatusRouteParams {
  readonly caseUrn: WosResourceUrn;
}

const WOS_URN_PREFIX = 'urn:wos:';

/**
 * Route-narrowing descriptor for `/status` (FW-0070, FW-0080).
 *
 * Status surface reads `statusReader` plus FW-0038 lifecycle actions when
 * available — no respondent-place reads, no identity binding (URN is the
 * bearer per FW-0039). Form-shaped ports
 * (definition / draft / submit) unconditionally noop on every narrowed
 * route. See FW-0070 design §"Decision 3".
 */
export const STATUS_ROUTE_NARROWING: RouteNarrowing = {
  routeCite: '/status',
  initialDefinitionUrlSentinel: 'about:not-constructed#fw-0068',
  consumes: new Set(['status', 'recordLifecycle']),
  identityBound: false,
};

export function parseStatusRoute(href: string): StatusRouteParams | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== '/status') {
    return null;
  }
  const candidate = url.searchParams.get('case');
  if (!candidate) {
    return null;
  }
  if (!candidate.startsWith(WOS_URN_PREFIX) || candidate.length <= WOS_URN_PREFIX.length) {
    return null;
  }
  return { caseUrn: candidate };
}
