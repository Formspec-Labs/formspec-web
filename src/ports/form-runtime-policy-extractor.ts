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
 * 5. Key-collision precedence (composition contract) — when multiple extractors
 *    set the SAME feature key (typically via `CompositeFormRuntimePolicyExtractor`),
 *    the LAST extractor's value wins. Call-site ordering of the delegate array
 *    is the precedence signal. Composite extractors document their delegate
 *    order explicitly so adopters reading the composition can predict the
 *    effective policy without reading the merge implementation. See
 *    `CompositeFormRuntimePolicyExtractor` at
 *    `src/adapters/composing/form-runtime-policy-extractor.ts` — the
 *    last-wins guarantee is the `Object.assign(features, policy.features)`
 *    loop body.
 *
 * Definition-only derivation is structurally enforced by the single-argument
 * `extract(definition)` signature — no harness assertion is required because
 * there is no parameter through which instance- or org-policy could leak.
 *
 * Shallow-merge constraint (future-feature-key contract). The composite merge
 * is a one-level `Object.assign` over `policy.features`. This is sound only
 * because `FormFeaturePolicyMode` is a primitive string union
 * (`'forbidden' | 'optional' | 'required'`); deep-merge has no semantic in
 * this port. Any future feature whose value type is NOT a primitive string
 * mode (object, array, nested record) breaks the contract — last-wins would
 * still apply, but adopters composing two delegates over an object-valued key
 * would silently lose fields from the earlier delegate. New feature keys MUST
 * stay primitive-typed; if a future feature needs richer structure, the port
 * (and the composite merge) versions together.
 *
 * Synchronous-forever signature. `extract` returns `FormRuntimePolicy`
 * synchronously, not `Promise<FormRuntimePolicy>`. Invariant #1 (pure, no I/O)
 * makes async unjustified by construction — all known extractors are pure
 * transforms over the in-memory definition. The trigger that would force a
 * migration to async: a future extractor needs to fetch a remote schema
 * reference, OR consult an external registry whose contents are not part of
 * the definition. The remediation for that trigger is NOT to migrate this
 * port to async; it is either (a) pre-resolve the remote reference before
 * passing the resolved definition to `extract`, or (b) version the port to
 * `FormRuntimePolicyExtractorV2` with an async signature. Adopters who
 * publish their own extractor crates rely on the sync signature being
 * stable across the v1 lifetime of this port.
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
