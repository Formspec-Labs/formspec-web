import { describe, expect, it } from 'vitest';
import { runtimeConfigFromEnvRecord, resolveActiveConfig } from '../config/runtime.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import { departmentAppProfile, publicPortalProfile } from './profiles.ts';
import { formspecTenantHeaderNames, tenantScopeHeaders } from './tenant-headers.ts';

describe('reference profiles', () => {
  it('departmentApp binds a full tenant scope to Formspec stack headers', () => {
    expect(departmentAppProfile.tenantBinding.kind).toBe('bound');
    expect(tenantScopeHeaders(departmentAppProfile.tenantBinding)).toEqual({
      [formspecTenantHeaderNames.tenant]: 'department-reference',
      [formspecTenantHeaderNames.workspace]: 'default-workspace',
      [formspecTenantHeaderNames.environment]: 'prod',
      [formspecTenantHeaderNames.cell]: 'primary',
    });
    expect(departmentAppProfile.identity.mode).toBe('oidc-required');
  });

  it('publicPortal attaches a sentinel full tenant scope until EXT-24', () => {
    expect(publicPortalProfile.tenantBinding.kind).toBe('implicit');
    expect(tenantScopeHeaders(publicPortalProfile.tenantBinding)).toEqual({
      [formspecTenantHeaderNames.tenant]: 'public-portal-sentinel',
      [formspecTenantHeaderNames.workspace]: 'public',
      [formspecTenantHeaderNames.environment]: 'prod',
      [formspecTenantHeaderNames.cell]: 'edge',
    });
    expect(publicPortalProfile.identity.mode).toBe('anonymous-allowed');
  });

  it('can omit implicit tenant headers after EXT-24', () => {
    expect(
      tenantScopeHeaders({
        ...publicPortalProfile.tenantBinding,
        headerMode: 'omit-post-ext24',
      }),
    ).toEqual({});
  });

  it('normalizes runtime env and applies it to reference adapter config', () => {
    const runtime = runtimeConfigFromEnvRecord({
      VITE_FORMSPEC_WEB_PROFILE: 'publicPortal',
      VITE_FORMSPEC_WEB_SERVER_URL: 'http://dev.example.test/formspec',
      FORMSPEC_WEB_SERVER_URL: 'https://runtime.example.test/formspec',
      FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL:
        'https://runtime.example.test/bff/response-actions/ledger/capability',
      FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH: '/runtime/magic-link/callback',
      FORMSPEC_WEB_OIDC_ISSUER: 'https://runtime-idp.example.test',
      FORMSPEC_WEB_OIDC_CLIENT_ID: 'runtime-client',
    });

    const activeConfig = resolveActiveConfig(departmentAppProfile, runtime);

    expect(activeConfig.profileName).toBe('publicPortal');
    expect(activeConfig.identity.oidc?.issuer).toBe('https://runtime-idp.example.test');
    expect(activeConfig.identity.oidc?.clientId).toBe('runtime-client');
    if (activeConfig.identity.mode !== 'anonymous-allowed') {
      throw new Error('expected publicPortal to allow anonymous identity');
    }
    expect(activeConfig.identity.magicLink?.callbackPath).toBe('/runtime/magic-link/callback');
    expect(activeConfig.referenceAdapters?.formspecStack?.formspecServerUrl).toBe(
      'https://runtime.example.test/formspec',
    );
    expect(activeConfig.referenceAdapters?.formspecStack?.responseActionLedgerCapabilityUrl).toBe(
      'https://runtime.example.test/bff/response-actions/ledger/capability',
    );
    expect(activeConfig.ports).toMatchObject({
      definitionSource: 'reference-http',
      draftStore: 'reference-http',
      submitTransport: 'reference-http',
    });
    expect(activeConfig.referenceAdapters?.formspecStack?.oidc?.issuer).toBe(
      'https://runtime-idp.example.test',
    );
    expect(activeConfig.referenceAdapters?.formspecStack?.magicLinkCallbackPath).toBe(
      '/runtime/magic-link/callback',
    );
  });

  it('applies brand config per target without shared singleton state', () => {
    const departmentTarget = document.createElement('section');
    const publicTarget = document.createElement('section');

    applyBrandTheme(departmentTarget, departmentAppProfile.brand);
    applyBrandTheme(publicTarget, publicPortalProfile.brand);

    expect(departmentTarget.dataset.formspecBrand).toBe('formspec-department');
    expect(publicTarget.dataset.formspecBrand).toBe('formspec-public');
    expect(departmentTarget.style.getPropertyValue('--formspec-color-primary')).toBe('#155e56');
    expect(publicTarget.style.getPropertyValue('--formspec-color-primary')).toBe('#2f6f8f');
    expect(departmentTarget.style.getPropertyValue('--formspec-color-primary')).not.toBe(
      publicTarget.style.getPropertyValue('--formspec-color-primary'),
    );
  });
});
