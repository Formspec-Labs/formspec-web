import { afterEach, describe, expect, it, vi } from 'vitest';
import { OidcClient, WebStorageStateStore } from 'oidc-client-ts';
import { createOidcClientTsDriver, OidcBrowserAuthSession } from '../../../src/adapters/identity/oidc-browser-session.ts';

// Exercise maintained protocol validation, not a handwritten callback implementation.
// Dummy ID token signatures are deliberate: resource-server signature/audience validation
// remains a separate server responsibility, not evidence supplied by this SDK test.
const issuer = 'https://sdk-issuer.test';
const jwt = (claims: Record<string, unknown>) => `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify(claims))}.signature`;
afterEach(() => { globalThis.sessionStorage?.clear(); globalThis.localStorage?.clear(); vi.unstubAllGlobals(); });

async function setup(clientId: string, incomingNonce = 'request-nonce') {
  const redirectUri = 'https://web.test/auth/callback';
  const prefix = `oidc-state:${encodeURIComponent(issuer)}:${encodeURIComponent(clientId)}:`;
  const client = new OidcClient({ authority: issuer, client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid api.read', stateStore: new WebStorageStateStore({ store: sessionStorage, prefix }), metadata: { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, end_session_endpoint: `${issuer}/logout` } });
  const request = await client.createSigninRequest({ nonce: 'request-nonce' });
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/.well-known/openid-configuration')) return new Response(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token` }), { headers: { 'content-type': 'application/json' } });
    expect(String(input)).toBe(`${issuer}/token`);
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('code_verifier')).toBe(request.state.code_verifier);
    expect(body.get('grant_type')).toBe('authorization_code');
    return new Response(JSON.stringify({ access_token: 'api-access', token_type: 'Bearer', expires_in: 3600, scope: 'openid api.read', id_token: jwt({ iss: issuer, sub: 'sdk-person', aud: clientId, nonce: incomingNonce, acr: 'L3', amr: ['pwd'], exp: Math.floor(Date.now() / 1000) + 3600 }) }), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetcher);
  const driver = createOidcClientTsDriver({ issuer, clientId, redirectUri, scope: 'openid api.read' });
  const session = new OidcBrowserAuthSession({ issuer, clientId, driver });
  return { session, driver, client, clientId, request, url: `${redirectUri}?code=single-code&state=${request.state.id}`, fetcher };
}

describe('maintained OIDC SDK callbacks', () => {
  it('consumes state once, retains SDK ACR/AMR evidence and exposes only the access token', async () => {
    const f = await setup('sdk-good');
    const requestUrl = new URL(f.request.url);
    expect(requestUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(requestUrl.searchParams.get('nonce')).toBe('request-nonce');
    expect(requestUrl.searchParams.get('scope')).toBe('openid api.read');
    const state = await f.session.completeCallback(f.url);
    expect(state.subject).toBe('sdk-person');
    expect(f.session.admittedUser()?.profile).toMatchObject({ acr: 'L3', amr: ['pwd'] });
    await expect(f.session.accessToken()).resolves.toBe('api-access');
    const exchanges = f.fetcher.mock.calls.length;
    await expect(f.session.completeCallback(f.url)).rejects.toMatchObject({ code: 'provider-error' });
    expect(f.fetcher).toHaveBeenCalledTimes(exchanges);
    await expect(f.session.accessToken()).resolves.toBeUndefined(); f.session.dispose();
  });

  it('preserves accepted SDK storage across callback disposal and fresh owner', async () => {
    const f = await setup('sdk-dispose');
    await f.session.completeCallback(f.url);
    f.session.dispose();
    const fresh = new OidcBrowserAuthSession({ issuer, clientId: f.clientId, driver: f.driver });
    await expect(fresh.getSession()).resolves.toMatchObject({ subject: 'sdk-person' });
    await expect(fresh.accessToken()).resolves.toBe('api-access');
    fresh.dispose();
  });

  it('refuses implicit iframe callback fallback without a configured silent redirect', async () => {
    const f = await setup('sdk-no-silent');
    await f.session.completeCallback(f.url);
    await expect(f.session.renew()).rejects.toMatchObject({ code: 'capability-unavailable' });
    f.session.dispose();
  });

  it('rejects nonce mismatch and consumes the failed state so replay cannot retry', async () => {
    const f = await setup('sdk-bad-nonce', 'wrong-nonce');
    await expect(f.session.completeCallback(f.url)).rejects.toMatchObject({ code: 'provider-error' });
    await expect(f.session.getSession()).resolves.toBeNull();
    // Inspect the maintained state store, rather than recreating callback policy.
    const prefix = `oidc-state:${encodeURIComponent(issuer)}:${encodeURIComponent('sdk-bad-nonce')}:`;
    expect(sessionStorage.getItem(`${prefix}${f.request.state.id}`)).toBeNull(); f.session.dispose();
  });

  it('consumes maintained logout callback state and rejects replay', async () => {
    const f = await setup('sdk-logout-state');
    const request = await f.client.createSignoutRequest({ state: 'logout-state', post_logout_redirect_uri: 'https://web.test/auth/logout' });
    const callback = `https://web.test/auth/logout?state=${request.state!.id}`;
    await expect(f.session.completeLogoutCallback(callback)).resolves.toBeUndefined();
    await expect(f.session.completeLogoutCallback(callback)).rejects.toMatchObject({ code: 'provider-error' });
    await expect(f.session.getSession()).resolves.toBeNull(); f.session.dispose();
  });

  it('refuses unrecognized state before any network exchange', async () => {
    const f = await setup('sdk-unknown-state');
    await expect(f.session.completeCallback('https://web.test/auth/callback?code=x&state=unknown')).rejects.toMatchObject({ code: 'provider-error' });
    expect(f.fetcher).not.toHaveBeenCalled(); f.session.dispose();
  });
});
