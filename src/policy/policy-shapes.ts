/**
 * Policy-document shapes consumed by the runtime feature resolver
 * (web ADR-0011 §Decision).
 *
 * Per ADR-0011 Non-goals these are TypeScript shapes only — no canonical
 * JSON Schema is defined here. Adopters wire their own policy sources at the
 * Composition root.
 */
import type { RuntimeFeatureKey } from './feature-keys.ts';
import type {
  ReviewThreadPolicySnapshot,
  TrustedReviewerPosture,
} from '../ports/review-thread-store.ts';

/**
 * Closed-set decision: an instance capability is exactly one of three states.
 * No `'degraded'` value today — operational degradation (e.g., a status reader
 * returning stale cached values) is per-adapter runtime state, not a
 * composition-declaration concern. If a future feature ADR proves otherwise,
 * widening this union is a non-backwards-compatible change for every adopter
 * fork that exhaustive-checks the value; pin the decision in ADR-0011 before
 * expanding.
 */
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
   *
   * FW-0040 defines `limits.embed` as `EmbedLimits` ({ allowedOrigins: string[] }):
   * the iframe-context gate matches the host page's origin against this
   * allow-list. An empty array fails-closed; the literal `'*'` opts into
   * any-origin (production adopters who use this MUST document it). The
   * resolver validates this shape at boot.
   */
  readonly limits?: Readonly<Partial<Record<RuntimeFeatureKey, unknown>>>;
}

export interface TrustedReviewerRuntimeConfig extends ReviewThreadPolicySnapshot {
  readonly posture: TrustedReviewerPosture;
}

/**
 * FW-0040 slice 1: shape of `OrgRuntimePolicy.limits.embed`. The runtime
 * iframe-context gate matches the host page's origin against
 * `allowedOrigins` and fails-closed when no entry matches. An empty array
 * means "no origins allowed." A single `'*'` entry means "any origin
 * allowed" (production adopters MUST document this).
 */
export interface EmbedLimits {
  readonly allowedOrigins: readonly string[];
}

/**
 * Typed accessor for `OrgRuntimePolicy.limits.embed`. The resolver validates
 * the shape at boot via `validateEmbedLimits`; callers must use this accessor
 * instead of casting `limits.embed as EmbedLimits` so that any future shape
 * widening flows through a single seam. Returns `undefined` when no embed
 * limits are declared (resolver-validated equivalent of "fail-closed default").
 */
export function getEmbedLimits(policy: OrgRuntimePolicy): EmbedLimits | undefined {
  const value = policy.limits?.embed;
  if (value === undefined) return undefined;
  return value as EmbedLimits;
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
  /**
   * Optional per-feature configuration extracted from the definition. FW-0113
   * uses `limits.trustedReviewer` for the FW-0042 three-tier posture and
   * respondent-only field pointers while SC-6 remains PROPOSAL-status.
   */
  readonly limits?: Readonly<Partial<Record<RuntimeFeatureKey, unknown>>>;
}

/**
 * ADR-0011 §Failure Semantics. Optional features record why they fell off.
 *
 * Today's resolver emits five of these seven causes — `form-forbidden`,
 * `org-forbidden`, `optional-no-instance`, `default-on-no-instance`,
 * `not-requested`. The two others are reserved for future feature-ADR fan-out:
 *   - `instance-unavailable` — adopter-facing diagnostic when a feature is
 *     wired as `unavailable` but the form/org didn't request it and we want
 *     to surface "the instance can't do this" separately from "nothing
 *     asked." Today both collapse to `not-requested` / `optional-no-instance`.
 *   - `production-rejects-demo-stub` — reserved for a future production-mode
 *     resolver that records "demo-stub rejected" as a disabled-cause for
 *     optional/default-on paths rather than a typed throw. Today the
 *     production-rejects-demo-stub case for *required* features throws
 *     UnsupportedRequiredFeatureError; the optional/default-on case collapses
 *     to `optional-no-instance` / `default-on-no-instance`.
 *
 * Keep both reserved: deleting them now would force a non-backwards-compatible
 * widening the moment we want richer diagnostics.
 */
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

export function getTrustedReviewerRuntimeConfig(
  profile: ResolvedRuntimeProfile,
): TrustedReviewerRuntimeConfig | undefined {
  if (!profile.enabled.has('trustedReviewer')) return undefined;
  const value = profile.limits.trustedReviewer;
  if (value === undefined) {
    return {
      posture: 'comment-allowed',
      respondentOnlyFieldPointers: [],
      reviewerSessionBindingRef: 'composition:reviewerSession',
      reviewThreadStoreBindingRef: 'composition:reviewThreadStore',
    };
  }
  return value as TrustedReviewerRuntimeConfig;
}
