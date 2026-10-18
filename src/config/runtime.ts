import type {} from '../browser-environment.d.ts';
import type { AssuranceLevel } from '../ports/identity-provider.ts';
import { readNativePackageSigningConfig } from './native-package-signing.ts';
import { validatedAttachmentMaxUploadBytes } from './attachment-policy.ts';
import { getReferenceProfile } from '../profiles/profiles.ts';
import { parseScopeKey } from '../shared/scope-key.ts';
import type {
  FormspecWebConfig,
  IdentityPolicyConfig,
  MagicLinkConfig,
  OidcClientConfig,
  RuntimeConfig,
} from './types.ts';

type RuntimeEnvRecord = Record<string, string | boolean | undefined>;

const runtimeEnvMap = {
  profileName: ['FORMSPEC_WEB_PROFILE', 'VITE_FORMSPEC_WEB_PROFILE'],
  formspecServerUrl: ['FORMSPEC_WEB_SERVER_URL', 'VITE_FORMSPEC_WEB_SERVER_URL'],
  responseActionLedgerCapabilityUrl: [
    'FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL',
    'VITE_FORMSPEC_WEB_RESPONSE_ACTION_LEDGER_CAPABILITY_URL',
  ],
  oidcIssuer: ['FORMSPEC_WEB_OIDC_ISSUER', 'VITE_FORMSPEC_WEB_OIDC_ISSUER'],
  oidcClientId: ['FORMSPEC_WEB_OIDC_CLIENT_ID', 'VITE_FORMSPEC_WEB_OIDC_CLIENT_ID'],
  oidcRedirectUri: ['FORMSPEC_WEB_OIDC_REDIRECT_URI', 'VITE_FORMSPEC_WEB_OIDC_REDIRECT_URI'],
  oidcScope: ['FORMSPEC_WEB_OIDC_SCOPE', 'VITE_FORMSPEC_WEB_OIDC_SCOPE'],
  oidcSilentRedirectUri: ['FORMSPEC_WEB_OIDC_SILENT_REDIRECT_URI', 'VITE_FORMSPEC_WEB_OIDC_SILENT_REDIRECT_URI'],
  oidcPostLogoutRedirectUri: ['FORMSPEC_WEB_OIDC_POST_LOGOUT_REDIRECT_URI', 'VITE_FORMSPEC_WEB_OIDC_POST_LOGOUT_REDIRECT_URI'],
  oidcAcrValues: ['FORMSPEC_WEB_OIDC_ACR_VALUES', 'VITE_FORMSPEC_WEB_OIDC_ACR_VALUES'],
  oidcMinAssurance: ['FORMSPEC_WEB_OIDC_MIN_ASSURANCE', 'VITE_FORMSPEC_WEB_OIDC_MIN_ASSURANCE'],
  oidcAcrAssuranceMapJson: ['FORMSPEC_WEB_OIDC_ACR_ASSURANCE_MAP_JSON', 'VITE_FORMSPEC_WEB_OIDC_ACR_ASSURANCE_MAP_JSON'],
  oidcResource: ['FORMSPEC_WEB_OIDC_RESOURCE', 'VITE_FORMSPEC_WEB_OIDC_RESOURCE'],
  magicLinkCallbackPath: [
    'FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH',
    'VITE_FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH',
  ],
} as const satisfies Record<
  Exclude<keyof RuntimeConfig, 'surfaceBundle' | 'scopeKey' | 'attachmentMaxUploadBytes' | 'nativePackageSigning'>,
  readonly string[]
>;

export function readRuntimeConfig(): RuntimeConfig {
  const viteConfig = runtimeConfigFromEnvRecord(import.meta.env);
  const windowConfig =
    typeof window === 'undefined' ? undefined : window.__FORMSPEC_RUNTIME_CONFIG__;

  const defaults = typeof window === 'undefined' ? undefined : window.__FORMSPEC_RUNTIME_DEFAULTS__;
  const nativePackageSigning = readNativePackageSigningConfig(windowConfig);
  return compactRuntimeConfig({
    ...defaults,
    ...viteConfig,
    ...windowConfig,
    ...(nativePackageSigning ? { nativePackageSigning } : {}),
  });
}

export function runtimeConfigFromEnvRecord(env: RuntimeEnvRecord): RuntimeConfig {
  const config: RuntimeConfig = {};
  const scopeKey = env.FORMSPEC_WEB_SCOPE_KEY ?? env.VITE_FORMSPEC_WEB_SCOPE_KEY;
  if (scopeKey !== undefined) config.scopeKey = parseScopeKey(scopeKey);
  for (const [runtimeKey, envNames] of Object.entries(runtimeEnvMap) as Array<
    [Exclude<keyof RuntimeConfig, 'surfaceBundle' | 'scopeKey' | 'attachmentMaxUploadBytes' | 'nativePackageSigning'>, readonly string[]]
  >) {
    const value = firstPresent(env, envNames);
    if (value) {
      config[runtimeKey] = value;
    }
  }
  const attachmentLimit = firstPresent(env, [
    'FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES', 'VITE_FORMSPEC_WEB_ATTACHMENT_MAX_UPLOAD_BYTES',
  ]);
  if (attachmentLimit !== undefined) {
    config.attachmentMaxUploadBytes = validatedAttachmentMaxUploadBytes(Number(attachmentLimit));
  }
  return config;
}

export function resolveActiveConfig(
  baseConfig: FormspecWebConfig,
  runtimeConfig: RuntimeConfig = {},
): FormspecWebConfig {
  const profileConfig = runtimeConfig.profileName
    ? (getReferenceProfile(runtimeConfig.profileName) ?? baseConfig)
    : baseConfig;

  return applyRuntimeOverrides(profileConfig, runtimeConfig);
}

function applyRuntimeOverrides(
  profileConfig: FormspecWebConfig,
  runtimeConfig: RuntimeConfig,
): FormspecWebConfig {
  const referenceAdapter = profileConfig.referenceAdapters?.formspecStack;
  const nativePackageSigning = readNativePackageSigningConfig(runtimeConfig)
    ?? readNativePackageSigningConfig(referenceAdapter);
  const runtimeMaxUploadBytes = validatedAttachmentMaxUploadBytes(runtimeConfig.attachmentMaxUploadBytes);
  const maxUploadBytes = runtimeMaxUploadBytes
    ?? validatedAttachmentMaxUploadBytes(referenceAdapter?.attachments?.maxUploadBytes);
  const oidc = applyOidcRuntimeOverrides(
    referenceAdapter?.oidc ?? profileConfig.identity.oidc,
    runtimeConfig,
  );
  const magicLink = applyMagicLinkRuntimeOverrides(
    identityMagicLink(profileConfig.identity),
    runtimeConfig,
  );
  const hasReferenceRuntimeOverride =
    runtimeConfig.formspecServerUrl ||
    runtimeConfig.responseActionLedgerCapabilityUrl ||
    runtimeConfig.magicLinkCallbackPath ||
    runtimeConfig.oidcIssuer ||
    runtimeConfig.oidcClientId ||
    runtimeConfig.oidcRedirectUri || runtimeConfig.oidcScope || runtimeConfig.oidcSilentRedirectUri
    || runtimeConfig.oidcPostLogoutRedirectUri || runtimeConfig.oidcAcrValues || runtimeConfig.oidcResource || runtimeConfig.oidcMinAssurance !== undefined || runtimeConfig.oidcAcrAssuranceMapJson !== undefined
    || runtimeConfig.surfaceBundle
    || maxUploadBytes !== undefined
    || nativePackageSigning !== undefined;

  const formspecStack =
    referenceAdapter || hasReferenceRuntimeOverride
      ? {
          ...referenceAdapter,
          ...(nativePackageSigning ? { nativePackageSigning } : {}),
          attachments: maxUploadBytes === undefined ? referenceAdapter?.attachments : { maxUploadBytes },
          formspecServerUrl: runtimeConfig.formspecServerUrl ?? referenceAdapter?.formspecServerUrl,
          responseActionLedgerCapabilityUrl:
            runtimeConfig.responseActionLedgerCapabilityUrl
            ?? referenceAdapter?.responseActionLedgerCapabilityUrl,
          oidc,
          magicLinkCallbackPath:
            runtimeConfig.magicLinkCallbackPath ?? referenceAdapter?.magicLinkCallbackPath,
          surfaceBundle:
            runtimeConfig.surfaceBundle ?? referenceAdapter?.surfaceBundle,
        }
      : undefined;

  const scopeKey = runtimeConfig.scopeKey === undefined ? profileConfig.scopeKey : parseScopeKey(runtimeConfig.scopeKey);
  if (formspecStack?.formspecServerUrl && scopeKey === undefined) {
    throw new Error('A backend-connected deployment requires an explicit scopeKey from config-check');
  }
  return {
    ...profileConfig,
    scopeKey,
    identity: applyIdentityRuntimeOverrides(profileConfig.identity, oidc, magicLink),
    ports: portsForRuntime(profileConfig.ports, formspecStack?.formspecServerUrl),
    referenceAdapters: formspecStack
      ? {
          ...profileConfig.referenceAdapters,
          formspecStack,
        }
      : profileConfig.referenceAdapters,
  };
}

function portsForRuntime(
  ports: FormspecWebConfig['ports'],
  formspecServerUrl: string | undefined,
): FormspecWebConfig['ports'] {
  if (!formspecServerUrl) {
    return ports;
  }
  return {
    ...ports,
    definitionSource: 'reference-http',
    draftStore: 'reference-http',
    submitTransport: 'reference-http',
  };
}

function applyIdentityRuntimeOverrides(
  identity: IdentityPolicyConfig,
  oidc: OidcClientConfig | undefined,
  magicLink: MagicLinkConfig | undefined,
): IdentityPolicyConfig {
  if (identity.mode === 'oidc-required') {
    return {
      ...identity,
      oidc: oidc ?? identity.oidc,
    };
  }

  return {
    ...identity,
    oidc: oidc ?? identity.oidc,
    magicLink: magicLink ?? identity.magicLink,
  };
}

function applyOidcRuntimeOverrides(
  oidc: OidcClientConfig | undefined,
  runtimeConfig: RuntimeConfig,
): OidcClientConfig | undefined {
  if (!runtimeConfig.oidcIssuer && !runtimeConfig.oidcClientId && !runtimeConfig.oidcRedirectUri && !runtimeConfig.oidcScope && !runtimeConfig.oidcSilentRedirectUri
    && !runtimeConfig.oidcPostLogoutRedirectUri && !runtimeConfig.oidcAcrValues && !runtimeConfig.oidcResource && runtimeConfig.oidcMinAssurance === undefined && runtimeConfig.oidcAcrAssuranceMapJson === undefined) {
    return oidc;
  }

  return {
    ...oidc,
    issuer: runtimeConfig.oidcIssuer ?? oidc?.issuer ?? '',
    clientId: runtimeConfig.oidcClientId ?? oidc?.clientId ?? '',
    redirectUri: runtimeConfig.oidcRedirectUri ?? oidc?.redirectUri,
    scope: runtimeConfig.oidcScope ?? oidc?.scope,
    silentRedirectUri: runtimeConfig.oidcSilentRedirectUri ?? oidc?.silentRedirectUri,
    postLogoutRedirectUri: runtimeConfig.oidcPostLogoutRedirectUri ?? oidc?.postLogoutRedirectUri,
    acrValues: runtimeConfig.oidcAcrValues ?? oidc?.acrValues,
    resource: runtimeConfig.oidcResource ?? oidc?.resource,
    minAssurance: runtimeConfig.oidcMinAssurance === undefined ? oidc?.minAssurance ?? 'L2' : assurance(runtimeConfig.oidcMinAssurance),
    ...(runtimeConfig.oidcAcrAssuranceMapJson === undefined ? {} : { acrAssuranceMap: acrMap(runtimeConfig.oidcAcrAssuranceMapJson) }),
  };
}

function applyMagicLinkRuntimeOverrides(
  magicLink: MagicLinkConfig | undefined,
  runtimeConfig: RuntimeConfig,
): MagicLinkConfig | undefined {
  if (!runtimeConfig.magicLinkCallbackPath) {
    return magicLink;
  }

  return {
    callbackPath: runtimeConfig.magicLinkCallbackPath,
    minAssurance: magicLink?.minAssurance ?? 'L2',
  };
}

function identityMagicLink(identity: IdentityPolicyConfig): MagicLinkConfig | undefined {
  return identity.mode === 'anonymous-allowed' ? identity.magicLink : undefined;
}

function compactRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  validatedAttachmentMaxUploadBytes(config.attachmentMaxUploadBytes);
  const nativePackageSigning = readNativePackageSigningConfig(config);
  return Object.fromEntries(
    Object.entries(config).filter(([key, value]) => (
      // A present scope key is kept whatever its type, so a malformed one fails resolution instead of falling back.
      key === 'nativePackageSigning' ? nativePackageSigning !== undefined : key === 'attachmentMaxUploadBytes' || key === 'scopeKey' ? value !== undefined : key === 'surfaceBundle'
        ? typeof value === 'object' && value !== null
        : typeof value === 'string' && value.length > 0
    )).map(([key, value]) => [key, key === 'nativePackageSigning' ? nativePackageSigning : value]),
  ) as RuntimeConfig;
}

function firstPresent(env: RuntimeEnvRecord, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function assurance(value: unknown): AssuranceLevel {
  if (value !== 'L1' && value !== 'L2' && value !== 'L3' && value !== 'L4') {
    throw new TypeError('OIDC minimum and ACR mappings must use Formspec L1-L4');
  }
  return value;
}

function acrMap(value: string): Record<string, AssuranceLevel> {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    throw new TypeError('OIDC ACR mapping must be a nonempty JSON object');
  }
  return Object.fromEntries(Object.entries(parsed).map(([acr, level]) => {
    if (!acr || acr !== acr.trim()) throw new TypeError('OIDC ACR mapping keys must be exact nonblank strings');
    return [acr, assurance(level)];
  }));
}
