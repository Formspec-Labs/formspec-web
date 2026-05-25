import { describe, expect, it } from 'vitest';
import {
  LOCALE_CONDITIONAL_FEATURE_KEYS,
  RUNTIME_FEATURE_KEYS,
  isLocaleConditionalFeatureKey,
  isRuntimeFeatureKey,
  type RuntimeFeatureKey,
} from './feature-keys.ts';

describe('RUNTIME_FEATURE_KEYS', () => {
  it('extends the seeded pair through the 2026-05-25 namespace preallocation (append-only)', () => {
    // Append-only: FW-0056 adds documentPresentation at the tail; FW-0033
    // adds fileUpload after it; FW-0057 adds crossIssuerHistory after that;
    // FW-0044 adds offlineSubmit (sixth key); FW-0027 adds payment (seventh
    // key); FW-0040 adds embed (eighth key); FW-0046 adds screener (ninth
    // key). The 2026-05-25 dispatch preallocates positions 10-15 before
    // Wave A. Re-sorting alphabetically would silently change the
    // resolver-loop iteration order; new feature ADRs append.
    expect([...RUNTIME_FEATURE_KEYS]).toEqual([
      'respondentPlace',
      'status',
      'documentPresentation',
      'fileUpload',
      'crossIssuerHistory',
      'offlineSubmit',
      'payment',
      'embed',
      'screener',
      'trustedReviewer',
      'bringYourOwnAssistant',
      'safeAddress',
      'duressAware',
      'multiParty',
      'recordLifecycle',
    ]);
  });

  it('isRuntimeFeatureKey narrows arbitrary strings', () => {
    const candidate: string = 'status';
    expect(isRuntimeFeatureKey(candidate)).toBe(true);
    expect(isRuntimeFeatureKey('documentPresentation')).toBe(true);
    expect(isRuntimeFeatureKey('fileUpload')).toBe(true);
    expect(isRuntimeFeatureKey('crossIssuerHistory')).toBe(true);
    expect(isRuntimeFeatureKey('offlineSubmit')).toBe(true);
    expect(isRuntimeFeatureKey('payment')).toBe(true);
    expect(isRuntimeFeatureKey('embed')).toBe(true);
    expect(isRuntimeFeatureKey('screener')).toBe(true);
    expect(isRuntimeFeatureKey('trustedReviewer')).toBe(true);
    expect(isRuntimeFeatureKey('bringYourOwnAssistant')).toBe(true);
    expect(isRuntimeFeatureKey('safeAddress')).toBe(true);
    expect(isRuntimeFeatureKey('duressAware')).toBe(true);
    expect(isRuntimeFeatureKey('multiParty')).toBe(true);
    expect(isRuntimeFeatureKey('recordLifecycle')).toBe(true);
    expect(isRuntimeFeatureKey('fictional')).toBe(false);
  });

  it('type RuntimeFeatureKey is the union of the seeded keys', () => {
    const k: RuntimeFeatureKey = 'respondentPlace';
    expect(k).toBe('respondentPlace');
  });

  it('no feature key is locale-conditional today (ADR-0011 §Resolution recompute trigger)', () => {
    expect(LOCALE_CONDITIONAL_FEATURE_KEYS.size).toBe(0);
    expect(isLocaleConditionalFeatureKey('status')).toBe(false);
    expect(isLocaleConditionalFeatureKey('respondentPlace')).toBe(false);
    expect(isLocaleConditionalFeatureKey('documentPresentation')).toBe(false);
    expect(isLocaleConditionalFeatureKey('fileUpload')).toBe(false);
    expect(isLocaleConditionalFeatureKey('crossIssuerHistory')).toBe(false);
    expect(isLocaleConditionalFeatureKey('offlineSubmit')).toBe(false);
    expect(isLocaleConditionalFeatureKey('payment')).toBe(false);
    expect(isLocaleConditionalFeatureKey('embed')).toBe(false);
    expect(isLocaleConditionalFeatureKey('screener')).toBe(false);
    expect(isLocaleConditionalFeatureKey('trustedReviewer')).toBe(false);
    expect(isLocaleConditionalFeatureKey('bringYourOwnAssistant')).toBe(false);
    expect(isLocaleConditionalFeatureKey('safeAddress')).toBe(false);
    expect(isLocaleConditionalFeatureKey('duressAware')).toBe(false);
    expect(isLocaleConditionalFeatureKey('multiParty')).toBe(false);
    expect(isLocaleConditionalFeatureKey('recordLifecycle')).toBe(false);
  });
});
