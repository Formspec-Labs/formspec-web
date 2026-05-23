import { describe, expect, it } from 'vitest';
import {
  isDemoStubAdapter,
  isUnavailableAdapter,
  markDemoStubAdapter,
  markUnavailableAdapter,
} from './sentinel.ts';

describe('adapter provenance markers (ADR-0011 §Instance capabilities)', () => {
  it('isUnavailableAdapter returns false for plain objects, functions, primitives', () => {
    expect(isUnavailableAdapter({})).toBe(false);
    expect(isUnavailableAdapter(() => undefined)).toBe(false);
    expect(isUnavailableAdapter(null)).toBe(false);
    expect(isUnavailableAdapter(undefined)).toBe(false);
    expect(isUnavailableAdapter('available')).toBe(false);
  });

  it('markUnavailableAdapter tags the adapter without changing its shape', () => {
    const adapter = {
      readPlace: async () => {
        throw new Error('nope');
      },
    };
    const marked = markUnavailableAdapter(adapter, {
      featureKey: 'respondentPlace',
      reason: 'no wallet adapter configured',
    });
    expect(marked).toBe(adapter);
    expect(isUnavailableAdapter(marked)).toBe(true);
    expect(typeof marked.readPlace).toBe('function');
  });

  it('isDemoStubAdapter returns false for unmarked adapters', () => {
    expect(isDemoStubAdapter({})).toBe(false);
    expect(isDemoStubAdapter(null)).toBe(false);
  });

  it('markDemoStubAdapter tags the adapter without changing its shape', () => {
    const adapter = { readStatus: async () => ({}) as never };
    const marked = markDemoStubAdapter(adapter, {
      featureKey: 'status',
      reason: 'demo composition only',
    });
    expect(marked).toBe(adapter);
    expect(isDemoStubAdapter(marked)).toBe(true);
  });

  it('unavailable and demo-stub markers are mutually exclusive in practice — guard test catches accidental double-mark', () => {
    const adapter = { call: async () => undefined };
    markDemoStubAdapter(adapter, { featureKey: 'status', reason: 'demo' });
    expect(() =>
      markUnavailableAdapter(adapter, { featureKey: 'status', reason: 'should fail' }),
    ).toThrow(/already marked/);
  });
});
