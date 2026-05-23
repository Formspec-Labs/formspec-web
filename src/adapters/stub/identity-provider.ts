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

  const setCurrent = (claim: IdentityClaim | null): void => {
    current = claim;
    for (const listener of listeners) {
      listener(claim);
    }
  };

  return {
    async discover(_formAssuranceRequirements?: AssuranceLevel) {
      const option: IdpOption = { kind: 'anonymous', minAssurance: 'L1' };
      return [option];
    },
    async authenticate(option: IdpOption) {
      if (option.kind !== 'anonymous') {
        throw new Error(`stub IdentityProvider only supports anonymous; got ${option.kind}`);
      }
      const claim: IdentityClaim = {
        provider: 'stub-anonymous',
        adapter: 'stub-identity-provider@0',
        subjectRef: `stub-${Math.random().toString(36).slice(2, 10)}`,
        credentialType: 'other',
        subjectBinding: 'respondent',
        assuranceLevel: 'L1',
        privacyTier: 'anonymous',
      };
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
