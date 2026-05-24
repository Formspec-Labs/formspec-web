/**
 * Demo-only `FormRuntimePolicyExtractor` that opts the bundled sample form
 * into the seeded `respondentPlace` + `status` runtime-feature pair. Adopters
 * SHOULD NOT wire this in production — the URL-keyed branch only matches the
 * single bundled demo form; for every other definition it returns the empty
 * policy.
 *
 * Marked `DEMO_STUB_ADAPTER` for symmetry with the other demo adapters; the
 * coherence assertion ignores the marker because `formRuntimePolicyExtractor`
 * is not in `FEATURE_PORT_MAP` (per FW-0066 design — extractors are deployment-
 * shaped logic, not capability adapters gated on provenance).
 */
import { demoSampleFormUrl } from '../../demo/index.ts';
import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import type { FormRuntimePolicy } from '../../policy/policy-shapes.ts';
import type { FormRuntimePolicyExtractor } from '../../ports/form-runtime-policy-extractor.ts';
import type { FormDefinition } from '../../ports/definition-source.ts';

export class DemoFormPolicyExtractor implements FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy {
    if (definition.url === demoSampleFormUrl) {
      return { features: { respondentPlace: 'optional', status: 'optional' } };
    }
    return { features: {} };
  }
}

export function stubFormRuntimePolicyExtractor(): FormRuntimePolicyExtractor {
  const adapter = new DemoFormPolicyExtractor();
  markDemoStubAdapter(adapter, {
    featureKey: 'respondentPlace',
    reason: 'demo-only URL-keyed extractor; opts the bundled sample form into the seeded runtime-feature pair',
  });
  return adapter;
}
