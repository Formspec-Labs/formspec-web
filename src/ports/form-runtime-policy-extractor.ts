/**
 * FormRuntimePolicyExtractor port — web ADR-0009 (port what's adopter-shaped)
 * + ADR-0011 §Form runtime policy.
 *
 * Extracts the form's runtime-policy declaration from the loaded `FormDefinition`.
 * The resolver consumes the output as one of three policy layers (instance ×
 * org × form) before producing the read-only `ResolvedRuntimeProfile` the
 * React shell renders from.
 *
 * Promotion lineage (FW-0066): this port replaces a closure-typed slot
 * (`Composition.getFormRuntimePolicy: (definition) => FormRuntimePolicy`) the
 * moment the first non-literal extractor landed (FW-0033's attachment-field
 * walker). The closure shape is gone, not aliased — adopters who forked the
 * Composition contract rewrite their extractor as a `FormRuntimePolicyExtractor`
 * instance.
 *
 * Conformance contract (enforced by `defineFormRuntimePolicyExtractorConformance`):
 *
 * 1. Pure + idempotent — same `FormDefinition` → same `FormRuntimePolicy`. No
 *    I/O, no time, no randomness, no captured-state mutation.
 * 2. Closed-set keys — every returned feature key is in `RUNTIME_FEATURE_KEYS`.
 * 3. Closed-set modes — every returned mode is `'forbidden' | 'optional' | 'required'`.
 * 4. No-throw on empty — a definition with `items: []` returns `{ features: {} }`,
 *    never throws.
 * 5. Definition-only derivation — the mode for any key is derivable from the
 *    `FormDefinition` alone; no instance- or org-policy leakage.
 *
 * Non-form surfaces (`StatusRuntime`, `ObligationsRuntime`, `DocumentsRuntime`
 * per web ADR-0011 §"Non-form surface synthesis") MUST NOT consume this port;
 * they synthesize `form: { features: { … } }` literally at the route boundary
 * (Option B). Narrowed-route compositions wire an `EmptyFormRuntimePolicyExtractor`
 * into the `formRuntimePolicyExtractor` slot to satisfy the type contract.
 */
import type { FormRuntimePolicy } from '../policy/policy-shapes.ts';
import type { FormDefinition } from './definition-source.ts';

export interface FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy;
}
