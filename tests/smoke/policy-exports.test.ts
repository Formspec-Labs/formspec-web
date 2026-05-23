import { describe, expect, it } from 'vitest';

describe('policy package exports', () => {
  it('re-exports the full resolver surface from src/policy', async () => {
    const mod = await import('../../src/policy/index.ts');
    expect(typeof mod.resolveRuntimeFeatures).toBe('function');
    expect(typeof mod.isRuntimePolicyError).toBe('function');
    expect(typeof mod.markUnavailableAdapter).toBe('function');
    expect(typeof mod.isUnavailableAdapter).toBe('function');
    expect(typeof mod.markDemoStubAdapter).toBe('function');
    expect(typeof mod.isDemoStubAdapter).toBe('function');
    expect(Array.isArray(mod.RUNTIME_FEATURE_KEYS)).toBe(true);
    expect(typeof mod.UnsupportedRequiredFeatureError).toBe('function');
    expect(typeof mod.FeaturePolicyConflictError).toBe('function');
    expect(typeof mod.OrgPolicyUnsatisfiedError).toBe('function');
    expect(typeof mod.InvalidRuntimePolicyError).toBe('function');
  });

  it('exposes the same surface through the package root for adopters', async () => {
    const root = await import('../../src/index.ts');
    expect(
      typeof (root as { resolveRuntimeFeatures?: unknown }).resolveRuntimeFeatures,
    ).toBe('function');
  });
});
