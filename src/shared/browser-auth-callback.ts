import type { BrowserAuthSession } from '../ports/browser-auth-session.ts';

export interface BrowserAuthCallbackUris {
  redirectUri?: string;
  silentRedirectUri?: string;
  postLogoutRedirectUri?: string;
}

export type AuthCallbackKind = 'signin' | 'silent' | 'signout';

/** Match deployment-owned callback paths before any form route boots. */
export function matchBrowserAuthCallback(href: string, uris: BrowserAuthCallbackUris): AuthCallbackKind | null {
  const url = new URL(href);
  const paths = [
    ['signin', uris.redirectUri],
    ['silent', uris.silentRedirectUri],
    ['signout', uris.postLogoutRedirectUri],
  ] as const;
  const seen = new Set<string>();
  let match: AuthCallbackKind | null = null;
  for (const [kind, uri] of paths) {
    if (!uri) continue;
    const target = new URL(uri, url.origin);
    if (target.origin !== url.origin || target.pathname === '/' || target.search || target.hash) {
      throw new Error('Authentication callbacks require distinct same-origin paths separate from the home page');
    }
    if (seen.has(target.pathname)) throw new Error('Authentication callback paths must be distinct');
    seen.add(target.pathname);
    if (target.pathname === url.pathname) match = kind;
  }
  return match;
}

/** One startup invocation; silent iframe callbacks notify their parent only. */
export async function completeBrowserAuthCallback(input: {
  href: string;
  uris: BrowserAuthCallbackUris;
  createSession(): BrowserAuthSession;
  navigate(href: string): void;
}): Promise<boolean> {
  const kind = matchBrowserAuthCallback(input.href, input.uris);
  if (!kind) return false;
  const session = input.createSession();
  try {
    if (kind === 'silent') {
      await session.completeSilentCallback(input.href);
    } else {
      if (kind === 'signin') await session.completeCallback(input.href);
      else await session.completeLogoutCallback(input.href);
      input.navigate(new URL('/', input.href).href);
    }
    return true;
  } finally {
    session.dispose();
  }
}
