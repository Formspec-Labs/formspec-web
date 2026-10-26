/**
 * SafeAddressDirectory port - FW-0060 / FW-0049.
 *
 * Deployment-supplied validator for substitute-address regimes such as state
 * ACP programs or federal protection programs. The port validates a single
 * candidate address for a declared jurisdiction. It does not expose registry
 * contents in bulk, and it is not a masking or receipt-rendering port.
 */

import type { SafeAddressSubjectKind } from '../policy/policy-shapes.ts';

export interface SafeAddressJurisdiction {
  readonly jurisdictionKey: string;
  readonly label: string;
  readonly subjectKind: SafeAddressSubjectKind;
}

export interface SafeAddressValidationRequest {
  readonly jurisdictionKey: string;
  readonly candidate: string;
  readonly subjectKind?: SafeAddressSubjectKind;
}

export type SafeAddressValidationResult =
  | {
      readonly valid: true;
      readonly jurisdictionKey: string;
      readonly normalizedSubstitute: string;
    }
  | {
      readonly valid: false;
      readonly jurisdictionKey: string;
      readonly reason: 'unknown-jurisdiction' | 'not-recognized' | 'unsupported-subject-kind';
      readonly message: string;
    };

export interface SafeAddressDirectory {
  supportedJurisdictions(): Promise<readonly SafeAddressJurisdiction[]>;
  validateSubstituteAddress(
    request: SafeAddressValidationRequest,
  ): Promise<SafeAddressValidationResult>;
}
