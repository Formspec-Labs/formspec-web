import { describe, expect, it, vi } from 'vitest';
import { AnonymousAdapter } from '../../../src/adapters/identity/anonymous.ts';
import { CompositeIdentityProvider } from '../../../src/adapters/composing/identity-provider.ts';
import type {
  IdentityClaim,
  IdentityProvider,
  IdpOption,
} from '../../../src/ports/identity-provider.ts';

describe('CompositeIdentityProvider', () => {
  it('unions wrapped providers options in discover()', async () => {
    const oidc = stubProvider({
      options: [
        {
          kind: 'oidc',
          issuer: 'https://idp-a.example.test',
          displayName: 'IdP A',
          minAssurance: 'L3',
        },
      ],
    });
    const anon = new AnonymousAdapter();
    const composite = new CompositeIdentityProvider([oidc, anon]);

    const options = await composite.discover();

    expect(options).toEqual([
      {
        kind: 'oidc',
        issuer: 'https://idp-a.example.test',
        displayName: 'IdP A',
        minAssurance: 'L3',
      },
      { kind: 'anonymous', minAssurance: 'L1' },
    ]);
  });

  it('passes formAssuranceRequirements through to each wrapped provider', async () => {
    const lowProvider = stubProvider({
      options: [{ kind: 'anonymous', minAssurance: 'L1' }],
    });
    const highProvider = stubProvider({
      options: [
        {
          kind: 'oidc',
          issuer: 'https://idp-high.example.test',
          displayName: 'High',
          minAssurance: 'L3',
        },
      ],
    });
    const composite = new CompositeIdentityProvider([lowProvider, highProvider]);

    const options = await composite.discover('L3');

    expect(options).toEqual([
      {
        kind: 'oidc',
        issuer: 'https://idp-high.example.test',
        displayName: 'High',
        minAssurance: 'L3',
      },
    ]);
  });

  it('dedupes duplicate options across wrapped providers (first-wins)', async () => {
    const first = new AnonymousAdapter();
    const second = new AnonymousAdapter();
    const composite = new CompositeIdentityProvider([first, second]);

    const options = await composite.discover();

    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({ kind: 'anonymous', minAssurance: 'L1' });
  });

  it('routes authenticate(option) to the wrapped provider whose discover offered it', async () => {
    const anon = new AnonymousAdapter();
    const oidcClaim: IdentityClaim = {
      provider: 'https://idp-b.example.test',
      adapter: 'stub-oidc@0',
      subjectRef: 'oidc:test-subject',
      credentialType: 'oidc-token',
      subjectBinding: 'respondent',
      assuranceLevel: 'L3',
      privacyTier: 'pseudonymous',
    };
    const oidc = stubProvider({
      options: [
        {
          kind: 'oidc',
          issuer: 'https://idp-b.example.test',
          displayName: 'IdP B',
          minAssurance: 'L3',
        },
      ],
      claim: oidcClaim,
    });
    const composite = new CompositeIdentityProvider([anon, oidc]);

    const claim = await composite.authenticate({
      kind: 'oidc',
      issuer: 'https://idp-b.example.test',
      displayName: 'IdP B',
      minAssurance: 'L3',
    });

    expect(claim).toEqual(oidcClaim);
    expect(oidc.authenticate).toHaveBeenCalledOnce();
  });

  it('throws when no wrapped provider owns the option', async () => {
    const anon = new AnonymousAdapter();
    const composite = new CompositeIdentityProvider([anon]);

    await expect(
      composite.authenticate({
        kind: 'oidc',
        issuer: 'https://idp-missing.example.test',
        displayName: 'Missing',
        minAssurance: 'L2',
      }),
    ).rejects.toThrow(/no identity provider/i);
  });

  it('fans revoke(claim) out across wrapped providers', async () => {
    const a = stubProvider({ options: [{ kind: 'anonymous', minAssurance: 'L1' }] });
    const b = stubProvider({ options: [{ kind: 'anonymous', minAssurance: 'L1' }] });
    const composite = new CompositeIdentityProvider([a, b]);

    const claim: IdentityClaim = {
      provider: 'anonymous',
      adapter: 'anonymous@0',
      subjectRef: 'anon:test',
      credentialType: 'other',
      subjectBinding: 'respondent',
      assuranceLevel: 'L1',
    };
    await composite.revoke(claim);

    expect(a.revoke).toHaveBeenCalledWith(claim);
    expect(b.revoke).toHaveBeenCalledWith(claim);
  });

  it('delivers the initial null exactly once on subscribe (collapsed across providers)', async () => {
    const a = new AnonymousAdapter();
    const b = new AnonymousAdapter();
    const composite = new CompositeIdentityProvider([a, b]);

    const received: Array<IdentityClaim | null> = [];
    const unsubscribe = composite.subscribe((claim) => received.push(claim));
    unsubscribe();

    expect(received).toEqual([null]);
  });

  it('forwards session-change events from any wrapped provider', async () => {
    const a = new AnonymousAdapter();
    const b = new AnonymousAdapter();
    const composite = new CompositeIdentityProvider([a, b]);

    const received: Array<IdentityClaim | null> = [];
    const unsubscribe = composite.subscribe((claim) => received.push(claim));

    const claim = await b.authenticate({ kind: 'anonymous', minAssurance: 'L1' });
    await b.revoke(claim);
    unsubscribe();

    expect(received[0]).toBeNull();
    expect(received).toContainEqual(claim);
    expect(received[received.length - 1]).toBeNull();
  });

  it('emits same-subject assurance upgrades from wrapped providers', async () => {
    const option = {
      kind: 'oidc',
      issuer: 'https://idp-step-up.example.test',
      displayName: 'Step-up IdP',
      minAssurance: 'L2',
    } satisfies Extract<IdpOption, { kind: 'oidc' }>;
    const provider = sameSubjectStepUpProvider(option);
    const composite = new CompositeIdentityProvider([provider]);

    const received: Array<IdentityClaim | null> = [];
    const unsubscribe = composite.subscribe((claim) => received.push(claim));

    const [lowOption] = await composite.discover('L2');
    const lowClaim = await composite.authenticate(lowOption);
    const [highOption] = await composite.discover('L3');
    const highClaim = await composite.authenticate(highOption);
    unsubscribe();

    expect(lowClaim.subjectRef).toBe(highClaim.subjectRef);
    expect(received).toEqual([null, lowClaim, highClaim]);
  });

  it('emits same-subject NIST assurance evidence refreshes', async () => {
    const option = {
      kind: 'oidc',
      issuer: 'https://idp-nist-refresh.example.test',
      displayName: 'NIST refresh IdP',
      minAssurance: 'L3',
    } satisfies Extract<IdpOption, { kind: 'oidc' }>;
    const provider = sameSubjectNistRefreshProvider(option);
    const composite = new CompositeIdentityProvider([provider]);

    const received: Array<IdentityClaim | null> = [];
    const unsubscribe = composite.subscribe((claim) => received.push(claim));

    const [discoveredOption] = await composite.discover('L3');
    const firstClaim = await composite.authenticate(discoveredOption);
    const refreshedClaim = await composite.authenticate(discoveredOption);
    unsubscribe();

    expect(firstClaim.subjectRef).toBe(refreshedClaim.subjectRef);
    expect(firstClaim.assuranceLevel).toBe(refreshedClaim.assuranceLevel);
    expect(received).toEqual([null, firstClaim, refreshedClaim]);
  });

  it('emits same-subject credential evidence refreshes', async () => {
    const option = {
      kind: 'oidc',
      issuer: 'https://idp-evidence-refresh.example.test',
      displayName: 'Evidence refresh IdP',
      minAssurance: 'L3',
    } satisfies Extract<IdpOption, { kind: 'oidc' }>;
    const provider = sameSubjectEvidenceRefreshProvider(option);
    const composite = new CompositeIdentityProvider([provider]);

    const received: Array<IdentityClaim | null> = [];
    const unsubscribe = composite.subscribe((claim) => received.push(claim));

    const [discoveredOption] = await composite.discover('L3');
    const firstClaim = await composite.authenticate(discoveredOption);
    const refreshedClaim = await composite.authenticate(discoveredOption);
    unsubscribe();

    expect(firstClaim.subjectRef).toBe(refreshedClaim.subjectRef);
    expect(firstClaim.evidenceRef).not.toBe(refreshedClaim.evidenceRef);
    expect(received).toEqual([null, firstClaim, refreshedClaim]);
  });

  it('does not enumerate IdPs the deployment did not configure (no oversharing)', async () => {
    const composite = new CompositeIdentityProvider([new AnonymousAdapter()]);

    const options = await composite.discover();

    expect(options).toHaveLength(1);
    expect(options[0].kind).toBe('anonymous');
  });

  it('caches the option→owner map at discover() so authenticate does not re-discover (code review H-2)', async () => {
    const oidcClaim: IdentityClaim = {
      provider: 'https://idp-cache.example.test',
      adapter: 'stub-oidc@0',
      subjectRef: 'oidc:cache-subject',
      credentialType: 'oidc-token',
      subjectBinding: 'respondent',
      assuranceLevel: 'L3',
      privacyTier: 'pseudonymous',
    };
    const oidcOption: IdpOption = {
      kind: 'oidc',
      issuer: 'https://idp-cache.example.test',
      displayName: 'Cache IdP',
      minAssurance: 'L3',
    };
    const oidc = stubProvider({ options: [oidcOption], claim: oidcClaim });
    const anon = stubProvider({ options: [{ kind: 'anonymous', minAssurance: 'L1' }] });
    const composite = new CompositeIdentityProvider([oidc, anon]);

    await composite.discover();
    await composite.authenticate(oidcOption);
    await composite.authenticate(oidcOption);
    await composite.authenticate(oidcOption);

    expect(oidc.discover).toHaveBeenCalledTimes(1);
    expect(anon.discover).toHaveBeenCalledTimes(1);
  });

  it('routes revoke(claim) to the owning provider only (code review M-2)', async () => {
    const oidcClaim: IdentityClaim = {
      provider: 'https://idp-rev.example.test',
      adapter: 'stub-oidc@0',
      subjectRef: 'oidc:rev-subject',
      credentialType: 'oidc-token',
      subjectBinding: 'respondent',
      assuranceLevel: 'L3',
      privacyTier: 'pseudonymous',
    };
    const oidcOption: IdpOption = {
      kind: 'oidc',
      issuer: 'https://idp-rev.example.test',
      displayName: 'Rev IdP',
      minAssurance: 'L3',
    };
    const oidc = stubProvider({ options: [oidcOption], claim: oidcClaim });
    const anon = stubProvider({ options: [{ kind: 'anonymous', minAssurance: 'L1' }] });
    const composite = new CompositeIdentityProvider([oidc, anon]);

    await composite.discover();
    const claim = await composite.authenticate(oidcOption);
    await composite.revoke(claim);

    expect(oidc.revoke).toHaveBeenCalledWith(claim);
    expect(anon.revoke).not.toHaveBeenCalled();
  });

  it('emits initial null only once even when wrapped providers sync-emit at subscribe time (code review L-1)', () => {
    const a = new AnonymousAdapter();
    const b = new AnonymousAdapter();
    const c = new AnonymousAdapter();
    const composite = new CompositeIdentityProvider([a, b, c]);

    const received: Array<IdentityClaim | null> = [];
    const unsubscribe = composite.subscribe((claim) => received.push(claim));
    unsubscribe();

    expect(received).toEqual([null]);
  });
});

function stubProvider({
  options,
  claim,
}: {
  options: readonly IdpOption[];
  claim?: IdentityClaim;
}): IdentityProvider & {
  authenticate: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<(claim: IdentityClaim | null) => void>();
  return {
    discover: vi.fn(async (floor) => {
      if (!floor) return [...options];
      return options.filter((option) => assuranceRank(option.minAssurance) >= assuranceRank(floor));
    }),
    authenticate: vi.fn(async () => {
      const next =
        claim ??
        ({
          provider: 'stub',
          adapter: 'stub@0',
          subjectRef: 'stub:subject',
          credentialType: 'other',
          subjectBinding: 'respondent',
          assuranceLevel: 'L1',
        } satisfies IdentityClaim);
      for (const listener of listeners) listener(next);
      return next;
    }),
    revoke: vi.fn(async () => {
      for (const listener of listeners) listener(null);
    }),
    subscribe(listener) {
      listeners.add(listener);
      listener(null);
      return () => listeners.delete(listener);
    },
  };
}

function sameSubjectNistRefreshProvider(
  option: Extract<IdpOption, { kind: 'oidc' }>,
): IdentityProvider {
  const listeners = new Set<(claim: IdentityClaim | null) => void>();
  let authenticateCount = 0;
  return {
    discover: vi.fn(async () => [option]),
    authenticate: vi.fn(async () => {
      authenticateCount += 1;
      const claim: IdentityClaim = {
        provider: 'https://idp-nist-refresh.example.test',
        adapter: 'stub-nist-refresh@0',
        subjectRef: 'oidc:same-nist-subject',
        credentialType: 'oidc-token',
        subjectBinding: 'respondent',
        assuranceLevel: 'L3',
        privacyTier: 'pseudonymous',
        nistAssurance: {
          ial: 'IAL2',
          aal: 'AAL3',
          fal: authenticateCount === 1 ? 'FAL1' : 'FAL2',
        },
      };
      for (const listener of listeners) listener(claim);
      return claim;
    }),
    revoke: vi.fn(async () => {
      for (const listener of listeners) listener(null);
    }),
    subscribe(listener) {
      listeners.add(listener);
      listener(null);
      return () => listeners.delete(listener);
    },
  };
}

function sameSubjectEvidenceRefreshProvider(
  option: Extract<IdpOption, { kind: 'oidc' }>,
): IdentityProvider {
  const listeners = new Set<(claim: IdentityClaim | null) => void>();
  let authenticateCount = 0;
  return {
    discover: vi.fn(async () => [option]),
    authenticate: vi.fn(async () => {
      authenticateCount += 1;
      const claim: IdentityClaim = {
        provider: 'https://idp-evidence-refresh.example.test',
        adapter: 'stub-evidence-refresh@0',
        subjectRef: 'oidc:same-evidence-subject',
        credentialType: 'oidc-token',
        credentialRef: `credential:${authenticateCount}`,
        evidenceRef: `evidence:${authenticateCount}`,
        expiresAt: `2026-05-25T0${authenticateCount}:00:00.000Z`,
        subjectBinding: 'respondent',
        assuranceLevel: 'L3',
        privacyTier: 'pseudonymous',
      };
      for (const listener of listeners) listener(claim);
      return claim;
    }),
    revoke: vi.fn(async () => {
      for (const listener of listeners) listener(null);
    }),
    subscribe(listener) {
      listeners.add(listener);
      listener(null);
      return () => listeners.delete(listener);
    },
  };
}

function sameSubjectStepUpProvider(
  option: Extract<IdpOption, { kind: 'oidc' }>,
): IdentityProvider {
  const listeners = new Set<(claim: IdentityClaim | null) => void>();
  return {
    discover: vi.fn(async (floor) => {
      const minAssurance = floor ?? option.minAssurance;
      return [{ ...option, minAssurance }];
    }),
    authenticate: vi.fn(async (requestedOption: IdpOption) => {
      const assuranceLevel = requestedOption.minAssurance;
      const claim: IdentityClaim = {
        provider: 'https://idp-step-up.example.test',
        adapter: 'stub-step-up@0',
        subjectRef: 'oidc:same-step-up-subject',
        credentialType: 'oidc-token',
        subjectBinding: 'respondent',
        assuranceLevel,
        privacyTier: 'pseudonymous',
        nistAssurance: { aal: `AAL${assuranceRank(assuranceLevel)}` },
      };
      for (const listener of listeners) listener(claim);
      return claim;
    }),
    revoke: vi.fn(async () => {
      for (const listener of listeners) listener(null);
    }),
    subscribe(listener) {
      listeners.add(listener);
      listener(null);
      return () => listeners.delete(listener);
    },
  };
}

function assuranceRank(level: 'L1' | 'L2' | 'L3' | 'L4'): number {
  return Number(level.slice(1));
}
