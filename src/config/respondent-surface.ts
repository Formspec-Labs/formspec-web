import type {
  FormspecWebConfig,
  RespondentSurfaceBundleConfig,
} from './types.ts';

export function respondentSurfaceBundleConfig(
  config: FormspecWebConfig,
): RespondentSurfaceBundleConfig | undefined {
  const candidate = config.referenceAdapters?.formspecStack?.surfaceBundle;
  return isRespondentSurfaceBundleConfig(candidate) ? candidate : undefined;
}

/**
 * Activation gate for the lazy signed-app root.
 *
 * A locator-only acquisition object is deliberately false. The respondent
 * path also requires the real HTTP form/draft/submit cohort.
 */
export function respondentSurfaceDeploymentIsConfigured(
  config: FormspecWebConfig,
): boolean {
  return (
    config.profileName === 'publicPortal'
    && config.identity.mode === 'anonymous-allowed'
    && config.ports.identityProvider === 'anonymous'
    && respondentSurfaceBundleConfig(config) !== undefined
    && typeof config.referenceAdapters?.formspecStack?.formspecServerUrl === 'string'
    && config.referenceAdapters.formspecStack.formspecServerUrl.length > 0
  );
}

export function isRespondentSurfaceBundleConfig(
  value: unknown,
): value is RespondentSurfaceBundleConfig {
  if (!isRecord(value)) return false;
  const verification = isRecord(value.verification) ? value.verification : undefined;
  const methodRegistry = isRecord(verification?.methodRegistry)
    ? verification.methodRegistry
    : undefined;
  return (
    typeof value.locator === 'string'
    && Array.isArray(value.allowedOrigins)
    && value.allowedOrigins.length > 0
    && value.allowedOrigins.every((entry) => typeof entry === 'string')
    && Number.isSafeInteger(value.maxBytes)
    && Number(value.maxBytes) > 0
    && Number.isSafeInteger(value.timeoutMs)
    && Number(value.timeoutMs) > 0
    && (value.redirectPolicy === 'refuse' || value.redirectPolicy === 'same-origin')
    && typeof value.starterModuleId === 'string'
    && value.starterModuleId.length > 0
    && isAbsoluteHttpUrl(value.receiptResourceUrl)
    && typeof verification?.expectedAppId === 'string'
    && isAbsoluteUrl(verification.expectedAppId)
    && Array.isArray(methodRegistry?.entries)
    && methodRegistry.entries.length > 0
    && typeof methodRegistry.version === 'string'
    && Array.isArray(verification.keys)
    && verification.keys.length > 0
    && verification.keys.every(isSurfaceBundleKeyConfig)
    && Array.isArray(verification.authorities)
    && verification.authorities.length > 0
    && Array.isArray(verification.pinnedReleases)
    && verification.pinnedReleases.length > 0
  );
}

function isSurfaceBundleKeyConfig(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.kid === 'string'
    && /^[A-Za-z0-9_-]+$/u.test(value.kid)
    && typeof value.publicKey === 'string'
    && /^[A-Za-z0-9_-]{43}$/u.test(value.publicKey)
  );
}

function isAbsoluteUrl(value: string): boolean {
  try {
    return new URL(value).href === value;
  } catch {
    return false;
  }
}

function isAbsoluteHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      && parsed.href === value;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
