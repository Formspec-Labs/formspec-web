import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRuntimeConfig, resolveActiveConfig } from '../../src/config/runtime.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

const script = readFileSync('public/formspec-runtime-config.js', 'utf8');
afterEach(() => { vi.unstubAllEnvs(); delete window.__FORMSPEC_RUNTIME_CONFIG__; delete window.__FORMSPEC_RUNTIME_DEFAULTS__; });

describe('package defaults preserve explicit deployment identity', () => {
  it('keeps root-selected OIDC and backend while selecting the maintained native signing package', () => {
    const deployed = { location: { href: 'http://127.0.0.1:5173/?form=form_d1_passport_001&package=/demo-packages/d1-passport/v0.1.6/package.json' } } as Window;
    runInNewContext(script, { window: deployed, URL });
    window.__FORMSPEC_RUNTIME_CONFIG__ = JSON.parse(JSON.stringify(deployed.__FORMSPEC_RUNTIME_CONFIG__));
    window.__FORMSPEC_RUNTIME_DEFAULTS__ = JSON.parse(JSON.stringify(deployed.__FORMSPEC_RUNTIME_DEFAULTS__));
    vi.stubEnv('VITE_FORMSPEC_WEB_PROFILE', 'departmentApp');
    vi.stubEnv('VITE_FORMSPEC_WEB_SERVER_URL', 'http://127.0.0.1:18084');
    vi.stubEnv('VITE_FORMSPEC_WEB_OIDC_ISSUER', 'http://127.0.0.1:18090/realms/formspec-dev');
    vi.stubEnv('VITE_FORMSPEC_WEB_OIDC_CLIENT_ID', 'formspec-web-dev');
    const config = resolveActiveConfig(departmentAppProfile, readRuntimeConfig());
    expect(config.identity.mode).toBe('oidc-required'); expect(config.ports.identityProvider).toBe('oidc');
    expect(config.identity.oidc?.clientId).toBe('formspec-web-dev');
    expect(config.referenceAdapters?.formspecStack?.formspecServerUrl).toBe('http://127.0.0.1:18084');
    expect(config.referenceAdapters?.formspecStack?.nativePackageSigning?.definition.version).toBe('0.1.6');
    expect(config.referenceAdapters?.formspecStack?.nativePackageSigning?.keyId).toBe('formspec-local-oidc-response-20261008-v1');
  });
  it('retains public preview defaults when no deployment settings are supplied', () => {
    const deployed = { location: { href: 'http://127.0.0.1:5173/?package=/demo-packages/d1-passport/0.1.1/package.json' } } as Window;
    runInNewContext(script, { window: deployed, URL });
    window.__FORMSPEC_RUNTIME_CONFIG__ = deployed.__FORMSPEC_RUNTIME_CONFIG__;
    window.__FORMSPEC_RUNTIME_DEFAULTS__ = deployed.__FORMSPEC_RUNTIME_DEFAULTS__;
    const config = resolveActiveConfig(departmentAppProfile, readRuntimeConfig());
    expect(config.identity.mode).toBe('anonymous-allowed');
    expect(config.referenceAdapters?.formspecStack?.formspecServerUrl).toBe('http://127.0.0.1:18080');
    expect(config.referenceAdapters?.formspecStack?.nativePackageSigning).toBeUndefined();
  });
});
