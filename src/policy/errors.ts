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
  | 'InvalidRuntimePolicy'
  | 'EmbedOriginNotAllowed'
  | 'PaymentRequiresOnline'
  | 'HiddenDefinitionRuntimeState';

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
  | 'form-required-org-forbidden'
  | 'trusted-reviewer-role-intersection-empty';

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

/**
 * FW-0040 slice 1: thrown by the iframe-context gate at form load when the
 * form is mounted inside a host iframe whose origin is not in the org's
 * `limits.embed.allowedOrigins` allow-list. The featureKey is always
 * `'embed'`; the form-load error boundary catches this and renders the
 * plain-language "this form is not set up to be shown on this site." copy.
 */
export class EmbedOriginNotAllowedError extends RuntimePolicyError {
  readonly code = 'EmbedOriginNotAllowed' as const;
  readonly featureKey = 'embed' as const;
  constructor(reason: string) {
    super(`Embed origin not allowed: ${reason}`);
  }
}

/**
 * FW-0027 M-1 slice 1: thrown by the form-load boundary when a payment-
 * required form loads on a device that is currently offline (AND offline
 * submit is enabled — the only combo that lets the user start filling
 * without an active connection). Hoisted from the prior submit-time check
 * so the user sees the unavailable banner at load instead of after filling
 * the entire form. The featureKey is always `'payment'`. FW-0101 lifts the
 * restriction once a substrate exists for held-authorization replay.
 */
export class PaymentRequiresOnlineError extends RuntimePolicyError {
  readonly code = 'PaymentRequiresOnline' as const;
  readonly featureKey = 'payment' as const;
  constructor() {
    super(
      'This form requires payment and cannot be saved for later — you must be online to fill it.',
    );
  }
}

/**
 * ADR 0153 UI Graph Policy runtime consumer gate. Thrown before draft or
 * Response Action state is created when completed host evidence says the
 * active route hides the currently loaded Definition.
 */
export class HiddenDefinitionRuntimeStateError extends RuntimePolicyError {
  readonly code = 'HiddenDefinitionRuntimeState' as const;
  constructor(readonly definitionUrl: string) {
    super(`Definition is hidden on the active route: ${definitionUrl}`);
  }
}

export function isRuntimePolicyError(value: unknown): value is RuntimePolicyError {
  return value instanceof RuntimePolicyError;
}
