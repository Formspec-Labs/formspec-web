import { describe, expect, it } from 'vitest';
import {
  renderSafeAddressProtectedText,
  safeAddressVerifierLine,
  validateSafeAddressResponseData,
} from './safe-address.ts';
import type { SafeAddressDirectory } from '../ports/safe-address-directory.ts';

describe('safe-address render helpers', () => {
  it('masks safe-* lifecycle text while leaving unclassified text visible', () => {
    expect(renderSafeAddressProtectedText(
      { text: '123 Private St', accessClass: 'safe-address' },
      'value withheld',
    )).toBe('value withheld');
    expect(renderSafeAddressProtectedText(
      { text: 'ordinary note' },
      'value withheld',
    )).toBe('ordinary note');
  });

  it('renders verifier-grade and phase-1 fallback copy distinctly', () => {
    expect(safeAddressVerifierLine({ label: 'Protected address', proofPresent: true }))
      .toBe('Protected address: protected value withheld; commitment proof verified.');
    expect(safeAddressVerifierLine({
      label: 'Protected address',
      proofPresent: false,
      fallbackStructuralTell: true,
    })).toBe(
      'Protected address: protected value omitted; this receipt uses the structural-tell fallback.',
    );
  });

  it('validates safe-address response values against accepted jurisdictions', async () => {
    await expect(validateSafeAddressResponseData({
      directory: testSafeAddressDirectory(),
      data: { protectedHomeAddress: 'PO Box 846, Sacramento, CA 95812' },
      config: {
        enabledClasses: ['safe-address'],
        receiptPostureTier: 'phase-1-fallback',
        substituteAddressDirectoryRef: 'composition:safeAddressDirectory',
        acpJurisdictionsAccepted: ['CA-ACP'],
        authorizedAudiences: ['issuer_verification'],
        fields: [
          {
            path: '/protectedHomeAddress',
            label: 'Protected home address',
            accessClass: 'safe-address',
          },
        ],
      },
    })).resolves.toBeUndefined();
  });

  it('rejects safe-address response values that no accepted jurisdiction recognizes', async () => {
    await expect(validateSafeAddressResponseData({
      directory: testSafeAddressDirectory(),
      data: { protectedHomeAddress: '123 Private St' },
      config: {
        enabledClasses: ['safe-address'],
        receiptPostureTier: 'phase-1-fallback',
        substituteAddressDirectoryRef: 'composition:safeAddressDirectory',
        acpJurisdictionsAccepted: ['CA-ACP'],
        authorizedAudiences: ['issuer_verification'],
        fields: [
          {
            path: '/protectedHomeAddress',
            label: 'Protected home address',
            accessClass: 'safe-address',
          },
        ],
      },
    })).rejects.toThrow(/Protected home address: This is not a recognized substitute address/);
  });
});

function testSafeAddressDirectory(): SafeAddressDirectory {
  return {
    async supportedJurisdictions() {
      return [
        {
          jurisdictionKey: 'CA-ACP',
          label: 'California Safe at Home',
          accessClass: 'safe-address',
        },
      ];
    },
    async validateSubstituteAddress(request) {
      if (
        request.jurisdictionKey === 'CA-ACP' &&
        request.accessClass === 'safe-address' &&
        request.candidate === 'PO Box 846, Sacramento, CA 95812'
      ) {
        return {
          valid: true,
          jurisdictionKey: request.jurisdictionKey,
          normalizedSubstitute: request.candidate,
        };
      }
      return {
        valid: false,
        jurisdictionKey: request.jurisdictionKey,
        reason: 'not-recognized',
        message: 'This is not a recognized substitute address for the selected program.',
      };
    },
  };
}
