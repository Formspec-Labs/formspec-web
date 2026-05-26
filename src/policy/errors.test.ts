import { describe, expect, it } from 'vitest';
import {
  FeaturePolicyConflictError,
  HiddenDefinitionRuntimeStateError,
  InvalidRuntimePolicyError,
  OrgPolicyUnsatisfiedError,
  RuntimePolicyError,
  UnsupportedRequiredFeatureError,
  isRuntimePolicyError,
} from './errors.ts';

describe('typed configuration errors (ADR-0011 §Failure Semantics)', () => {
  it('UnsupportedRequiredFeatureError carries featureKey + code', () => {
    const err = new UnsupportedRequiredFeatureError('status', 'instance has no StatusReader');
    expect(err).toBeInstanceOf(RuntimePolicyError);
    expect(err.code).toBe('UnsupportedRequiredFeature');
    expect(err.featureKey).toBe('status');
    expect(err.message).toContain('status');
    expect(err.message).toContain('instance has no StatusReader');
  });

  it('FeaturePolicyConflictError carries org + form mode pair', () => {
    const err = new FeaturePolicyConflictError('status', 'org-required-form-forbidden');
    expect(err.code).toBe('FeaturePolicyConflict');
    expect(err.conflict).toBe('org-required-form-forbidden');
  });

  it('OrgPolicyUnsatisfiedError fires when org requires what the instance cannot do', () => {
    const err = new OrgPolicyUnsatisfiedError('respondentPlace', 'no wallet adapter wired');
    expect(err.code).toBe('OrgPolicyUnsatisfied');
  });

  it('InvalidRuntimePolicyError fires when the input documents are malformed', () => {
    const err = new InvalidRuntimePolicyError('form', 'unknown feature key "payment"');
    expect(err.code).toBe('InvalidRuntimePolicy');
    expect(err.documentKind).toBe('form');
  });

  it('HiddenDefinitionRuntimeStateError carries the hidden Definition URL', () => {
    const err = new HiddenDefinitionRuntimeStateError('https://example.test/forms/internal');
    expect(err.code).toBe('HiddenDefinitionRuntimeState');
    expect(err.definitionUrl).toBe('https://example.test/forms/internal');
  });

  it('isRuntimePolicyError discriminates against ordinary Errors', () => {
    expect(isRuntimePolicyError(new Error('boom'))).toBe(false);
    expect(isRuntimePolicyError(new UnsupportedRequiredFeatureError('status', 'x'))).toBe(true);
  });
});
