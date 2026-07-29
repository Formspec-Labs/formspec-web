import { describe, expect, it } from 'vitest';
import {
  departmentAppProfile,
  publicPortalProfile,
} from '../profiles/profiles.ts';
import type {
  FormspecWebConfig,
  RespondentSurfaceBundleConfig,
} from './types.ts';
import {
  isRespondentSurfaceBundleConfig,
  respondentSurfaceDeploymentIsConfigured,
} from './respondent-surface.ts';

describe('respondent Surface bundle configuration', () => {
  it('accepts an unpadded base64url raw 32-byte Ed25519 public key', () => {
    expect(isRespondentSurfaceBundleConfig(validConfig())).toBe(true);
  });

  it('rejects a non-raw or wrong-length Ed25519 public key', () => {
    const config = validConfig();
    const malformed = {
      ...config,
      verification: {
        ...config.verification,
        keys: [{
          ...config.verification.keys[0]!,
          publicKey: 'c3BraS1lbmNvZGVkLWtleQ',
        }],
      },
    };

    expect(isRespondentSurfaceBundleConfig(malformed)).toBe(false);
  });

  it.each([undefined, 0, -1, 1.5])(
    'rejects an absent or invalid acquisition deadline (%s)',
    (timeoutMs) => {
      const config = {
        ...validConfig(),
        timeoutMs,
      };

      expect(isRespondentSurfaceBundleConfig(config)).toBe(false);
    },
  );

  it('activates only the anonymous publicPortal deployment', () => {
    expect(
      respondentSurfaceDeploymentIsConfigured(configuredProfile(publicPortalProfile)),
    ).toBe(true);
    expect(
      respondentSurfaceDeploymentIsConfigured(configuredProfile(departmentAppProfile)),
    ).toBe(false);
    expect(
      respondentSurfaceDeploymentIsConfigured({
        ...configuredProfile(publicPortalProfile),
        ports: {
          ...publicPortalProfile.ports,
          identityProvider: 'oidc',
        },
      }),
    ).toBe(false);
  });
});

function configuredProfile(profile: FormspecWebConfig): FormspecWebConfig {
  return {
    ...profile,
    ports: {
      ...profile.ports,
      definitionSource: 'reference-http',
      draftStore: 'reference-http',
      submitTransport: 'reference-http',
    },
    referenceAdapters: {
      ...profile.referenceAdapters,
      formspecStack: {
        ...profile.referenceAdapters?.formspecStack,
        tenantHeaderDialect: 'formspec',
        formspecServerUrl: 'https://formspec.example.gov',
        surfaceBundle: validConfig(),
      },
    },
  };
}

function validConfig(): RespondentSurfaceBundleConfig {
  return {
    locator: 'https://bundles.example.gov/respondent.cose',
    allowedOrigins: ['https://bundles.example.gov'],
    maxBytes: 1_000_000,
    timeoutMs: 15_000,
    redirectPolicy: 'refuse',
    starterModuleId: 'x-respondent',
    receiptResourceUrl: 'https://runtime.example.gov/respondent/receipt',
    verification: {
      expectedAppId: 'https://example.gov/apps/respondent',
      methodRegistry: {
        version: '1.0.0',
        entries: [{
          id: 'urn:formspec:sig-method:ed25519-cose-sign1@1',
          suite: 'Ed25519',
          wire: 'COSE_Sign1',
          alg: -8,
          status: 'registered',
        }],
      },
      keys: [{
        kid: 'cmVzcG9uZGVudC1rZXk',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      }],
      authorities: [{
        kid: 'cmVzcG9uZGVudC1rZXk',
        publisherId: 'https://publisher.example.gov/',
        publisherDisplayName: 'Example publisher',
        methods: ['urn:formspec:sig-method:ed25519-cose-sign1@1'],
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        revoked: false,
      }],
      pinnedReleases: [{ digest: 'sha256:respondent-payload' }],
    },
  };
}
