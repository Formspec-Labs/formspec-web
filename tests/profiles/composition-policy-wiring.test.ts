import { describe, expect, it } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';
import { demoSampleFormUrl } from '../../src/demo/index.ts';

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

  it('stub composition opts the demo form into both seeded features as optional', () => {
    const c = createStubComposition();
    const policy = c.getFormRuntimePolicy({ url: demoSampleFormUrl, version: '1' } as never);
    expect(policy.features).toEqual({
      respondentPlace: 'optional',
      status: 'optional',
    });
  });

  it('stub composition returns an empty policy for non-demo form definitions', () => {
    const c = createStubComposition();
    const policy = c.getFormRuntimePolicy({ url: 'urn:other-form', version: '1' } as never);
    expect(policy.features).toEqual({});
  });
});
