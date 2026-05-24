import type { IdentityProvider, Unsubscribe } from '../../ports/identity-provider.ts';
import { notForStatusRouteError } from './_error.ts';

export function noopIdentityProvider(): IdentityProvider {
  return {
    async discover() {
      throw notForStatusRouteError('IdentityProvider');
    },
    async authenticate() {
      throw notForStatusRouteError('IdentityProvider');
    },
    async revoke() {
      throw notForStatusRouteError('IdentityProvider');
    },
    // The shell subscribes at boot to orchestrate cross-port effects
    // (web ADR-0009 §Composition lifecycle). Deliver the initial null
    // synchronously to match the documented contract that the listener sees
    // the current value on subscription; then stay inert. The /status surface
    // never triggers login/logout/revoke, so no callbacks fire.
    subscribe(listener: (claim: null) => void): Unsubscribe {
      listener(null);
      return () => {};
    },
  };
}
