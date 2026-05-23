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
  DEMO_STUB_ADAPTER,
  UNAVAILABLE_ADAPTER,
  isDemoStubAdapter,
  isUnavailableAdapter,
  markDemoStubAdapter,
  markUnavailableAdapter,
  type AdapterProvenanceMeta,
  type DemoStub,
  type DemoStubAdapterMeta,
  type Unavailable,
  type UnavailableAdapterMeta,
} from './sentinel.ts';
export {
  resolveRuntimeFeatures,
  type ResolveRuntimeFeaturesInput,
} from './resolver.ts';
