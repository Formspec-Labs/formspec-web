import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';
import { IdentitySession, meetsAssurance, randomUuid } from './assurance.ts';

export class AnonymousAdapter implements IdentityProvider {
  private readonly session = new IdentitySession();

  async discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]> {
    const option: IdpOption = { kind: 'anonymous', minAssurance: 'L1' };
    return meetsAssurance(option.minAssurance, formAssuranceRequirements) ? [option] : [];
  }

  async authenticate(option: IdpOption): Promise<IdentityClaim> {
    if (option.kind !== 'anonymous') {
      throw new Error('AnonymousAdapter can only authenticate anonymous options');
    }
    const claim: IdentityClaim = {
      provider: 'anonymous',
      adapter: 'anonymous@0',
      subjectRef: `anon:${randomUuid()}`,
      credentialType: 'other',
      personhoodCheck: 'not-performed',
      subjectBinding: 'respondent',
      assuranceLevel: 'L1',
      privacyTier: 'anonymous',
    };
    this.session.set(claim);
    return claim;
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    this.session.set(null);
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    return this.session.subscribe(listener);
  }
}

export function createAnonymousAdapter(): AnonymousAdapter {
  return new AnonymousAdapter();
}
