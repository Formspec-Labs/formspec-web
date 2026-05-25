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

  it('does not enumerate IdPs the deployment did not configure (no oversharing)', async () => {
    const composite = new CompositeIdentityProvider([new AnonymousAdapter()]);

    const options = await composite.discover();

    expect(options).toHaveLength(1);
    expect(options[0].kind).toBe('anonymous');
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

function assuranceRank(level: 'L1' | 'L2' | 'L3' | 'L4'): number {
  return Number(level.slice(1));
}
