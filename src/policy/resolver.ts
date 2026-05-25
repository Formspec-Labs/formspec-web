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
  type MultiPartyRuntimeConfig,
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
  type SafeAddressAccessClass,
  type SafeAddressFieldPolicy,
  type SafeAddressReceiptPostureTier,
  type SafeAddressRuntimeConfig,
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
  const multiParty = enabled.has('multiParty')
    ? resolveMultiPartyPolicy(limits.multiParty)
    : undefined;
  const safeAddress = enabled.has('safeAddress')
    ? resolveSafeAddressPolicy(input.org.limits?.safeAddress, input.form.limits?.safeAddress)
    : undefined;

  return Object.freeze({
    mode: input.mode,
    enabled: freezeSet(enabled),
    disabled: freezeMap(disabled),
    limits: Object.freeze(limits),
    recordLifecycle,
    multiParty,
    safeAddress,
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
  validateMultiPartyLimits(input.org.limits?.multiParty, 'org');
  validateMultiPartyLimits(input.form.limits?.multiParty, 'form');
  validateSafeAddressLimits(input.org.limits?.safeAddress, 'org');
  validateSafeAddressLimits(input.form.limits?.safeAddress, 'form');
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

function validateMultiPartyLimits(value: unknown, layer: 'org' | 'form'): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.multiParty must be an object',
    );
  }
  const candidate = value as unknown as MultiPartyRuntimeConfig;
  if (candidate.tier !== 'coEqual' && candidate.tier !== 'asymmetric') {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.multiParty.tier must be coEqual | asymmetric',
    );
  }
  if (!Array.isArray(candidate.parties) || candidate.parties.length < 2) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.multiParty.parties must declare at least two party role slots',
    );
  }
  const roleIds = new Set<string>();
  for (const partyValue of candidate.parties) {
    const party = partyValue as unknown as MultiPartyRuntimeConfig['parties'][number];
    if (!isPlainObject(party)) {
      throw new InvalidRuntimePolicyError(
        layer,
        'limits.multiParty.parties entries must be objects',
      );
    }
    if (typeof party.roleId !== 'string' || party.roleId.length === 0) {
      throw new InvalidRuntimePolicyError(
        layer,
        'limits.multiParty.parties[].roleId must be a non-empty string',
      );
    }
    if (roleIds.has(party.roleId)) {
      throw new InvalidRuntimePolicyError(
        layer,
        `limits.multiParty.parties roleId "${party.roleId}" is duplicated`,
      );
    }
    roleIds.add(party.roleId);
    if (
      party.role !== 'coEqual' &&
      party.role !== 'asymmetricPrimary' &&
      party.role !== 'asymmetricSecondary' &&
      party.role !== 'guardianFor'
    ) {
      throw new InvalidRuntimePolicyError(
        layer,
        'limits.multiParty.parties[].role must be coEqual | asymmetricPrimary | asymmetricSecondary | guardianFor',
      );
    }
    if (party.visibilityScope !== 'shared' && party.visibilityScope !== 'scoped') {
      throw new InvalidRuntimePolicyError(
        layer,
        'limits.multiParty.parties[].visibilityScope must be shared | scoped',
      );
    }
    validateMultiPartyCardinality(layer, party.cardinality as MultiPartyRuntimeConfig['parties'][number]['cardinality']);
    validateOptionalStringArray(layer, 'limits.multiParty.parties[].visibleTo', party.visibleTo);
    validateOptionalStringArray(layer, 'limits.multiParty.parties[].editableBy', party.editableBy);
    validateOptionalStringArray(layer, 'limits.multiParty.parties[].signedBy', party.signedBy);
    validateOptionalStringArray(
      layer,
      'limits.multiParty.parties[].safeAddressAudience',
      party.safeAddressAudience,
    );
    if (party.safeAddressAudience && party.visibleTo) {
      const visibleSet = new Set(party.visibleTo);
      const intersection = party.safeAddressAudience.filter((entry) => visibleSet.has(entry));
      if (intersection.length === 0) {
        throw new InvalidRuntimePolicyError(
          layer,
          `limits.multiParty.parties roleId "${party.roleId}" has an empty safe-address x party-policy audience intersection`,
        );
      }
    }
  }
  if (
    candidate.invitationChannel !== undefined &&
    candidate.invitationChannel !== 'magic-link' &&
    candidate.invitationChannel !== 'wos-task' &&
    candidate.invitationChannel !== 'out-of-band'
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.multiParty.invitationChannel must be magic-link | wos-task | out-of-band',
    );
  }
  const deadlinePolicy = candidate.deadlinePolicy;
  if (deadlinePolicy !== undefined) {
    if (!isPlainObject(deadlinePolicy)) {
      throw new InvalidRuntimePolicyError(
        layer,
        'limits.multiParty.deadlinePolicy must be an object',
      );
    }
    if (
      deadlinePolicy.expirationAction !== 'void-submission' &&
      deadlinePolicy.expirationAction !== 'convert-to-partial'
    ) {
      throw new InvalidRuntimePolicyError(
        layer,
        'limits.multiParty.deadlinePolicy.expirationAction must be void-submission | convert-to-partial',
      );
    }
    if (
      deadlinePolicy.perPartyDeadline !== undefined &&
      (typeof deadlinePolicy.perPartyDeadline !== 'string' ||
        deadlinePolicy.perPartyDeadline.length === 0)
    ) {
      throw new InvalidRuntimePolicyError(
        layer,
        'limits.multiParty.deadlinePolicy.perPartyDeadline must be a non-empty string',
      );
    }
  }
}

function validateMultiPartyCardinality(
  layer: 'org' | 'form',
  value: MultiPartyRuntimeConfig['parties'][number]['cardinality'],
): void {
  if (!isPlainObject(value)) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.multiParty.parties[].cardinality must be an object',
    );
  }
  if (!Number.isInteger(value.min) || value.min < 1) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.multiParty.parties[].cardinality.min must be a positive integer',
    );
  }
  if (
    value.max !== 'unbounded' &&
    (!Number.isInteger(value.max) || value.max < value.min)
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.multiParty.parties[].cardinality.max must be unbounded or an integer >= min',
    );
  }
}

function validateSafeAddressLimits(value: unknown, layer: 'org' | 'form'): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new InvalidRuntimePolicyError(layer, 'limits.safeAddress must be an object');
  }
  const candidate = value as {
    receiptPostureTier?: unknown;
    enabledClasses?: unknown;
    acpJurisdictionsAccepted?: unknown;
    authorizedAudiences?: unknown;
    substituteAddressDirectoryRef?: unknown;
    fields?: unknown;
    rendererHints?: unknown;
  };
  if (
    candidate.receiptPostureTier !== undefined &&
    !isSafeAddressReceiptPostureTier(candidate.receiptPostureTier)
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.safeAddress.receiptPostureTier must be verifier-grade | phase-1-fallback',
    );
  }
  validateOptionalStringArray(layer, 'limits.safeAddress.enabledClasses', candidate.enabledClasses);
  if (
    Array.isArray(candidate.enabledClasses) &&
    !candidate.enabledClasses.every((entry) => isSafeAddressAccessClass(entry))
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.safeAddress.enabledClasses entries must be safe-address | safe-contact | safe-employer',
    );
  }
  validateOptionalStringArray(
    layer,
    'limits.safeAddress.acpJurisdictionsAccepted',
    candidate.acpJurisdictionsAccepted,
  );
  validateOptionalStringArray(
    layer,
    'limits.safeAddress.authorizedAudiences',
    candidate.authorizedAudiences,
  );
  if (
    candidate.substituteAddressDirectoryRef !== undefined &&
    (typeof candidate.substituteAddressDirectoryRef !== 'string' ||
      candidate.substituteAddressDirectoryRef.length === 0)
  ) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.safeAddress.substituteAddressDirectoryRef must be a non-empty string',
    );
  }
  if (candidate.fields !== undefined && !Array.isArray(candidate.fields)) {
    throw new InvalidRuntimePolicyError(layer, 'limits.safeAddress.fields must be an array');
  }
  for (const field of Array.isArray(candidate.fields) ? candidate.fields : []) {
    validateSafeAddressField(layer, field);
  }
  if (candidate.rendererHints !== undefined && !isPlainObject(candidate.rendererHints)) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.safeAddress.rendererHints must be an object',
    );
  }
}

function validateSafeAddressField(layer: 'org' | 'form', value: unknown): void {
  if (!isPlainObject(value)) {
    throw new InvalidRuntimePolicyError(layer, 'limits.safeAddress.fields entries must be objects');
  }
  const field = value as unknown as SafeAddressFieldPolicy;
  if (typeof field.path !== 'string' || !field.path.startsWith('/')) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.safeAddress.fields[].path must be an RFC 6901-style JSON pointer',
    );
  }
  if (!isSafeAddressAccessClass(field.accessClass)) {
    throw new InvalidRuntimePolicyError(
      layer,
      'limits.safeAddress.fields[].accessClass must be safe-address | safe-contact | safe-employer',
    );
  }
  validateOptionalStringArray(layer, 'limits.safeAddress.fields[].visibleTo', field.visibleTo);
  validateOptionalStringArray(
    layer,
    'limits.safeAddress.fields[].plaintextAudiences',
    field.plaintextAudiences,
  );
  validateOptionalStringArray(
    layer,
    'limits.safeAddress.fields[].effectiveAudiences',
    field.effectiveAudiences,
  );
}

function validateOptionalStringArray(
  layer: 'org' | 'form',
  cite: string,
  value: unknown,
): void {
  if (
    value !== undefined &&
    (!Array.isArray(value) ||
      !value.every((entry) => typeof entry === 'string' && entry.length > 0))
  ) {
    throw new InvalidRuntimePolicyError(layer, `${cite} must be an array of non-empty strings`);
  }
}

function resolveMultiPartyPolicy(value: unknown): MultiPartyRuntimeConfig {
  validateMultiPartyLimits(value, 'form');
  const policy = value as MultiPartyRuntimeConfig | undefined;
  if (!policy) {
    throw new InvalidRuntimePolicyError(
      'form',
      'multiParty is enabled but limits.multiParty is not declared',
    );
  }
  return Object.freeze({
    ...policy,
    invitationChannel: policy.invitationChannel ?? 'out-of-band',
    parties: Object.freeze(policy.parties.map((party) => Object.freeze({
      ...party,
      cardinality: Object.freeze({ ...party.cardinality }),
    }))),
    deadlinePolicy: policy.deadlinePolicy
      ? Object.freeze({ ...policy.deadlinePolicy })
      : undefined,
  });
}

function isSafeAddressAccessClass(value: unknown): value is SafeAddressAccessClass {
  return value === 'safe-address' || value === 'safe-contact' || value === 'safe-employer';
}

function isSafeAddressReceiptPostureTier(
  value: unknown,
): value is SafeAddressReceiptPostureTier {
  return value === 'verifier-grade' || value === 'phase-1-fallback';
}

function resolveSafeAddressPolicy(
  orgLimit: unknown,
  formLimit: unknown,
): SafeAddressRuntimeConfig {
  const org = safeAddressLimitObject(orgLimit);
  const form = safeAddressLimitObject(formLimit);
  const fields = fieldPolicies(form.fields);
  const enabledClasses =
    nonEmptyStringArrayFrom(form.enabledClasses)?.filter(isSafeAddressAccessClass) ??
    nonEmptyStringArrayFrom(org.enabledClasses)?.filter(isSafeAddressAccessClass) ??
    unique(fields.map((field) => field.accessClass));
  const authorizedAudiences =
    nonEmptyStringArrayFrom(form.authorizedAudiences) ??
    stringArrayFrom(org.authorizedAudiences) ??
    ['issuer_verification'];
  const acpJurisdictionsAccepted =
    nonEmptyStringArrayFrom(form.acpJurisdictionsAccepted) ??
    stringArrayFrom(org.acpJurisdictionsAccepted) ??
    [];
  const deploymentReceiptPostureTier =
    (org.receiptPostureTier as SafeAddressReceiptPostureTier | undefined) ??
    'phase-1-fallback';
  const receiptPostureTier =
    (form.receiptPostureTier as SafeAddressReceiptPostureTier | undefined) ??
    deploymentReceiptPostureTier;

  if (fields.length === 0) {
    throw new InvalidRuntimePolicyError(
      'form',
      'safeAddress is enabled but no safe-* field policy was declared',
    );
  }
  if (enabledClasses.length === 0) {
    throw new InvalidRuntimePolicyError(
      'form',
      'safeAddress is enabled but no safe-* class was declared',
    );
  }
  if (acpJurisdictionsAccepted.length === 0) {
    throw new InvalidRuntimePolicyError(
      'org',
      'safeAddress is enabled but no accepted protection jurisdiction is configured',
    );
  }
  if (authorizedAudiences.length === 0) {
    throw new InvalidRuntimePolicyError(
      'org',
      'safeAddress is enabled but no authorized plaintext audience is configured',
    );
  }
  if (safeAddressTierRank(receiptPostureTier) > safeAddressTierRank(deploymentReceiptPostureTier)) {
    throw new InvalidRuntimePolicyError(
      'form',
      `safeAddress receiptPostureTier "${receiptPostureTier}" exceeds deployment capability "${deploymentReceiptPostureTier}"`,
    );
  }
  for (const field of fields) {
    assertSafeAddressIntersection(field, authorizedAudiences);
  }

  return Object.freeze({
    enabledClasses: Object.freeze([...enabledClasses]),
    receiptPostureTier,
    substituteAddressDirectoryRef:
      stringValue(form.substituteAddressDirectoryRef) ??
      stringValue(org.substituteAddressDirectoryRef) ??
      'composition:safeAddressDirectory',
    acpJurisdictionsAccepted: Object.freeze([...acpJurisdictionsAccepted]),
    authorizedAudiences: Object.freeze([...authorizedAudiences]),
    fields: Object.freeze(fields.map(freezeSafeAddressField)),
    rendererHints: safeAddressRendererHints(form.rendererHints ?? org.rendererHints),
  });
}

function assertSafeAddressIntersection(
  field: SafeAddressFieldPolicy,
  defaultPlaintextAudiences: readonly string[],
): void {
  if (field.effectiveAudiences !== undefined) {
    if (field.effectiveAudiences.length === 0) {
      throw new InvalidRuntimePolicyError(
        'form',
        `safeAddress field "${field.path}" has an empty effective audience intersection`,
      );
    }
    return;
  }
  const visibleTo = field.visibleTo;
  const plaintextAudiences = field.plaintextAudiences ?? defaultPlaintextAudiences;
  if (visibleTo !== undefined) {
    const intersection = visibleTo.filter((entry) => plaintextAudiences.includes(entry));
    if (intersection.length === 0) {
      throw new InvalidRuntimePolicyError(
        'form',
        `safeAddress field "${field.path}" has no audience allowed by both party policy and safe-address policy`,
      );
    }
  }
}

function safeAddressLimitObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function fieldPolicies(value: unknown): readonly SafeAddressFieldPolicy[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => entry as SafeAddressFieldPolicy);
}

function freezeSafeAddressField(field: SafeAddressFieldPolicy): SafeAddressFieldPolicy {
  return Object.freeze({
    path: field.path,
    label: field.label,
    accessClass: field.accessClass,
    visibleTo: field.visibleTo ? Object.freeze([...field.visibleTo]) : undefined,
    plaintextAudiences: field.plaintextAudiences
      ? Object.freeze([...field.plaintextAudiences])
      : undefined,
    effectiveAudiences: field.effectiveAudiences
      ? Object.freeze([...field.effectiveAudiences])
      : undefined,
  });
}

function safeAddressRendererHints(value: unknown): SafeAddressRuntimeConfig['rendererHints'] {
  if (!isPlainObject(value)) return undefined;
  const maskRenderToken = stringValue(value.maskRenderToken);
  const revealAffordanceLabel = stringValue(value.revealAffordanceLabel);
  if (!maskRenderToken && !revealAffordanceLabel) return undefined;
  return Object.freeze({
    maskRenderToken,
    revealAffordanceLabel,
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArrayFrom(value: unknown): readonly string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : undefined;
}

function nonEmptyStringArrayFrom(value: unknown): readonly string[] | undefined {
  const entries = stringArrayFrom(value);
  return entries && entries.length > 0 ? entries : undefined;
}

function safeAddressTierRank(tier: SafeAddressReceiptPostureTier): number {
  return tier === 'verifier-grade' ? 2 : 1;
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
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
