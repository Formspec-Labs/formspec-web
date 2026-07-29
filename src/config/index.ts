export type {
  BrandConfig,
  FormspecStackReferenceAdapterConfig,
  FormspecWebConfig,
  IdentityPolicyConfig,
  MagicLinkConfig,
  OidcClientConfig,
  PortAdapterKind,
  PortCompositionConfig,
  ReferenceAdapterConfig,
  RespondentSurfaceBundleConfig,
  RuntimeConfig,
  SurfaceBundleAcquisitionConfig,
  SurfaceBundleMethodConfig,
  SurfaceBundlePublisherAuthorityConfig,
  SurfaceBundleVerificationConfig,
  TenantBindingConfig,
  TenantScopeConfig,
  TokenValue,
} from './types.ts';
export {
  readRuntimeConfig,
  resolveActiveConfig,
  runtimeConfigFromEnvRecord,
} from './runtime.ts';
export {
  isRespondentSurfaceBundleConfig,
  respondentSurfaceBundleConfig,
  respondentSurfaceDeploymentIsConfigured,
} from './respondent-surface.ts';
