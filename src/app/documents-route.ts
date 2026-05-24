/**
 * /documents route parser (FW-0056 slice 1).
 *
 * The documents route takes no URL params — the route IS the request.
 * Identity-bound at the consumer (see design §"Why identity-required").
 */

export type DocumentsRouteParams = Record<string, never>;

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
