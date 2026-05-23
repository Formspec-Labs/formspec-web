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
    super(
      `Org policy requires "${featureKey}" but the instance cannot satisfy it: ${reason}`,
    );
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
