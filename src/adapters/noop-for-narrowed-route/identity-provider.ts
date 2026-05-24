import type { IdentityProvider, Unsubscribe } from '../../ports/identity-provider.ts';
import { notForNarrowedRouteError } from './_error.ts';

export function noopIdentityProvider(routeCite?: string): IdentityProvider {
  return {
    async discover() {
      throw notForNarrowedRouteError('IdentityProvider', routeCite);
    },
    async authenticate() {
      throw notForNarrowedRouteError('IdentityProvider', routeCite);
    },
    async revoke() {
      throw notForNarrowedRouteError('IdentityProvider', routeCite);
    },
    // The shell subscribes at boot to orchestrate cross-port effects
    // (web ADR-0009 §Composition lifecycle). Deliver the initial null
    // synchronously to match the documented contract that the listener sees
    // the current value on subscription; then stay inert. Narrowed routes
    // that wire this provider never trigger login/logout/revoke (e.g.,
    // /status is identity-agnostic), so no callbacks fire.
    subscribe(listener: (claim: null) => void): Unsubscribe {
      listener(null);
      return () => {};
    },
  };
}
