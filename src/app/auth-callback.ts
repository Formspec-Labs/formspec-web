import type { FormspecWebConfig, OidcClientConfig } from '../config/types.ts';
import type { BrowserAuthSession } from '../ports/browser-auth-session.ts';
import { completeBrowserAuthCallback, matchBrowserAuthCallback, type AuthCallbackKind } from '../shared/browser-auth-callback.ts';

/** Match only the explicitly selected OIDC deployment before form startup. */
export function configuredAuthCallback(href: string, config: FormspecWebConfig): AuthCallbackKind | null {
  return config.ports.identityProvider === 'oidc' && config.identity.oidc
    ? matchBrowserAuthCallback(href, config.identity.oidc) : null;
}

export async function completeConfiguredAuthCallback(input: {
  href: string;
  config: FormspecWebConfig;
  createSession(config: OidcClientConfig): BrowserAuthSession;
  navigate(href: string): void;
}): Promise<boolean> {
  if (input.config.ports.identityProvider !== 'oidc' || !input.config.identity.oidc) return false;
  const oidc = input.config.identity.oidc;
  return completeBrowserAuthCallback({ href: input.href, uris: oidc,
    createSession: () => input.createSession(oidc), navigate: input.navigate });
}
