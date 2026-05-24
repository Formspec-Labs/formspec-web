import { describe, expect, it } from 'vitest';
import {
  LOCALE_CONDITIONAL_FEATURE_KEYS,
  RUNTIME_FEATURE_KEYS,
  isLocaleConditionalFeatureKey,
  isRuntimeFeatureKey,
  type RuntimeFeatureKey,
} from './feature-keys.ts';

describe('RUNTIME_FEATURE_KEYS', () => {
  it('extends the seeded pair with documentPresentation (FW-0056 slice 1; append-only)', () => {
    // Append-only: FW-0056 adds documentPresentation at the tail per the
    // file-level comment. Re-sorting alphabetically would silently change
    // the resolver-loop iteration order; new feature ADRs append.
    expect([...RUNTIME_FEATURE_KEYS]).toEqual([
      'respondentPlace',
      'status',
      'documentPresentation',
    ]);
  });

  it('isRuntimeFeatureKey narrows arbitrary strings', () => {
    const candidate: string = 'status';
    expect(isRuntimeFeatureKey(candidate)).toBe(true);
    expect(isRuntimeFeatureKey('documentPresentation')).toBe(true);
    expect(isRuntimeFeatureKey('payment')).toBe(false);
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
  });
});
