import type { LifecycleProtectedText } from '../ports/lifecycle-action-client.ts';
import type { SafeAddressDirectory } from '../ports/safe-address-directory.ts';
import type { SafeAddressFieldPolicy, SafeAddressRuntimeConfig } from '../policy/index.ts';

export function isSafeAccessClass(value: string | undefined): boolean {
  return value?.startsWith('safe-') === true;
}

export function renderSafeAddressProtectedText(
  value: LifecycleProtectedText,
  withheldCopy: string,
): string {
  return isSafeAccessClass(value.accessClass) ? withheldCopy : value.text;
}

export function safeAddressVerifierLine({
  label,
  proofPresent,
  fallbackStructuralTell,
}: {
  label: string;
  proofPresent: boolean;
  fallbackStructuralTell?: boolean;
}): string {
  if (proofPresent) {
    return `${label}: protected value withheld; commitment proof verified.`;
  }
  return fallbackStructuralTell
    ? `${label}: protected value omitted; this receipt uses the structural-tell fallback.`
    : `${label}: protected value withheld.`;
}

export async function validateSafeAddressResponseData({
  config,
  directory,
  data,
}: {
  config: SafeAddressRuntimeConfig;
  directory: SafeAddressDirectory;
  data: Record<string, unknown>;
}): Promise<void> {
  for (const field of config.fields) {
    const candidate = valueAtJsonPointer(data, field.path);
    if (candidate === undefined || candidate === null || candidate === '') {
      continue;
    }
    if (typeof candidate !== 'string') {
      throw new Error(`${safeAddressFieldLabel(field)} must be a substitute address string.`);
    }
    const validation = await validateAgainstAcceptedJurisdictions({
      directory,
      jurisdictions: config.acpJurisdictionsAccepted,
      candidate,
      field,
    });
    if (!validation.valid) {
      throw new Error(`${safeAddressFieldLabel(field)}: ${validation.message}`);
    }
  }
}

async function validateAgainstAcceptedJurisdictions({
  directory,
  jurisdictions,
  candidate,
  field,
}: {
  directory: SafeAddressDirectory;
  jurisdictions: readonly string[];
  candidate: string;
  field: SafeAddressFieldPolicy;
}): Promise<{ valid: true } | { valid: false; message: string }> {
  let lastMessage = 'This substitute address is not recognized by an accepted protection program.';
  for (const jurisdictionKey of jurisdictions) {
    const result = await directory.validateSubstituteAddress({
      jurisdictionKey,
      candidate,
      accessClass: field.accessClass,
    });
    if (result.valid) {
      return { valid: true };
    }
    lastMessage = result.message;
  }
  return { valid: false, message: lastMessage };
}

function safeAddressFieldLabel(field: SafeAddressFieldPolicy): string {
  return field.label ?? field.path;
}

function valueAtJsonPointer(source: Record<string, unknown>, pointer: string): unknown {
  const segments = pointer
    .replace(/^\//, '')
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = source;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) return undefined;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
