import type { AccessTokenProvider } from '../adapters/http/http-client.ts';
import { OidcAdapter } from '../adapters/identity/oidc.ts';
import { OidcBrowserAuthSession } from '../adapters/identity/oidc-browser-session.ts';
import type { OidcClientConfig } from '../config/types.ts';
import type { BrowserAuthSession } from '../ports/browser-auth-session.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';

export interface IdentityBinding {
  provider: IdentityProvider;
  accessToken?: AccessTokenProvider;
  browserAuthSession?: BrowserAuthSession;
}

/** Concrete OIDC selection belongs to the composition root. */
export function createOidcIdentityBinding(config: OidcClientConfig): IdentityBinding {
  const browserAuthSession = new OidcBrowserAuthSession(config);
  const provider = new OidcAdapter({ ...config, browserSession: browserAuthSession });
  return { provider, browserAuthSession, accessToken: () => browserAuthSession.accessToken() };
}

/** Callback startup uses the same maintained lifecycle adapter as the form host. */
export function createConfiguredBrowserAuthSession(config: OidcClientConfig): BrowserAuthSession {
  return new OidcBrowserAuthSession(config);
}
