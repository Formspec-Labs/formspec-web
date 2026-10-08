import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeConfiguredAuthCallback, configuredAuthCallback, rememberNativeSignInReturn, rememberNativeSignOutReturn } from '../../src/app/auth-callback.ts';
import { createBrowserScopedMetadataStore } from '../../src/shared/browser-scoped-metadata.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import type { BrowserAuthSession } from '../../src/ports/browser-auth-session.ts';
import { completeBrowserAuthCallback, matchBrowserAuthCallback } from '../../src/shared/index.ts';

const config = { ...departmentAppProfile, identity: { mode: 'oidc-required' as const,
  oidc: { ...departmentAppProfile.identity.oidc!, redirectUri: '/auth/callback',
    silentRedirectUri: '/auth/silent', postLogoutRedirectUri: '/auth/logout' } } };
const state = { issuer: 'https://idp.example.test', subject: 'subject', expiresAt: '2030-01-01T00:00:00Z', revision: 1 };
afterEach(() => window.sessionStorage.clear());
function session(): BrowserAuthSession {
  return { begin: vi.fn(async () => undefined), completeCallback: vi.fn(async () => state),
    completeSilentCallback: vi.fn(async () => undefined), completeLogoutCallback: vi.fn(async () => undefined),
    getSession: vi.fn(async () => state), renew: vi.fn(async () => state), logout: vi.fn(async () => undefined),
    accessToken: vi.fn(async () => 'access'), subscribe: vi.fn(() => () => undefined), dispose: vi.fn() };
}

describe('configured callback startup', () => {
  it('restores explicit native signout navigation only after the qualified signout callback', async () => {
    const selected = 'https://web.example.test/?form=passport&package=%2Fpackage.json';
    rememberNativeSignOutReturn(selected, config);
    const navigate = vi.fn();
    await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/callback', createSession: session, navigate });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://web.example.test/');
    const refused = session(); vi.mocked(refused.completeLogoutCallback).mockRejectedValue(new Error('invalid logout state'));
    await expect(completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/logout', createSession: () => refused, navigate })).rejects.toThrow('invalid logout state');
    const accepted = vi.fn();
    await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/logout', createSession: session, navigate: accepted });
    expect(accepted).toHaveBeenCalledExactlyOnceWith(selected);
    const again = vi.fn();
    await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/logout', createSession: session, navigate: again });
    expect(again).toHaveBeenCalledExactlyOnceWith('https://web.example.test/');
  });
  it('restores and consumes the native selection only after a successful sign-in callback', async () => {
    const selected = 'https://web.example.test/?form=passport&package=%2Fpublished%2Fpackage.json';
    expect(rememberNativeSignInReturn(selected, config)).toBe(true);
    const navigate = vi.fn();
    const href = 'https://web.example.test/auth/callback?state=stored&return=https://untrusted.test';
    await completeConfiguredAuthCallback({ config, href, createSession: session, navigate });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(selected);
    const again = vi.fn();
    await completeConfiguredAuthCallback({ config, href, createSession: session, navigate: again });
    expect(again).toHaveBeenCalledExactlyOnceWith('https://web.example.test/');
  });
  it('returns a fresh authored-route sign-in to the form entry while retaining its package selection', async () => {
    rememberNativeSignInReturn('https://web.example.test/review-sign?form=passport&package=%2Fpackage.json', config);
    const navigate = vi.fn();
    await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/callback', createSession: session, navigate });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://web.example.test/?form=passport&package=%2Fpackage.json');
  });
  it('keeps navigation scoped to the selected issuer and client', async () => {
    const selected = 'https://web.example.test/?form=passport&package=%2Fpackage.json';
    rememberNativeSignInReturn(selected, config);
    const other = { ...config, identity: { ...config.identity, oidc: { ...config.identity.oidc, clientId: 'other-client' } } };
    const navigate = vi.fn(); const href = 'https://web.example.test/auth/callback';
    await completeConfiguredAuthCallback({ config: other, href, createSession: session, navigate });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://web.example.test/');
    const original = vi.fn();
    await completeConfiguredAuthCallback({ config, href, createSession: session, navigate: original });
    expect(original).toHaveBeenCalledExactlyOnceWith(selected);
  });
  it('retains the selected form on callback refusal and does not consume it on silent or signout callbacks', async () => {
    const selected = 'https://web.example.test/?form=passport&package=%2Fpackage.json';
    rememberNativeSignInReturn(selected, config);
    const refused = session(); vi.mocked(refused.completeCallback).mockRejectedValue(new Error('invalid state'));
    const navigate = vi.fn();
    await expect(completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/callback', createSession: () => refused, navigate })).rejects.toThrow('invalid state');
    expect(navigate).not.toHaveBeenCalled();
    await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/silent', createSession: session, navigate });
    expect(navigate).not.toHaveBeenCalled();
    await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/logout', createSession: session, navigate });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://web.example.test/');
    const accepted = vi.fn();
    await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/callback', createSession: session, navigate: accepted });
    expect(accepted).toHaveBeenCalledExactlyOnceWith(selected);
  });
  it.each(['https://untrusted.test/?form=x&package=y', '//untrusted.test/?form=x&package=y', '/auth/callback?form=x&package=y', '/?form=x&package=y#unsafe', 5])('refuses invalid stored navigation %s after authenticating', async value => {
    createBrowserScopedMetadataStore({ namespace: 'formspec-web:signin-navigation',
      context: { origin: 'https://web.example.test', issuer: config.identity.oidc.issuer, clientId: config.identity.oidc.clientId,
        redirectUri: config.identity.oidc.redirectUri, postLogoutRedirectUri: config.identity.oidc.postLogoutRedirectUri, tenantBinding: config.tenantBinding } }).write('return', value);
    const auth = session(); const navigate = vi.fn();
    await expect(completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/callback', createSession: () => auth, navigate })).rejects.toThrow(/navigation/);
    expect(auth.completeCallback).toHaveBeenCalledOnce(); expect(auth.dispose).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('supports another host through the public URI seam without Web configuration', async () => {
    const uris = { redirectUri: '/auth/callback', silentRedirectUri: '/auth/silent-callback', postLogoutRedirectUri: '/auth/logout-callback' };
    const auth = session(); const navigate = vi.fn(); const href = 'https://portal.example.test/auth/silent-callback?state=stored';
    expect(matchBrowserAuthCallback(href, uris)).toBe('silent');
    expect(await completeBrowserAuthCallback({ href, uris, createSession: () => auth, navigate })).toBe(true);
    expect(auth.completeSilentCallback).toHaveBeenCalledExactlyOnceWith(href);
    expect(navigate).not.toHaveBeenCalled(); expect(auth.dispose).toHaveBeenCalledOnce();
  });

  it('does not treat OAuth query fields on a form route as a callback', async () => {
    const createSession = vi.fn(session); const navigate = vi.fn();
    expect(await completeConfiguredAuthCallback({ config, href: 'https://web.example.test/?code=untrusted&state=other', createSession, navigate })).toBe(false);
    expect(createSession).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });

  it.each([['callback', 'completeCallback'], ['logout', 'completeLogoutCallback']] as const)(
    'completes configured %s once and ignores untrusted return URLs', async (route, method) => {
      const auth = session(); const navigate = vi.fn();
      const href = `https://web.example.test/auth/${route}?state=stored&return=https://untrusted.test`;
      expect(await completeConfiguredAuthCallback({ config, href, createSession: () => auth, navigate })).toBe(true);
      expect(auth[method]).toHaveBeenCalledExactlyOnceWith(href);
      expect(navigate).toHaveBeenCalledExactlyOnceWith('https://web.example.test/');
      expect(auth.dispose).toHaveBeenCalledOnce();
    },
  );

  it('terminates silent iframe completion without navigation or form boot', async () => {
    const auth = session(); const navigate = vi.fn(); const href = 'https://web.example.test/auth/silent?state=stored';
    expect(await completeConfiguredAuthCallback({ config, href, createSession: () => auth, navigate })).toBe(true);
    expect(auth.completeSilentCallback).toHaveBeenCalledExactlyOnceWith(href);
    expect(auth.completeCallback).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    expect(auth.dispose).toHaveBeenCalledOnce();
  });

  it('propagates callback refusal and disposes without navigation', async () => {
    const auth = session(); const navigate = vi.fn();
    vi.mocked(auth.completeCallback).mockRejectedValue(new Error('invalid state'));
    await expect(completeConfiguredAuthCallback({ config, href: 'https://web.example.test/auth/callback?state=replayed', createSession: () => auth, navigate })).rejects.toThrow('invalid state');
    expect(navigate).not.toHaveBeenCalled(); expect(auth.dispose).toHaveBeenCalledOnce();
  });

  it.each(['/', '/auth/silent', 'https://other.example.test/callback', '/auth/callback?query=1'])(
    'refuses unsafe or overlapping callback URI %s', (redirectUri) => {
      expect(() => configuredAuthCallback('https://web.example.test/', { ...config,
        identity: { ...config.identity, oidc: { ...config.identity.oidc, redirectUri } } })).toThrow(/callback/i);
    },
  );
});
