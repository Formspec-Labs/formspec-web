import type { WosResourceUrn } from '../ports/status-reader.ts';

export interface StatusRouteParams {
  readonly caseUrn: WosResourceUrn;
}

const WOS_URN_PREFIX = 'urn:wos:';

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
  if (!candidate.startsWith(WOS_URN_PREFIX)) {
    return null;
  }
  return { caseUrn: candidate };
}
