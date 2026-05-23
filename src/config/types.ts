import type { AssuranceLevel } from '../ports/identity-provider.ts';

export type TokenValue = string | number;

export interface BrandConfig {
  name: string;
  tokens: Record<string, TokenValue>;
}

export interface TenantScopeConfig {
  tenant: string;
  workspace: string;
  environment: string;
  cell: string;
}

export type TenantBindingConfig =
  | {
      kind: 'bound';
      scope: TenantScopeConfig;
    }
  | {
      kind: 'implicit';
      sentinelScope: TenantScopeConfig;
      headerMode: 'sentinel-until-ext24' | 'omit-post-ext24';
    };

export interface OidcClientConfig {
  issuer: string;
  clientId: string;
  redirectUri?: string;
  minAssurance: AssuranceLevel;
}

export interface MagicLinkConfig {
  callbackPath: string;
  minAssurance: Extract<AssuranceLevel, 'L2' | 'L3' | 'L4'>;
}

export type IdentityPolicyConfig =
  | {
      mode: 'oidc-required';
      oidc: OidcClientConfig;
    }
  | {
      mode: 'anonymous-allowed';
      oidc?: OidcClientConfig;
      magicLink?: MagicLinkConfig;
    };

export type PortAdapterKind = 'stub' | 'reference-http';

export interface PortCompositionConfig {
  definitionSource: PortAdapterKind;
  draftStore: PortAdapterKind;
  submitTransport: PortAdapterKind;
  identityProvider: 'anonymous' | 'oidc' | 'magic-link';
  notificationDelivery: 'stub' | 'inline-dev';
}

export interface FormspecStackReferenceAdapterConfig {
  formspecServerUrl?: string;
  tenantHeaderDialect: 'formspec';
  oidc?: OidcClientConfig;
  magicLinkCallbackPath?: string;
}

export interface ReferenceAdapterConfig {
  formspecStack?: FormspecStackReferenceAdapterConfig;
}

export interface FormspecWebConfig {
  profileName: string;
  tenantBinding: TenantBindingConfig;
  identity: IdentityPolicyConfig;
  brand: BrandConfig;
  ports: PortCompositionConfig;
  referenceAdapters?: ReferenceAdapterConfig;
}

export interface RuntimeConfig {
  profileName?: string;
  formspecServerUrl?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcRedirectUri?: string;
  magicLinkCallbackPath?: string;
}
