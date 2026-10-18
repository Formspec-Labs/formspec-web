import { describe, expect, it } from 'vitest';
import { readRuntimeConfig, runtimeConfigFromEnvRecord, resolveActiveConfig } from '../config/runtime.ts';
import { applyBrandTheme } from '../theme/theme.ts';
import { departmentAppProfile, publicPortalProfile } from './profiles.ts';
import { deriveScopeKey } from '../shared/scope-key.ts';

describe('reference profiles', () => {
  it('departmentApp leaves the deployment scope to explicit configuration', () => {
    expect(departmentAppProfile).not.toHaveProperty('scopeKey');
    expect(departmentAppProfile.identity.mode).toBe('oidc-required');
  });

  it('publicPortal selects no scope: public runtime serves the deployment public scope', () => {
    expect(publicPortalProfile).not.toHaveProperty('scopeKey');
    expect(publicPortalProfile.identity.mode).toBe('anonymous-allowed');
  });

  it('a runtime scope key replaces the profile scope; anything but 64 lowercase hex is refused', () => {
    const key = deriveScopeKey({ tenant: 'tenant-managed-single-cell', workspace: 'workspace-managed-single-cell', environment: 'production' });
    expect(resolveActiveConfig(departmentAppProfile, { scopeKey: key }).scopeKey).toBe(key);
    expect(resolveActiveConfig(publicPortalProfile, { scopeKey: key }).scopeKey).toBe(key);
    expect(resolveActiveConfig(departmentAppProfile).scopeKey).toBeUndefined();
    expect(() => resolveActiveConfig(departmentAppProfile, { scopeKey: 'tenant-managed-single-cell' })).toThrow('64 lowercase hex');
    expect(() => resolveActiveConfig(departmentAppProfile, { scopeKey: key.toUpperCase() })).toThrow('64 lowercase hex');
    for (const scopeKey of ['', 42]) {
      window.__FORMSPEC_RUNTIME_CONFIG__ = { scopeKey } as never;
      try { expect(() => resolveActiveConfig(departmentAppProfile, readRuntimeConfig())).toThrow('64 lowercase hex'); }
      finally { delete window.__FORMSPEC_RUNTIME_CONFIG__; }
    }
  });

  it.each([departmentAppProfile, publicPortalProfile])('refuses a backend URL without a deployment key for $profileName', profile => {
    expect(() => resolveActiveConfig(profile, { formspecServerUrl: 'https://source.example.gov' })).toThrow('requires an explicit scopeKey');
    expect(() => resolveActiveConfig({ ...profile, referenceAdapters: { formspecStack: { formspecServerUrl: 'https://source.example.gov' } } })).toThrow('requires an explicit scopeKey');
    const scopeKey = deriveScopeKey({ tenant: 'test', workspace: 'app' });
    expect(resolveActiveConfig(profile, { formspecServerUrl: 'https://source.example.gov', scopeKey }).scopeKey).toBe(scopeKey);
    expect(resolveActiveConfig({ ...profile, scopeKey }, { formspecServerUrl: 'https://source.example.gov' }).scopeKey).toBe(scopeKey);
    expect(() => resolveActiveConfig(profile, runtimeConfigFromEnvRecord({ VITE_FORMSPEC_WEB_SERVER_URL: 'https://source.example.gov' }))).toThrow('requires an explicit scopeKey');
    window.__FORMSPEC_RUNTIME_CONFIG__ = { formspecServerUrl: 'https://source.example.gov' };
    try { expect(() => resolveActiveConfig(profile, readRuntimeConfig())).toThrow('requires an explicit scopeKey'); }
    finally { delete window.__FORMSPEC_RUNTIME_CONFIG__; }
  });

  it('normalizes runtime env and applies it to reference adapter config', () => {
    const runtime = runtimeConfigFromEnvRecord({
      VITE_FORMSPEC_WEB_PROFILE: 'publicPortal',
      VITE_FORMSPEC_WEB_SERVER_URL: 'http://dev.example.test/formspec',
      FORMSPEC_WEB_SERVER_URL: 'https://runtime.example.test/formspec',
      FORMSPEC_WEB_SCOPE_KEY: deriveScopeKey({ tenant: 'test', workspace: 'app' }),
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

  it('reads the deployment scope from either environment and refuses malformed overrides', () => {
    const key = deriveScopeKey({ tenant: 'test', workspace: 'app' });
    expect(runtimeConfigFromEnvRecord({ VITE_FORMSPEC_WEB_SCOPE_KEY: key }).scopeKey).toBe(key);
    expect(runtimeConfigFromEnvRecord({ FORMSPEC_WEB_SCOPE_KEY: key, VITE_FORMSPEC_WEB_SCOPE_KEY: 'bad' }).scopeKey).toBe(key);
    for (const value of ['', 'department-reference', key.toUpperCase(), true]) {
      expect(() => runtimeConfigFromEnvRecord({ FORMSPEC_WEB_SCOPE_KEY: value, VITE_FORMSPEC_WEB_SCOPE_KEY: key })).toThrow('64 lowercase hex');
    }
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
