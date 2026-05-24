# FW-0066 — FormRuntimePolicyExtractor port (design)

**Date:** 2026-05-24
**Status:** proposed
**Subordinate to:** web ADR-0009 (hexagonal architecture), web ADR-0011 (runtime feature resolution)
**Pulls forward:** PLANNING FW-0066 row body (open since 2026-05-23)

## Trigger pulses (recap)

The trigger fired twice. Both are documented in the FW-0066 PLANNING row:

1. **Pulse #1 — FW-0056 (`documentPresentation`).** Taxonomy extension beyond the seeded `{respondentPlace, status}` pair. The extractor logic stayed on the URL-keyed literal-switch side of the threshold.
2. **Pulse #2 — FW-0033 (`extractAttachmentRequirement`).** First non-literal extractor — recursively walks `definition.items` for `dataType === 'attachment'` fields and is composed into the default + stub compositions. This crosses the row's bright line: "anything more than `() => ({ features: {} })` or a URL-keyed literal switch."

The closure-typed `Composition.getFormRuntimePolicy` slot ships today with an inline TODO referencing the promotion trigger (`src/composition/types.ts:60`). Both pulses are spent. FW-0066 is the cleanup.

## Decision

Promote `Composition.getFormRuntimePolicy: (definition) => FormRuntimePolicy` to a named **`FormRuntimePolicyExtractor` port** with a conformance suite, per web ADR-0009.

### Port shape

**Single-method port (Option a) — chosen.**

```ts
export interface FormRuntimePolicyExtractor {
  extract(definition: FormDefinition): FormRuntimePolicy;
}
```

**Rejected alternative: multi-extractor composition (Option b)** — per-key extractors plus a reducer. Three reasons to defer:

1. **No consumer needs it today.** The two real extractors (`AttachmentRequirementExtractor`, the demo-form URL-keyed extractor) compose by feature key already. The reducer pattern can land later without breaking the port shape — a `CompositeFormRuntimePolicyExtractor` wraps `FormRuntimePolicyExtractor[]` and returns a single combined `FormRuntimePolicy`, which is exactly what FW-0066's `CompositeFormRuntimePolicyExtractor` reference adapter ships below.
2. **Direct migration is cleanest.** Option (a) is a 1:1 mapping of today's closure. No call site has to change shape, only call form (`composition.getFormRuntimePolicy(d)` → `composition.formRuntimePolicyExtractor.extract(d)`).
3. **Conformance fixtures are simpler.** Conformance asserts properties of an extractor's full output (`FormRuntimePolicy`); per-key conformance would need a parallel fixture per key on every extractor and double the suite surface for zero present value.

The per-key composition refinement is a future option, not foreclosed by this design.

### Non-form-surface accommodation (ADR-0011 addendum)

web ADR-0011 §"Non-form surface synthesis" (the FW-0039 addendum) ratified that non-form surfaces (`StatusRuntime`, `ObligationsRuntime`, `DocumentsRuntime`) synthesize their request **literally at the route boundary** as Option B: `form: { features: { status: 'optional' } }` etc. Those surfaces do NOT consume `Composition.getFormRuntimePolicy` — `RespondentRuntime.createReadyState` is the only consumer, and only when a `FormDefinition` is in scope.

After promotion, narrowed-route compositions wire an **`EmptyFormRuntimePolicyExtractor`** (`extract() => ({ features: {} })`) into the `formRuntimePolicyExtractor` slot. Non-form surfaces continue to bypass it and synthesize literally. The ADR-0011 addendum holds verbatim — no port-shape change required. Option (a) accommodates Option B; that was the addendum's escape hatch.

### Conformance contract

A conformant `FormRuntimePolicyExtractor` MUST obey:

1. **Idempotent and pure.** Same `FormDefinition` → same `FormRuntimePolicy`. No I/O, no `Date.now()`, no `Math.random()`, no captured-state mutation.
2. **Closed-set keys.** Every key in the returned `FormRuntimePolicy.features` is in `RUNTIME_FEATURE_KEYS`. Drift is caught by the resolver via `InvalidRuntimePolicyError` at form load, but the conformance test catches it earlier in adapter-author CI.
3. **Closed-set modes.** Every value is `'forbidden' | 'optional' | 'required'` (`isFormFeaturePolicyMode`).
4. **No-throw on empty definition.** A definition with `items: []` returns `{ features: {} }`, never throws. (Adopter extractors MAY throw on malformed input; the production wrapper in `createReadyState` catches and re-raises as `InvalidRuntimePolicyError`. Conformance suite asserts the empty path stays clean.)
5. **Definition-only derivation.** The mode for any key is derivable from the `FormDefinition` alone — no instance-policy or org-policy leakage into the form layer (ADR-0011 §Form runtime policy: "Form policy is form-owned"). The conformance suite verifies this structurally: calling `extract` twice with the same definition object — and once with a freshly-`JSON.parse(JSON.stringify(...))`'d copy — returns the same policy.
6. **Vocabulary firewall.** The extractor's only output is the structured `FormRuntimePolicy` shape; spec jargon never reaches user-facing chrome through it. Documented as an invariant; no programmatic assertion needed because the type already enforces it.

Minimum fixture cases (≥5 per acceptance criterion 4):

- `extract` returns a schema-valid `FormRuntimePolicy` for the sample definition.
- `extract` returns `{ features: {} }` for a definition with `items: []`.
- `extract` is deterministic across repeated calls and JSON round-trips.
- `extract` only returns keys in `RUNTIME_FEATURE_KEYS`.
- `extract` only returns modes in `{forbidden, optional, required}`.

### Reference adapters

After promotion, four extractors land:

| Adapter | Lives at | Behavior | Provenance |
|---|---|---|---|
| `EmptyFormRuntimePolicyExtractor` | `src/adapters/composing/form-runtime-policy-extractor.ts` | `extract() => ({ features: {} })`. | none |
| `AttachmentRequirementExtractor` | `src/adapters/composing/form-runtime-policy-extractor.ts` | Wraps `extractAttachmentRequirement(definition)` and returns `{ features: { fileUpload: 'required' } }` if any attachment field present, else `{ features: {} }`. | none |
| `DemoFormPolicyExtractor` | `src/adapters/stub/form-runtime-policy-extractor.ts` | Returns `{ features: { respondentPlace: 'optional', status: 'optional' } }` if `definition.url === demoSampleFormUrl`, else `{ features: {} }`. | `DEMO_STUB_ADAPTER` |
| `CompositeFormRuntimePolicyExtractor` | `src/adapters/composing/form-runtime-policy-extractor.ts` | Composes an ordered `FormRuntimePolicyExtractor[]` by merging their feature maps; later extractors override earlier ones on a key collision. | none |

**Demo composition** wires `CompositeFormRuntimePolicyExtractor([new DemoFormPolicyExtractor(), new AttachmentRequirementExtractor()])`.
**Default production composition** wires `new AttachmentRequirementExtractor()` (single — the demo-form extractor stays in stub-land).
**Narrowed-route compositions** wire `new EmptyFormRuntimePolicyExtractor()`.

The composite is the substrate primitive feature-ADR authors compose new extractors into. The convention: new feature ADRs ship their walker as a separate extractor adapter and the composition root composes them in. No more inline closures in composition factories.

### Conformance coverage gate

`assertCompositionCoherence` runs unchanged. `FormRuntimePolicyExtractor` is **NOT** in `FEATURE_PORT_MAP` — extractors are not gated on instance-capability provenance. The `DemoFormPolicyExtractor` carries the `DEMO_STUB_ADAPTER` marker for symmetry with other demo adapters; the coherence assertion ignores it because no `FEATURE_PORT_MAP` entry points to the new slot. This is deliberate: form-policy extractors are deployment-shaped logic, not capability adapters.

`check-conformance-coverage.mjs` gets the new port + adapter registrations:

- `'FormRuntimePolicyExtractor'` added to `portSuites`.
- `src/adapters/stub/form-runtime-policy-extractor.ts → 'FormRuntimePolicyExtractor'` and `src/adapters/composing/form-runtime-policy-extractor.ts → 'FormRuntimePolicyExtractor'` added to `stubPortsByPath` (with factory regex broadened to cover the `composing/` folder).
- `requiredHarnessExports` adds `'defineFormRuntimePolicyExtractorConformance'`.
- The README adds `form-runtime-policy-extractor/` to the directory skeleton.

## Composition contract migration

`Composition.getFormRuntimePolicy: (definition) => FormRuntimePolicy` becomes `Composition.formRuntimePolicyExtractor: FormRuntimePolicyExtractor`. The closure-typed slot is **gone**, not aliased — per project no-shims discipline (MEMORY.md `feedback_no_shims_refactor.md`).

Every consumer that calls `composition.getFormRuntimePolicy(definition)` rewrites to `composition.formRuntimePolicyExtractor.extract(definition)`. Inventory from `grep -rn "getFormRuntimePolicy" src/ tests/`:

| Path | Treatment |
|---|---|
| `src/composition/types.ts` | Slot renamed; closure type replaced by `FormRuntimePolicyExtractor` interface import. TODO comment removed. |
| `src/composition/default.ts` | `getFormRuntimePolicy: (definition) => { … }` → `formRuntimePolicyExtractor: new AttachmentRequirementExtractor()`. |
| `src/composition/stub.ts` | `getFormRuntimePolicy: (definition) => { … }` → `formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([new DemoFormPolicyExtractor(), new AttachmentRequirementExtractor()])`. |
| `src/composition/route-narrowing.ts` (both factories) | `getFormRuntimePolicy: emptyFormRuntimePolicy` → `formRuntimePolicyExtractor: new EmptyFormRuntimePolicyExtractor()`. The local helper `emptyFormRuntimePolicy` is deleted. |
| `src/app/RespondentRuntime.tsx:479` | `composition.getFormRuntimePolicy(definition)` → `composition.formRuntimePolicyExtractor.extract(definition)`. Try/catch + `InvalidRuntimePolicyError` re-raise stays. |
| `tests/profiles/composition-policy-wiring.test.ts` | `c.getFormRuntimePolicy(...)` → `c.formRuntimePolicyExtractor.extract(...)`. |
| `tests/composition/route-narrowing.test.ts` | Same rewrite. |
| `tests/smoke/composition.test.ts:297` | `c.getFormRuntimePolicy` → `c.formRuntimePolicyExtractor`. |
| `tests/app/documents-runtime.test.tsx` (×2) | Fixture compositions: literal `{ extract: () => ({ features: {} }) }` extractor instances. |
| `tests/app/obligations-runtime.test.tsx` (×2) | Same. |
| `tests/app/respondent-runtime.test.tsx` | Same. |
| `tests/app/runtime-feature-error-boundary.test.tsx` | `composition.getFormRuntimePolicy = …` → `composition.formRuntimePolicyExtractor = { extract: … }`. |
| `tests/app/runtime-feature-gating.test.tsx` | Same. |
| `tests/app/status-runtime.test.tsx` | Same. |
| `tests/app/runtime-feature-extractor-error.test.tsx` (×2) | Same; error-thrown extractor shape changes from closure to `{ extract: () => { throw … } }`. |
| `tests/app/respondent-runtime-attachment.test.tsx` | Same; fixture extractor becomes an extractor instance. |

The renamed slot also surfaces in three doc files and four planning/spec docs — content updates only, no behavior change. The composition contract TS rewrite catches every consumer that misses the rename.

## Acceptance criteria

1. Port interface lives at `src/ports/form-runtime-policy-extractor.ts`; exported from `src/ports/index.ts`.
2. Conformance suite at `tests/adapter-conformance/form-runtime-policy-extractor/conformance.test.ts` with ≥5 assertions; framework helper exported from `src/adapter-conformance/conformance.ts` + `src/adapter-conformance/index.ts` + `tests/adapter-conformance/_framework/conformance.ts`.
3. Reference adapters at `src/adapters/composing/form-runtime-policy-extractor.ts` (`EmptyFormRuntimePolicyExtractor`, `AttachmentRequirementExtractor`, `CompositeFormRuntimePolicyExtractor`) and `src/adapters/stub/form-runtime-policy-extractor.ts` (`DemoFormPolicyExtractor`). Each is registered in the conformance suite.
4. `Composition.formRuntimePolicyExtractor: FormRuntimePolicyExtractor` replaces the closure-typed slot. No alias, no shim. The TODO comment is gone.
5. All four composition factories (default, stub, route-narrowed × 2) wire the appropriate extractor instance.
6. All call sites — 1 in `src/app/` + 11 test files — are rewritten to `extractor.extract(definition)` shape.
7. `docs/policy/runtime-feature-resolution.md` updated to describe the port + adopter extension protocol § "Adding a new feature key" includes the extractor registration step.
8. `scripts/check-conformance-coverage.mjs` knows about the new port + adapters; `npm run ci` is green.
9. ADR-0011's "Non-form surface synthesis" addendum is re-read; the port shape composes with Option B literal synthesis (verified by `tests/composition/route-narrowing.test.ts` continuing to pass with `EmptyFormRuntimePolicyExtractor`).
10. FW-0066 row in PLANNING.md moves to `## Closed` with the standard close-out pattern.

## Non-goals

- No new feature key. The taxonomy stays at `{respondentPlace, status, documentPresentation, fileUpload}`.
- No reducer/per-key port (Option b). Reserved as a future refinement.
- No change to ADR-0011, the resolver, error semantics, or coherence assertion.
- No change to `extractAttachmentRequirement` itself — it stays a pure helper in `src/policy/extract-form-policy.ts` and `AttachmentRequirementExtractor` wraps it. Two layers because the helper is also unit-tested independently and the wrapper is the port-conforming surface.

## Related decisions

- web ADR-0009 §"Conformance suite per port" — promotion shape.
- web ADR-0011 §"Non-form surface synthesis" addendum — Option B compatibility.
- PLANNING.md FW-0066 row — trigger pulses #1 + #2.
- Implementation plan: `thoughts/plans/2026-05-24-fw-0066-form-runtime-policy-extractor-port.md`.
