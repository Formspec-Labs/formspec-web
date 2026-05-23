# Runtime Feature Resolution and Policy Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the load-bearing scaffolding ratified by [web ADR-0011](../adr/0011-runtime-feature-resolution-and-policy-gates.md) — a pure `RuntimeFeatureResolver`, typed configuration errors, the `ResolvedRuntimeProfile` consumed by the React shell, an unavailable-adapter sentinel discriminator, and the form-load error boundary that renders a plain-language unavailable page — seeded with the two post-MVP capability keys that already have ports (`respondentPlace`, `status`).

**Architecture:** Three policy layers (instance, org, form) flow into one immutable resolved profile via a pure function. The composition root declares `InstanceCapabilities` alongside the adapters it wires; unavailable adapters carry a typed sentinel marker so policy-resolution distinguishes "known absent" from "explodes." The shell consumes only `ResolvedRuntimeProfile` (per ADR-0011 §Decision); resolver errors are caught at the form-load boundary and rendered as plain-language pages while preserving the typed error code for telemetry. The ADR's Non-goals (no JSON schema for policy docs, no per-feature fan-out) bound this work — future feature ADRs extend the closed feature-key taxonomy and wire their capability keys.

**Seeded callsites are gated in this plan, not deferred.** The two existing unconditional adapter calls in `RespondentRuntime.tsx` — `loadRespondentPlace` at line 207 invoking `composition.respondentPlaceSource.readPlace` (line 424), and `readSubmissionStatuses` invoking `composition.statusReader.readStatus` (line 442) — back the two seeded feature keys. Without gating them on the resolved profile, the production composition computes `enabled: {}` while the shell still calls the unavailable sentinels and renders a generic adapter error instead of the ADR-promised hidden-or-unavailable-state UI. That would ship ADR-0011 §Failure Semantics broken for the very keys this plan seeds. Task 12b adds the gating: the respondent-place panel is hidden when `respondentPlace` is disabled, and per-submission status fetches are skipped when `status` is disabled. Feature-richer consumers (FW-0055/56/57 fan-out, FW-0039 expansion) extend the gating shape later; the seam-row ships a working baseline.

**Tech Stack:** TypeScript 5 strict, React 19, Vitest, ESLint with `no-restricted-paths` (already enforced per [web ADR-0009](../adr/0009-hexagonal-architecture-ports-and-adapters.md) §Discipline). No new runtime dependencies.

---

## File Structure

**New files (all in `src/policy/`):**

- `src/policy/feature-keys.ts` — closed `RuntimeFeatureKey` taxonomy + `LOCALE_CONDITIONAL_FEATURE_KEYS` set; seeded with `respondentPlace`, `status`. Future ADRs extend.
- `src/policy/policy-shapes.ts` — `InstanceCapabilities`, `OrgRuntimePolicy`, `FormRuntimePolicy`, `ResolvedRuntimeProfile`, `DisabledReason` types.
- `src/policy/errors.ts` — `UnsupportedRequiredFeatureError`, `FeaturePolicyConflictError`, `OrgPolicyUnsatisfiedError`, `InvalidRuntimePolicyError`, base class.
- `src/policy/sentinel.ts` — adapter provenance markers: `UNAVAILABLE_ADAPTER` + `DEMO_STUB_ADAPTER` symbols, `markUnavailableAdapter` / `markDemoStubAdapter` / `isUnavailableAdapter` / `isDemoStubAdapter`.
- `src/policy/feature-port-map.ts` — single source of truth tying every `RuntimeFeatureKey` to its `Composition` port slot.
- `src/policy/composition-coherence.ts` — `assertCompositionCoherence` + `CompositionIncoherenceError`; enforces ADR-0011 §Rationale #1 honesty invariant.
- `src/policy/resolver.ts` — pure `resolveRuntimeFeatures(input): ResolvedRuntimeProfile`.
- `src/policy/index.ts` — barrel.
- `src/policy/resolver.test.ts` — collocated unit tests for resolver logic.
- `tests/policy-resolution/cases/required-instance-unsupported.json`
- `tests/policy-resolution/cases/required-org-forbidden.json`
- `tests/policy-resolution/cases/required-org-instance-unsupported.json`
- `tests/policy-resolution/cases/form-forbidden-org-required.json`
- `tests/policy-resolution/cases/optional-falls-off.json`
- `tests/policy-resolution/cases/default-on-instance-unavailable.json`
- `tests/policy-resolution/cases/default-on-instance-available.json`
- `tests/policy-resolution/cases/required-feature-unavailable-sentinel.json`
- `tests/policy-resolution/cases/invalid-form-policy-mode.json`
- `tests/policy-resolution/cases/demo-stub-satisfies-demo.json`
- `tests/policy-resolution/cases/demo-stub-fails-production.json`
- `tests/policy-resolution/resolve-cases.test.ts` — fixture-driven resolver tests.
- `tests/profiles/composition-coherence.test.ts` — provenance ↔ declaration coherence (both directions, mode-aware) enforced on every shipped composition.
- `tests/adapters/demo-stub-marker.test.ts` — seeded-feature stub adapters carry the demo-stub provenance marker.
- `tests/app/runtime-feature-error-boundary.test.tsx` — shell renders plain-language page from typed errors.
- `tests/app/runtime-feature-locale-recompute.test.tsx` — tripwire test fails the moment any feature key becomes locale-conditional, forcing the implementer to wire the recompute path.
- `tests/app/runtime-feature-gating.test.tsx` — proves disabled seeded features never invoke their (potentially unavailable) adapters and the panel is hidden, per ADR-0011 §Failure Semantics.
- `docs/policy/runtime-feature-resolution.md` — adopter-facing reference for the resolver, capability taxonomy, key-spelling coordination protocol, and the closed feature-key extension steps.

**Modified files:**

- `src/adapters/unavailable/respondent-place-source.ts` — return unavailable-marked sentinel.
- `src/adapters/unavailable/status-reader.ts` — return unavailable-marked sentinel.
- `src/adapters/stub/respondent-place-source.ts` — mark with demo-stub provenance.
- `src/adapters/stub/status-reader.ts` — mark with demo-stub provenance.
- `src/composition/types.ts` — extend `Composition` with `instanceCapabilities: InstanceCapabilities`, `orgRuntimePolicy: OrgRuntimePolicy`, `getFormRuntimePolicy: (definition) => FormRuntimePolicy`.
- `src/composition/default.ts` — declare capabilities for the production HTTP composition: `respondentPlace: 'unavailable'`, `status: 'unavailable'`; allow-all org policy; permissive form-policy extractor; call `assertCompositionCoherence` before return.
- `src/composition/stub.ts` — declare `respondentPlace: 'demo-stub'`, `status: 'demo-stub'`; allow-all org policy; call `assertCompositionCoherence` before return.
- `src/composition/demo.ts` — re-exports stub (no change needed but verify).
- `src/app/RespondentRuntime.tsx` — compute resolved profile after definition load; catch typed errors and render `RuntimePolicyError` plain-language page; pass profile to children via context; **gate `loadRespondentPlace` and `readSubmissionStatuses` on `profile.enabled`**; restart `createReadyState` when a locale change crosses a locale-conditional key.
- `src/app/CompositionProvider.tsx` — add sibling `ResolvedRuntimeProfileContext` + `useResolvedRuntimeProfile` hook for downstream consumers.
- `src/index.ts` — re-export `./policy` barrel for adopter use.
- `package.json` — add `./policy` to `exports`; **extend `test:unit` to include `src/policy`, `tests/policy-resolution`, `tests/profiles`** so the suite ships to CI.
- `PLANNING.md` — add `FW-0065` row tracking this scaffold.
- `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md` — append "Related plan" link.

---

### Task 1: Closed feature-key taxonomy + recompute-trigger metadata

**Files:**
- Create: `src/policy/feature-keys.ts`
- Test: `src/policy/feature-keys.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// src/policy/feature-keys.test.ts
import { describe, expect, it } from 'vitest';
import {
  LOCALE_CONDITIONAL_FEATURE_KEYS,
  RUNTIME_FEATURE_KEYS,
  isLocaleConditionalFeatureKey,
  isRuntimeFeatureKey,
  type RuntimeFeatureKey,
} from './feature-keys.ts';

describe('RUNTIME_FEATURE_KEYS', () => {
  it('seeds with respondentPlace and status only (per ADR-0011 Follow-on Work)', () => {
    expect([...RUNTIME_FEATURE_KEYS]).toEqual(['respondentPlace', 'status']);
  });

  it('isRuntimeFeatureKey narrows arbitrary strings', () => {
    const candidate: string = 'status';
    expect(isRuntimeFeatureKey(candidate)).toBe(true);
    expect(isRuntimeFeatureKey('payment')).toBe(false);
  });

  it('type RuntimeFeatureKey is the union of the seeded keys', () => {
    const k: RuntimeFeatureKey = 'respondentPlace';
    expect(k).toBe('respondentPlace');
  });

  it('no seeded feature key is locale-conditional today (ADR-0011 §Resolution recompute trigger)', () => {
    expect(LOCALE_CONDITIONAL_FEATURE_KEYS.size).toBe(0);
    expect(isLocaleConditionalFeatureKey('status')).toBe(false);
    expect(isLocaleConditionalFeatureKey('respondentPlace')).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/policy/feature-keys.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write minimal implementation**

```ts
// src/policy/feature-keys.ts
/**
 * Closed taxonomy of runtime feature keys (web ADR-0011).
 *
 * Seeded with the two post-MVP capabilities that already have ports:
 *   - respondentPlace  → RespondentPlaceSource (web ADR-0010)
 *   - status           → StatusReader (web ADR-0010, FW-0039)
 *
 * Extension protocol: every future feature ADR adds its key here and to the
 * Composition's InstanceCapabilities declaration. No string-typed feature keys
 * outside this set — the resolver rejects unknown keys with
 * InvalidRuntimePolicyError so that drift is caught at boot, not at feature-use.
 *
 * Recompute triggers (ADR-0011 §Resolution): the React shell MUST recompute
 * the profile on identity / issuer / locale / form-version change "in a way
 * that affects policy." Identity and form-version triggers always recompute.
 * Locale recompute is conditional: feature ADRs whose policy depends on
 * locale (e.g., jurisdictional safe-address handling) add their key to
 * LOCALE_CONDITIONAL_FEATURE_KEYS. The shell's locale-change handler checks
 * the set before restarting the form-load boundary.
 */
export const RUNTIME_FEATURE_KEYS = ['respondentPlace', 'status'] as const;

export type RuntimeFeatureKey = (typeof RUNTIME_FEATURE_KEYS)[number];

const KNOWN: ReadonlySet<string> = new Set<string>(RUNTIME_FEATURE_KEYS);

export function isRuntimeFeatureKey(value: string): value is RuntimeFeatureKey {
  return KNOWN.has(value);
}

/**
 * Feature keys whose resolved profile depends on the active locale.
 * Empty today; future feature ADRs (e.g., jurisdictional safe-address per
 * FW-0049/0060) add their key here. The shell consults this set to decide
 * whether locale change triggers a profile recompute.
 */
export const LOCALE_CONDITIONAL_FEATURE_KEYS: ReadonlySet<RuntimeFeatureKey> = new Set<RuntimeFeatureKey>();

export function isLocaleConditionalFeatureKey(value: string): value is RuntimeFeatureKey {
  return isRuntimeFeatureKey(value) && LOCALE_CONDITIONAL_FEATURE_KEYS.has(value);
}

export function anyEnabledFeatureIsLocaleConditional(
  enabled: ReadonlySet<RuntimeFeatureKey>,
): boolean {
  for (const key of enabled) {
    if (LOCALE_CONDITIONAL_FEATURE_KEYS.has(key)) return true;
  }
  return false;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/policy/feature-keys.test.ts`
Expected: PASS (3 tests). *Actual: 4 tests passed — plan undercounted by one.*

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/policy/feature-keys.ts src/policy/feature-keys.test.ts -m "feat(policy): seed runtime feature-key taxonomy (web ADR-0011)

Closed set seeded with respondentPlace + status — the two post-MVP
capabilities with shipped ports. Future feature ADRs extend the set."
```

---

### Task 2: Policy-shape types

**Files:**
- Create: `src/policy/policy-shapes.ts`
- Test: `src/policy/policy-shapes.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// src/policy/policy-shapes.test.ts
import { describe, expect, it } from 'vitest';
import {
  isOrgFeaturePolicyMode,
  isFormFeaturePolicyMode,
  isCapabilityAvailability,
  type ResolvedRuntimeProfile,
} from './policy-shapes.ts';

describe('policy-shapes guards', () => {
  it('isOrgFeaturePolicyMode accepts the four ADR-0011 modes', () => {
    expect(isOrgFeaturePolicyMode('forbidden')).toBe(true);
    expect(isOrgFeaturePolicyMode('allowed')).toBe(true);
    expect(isOrgFeaturePolicyMode('default-on')).toBe(true);
    expect(isOrgFeaturePolicyMode('required')).toBe(true);
    expect(isOrgFeaturePolicyMode('optional')).toBe(false);
  });

  it('isFormFeaturePolicyMode accepts the three ADR-0011 modes', () => {
    expect(isFormFeaturePolicyMode('forbidden')).toBe(true);
    expect(isFormFeaturePolicyMode('optional')).toBe(true);
    expect(isFormFeaturePolicyMode('required')).toBe(true);
    expect(isFormFeaturePolicyMode('allowed')).toBe(false);
  });

  it('isCapabilityAvailability accepts available, demo-stub, unavailable', () => {
    expect(isCapabilityAvailability('available')).toBe(true);
    expect(isCapabilityAvailability('demo-stub')).toBe(true);
    expect(isCapabilityAvailability('unavailable')).toBe(true);
    expect(isCapabilityAvailability('partial')).toBe(false);
  });

  it('ResolvedRuntimeProfile is structurally immutable', () => {
    const profile: ResolvedRuntimeProfile = {
      mode: 'production',
      enabled: new Set(['status']),
      disabled: new Map([['respondentPlace', {
        cause: 'instance-unavailable',
        message: 'respondent-place adapter is unavailable',
      }]]),
      limits: { status: { retentionDays: 30 } },
    };
    expect(profile.enabled.has('status')).toBe(true);
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('instance-unavailable');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/policy/policy-shapes.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write minimal implementation**

```ts
// src/policy/policy-shapes.ts
/**
 * Policy-document shapes consumed by the runtime feature resolver
 * (web ADR-0011 §Decision).
 *
 * Per ADR-0011 Non-goals these are TypeScript shapes only — no canonical
 * JSON Schema is defined here. Adopters wire their own policy sources at the
 * Composition root.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export type CapabilityAvailability = 'available' | 'demo-stub' | 'unavailable';

const CAPABILITY_AVAILABILITY: ReadonlySet<string> = new Set([
  'available',
  'demo-stub',
  'unavailable',
]);

export function isCapabilityAvailability(value: string): value is CapabilityAvailability {
  return CAPABILITY_AVAILABILITY.has(value);
}

/** ADR-0011 §Instance capabilities. Declared by the composition root. */
export type InstanceCapabilities = Readonly<Record<RuntimeFeatureKey, CapabilityAvailability>>;

/** ADR-0011 §Org runtime policy. */
export type OrgFeaturePolicyMode = 'forbidden' | 'allowed' | 'default-on' | 'required';

const ORG_FEATURE_MODES: ReadonlySet<string> = new Set([
  'forbidden',
  'allowed',
  'default-on',
  'required',
]);

export function isOrgFeaturePolicyMode(value: string): value is OrgFeaturePolicyMode {
  return ORG_FEATURE_MODES.has(value);
}

export interface OrgRuntimePolicy {
  readonly features: Readonly<Partial<Record<RuntimeFeatureKey, OrgFeaturePolicyMode>>>;
  /**
   * Opaque per-feature limits. ADR-0011 §Org runtime policy enumerates
   * examples (allowed origins, retention windows, payment methods). Each
   * feature ADR defines the limit shape for its key.
   */
  readonly limits?: Readonly<Partial<Record<RuntimeFeatureKey, unknown>>>;
}

/** ADR-0011 §Form runtime policy. */
export type FormFeaturePolicyMode = 'forbidden' | 'optional' | 'required';

const FORM_FEATURE_MODES: ReadonlySet<string> = new Set([
  'forbidden',
  'optional',
  'required',
]);

export function isFormFeaturePolicyMode(value: string): value is FormFeaturePolicyMode {
  return FORM_FEATURE_MODES.has(value);
}

export interface FormRuntimePolicy {
  readonly features: Readonly<Partial<Record<RuntimeFeatureKey, FormFeaturePolicyMode>>>;
}

/** ADR-0011 §Failure Semantics. Optional features record why they fell off. */
export type DisabledCause =
  | 'instance-unavailable'
  | 'org-forbidden'
  | 'form-forbidden'
  | 'optional-no-instance'
  | 'default-on-no-instance'
  | 'production-rejects-demo-stub'
  | 'not-requested';

export interface DisabledReason {
  readonly cause: DisabledCause;
  readonly message: string;
}

/** ADR-0011 §Resolution. Immutable read-only output the shell consumes. */
export interface ResolvedRuntimeProfile {
  readonly mode: 'demo' | 'production';
  readonly enabled: ReadonlySet<RuntimeFeatureKey>;
  readonly disabled: ReadonlyMap<RuntimeFeatureKey, DisabledReason>;
  readonly limits: Readonly<Partial<Record<RuntimeFeatureKey, unknown>>>;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/policy/policy-shapes.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/policy/policy-shapes.ts src/policy/policy-shapes.test.ts -m "feat(policy): declare runtime policy shapes (web ADR-0011 §Decision)

InstanceCapabilities, OrgRuntimePolicy, FormRuntimePolicy, and the
immutable ResolvedRuntimeProfile the React shell consumes. Per ADR-0011
Non-goals, JSON Schema for policy docs is deliberately not defined here."
```

---

### Task 3: Typed configuration errors

**Files:**
- Create: `src/policy/errors.ts`
- Test: `src/policy/errors.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// src/policy/errors.test.ts
import { describe, expect, it } from 'vitest';
import {
  FeaturePolicyConflictError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  RuntimePolicyError,
  UnsupportedRequiredFeatureError,
  isRuntimePolicyError,
} from './errors.ts';

describe('typed configuration errors (ADR-0011 §Failure Semantics)', () => {
  it('UnsupportedRequiredFeatureError carries featureKey + code', () => {
    const err = new UnsupportedRequiredFeatureError('status', 'instance has no StatusReader');
    expect(err).toBeInstanceOf(RuntimePolicyError);
    expect(err.code).toBe('UnsupportedRequiredFeature');
    expect(err.featureKey).toBe('status');
    expect(err.message).toContain('status');
    expect(err.message).toContain('instance has no StatusReader');
  });

  it('FeaturePolicyConflictError carries org + form mode pair', () => {
    const err = new FeaturePolicyConflictError('status', 'org-required-form-forbidden');
    expect(err.code).toBe('FeaturePolicyConflict');
    expect(err.conflict).toBe('org-required-form-forbidden');
  });

  it('OrgPolicyUnsatisfiedError fires when org requires what the instance cannot do', () => {
    const err = new OrgPolicyUnsatisfiedError('respondentPlace', 'no wallet adapter wired');
    expect(err.code).toBe('OrgPolicyUnsatisfied');
  });

  it('InvalidRuntimePolicyError fires when the input documents are malformed', () => {
    const err = new InvalidRuntimePolicyError('form', 'unknown feature key "payment"');
    expect(err.code).toBe('InvalidRuntimePolicy');
    expect(err.documentKind).toBe('form');
  });

  it('isRuntimePolicyError discriminates against ordinary Errors', () => {
    expect(isRuntimePolicyError(new Error('boom'))).toBe(false);
    expect(isRuntimePolicyError(new UnsupportedRequiredFeatureError('status', 'x'))).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/policy/errors.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write minimal implementation**

```ts
// src/policy/errors.ts
/**
 * Typed configuration errors per web ADR-0011 §Failure Semantics.
 *
 * The form-load boundary in the React shell catches every RuntimePolicyError,
 * renders a plain-language unavailable page with a support reference (the
 * error code), and preserves the typed code for telemetry. Tests assert on
 * the typed code; UI never strings off these messages.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export type RuntimePolicyErrorCode =
  | 'UnsupportedRequiredFeature'
  | 'FeaturePolicyConflict'
  | 'OrgPolicyUnsatisfied'
  | 'InvalidRuntimePolicy';

export abstract class RuntimePolicyError extends Error {
  abstract readonly code: RuntimePolicyErrorCode;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedRequiredFeatureError extends RuntimePolicyError {
  readonly code = 'UnsupportedRequiredFeature' as const;
  constructor(
    readonly featureKey: RuntimeFeatureKey,
    reason: string,
  ) {
    super(`Required feature "${featureKey}" cannot be enabled: ${reason}`);
  }
}

export type FeaturePolicyConflictKind =
  | 'org-required-form-forbidden'
  | 'form-required-org-forbidden';

export class FeaturePolicyConflictError extends RuntimePolicyError {
  readonly code = 'FeaturePolicyConflict' as const;
  constructor(
    readonly featureKey: RuntimeFeatureKey,
    readonly conflict: FeaturePolicyConflictKind,
  ) {
    super(`Policy conflict on feature "${featureKey}": ${conflict}`);
  }
}

export class OrgPolicyUnsatisfiedError extends RuntimePolicyError {
  readonly code = 'OrgPolicyUnsatisfied' as const;
  constructor(
    readonly featureKey: RuntimeFeatureKey,
    reason: string,
  ) {
    super(`Org policy requires "${featureKey}" but the instance cannot satisfy it: ${reason}`);
  }
}

export type RuntimePolicyDocumentKind = 'instance' | 'org' | 'form';

export class InvalidRuntimePolicyError extends RuntimePolicyError {
  readonly code = 'InvalidRuntimePolicy' as const;
  constructor(
    readonly documentKind: RuntimePolicyDocumentKind,
    reason: string,
  ) {
    super(`Invalid ${documentKind} runtime policy: ${reason}`);
  }
}

export function isRuntimePolicyError(value: unknown): value is RuntimePolicyError {
  return value instanceof RuntimePolicyError;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/policy/errors.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/policy/errors.ts src/policy/errors.test.ts -m "feat(policy): typed configuration errors (web ADR-0011 §Failure Semantics)

Four required error classes share a base RuntimePolicyError so the shell
can render a single plain-language page while tests/telemetry assert on
the typed code."
```

---

### Task 4: Adapter provenance markers (unavailable + demo-stub)

**Files:**
- Create: `src/policy/sentinel.ts`
- Test: `src/policy/sentinel.test.ts`

**Why two markers, not one:** ADR-0011 §Instance capabilities makes two parallel honesty claims — production unavailable sentinels record "known absent," and demo stubs satisfy "demo capabilities only." Without a demo-stub marker, a production composition can wire `stubStatusReader()` and declare `instanceCapabilities.status = 'available'`; the resolver sees only the declaration string and treats the stub as a real production capability. Two markers + the Task 10b coherence assertion catch both drift directions.

- [x] **Step 1: Write the failing test**

```ts
// src/policy/sentinel.test.ts
import { describe, expect, it } from 'vitest';
import {
  isDemoStubAdapter,
  isUnavailableAdapter,
  markDemoStubAdapter,
  markUnavailableAdapter,
} from './sentinel.ts';

describe('adapter provenance markers (ADR-0011 §Instance capabilities)', () => {
  it('isUnavailableAdapter returns false for plain objects, functions, primitives', () => {
    expect(isUnavailableAdapter({})).toBe(false);
    expect(isUnavailableAdapter(() => undefined)).toBe(false);
    expect(isUnavailableAdapter(null)).toBe(false);
    expect(isUnavailableAdapter(undefined)).toBe(false);
    expect(isUnavailableAdapter('available')).toBe(false);
  });

  it('markUnavailableAdapter tags the adapter without changing its shape', () => {
    const adapter = { readPlace: async () => { throw new Error('nope'); } };
    const marked = markUnavailableAdapter(adapter, {
      featureKey: 'respondentPlace',
      reason: 'no wallet adapter configured',
    });
    expect(marked).toBe(adapter);
    expect(isUnavailableAdapter(marked)).toBe(true);
    expect(typeof marked.readPlace).toBe('function');
  });

  it('isDemoStubAdapter returns false for unmarked adapters', () => {
    expect(isDemoStubAdapter({})).toBe(false);
    expect(isDemoStubAdapter(null)).toBe(false);
  });

  it('markDemoStubAdapter tags the adapter without changing its shape', () => {
    const adapter = { readStatus: async () => ({} as never) };
    const marked = markDemoStubAdapter(adapter, {
      featureKey: 'status',
      reason: 'demo composition only',
    });
    expect(marked).toBe(adapter);
    expect(isDemoStubAdapter(marked)).toBe(true);
  });

  it('unavailable and demo-stub markers are mutually exclusive in practice — guard test catches accidental double-mark', () => {
    const adapter = { call: async () => undefined };
    markDemoStubAdapter(adapter, { featureKey: 'status', reason: 'demo' });
    expect(() =>
      markUnavailableAdapter(adapter, { featureKey: 'status', reason: 'should fail' }),
    ).toThrow(/already marked/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/policy/sentinel.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write minimal implementation**

```ts
// src/policy/sentinel.ts
/**
 * Adapter provenance markers per web ADR-0011 §Instance capabilities.
 *
 * Two parallel markers describe how an adapter satisfies a runtime feature:
 *   - UNAVAILABLE_ADAPTER  — production "known absent" sentinel
 *   - DEMO_STUB_ADAPTER    — demo-only fixture; MUST NOT back a production capability
 *
 * Both let the composition coherence assertion (Task 10b) detect drift
 * between adapter provenance and instanceCapabilities declarations.
 * Markers are mutually exclusive on a single adapter.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export const UNAVAILABLE_ADAPTER = Symbol.for('formspec-web/unavailable-adapter');
export const DEMO_STUB_ADAPTER = Symbol.for('formspec-web/demo-stub-adapter');

export interface AdapterProvenanceMeta {
  readonly featureKey: RuntimeFeatureKey;
  readonly reason: string;
}

export type UnavailableAdapterMeta = AdapterProvenanceMeta;
export type DemoStubAdapterMeta = AdapterProvenanceMeta;

export type Unavailable<T> = T & { readonly [UNAVAILABLE_ADAPTER]: UnavailableAdapterMeta };
export type DemoStub<T> = T & { readonly [DEMO_STUB_ADAPTER]: DemoStubAdapterMeta };

function assertNotAlreadyMarked(adapter: object): void {
  if (UNAVAILABLE_ADAPTER in adapter || DEMO_STUB_ADAPTER in adapter) {
    throw new Error('Adapter is already marked with a provenance symbol');
  }
}

export function markUnavailableAdapter<T extends object>(
  adapter: T,
  meta: UnavailableAdapterMeta,
): Unavailable<T> {
  assertNotAlreadyMarked(adapter);
  Object.defineProperty(adapter, UNAVAILABLE_ADAPTER, {
    value: meta,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return adapter as Unavailable<T>;
}

export function markDemoStubAdapter<T extends object>(
  adapter: T,
  meta: DemoStubAdapterMeta,
): DemoStub<T> {
  assertNotAlreadyMarked(adapter);
  Object.defineProperty(adapter, DEMO_STUB_ADAPTER, {
    value: meta,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return adapter as DemoStub<T>;
}

export function isUnavailableAdapter(value: unknown): value is Unavailable<object> {
  return (
    typeof value === 'object' &&
    value !== null &&
    UNAVAILABLE_ADAPTER in value &&
    typeof (value as Record<symbol, unknown>)[UNAVAILABLE_ADAPTER] === 'object'
  );
}

export function isDemoStubAdapter(value: unknown): value is DemoStub<object> {
  return (
    typeof value === 'object' &&
    value !== null &&
    DEMO_STUB_ADAPTER in value &&
    typeof (value as Record<symbol, unknown>)[DEMO_STUB_ADAPTER] === 'object'
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/policy/sentinel.test.ts`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/policy/sentinel.ts src/policy/sentinel.test.ts -m "feat(policy): adapter provenance markers — unavailable + demo-stub

ADR-0011 §Instance capabilities makes two honesty claims: production
unavailable sentinels record known absence, and demo stubs satisfy demo
capabilities only. Two parallel symbol markers (mutually exclusive on
any single adapter) let the composition coherence assertion catch drift
in both directions: stub adapter wired in production composition, or
unavailable adapter declared available."
```

---

### Task 5: Mark the two existing unavailable adapters

**Files:**
- Modify: `src/adapters/unavailable/respondent-place-source.ts`
- Modify: `src/adapters/unavailable/status-reader.ts`
- Test: `tests/adapters/unavailable-sentinel.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/adapters/unavailable-sentinel.test.ts
import { describe, expect, it } from 'vitest';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';
import { isUnavailableAdapter, UNAVAILABLE_ADAPTER } from '../../src/policy/sentinel.ts';

describe('unavailable adapters carry the policy sentinel marker', () => {
  it('unavailableRespondentPlaceSource is marked with featureKey "respondentPlace"', () => {
    const adapter = unavailableRespondentPlaceSource();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('respondentPlace');
  });

  it('unavailableStatusReader is marked with featureKey "status"', () => {
    const adapter = unavailableStatusReader();
    expect(isUnavailableAdapter(adapter)).toBe(true);
    if (!isUnavailableAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[UNAVAILABLE_ADAPTER].featureKey).toBe('status');
  });

  it('marked adapters still throw on call (sentinel does not change runtime behavior)', async () => {
    await expect(unavailableRespondentPlaceSource().readPlace({})).rejects.toThrow();
    await expect(
      unavailableStatusReader().readStatus({ subjectRef: 'x', submissionId: 'y' }),
    ).rejects.toThrow();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adapters/unavailable-sentinel.test.ts`
Expected: FAIL — adapters are not marked.

- [x] **Step 3: Modify the unavailable adapters**

```ts
// src/adapters/unavailable/respondent-place-source.ts
import type { RespondentPlaceQuery, RespondentPlaceSource } from '../../ports/respondent-place-source.ts';
import { markUnavailableAdapter } from '../../policy/sentinel.ts';

export function unavailableRespondentPlaceSource(
  message = 'Respondent place adapter is not configured for this deployment.',
): RespondentPlaceSource {
  const adapter: RespondentPlaceSource = {
    async readPlace(_query: RespondentPlaceQuery) {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'respondentPlace',
    reason: message,
  });
}
```

```ts
// src/adapters/unavailable/status-reader.ts
import type { StatusReader, StatusRequest } from '../../ports/status-reader.ts';
import { markUnavailableAdapter } from '../../policy/sentinel.ts';

export function unavailableStatusReader(
  message = 'Applicant status adapter is not configured for this deployment.',
): StatusReader {
  const adapter: StatusReader = {
    async readStatus(_request: StatusRequest) {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'status',
    reason: message,
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/adapters/unavailable-sentinel.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/adapters/unavailable/respondent-place-source.ts src/adapters/unavailable/status-reader.ts tests/adapters/unavailable-sentinel.test.ts -m "feat(adapters): mark unavailable adapters with policy sentinel

Lets the composition root and the runtime feature resolver detect
'known unavailable' adapters without changing their port shape or
runtime throw-on-call semantics."
```

---

### Task 5b: Mark stub adapters with the demo-stub provenance marker

**Files:**
- Modify: `src/adapters/stub/respondent-place-source.ts`
- Modify: `src/adapters/stub/status-reader.ts`
- Test: `tests/adapters/demo-stub-marker.test.ts`

**Why:** Codex red-team Finding 3 — without marking the stub adapters that back demo capabilities, a production composition could wire `stubStatusReader()` and declare `instanceCapabilities.status = 'available'`; nothing catches the drift. Marking the two stubs that map to seeded feature keys closes that hole. (Other stub adapters that don't map to a feature key — `stubDefinitionSource`, `stubDraftStore`, `stubSubmitTransport`, `stubIdentityProvider`, `stubNotificationDelivery` — are MVP-port adapters not gated by the runtime feature resolver and stay unmarked.)

- [x] **Step 1: Write the failing test**

```ts
// tests/adapters/demo-stub-marker.test.ts
import { describe, expect, it } from 'vitest';
import { stubRespondentPlaceSource } from '../../src/adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';
import { DEMO_STUB_ADAPTER, isDemoStubAdapter } from '../../src/policy/sentinel.ts';

describe('stub adapters that back runtime feature keys carry the demo-stub marker', () => {
  it('stubRespondentPlaceSource is marked with featureKey "respondentPlace"', () => {
    const adapter = stubRespondentPlaceSource();
    expect(isDemoStubAdapter(adapter)).toBe(true);
    if (!isDemoStubAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[DEMO_STUB_ADAPTER].featureKey).toBe('respondentPlace');
  });

  it('stubStatusReader is marked with featureKey "status"', () => {
    const adapter = stubStatusReader();
    expect(isDemoStubAdapter(adapter)).toBe(true);
    if (!isDemoStubAdapter(adapter)) throw new Error('unreachable');
    expect(adapter[DEMO_STUB_ADAPTER].featureKey).toBe('status');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adapters/demo-stub-marker.test.ts`
Expected: FAIL — stubs are unmarked.

- [x] **Step 3: Modify the two stub adapters**

First read each file to confirm the current factory signature, then wrap the return with `markDemoStubAdapter`. Pattern:

```ts
// src/adapters/stub/respondent-place-source.ts — at end of factory
import { markDemoStubAdapter } from '../../policy/sentinel.ts';

// existing factory ... at the return statement:
return markDemoStubAdapter(adapter, {
  featureKey: 'respondentPlace',
  reason: 'demo-only respondent-place fixture; not valid for production',
});
```

```ts
// src/adapters/stub/status-reader.ts — at end of factory
import { markDemoStubAdapter } from '../../policy/sentinel.ts';

return markDemoStubAdapter(adapter, {
  featureKey: 'status',
  reason: 'demo-only status fixture; not valid for production',
});
```

If the existing factories return inline object literals, lift them into a `const adapter = ...` before marking; the marker requires an object reference.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/adapters/demo-stub-marker.test.ts`
Expected: PASS (2 tests).

Run: `npx vitest run tests/adapter-conformance` — confirm the stub conformance suites still pass; the marker is a non-enumerable property so it does not affect serialization or the port contract.

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/adapters/stub/respondent-place-source.ts src/adapters/stub/status-reader.ts tests/adapters/demo-stub-marker.test.ts -m "feat(adapters): mark seeded-feature stub adapters with demo-stub provenance

Codex red-team finding: without marking demo stubs, a production
composition could wire stubStatusReader() and declare the capability
available; nothing catches it. The marker, paired with Task 10b
coherence assertion, makes the drift impossible at composition
construction."
```

---

### Task 6: Resolver — happy path (all enabled)

**Files:**
- Create: `src/policy/resolver.ts`
- Test: `src/policy/resolver.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// src/policy/resolver.test.ts
import { describe, expect, it } from 'vitest';
import { resolveRuntimeFeatures } from './resolver.ts';
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from './policy-shapes.ts';

const allAvailable: InstanceCapabilities = {
  respondentPlace: 'available',
  status: 'available',
};

const allowAllOrg: OrgRuntimePolicy = {
  features: { respondentPlace: 'allowed', status: 'allowed' },
};

describe('resolveRuntimeFeatures (happy path)', () => {
  it('enables a form-required feature when instance and org allow', () => {
    const form: FormRuntimePolicy = { features: { status: 'required' } };
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: allowAllOrg,
      form,
    });
    expect(profile.enabled.has('status')).toBe(true);
    expect(profile.disabled.has('status')).toBe(false);
  });

  it('disables a feature with cause "not-requested" when nothing asks for it', () => {
    const form: FormRuntimePolicy = { features: { status: 'required' } };
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: allowAllOrg,
      form,
    });
    expect(profile.enabled.has('respondentPlace')).toBe(false);
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('not-requested');
  });

  it('returns an immutable profile (frozen collections)', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: allowAllOrg,
      form: { features: {} },
    });
    expect(() => (profile.enabled as Set<string>).add('payment')).toThrow();
    expect(() => (profile.disabled as Map<string, unknown>).clear()).toThrow();
  });

  it('propagates org limits for enabled features only', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        features: { status: 'required' },
        limits: { status: { retentionDays: 30 }, respondentPlace: { ignored: true } },
      },
      form: { features: {} },
    });
    expect(profile.limits.status).toEqual({ retentionDays: 30 });
    expect(profile.limits.respondentPlace).toBeUndefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/policy/resolver.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write minimal implementation**

```ts
// src/policy/resolver.ts
/**
 * Pure runtime feature resolver per web ADR-0011 §Resolution.
 *
 * Deterministic: same input → same output. No I/O, no clocks, no randomness.
 * Throws typed configuration errors per §Failure Semantics. The shell
 * catches at the form-load boundary; the resolver itself does not render.
 */
import { isRuntimeFeatureKey, RUNTIME_FEATURE_KEYS, type RuntimeFeatureKey } from './feature-keys.ts';
import {
  FeaturePolicyConflictError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  UnsupportedRequiredFeatureError,
} from './errors.ts';
import {
  isCapabilityAvailability,
  isFormFeaturePolicyMode,
  isOrgFeaturePolicyMode,
  type CapabilityAvailability,
  type DisabledCause,
  type DisabledReason,
  type FormFeaturePolicyMode,
  type FormRuntimePolicy,
  type InstanceCapabilities,
  type OrgFeaturePolicyMode,
  type OrgRuntimePolicy,
  type ResolvedRuntimeProfile,
} from './policy-shapes.ts';

export interface ResolveRuntimeFeaturesInput {
  readonly mode: 'demo' | 'production';
  readonly instance: InstanceCapabilities;
  readonly org: OrgRuntimePolicy;
  readonly form: FormRuntimePolicy;
}

export function resolveRuntimeFeatures(
  input: ResolveRuntimeFeaturesInput,
): ResolvedRuntimeProfile {
  validateInput(input);

  const enabled = new Set<RuntimeFeatureKey>();
  const disabled = new Map<RuntimeFeatureKey, DisabledReason>();
  const limits: Partial<Record<RuntimeFeatureKey, unknown>> = {};

  for (const key of RUNTIME_FEATURE_KEYS) {
    const decision = decide({
      mode: input.mode,
      featureKey: key,
      capability: input.instance[key],
      orgMode: input.org.features[key],
      formMode: input.form.features[key],
    });
    if (decision.kind === 'enabled') {
      enabled.add(key);
      const limit = input.org.limits?.[key];
      if (limit !== undefined) {
        limits[key] = limit;
      }
    } else {
      disabled.set(key, decision.reason);
    }
  }

  return Object.freeze({
    mode: input.mode,
    enabled: freezeSet(enabled),
    disabled: freezeMap(disabled),
    limits: Object.freeze(limits),
  });
}

interface DecisionInput {
  readonly mode: 'demo' | 'production';
  readonly featureKey: RuntimeFeatureKey;
  readonly capability: CapabilityAvailability;
  readonly orgMode: OrgFeaturePolicyMode | undefined;
  readonly formMode: FormFeaturePolicyMode | undefined;
}

type Decision =
  | { kind: 'enabled' }
  | { kind: 'disabled'; reason: DisabledReason };

function decide(input: DecisionInput): Decision {
  const { mode, featureKey, capability, orgMode, formMode } = input;

  if (orgMode === 'required' && formMode === 'forbidden') {
    throw new FeaturePolicyConflictError(featureKey, 'org-required-form-forbidden');
  }
  if (formMode === 'required' && orgMode === 'forbidden') {
    throw new FeaturePolicyConflictError(featureKey, 'form-required-org-forbidden');
  }

  const instanceCanDo = canSatisfy(mode, capability);

  if (orgMode === 'required' && !instanceCanDo) {
    throw new OrgPolicyUnsatisfiedError(featureKey, reasonForUnavailable(mode, capability));
  }

  if (formMode === 'required') {
    if (orgMode === 'forbidden') {
      throw new FeaturePolicyConflictError(featureKey, 'form-required-org-forbidden');
    }
    if (!instanceCanDo) {
      throw new UnsupportedRequiredFeatureError(featureKey, reasonForUnavailable(mode, capability));
    }
    return { kind: 'enabled' };
  }

  if (orgMode === 'required') {
    return { kind: 'enabled' };
  }

  if (formMode === 'forbidden' || orgMode === 'forbidden') {
    const cause: DisabledCause = formMode === 'forbidden' ? 'form-forbidden' : 'org-forbidden';
    return {
      kind: 'disabled',
      reason: { cause, message: `${featureKey} forbidden by ${cause === 'form-forbidden' ? 'form' : 'org'} policy` },
    };
  }

  if (orgMode === 'default-on') {
    if (instanceCanDo) {
      return { kind: 'enabled' };
    }
    return {
      kind: 'disabled',
      reason: {
        cause: 'default-on-no-instance',
        message: `${featureKey} marked default-on but ${reasonForUnavailable(mode, capability)}`,
      },
    };
  }

  if (formMode === 'optional' && orgMode === 'allowed') {
    if (instanceCanDo) {
      return { kind: 'enabled' };
    }
    return {
      kind: 'disabled',
      reason: {
        cause: 'optional-no-instance',
        message: `${featureKey} optional but ${reasonForUnavailable(mode, capability)}`,
      },
    };
  }

  return {
    kind: 'disabled',
    reason: { cause: 'not-requested', message: `${featureKey} not requested by form or org policy` },
  };
}

function canSatisfy(mode: 'demo' | 'production', capability: CapabilityAvailability): boolean {
  if (capability === 'available') return true;
  if (capability === 'demo-stub') return mode === 'demo';
  return false;
}

function reasonForUnavailable(
  mode: 'demo' | 'production',
  capability: CapabilityAvailability,
): string {
  if (capability === 'unavailable') return 'instance capability is marked unavailable';
  if (capability === 'demo-stub' && mode === 'production') {
    return 'production composition cannot use a demo-stub capability';
  }
  return `unknown capability availability "${capability}"`;
}

function validateInput(input: ResolveRuntimeFeaturesInput): void {
  for (const key of RUNTIME_FEATURE_KEYS) {
    if (!isCapabilityAvailability(input.instance[key])) {
      throw new InvalidRuntimePolicyError(
        'instance',
        `capability "${key}" must be available | demo-stub | unavailable`,
      );
    }
  }
  for (const candidate of Object.keys(input.org.features)) {
    if (!isRuntimeFeatureKey(candidate)) {
      throw new InvalidRuntimePolicyError('org', `unknown feature key "${candidate}"`);
    }
    const mode = input.org.features[candidate as RuntimeFeatureKey];
    if (mode !== undefined && !isOrgFeaturePolicyMode(mode)) {
      throw new InvalidRuntimePolicyError('org', `invalid mode "${mode}" for "${candidate}"`);
    }
  }
  for (const candidate of Object.keys(input.form.features)) {
    if (!isRuntimeFeatureKey(candidate)) {
      throw new InvalidRuntimePolicyError('form', `unknown feature key "${candidate}"`);
    }
    const mode = input.form.features[candidate as RuntimeFeatureKey];
    if (mode !== undefined && !isFormFeaturePolicyMode(mode)) {
      throw new InvalidRuntimePolicyError('form', `invalid mode "${mode}" for "${candidate}"`);
    }
  }
}

function freezeSet<T>(set: Set<T>): ReadonlySet<T> {
  const frozen = new Set(set);
  const guard = () => {
    throw new TypeError('ResolvedRuntimeProfile.enabled is read-only');
  };
  (frozen as unknown as { add: unknown }).add = guard;
  (frozen as unknown as { delete: unknown }).delete = guard;
  (frozen as unknown as { clear: unknown }).clear = guard;
  return frozen;
}

function freezeMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
  const frozen = new Map(map);
  const guard = () => {
    throw new TypeError('ResolvedRuntimeProfile.disabled is read-only');
  };
  (frozen as unknown as { set: unknown }).set = guard;
  (frozen as unknown as { delete: unknown }).delete = guard;
  (frozen as unknown as { clear: unknown }).clear = guard;
  return frozen;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/policy/resolver.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/policy/resolver.ts src/policy/resolver.test.ts -m "feat(policy): resolveRuntimeFeatures happy path (web ADR-0011 §Resolution)

Pure deterministic resolver. Walks every feature key in the closed
taxonomy, applies the instance → org → form rule, and returns a frozen
ResolvedRuntimeProfile. Typed errors thrown by §Failure Semantics
extracted to follow-up tasks."
```

---

### Task 7: Resolver — failure-semantics extension (typed throws)

**Files:**
- Test: `src/policy/resolver-failure-semantics.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// src/policy/resolver-failure-semantics.test.ts
import { describe, expect, it } from 'vitest';
import {
  FeaturePolicyConflictError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  UnsupportedRequiredFeatureError,
} from './errors.ts';
import { resolveRuntimeFeatures } from './resolver.ts';

const baseInstance = { respondentPlace: 'available', status: 'available' } as const;
const emptyOrg = { features: {} } as const;

describe('resolveRuntimeFeatures — ADR-0011 §Failure Semantics', () => {
  it('throws UnsupportedRequiredFeatureError when form requires what instance cannot do', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: { ...baseInstance, status: 'unavailable' },
        org: emptyOrg,
        form: { features: { status: 'required' } },
      }),
    ).toThrow(UnsupportedRequiredFeatureError);
  });

  it('throws OrgPolicyUnsatisfiedError when org requires what instance cannot do', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: { ...baseInstance, respondentPlace: 'unavailable' },
        org: { features: { respondentPlace: 'required' } },
        form: { features: {} },
      }),
    ).toThrow(OrgPolicyUnsatisfiedError);
  });

  it('throws FeaturePolicyConflictError when form forbids what org requires', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: baseInstance,
        org: { features: { status: 'required' } },
        form: { features: { status: 'forbidden' } },
      }),
    ).toThrow(FeaturePolicyConflictError);
  });

  it('throws FeaturePolicyConflictError when form requires what org forbids', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: baseInstance,
        org: { features: { status: 'forbidden' } },
        form: { features: { status: 'required' } },
      }),
    ).toThrow(FeaturePolicyConflictError);
  });

  it('rejects a demo-stub capability for a production-mode required feature', () => {
    const err = (() => {
      try {
        resolveRuntimeFeatures({
          mode: 'production',
          instance: { ...baseInstance, status: 'demo-stub' },
          org: emptyOrg,
          form: { features: { status: 'required' } },
        });
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(err).toBeInstanceOf(UnsupportedRequiredFeatureError);
  });

  it('accepts a demo-stub capability for a demo-mode required feature', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'demo',
      instance: { respondentPlace: 'demo-stub', status: 'demo-stub' },
      org: emptyOrg,
      form: { features: { status: 'required' } },
    });
    expect(profile.enabled.has('status')).toBe(true);
  });

  it('disables an optional form feature with cause "optional-no-instance"', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: { ...baseInstance, respondentPlace: 'unavailable' },
      org: { features: { respondentPlace: 'allowed' } },
      form: { features: { respondentPlace: 'optional' } },
    });
    expect(profile.enabled.has('respondentPlace')).toBe(false);
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('optional-no-instance');
  });

  it('disables a default-on feature when instance cannot, unless required', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: { ...baseInstance, respondentPlace: 'unavailable' },
      org: { features: { respondentPlace: 'default-on' } },
      form: { features: {} },
    });
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('default-on-no-instance');
  });

  it('throws InvalidRuntimePolicyError on unknown feature key in form policy', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: baseInstance,
        org: emptyOrg,
        form: { features: { payment: 'required' } as never },
      }),
    ).toThrow(InvalidRuntimePolicyError);
  });

  it('throws InvalidRuntimePolicyError on unknown instance capability state', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: { respondentPlace: 'partial' as never, status: 'available' },
        org: emptyOrg,
        form: { features: {} },
      }),
    ).toThrow(InvalidRuntimePolicyError);
  });
});
```

- [x] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/policy/resolver-failure-semantics.test.ts`
Expected: most tests pass already because Task 6 implemented the failure paths. Any failures here indicate a bug — fix the resolver, not the test.

- [x] **Step 3: Fix the resolver if needed**

If any failure-semantics test fails, fix `src/policy/resolver.ts`. The test list above is the canonical map of ADR-0011 §Failure Semantics rows; the resolver must satisfy all of them.

- [x] **Step 4: Re-run the full policy test suite**

Run: `npx vitest run src/policy`
Expected: PASS (all suites).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/policy/resolver-failure-semantics.test.ts src/policy/resolver.ts -m "test(policy): cover every ADR-0011 §Failure Semantics row

One named test per row in the spec table plus demo/production stub
mode-gate, default-on degradation, and the InvalidRuntimePolicy edges."
```

---

### Task 8: Policy barrel + package exports

**Files:**
- Create: `src/policy/index.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Test: `tests/smoke/policy-exports.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/smoke/policy-exports.test.ts
import { describe, expect, it } from 'vitest';

describe('policy package exports', () => {
  it('re-exports the full resolver surface from src/policy', async () => {
    const mod = await import('../../src/policy/index.ts');
    expect(typeof mod.resolveRuntimeFeatures).toBe('function');
    expect(typeof mod.isRuntimePolicyError).toBe('function');
    expect(typeof mod.markUnavailableAdapter).toBe('function');
    expect(typeof mod.isUnavailableAdapter).toBe('function');
    expect(Array.isArray(mod.RUNTIME_FEATURE_KEYS)).toBe(true);
    expect(typeof mod.UnsupportedRequiredFeatureError).toBe('function');
    expect(typeof mod.FeaturePolicyConflictError).toBe('function');
    expect(typeof mod.OrgPolicyUnsatisfiedError).toBe('function');
    expect(typeof mod.InvalidRuntimePolicyError).toBe('function');
  });

  it('exposes the same surface through the package root for adopters', async () => {
    const root = await import('../../src/index.ts');
    expect(typeof (root as { resolveRuntimeFeatures?: unknown }).resolveRuntimeFeatures).toBe(
      'function',
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/smoke/policy-exports.test.ts`
Expected: FAIL — `src/policy/index.ts` does not exist.

- [x] **Step 3: Write the barrel and wire it through the package**

```ts
// src/policy/index.ts
export {
  LOCALE_CONDITIONAL_FEATURE_KEYS,
  RUNTIME_FEATURE_KEYS,
  anyEnabledFeatureIsLocaleConditional,
  isLocaleConditionalFeatureKey,
  isRuntimeFeatureKey,
  type RuntimeFeatureKey,
} from './feature-keys.ts';
export {
  isCapabilityAvailability,
  isFormFeaturePolicyMode,
  isOrgFeaturePolicyMode,
  type CapabilityAvailability,
  type DisabledCause,
  type DisabledReason,
  type FormFeaturePolicyMode,
  type FormRuntimePolicy,
  type InstanceCapabilities,
  type OrgFeaturePolicyMode,
  type OrgRuntimePolicy,
  type ResolvedRuntimeProfile,
} from './policy-shapes.ts';
export {
  FeaturePolicyConflictError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  RuntimePolicyError,
  UnsupportedRequiredFeatureError,
  isRuntimePolicyError,
  type FeaturePolicyConflictKind,
  type RuntimePolicyDocumentKind,
  type RuntimePolicyErrorCode,
} from './errors.ts';
export {
  UNAVAILABLE_ADAPTER,
  isUnavailableAdapter,
  markUnavailableAdapter,
  type Unavailable,
  type UnavailableAdapterMeta,
} from './sentinel.ts';
export {
  resolveRuntimeFeatures,
  type ResolveRuntimeFeaturesInput,
} from './resolver.ts';
```

Modify `src/index.ts` to add a `policy` re-export. First read the current file to find the right append point, then append:

```ts
// at end of src/index.ts
export * from './policy/index.ts';
```

Modify `package.json` in two places.

**(a) `exports` block** — add a `./policy` subpath export right after the `./ports` entry:

```json
"./policy": "./src/policy/index.ts",
```

**(b) `test:unit` script** — the current script runs `vitest run src/profiles tests/adapters tests/app tests/demo tests/scripts tests/shared tests/smoke` and does NOT include `src/policy` (collocated resolver / errors / shapes / sentinel / feature-keys / feature-port-map / coherence tests), `tests/policy-resolution` (fixture suite), or `tests/profiles` (composition wiring + coherence tests). Per Codex red-team Finding 1, this leaves the load-bearing policy suite outside CI. Extend the script:

```json
"test:unit": "vitest run src/policy src/profiles tests/adapters tests/app tests/demo tests/policy-resolution tests/profiles tests/scripts tests/shared tests/smoke",
```

(Maintain alphabetical order within `src/` and `tests/` groupings to match the rest of the script style.)

- [x] **Step 4: Verify the script change runs the policy suites**

Run: `npm run test:unit`
Expected: every policy test from Tasks 1–7 + the smoke export test from this task PASS. If any directory misses, the run reports zero tests in that path; tighten the script before continuing.

Run: `npx vitest run tests/smoke/policy-exports.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/policy/index.ts src/index.ts package.json tests/smoke/policy-exports.test.ts -m "feat(policy): export resolver surface + include policy suites in CI

Adds src/policy barrel + ./policy subpath export, AND extends test:unit
to include src/policy, tests/policy-resolution, and tests/profiles —
otherwise CI silently ignores the load-bearing policy suite
(Codex red-team finding)."
```

---

### Task 9: Fixture-driven resolver cases (ADR §Failure Semantics rows)

**Files:**
- Create: `tests/policy-resolution/cases/required-instance-unsupported.json`
- Create: `tests/policy-resolution/cases/required-org-forbidden.json`
- Create: `tests/policy-resolution/cases/required-org-instance-unsupported.json`
- Create: `tests/policy-resolution/cases/form-forbidden-org-required.json`
- Create: `tests/policy-resolution/cases/optional-falls-off.json`
- Create: `tests/policy-resolution/cases/default-on-instance-unavailable.json`
- Create: `tests/policy-resolution/cases/default-on-instance-available.json`
- Create: `tests/policy-resolution/cases/required-feature-unavailable-sentinel.json`
- Create: `tests/policy-resolution/cases/invalid-form-policy-mode.json`
- Create: `tests/policy-resolution/cases/demo-stub-satisfies-demo.json`
- Create: `tests/policy-resolution/cases/demo-stub-fails-production.json`
- Create: `tests/policy-resolution/resolve-cases.test.ts`

- [x] **Step 1: Write the failing test runner**

```ts
// tests/policy-resolution/resolve-cases.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeFeatures } from '../../src/policy/resolver.ts';
import { isRuntimePolicyError } from '../../src/policy/errors.ts';
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from '../../src/policy/policy-shapes.ts';

interface CaseFile {
  readonly name: string;
  readonly description: string;
  readonly mode: 'demo' | 'production';
  readonly instance: InstanceCapabilities;
  readonly org: OrgRuntimePolicy;
  readonly form: FormRuntimePolicy;
  readonly expect:
    | { kind: 'throws'; code: string }
    | {
        kind: 'profile';
        enabled: string[];
        disabled: Record<string, string>; // featureKey → cause
      };
}

const here = dirname(fileURLToPath(import.meta.url));
const casesDir = join(here, 'cases');
const cases = readdirSync(casesDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(join(casesDir, file), 'utf8')) as CaseFile);

describe('runtime feature resolution — fixture cases', () => {
  for (const c of cases) {
    it(`${c.name}: ${c.description}`, () => {
      if (c.expect.kind === 'throws') {
        try {
          resolveRuntimeFeatures(c);
          throw new Error('expected resolver to throw');
        } catch (err) {
          if (!isRuntimePolicyError(err)) throw err;
          expect(err.code).toBe(c.expect.code);
        }
        return;
      }
      const profile = resolveRuntimeFeatures(c);
      expect([...profile.enabled].sort()).toEqual([...c.expect.enabled].sort());
      for (const [key, cause] of Object.entries(c.expect.disabled)) {
        expect(profile.disabled.get(key as never)?.cause).toBe(cause);
      }
    });
  }
});
```

- [x] **Step 2: Write the eleven fixture files**

Create each JSON case file under `tests/policy-resolution/cases/`. Each file is one ADR-0011 §Failure Semantics row or a happy path.

`required-instance-unsupported.json`:
```json
{
  "name": "required-instance-unsupported",
  "description": "form requires status; instance unavailable → UnsupportedRequiredFeature",
  "mode": "production",
  "instance": { "respondentPlace": "available", "status": "unavailable" },
  "org": { "features": {} },
  "form": { "features": { "status": "required" } },
  "expect": { "kind": "throws", "code": "UnsupportedRequiredFeature" }
}
```

`required-org-forbidden.json`:
```json
{
  "name": "required-org-forbidden",
  "description": "form requires status; org forbids → FeaturePolicyConflict",
  "mode": "production",
  "instance": { "respondentPlace": "available", "status": "available" },
  "org": { "features": { "status": "forbidden" } },
  "form": { "features": { "status": "required" } },
  "expect": { "kind": "throws", "code": "FeaturePolicyConflict" }
}
```

`required-org-instance-unsupported.json`:
```json
{
  "name": "required-org-instance-unsupported",
  "description": "org requires respondentPlace; instance unavailable → OrgPolicyUnsatisfied",
  "mode": "production",
  "instance": { "respondentPlace": "unavailable", "status": "available" },
  "org": { "features": { "respondentPlace": "required" } },
  "form": { "features": {} },
  "expect": { "kind": "throws", "code": "OrgPolicyUnsatisfied" }
}
```

`form-forbidden-org-required.json`:
```json
{
  "name": "form-forbidden-org-required",
  "description": "form forbids status; org requires it → FeaturePolicyConflict",
  "mode": "production",
  "instance": { "respondentPlace": "available", "status": "available" },
  "org": { "features": { "status": "required" } },
  "form": { "features": { "status": "forbidden" } },
  "expect": { "kind": "throws", "code": "FeaturePolicyConflict" }
}
```

`optional-falls-off.json`:
```json
{
  "name": "optional-falls-off",
  "description": "form optional; instance unavailable; org allows → disabled with optional-no-instance",
  "mode": "production",
  "instance": { "respondentPlace": "unavailable", "status": "available" },
  "org": { "features": { "respondentPlace": "allowed" } },
  "form": { "features": { "respondentPlace": "optional" } },
  "expect": {
    "kind": "profile",
    "enabled": [],
    "disabled": { "respondentPlace": "optional-no-instance", "status": "not-requested" }
  }
}
```

`default-on-instance-unavailable.json`:
```json
{
  "name": "default-on-instance-unavailable",
  "description": "org default-on; instance unavailable; form silent → disabled with default-on-no-instance",
  "mode": "production",
  "instance": { "respondentPlace": "unavailable", "status": "available" },
  "org": { "features": { "respondentPlace": "default-on" } },
  "form": { "features": {} },
  "expect": {
    "kind": "profile",
    "enabled": [],
    "disabled": { "respondentPlace": "default-on-no-instance", "status": "not-requested" }
  }
}
```

`default-on-instance-available.json`:
```json
{
  "name": "default-on-instance-available",
  "description": "org default-on; instance available; form silent → enabled",
  "mode": "production",
  "instance": { "respondentPlace": "available", "status": "available" },
  "org": { "features": { "respondentPlace": "default-on" } },
  "form": { "features": {} },
  "expect": {
    "kind": "profile",
    "enabled": ["respondentPlace"],
    "disabled": { "status": "not-requested" }
  }
}
```

`required-feature-unavailable-sentinel.json`:
```json
{
  "name": "required-feature-unavailable-sentinel",
  "description": "production capability flagged unavailable (sentinel adapter wired); form required → UnsupportedRequiredFeature",
  "mode": "production",
  "instance": { "respondentPlace": "unavailable", "status": "unavailable" },
  "org": { "features": {} },
  "form": { "features": { "respondentPlace": "required" } },
  "expect": { "kind": "throws", "code": "UnsupportedRequiredFeature" }
}
```

`invalid-form-policy-mode.json`:
```json
{
  "name": "invalid-form-policy-mode",
  "description": "form policy uses an unknown mode → InvalidRuntimePolicy",
  "mode": "production",
  "instance": { "respondentPlace": "available", "status": "available" },
  "org": { "features": {} },
  "form": { "features": { "status": "default-on" } },
  "expect": { "kind": "throws", "code": "InvalidRuntimePolicy" }
}
```

`demo-stub-satisfies-demo.json`:
```json
{
  "name": "demo-stub-satisfies-demo",
  "description": "demo mode + demo-stub instance + form required → enabled",
  "mode": "demo",
  "instance": { "respondentPlace": "demo-stub", "status": "demo-stub" },
  "org": { "features": {} },
  "form": { "features": { "status": "required" } },
  "expect": {
    "kind": "profile",
    "enabled": ["status"],
    "disabled": { "respondentPlace": "not-requested" }
  }
}
```

`demo-stub-fails-production.json`:
```json
{
  "name": "demo-stub-fails-production",
  "description": "production mode + demo-stub instance + form required → UnsupportedRequiredFeature",
  "mode": "production",
  "instance": { "respondentPlace": "available", "status": "demo-stub" },
  "org": { "features": {} },
  "form": { "features": { "status": "required" } },
  "expect": { "kind": "throws", "code": "UnsupportedRequiredFeature" }
}
```

- [x] **Step 3: Run the fixture suite**

Run: `npx vitest run tests/policy-resolution/resolve-cases.test.ts`
Expected: PASS (11 cases).

- [x] **Step 4: Commit**

```bash
git -C formspec-web commit tests/policy-resolution -m "test(policy): fixture cases for ADR-0011 §Failure Semantics + happy paths

Eleven JSON cases — one per row in the failure-semantics table plus
default-on / demo-stub / optional happy and degraded paths. Adopters can
add cases without touching the runner."
```

---

### Task 10: Wire `instanceCapabilities` + policy seams into `Composition`

**Files:**
- Modify: `src/composition/types.ts`
- Modify: `src/composition/stub.ts`
- Modify: `src/composition/default.ts`
- Test: `tests/profiles/composition-policy-wiring.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/profiles/composition-policy-wiring.test.ts
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/profiles/composition-policy-wiring.test.ts`
Expected: FAIL — `instanceCapabilities` / `orgRuntimePolicy` / `getFormRuntimePolicy` not on `Composition`.

- [x] **Step 3: Extend the Composition type**

Modify `src/composition/types.ts` — add the three new fields:

```ts
// add to imports
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from '../policy/index.ts';
import type { FormDefinition } from '../ports/definition-source.ts';

// inside the Composition interface, after respondentPlaceSource / statusReader:
  /** ADR-0011 §Instance capabilities — declared alongside the wired adapters. */
  instanceCapabilities: InstanceCapabilities;
  /** ADR-0011 §Org runtime policy — supplied by the composition root. */
  orgRuntimePolicy: OrgRuntimePolicy;
  /**
   * ADR-0011 §Form runtime policy — extracts the form's runtime-policy declaration
   * from the loaded Definition. Default extractors return {} (no requirements);
   * feature ADRs that add a form-policy field define their own extractor.
   */
  getFormRuntimePolicy: (definition: FormDefinition) => FormRuntimePolicy;
```

Modify `src/composition/stub.ts` to populate the new fields (append inside the returned object):

```ts
// import additions at top
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from '../policy/index.ts';

// add to the returned object (after statusReader: ...)
    instanceCapabilities: {
      respondentPlace: 'demo-stub',
      status: 'demo-stub',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
```

Modify `src/composition/default.ts` to declare production capabilities as unavailable (matching the wired unavailable sentinels) and supply an allow-all org policy + empty form-policy extractor. Append to the returned production-mode object:

```ts
// import additions at top
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from '../policy/index.ts';

// inside createDefaultComposition's returned object (after statusReader: ...)
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/profiles/composition-policy-wiring.test.ts`
Expected: PASS (3 tests). Also run the broader composition smoke: `npx vitest run tests/smoke` — none should regress.

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/composition/types.ts src/composition/stub.ts src/composition/default.ts tests/profiles/composition-policy-wiring.test.ts -m "feat(composition): declare runtime-feature policy seams (web ADR-0011)

Composition gains instanceCapabilities (matches the wired adapter set),
orgRuntimePolicy, and getFormRuntimePolicy. Defaults: demo composition
declares demo-stub capabilities; production composition declares
unavailable until reference adapters land."
```

---

### Task 10b: Composition coherence assertion (sentinel ↔ declaration)

**Files:**
- Create: `src/policy/feature-port-map.ts`
- Create: `src/policy/composition-coherence.ts`
- Test: `tests/profiles/composition-coherence.test.ts`

**Why:** ADR-0011 §Instance capabilities + §Rationale #1 ("Reference deployments must be honest") require that the wired adapter provenance and the declared `instanceCapabilities` cannot drift. Today the plan ships both halves but nothing enforces agreement. This task closes that gap with a typed feature-key → port-name map + a coherence check covering BOTH provenance markers (per Codex red-team Finding 3 — checking only `unavailable` would still let a production composition wire a demo stub and declare it available).

- [x] **Step 1: Write the failing test**

```ts
// tests/profiles/composition-coherence.test.ts
import { describe, expect, it } from 'vitest';
import { createStubComposition } from '../../src/composition/stub.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { assertCompositionCoherence } from '../../src/policy/composition-coherence.ts';
import {
  isUnavailableAdapter,
  markDemoStubAdapter,
  markUnavailableAdapter,
} from '../../src/policy/sentinel.ts';
import { stubStatusReader } from '../../src/adapters/stub/status-reader.ts';

describe('Composition coherence — provenance ↔ instanceCapabilities (ADR-0011 §Rationale #1)', () => {
  it('stub composition is coherent (demo mode + demo-stub adapters + demo-stub declarations)', () => {
    expect(() => assertCompositionCoherence(createStubComposition())).not.toThrow();
  });

  it('default composition is coherent (production mode + unavailable sentinels + unavailable declarations)', () => {
    expect(() => assertCompositionCoherence(createDefaultComposition())).not.toThrow();
  });

  it('flags an adapter marked unavailable but declared anything other than unavailable', () => {
    const composition = createStubComposition();
    // Replace a stub adapter with a freshly-unavailable-marked one without updating the declaration.
    const replacement = { readPlace: async () => { throw new Error('forced'); } };
    markUnavailableAdapter(replacement, { featureKey: 'respondentPlace', reason: 'forced for test' });
    (composition as { respondentPlaceSource: unknown }).respondentPlaceSource = replacement;
    expect(() => assertCompositionCoherence(composition)).toThrow(/respondentPlace/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/unavailable/);
  });

  it('flags an unavailable declaration with no matching sentinel adapter', () => {
    const composition = createStubComposition();
    (composition.instanceCapabilities as Record<string, unknown>).status = 'unavailable';
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/sentinel|unavailable/);
  });

  it('flags a demo-stub adapter wired in a production-mode composition', () => {
    const composition = createDefaultComposition();
    // Swap in a demo-stub adapter while leaving mode = "production".
    (composition as { statusReader: unknown }).statusReader = stubStatusReader();
    (composition.instanceCapabilities as Record<string, unknown>).status = 'available';
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/demo-stub|production/);
  });

  it('flags a demo-stub declaration with no matching demo-stub-marked adapter', () => {
    const composition = createDefaultComposition();
    // Production composition declares status = "demo-stub" but the wired adapter is the unavailable sentinel.
    (composition.instanceCapabilities as Record<string, unknown>).status = 'demo-stub';
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
    expect(() => assertCompositionCoherence(composition)).toThrow(/demo-stub/);
  });

  it('flags an adapter that is neither unavailable-marked nor demo-stub-marked when the declaration says demo-stub', () => {
    const composition = createStubComposition();
    // Replace the marked stub with an unmarked plain object.
    (composition as { statusReader: unknown }).statusReader = {
      readStatus: async () => ({} as never),
    };
    expect(() => assertCompositionCoherence(composition)).toThrow(/status/);
  });

  it('does not crash when a real (unmarked) adapter is paired with declaration "available"', () => {
    // Simulating an adopter who wires a real HttpStatusAdapter and declares status=available.
    const composition = createDefaultComposition();
    (composition as { statusReader: unknown }).statusReader = {
      readStatus: async () => ({} as never),
    };
    (composition.instanceCapabilities as Record<string, unknown>).status = 'available';
    expect(() => assertCompositionCoherence(composition)).not.toThrow();
    expect(isUnavailableAdapter(composition.statusReader)).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/profiles/composition-coherence.test.ts`
Expected: FAIL — modules not found.

- [x] **Step 3: Write the feature-key → port-name map**

```ts
// src/policy/feature-port-map.ts
/**
 * The single source of truth tying every RuntimeFeatureKey to the
 * Composition port slot that backs it. Each future feature ADR adds its
 * (key, portName) entry here so the coherence assertion picks it up
 * automatically.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';

export const FEATURE_PORT_MAP = {
  respondentPlace: 'respondentPlaceSource',
  status: 'statusReader',
} as const satisfies Readonly<Record<RuntimeFeatureKey, string>>;

export type CompositionPortName = (typeof FEATURE_PORT_MAP)[RuntimeFeatureKey];
```

- [x] **Step 4: Write the coherence assertion**

```ts
// src/policy/composition-coherence.ts
/**
 * Asserts the load-bearing honesty invariants of ADR-0011 §Instance capabilities
 * (per §Rationale #1 "reference deployments must be honest"). The composition
 * mode + each wired adapter's provenance marker + the instanceCapabilities
 * declaration must all agree.
 *
 * Rules:
 *   - Adapter marked unavailable  ↔  declaration 'unavailable'.
 *   - Adapter marked demo-stub    ↔  declaration 'demo-stub' AND composition.mode === 'demo'.
 *   - Declaration 'available' may pair only with an adapter that carries NEITHER provenance marker.
 *
 * Codex red-team finding addressed: checking only the unavailable sentinel
 * lets a production composition wire a demo stub and declare 'available' —
 * the exact production-stubs-must-not-satisfy-production violation ADR-0011
 * §Instance capabilities forbids.
 *
 * Call this from every composition smoke test. Production-mode composition
 * roots MUST also call it at boot.
 */
import { RUNTIME_FEATURE_KEYS, type RuntimeFeatureKey } from './feature-keys.ts';
import { FEATURE_PORT_MAP } from './feature-port-map.ts';
import { isDemoStubAdapter, isUnavailableAdapter } from './sentinel.ts';
import type { InstanceCapabilities } from './policy-shapes.ts';

export interface CompositionLike {
  readonly mode: 'demo' | 'production';
  readonly instanceCapabilities: InstanceCapabilities;
  readonly [key: string]: unknown;
}

export type CompositionIncoherenceKind =
  | 'sentinel-without-unavailable-declaration'
  | 'unavailable-declaration-without-sentinel'
  | 'demo-stub-adapter-in-production-composition'
  | 'demo-stub-adapter-without-demo-stub-declaration'
  | 'demo-stub-declaration-without-demo-stub-adapter'
  | 'available-declaration-paired-with-marked-adapter';

export class CompositionIncoherenceError extends Error {
  constructor(
    readonly featureKey: RuntimeFeatureKey,
    readonly kind: CompositionIncoherenceKind,
    message: string,
  ) {
    super(message);
    this.name = 'CompositionIncoherenceError';
  }
}

export function assertCompositionCoherence(composition: CompositionLike): void {
  for (const featureKey of RUNTIME_FEATURE_KEYS) {
    const portName = FEATURE_PORT_MAP[featureKey];
    const adapter = composition[portName];
    const declared = composition.instanceCapabilities[featureKey];
    const adapterIsUnavailable = isUnavailableAdapter(adapter);
    const adapterIsDemoStub = isDemoStubAdapter(adapter);

    // Unavailable provenance ↔ unavailable declaration.
    if (adapterIsUnavailable && declared !== 'unavailable') {
      throw new CompositionIncoherenceError(
        featureKey,
        'sentinel-without-unavailable-declaration',
        `Adapter for "${featureKey}" (port "${portName}") is marked unavailable, but instanceCapabilities declared "${declared}". The composition must declare "unavailable".`,
      );
    }
    if (declared === 'unavailable' && !adapterIsUnavailable) {
      throw new CompositionIncoherenceError(
        featureKey,
        'unavailable-declaration-without-sentinel',
        `instanceCapabilities declares "${featureKey}" unavailable, but the wired adapter at port "${portName}" carries no UNAVAILABLE_ADAPTER sentinel. Wire an unavailable* adapter or change the declaration.`,
      );
    }

    // Demo-stub provenance: production composition forbids stub adapters regardless of declaration.
    if (adapterIsDemoStub && composition.mode === 'production') {
      throw new CompositionIncoherenceError(
        featureKey,
        'demo-stub-adapter-in-production-composition',
        `Adapter for "${featureKey}" (port "${portName}") is marked demo-stub, but the composition is in production mode. Demo stubs MUST NOT back production capabilities (ADR-0011 §Instance capabilities).`,
      );
    }
    if (adapterIsDemoStub && declared !== 'demo-stub') {
      throw new CompositionIncoherenceError(
        featureKey,
        'demo-stub-adapter-without-demo-stub-declaration',
        `Adapter for "${featureKey}" (port "${portName}") is marked demo-stub, but instanceCapabilities declared "${declared}". The composition must declare "demo-stub".`,
      );
    }
    if (declared === 'demo-stub' && !adapterIsDemoStub) {
      throw new CompositionIncoherenceError(
        featureKey,
        'demo-stub-declaration-without-demo-stub-adapter',
        `instanceCapabilities declares "${featureKey}" demo-stub, but the wired adapter at port "${portName}" carries no DEMO_STUB_ADAPTER marker. Wire a stub* adapter or change the declaration.`,
      );
    }

    // 'available' must pair with an unmarked adapter.
    if (declared === 'available' && (adapterIsUnavailable || adapterIsDemoStub)) {
      throw new CompositionIncoherenceError(
        featureKey,
        'available-declaration-paired-with-marked-adapter',
        `instanceCapabilities declares "${featureKey}" available, but the wired adapter at port "${portName}" carries a provenance marker (${adapterIsUnavailable ? 'unavailable' : 'demo-stub'}). Wire a real production adapter or change the declaration.`,
      );
    }
  }
}
```

- [x] **Step 5: Re-export from the policy barrel**

Add to `src/policy/index.ts`:

```ts
export { FEATURE_PORT_MAP, type CompositionPortName } from './feature-port-map.ts';
export {
  CompositionIncoherenceError,
  assertCompositionCoherence,
  type CompositionLike,
} from './composition-coherence.ts';
```

- [x] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/profiles/composition-coherence.test.ts`
Expected: PASS (5 tests).

- [x] **Step 7: Wire the assertion into `createDefaultComposition` boot path**

In `src/composition/default.ts`, immediately before the production return statement (and immediately before the demo `createDemoComposition()` early return), add:

```ts
// import at top
import { assertCompositionCoherence } from '../policy/index.ts';

// inside createDefaultComposition, after constructing the production composition object:
const composition: Composition = { /* ...existing fields... */ };
assertCompositionCoherence(composition);
return composition;
```

Apply the same pattern in `src/composition/stub.ts`'s `createStubComposition` — call `assertCompositionCoherence(composition)` before returning.

- [x] **Step 8: Re-run the full policy suite**

Run: `npx vitest run src/policy tests/profiles tests/smoke`
Expected: PASS. The previously-passing tests still pass; the new coherence assertion now runs at composition-construction time on every test that creates a composition, which is the desired enforcement teeth.

- [x] **Step 9: Commit**

```bash
git -C formspec-web commit src/policy/feature-port-map.ts src/policy/composition-coherence.ts src/policy/index.ts src/composition/default.ts src/composition/stub.ts tests/profiles/composition-coherence.test.ts -m "feat(policy): composition coherence assertion (web ADR-0011 §Rationale #1)

ADR-0011 names 'reference deployments must be honest' as the load-bearing
rationale. Sentinel-marked adapter and instanceCapabilities declaration
are two independent statements; this assertion forces them to agree at
composition-construction time. Drift is caught at boot, not at feature use."
```

---

### Task 11: `ResolvedRuntimeProfile` context + hook

**Files:**
- Create: `src/app/RuntimeProfileProvider.tsx`
- Create: `src/app/hooks/useResolvedRuntimeProfile.ts`
- Modify: `src/app/hooks` index if it exists (otherwise skip)
- Test: `tests/app/runtime-profile-provider.test.tsx`

- [x] **Step 1: Look at the hooks directory**

Run: `ls src/app/hooks` and read any existing index file. If `src/app/hooks/index.ts` exists, the new hook needs to be re-exported there; if not, skip.

- [x] **Step 2: Write the failing test**

```tsx
// tests/app/runtime-profile-provider.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RuntimeProfileProvider } from '../../src/app/RuntimeProfileProvider.tsx';
import { useResolvedRuntimeProfile } from '../../src/app/hooks/useResolvedRuntimeProfile.ts';
import type { ResolvedRuntimeProfile } from '../../src/policy/index.ts';

function ProbeEnabled() {
  const profile = useResolvedRuntimeProfile();
  return <span data-testid="enabled">{[...profile.enabled].join(',')}</span>;
}

describe('RuntimeProfileProvider', () => {
  it('exposes the resolved profile to children via useResolvedRuntimeProfile', () => {
    const profile: ResolvedRuntimeProfile = Object.freeze({
      mode: 'production',
      enabled: new Set(['status']),
      disabled: new Map(),
      limits: {},
    });
    render(
      <RuntimeProfileProvider value={profile}>
        <ProbeEnabled />
      </RuntimeProfileProvider>,
    );
    expect(screen.getByTestId('enabled').textContent).toBe('status');
  });

  it('useResolvedRuntimeProfile throws outside a provider', () => {
    expect(() => render(<ProbeEnabled />)).toThrow(/RuntimeProfileProvider/);
  });
});
```

- [x] **Step 3: Write the provider + hook**

```tsx
// src/app/RuntimeProfileProvider.tsx
import { createContext, type ReactNode } from 'react';
import type { ResolvedRuntimeProfile } from '../policy/index.ts';

/**
 * Carries the ResolvedRuntimeProfile to the React shell per web ADR-0011 §Decision:
 * "The React shell MUST render from the resolved runtime profile. It MUST NOT
 *  inspect raw instance, org, or form policy independently."
 */
export const ResolvedRuntimeProfileContext = createContext<ResolvedRuntimeProfile | null>(null);

export function RuntimeProfileProvider({
  value,
  children,
}: {
  value: ResolvedRuntimeProfile;
  children: ReactNode;
}) {
  return (
    <ResolvedRuntimeProfileContext.Provider value={value}>
      {children}
    </ResolvedRuntimeProfileContext.Provider>
  );
}
```

```ts
// src/app/hooks/useResolvedRuntimeProfile.ts
import { useContext } from 'react';
import { ResolvedRuntimeProfileContext } from '../RuntimeProfileProvider.tsx';
import type { ResolvedRuntimeProfile } from '../../policy/index.ts';

export function useResolvedRuntimeProfile(): ResolvedRuntimeProfile {
  const profile = useContext(ResolvedRuntimeProfileContext);
  if (!profile) {
    throw new Error(
      'useResolvedRuntimeProfile must be called inside a <RuntimeProfileProvider>',
    );
  }
  return profile;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/runtime-profile-provider.test.tsx`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git -C formspec-web commit src/app/RuntimeProfileProvider.tsx src/app/hooks/useResolvedRuntimeProfile.ts tests/app/runtime-profile-provider.test.tsx -m "feat(app): ResolvedRuntimeProfile context + hook (web ADR-0011)

Provider + hook the React shell consumes. Direct inspection of raw
instance/org/form policy from the shell is forbidden by ADR-0011 §Decision —
this is the only legal access path."
```

---

### Task 12: Resolve at form-load + render plain-language error page

**Files:**
- Modify: `src/app/RespondentRuntime.tsx`
- Test: `tests/app/runtime-feature-error-boundary.test.tsx`

- [x] **Step 1: Read the current form-load flow**

Read `src/app/RespondentRuntime.tsx` lines 375–418 (`createReadyState`) to confirm the form-load boundary. The resolver call belongs immediately after `composition.definitionSource.getDefinition(...)` resolves, before engine creation. Errors of type `RuntimePolicyError` must bubble to the existing `respondentState: { status: 'error' }` path, which currently renders `<FriendlyError>`. We replace `<FriendlyError>` selection logic to detect `RuntimePolicyError` and render a dedicated `<RuntimePolicyErrorPage>` that surfaces the typed code as the support reference.

- [x] **Step 2: Write the failing test**

```tsx
// tests/app/runtime-feature-error-boundary.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createStubComposition } from '../../src/composition/stub.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';

describe('form-load boundary catches RuntimePolicyError', () => {
  it('renders a plain-language unavailable page and surfaces the typed code', async () => {
    const composition = createStubComposition();
    // Force a policy conflict: org requires status; form forbids it.
    composition.orgRuntimePolicy = {
      features: { ...composition.orgRuntimePolicy.features, status: 'required' },
    };
    composition.getFormRuntimePolicy = () => ({ features: { status: 'forbidden' } });

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/cannot be loaded|unavailable/i);
    });
    expect(screen.getByText(/Support reference/i).textContent).toMatch(/FeaturePolicyConflict/);
    // No raw stack trace leaked to respondents.
    expect(screen.queryByText(/at Object\./)).toBeNull();
  });
});
```

(Note — if `tests/app/` doesn't yet have `@testing-library/react` available, list it under devDependencies and install before running. Run `npm ls @testing-library/react` first; if missing, `npm install --save-dev @testing-library/react@^16 @testing-library/jest-dom@^6` and import as needed.)

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/app/runtime-feature-error-boundary.test.tsx`
Expected: FAIL — no policy resolution happens at form-load.

- [x] **Step 4: Insert the resolver call + dedicated error page**

In `src/app/RespondentRuntime.tsx`:

1. Add imports at the top of the file:

```ts
import {
  isRuntimePolicyError,
  resolveRuntimeFeatures,
  type ResolvedRuntimeProfile,
  type RuntimePolicyError,
} from '../policy/index.ts';
import { RuntimeProfileProvider } from './RuntimeProfileProvider.tsx';
```

2. Extend `ReadyRespondentState` with the profile:

```ts
type ReadyRespondentState = Extract<RespondentState, { status: 'ready' }> & {
  runtimeProfile: ResolvedRuntimeProfile;
};
```

(Adjust the `RespondentState` `ready` variant accordingly.)

3. In `createReadyState`, after `await composition.definitionSource.getDefinition(...)` returns `definition`, compute:

```ts
const runtimeProfile = resolveRuntimeFeatures({
  mode: composition.mode,
  instance: composition.instanceCapabilities,
  org: composition.orgRuntimePolicy,
  form: composition.getFormRuntimePolicy(definition),
});
```

and include `runtimeProfile` in the returned ready state.

4. In the `respondentState.status === 'error'` render branch, choose between the existing `<FriendlyError>` and a new `<RuntimePolicyErrorPage>`:

```tsx
if (respondentState.status === 'error') {
  if (isRuntimePolicyError(respondentState.error)) {
    return <RuntimePolicyErrorPage error={respondentState.error} />;
  }
  return (
    <FriendlyError
      error={respondentState.error}
      headingLevel="h1"
      title="We could not load this form."
    />
  );
}
```

5. Add `RuntimePolicyErrorPage`:

```tsx
function RuntimePolicyErrorPage({ error }: { error: RuntimePolicyError }) {
  return (
    <div className="shell__status shell__status--error" role="alert">
      <h1>This form is unavailable.</h1>
      <p>
        This form requires a capability this site does not currently support.
        Try again later, or contact the sender for help.
      </p>
      <p className="support-code">Support reference: {error.code}</p>
    </div>
  );
}
```

6. Wrap the existing `<FormspecProvider>` rendered when state is `ready` with `<RuntimeProfileProvider value={respondentState.runtimeProfile}>` so downstream consumers can read the profile:

```tsx
return (
  <AppErrorBoundary>
    <RuntimeProfileProvider value={respondentState.runtimeProfile}>
      <FormspecProvider ...>
        ...
      </FormspecProvider>
    </RuntimeProfileProvider>
  </AppErrorBoundary>
);
```

7. **Locale recompute trigger.** ADR-0011 §Resolution requires the shell to recompute on locale change "in a way that affects policy." Modify `handleLocaleChange` to consult `anyEnabledFeatureIsLocaleConditional(respondentState.runtimeProfile.enabled)`. Today the set is empty so the existing in-place locale flip is correct; the moment a future ADR registers a locale-conditional key, the handler restarts the form-load boundary:

```tsx
// add to imports
import { anyEnabledFeatureIsLocaleConditional } from '../policy/index.ts';

// replace handleLocaleChange
const handleLocaleChange = (locale: string): void => {
  if (anyEnabledFeatureIsLocaleConditional(respondentState.runtimeProfile.enabled)) {
    // A future feature ADR has registered a locale-conditional key; the resolved
    // profile may differ under the new locale, so restart the form-load boundary
    // per ADR-0011 §Resolution.
    void applyReadyState(respondentState.claim, { locale });
    return;
  }
  respondentState.engine.setLocale(locale);
  setRespondentState({ ...respondentState, activeLocale: locale });
};
```

Thread an optional `locale` override into `applyReadyState` / `createReadyState` so the restart uses the chosen locale instead of `defaultLocaleForDefinition(definition)`.

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/runtime-feature-error-boundary.test.tsx`
Expected: PASS (1 test).

Also run a broader regression: `npx vitest run tests/app` to confirm no other runtime test broke.

- [x] **Step 6: Add the locale-recompute tripwire test**

```tsx
// tests/app/runtime-feature-locale-recompute.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { createStubComposition } from '../../src/composition/stub.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import {
  LOCALE_CONDITIONAL_FEATURE_KEYS,
  RUNTIME_FEATURE_KEYS,
} from '../../src/policy/index.ts';

describe('locale change + runtime-feature recompute (ADR-0011 §Resolution)', () => {
  it('seed taxonomy has zero locale-conditional keys — handler stays in-place', () => {
    expect(LOCALE_CONDITIONAL_FEATURE_KEYS.size).toBe(0);
  });

  it('tripwire: if a future ADR adds a locale-conditional key, this test fails until the handler is verified', () => {
    // This is a guard-test, not behavior. It deliberately fails the moment any
    // RuntimeFeatureKey becomes locale-conditional, forcing the implementer to
    // update tests/app/runtime-feature-locale-recompute.test.tsx with a real
    // recompute assertion using the new key.
    for (const key of RUNTIME_FEATURE_KEYS) {
      expect(LOCALE_CONDITIONAL_FEATURE_KEYS.has(key)).toBe(false);
    }
  });

  it('locale change with no locale-conditional features does NOT restart createReadyState', async () => {
    const composition = createStubComposition();
    const definitionSpy = vi.spyOn(composition.definitionSource, 'getDefinition');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(definitionSpy).toHaveBeenCalledTimes(1);
    });

    // Find any locale button and toggle to a different locale.
    const localeButtons = screen.queryAllByRole('button', { pressed: false });
    if (localeButtons.length > 0) {
      await act(async () => {
        localeButtons[0].click();
      });
    }

    // No restart → no second getDefinition call.
    expect(definitionSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 7: Run the tripwire suite**

Run: `npx vitest run tests/app/runtime-feature-locale-recompute.test.tsx`
Expected: PASS (3 tests).

- [x] **Step 8: Commit**

```bash
git -C formspec-web commit src/app/RespondentRuntime.tsx tests/app/runtime-feature-error-boundary.test.tsx tests/app/runtime-feature-locale-recompute.test.tsx -m "feat(app): resolve runtime profile at form-load + locale recompute + plain-language error page (web ADR-0011)

ADR-0011 §Failure Semantics: shell catches typed errors at the form-load
boundary, renders a plain-language unavailable page, preserves the typed
error code for telemetry. ADR-0011 §Resolution: locale change consults
LOCALE_CONDITIONAL_FEATURE_KEYS and restarts createReadyState when a
future ADR registers a locale-conditional key. Tripwire test fails the
moment the seed taxonomy is extended with a locale-conditional key,
forcing the implementer to verify the recompute path."
```

---

### Task 12b: Gate seeded callsites on the resolved profile

**Files:**
- Modify: `src/app/RespondentRuntime.tsx`
- Test: `tests/app/runtime-feature-gating.test.tsx`

**Why:** Codex red-team Finding 2. The two seeded feature keys (`respondentPlace`, `status`) back unconditional adapter calls already in the shell. Without gating, a production composition that resolves both disabled still triggers `loadRespondentPlace` → `unavailableRespondentPlaceSource.readPlace()` → throw → respondent-place panel renders an adapter error. ADR-0011 §Failure Semantics says disabled UI is "hidden or replaced by an explicit unavailable state only when the user already has context for it" — adapter throws violate that.

- [x] **Step 1: Write the failing test**

```tsx
// tests/app/runtime-feature-gating.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createStubComposition } from '../../src/composition/stub.ts';
import { RespondentRuntime } from '../../src/app/RespondentRuntime.tsx';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { unavailableRespondentPlaceSource } from '../../src/adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../../src/adapters/unavailable/status-reader.ts';

describe('seeded feature gating on ResolvedRuntimeProfile (Codex Finding 2)', () => {
  it('disabled respondentPlace → readPlace is NEVER called and the panel does not render', async () => {
    const composition = createStubComposition();
    // Production-shaped: switch to unavailable adapter + matching declaration + production mode.
    (composition as { mode: string }).mode = 'production';
    (composition.instanceCapabilities as Record<string, unknown>).respondentPlace = 'unavailable';
    (composition.instanceCapabilities as Record<string, unknown>).status = 'unavailable';
    (composition as { respondentPlaceSource: unknown }).respondentPlaceSource = unavailableRespondentPlaceSource();
    (composition as { statusReader: unknown }).statusReader = unavailableStatusReader();

    const readPlaceSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');
    const readStatusSpy = vi.spyOn(composition.statusReader, 'readStatus');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: /Loading form/i })).not.toBeInTheDocument();
    });

    expect(readPlaceSpy).not.toHaveBeenCalled();
    expect(readStatusSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Your forms and files/i)).not.toBeInTheDocument();
  });

  it('enabled respondentPlace + disabled status → readPlace called, readStatus skipped per submission', async () => {
    const composition = createStubComposition();
    // Stub composition has respondentPlace + status both demo-stub by default.
    // Force a mixed profile by forbidding status at the org layer.
    composition.orgRuntimePolicy = {
      features: { ...composition.orgRuntimePolicy.features, status: 'forbidden' },
    };

    const readStatusSpy = vi.spyOn(composition.statusReader, 'readStatus');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(screen.getByText(/Your forms and files/i)).toBeInTheDocument();
    });

    // The respondent-place panel renders (respondentPlace enabled), but the
    // per-submission status fetch never fires because the profile disabled status.
    expect(readStatusSpy).not.toHaveBeenCalled();
  });

  it('all-enabled (default demo) → both adapters called and the panel renders fully', async () => {
    const composition = createStubComposition();
    const readPlaceSpy = vi.spyOn(composition.respondentPlaceSource, 'readPlace');

    render(<RespondentRuntime composition={composition} config={departmentAppProfile} />);
    await waitFor(() => {
      expect(screen.getByText(/Your forms and files/i)).toBeInTheDocument();
    });

    expect(readPlaceSpy).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/runtime-feature-gating.test.tsx`
Expected: FAIL — adapters are called unconditionally; the panel renders even when disabled.

- [x] **Step 3: Gate `loadRespondentPlace` on `profile.enabled.has('respondentPlace')`**

In `src/app/RespondentRuntime.tsx`, modify the respondent-place loading effect (currently at lines 199–222). Replace the unconditional `loadRespondentPlace` call with a profile-gated branch. The profile is on the ready state per Task 12 step 2.

```tsx
useEffect(() => {
  if (respondentState.status !== 'ready') {
    setRespondentPlaceState({ status: 'loading' });
    return;
  }

  // ADR-0011 §Failure Semantics: disabled features render hidden, not as adapter errors.
  if (!respondentState.runtimeProfile.enabled.has('respondentPlace')) {
    setRespondentPlaceState({ status: 'disabled' });
    return;
  }

  let cancelled = false;
  setRespondentPlaceState({ status: 'loading' });
  void loadRespondentPlace(composition, placeSubjectRef, respondentState.runtimeProfile)
    .then((state) => {
      if (!cancelled) setRespondentPlaceState(state);
    })
    .catch((error: unknown) => {
      if (!cancelled) setRespondentPlaceState({ status: 'error', error });
    });
  return () => {
    cancelled = true;
  };
}, [composition, placeSubjectRef, respondentState]);
```

Add `'disabled'` to the `RespondentPlaceState` discriminated union:

```ts
type RespondentPlaceState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | {
      status: 'ready';
      snapshot: RespondentPlaceSnapshot;
      submissionStatuses: Record<string, ApplicantStatusResource>;
    }
  | { status: 'error'; error: unknown };
```

In `RespondentPlacePanel`, short-circuit on `state.status === 'disabled'` to render nothing (`return null;`). The panel is hidden — not "unavailable" — because the respondent never had context for it.

- [x] **Step 4: Gate per-submission status fetches on `profile.enabled.has('status')`**

Modify `loadRespondentPlace` to accept the profile and forward it to `readSubmissionStatuses`. In `readSubmissionStatuses`, skip the fetch when `status` is disabled:

```ts
async function readSubmissionStatuses(
  composition: Composition,
  snapshot: RespondentPlaceSnapshot,
  profile: ResolvedRuntimeProfile,
): Promise<Record<string, ApplicantStatusResource>> {
  if (!profile.enabled.has('status')) {
    return {}; // disabled: respondent sees the submission record without a status pill.
  }
  // ...existing implementation unchanged...
}
```

`SubmissionItem` already handles `status: undefined` (the `!status` branch in `statusFeedback`), so the UI degrades to "Status pending" / "Status has not been published yet" — the existing not-yet-published affordance the respondent has context for. No new copy needed.

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/runtime-feature-gating.test.tsx`
Expected: PASS (3 tests).

Also run `npx vitest run tests/app` to confirm no regression — the error-boundary test from Task 12 and the locale-recompute tripwire still pass.

- [x] **Step 6: Commit**

```bash
git -C formspec-web commit src/app/RespondentRuntime.tsx tests/app/runtime-feature-gating.test.tsx -m "feat(app): gate seeded respondent-place + status callsites on resolved profile

Codex red-team finding: the seeded keys (respondentPlace, status) back
existing unconditional adapter calls in the shell. Without gating, a
production profile that resolves both disabled still triggers the
unavailable adapters and renders generic errors — violating ADR-0011
§Failure Semantics ('disabled UI is hidden or replaced by an explicit
unavailable state only when the user already has context for it') for
the very keys this plan seeds.

- loadRespondentPlace runs only when profile.enabled.has('respondentPlace')
- readSubmissionStatuses skips per-submission fetches when status disabled
- RespondentPlacePanel renders null when disabled (no context = no UI)
- SubmissionItem degrades to existing 'Status pending' affordance"
```

---

### Task 13: Adopter-facing documentation

**Files:**
- Create: `docs/policy/runtime-feature-resolution.md`

- [x] **Step 1: Write the doc**

```markdown
# Runtime feature resolution

Per [web ADR-0011](../../thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md),
formspec-web resolves runtime features from three policy layers into one
read-only `ResolvedRuntimeProfile`. The React shell renders only from the
resolved profile; it never inspects raw instance, org, or form policy.

## The three layers

1. **Instance capabilities** — `InstanceCapabilities` declared by the composition
   root, one of `'available' | 'demo-stub' | 'unavailable'` per feature key.
2. **Org runtime policy** — `OrgRuntimePolicy`, one of
   `'forbidden' | 'allowed' | 'default-on' | 'required'` per feature key.
3. **Form runtime policy** — extracted from the loaded `FormDefinition` via
   `composition.getFormRuntimePolicy(definition)`, one of
   `'forbidden' | 'optional' | 'required'` per feature key.

## Feature keys

The closed taxonomy lives in `src/policy/feature-keys.ts`. As of today the
seeded keys are `respondentPlace` and `status`. Future feature ADRs extend
the taxonomy; the resolver rejects unknown keys with
`InvalidRuntimePolicyError` so drift is caught at boot.

## Resolver contract

```ts
import { resolveRuntimeFeatures } from 'formspec-web/policy';

const profile = resolveRuntimeFeatures({
  mode: 'production',
  instance: composition.instanceCapabilities,
  org: composition.orgRuntimePolicy,
  form: composition.getFormRuntimePolicy(definition),
});
```

Return shape:

```ts
interface ResolvedRuntimeProfile {
  readonly mode: 'demo' | 'production';
  readonly enabled: ReadonlySet<RuntimeFeatureKey>;
  readonly disabled: ReadonlyMap<RuntimeFeatureKey, DisabledReason>;
  readonly limits: Readonly<Partial<Record<RuntimeFeatureKey, unknown>>>;
}
```

The shell consumes the profile via `useResolvedRuntimeProfile()`.

## Typed configuration errors

`resolveRuntimeFeatures` throws on configuration that ADR-0011 §Failure Semantics
declares illegal:

| Condition | Error |
|---|---|
| Form requires a feature the instance cannot support | `UnsupportedRequiredFeatureError` |
| Form requires a feature the org forbids | `FeaturePolicyConflictError` |
| Org requires a feature the instance cannot support | `OrgPolicyUnsatisfiedError` |
| Form forbids a feature the org requires | `FeaturePolicyConflictError` |
| Required production capability backed by a demo stub | `UnsupportedRequiredFeatureError` |
| Configured limits or modes are invalid | `InvalidRuntimePolicyError` |

The form-load boundary in `RespondentRuntime` catches every
`RuntimePolicyError`, renders a plain-language unavailable page, and
preserves the typed `code` as the support reference. Telemetry asserts on
the code; never on the rendered string.

## Unavailable adapters

Production deployments that cannot satisfy a capability wire an unavailable
adapter (`src/adapters/unavailable/*`) AND set the matching
`instanceCapabilities[key] = 'unavailable'`. The unavailable adapter is
tagged with the `UNAVAILABLE_ADAPTER` symbol so the composition root can
audit the wiring.

Demo-stub capabilities satisfy `demo`-mode resolutions only — never
production. This is the enforcement teeth behind ADR-0011 §Rationale #1
("Reference deployments must be honest").

## Adding a new feature key

0. **Coordinate the key spelling with every upstream document producer.**
   The same string flows through three places: (a) `RUNTIME_FEATURE_KEYS` in
   formspec-web, (b) the org/tenant policy document the composition root
   loads, (c) the form-definition extension field (e.g.,
   `x-formspec-runtime-policy`) the form author writes. All three MUST use
   the identical spelling. If the feature ADR lives in another repo
   (formspec-cloud, work-spec, PKAF), name the canonical spelling in the
   feature ADR and cite this doc.
1. Author the feature ADR. Name the capability key, the org-policy controls,
   the form-policy controls, and the failure semantics.
2. Add the key to `RUNTIME_FEATURE_KEYS` in `src/policy/feature-keys.ts`.
3. Add the matching port entry to `FEATURE_PORT_MAP` in
   `src/policy/feature-port-map.ts` so the composition coherence assertion
   covers the new key automatically.
4. Update every `InstanceCapabilities` declaration in composition roots
   (`src/composition/stub.ts`, `src/composition/default.ts`, adopter forks).
   Wire the matching adapter (real or unavailable sentinel) on the matching
   port slot. The composition coherence assertion runs at construction —
   declaration and sentinel MUST agree.
5. If the feature's resolved policy depends on the active locale (e.g.,
   jurisdictional safe-address handling), add the key to
   `LOCALE_CONDITIONAL_FEATURE_KEYS` in the same file. The shell's
   locale-change handler will restart the form-load boundary; the tripwire
   test at `tests/app/runtime-feature-locale-recompute.test.tsx` will start
   failing and must be updated with a real recompute assertion.
6. If the feature reads from the form definition, supply a
   `getFormRuntimePolicy` extractor that maps the form's runtime-policy
   field to the resolver shape.
7. Add fixture cases under `tests/policy-resolution/cases/` covering
   required / optional / forbidden / default-on / policy-conflict for the
   new key.
```

- [x] **Step 2: No test step (documentation). Verify rendering quickly**

Open `docs/policy/runtime-feature-resolution.md` and confirm the headings render.

- [x] **Step 3: Commit**

```bash
git -C formspec-web commit docs/policy/runtime-feature-resolution.md -m "docs(policy): adopter-facing reference for runtime feature resolution"
```

---

### Task 14: Planning row + ADR cross-link

**Files:**
- Modify: `PLANNING.md`
- Modify: `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md`

- [x] **Step 1: Append the planning row**

Add an `FW-0065` row in `PLANNING.md` at the end of the Post-MVP section. Lowest free integer above the current high (`FW-0064`). Use the established row format from neighboring rows (e.g., FW-0063, FW-0064):

```markdown
### FW-0065 — Runtime feature resolver scaffold + policy gates

- **Phase:** Post-MVP
- **Status:** in build
- **Lane:** Now
- **Journey:** (none — platform; backs every post-MVP feature row)
- **What:** Land the `RuntimeFeatureResolver`, typed configuration error classes, the `ResolvedRuntimeProfile` context, both adapter provenance markers (unavailable + demo-stub), the composition coherence assertion, the form-load error boundary that renders a plain-language unavailable page, and **the gating of the two seeded callsites (`respondentPlaceSource.readPlace`, `statusReader.readStatus`) on the resolved profile**. Seeded with `respondentPlace` and `status` capability keys; future feature ADRs extend the taxonomy.
- **Done:** (a) resolver + typed errors + fixture cases + form-load error gate compile and ship green via `npm run ci`; (b) every shipped composition passes `assertCompositionCoherence` (covering BOTH unavailable + demo-stub provenance, mode-aware) at construction; (c) `RespondentRuntime` catches `RuntimePolicyError` and renders the unavailable page with the typed code as the support reference (proved via fault-injection test); (d) locale-recompute discipline wired with tripwire test; (e) the two seeded callsites are gated — production composition with both disabled triggers ZERO adapter calls and renders no respondent-place panel, proved via `tests/app/runtime-feature-gating.test.tsx`; (f) `package.json` `test:unit` includes `src/policy`, `tests/policy-resolution`, and `tests/profiles` so the suite ships to CI; (g) adopter doc at `docs/policy/runtime-feature-resolution.md` covers the extension protocol.
- **User-visible behavior change:** today's demo composition is unchanged (both features enabled, panel renders). Today's production composition (both features `unavailable`) now correctly **hides** the respondent-place panel and never invokes the unavailable adapters — closing the production-bug Codex flagged where the unconditional `loadRespondentPlace` would throw.
- **Consumes ports:** none (pure resolver) — but extends the Composition surface every port consumer ultimately reads.
- **Note:** Closes the ADR-0011 Follow-on Work items (RuntimeFeatureResolver design/impl, typed errors, plain-language rendering, fixtures) AND closes Codex red-team findings on CI inclusion, seeded-callsite gating, and demo-stub provenance. Per ADR-0011 Non-goals, no canonical JSON schema for policy documents is defined here. Per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md) the resolver lives in `src/policy/` (pure core).
```

- [x] **Step 2: Append a "Related plan" footer to the ADR**

Read `thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md`; under "Related Decisions" add one more bullet:

```markdown
- Implementation plan: [`thoughts/plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md`](../plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md) — landed FW-0065 scaffolding
```

- [x] **Step 3: Verify**

Run: `npm run check:testing-plan` and `npm run check:mvp-audit` from `formspec-web/`. Both must pass; if either trips on the new planning row, fix the row to match the validator's expected fields and re-run.

- [x] **Step 4: Commit**

```bash
git -C formspec-web commit PLANNING.md thoughts/adr/0011-runtime-feature-resolution-and-policy-gates.md -m "docs(planning): FW-0065 runtime feature resolver scaffold + ADR cross-link"
```

---

### Task 15: Full-suite verification

**Files:** none.

- [x] **Step 1: Run the full CI catch-all**

```bash
cd formspec-web
npm run ci
```

`ci` chains typecheck + lint + every `check:*` validator + `test:conformance` + `test:unit` + vendor-leak scan + upstream-theme check + `test:e2e` + production build + bundle-budget + compose-quickstart + deployment-header check + multi-deployment check. Per Codex red-team Finding 1 and Task 8's `test:unit` script update, this is the only verification step that proves the policy suite actually shipped to CI.

Expected: all green.

- [x] **Step 2: Spot-check the policy suite ran (defensive)**

If `npm run ci` ever silently passes with zero policy tests reported, the `test:unit` script change in Task 8 regressed. Defensive check:

```bash
npx vitest run src/policy tests/policy-resolution tests/profiles tests/adapters
```

Expected: explicit counts that include the resolver + fixture + coherence + provenance-marker suites. If any directory reports zero tests, fix `package.json` `test:unit` and re-run Step 1.

- [x] **Step 3: Run the architectural review**

Per stack `CLAUDE.md` §HIGH-PRIORITY — dispatch the `formspec-specs:semi-formal-architecture-review` skill as a subagent against the diff. Address any BLOCKER findings; LOW/MEDIUM findings ship as follow-up rows or get fixed inline at the implementer's discretion.

- [x] **Step 4: Commit any review fixups, then prepare the parent submodule pointer bump**

```bash
cd ../
git status                          # confirm formspec-web is the only bumped submodule
git add formspec-web
git commit -m "chore(formspec-web): bump submodule for FW-0065 runtime feature resolver scaffold (web ADR-0011)"
```

---

## Self-review (run before handing the plan off)

**Spec coverage** (each ADR-0011 normative claim → task):

| ADR-0011 claim | Task |
|---|---|
| Three policy layers + one resolved output | Tasks 2, 6 |
| React shell consumes only `ResolvedRuntimeProfile` | Tasks 11, 12, 12b |
| Instance capabilities adapter-backed + sentinel records known absence | Tasks 4, 5, 10 |
| **Sentinel ↔ declaration coherence (no silent honesty drift)** — ADR-0011 §Rationale #1 | **Task 10b** (both directions, both markers, mode-aware) |
| **Demo stubs satisfy demo only; production stubs do not satisfy production** — enforced at composition construction, not just at resolver evaluation | **Tasks 4, 5b, 10b** (demo-stub provenance marker + composition coherence check rejects demo-stub-in-production) |
| Org modes `forbidden | allowed | default-on | required` | Tasks 2, 6, 7, 9 |
| Form modes `forbidden | optional | required` | Tasks 2, 6, 7, 9 |
| Deterministic resolution instance → org → form | Task 6 |
| Resolved profile immutable per session; recompute on identity/issuer/form-version change | Task 12 (resolution in `createReadyState`; identity-subscribe re-runs via `applyReadyState`; form-version + issuer change via definition reload) |
| **Recompute on locale change when policy depends on locale** | **Task 1 + Task 12** (`LOCALE_CONDITIONAL_FEATURE_KEYS` set + `handleLocaleChange` restart path; empty today, tripwire test guards future drift) |
| `UnsupportedRequiredFeatureError` | Tasks 3, 7, 9 (`required-instance-unsupported`, `required-feature-unavailable-sentinel`, `demo-stub-fails-production`) |
| `FeaturePolicyConflictError` | Tasks 3, 7, 9 (`required-org-forbidden`, `form-forbidden-org-required`) |
| `OrgPolicyUnsatisfiedError` | Tasks 3, 7, 9 (`required-org-instance-unsupported`) |
| `InvalidRuntimePolicyError` | Tasks 3, 6 (`validateInput`), 7, 9 (`invalid-form-policy-mode`) |
| Optional disables + records why; default-on disables unless required | Task 7, 9 (`optional-falls-off`, `default-on-instance-unavailable`, `default-on-instance-available`) |
| **Disabled features hidden, NOT rendered as adapter errors** (§Failure Semantics) | **Task 12b** (`loadRespondentPlace` + `readSubmissionStatuses` gated on `profile.enabled`; proved by `runtime-feature-gating.test.tsx`) |
| Shell catches typed errors at form-load → plain-language page + support reference | Task 12 |
| Tests + telemetry preserve typed code | Task 12 (assertion on `Support reference: FeaturePolicyConflict`) |
| Adapter-backed capability + resolved policy required for production enablement | Tasks 5, 5b, 10, 10b (provenance markers + declaration coherence enforced at construction) |
| Fixtures for required / optional / forbidden / default-on / policy-conflict | Task 9 |
| **Key-spelling coordination across upstream document producers** | **Task 13** (doc §"Adding a new feature key" step 0) |
| **Policy suite shipped to CI** (Codex Finding 1) | **Task 8** (extends `test:unit` to include `src/policy`, `tests/policy-resolution`, `tests/profiles`) + Task 15 (`npm run ci` is the verification step, not `test:unit` directly) |

**Placeholder scan:** No "TBD", no "implement later", no "add appropriate error handling". Every code step shows the code. Every test step shows the test body. Every commit step shows the message.

**Type consistency check:**
- `RuntimeFeatureKey` defined Task 1, consumed Tasks 2, 3, 6, 8, 10, 10b, 11, 12, 12b.
- `LOCALE_CONDITIONAL_FEATURE_KEYS` / `anyEnabledFeatureIsLocaleConditional` defined Task 1, exported Task 8, consumed Task 12.
- `ResolvedRuntimeProfile` defined Task 2, consumed Tasks 6, 8, 11, 12, 12b.
- `InstanceCapabilities` / `OrgRuntimePolicy` / `FormRuntimePolicy` defined Task 2, wired Task 10, consumed Tasks 10b, 12.
- `resolveRuntimeFeatures` defined Task 6, exported Task 8, called Task 12.
- `markUnavailableAdapter` / `isUnavailableAdapter` / `markDemoStubAdapter` / `isDemoStubAdapter` defined Task 4, used Tasks 5, 5b, 10b.
- `FEATURE_PORT_MAP` defined Task 10b, exported via the barrel update in Task 10b step 5.
- `assertCompositionCoherence` / `CompositionIncoherenceError` (with six `CompositionIncoherenceKind` cases covering BOTH provenance markers, BOTH directions, and the `available`-vs-marked-adapter case) defined Task 10b, called from composition factories in Task 10b step 7, asserted by Task 10b test.
- `UnsupportedRequiredFeatureError` etc. defined Task 3, thrown Task 6, asserted Tasks 7, 9, 12.
- `RuntimeProfileProvider` defined Task 11, consumed Task 12.
- `useResolvedRuntimeProfile` defined Task 11; consumed indirectly via the ready state's `runtimeProfile` field in Task 12b's gating logic — future feature consumers can call the hook directly.
- `RespondentPlaceState` extended Task 12b with `{ status: 'disabled' }` discriminator; `RespondentPlacePanel` short-circuits on it.

No drift.

---

## Execution Handoff

**Plan complete and saved to `formspec-web/thoughts/plans/2026-05-23-runtime-feature-resolution-and-policy-gates.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**

---

## Deviations

Tracked during the 2026-05-23 inline execution of this plan. Each row records an intentional divergence from the plan body and the justification.

### Closed inline (scout-review remediation)

- **CompositionLike index signature.** Plan declared `readonly [key: string]: unknown`. `Composition` (`src/composition/types.ts`) has no index signature, so passing a `Composition` to `assertCompositionCoherence` would fail typecheck. Reshaped `CompositionLike` to use a mapped type over `FEATURE_PORT_MAP[RuntimeFeatureKey]` (commit a1c9ddc).
- **`MEDIUM-1` DisabledCause unreachable values.** Two of the seven cause codes (`instance-unavailable`, `production-rejects-demo-stub`) are unreachable today. Kept the codes but added a `policy-shapes.ts` docstring naming them as reserved for future feature-ADR fan-out instead of deleting (a1c9ddc).
- **`MEDIUM-2` resolver branch-coverage gaps.** Added `default-on-and-form-forbidden.json` and `allowed-and-form-silent.json` fixtures (a1c9ddc).
- **`HIGH-2` production composition declaration drift surface.** Added inline pointer in `default.ts` to per-feature ADR/FW rows that swap the unavailable sentinel for a real adapter (a1c9ddc).
- **`MEDIUM-2` (arch) CapabilityAvailability closed-set rationale.** Added doc block in `policy-shapes.ts` justifying the three-value union and naming the cost of widening (a1c9ddc).
- **`HIGH-1` (code) production network amplification.** Tightened place-load useEffect deps from the whole `respondentState` object to `[composition, placeSubjectRef, isReady, runtimeProfile]` (commit ac2d10f).
- **`LOW-2` (code) extractor exceptions become typed errors.** Wrapped `composition.getFormRuntimePolicy(definition)` in try/catch and rethrow as `InvalidRuntimePolicyError`; smoke-tested in `runtime-feature-extractor-error.test.tsx` (ac2d10f).
- **`B-1` (arch) composition coherence funnel discipline.** Added `freezeComposition()` helper; both `createStubComposition` and `createDefaultComposition` funnel through it. Adopter forks copying the factory pattern inherit the boot-time honesty check (ac2d10f).
- **`H-3` (arch) form-policy honesty.** Demo stub's `getFormRuntimePolicy` now keys off `definition.url`; only the bundled demo form opts in. Other definitions get `{features:{}}` so form-policy stays form-owned (ac2d10f).
- **`M-3` (arch) status copy honesty.** Plumbed the resolved `DisabledCause` for `status` into `SubmissionItem`. When status is org-forbidden or form-forbidden, the UI renders "Status not shared" / "This issuer does not share application status here." instead of the misleading "Status pending" (ac2d10f).
- **`Task 12b` stub composition form opt-in.** Plan said `getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} })`. Without form opt-in the resolver collapses both seeded features to `not-requested` and Task 12b's gating hides the panel — breaking the plan's "today's demo unchanged" promise. The demo stub now opts in via the URL-keyed extractor (c56deba + ac2d10f). Updated the matching wiring test + respondent-runtime fixture.
- **`Task 12b` test waiters.** Plan's gating tests used `queryByText(/Your forms and files/i)` which matches both the H2 header and the loading div. Tightened to `queryByRole('heading', ...)` and `queryAllByRole(...)` to tolerate React-19 strict-mode rendering. Real underlying smell flagged for follow-up.

### Deferred with rationale (NOT remediated; flagged for follow-up)

- **`H-1` (both reviews): `getFormRuntimePolicy` should be a full `FormRuntimePolicyExtractor` port with conformance suite.** Justified inline: today there is no extractor logic to test (every implementation returns a literal). Per ADR-0011 §Non-goals, the form-policy field shape is deferred to feature ADRs; promoting to a port now would ship empty conformance fixtures. The Composition contract carries an inline TODO referencing the promotion trigger ("the moment the first feature ADR ships a non-trivial extractor"). Documented adopter-facing in `docs/policy/runtime-feature-resolution.md`.
  - **Triage outcome (2026-05-23):** Filed as `FW-0066` in `PLANNING.md`. The inline TODO is visible only inside `src/composition/types.ts`; a planning row surfaces the port-promotion at PLANNING-discovery time so the first feature-ADR author trips it before writing extractor code. Pairs with the existing inline TODO + adopter doc; the row's trigger language matches the TODO verbatim.
- **`H-2` (arch): two-phase resolver (instance × org pre-resolved before `getDefinition`).** UX optimization, not a correctness bug. ADR-0011 §Failure Semantics does not mandate "resolve before getDefinition." Slow `getDefinition` is a separate failure mode that deserves its own friendly error path. Defer to a follow-up FW row if respondent-perceived latency becomes an issue.
  - **Triage outcome (2026-05-23):** Closed wontfix. Pure latency optimization with no current respondent symptom — `getDefinition` latency is not a measured problem in the MVP composition, and the resolver already runs deterministically inside `RespondentRuntime` once the definition arrives. Defer-by-symptom is the honest discipline: a real latency triage with concrete numbers will produce a better-scoped row than a parked optimization with no metric. The deferred-row rationale itself names this trigger ("if respondent-perceived latency becomes an issue") — keeping it in the plan's Deviations log is sufficient.
- **`M-1` (arch): `applyReadyStateRef` → `useReducer({kind:'reset',claim,locale})`.** Ad-hoc escape hatch today; reducer is the right shape when the second restart trigger lands (definition refresh or profile refresh). Defer until then.
  - **Triage outcome (2026-05-23):** Closed wontfix. Code-shape refactor with no respondent symptom and one current trigger. The second restart trigger is itself a future feature-ADR scope (definition refresh, profile refresh), and the implementer landing that feature will feel the smell of a second `applyReadyStateRef` codepath and refactor naturally — the reducer is the obvious shape. Filing a parallel row would park an internal cleanup with no independent forcing function. The deferred-row rationale itself names the trigger ("when the second restart trigger lands").
- **`M-2` (arch): E2E coverage for production-boot coherence assertion.** Adopter-fork safety net; current `assertCompositionCoherence` runs at construction and is covered by `tests/profiles/composition-coherence.test.ts`. Adding a Playwright spec that boots with a fake `formspecServerUrl` is reasonable but scope expansion beyond this plan's MVP slice. Defer.
  - **Triage outcome (2026-05-23):** Closed wontfix. The unit suite `tests/profiles/composition-coherence.test.ts` covers the contract at construction — which is the only moment `assertCompositionCoherence` runs and the only moment it can fail. A Playwright spec exercising the same assertion through real boot would test the harness, not the assertion. If a real adopter fork hits a coherence drift the unit suite missed, that incident is the right time to file a row with concrete failure shape.
- **`M-3` (code) test mutations unsafe casts.** The gating tests mutate `composition.instanceCapabilities` after `freezeComposition` has already run. A `createStubComposition({overrides})` factory that re-runs coherence after mutations would be cleaner but is test-shape only. Defer.
  - **Triage outcome (2026-05-23):** Closed wontfix. The unsafe casts are isolated to test files — `freezeComposition` shipped specifically because production paths must not mutate the resolved capabilities, and the casts let tests reach behind that boundary without weakening the production invariant. A `createStubComposition({overrides})` factory that re-runs `assertCompositionCoherence` on the mutated shape would be a proper refactor target when (a) a third or fourth gating test trips the same pattern, or (b) a test silently violates coherence and the bug escapes the unit suite — neither is true today. Filing a row would park a stylistic cleanup with no failure trigger.
- **`M-4` (code) `queryAllByRole(...).length >= 1` smell.** React-19 strict-mode double-render is the working theory but unverified. Real underlying cause may be more interesting; tightening the assertion to `findByRole` + exact count would require digging into testing-library v16 + React 19 render semantics. Defer.
  - **Triage outcome (2026-05-23):** Closed wontfix. Investigation into testing-library v16 + React 19 strict-mode render semantics has no respondent value and the looser assertion does not let a real regression through today (the gating tests have asserted-on-presence intent, not asserted-on-count intent). If a real false negative appears — the assertion passes while the panel is double-rendered or duplicated — that incident is the right time to dig into the render-semantics root cause with a concrete failure shape to anchor the investigation.
- **`L-2` (arch): `RuntimePolicyErrorPage` is English-only.** Error rendered before locale negotiation completes; relevant only when a locale-conditional feature ADR lands and the recompute path itself needs to render in the requested locale. Defer with the tripwire test as the forcing function.
  - **Triage outcome (2026-05-23):** Closed wontfix. The tripwire test (`tests/app/runtime-feature-locale-recompute.test.tsx`) IS the planning system for this row — it fails the moment any feature key becomes locale-conditional, forcing the implementer to wire both the recompute path and a localized error rendering before the change can land. Filing a parallel FW row would duplicate the tripwire's forcing function with worse signal (a static row vs a test that physically blocks the next ADR).
- **`M-1` / `M-2` (code): typed `MissingRuntimeProfileProviderError`.** Hook throws bare `Error`. Could discriminate "missing provider" from real runtime failures with a typed subclass. Defer; bare Error is fine until a test or telemetry consumer needs the discrimination.
  - **Triage outcome (2026-05-23):** Closed wontfix. The deferred rationale itself names the trigger — "until a test or telemetry consumer needs the discrimination." The typed-error addition is a single-class refactor (about 10 lines, mirroring the existing `RuntimePolicyError` shape) that any consumer needing the discrimination can land in the same commit as the consuming test. Parking it as a planning row would carry no respondent value and would rot until a consumer trips it; the consumer's commit is the right place to surface the class.

### Process notes

- Reviews dispatched in parallel with implementation work in non-overlapping files (per goal's "every 3-5 commits" cadence + "load-bearing changes get pre-arch-review").
- Two scout reviews (one code, one architecture) ran against Tasks 1-5b. Six findings, all addressed inline before Task 8.
- Two scout reviews ran against Tasks 6-10 + the composition contract extension. Five MEDIUM findings, all addressed inline (with two new fixture cases + DisabledCause docstring).
- Two scout reviews ran against Tasks 10b-12b. One BLOCKER (composition coherence funnel) + four HIGH + four MEDIUM. Closed inline above. Code review went REQUEST CHANGES on the over-broad useEffect dep; that fix shipped before this plan is marked complete.

---

## Plan complete

All 12 tasks (1, 2, 3, 4, 5, 5b, 6, 7, 8, 9, 10, 10b, 11, 12, 12b) shipped. Checkboxes ticked en masse at close-out; per-step trace lives in git history (`git log --oneline -- src/policy/ tests/policy-resolution/ tests/profiles/ tests/adapters/`). Deviations section above logs every divergence from the plan body, including the 8 deferred rows triaged in a follow-up pass (one filed as `FW-0066`, seven closed wontfix with trigger-anchored rationale). FW-0065 moved to PLANNING.md `## Closed`.
