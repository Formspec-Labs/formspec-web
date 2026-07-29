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

/** Deployment-owned acquisition policy for web ADR-0012. */
export interface SurfaceBundleAcquisitionConfig {
  readonly locator: string;
  readonly allowedOrigins: readonly string[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly redirectPolicy: 'refuse' | 'same-origin';
  readonly maxRedirects?: number;
}

export interface SurfaceBundleMethodConfig {
  readonly id: string;
  readonly suite: string;
  readonly wire: string;
  readonly alg: number | null;
  readonly status: 'registered' | 'deprecated';
  readonly deprecationNotice?: string;
}

export interface SurfaceBundlePublisherAuthorityConfig {
  /** Unpadded base64url COSE `kid` bytes. */
  readonly kid: string;
  readonly publisherId: string;
  readonly publisherDisplayName: string;
  readonly appIds?: readonly string[];
  readonly appNamespaces?: readonly string[];
  readonly methods: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revoked: boolean;
}

export interface SurfaceBundleVerificationConfig {
  readonly expectedAppId: string;
  readonly methodRegistry: {
    readonly version: string;
    readonly entries: readonly SurfaceBundleMethodConfig[];
  };
  readonly keys: readonly {
    /** Unpadded base64url COSE `kid` bytes. */
    readonly kid: string;
    /** Unpadded base64url raw 32-byte Ed25519 public key. */
    readonly publicKey: string;
  }[];
  readonly authorities: readonly SurfaceBundlePublisherAuthorityConfig[];
  readonly pinnedReleases: readonly {
    readonly digest: string;
    readonly releaseId?: string;
  }[];
  readonly methodUriPrefix?: string;
}

/**
 * Complete signed respondent deployment. Acquisition alone never activates
 * this path; trust, release, module, and receipt boundaries are all required.
 */
export interface RespondentSurfaceBundleConfig
  extends SurfaceBundleAcquisitionConfig {
  readonly verification: SurfaceBundleVerificationConfig;
  readonly starterModuleId: string;
  readonly receiptResourceUrl: string;
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
  responseActionLedgerCapabilityUrl?: string;
  tenantHeaderDialect: 'formspec';
  oidc?: OidcClientConfig;
  magicLinkCallbackPath?: string;
  /** A complete object activates the verifying respondent root. */
  surfaceBundle?: SurfaceBundleAcquisitionConfig | RespondentSurfaceBundleConfig;
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
  responseActionLedgerCapabilityUrl?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcRedirectUri?: string;
  magicLinkCallbackPath?: string;
  /** Complete object supplied by runtime JS; locator-only objects stay disabled. */
  surfaceBundle?: RespondentSurfaceBundleConfig;
}
