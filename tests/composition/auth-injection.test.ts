import { describe, expect, it, vi } from 'vitest';
import { chooseComposition } from '../../src/app/main-helpers.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { createStubComposition } from '../../src/composition/stub.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

const config = { ...departmentAppProfile, ports: { ...departmentAppProfile.ports,
  definitionSource: 'reference-http' as const, draftStore: 'reference-http' as const, submitTransport: 'reference-http' as const },
  referenceAdapters: { formspecStack: { ...departmentAppProfile.referenceAdapters?.formspecStack,
    tenantHeaderDialect: 'formspec' as const, formspecServerUrl: 'https://api.example.test' } } };

describe('composition auth dependency injection', () => {
  it('uses the supplied provider across form routes', () => {
    const provider = createStubComposition().identityProvider;
    const identityBindingFactory = vi.fn(() => ({ provider }));
    const first = chooseComposition({ config, href: 'https://web.example.test/', identityBindingFactory });
    const next = chooseComposition({ config, href: 'https://web.example.test/?other=route', identityBindingFactory });
    expect(first.identityProvider).toBe(provider); expect(next.identityProvider).toBe(provider);
    expect(identityBindingFactory).toHaveBeenCalledTimes(2);
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
    expect(() => createDefaultComposition({ ...config, identity: { mode: 'anonymous-allowed' } })).toThrow(/not configured/);
  });
});
