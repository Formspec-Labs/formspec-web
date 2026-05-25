import { describe, expect, it } from 'vitest';
import {
  FeaturePolicyConflictError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  UnsupportedRequiredFeatureError,
} from './errors.ts';
import { resolveRuntimeFeatures } from './resolver.ts';

const baseInstance = {
  respondentPlace: 'available',
  status: 'available',
  // FW-0056: documentPresentation is a closed-taxonomy key; declare unavailable
  // here so the resolver's input validation passes for the failure-semantics
  // fixtures that don't otherwise care about the key.
  documentPresentation: 'unavailable',
  // FW-0033: fileUpload is the third closed-taxonomy extension; same
  // honest-unavailable posture for these fixtures.
  fileUpload: 'unavailable',
  // FW-0057: crossIssuerHistory is the fifth closed-taxonomy extension; same
  // honest-unavailable posture.
  crossIssuerHistory: 'unavailable',
  // FW-0044: offlineSubmit is the sixth closed-taxonomy extension; same
  // honest-unavailable posture.
  offlineSubmit: 'unavailable',
  // FW-0027: payment is the seventh closed-taxonomy extension; same
  // honest-unavailable posture for these fixtures.
  payment: 'unavailable',
  // FW-0040: embed is the eighth closed-taxonomy extension; same
  // honest-unavailable posture for these fixtures.
  embed: 'unavailable',
  // FW-0046: screener is the ninth closed-taxonomy extension; same
  // honest-unavailable posture for these fixtures.
  screener: 'unavailable',
  trustedReviewer: 'unavailable',
  bringYourOwnAssistant: 'unavailable',
  safeAddress: 'unavailable',
  duressAware: 'unavailable',
  multiParty: 'unavailable',
  recordLifecycle: 'unavailable',
} as const;
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
      instance: {
        respondentPlace: 'demo-stub',
        status: 'demo-stub',
        documentPresentation: 'unavailable',
        fileUpload: 'unavailable',
        crossIssuerHistory: 'unavailable',
        offlineSubmit: 'unavailable',
        payment: 'unavailable',
        embed: 'unavailable',
        screener: 'unavailable',
        trustedReviewer: 'unavailable',
        bringYourOwnAssistant: 'unavailable',
        safeAddress: 'unavailable',
        duressAware: 'unavailable',
        multiParty: 'unavailable',
        recordLifecycle: 'unavailable',
      },
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
        // FW-0027 closed `payment` as the seventh real key; use a fictional
        // key here so the unknown-key path remains exercised.
        form: { features: { fictional: 'required' } as never },
      }),
    ).toThrow(InvalidRuntimePolicyError);
  });

  it('throws InvalidRuntimePolicyError on unknown instance capability state', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: {
          respondentPlace: 'partial' as never,
          status: 'available',
          documentPresentation: 'unavailable',
          fileUpload: 'unavailable',
          crossIssuerHistory: 'unavailable',
          offlineSubmit: 'unavailable',
          payment: 'unavailable',
          embed: 'unavailable',
          screener: 'unavailable',
          trustedReviewer: 'unavailable',
          bringYourOwnAssistant: 'unavailable',
          safeAddress: 'unavailable',
          duressAware: 'unavailable',
          multiParty: 'unavailable',
          recordLifecycle: 'unavailable',
        },
        org: emptyOrg,
        form: { features: {} },
      }),
    ).toThrow(InvalidRuntimePolicyError);
  });
});
