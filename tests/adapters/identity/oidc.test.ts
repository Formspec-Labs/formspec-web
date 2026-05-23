import { describe, expect, it, vi } from 'vitest';
import {
  OidcAdapter,
  assuranceLevelFromAcr,
  type OidcClientDriver,
} from '../../../src/adapters/identity/oidc.ts';

describe('OidcAdapter', () => {
  it('normalizes oidc-client-ts users into canonical identity claims', async () => {
    const driver: OidcClientDriver = {
      getUser: vi.fn(async () => ({
        access_token: 'access-token',
        id_token: 'id-token',
        profile: {
          sub: 'provider-native-subject',
          acr: 'urn:formspec:assurance:l3',
          email: 'respondent@example.test',
        },
        expires_at: 1_800_000_000,
      })),
    };
    const adapter = new OidcAdapter({
      issuer: 'https://idp.example.test',
      clientId: 'formspec-web',
      minAssurance: 'L3',
      driver,
      subjectRefFactory: () => 'oidc:subject-hash',
    });
    const [option] = await adapter.discover('L3');
    if (!option) throw new Error('expected OIDC option');

    const claim = await adapter.authenticate(option);

    expect(claim).toEqual({
      provider: 'https://idp.example.test',
      adapter: 'oidc-client-ts',
      subjectRef: 'oidc:subject-hash',
      credentialType: 'oidc-token',
      credentialRef: 'oidc:https://idp.example.test:id-token',
      personhoodCheck: 'not-performed',
      subjectBinding: 'respondent',
      assuranceLevel: 'L3',
      privacyTier: 'pseudonymous',
      evidenceRef: 'oidc:https://idp.example.test:acr',
      expiresAt: '2027-01-15T08:00:00.000Z',
    });
    expect('acr' in claim).toBe(false);
    expect('sub' in claim).toBe(false);
  });

  it('fails instead of silently downgrading unknown ACR values', () => {
    expect(() => assuranceLevelFromAcr('unknown-acr', {})).toThrow(/ACR/);
  });

  it('enforces the adopter-overridable ACR mapping table', async () => {
    const adapter = new OidcAdapter({
      issuer: 'https://idp.example.test',
      clientId: 'formspec-web',
      minAssurance: 'L4',
      acrAssuranceMap: { 'idp-high': 'L4' },
      subjectRefFactory: () => 'oidc:l4-subject',
      driver: {
        getUser: async () => ({
          access_token: 'access-token',
          profile: { sub: 'subject', acr: 'idp-high' },
        }),
      },
    });
    const [option] = await adapter.discover('L4');
    if (!option) throw new Error('expected OIDC option');

    await expect(adapter.authenticate(option)).resolves.toMatchObject({ assuranceLevel: 'L4' });
  });
});
