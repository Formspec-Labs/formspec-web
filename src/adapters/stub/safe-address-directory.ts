import { markDemoStubAdapter } from '../../policy/sentinel.ts';
import type {
  SafeAddressDirectory,
  SafeAddressJurisdiction,
  SafeAddressValidationRequest,
  SafeAddressValidationResult,
} from '../../ports/safe-address-directory.ts';

export interface StubSafeAddressEntry extends SafeAddressJurisdiction {
  readonly substitutes: readonly string[];
}

const DEFAULT_ENTRIES: readonly StubSafeAddressEntry[] = [
  {
    jurisdictionKey: 'CA-ACP',
    label: 'California Safe at Home',
    accessClass: 'safe-address',
    substitutes: ['PO Box 846, Sacramento, CA 95812'],
  },
  {
    jurisdictionKey: 'WA-ACP',
    label: 'Washington Address Confidentiality Program',
    accessClass: 'safe-address',
    substitutes: ['PO Box 257, Olympia, WA 98507'],
  },
  {
    jurisdictionKey: 'USMS-WitSec',
    label: 'USMS Witness Security',
    accessClass: 'safe-address',
    substitutes: ['Protected federal substitute address'],
  },
];

export function stubSafeAddressDirectory(
  entries: readonly StubSafeAddressEntry[] = DEFAULT_ENTRIES,
): SafeAddressDirectory {
  const byJurisdiction = new Map(entries.map((entry) => [entry.jurisdictionKey, entry]));
  const adapter: SafeAddressDirectory = {
    async supportedJurisdictions() {
      return entries.map(({ jurisdictionKey, label, accessClass }) => ({
        jurisdictionKey,
        label,
        accessClass,
      }));
    },
    async validateSubstituteAddress(
      request: SafeAddressValidationRequest,
    ): Promise<SafeAddressValidationResult> {
      const entry = byJurisdiction.get(request.jurisdictionKey);
      if (!entry) {
        return {
          valid: false,
          jurisdictionKey: request.jurisdictionKey,
          reason: 'unknown-jurisdiction',
          message: 'This protection program is not configured for this site.',
        };
      }
      if (request.accessClass && request.accessClass !== entry.accessClass) {
        return {
          valid: false,
          jurisdictionKey: request.jurisdictionKey,
          reason: 'unsupported-class',
          message: 'This protection program does not validate that protected field class.',
        };
      }
      const normalizedCandidate = normalize(request.candidate);
      const match = entry.substitutes.find(
        (substitute) => normalize(substitute) === normalizedCandidate,
      );
      if (!match) {
        return {
          valid: false,
          jurisdictionKey: request.jurisdictionKey,
          reason: 'not-recognized',
          message: 'This is not a recognized substitute address for the selected program.',
        };
      }
      return {
        valid: true,
        jurisdictionKey: request.jurisdictionKey,
        normalizedSubstitute: match,
      };
    },
  };
  markDemoStubAdapter(adapter, {
    featureKey: 'safeAddress',
    reason: 'in-memory safe-address directory; demo only',
  });
  return adapter;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
