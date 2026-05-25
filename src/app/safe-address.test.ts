import { describe, expect, it } from 'vitest';
import {
  renderSafeAddressProtectedText,
  safeAddressVerifierLine,
} from './safe-address.ts';

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
});
