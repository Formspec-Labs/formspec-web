import { describe, expect, it } from 'vitest';
import {
  isOrgFeaturePolicyMode,
  isFormFeaturePolicyMode,
  isCapabilityAvailability,
  type ResolvedRuntimeProfile,
} from './policy-shapes.ts';

describe('policy-shapes guards', () => {
  it('isOrgFeaturePolicyMode accepts the four ADR-0011 modes', () => {
    expect(isOrgFeaturePolicyMode('forbidden')).toBe(true);
    expect(isOrgFeaturePolicyMode('allowed')).toBe(true);
    expect(isOrgFeaturePolicyMode('default-on')).toBe(true);
    expect(isOrgFeaturePolicyMode('required')).toBe(true);
    expect(isOrgFeaturePolicyMode('optional')).toBe(false);
  });

  it('isFormFeaturePolicyMode accepts the three ADR-0011 modes', () => {
    expect(isFormFeaturePolicyMode('forbidden')).toBe(true);
    expect(isFormFeaturePolicyMode('optional')).toBe(true);
    expect(isFormFeaturePolicyMode('required')).toBe(true);
    expect(isFormFeaturePolicyMode('allowed')).toBe(false);
  });

  it('isCapabilityAvailability accepts available, demo-stub, unavailable', () => {
    expect(isCapabilityAvailability('available')).toBe(true);
    expect(isCapabilityAvailability('demo-stub')).toBe(true);
    expect(isCapabilityAvailability('unavailable')).toBe(true);
    expect(isCapabilityAvailability('partial')).toBe(false);
  });

  it('ResolvedRuntimeProfile is structurally immutable', () => {
    const profile: ResolvedRuntimeProfile = {
      mode: 'production',
      enabled: new Set(['status']),
      disabled: new Map([
        [
          'respondentPlace',
          {
            cause: 'instance-unavailable',
            message: 'respondent-place adapter is unavailable',
          },
        ],
      ]),
      limits: { status: { retentionDays: 30 } },
    };
    expect(profile.enabled.has('status')).toBe(true);
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('instance-unavailable');
  });
});
