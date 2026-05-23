import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';

/**
 * Stub IdentityProvider — anonymous-only.
 * Always returns an L1 anonymous claim with a generated subjectRef.
 * For tests + scaffold smoke test.
 */
export function stubIdentityProvider(): IdentityProvider {
  const listeners = new Set<(claim: IdentityClaim | null) => void>();
  let current: IdentityClaim | null = null;
  const options: IdpOption[] = [
    { kind: 'anonymous', minAssurance: 'L1' },
    {
      kind: 'oidc',
      issuer: 'https://stub-idp.example.test',
      displayName: 'Stub high assurance identity',
      minAssurance: 'L3',
    },
  ];

  const setCurrent = (claim: IdentityClaim | null): void => {
    current = claim;
    for (const listener of listeners) {
      listener(claim);
    }
  };

  return {
    async discover(formAssuranceRequirements?: AssuranceLevel) {
      if (!formAssuranceRequirements) {
        return options;
      }
      return options.filter(
        (option) =>
          assuranceRank(option.minAssurance) >= assuranceRank(formAssuranceRequirements),
      );
    },
    async authenticate(option: IdpOption) {
      const claim = claimForOption(option);
      setCurrent(claim);
      return claim;
    },
    async revoke(_claim: IdentityClaim) {
      setCurrent(null);
    },
    subscribe(listener): Unsubscribe {
      listeners.add(listener);
      // Replay current value (synchronously, so consumers see initial state).
      listener(current);
      return () => listeners.delete(listener);
    },
  };
}

function claimForOption(option: IdpOption): IdentityClaim {
  if (option.kind === 'anonymous') {
    return {
      provider: 'stub-anonymous',
      adapter: 'stub-identity-provider@0',
      subjectRef: `stub-${Math.random().toString(36).slice(2, 10)}`,
      credentialType: 'other',
      subjectBinding: 'respondent',
      assuranceLevel: 'L1',
      privacyTier: 'anonymous',
    };
  }

  if (option.kind === 'oidc') {
    return {
      provider: option.issuer,
      adapter: 'stub-identity-provider@0',
      subjectRef: `stub-oidc-${Math.random().toString(36).slice(2, 10)}`,
      credentialType: 'oidc-token',
      credentialRef: 'stub:credential',
      subjectBinding: 'respondent',
      assuranceLevel: option.minAssurance,
      privacyTier: 'pseudonymous',
      evidenceRef: 'stub:evidence:l3',
    };
  }

  return {
    provider: 'stub-magic-link',
    adapter: 'stub-identity-provider@0',
    subjectRef: `stub-magic-${Math.random().toString(36).slice(2, 10)}`,
    credentialType: 'provider-assertion',
    credentialRef: 'stub:magic-link',
    subjectBinding: 'respondent',
    assuranceLevel: option.minAssurance,
    privacyTier: 'pseudonymous',
  };
}

function assuranceRank(level: AssuranceLevel): number {
  return Number(level.slice(1));
}
