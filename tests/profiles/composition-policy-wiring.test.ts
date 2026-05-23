import { describe, expect, it } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';

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

  it('stub composition exposes a form-policy extractor that defaults to no requirements', () => {
    const c = createStubComposition();
    const policy = c.getFormRuntimePolicy({ url: 'urn:demo', version: '1' } as never);
    expect(policy.features).toEqual({});
  });
});
