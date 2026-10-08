import type { FormspecWebConfig, OidcClientConfig } from '../config/types.ts';
import type { BrowserAuthSession } from '../ports/browser-auth-session.ts';
import { completeBrowserAuthCallback, matchBrowserAuthCallback, type AuthCallbackKind } from '../shared/browser-auth-callback.ts';
import { createBrowserScopedMetadataStore } from '../shared/browser-scoped-metadata.ts';

/** Navigation only: preserve a public native form selection across the provider redirect. */
export function rememberNativeSignInReturn(href: string, config: FormspecWebConfig): boolean {
  const url = new URL(href);
  const target = new URL('/', url);
  target.search = url.search;
  if (url.hash || configuredAuthCallback(href, config) || !nativeSelection(target)) return false;
  navigationStore(url, config).write('return', `${target.pathname}${target.search}`);
  return true;
}

export function clearNativeSignInReturn(href: string, config: FormspecWebConfig): void {
  navigationStore(new URL(href), config).remove('return');
}

function navigationStore(url: URL, config: FormspecWebConfig) {
  const oidc = config.identity.oidc;
  if (!oidc) throw new Error('Native sign-in requires the selected OIDC configuration.');
  return createBrowserScopedMetadataStore({ namespace: 'formspec-web:signin-navigation',
    context: { origin: url.origin, issuer: oidc.issuer, clientId: oidc.clientId,
      redirectUri: oidc.redirectUri, tenantBinding: config.tenantBinding } });
}

function nativeSelection(url: URL): boolean {
  return url.pathname === '/' && !url.hash && !!url.searchParams.get('form') && !!url.searchParams.get('package');
}

function consumeNativeSignInReturn(href: string, config: FormspecWebConfig): string | undefined {
  const callback = new URL(href);
  const store = navigationStore(callback, config);
  const value = store.read('return');
  if (value === undefined) return undefined;
  store.remove('return');
  if (typeof value !== 'string' || !value.startsWith('/?')) throw new Error('Stored form navigation is invalid.');
  const target = new URL(value, callback.origin);
  if (target.origin !== callback.origin || !nativeSelection(target)) throw new Error('Stored form navigation is invalid.');
  return target.href;
}

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
    createSession: () => input.createSession(oidc), navigate: href => {
      const target = configuredAuthCallback(input.href, input.config) === 'signin'
        ? consumeNativeSignInReturn(input.href, input.config) : undefined;
      input.navigate(target ?? href);
    } });
}
