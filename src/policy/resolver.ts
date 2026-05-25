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
  type RecordLifecycleCorrectablePolicy,
  type RecordLifecycleDisputablePolicy,
  type RecordLifecyclePolicy,
  type RecordLifecycleWindowPolicy,
  type RecordLifecycleWithdrawablePolicy,
  type ResolvedRecordLifecycleCorrectablePolicy,
  type ResolvedRecordLifecycleDisputablePolicy,
  type ResolvedRecordLifecyclePolicy,
  type ResolvedRecordLifecycleWindow,
  type ResolvedRecordLifecycleWithdrawablePolicy,
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

  const recordLifecycle = enabled.has('recordLifecycle')
    ? resolveRecordLifecyclePolicy(input.org.recordLifecycle, input.form.recordLifecycle)
    : undefined;

  return Object.freeze({
    mode: input.mode,
    enabled: freezeSet(enabled),
    disabled: freezeMap(disabled),
    limits: Object.freeze(limits),
    recordLifecycle,
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
  validateRecordLifecyclePolicy('org', input.org.recordLifecycle);
  validateRecordLifecyclePolicy('form', input.form.recordLifecycle);
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

function validateRecordLifecyclePolicy(
  source: 'org' | 'form',
  value: RecordLifecyclePolicy | undefined,
): void {
  if (value === undefined) return;
  validateRecordLifecycleAction(source, 'correctable', value.correctable);
  validateRecordLifecycleAction(source, 'withdrawable', value.withdrawable);
  validateRecordLifecycleAction(source, 'disputable', value.disputable);
}

function validateRecordLifecycleAction(
  source: 'org' | 'form',
  action: keyof RecordLifecyclePolicy,
  value:
    | RecordLifecycleCorrectablePolicy
    | RecordLifecycleWithdrawablePolicy
    | RecordLifecycleDisputablePolicy
    | undefined,
): void {
  if (value === undefined) return;
  if (typeof value.enabled !== 'boolean') {
    throw new InvalidRuntimePolicyError(
      source,
      `recordLifecycle.${action}.enabled must be a boolean`,
    );
  }
  validateRecordLifecycleWindow(source, action, value.window);

  if (action === 'correctable') {
    const correctable = value as RecordLifecycleCorrectablePolicy;
    if (correctable.enabled) {
      if (!Array.isArray(correctable.correctableFieldSet)) {
        throw new InvalidRuntimePolicyError(
          source,
          'recordLifecycle.correctable.correctableFieldSet must be declared when correctable is enabled',
        );
      }
      if (correctable.correctableFieldSet.length === 0) {
        throw new InvalidRuntimePolicyError(
          source,
          'recordLifecycle.correctable.correctableFieldSet must not be empty',
        );
      }
    }
    if (correctable.correctableFieldSet !== undefined) {
      validateFieldSet(source, correctable.correctableFieldSet);
    }
    validateOptionalBoolean(source, action, 'requiresEvidence', correctable.requiresEvidence);
    validateOptionalBoolean(source, action, 'requiresReason', correctable.requiresReason);
  }

  if (action === 'withdrawable') {
    const withdrawable = value as RecordLifecycleWithdrawablePolicy;
    validateOptionalBoolean(source, action, 'requiresReason', withdrawable.requiresReason);
    validateOptionalBoolean(
      source,
      action,
      'requiresIssuerAcceptance',
      withdrawable.requiresIssuerAcceptance,
    );
    if (
      withdrawable.preDeterminationKernelMode !== undefined &&
      withdrawable.preDeterminationKernelMode !== 'applicant-withdrawn'
    ) {
      throw new InvalidRuntimePolicyError(
        source,
        'recordLifecycle.withdrawable.preDeterminationKernelMode must be "applicant-withdrawn"',
      );
    }
    if (
      withdrawable.postDeterminationIntent !== undefined &&
      withdrawable.postDeterminationIntent !== 'rescission-requested'
    ) {
      throw new InvalidRuntimePolicyError(
        source,
        'recordLifecycle.withdrawable.postDeterminationIntent must be "rescission-requested"',
      );
    }
    if (
      withdrawable.postDeterminationIntent === 'rescission-requested' &&
      withdrawable.requiresIssuerAcceptance !== true
    ) {
      throw new InvalidRuntimePolicyError(
        source,
        'recordLifecycle.withdrawable.requiresIssuerAcceptance must be true when postDeterminationIntent is configured',
      );
    }
    if (
      withdrawable.partyScope !== undefined &&
      withdrawable.partyScope !== 'any-party' &&
      withdrawable.partyScope !== 'all-parties-must-agree'
    ) {
      throw new InvalidRuntimePolicyError(
        source,
        'recordLifecycle.withdrawable.partyScope must be any-party | all-parties-must-agree',
      );
    }
  }

  if (action === 'disputable') {
    const disputable = value as RecordLifecycleDisputablePolicy;
    validateOptionalBoolean(source, action, 'requiresEvidence', disputable.requiresEvidence);
    validateOptionalBoolean(source, action, 'requiresReason', disputable.requiresReason);
    validateOptionalBoolean(source, action, 'signerOnly', disputable.signerOnly);
  }
}

function validateRecordLifecycleWindow(
  source: 'org' | 'form',
  action: keyof RecordLifecyclePolicy,
  value: RecordLifecycleWindowPolicy | undefined,
): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null) {
    throw new InvalidRuntimePolicyError(
      source,
      `recordLifecycle.${action}.window must be an object`,
    );
  }
  if ('state' in value) {
    if (
      value.state !== 'open' &&
      value.state !== 'closes-at' &&
      value.state !== 'closed'
    ) {
      throw new InvalidRuntimePolicyError(
        source,
        `recordLifecycle.${action}.window.state must be open | closes-at | closed`,
      );
    }
    if (value.state === 'closes-at' && typeof value.closesAt !== 'string') {
      throw new InvalidRuntimePolicyError(
        source,
        `recordLifecycle.${action}.window.closesAt must be a string`,
      );
    }
    if (
      value.state === 'closed' &&
      value.closedAt !== undefined &&
      typeof value.closedAt !== 'string'
    ) {
      throw new InvalidRuntimePolicyError(
        source,
        `recordLifecycle.${action}.window.closedAt must be a string`,
      );
    }
    return;
  }
  if (!('closesAt' in value) || typeof value.closesAt !== 'string') {
    throw new InvalidRuntimePolicyError(
      source,
      `recordLifecycle.${action}.window.closesAt must be a string`,
    );
  }
}

function validateFieldSet(source: 'org' | 'form', fieldSet: readonly string[]): void {
  for (const path of fieldSet) {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new InvalidRuntimePolicyError(
        source,
        'recordLifecycle.correctable.correctableFieldSet entries must be RFC 6901-style JSON pointer strings',
      );
    }
  }
}

function validateOptionalBoolean(
  source: 'org' | 'form',
  action: keyof RecordLifecyclePolicy,
  property: string,
  value: boolean | undefined,
): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new InvalidRuntimePolicyError(
      source,
      `recordLifecycle.${action}.${property} must be a boolean`,
    );
  }
}

function resolveRecordLifecyclePolicy(
  orgPolicy: RecordLifecyclePolicy | undefined,
  formPolicy: RecordLifecyclePolicy | undefined,
): ResolvedRecordLifecyclePolicy | undefined {
  const merged = mergeRecordLifecyclePolicy(orgPolicy, formPolicy);
  if (!merged) return undefined;
  const resolved: {
    -readonly [K in keyof ResolvedRecordLifecyclePolicy]?: ResolvedRecordLifecyclePolicy[K];
  } = {};

  if (merged.correctable) {
    resolved.correctable = freezeRecordLifecycleAction({
      enabled: merged.correctable.enabled,
      correctableFieldSet: merged.correctable.correctableFieldSet
        ? Object.freeze([...merged.correctable.correctableFieldSet])
        : undefined,
      window: normalizeRecordLifecycleWindow(merged.correctable.window),
      requiresEvidence: merged.correctable.requiresEvidence ?? false,
      requiresReason: merged.correctable.requiresReason ?? true,
    }) as ResolvedRecordLifecycleCorrectablePolicy;
  }

  if (merged.withdrawable) {
    resolved.withdrawable = freezeRecordLifecycleAction({
      enabled: merged.withdrawable.enabled,
      window: normalizeRecordLifecycleWindow(merged.withdrawable.window),
      requiresReason: merged.withdrawable.requiresReason ?? true,
      preDeterminationKernelMode:
        merged.withdrawable.preDeterminationKernelMode ?? 'applicant-withdrawn',
      postDeterminationIntent: merged.withdrawable.postDeterminationIntent,
      requiresIssuerAcceptance: merged.withdrawable.requiresIssuerAcceptance ?? false,
      partyScope: merged.withdrawable.partyScope ?? 'any-party',
    }) as ResolvedRecordLifecycleWithdrawablePolicy;
  }

  if (merged.disputable) {
    resolved.disputable = freezeRecordLifecycleAction({
      enabled: merged.disputable.enabled,
      window: normalizeRecordLifecycleWindow(merged.disputable.window),
      requiresEvidence: merged.disputable.requiresEvidence ?? false,
      requiresReason: merged.disputable.requiresReason ?? true,
      signerOnly: merged.disputable.signerOnly ?? true,
    }) as ResolvedRecordLifecycleDisputablePolicy;
  }

  return Object.freeze(resolved) as ResolvedRecordLifecyclePolicy;
}

function mergeRecordLifecyclePolicy(
  orgPolicy: RecordLifecyclePolicy | undefined,
  formPolicy: RecordLifecyclePolicy | undefined,
): RecordLifecyclePolicy | undefined {
  if (!orgPolicy && !formPolicy) return undefined;
  return {
    correctable: mergeActionPolicy(orgPolicy?.correctable, formPolicy?.correctable),
    withdrawable: mergeActionPolicy(orgPolicy?.withdrawable, formPolicy?.withdrawable),
    disputable: mergeActionPolicy(orgPolicy?.disputable, formPolicy?.disputable),
  };
}

function mergeActionPolicy<T extends object>(
  orgAction: T | undefined,
  formAction: T | undefined,
): T | undefined {
  if (!orgAction && !formAction) return undefined;
  return { ...orgAction, ...formAction } as T;
}

function normalizeRecordLifecycleWindow(
  value: RecordLifecycleWindowPolicy | undefined,
): ResolvedRecordLifecycleWindow | undefined {
  if (value === undefined) return undefined;
  if ('state' in value) {
    if (value.state === 'open') return Object.freeze({ state: 'open' });
    if (value.state === 'closed') {
      return Object.freeze(
        value.closedAt === undefined
          ? { state: 'closed' }
          : { state: 'closed', closedAt: value.closedAt },
      );
    }
    return Object.freeze({ state: 'closes-at', closesAt: value.closesAt });
  }
  if (value.closesAt === 'never') {
    return Object.freeze({ state: 'open' });
  }
  return Object.freeze({ state: 'closes-at', closesAt: value.closesAt });
}

function freezeRecordLifecycleAction<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
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
