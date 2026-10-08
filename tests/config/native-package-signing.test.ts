import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESPONSE_REVIEW_WIDGET_SHAPE, SIGNING_CEREMONY_WIDGET_SHAPE } from '@formspec-org/surface-react';
import { nativePackageSigningConfig, readNativePackageSigningConfig } from '../../src/config/native-package-signing.ts';
import { readRuntimeConfig, resolveActiveConfig, runtimeConfigFromEnvRecord } from '../../src/config/runtime.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const names = [...new Set([...SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs,
    ...RESPONSE_REVIEW_WIDGET_SHAPE.dataInputs].map(input => input.name))];
  return {
    keyId: 'deployment-key', definition: { url: 'urn:test:definition', version: '0.1.5' },
    bundle: { id: 'https://example.test/package', version: '0.1.5' },
    module: { id: 'x-example-signing', version: '0.1.0' }, initialLocale: 'es-US',
    roles: Object.fromEntries(['saveInitial', 'saveOwned', 'prepare', 'sign', 'submit', 'paper'].map(actionRef =>
      [actionRef, { artifactRef: 'urn:test:actions', actionRef }])),
    bindings: Object.fromEntries(names.map(name => [name, { catalogRef: 'urn:test:sources', sourceRef: `host:${name}` }])),
    readiness: { instance: 'scratch', readyPath: 'ready', ownedPath: 'owned' },
  };
}

describe('closed native package signing opt-in', () => {
  it('leaves omitted configuration disabled and ignores environment and URL activation attempts', () => {
    expect(readNativePackageSigningConfig({})).toBeUndefined();
    expect(resolveActiveConfig(publicPortalProfile).referenceAdapters?.formspecStack?.nativePackageSigning).toBeUndefined();
    expect(runtimeConfigFromEnvRecord({ FORMSPEC_WEB_NATIVE_PACKAGE_SIGNING: JSON.stringify(fixture()),
      VITE_FORMSPEC_WEB_NATIVE_PACKAGE_SIGNING: 'true' })).not.toHaveProperty('nativePackageSigning');
    vi.stubGlobal('window', { location: { search: '?nativePackageSigning=true' } });
    expect(readRuntimeConfig()).not.toHaveProperty('nativePackageSigning');
  });

  it('preserves runtime JS pins and authored locale while detaching nested mutable inputs', () => {
    const value = fixture();
    vi.stubGlobal('window', { __FORMSPEC_RUNTIME_CONFIG__: { nativePackageSigning: value } });
    const runtime = readRuntimeConfig();
    expect(runtime.nativePackageSigning).toEqual(value);
    const active = resolveActiveConfig(publicPortalProfile, runtime);
    expect(active.referenceAdapters?.formspecStack?.nativePackageSigning).toEqual(value);
    value.roles.sign.actionRef = 'changed';
    expect(runtime.nativePackageSigning!.roles.sign.actionRef).toBe('sign');
    expect(() => { runtime.nativePackageSigning!.bindings.response.sourceRef = 'changed'; }).toThrow();
    expect(active.referenceAdapters!.formspecStack!.nativePackageSigning).not.toBe(runtime.nativePackageSigning);
    expect(active.referenceAdapters!.formspecStack!.nativePackageSigning!.bindings.response.sourceRef).toBe('host:response');
    expect(active.ports).toEqual(publicPortalProfile.ports);
  });

  it('admits explicit exact module pins independently of the signing module and detaches them', () => {
    const value = { ...fixture(), modules: [{ id: 'x-review', version: '42' }, fixture().module] };
    const selected = nativePackageSigningConfig(value);
    expect(selected.modules).toEqual(value.modules);
    value.modules[0].version = 'changed';
    expect(selected.modules![0].version).toBe('42');
    expect(nativePackageSigningConfig(fixture()).modules).toBeUndefined();
  });

  it.each([
    ['empty module selection', []],
    ['missing signing module', [{ id: 'x-review', version: '1' }]],
    ['changed signing version', [{ ...fixture().module, version: 'other' }]],
    ['duplicate module ID', [fixture().module, { ...fixture().module, version: 'other' }]],
    ['extra module pin key', [fixture().module, { id: 'x-review', version: '1', trusted: true }]],
    ['empty additional module version', [fixture().module, { id: 'x-review', version: '' }]],
  ])('refuses %s', (_name, modules) => {
    expect(() => nativePackageSigningConfig({ ...fixture(), modules })).toThrow();
  });

  it('admits the optional Start role only with a complete detached capability path map', () => {
    const value = { ...fixture(), applicationLifecycle: { instance: 'scratch', canStartPath: 'canStart', startedPath: 'started', persistentSavingPath: 'persistentSaving' },
      roles: { ...fixture().roles, startApplication: { artifactRef: 'urn:test:actions', actionRef: 'start' } } };
    expect(nativePackageSigningConfig(value).roles.startApplication?.actionRef).toBe('start');
    expect(() => nativePackageSigningConfig({ ...value, applicationLifecycle: { ...value.applicationLifecycle, startedPath: 'canStart' } })).toThrow();
    expect(() => nativePackageSigningConfig({ ...fixture(), applicationLifecycle: value.applicationLifecycle })).toThrow();
    expect(() => nativePackageSigningConfig({ ...fixture(), roles: value.roles })).toThrow();
    expect(() => nativePackageSigningConfig({ ...value, applicationLifecycle: { ...value.applicationLifecycle, persistentSaving: true } })).toThrow();
  });
  it('uses canonical version identifiers without inventing a semver-only policy or normalizing locale pins', () => {
    const value = fixture(); value.definition.version = '42'; value.initialLocale = 'es-us';
    expect(nativePackageSigningConfig(value)).toMatchObject({ definition: { version: '42' }, initialLocale: 'es-us' });
  });

  it.each([
    ['partial object', () => ({ keyId: 'only' })],
    ['extra top-level option', () => ({ ...fixture(), activation: true })],
    ['extra pin option', () => ({ ...fixture(), definition: { ...fixture().definition, hash: 'invented' } })],
    ['empty key', () => ({ ...fixture(), keyId: ' ' })],
    ['relative Definition locator', () => ({ ...fixture(), definition: { url: '/relative', version: '0.1.5' } })],
    ['executable bundle locator', () => ({ ...fixture(), bundle: { id: 'javascript:alert(1)', version: '0.1.5' } })],
    ['empty version pin', () => ({ ...fixture(), module: { id: 'x-example', version: '' } })],
    ['wrong pin type', () => ({ ...fixture(), definition: { url: 'urn:test:definition', version: 1 } })],
    ['malformed locale', () => ({ ...fixture(), initialLocale: 'es_US' })],
    ['missing role', () => { const value = fixture(); delete value.roles.paper; return value; }],
    ['unknown role', () => { const value = fixture(); value.roles.retry = value.roles.paper; return value; }],
    ['duplicate role pair', () => { const value = fixture(); value.roles.paper = value.roles.sign; return value; }],
    ['missing optional widget input binding', () => { const value = fixture(); delete value.bindings.review; return value; }],
    ['unknown source binding', () => { const value = fixture(); value.bindings.extra = value.bindings.actor; return value; }],
    ['duplicate source pair', () => { const value = fixture(); value.bindings.actor = value.bindings.response; return value; }],
    ['extra binding option', () => ({ ...fixture(), bindings: { ...fixture().bindings, response: { catalogRef: 'urn:test:sources', sourceRef: 'host:response', authority: true } } })],
    ['non-finite JSON', () => ({ ...fixture(), keyId: Infinity })],
    ['identical readiness paths', () => ({ ...fixture(), readiness: { instance: 'scratch', readyPath: 'ready', ownedPath: 'ready' } })],
    ['empty readiness path', () => ({ ...fixture(), readiness: { instance: 'scratch', readyPath: '', ownedPath: 'owned' } })],
    ['unknown readiness option', () => ({ ...fixture(), readiness: { ...fixture().readiness, readonly: false } })],
  ])('refuses %s without fallback through both runtime entry points', (_name, build) => {
    const value = build();
    expect(() => nativePackageSigningConfig(value)).toThrow();
    vi.stubGlobal('window', { __FORMSPEC_RUNTIME_CONFIG__: { nativePackageSigning: value } });
    expect(() => readRuntimeConfig()).toThrow();
    expect(() => resolveActiveConfig(publicPortalProfile, { nativePackageSigning: value as never })).toThrow();
  });

  it.each([null, undefined, false, 'https://example.test/package'])('refuses malformed present value %s', value => {
    expect(() => readNativePackageSigningConfig({ nativePackageSigning: value })).toThrow();
  });

  it('refuses nested and runtime property accessors without executing them', () => {
    const getter = vi.fn(() => 'deployment-key');
    const value = fixture(); Object.defineProperty(value, 'keyId', { enumerable: true, get: getter });
    expect(() => nativePackageSigningConfig(value)).toThrow();
    const runtime = Object.defineProperty({}, 'nativePackageSigning', { enumerable: true, get: getter });
    vi.stubGlobal('window', { __FORMSPEC_RUNTIME_CONFIG__: runtime });
    expect(() => readRuntimeConfig()).toThrow();
    expect(() => resolveActiveConfig(publicPortalProfile, runtime)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
});
