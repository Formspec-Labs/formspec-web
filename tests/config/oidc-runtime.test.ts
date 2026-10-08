import { describe, expect, it } from 'vitest';
import { resolveActiveConfig, runtimeConfigFromEnvRecord } from '../../src/config/runtime.ts';
import { OidcAdapter } from '../../src/adapters/identity/oidc.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('OIDC deployment configuration', () => {
  it('carries scopes and callback settings through runtime composition', () => {
    const runtime = runtimeConfigFromEnvRecord({ FORMSPEC_WEB_OIDC_ISSUER: 'http://localhost:8180/realms/formspec-dev',
      FORMSPEC_WEB_OIDC_CLIENT_ID: 'formspec-web', FORMSPEC_WEB_OIDC_SCOPE: 'openid profile formspec.read offline_access',
      FORMSPEC_WEB_OIDC_SILENT_REDIRECT_URI: '/auth/silent', FORMSPEC_WEB_OIDC_POST_LOGOUT_REDIRECT_URI: '/auth/logout',
      FORMSPEC_WEB_OIDC_ACR_VALUES: 'configured-assurance', FORMSPEC_WEB_OIDC_RESOURCE: 'formspec-api' });
    expect(resolveActiveConfig(departmentAppProfile, runtime).identity.oidc).toEqual({
      ...departmentAppProfile.identity.oidc, issuer: runtime.oidcIssuer, clientId: 'formspec-web',
      scope: 'openid profile formspec.read offline_access', silentRedirectUri: '/auth/silent',
      postLogoutRedirectUri: '/auth/logout', acrValues: 'configured-assurance', resource: 'formspec-api',
    });
  });

  it('explicitly admits mapped L1 while retaining authored L2 floors and unmapped refusal', async () => {
    const runtime = runtimeConfigFromEnvRecord({ FORMSPEC_WEB_OIDC_MIN_ASSURANCE: 'L1',
      FORMSPEC_WEB_OIDC_ACR_ASSURANCE_MAP_JSON: '{"provider-self-asserted":"L1"}' });
    const oidc = resolveActiveConfig(departmentAppProfile, runtime).identity.oidc!;
    expect(oidc.minAssurance).toBe('L1'); expect(oidc.acrAssuranceMap).toEqual({ 'provider-self-asserted': 'L1' });
    let acr: string | undefined = 'provider-self-asserted';
    const adapter = new OidcAdapter({ ...oidc, subjectRefFactory: () => 'oidc:fixture',
      driver: { getUser: async () => ({ access_token: 'fixture-token', expires_at: 4100000000,
        profile: { iss: oidc.issuer, sub: 'fixture', acr } }) } });
    const [option] = await adapter.discover('L1');
    await expect(adapter.authenticate(option)).resolves.toMatchObject({ assuranceLevel: 'L1' });
    expect(await adapter.discover('L2')).toEqual([]);
    for (acr of [undefined, 'unknown', 'constructor', 'toString']) {
      await expect(adapter.authenticate(option)).rejects.toThrow(/ACR/);
    }
    const defaultOidc = resolveActiveConfig(departmentAppProfile, {}).identity.oidc!;
    expect(defaultOidc.minAssurance).toBe('L2');
    const defaultAdapter = new OidcAdapter({ ...defaultOidc, acrAssuranceMap: oidc.acrAssuranceMap,
      driver: { getUser: async () => ({ access_token: 'fixture-token', expires_at: 4100000000,
        profile: { iss: defaultOidc.issuer, sub: 'fixture', acr: 'provider-self-asserted' } }) } });
    await expect(defaultAdapter.authenticate((await defaultAdapter.discover('L2'))[0])).rejects.toThrow(/below required L2/);
  });

  it.each(['', 'l1', 'L0', 'L5', ' L1'])('refuses invalid explicit minimum %s', minimum => {
    expect(() => resolveActiveConfig(departmentAppProfile, { oidcMinAssurance: minimum })).toThrow();
  });
  it.each(['{}', '[]', 'null', 'false', '{"":"L1"}', '{" padded ":"L1"}', '{"exact":"L5"}', 'not-json'])('refuses malformed mapping %s', mapping => {
    expect(() => resolveActiveConfig(departmentAppProfile, { oidcAcrAssuranceMapJson: mapping })).toThrow();
  });

  it('preserves typed existing options when only issuer changes', () => {
    const config = { ...departmentAppProfile, identity: { mode: 'oidc-required' as const,
      oidc: { ...departmentAppProfile.identity.oidc!, scope: 'openid api', resource: 'api', postLogoutRedirectUri: '/auth/logout' } } };
    // Avoid the profile's separate reference copy replacing this explicit policy.
    const result = resolveActiveConfig({ ...config, referenceAdapters: undefined }, { oidcIssuer: 'https://issuer.example.test/custom' });
    expect(result.identity.oidc).toMatchObject({ scope: 'openid api', resource: 'api', postLogoutRedirectUri: '/auth/logout' });
  });
});
