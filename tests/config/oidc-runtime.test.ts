import { describe, expect, it } from 'vitest';
import { resolveActiveConfig, runtimeConfigFromEnvRecord } from '../../src/config/runtime.ts';
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

  it('preserves typed existing options when only issuer changes', () => {
    const config = { ...departmentAppProfile, identity: { mode: 'oidc-required' as const,
      oidc: { ...departmentAppProfile.identity.oidc!, scope: 'openid api', resource: 'api', postLogoutRedirectUri: '/auth/logout' } } };
    // Avoid the profile's separate reference copy replacing this explicit policy.
    const result = resolveActiveConfig({ ...config, referenceAdapters: undefined }, { oidcIssuer: 'https://issuer.example.test/custom' });
    expect(result.identity.oidc).toMatchObject({ scope: 'openid api', resource: 'api', postLogoutRedirectUri: '/auth/logout' });
  });
});
