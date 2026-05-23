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
