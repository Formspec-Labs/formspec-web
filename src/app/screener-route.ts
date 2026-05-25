/**
 * /screener route parser (FW-0046 slice 1).
 *
 * The screener route takes one required query param: `doc={URN}` — the
 * canonical URN of the Screener Document (per screener-spec §2.2). The
 * runtime resolves the URN through `composition.screenerDocumentSource`
 * and renders the upstream `<FormspecScreener>` from
 * `@formspec-org/react`.
 *
 * The surface is intentionally NOT identity-bound at slice 1 — pre-flight
 * routing is the "I don't yet know which form I want" moment (J-047);
 * forcing an account at that step inverts the journey. Identity-binding
 * lands when an issuer publishes a screener whose routing depends on
 * authenticated facts (future row).
 *
 * Mirrors the parser shape of status-route / obligations-route /
 * documents-route / history-route. Per FW-0070 + FW-0080, the descriptor
 * collapses into one `RouteNarrowing` literal; per ADR-0011 §"Non-form
 * surface synthesis" addendum, the consumer synthesizes a form-policy
 * fragment at the route boundary (`form: { features: { screener:
 * 'optional' } }`) so an instance without a catalog falls off as
 * `optional-no-instance` rather than raising the typed form-load error.
 */
import type { RouteNarrowing } from '../composition/route-narrowing.ts';

export interface ScreenerRouteParams {
  /** Canonical screener URN per screener-spec §2.2. */
  readonly docUrl: string;
}

/**
 * Route-narrowing descriptor for `/screener?doc={urn}` (FW-0046, FW-0070,
 * FW-0080).
 *
 * Consumes `screenerDocumentSource` exclusively. Form-shaped MVP ports
 * unconditionally noop. Not identity-bound — see comment at the top of
 * the file.
 */
export const SCREENER_ROUTE_NARROWING: RouteNarrowing = {
  routeCite: '/screener',
  initialDefinitionUrlSentinel: 'about:not-constructed#fw-0046',
  consumes: new Set(['screener']),
  identityBound: false,
};

export function parseScreenerRoute(href: string): ScreenerRouteParams | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== '/screener') {
    return null;
  }
  const docUrl = url.searchParams.get('doc');
  if (!docUrl) {
    // /screener without ?doc=... is the "no document specified" case.
    // Today the runtime renders a typed error; an authoring tool could
    // pass `doc` via location.hash or pull a tenant default — those are
    // adopter-side decisions. Returning null here would route the
    // request to the form runtime, which is wrong.
    return { docUrl: '' };
  }
  return { docUrl };
}
