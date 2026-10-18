import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRuntimeConfig, resolveActiveConfig } from '../../src/config/runtime.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { deriveScopeKey } from '../../src/shared/scope-key.ts';
import { RESPONSE_REVIEW_WIDGET_SHAPE, SIGNING_CEREMONY_WIDGET_SHAPE } from '@formspec-org/surface-react/widget-metadata';

function deploymentSigning() {
  const inputs = [...new Set([...SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs, ...RESPONSE_REVIEW_WIDGET_SHAPE.dataInputs].map(input => input.name))];
  return {
    keyId: 'deployment-key', expectedIssuer: 'https://source.example.test/tenant/workspace/production',
    definition: { url: 'urn:test:definition', version: '1' }, bundle: { id: 'urn:test:app', version: '1' },
    module: { id: 'x-test-signing', version: '1' }, initialLocale: 'en',
    roles: Object.fromEntries(['saveInitial', 'saveOwned', 'prepare', 'sign', 'submit', 'paper'].map(actionRef =>
      [actionRef, { artifactRef: 'urn:test:actions', actionRef }])),
    bindings: Object.fromEntries(inputs.map(name => [name, { catalogRef: 'urn:test:sources', sourceRef: `host:${name}` }])),
    readiness: { instance: 'scratch', readyPath: 'ready', ownedPath: 'owned' },
  };
}

const script = readFileSync('public/formspec-runtime-config.js', 'utf8');
afterEach(() => { vi.unstubAllEnvs(); delete window.__FORMSPEC_RUNTIME_CONFIG__; delete window.__FORMSPEC_RUNTIME_DEFAULTS__; });

describe('package defaults preserve explicit deployment identity', () => {
  it('preserves trusted settings injected before the native package script runs', () => {
    const trusted = {
      profileName: 'departmentApp',
      formspecServerUrl: 'http://127.0.0.1:18084',
      oidcIssuer: 'http://127.0.0.1:18090/realms/formspec-dev',
      oidcClientId: 'formspec-web-dev',
      oidcMinAssurance: 'L1',
      oidcAcrAssuranceMapJson: '{"1":"L1"}',
      scopeKey: deriveScopeKey({ tenant: 'tenant-test', workspace: 'workspace-test', environment: 'environment-test' }),
      nativePackageSigning: deploymentSigning(),
    } as const;
    const deployed = {
      location: { href: 'http://127.0.0.1:5173/?form=form_d1_passport_001&package=/demo-packages/d1-passport/v0.1.6/package.json' },
      __FORMSPEC_RUNTIME_CONFIG__: trusted,
    } as unknown as Window;
    runInNewContext(script, { window: deployed, URL });
    expect(deployed.__FORMSPEC_RUNTIME_CONFIG__).toMatchObject(trusted);
    window.__FORMSPEC_RUNTIME_CONFIG__ = JSON.parse(JSON.stringify(deployed.__FORMSPEC_RUNTIME_CONFIG__));
    window.__FORMSPEC_RUNTIME_DEFAULTS__ = JSON.parse(JSON.stringify(deployed.__FORMSPEC_RUNTIME_DEFAULTS__));
    const config = resolveActiveConfig(departmentAppProfile, readRuntimeConfig());
    expect(config.scopeKey).toBe(trusted.scopeKey);
    expect(config.identity.oidc).toMatchObject({
      issuer: trusted.oidcIssuer, clientId: trusted.oidcClientId,
      minAssurance: 'L1', acrAssuranceMap: { '1': 'L1' },
    });
    expect(config.referenceAdapters?.formspecStack?.formspecServerUrl).toBe(trusted.formspecServerUrl);
    expect(config.referenceAdapters?.formspecStack?.nativePackageSigning).toEqual(trusted.nativePackageSigning);
  });
  it.each(['0.1.5', '0.1.6'])('keeps root-selected OIDC and backend without activating signing from a v%s URL', version => {
    const deployed = { location: { href: `http://127.0.0.1:5173/?form=form_d1_passport_001&package=/demo-packages/d1-passport/v${version}/package.json` } } as Window;
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
    expect(config.referenceAdapters?.formspecStack?.nativePackageSigning).toBeUndefined();
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
    expect(config.scopeKey).toBe(deriveScopeKey({ tenant: 'tenant-managed-single-cell', workspace: 'workspace-managed-single-cell', environment: 'production' }));
  });
});
