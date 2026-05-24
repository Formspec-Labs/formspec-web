/**
 * /obligations route parser (FW-0055 slice 1).
 *
 * The obligations route takes no URL params — the route IS the request.
 * Identity-bound at the consumer (see design §"Why identity-required").
 */

export type ObligationsRouteParams = Record<string, never>;

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
