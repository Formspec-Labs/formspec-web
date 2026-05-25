import { describe, expect, it } from 'vitest';
import { resolveRuntimeFeatures } from './resolver.ts';
import type {
  FormRuntimePolicy,
  InstanceCapabilities,
  OrgRuntimePolicy,
} from './policy-shapes.ts';

const allAvailable: InstanceCapabilities = {
  respondentPlace: 'available',
  status: 'available',
  // FW-0056 slice 1: declare documentPresentation so resolver validation
  // passes; the resolver-test cases don't gate against it.
  documentPresentation: 'available',
  // FW-0033 slice 1: declare fileUpload so resolver validation passes.
  fileUpload: 'available',
  // FW-0057 slice 1: declare crossIssuerHistory so resolver validation passes.
  crossIssuerHistory: 'available',
  // FW-0044 slice 1: declare offlineSubmit so resolver validation passes.
  offlineSubmit: 'available',
  // FW-0027 slice 1: declare payment so resolver validation passes.
  payment: 'available',
  // FW-0040 slice 1: declare embed so resolver validation passes.
  embed: 'available',
  // FW-0046 slice 1: declare screener so resolver validation passes.
  screener: 'available',
  trustedReviewer: 'available',
  bringYourOwnAssistant: 'unavailable',
  safeAddress: 'available',
  duressAware: 'unavailable',
  multiParty: 'unavailable',
  recordLifecycle: 'available',
};

const allowAllOrg: OrgRuntimePolicy = {
  features: {
    respondentPlace: 'allowed',
    status: 'allowed',
    documentPresentation: 'allowed',
    fileUpload: 'allowed',
    crossIssuerHistory: 'allowed',
    offlineSubmit: 'allowed',
    payment: 'allowed',
    embed: 'allowed',
    screener: 'allowed',
    trustedReviewer: 'allowed',
    bringYourOwnAssistant: 'allowed',
    safeAddress: 'allowed',
    duressAware: 'allowed',
    multiParty: 'allowed',
    recordLifecycle: 'allowed',
  },
};

describe('resolveRuntimeFeatures (happy path)', () => {
  it('enables a form-required feature when instance and org allow', () => {
    const form: FormRuntimePolicy = { features: { status: 'required' } };
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: allowAllOrg,
      form,
    });
    expect(profile.enabled.has('status')).toBe(true);
    expect(profile.disabled.has('status')).toBe(false);
  });

  it('disables a feature with cause "not-requested" when nothing asks for it', () => {
    const form: FormRuntimePolicy = { features: { status: 'required' } };
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: allowAllOrg,
      form,
    });
    expect(profile.enabled.has('respondentPlace')).toBe(false);
    expect(profile.disabled.get('respondentPlace')?.cause).toBe('not-requested');
  });

  it('returns an immutable profile (frozen collections)', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: allowAllOrg,
      form: { features: {} },
    });
    expect(() => (profile.enabled as Set<string>).add('payment')).toThrow();
    expect(() => (profile.disabled as Map<string, unknown>).clear()).toThrow();
  });

  it('propagates org limits for enabled features only', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        features: { status: 'required' },
        limits: { status: { retentionDays: 30 }, respondentPlace: { ignored: true } },
      },
      form: { features: {} },
    });
    expect(profile.limits.status).toEqual({ retentionDays: 30 });
    expect(profile.limits.respondentPlace).toBeUndefined();
  });
});


describe("resolveRuntimeFeatures — limits.embed validation (FW-0040)", () => {
  it("accepts a well-formed allowed-origin list", () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: "production",
        instance: allAvailable,
        org: {
          features: { embed: "allowed" },
          limits: { embed: { allowedOrigins: ["https://allowed.example.test"] } },
        },
        form: { features: {} },
      }),
    ).not.toThrow();
  });

  it("accepts the wildcard opt-in", () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: "production",
        instance: allAvailable,
        org: {
          features: { embed: "allowed" },
          limits: { embed: { allowedOrigins: ["*"] } },
        },
        form: { features: {} },
      }),
    ).not.toThrow();
  });

  it("rejects an entry with a path", () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: "production",
        instance: allAvailable,
        org: {
          features: { embed: "allowed" },
          limits: { embed: { allowedOrigins: ["https://allowed.example.test/path"] } },
        },
        form: { features: {} },
      }),
    ).toThrowError(/limits.embed.allowedOrigins/);
  });

  it("rejects a non-array allowedOrigins", () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: "production",
        instance: allAvailable,
        org: {
          features: { embed: "allowed" },
          limits: { embed: { allowedOrigins: "not-an-array" as unknown as string[] } },
        },
        form: { features: {} },
      }),
    ).toThrowError(/limits.embed.allowedOrigins/);
  });

  it("rejects an entry with an empty string", () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: "production",
        instance: allAvailable,
        org: {
          features: { embed: "allowed" },
          limits: { embed: { allowedOrigins: [""] } },
        },
        form: { features: {} },
      }),
    ).toThrowError(/limits.embed.allowedOrigins/);
  });
});
