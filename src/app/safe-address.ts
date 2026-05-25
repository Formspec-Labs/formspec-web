import type { LifecycleProtectedText } from '../ports/lifecycle-action-client.ts';

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
