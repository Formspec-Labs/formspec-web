/**
 * Pure runtime feature resolver per web ADR-0011 §Resolution.
 *
 * Deterministic: same input → same output. No I/O, no clocks, no randomness.
 * Throws typed configuration errors per §Failure Semantics. The shell
 * catches at the form-load boundary; the resolver itself does not render.
 */
import {
  RUNTIME_FEATURE_KEYS,
  isRuntimeFeatureKey,
  type RuntimeFeatureKey,
} from './feature-keys.ts';
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

type Decision = { kind: 'enabled' } | { kind: 'disabled'; reason: DisabledReason };

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
    throw new OrgPolicyUnsatisfiedError(
      featureKey,
      reasonForUnavailable(mode, capability),
    );
  }

  if (formMode === 'required') {
    if (!instanceCanDo) {
      throw new UnsupportedRequiredFeatureError(
        featureKey,
        reasonForUnavailable(mode, capability),
      );
    }
    return { kind: 'enabled' };
  }

  if (orgMode === 'required') {
    return { kind: 'enabled' };
  }

  if (formMode === 'forbidden' || orgMode === 'forbidden') {
    const cause: DisabledCause =
      formMode === 'forbidden' ? 'form-forbidden' : 'org-forbidden';
    return {
      kind: 'disabled',
      reason: {
        cause,
        message: `${featureKey} forbidden by ${cause === 'form-forbidden' ? 'form' : 'org'} policy`,
      },
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

  if (formMode === 'optional' && (orgMode === 'allowed' || orgMode === undefined)) {
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
    reason: {
      cause: 'not-requested',
      message: `${featureKey} not requested by form or org policy`,
    },
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
      throw new InvalidRuntimePolicyError(
        'org',
        `invalid mode "${mode}" for "${candidate}"`,
      );
    }
  }
  for (const candidate of Object.keys(input.form.features)) {
    if (!isRuntimeFeatureKey(candidate)) {
      throw new InvalidRuntimePolicyError('form', `unknown feature key "${candidate}"`);
    }
    const mode = input.form.features[candidate as RuntimeFeatureKey];
    if (mode !== undefined && !isFormFeaturePolicyMode(mode)) {
      throw new InvalidRuntimePolicyError(
        'form',
        `invalid mode "${mode}" for "${candidate}"`,
      );
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
