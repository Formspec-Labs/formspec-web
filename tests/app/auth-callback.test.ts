import { describe, expect, it, vi } from 'vitest';
import { completeConfiguredAuthCallback, configuredAuthCallback } from '../../src/app/auth-callback.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import type { BrowserAuthSession } from '../../src/ports/browser-auth-session.ts';
import { completeBrowserAuthCallback, matchBrowserAuthCallback } from '../../src/shared/index.ts';

const config = { ...departmentAppProfile, identity: { mode: 'oidc-required' as const,
  oidc: { ...departmentAppProfile.identity.oidc!, redirectUri: '/auth/callback',
    silentRedirectUri: '/auth/silent', postLogoutRedirectUri: '/auth/logout' } } };
const state = { issuer: 'https://idp.example.test', subject: 'subject', expiresAt: '2030-01-01T00:00:00Z', revision: 1 };
function session(): BrowserAuthSession {
  return { begin: vi.fn(async () => undefined), completeCallback: vi.fn(async () => state),
    completeSilentCallback: vi.fn(async () => undefined), completeLogoutCallback: vi.fn(async () => undefined),
    getSession: vi.fn(async () => state), renew: vi.fn(async () => state), logout: vi.fn(async () => undefined),
    accessToken: vi.fn(async () => 'access'), subscribe: vi.fn(() => () => undefined), dispose: vi.fn() };
}

describe('configured callback startup', () => {
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
