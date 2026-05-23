import { describe, expect, it } from 'vitest';
import {
  FeaturePolicyConflictError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  UnsupportedRequiredFeatureError,
} from './errors.ts';
import { resolveRuntimeFeatures } from './resolver.ts';

const baseInstance = { respondentPlace: 'available', status: 'available' } as const;
const emptyOrg = { features: {} } as const;

describe('resolveRuntimeFeatures — ADR-0011 §Failure Semantics', () => {
  it('throws UnsupportedRequiredFeatureError when form requires what instance cannot do', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: { ...baseInstance, status: 'unavailable' },
        org: emptyOrg,
        form: { features: { status: 'required' } },
      }),
    ).toThrow(UnsupportedRequiredFeatureError);
  });

  it('throws OrgPolicyUnsatisfiedError when org requires what instance cannot do', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: { ...baseInstance, respondentPlace: 'unavailable' },
        org: { features: { respondentPlace: 'required' } },
        form: { features: {} },
      }),
    ).toThrow(OrgPolicyUnsatisfiedError);
  });

  it('throws FeaturePolicyConflictError when form forbids what org requires', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: baseInstance,
        org: { features: { status: 'required' } },
        form: { features: { status: 'forbidden' } },
      }),
    ).toThrow(FeaturePolicyConflictError);
  });

  it('throws FeaturePolicyConflictError when form requires what org forbids', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: baseInstance,
        org: { features: { status: 'forbidden' } },
        form: { features: { status: 'required' } },
      }),
    ).toThrow(FeaturePolicyConflictError);
  });

  it('rejects a demo-stub capability for a production-mode required feature', () => {
    const err = (() => {
      try {
        resolveRuntimeFeatures({
          mode: 'production',
          instance: { ...baseInstance, status: 'demo-stub' },
          org: emptyOrg,
          form: { features: { status: 'required' } },
        });
        return null;
      } catch (caught) {
        return caught;
      }
    })();
    expect(err).toBeInstanceOf(UnsupportedRequiredFeatureError);
  });

  it('accepts a demo-stub capability for a demo-mode required feature', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'demo',
      instance: { respondentPlace: 'demo-stub', status: 'demo-stub' },
      org: emptyOrg,
      form: { features: { status: 'required' } },
    });
    expect(profile.enabled.has('status')).toBe(true);
  });

  it('disables an optional form feature with cause "optional-no-instance"', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: { ...baseInstance, respondentPlace: 'unavailable' },
      org: { features: { respondentPlace: 'allowed' } },
      form: { features: { respondentPlace: 'optional' } },
    });
    expect(profile.enabled.has('respondentPlace')).toBe(false);
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('optional-no-instance');
  });

  it('disables a default-on feature when instance cannot, unless required', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: { ...baseInstance, respondentPlace: 'unavailable' },
      org: { features: { respondentPlace: 'default-on' } },
      form: { features: {} },
    });
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('default-on-no-instance');
  });

  it('throws InvalidRuntimePolicyError on unknown feature key in form policy', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: baseInstance,
        org: emptyOrg,
        form: { features: { payment: 'required' } as never },
      }),
    ).toThrow(InvalidRuntimePolicyError);
  });

  it('throws InvalidRuntimePolicyError on unknown instance capability state', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: { respondentPlace: 'partial' as never, status: 'available' },
        org: emptyOrg,
        form: { features: {} },
      }),
    ).toThrow(InvalidRuntimePolicyError);
  });
});
