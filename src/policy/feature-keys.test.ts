import { describe, expect, it } from 'vitest';
import {
  LOCALE_CONDITIONAL_FEATURE_KEYS,
  RUNTIME_FEATURE_KEYS,
  isLocaleConditionalFeatureKey,
  isRuntimeFeatureKey,
  type RuntimeFeatureKey,
} from './feature-keys.ts';

describe('RUNTIME_FEATURE_KEYS', () => {
  it('seeds with respondentPlace and status only (per ADR-0011 Follow-on Work)', () => {
    expect([...RUNTIME_FEATURE_KEYS]).toEqual(['respondentPlace', 'status']);
  });

  it('isRuntimeFeatureKey narrows arbitrary strings', () => {
    const candidate: string = 'status';
    expect(isRuntimeFeatureKey(candidate)).toBe(true);
    expect(isRuntimeFeatureKey('payment')).toBe(false);
  });

  it('type RuntimeFeatureKey is the union of the seeded keys', () => {
    const k: RuntimeFeatureKey = 'respondentPlace';
    expect(k).toBe('respondentPlace');
  });

  it('no seeded feature key is locale-conditional today (ADR-0011 §Resolution recompute trigger)', () => {
    expect(LOCALE_CONDITIONAL_FEATURE_KEYS.size).toBe(0);
    expect(isLocaleConditionalFeatureKey('status')).toBe(false);
    expect(isLocaleConditionalFeatureKey('respondentPlace')).toBe(false);
  });
});
