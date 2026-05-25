import { describe, expect, it } from 'vitest';
import { resolveRuntimeFeatures } from './resolver.ts';
import { UnsupportedRequiredFeatureError } from './errors.ts';
import {
  getMultiPartyRuntimeConfig,
  getSafeAddressRuntimeConfig,
  getTrustedReviewerRuntimeConfig,
} from './policy-shapes.ts';
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
  multiParty: 'available',
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

  it('merges trustedReviewer form limits into the enabled resolved profile', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        features: { trustedReviewer: 'allowed' },
        limits: {
          trustedReviewer: {
            maxActiveSharesPerDraft: 4,
            respondentOnlyFieldPointers: [],
          },
        },
      },
      form: {
        features: { trustedReviewer: 'optional' },
        limits: {
          trustedReviewer: {
            posture: 'suggest-allowed',
            respondentOnlyFieldPointers: ['/data/protectedAddress'],
          },
        },
      },
    });
    const config = getTrustedReviewerRuntimeConfig(profile);
    expect(config?.posture).toBe('suggest-allowed');
    expect(config?.maxActiveSharesPerDraft).toBe(4);
    expect(config?.respondentOnlyFieldPointers).toEqual(['/data/protectedAddress']);
  });
});

describe('resolveRuntimeFeatures — limits.trustedReviewer validation (FW-0113)', () => {
  it('rejects an invalid trustedReviewer posture', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          features: { trustedReviewer: 'allowed' },
          limits: { trustedReviewer: { posture: 'read-only' } },
        },
        form: { features: { trustedReviewer: 'optional' } },
      }),
    ).toThrowError(/limits.trustedReviewer.posture/);
  });

  it('rejects malformed respondent-only field pointers', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: { features: { trustedReviewer: 'allowed' } },
        form: {
          features: { trustedReviewer: 'optional' },
          limits: {
            trustedReviewer: {
              posture: 'comment-allowed',
              respondentOnlyFieldPointers: ['data/not-a-json-pointer'],
            },
          },
        },
      }),
    ).toThrowError(/respondentOnlyFieldPointers/);
  });
});

describe('resolveRuntimeFeatures — multiParty policy (FW-0061)', () => {
  const multiParty = {
    tier: 'coEqual',
    invitationChannel: 'magic-link',
    parties: [
      {
        roleId: 'spouse-a',
        label: 'Spouse A',
        role: 'coEqual',
        cardinality: { min: 1, max: 1 },
        visibilityScope: 'shared',
      },
      {
        roleId: 'spouse-b',
        label: 'Spouse B',
        role: 'coEqual',
        cardinality: { min: 1, max: 1 },
        visibilityScope: 'shared',
      },
    ],
  } as const;

  it('enables multiParty and exposes the resolved signer policy', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: { features: { multiParty: 'allowed' } },
      form: {
        features: { multiParty: 'required' },
        limits: { multiParty },
      },
    });
    expect(profile.enabled.has('multiParty')).toBe(true);
    expect(getMultiPartyRuntimeConfig(profile)).toMatchObject({
      tier: 'coEqual',
      invitationChannel: 'magic-link',
      parties: [
        { roleId: 'spouse-a', role: 'coEqual' },
        { roleId: 'spouse-b', role: 'coEqual' },
      ],
    });
  });

  it('rejects an enabled multiParty feature without a signer policy block', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: { features: { multiParty: 'allowed' } },
        form: { features: { multiParty: 'required' } },
      }),
    ).toThrowError(/limits.multiParty/);
  });

  it('fails closed for safe-address x party-policy empty intersections', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: { features: { multiParty: 'allowed' } },
        form: {
          features: { multiParty: 'required' },
          limits: {
            multiParty: {
              ...multiParty,
              parties: [
                {
                  ...multiParty.parties[0],
                  visibleTo: ['parent-a'],
                  safeAddressAudience: ['issuer-verification'],
                },
                multiParty.parties[1],
              ],
            },
          },
        },
      }),
    ).toThrowError(/empty safe-address x party-policy audience intersection/);
  });
});

describe('resolveRuntimeFeatures — recordLifecycle policy (FW-0038)', () => {
  it('resolves recordLifecycle per-act policy when recordLifecycle is enabled', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        ...allowAllOrg,
        recordLifecycle: {
          correctable: {
            enabled: true,
            correctableFieldSet: ['/householdSize'],
            window: { state: 'open' },
            requiresReason: true,
            requiresEvidence: false,
          },
          withdrawable: {
            enabled: true,
            window: { state: 'closes-at', closesAt: '2026-06-24T23:59:59.000Z' },
            requiresReason: true,
            preDeterminationKernelMode: 'applicant-withdrawn',
            partyScope: 'any-party',
          },
          disputable: {
            enabled: true,
            signerOnly: true,
            requiresReason: true,
          },
        },
      },
      form: { features: { recordLifecycle: 'optional' } },
    });
    expect(profile.recordLifecycle?.correctable?.correctableFieldSet).toEqual([
      '/householdSize',
    ]);
    expect(profile.recordLifecycle?.correctable?.requiresEvidence).toBe(false);
    expect(profile.recordLifecycle?.withdrawable?.partyScope).toBe('any-party');
    expect(profile.recordLifecycle?.disputable?.signerOnly).toBe(true);
  });

  it('does not expose recordLifecycle policy when the feature is disabled', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: { ...allAvailable, recordLifecycle: 'unavailable' },
      org: {
        ...allowAllOrg,
        recordLifecycle: {
          correctable: {
            enabled: true,
            correctableFieldSet: ['/householdSize'],
          },
        },
      },
      form: { features: { recordLifecycle: 'optional' } },
    });
    expect(profile.enabled.has('recordLifecycle')).toBe(false);
    expect(profile.recordLifecycle).toBeUndefined();
  });

  it('rejects enabled correctable policy without a declared field set', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: allowAllOrg,
        form: {
          features: { recordLifecycle: 'optional' },
          recordLifecycle: { correctable: { enabled: true } },
        },
      }),
    ).toThrowError(/correctableFieldSet/);
  });
});

describe('resolveRuntimeFeatures — safeAddress policy (FW-0060)', () => {
  it('resolves the safeAddress runtime block when protected fields are valid', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        ...allowAllOrg,
        limits: {
          safeAddress: {
            acpJurisdictionsAccepted: ['CA-ACP'],
            authorizedAudiences: ['issuer_verification'],
          },
        },
      },
      form: {
        features: { safeAddress: 'required' },
        limits: {
          safeAddress: {
            receiptPostureTier: 'phase-1-fallback',
            fields: [
              {
                path: '/protectedHomeAddress',
                label: 'Protected home address',
                accessClass: 'safe-address',
                visibleTo: ['issuer_verification'],
              },
            ],
          },
        },
      },
    });
    const config = getSafeAddressRuntimeConfig(profile);
    expect(config?.enabledClasses).toEqual(['safe-address']);
    expect(config?.fields[0]?.path).toBe('/protectedHomeAddress');
    expect(config?.acpJurisdictionsAccepted).toEqual(['CA-ACP']);
  });

  it('falls back to org safe-address limits when extracted form arrays are empty', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        ...allowAllOrg,
        limits: {
          safeAddress: {
            receiptPostureTier: 'phase-1-fallback',
            acpJurisdictionsAccepted: ['CA-ACP'],
            authorizedAudiences: ['issuer_verification'],
          },
        },
      },
      form: {
        features: { safeAddress: 'required' },
        limits: {
          safeAddress: {
            acpJurisdictionsAccepted: [],
            authorizedAudiences: [],
            fields: [
              {
                path: '/protectedHomeAddress',
                accessClass: 'safe-address',
              },
            ],
          },
        },
      },
    });

    const config = getSafeAddressRuntimeConfig(profile);
    expect(config?.acpJurisdictionsAccepted).toEqual(['CA-ACP']);
    expect(config?.authorizedAudiences).toEqual(['issuer_verification']);
    expect(config?.fields[0]?.plaintextAudiences).toEqual(['issuer_verification']);
  });

  it('rejects verifier-grade form posture when the deployment only supports fallback', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          ...allowAllOrg,
          limits: {
            safeAddress: {
              receiptPostureTier: 'phase-1-fallback',
              acpJurisdictionsAccepted: ['CA-ACP'],
              authorizedAudiences: ['issuer_verification'],
            },
          },
        },
        form: {
          features: { safeAddress: 'required' },
          limits: {
            safeAddress: {
              receiptPostureTier: 'verifier-grade',
              fields: [
                {
                  path: '/protectedHomeAddress',
                  accessClass: 'safe-address',
                },
              ],
            },
          },
        },
      }),
    ).toThrow(UnsupportedRequiredFeatureError);
  });

  it('allows verifier-grade form posture when the deployment supports it', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        ...allowAllOrg,
        limits: {
          safeAddress: {
            receiptPostureTier: 'verifier-grade',
            acpJurisdictionsAccepted: ['CA-ACP'],
            authorizedAudiences: ['issuer_verification'],
          },
        },
      },
      form: {
        features: { safeAddress: 'required' },
        limits: {
          safeAddress: {
            receiptPostureTier: 'verifier-grade',
            fields: [
              {
                path: '/protectedHomeAddress',
                accessClass: 'safe-address',
              },
            ],
          },
        },
      },
    });

    expect(getSafeAddressRuntimeConfig(profile)?.receiptPostureTier).toBe('verifier-grade');
  });

  it('intersects form plaintext audiences with the org safe-address audience set', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        ...allowAllOrg,
        limits: {
          safeAddress: {
            acpJurisdictionsAccepted: ['CA-ACP'],
            authorizedAudiences: ['issuer_verification'],
          },
        },
      },
      form: {
        features: { safeAddress: 'required' },
        limits: {
          safeAddress: {
            fields: [
              {
                path: '/protectedHomeAddress',
                accessClass: 'safe-address',
                visibleTo: ['issuer_verification', 'respondent_public_receipt'],
                plaintextAudiences: ['issuer_verification', 'respondent_public_receipt'],
              },
            ],
          },
        },
      },
    });

    const config = getSafeAddressRuntimeConfig(profile);
    expect(config?.fields[0]?.plaintextAudiences).toEqual(['issuer_verification']);
  });

  it('intersects form authorized audiences with the org safe-address audience set', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        ...allowAllOrg,
        limits: {
          safeAddress: {
            acpJurisdictionsAccepted: ['CA-ACP'],
            authorizedAudiences: ['issuer_verification'],
          },
        },
      },
      form: {
        features: { safeAddress: 'required' },
        limits: {
          safeAddress: {
            authorizedAudiences: ['issuer_verification', 'respondent_public_receipt'],
            fields: [
              {
                path: '/protectedHomeAddress',
                accessClass: 'safe-address',
                visibleTo: ['issuer_verification'],
              },
            ],
          },
        },
      },
    });

    expect(getSafeAddressRuntimeConfig(profile)?.authorizedAudiences)
      .toEqual(['issuer_verification']);
  });

  it('rejects form authorized audiences outside the org safe-address audience set', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          ...allowAllOrg,
          limits: {
            safeAddress: {
              acpJurisdictionsAccepted: ['CA-ACP'],
              authorizedAudiences: ['issuer_verification'],
            },
          },
        },
        form: {
          features: { safeAddress: 'required' },
          limits: {
            safeAddress: {
              authorizedAudiences: ['respondent_public_receipt'],
              fields: [
                {
                  path: '/protectedHomeAddress',
                  accessClass: 'safe-address',
                  visibleTo: ['respondent_public_receipt'],
                  plaintextAudiences: ['respondent_public_receipt'],
                },
              ],
            },
          },
        },
      }),
    ).toThrowError(/no authorized plaintext audience/);
  });

  it('rejects form-level authorized audience broadening for effective audiences', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          ...allowAllOrg,
          limits: {
            safeAddress: {
              acpJurisdictionsAccepted: ['CA-ACP'],
              authorizedAudiences: ['issuer_verification'],
            },
          },
        },
        form: {
          features: { safeAddress: 'required' },
          limits: {
            safeAddress: {
              authorizedAudiences: ['respondent_public_receipt'],
              fields: [
                {
                  path: '/protectedHomeAddress',
                  accessClass: 'safe-address',
                  effectiveAudiences: ['respondent_public_receipt'],
                },
              ],
            },
          },
        },
      }),
    ).toThrowError(/no authorized plaintext audience/);
  });

  it('rejects form plaintext audiences outside the org safe-address audience set', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          ...allowAllOrg,
          limits: {
            safeAddress: {
              acpJurisdictionsAccepted: ['CA-ACP'],
              authorizedAudiences: ['issuer_verification'],
            },
          },
        },
        form: {
          features: { safeAddress: 'required' },
          limits: {
            safeAddress: {
              fields: [
                {
                  path: '/protectedHomeAddress',
                  accessClass: 'safe-address',
                  visibleTo: ['respondent_public_receipt'],
                  plaintextAudiences: ['respondent_public_receipt'],
                },
              ],
            },
          },
        },
      }),
    ).toThrowError(/no plaintext audience authorized by safe-address policy/);
  });

  it('rejects effective audiences outside the org safe-address audience set', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          ...allowAllOrg,
          limits: {
            safeAddress: {
              acpJurisdictionsAccepted: ['CA-ACP'],
              authorizedAudiences: ['issuer_verification'],
            },
          },
        },
        form: {
          features: { safeAddress: 'required' },
          limits: {
            safeAddress: {
              fields: [
                {
                  path: '/protectedHomeAddress',
                  accessClass: 'safe-address',
                  effectiveAudiences: ['respondent_public_receipt'],
                },
              ],
            },
          },
        },
      }),
    ).toThrowError(/effective audience not authorized by safe-address policy/);
  });

  it('sanitizes effective audiences before exposing resolved field policy', () => {
    const profile = resolveRuntimeFeatures({
      mode: 'production',
      instance: allAvailable,
      org: {
        ...allowAllOrg,
        limits: {
          safeAddress: {
            acpJurisdictionsAccepted: ['CA-ACP'],
            authorizedAudiences: ['issuer_verification'],
          },
        },
      },
      form: {
        features: { safeAddress: 'required' },
        limits: {
          safeAddress: {
            fields: [
              {
                path: '/protectedHomeAddress',
                accessClass: 'safe-address',
                plaintextAudiences: ['respondent_public_receipt'],
                effectiveAudiences: ['issuer_verification'],
              },
            ],
          },
        },
      },
    });

    const config = getSafeAddressRuntimeConfig(profile);
    expect(config?.fields[0]?.plaintextAudiences).toEqual(['issuer_verification']);
    expect(config?.fields[0]?.effectiveAudiences).toEqual(['issuer_verification']);
  });

  it('throws InvalidRuntimePolicyError for empty party-policy x safe-address intersections', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          ...allowAllOrg,
          limits: {
            safeAddress: {
              acpJurisdictionsAccepted: ['CA-ACP'],
              authorizedAudiences: ['issuer_verification'],
            },
          },
        },
        form: {
          features: { safeAddress: 'required' },
          limits: {
            safeAddress: {
              fields: [
                {
                  path: '/protectedHomeAddress',
                  accessClass: 'safe-address',
                  visibleTo: ['respondent_public_receipt'],
                  plaintextAudiences: ['issuer_verification'],
                },
              ],
            },
          },
        },
      }),
    ).toThrowError(/no audience allowed by both party policy and safe-address policy/);
  });

  it('throws InvalidRuntimePolicyError for an explicitly empty effective audience result', () => {
    expect(() =>
      resolveRuntimeFeatures({
        mode: 'production',
        instance: allAvailable,
        org: {
          ...allowAllOrg,
          limits: {
            safeAddress: {
              acpJurisdictionsAccepted: ['CA-ACP'],
              authorizedAudiences: ['issuer_verification'],
            },
          },
        },
        form: {
          features: { safeAddress: 'required' },
          limits: {
            safeAddress: {
              fields: [
                {
                  path: '/protectedHomeAddress',
                  accessClass: 'safe-address',
                  effectiveAudiences: [],
                },
              ],
            },
          },
        },
      }),
    ).toThrowError(/empty effective audience intersection/);
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
