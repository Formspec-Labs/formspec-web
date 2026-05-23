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
  RuntimeConfig,
  TenantBindingConfig,
  TenantScopeConfig,
  TokenValue,
} from './types.ts';
export {
  readRuntimeConfig,
  resolveActiveConfig,
  runtimeConfigFromEnvRecord,
} from './runtime.ts';
