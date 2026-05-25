import { markUnavailableAdapter } from '../../policy/sentinel.ts';
import type { SafeAddressDirectory } from '../../ports/safe-address-directory.ts';

export function unavailableSafeAddressDirectory(
  message = 'Safe address directory is not configured for this deployment.',
): SafeAddressDirectory {
  const adapter: SafeAddressDirectory = {
    async supportedJurisdictions() {
      throw new Error(message);
    },
    async validateSubstituteAddress() {
      throw new Error(message);
    },
  };
  return markUnavailableAdapter(adapter, {
    featureKey: 'safeAddress',
    reason: message,
  });
}
