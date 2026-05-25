import { describe, expect, it } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';
import { demoSampleFormUrl } from '../../src/demo/index.ts';
import { sampleFormDefinition } from '../../src/adapter-conformance/fixtures.ts';

describe('Composition declares runtime-feature policy seams', () => {
  it('stub composition declares demo-stub capabilities for the two seeded features', () => {
    const c = createStubComposition();
    expect(c.instanceCapabilities.respondentPlace).toBe('demo-stub');
    expect(c.instanceCapabilities.status).toBe('demo-stub');
  });

  it('stub composition exposes an allow-all org runtime policy', () => {
    const c = createStubComposition();
    expect(c.orgRuntimePolicy.features.respondentPlace).toBe('allowed');
    expect(c.orgRuntimePolicy.features.status).toBe('allowed');
  });

  it('stub composition opts the demo form into seeded and trusted-reviewer features as optional', () => {
    const c = createStubComposition();
    const policy = c.formRuntimePolicyExtractor.extract({
      ...sampleFormDefinition,
      url: demoSampleFormUrl,
    });
    expect(policy.features).toEqual({
      respondentPlace: 'optional',
      status: 'optional',
      trustedReviewer: 'optional',
    });
    expect(policy.limits?.trustedReviewer).toMatchObject({
      posture: 'suggest-allowed',
      respondentOnlyFieldPointers: ['/data/ssn', '/data/protectedAddress'],
    });
  });

  it('stub composition returns an empty policy for non-demo form definitions', () => {
    const c = createStubComposition();
    const policy = c.formRuntimePolicyExtractor.extract({
      ...sampleFormDefinition,
      url: 'urn:other-form',
    });
    expect(policy.features).toEqual({});
  });
});
