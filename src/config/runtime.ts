import { getReferenceProfile } from '../profiles/profiles.ts';
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
  oidcIssuer: ['FORMSPEC_WEB_OIDC_ISSUER', 'VITE_FORMSPEC_WEB_OIDC_ISSUER'],
  oidcClientId: ['FORMSPEC_WEB_OIDC_CLIENT_ID', 'VITE_FORMSPEC_WEB_OIDC_CLIENT_ID'],
  oidcRedirectUri: ['FORMSPEC_WEB_OIDC_REDIRECT_URI', 'VITE_FORMSPEC_WEB_OIDC_REDIRECT_URI'],
  magicLinkCallbackPath: [
    'FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH',
    'VITE_FORMSPEC_WEB_MAGIC_LINK_CALLBACK_PATH',
  ],
} as const satisfies Record<keyof RuntimeConfig, readonly string[]>;

export function readRuntimeConfig(): RuntimeConfig {
  const viteConfig = runtimeConfigFromEnvRecord(import.meta.env);
  const windowConfig =
    typeof window === 'undefined' ? undefined : window.__FORMSPEC_RUNTIME_CONFIG__;

  return compactRuntimeConfig({
    ...viteConfig,
    ...windowConfig,
  });
}

export function runtimeConfigFromEnvRecord(env: RuntimeEnvRecord): RuntimeConfig {
  const config: RuntimeConfig = {};
  for (const [runtimeKey, envNames] of Object.entries(runtimeEnvMap) as Array<
    [keyof RuntimeConfig, readonly string[]]
  >) {
    const value = firstPresent(env, envNames);
    if (value) {
      config[runtimeKey] = value;
    }
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
    runtimeConfig.magicLinkCallbackPath ||
    runtimeConfig.oidcIssuer ||
    runtimeConfig.oidcClientId ||
    runtimeConfig.oidcRedirectUri;

  const formspecStack =
    referenceAdapter || hasReferenceRuntimeOverride
      ? {
          ...referenceAdapter,
          tenantHeaderDialect: referenceAdapter?.tenantHeaderDialect ?? 'formspec',
          formspecServerUrl: runtimeConfig.formspecServerUrl ?? referenceAdapter?.formspecServerUrl,
          oidc,
          magicLinkCallbackPath:
            runtimeConfig.magicLinkCallbackPath ?? referenceAdapter?.magicLinkCallbackPath,
        }
      : undefined;

  return {
    ...profileConfig,
    identity: applyIdentityRuntimeOverrides(profileConfig.identity, oidc, magicLink),
    referenceAdapters: formspecStack
      ? {
          ...profileConfig.referenceAdapters,
          formspecStack,
        }
      : profileConfig.referenceAdapters,
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
  if (!runtimeConfig.oidcIssuer && !runtimeConfig.oidcClientId && !runtimeConfig.oidcRedirectUri) {
    return oidc;
  }

  return {
    issuer: runtimeConfig.oidcIssuer ?? oidc?.issuer ?? '',
    clientId: runtimeConfig.oidcClientId ?? oidc?.clientId ?? '',
    redirectUri: runtimeConfig.oidcRedirectUri ?? oidc?.redirectUri,
    minAssurance: oidc?.minAssurance ?? 'L2',
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
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => typeof value === 'string' && value.length > 0),
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
