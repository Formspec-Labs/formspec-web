import type { NativePackageSigningConfig } from './native-package-signing.ts';
export type { NativePackageSigningConfig } from './native-package-signing.ts';
import type { AssuranceLevel } from '../ports/identity-provider.ts';
import type { ScopeKey } from '../shared/scope-key.ts';

export type TokenValue = string | number;

export interface BrandConfig {
  name: string;
  tokens: Record<string, TokenValue>;
}

export interface OidcClientConfig {
  issuer: string;
  clientId: string;
  redirectUri?: string;
  /** Space-separated OIDC and API scopes; must include openid. */
  scope?: string;
  silentRedirectUri?: string;
  postLogoutRedirectUri?: string;
  acrValues?: string;
  /** Deployment mapping for respondent assurance, never application roles. */
  acrAssuranceMap?: Record<string, AssuranceLevel>;
  resource?: string;
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
  /** Explicit closed native-package signing opt-in; qualified by the host before activation. */
  nativePackageSigning?: NativePackageSigningConfig;
  /** Deployment-owned attachment transport limits, measured on final uploaded bytes. */
  attachments?: { maxUploadBytes?: number };
  formspecServerUrl?: string;
  responseActionLedgerCapabilityUrl?: string;
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
  /** The deployment scope every reference adapter selects; absent sends no selector (ADR 0168 §1.1). */
  scopeKey?: ScopeKey;
  identity: IdentityPolicyConfig;
  brand: BrandConfig;
  ports: PortCompositionConfig;
  referenceAdapters?: ReferenceAdapterConfig;
}

export interface RuntimeConfig {
  /** Complete deployment object supplied only by runtime JS. */
  nativePackageSigning?: NativePackageSigningConfig;
  /** Deployment-owned final attachment upload byte limit; omitted means unknown. */
  attachmentMaxUploadBytes?: number;
  /** The deployment's scope key (64 lowercase hex, as `config-check` prints it), supplied by runtime JS. */
  scopeKey?: string;
  profileName?: string;
  formspecServerUrl?: string;
  responseActionLedgerCapabilityUrl?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcRedirectUri?: string;
  oidcScope?: string;
  oidcSilentRedirectUri?: string;
  oidcPostLogoutRedirectUri?: string;
  oidcAcrValues?: string;
  /** Explicit deployment minimum, validated as Formspec L1-L4. */
  oidcMinAssurance?: string;
  /** JSON object mapping exact provider ACR strings to Formspec L1-L4. */
  oidcAcrAssuranceMapJson?: string;
  oidcResource?: string;
  magicLinkCallbackPath?: string;
  /** Complete object supplied by runtime JS; locator-only objects stay disabled. */
  surfaceBundle?: RespondentSurfaceBundleConfig;
}
