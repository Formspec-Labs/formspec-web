import { captureStatusCaseLedgerId } from '../shared/status-case-id.ts';
import type { RouteNarrowing } from '../composition/route-narrowing.ts';

export interface StatusRouteParams {
  readonly caseLedgerId: string;
}

/** Durable case navigation only. The authenticated host and server own access. */
export const STATUS_ROUTE_NARROWING: RouteNarrowing = {
  routeCite: '/status',
  initialDefinitionUrlSentinel: 'about:not-constructed#fw-0068',
  consumes: new Set(['status', 'recordLifecycle']),
  identityBound: true,
};

export function parseStatusRoute(href: string): StatusRouteParams | null {
  try {
    const url = new URL(href);
    if (url.pathname !== '/status' || url.hash || url.username || url.password
      || (url.protocol !== 'https:' && !(url.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) return null;
    // Reject malformed percent encoding rather than accepting replacement text.
    decodeURIComponent(url.search);
    const entries = [...url.searchParams];
    if (entries.length !== 1 || entries[0][0] !== 'caseLedgerId') return null;
    const caseLedgerId = captureStatusCaseLedgerId(entries[0][1]);
    return Object.freeze({ caseLedgerId });
  } catch { return null; }
}

/** Shared relative link builder for maintained status navigation producers. */
export function buildStatusTrackingUri(caseLedgerId: string): string {
  const query = new URLSearchParams({ caseLedgerId: captureStatusCaseLedgerId(caseLedgerId) });
  const path = '/status?' + query.toString();
  if (!parseStatusRoute('https://status.invalid' + path)) throw new Error('Invalid status case selection');
  return path;
}
