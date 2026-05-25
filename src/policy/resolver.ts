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
      const limit = mergeFeatureLimits(input.org.limits?.[key], input.form.limits?.[key]);
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
  validateEmbedLimits(input.org.limits?.embed);
  validateTrustedReviewerLimits(input.org.limits?.trustedReviewer, 'org');
  validateTrustedReviewerLimits(input.form.limits?.trustedReviewer, 'form');
}

/**
 * FW-0040 slice 1: the `limits.embed.allowedOrigins` shape is normative —
 * the iframe-context gate cannot make a fail-closed decision when entries
 * are malformed. Validate at boot so drift is caught before any form loads.
 */
function validateEmbedLimits(value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null) {
    throw new InvalidRuntimePolicyError(
      'org',
      'limits.embed must be an object with an allowedOrigins array',
    );
  }
  const limits = value as { allowedOrigins?: unknown };
  if (!Array.isArray(limits.allowedOrigins)) {
    throw new InvalidRuntimePolicyError(
      'org',
      'limits.embed.allowedOrigins must be an array',
    );
  }
  for (const entry of limits.allowedOrigins) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new InvalidRuntimePolicyError(
        'org',
        'limits.embed.allowedOrigins entries must be non-empty strings',
      );
    }
    if (entry === '*') continue;
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new InvalidRuntimePolicyError(
        'org',
        `limits.embed.allowedOrigins entry "${entry}" is not a valid URL`,
      );
    }
    if (parsed.origin !== entry) {
      throw new InvalidRuntimePolicyError(
        'org',
        `limits.embed.allowedOrigins entry "${entry}" must be an origin (no path / query / fragment)`,
      );
    }
  }
}

function mergeFeatureLimits(orgLimit: unknown, formLimit: unknown): unknown {
  if (orgLimit === undefined) return formLimit;
  if (formLimit === undefined) return orgLimit;
  if (isPlainObject(orgLimit) && isPlainObject(formLimit)) {
    return Object.freeze({ ...orgLimit, ...formLimit });
  }
  return formLimit;
}

function validateTrustedReviewerLimits(value: unknown, layer: 'org' | 'form'): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.trustedReviewer must be an object',
    );
  }
  const candidate = value as {
    posture?: unknown;
    allowedRoles?: unknown;
    reviewerAssuranceFloor?: unknown;
    maxActiveSharesPerDraft?: unknown;
    defaultShareExpiresAtRule?: unknown;
    respondentOnlyFieldPointers?: unknown;
  };
  if (
    candidate.posture !== undefined &&
    candidate.posture !== 'forbidden' &&
    candidate.posture !== 'comment-allowed' &&
    candidate.posture !== 'suggest-allowed'
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.trustedReviewer.posture must be forbidden | comment-allowed | suggest-allowed',
    );
  }
  if (
    candidate.allowedRoles !== undefined &&
    (!Array.isArray(candidate.allowedRoles) ||
      !candidate.allowedRoles.every((entry) => typeof entry === 'string' && entry.length > 0))
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.trustedReviewer.allowedRoles must be an array of non-empty strings',
    );
  }
  if (
    candidate.reviewerAssuranceFloor !== undefined &&
    candidate.reviewerAssuranceFloor !== 'L1' &&
    candidate.reviewerAssuranceFloor !== 'L2' &&
    candidate.reviewerAssuranceFloor !== 'L3' &&
    candidate.reviewerAssuranceFloor !== 'L4'
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.trustedReviewer.reviewerAssuranceFloor must be L1 | L2 | L3 | L4',
    );
  }
  const maxActiveSharesPerDraft = candidate.maxActiveSharesPerDraft;
  if (
    maxActiveSharesPerDraft !== undefined &&
    (typeof maxActiveSharesPerDraft !== 'number' ||
      !Number.isInteger(maxActiveSharesPerDraft) ||
      maxActiveSharesPerDraft < 1)
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.trustedReviewer.maxActiveSharesPerDraft must be a positive integer',
    );
  }
  if (
    candidate.defaultShareExpiresAtRule !== undefined &&
    (typeof candidate.defaultShareExpiresAtRule !== 'string' ||
      candidate.defaultShareExpiresAtRule.length === 0)
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.trustedReviewer.defaultShareExpiresAtRule must be a non-empty string',
    );
  }
  if (
    candidate.respondentOnlyFieldPointers !== undefined &&
    (!Array.isArray(candidate.respondentOnlyFieldPointers) ||
      !candidate.respondentOnlyFieldPointers.every((entry) => (
        typeof entry === 'string' && entry.startsWith('/')
      )))
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.trustedReviewer.respondentOnlyFieldPointers must be an array of JSON pointers',
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
