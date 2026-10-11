import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseComposition } from '../../src/app/main-helpers.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { createTestComposition, testDefinition } from '../fixtures/composition.ts';
import type { BrowserAuthSession } from '../../src/ports/browser-auth-session.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

const config = { ...departmentAppProfile, ports: { ...departmentAppProfile.ports,
  definitionSource: 'reference-http' as const, draftStore: 'reference-http' as const, submitTransport: 'reference-http' as const },
  referenceAdapters: { formspecStack: { ...departmentAppProfile.referenceAdapters?.formspecStack,
    tenantHeaderDialect: 'formspec' as const, formspecServerUrl: 'https://api.example.test' } } };

afterEach(() => vi.restoreAllMocks());

describe('composition auth dependency injection', () => {
  it('uses the supplied provider across form routes', () => {
    const provider = createTestComposition({ definition: testDefinition }).identityProvider;
    const identityBindingFactory = vi.fn(() => ({ provider }));
    const first = chooseComposition({ config, href: 'https://web.example.test/?form=test-form', identityBindingFactory });
    const next = chooseComposition({ config, href: 'https://web.example.test/?form=test-form&other=route', identityBindingFactory });
    expect(first.identityProvider).toBe(provider); expect(next.identityProvider).toBe(provider);
    expect(identityBindingFactory).toHaveBeenCalledTimes(2);
  });

  it('refuses incomplete OIDC package injection before creating anonymous credentials', () => {
    const identityBindingFactory = vi.fn(() => ({ provider: createTestComposition({ definition: testDefinition }).identityProvider }));
    expect(() => chooseComposition({ config, href: 'https://web.example.test/?form=actual-form&package=/package.json',
      identityBindingFactory })).toThrow(/selected OIDC session and bearer provider/);
    expect(identityBindingFactory).toHaveBeenCalledOnce();
  });

  it('keeps ordinary package OIDC identity and refuses upload when its bearer is withdrawn', async () => {
    const provider = createTestComposition({ definition: testDefinition }).identityProvider;
    const state = { issuer: 'https://idp.example.gov/realms/formspec', subject: 'owner', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
    const browserAuthSession: BrowserAuthSession = { getSession: async () => state, begin: async () => {},
      completeCallback: async () => state, completeSilentCallback: async () => {}, renew: async () => state,
      logout: async () => {}, completeLogoutCallback: async () => {}, accessToken: async () => token,
      subscribe: () => () => {}, dispose: () => {} };
    let token: string | undefined = 'selected-bearer';
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ kind: 'attachment-ref', uri: 'attachment:actual',
      filename: 'photo.png', mimeType: 'image/png', size: 1, hash: `sha256:${'c'.repeat(64)}` }));
    const composition = chooseComposition({ config, href: 'https://web.example.test/?form=actual-form&package=/package.json',
      identityBindingFactory: () => ({ provider, browserAuthSession, accessToken: () => token }) });
    expect(composition.identityProvider).toBe(provider); expect(composition.browserAuthSession).toBe(browserAuthSession);
    await composition.attachmentStore.upload(new Blob(['a']), { filename: 'photo.png', mimeType: 'image/png' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer selected-bearer');
    token = undefined;
    await expect(composition.attachmentStore.upload(new Blob(['a']), { filename: 'photo.png', mimeType: 'image/png' })).rejects.toThrow(/OIDC session is unavailable/);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('leaves unavailable narrowed routes free of auth construction', () => {
    const identityBindingFactory = vi.fn(() => { throw new Error('must not construct'); });
    const composition = chooseComposition({ config, href: 'https://web.example.test/status?case=urn:wos:case:example', identityBindingFactory });
    expect(composition.instanceCapabilities.respondentPlace).toBe('unavailable');
    expect(identityBindingFactory).not.toHaveBeenCalled();
  });

  it('refuses anonymous selection for a required OIDC deployment', () => {
    expect(() => createDefaultComposition({ ...config, ports: { ...config.ports, identityProvider: 'anonymous' } })).toThrow(/requires the OIDC provider/);
  });

  it('refuses a selected OIDC provider without configuration', () => {
    expect(() => createDefaultComposition({ ...config, identity: { mode: 'anonymous-allowed' } }, { initialDefinitionUrl: testDefinition.url })).toThrow(/not configured/);
  });
});
