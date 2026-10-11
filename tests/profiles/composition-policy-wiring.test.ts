import { describe, expect, it } from 'vitest';
import { createTestComposition, testDefinition } from '../fixtures/composition.ts';
import { sampleFormDefinition } from '../../src/adapter-conformance/fixtures.ts';
import type { FormRuntimePolicyExtractor } from '../../src/ports/form-runtime-policy-extractor.ts';

describe('explicit composition policy wiring', () => {
  it('uses the injected policy port without selecting policy by form URL', () => {
    const extractor: FormRuntimePolicyExtractor = { extract: () => ({ features: { status: 'optional' } }) };
    const composition = createTestComposition({ formRuntimePolicyExtractor: extractor });
    expect(composition.formRuntimePolicyExtractor).toBe(extractor);
    expect(composition.formRuntimePolicyExtractor.extract(sampleFormDefinition).features).toEqual({ status: 'optional' });
    expect(composition.formRuntimePolicyExtractor.extract({ ...sampleFormDefinition, url: 'urn:test:other' }).features).toEqual({ status: 'optional' });
  });
  it('starts without form feature opt-ins when no policy is supplied', () => {
    expect(createTestComposition({ definition: testDefinition }).formRuntimePolicyExtractor.extract(sampleFormDefinition).features).toEqual({});
  });
});
