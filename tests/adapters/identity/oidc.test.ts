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

  it('exposes the current bearer token without leaking it into the identity claim', async () => {
    const driver: OidcClientDriver = {
      getUser: vi.fn(async () => ({
        access_token: 'access-token',
        id_token: 'id-token',
        profile: {
          sub: 'provider-native-subject',
          acr: 'urn:formspec:assurance:l3',
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

    await expect(adapter.currentAccessToken()).resolves.toBe('access-token');
    const claim = await adapter.authenticate(option);

    expect(JSON.stringify(claim)).not.toContain('access-token');
    expect(claim).toMatchObject({
      credentialRef: 'oidc:https://idp.example.test:id-token',
      subjectRef: 'oidc:subject-hash',
    });
  });

  it('uses non-interactive silent renewal for expired access tokens', async () => {
    const signinRedirect = vi.fn(async () => undefined);
    const driver: OidcClientDriver = {
      getUser: vi.fn(async () => ({
        access_token: 'expired-token',
        profile: {
          sub: 'provider-native-subject',
          acr: 'urn:formspec:assurance:l3',
        },
        expires_at: 1,
      })),
      signinSilent: vi.fn(async () => ({
        access_token: 'renewed-token',
        profile: {
          sub: 'provider-native-subject',
          acr: 'urn:formspec:assurance:l3',
        },
        expires_at: 4_100_000_000,
      })),
      signinRedirect,
    };
    const adapter = new OidcAdapter({
      issuer: 'https://idp.example.test',
      clientId: 'formspec-web',
      minAssurance: 'L3',
      driver,
      subjectRefFactory: () => 'oidc:subject-hash',
    });

    await expect(adapter.currentAccessToken()).resolves.toBe('renewed-token');
    expect(driver.signinSilent).toHaveBeenCalledOnce();
    expect(signinRedirect).not.toHaveBeenCalled();
  });

  it('fails visibly when no current user exists and redirect is not configured', async () => {
    const adapter = new OidcAdapter({
      issuer: 'https://idp.example.test',
      clientId: 'formspec-web',
      minAssurance: 'L3',
      driver: {
        getUser: vi.fn(async () => null),
      },
      subjectRefFactory: () => 'oidc:subject-hash',
    });
    const [option] = await adapter.discover('L3');
    if (!option) throw new Error('expected OIDC option');

    await expect(adapter.authenticate(option)).rejects.toThrow(/redirect is not configured/);
  });

  it('fails instead of silently downgrading unknown ACR values', () => {
    expect(() => assuranceLevelFromAcr('unknown-acr', {})).toThrow(/ACR/);
  });

  it.each([
    ['urn:formspec:assurance:l1', 'L1'],
    ['urn:formspec:assurance:l2', 'L2'],
    ['urn:formspec:assurance:l3', 'L3'],
    ['urn:formspec:assurance:l4', 'L4'],
  ] as const)('maps fixture ACR %s to assuranceLevel %s', async (acr, assuranceLevel) => {
    const adapter = new OidcAdapter({
      issuer: 'https://idp.example.test',
      clientId: 'formspec-web',
      minAssurance: assuranceLevel,
      subjectRefFactory: () => `oidc:${assuranceLevel.toLowerCase()}-subject`,
      driver: {
        getUser: async () => ({
          access_token: 'access-token',
          profile: { sub: 'subject', acr },
        }),
      },
    });
    const [option] = await adapter.discover(assuranceLevel);
    if (!option) throw new Error('expected OIDC option');

    await expect(adapter.authenticate(option)).resolves.toMatchObject({ assuranceLevel });
  });

  it('fails instead of silently satisfying a stronger option with weaker ACR', async () => {
    const adapter = new OidcAdapter({
      issuer: 'https://idp.example.test',
      clientId: 'formspec-web',
      minAssurance: 'L3',
      subjectRefFactory: () => 'oidc:l2-subject',
      driver: {
        getUser: async () => ({
          access_token: 'access-token',
          profile: { sub: 'subject', acr: 'urn:formspec:assurance:l2' },
        }),
      },
    });
    const [option] = await adapter.discover('L3');
    if (!option) throw new Error('expected OIDC option');

    await expect(adapter.authenticate(option)).rejects.toThrow(/below required L3/);
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
