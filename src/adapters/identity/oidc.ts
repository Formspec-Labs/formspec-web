import { OidcBrowserAuthSession, type OidcBrowserAuthSessionConfig } from './oidc-browser-session.ts';
import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';
import { IdentitySession, assuranceRank, meetsAssurance } from './assurance.ts';

export type { OidcClientDriver, OidcUserLike, OidcClock } from './oidc-browser-session.ts';
export type AcrAssuranceMap = Record<string, AssuranceLevel>;

/** Bounded diagnostics only; arbitrary provider claim text is never exposed. */
export class OidcAssuranceError extends Error {
  readonly numericAcr?: string;
  constructor(readonly reason: 'unmapped-acr' | 'below-minimum', acr: unknown, message: string) {
    super(message);
    this.name = 'OidcAssuranceError';
    this.numericAcr = typeof acr === 'string' && /^[0-9]{1,3}$/.test(acr) ? acr : undefined;
  }
}

export interface OidcAdapterConfig extends OidcBrowserAuthSessionConfig {
  displayName?: string;
  minAssurance: AssuranceLevel;
  browserSession?: OidcBrowserAuthSession;
  acrAssuranceMap?: AcrAssuranceMap;
  subjectRefFactory?: (issuer: string, subject: string) => Promise<string> | string;
}

export const defaultAcrAssuranceMap: AcrAssuranceMap = {
  L1: 'L1',
  l1: 'L1',
  'formspec:l1': 'L1',
  'urn:formspec:assurance:l1': 'L1',
  L2: 'L2',
  l2: 'L2',
  'formspec:l2': 'L2',
  'urn:formspec:assurance:l2': 'L2',
  L3: 'L3',
  l3: 'L3',
  'formspec:l3': 'L3',
  'urn:formspec:assurance:l3': 'L3',
  L4: 'L4',
  l4: 'L4',
  'formspec:l4': 'L4',
  'urn:formspec:assurance:l4': 'L4',
};

class IdentityInteractionStartedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityInteractionStartedError';
  }
}

export class OidcAdapter implements IdentityProvider {
  private readonly config: OidcAdapterConfig;
  readonly browserSession: OidcBrowserAuthSession;
  private readonly session = new IdentitySession();
  private hasClaim = false;

  constructor(config: OidcAdapterConfig) {
    this.config = config;
    this.browserSession = config.browserSession ?? new OidcBrowserAuthSession(config);
    this.browserSession.subscribe(() => this.clearClaim());
  }

  async discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]> {
    const option: IdpOption = {
      kind: 'oidc',
      issuer: this.config.issuer,
      displayName: this.config.displayName ?? this.config.issuer,
      minAssurance: this.config.minAssurance,
    };
    return meetsAssurance(option.minAssurance, formAssuranceRequirements) ? [option] : [];
  }

  async authenticate(option: IdpOption): Promise<IdentityClaim> {
    if (option.kind !== 'oidc' || option.issuer !== this.config.issuer) {
      throw new Error('OidcAdapter can only authenticate oidc options');
    }
    const state = await this.browserSession.getSession();
    if (!state) {
      await this.browserSession.begin();
      throw new IdentityInteractionStartedError('OIDC authentication redirect started');
    }
    const user = this.browserSession.admittedUser();
    if (!user) throw new Error('OIDC session is unavailable');
    if (state.issuer !== this.config.issuer || user.profile.iss !== this.config.issuer) {
      throw new Error('OIDC session issuer does not match the identity adapter');
    }
    const subject = user.profile.sub;
    if (typeof subject !== 'string' || !subject) {
      throw new Error('OIDC profile did not include a usable subject');
    }
    const assuranceLevel = assuranceLevelFromAcr(
      user.profile.acr,
      this.config.acrAssuranceMap ?? defaultAcrAssuranceMap,
    );
    if (assuranceRank(assuranceLevel) < Math.max(assuranceRank(option.minAssurance), assuranceRank(this.config.minAssurance))) {
      throw new OidcAssuranceError('below-minimum', user.profile.acr,
        `OIDC ACR resolved to ${assuranceLevel}, below required ${option.minAssurance}`,
      );
    }
    const subjectRef = await (this.config.subjectRefFactory ?? defaultSubjectRefFactory)(
      this.config.issuer,
      subject,
    );
    const current = await this.browserSession.getSession();
    if (!current || current.revision !== state.revision) throw new Error('OIDC session changed during identity normalization');
    const claim: IdentityClaim = {
      provider: this.config.issuer,
      adapter: 'oidc-client-ts',
      subjectRef,
      credentialType: 'oidc-token',
      credentialRef: user.id_token ? `oidc:${this.config.issuer}:id-token` : undefined,
      personhoodCheck: 'not-performed',
      subjectBinding: 'respondent',
      assuranceLevel,
      privacyTier: 'pseudonymous',
      evidenceRef: `oidc:${this.config.issuer}:acr`,
      expiresAt: state.expiresAt,
    };
    this.hasClaim = true;
    this.session.set(claim);
    return claim;
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    this.clearClaim();
    await this.browserSession.logout();
  }

  private clearClaim(): void {
    if (!this.hasClaim) return;
    this.hasClaim = false;
    this.session.set(null);
  }

  currentAccessToken(): Promise<string | undefined> {
    return this.browserSession.accessToken();
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    return this.session.subscribe(listener);
  }
}

export function createOidcAdapter(config: OidcAdapterConfig): OidcAdapter {
  return new OidcAdapter(config);
}

export function assuranceLevelFromAcr(acr: unknown, map: AcrAssuranceMap): AssuranceLevel {
  const acrValues = Array.isArray(acr) ? acr : [acr];
  const mapped = acrValues
    .filter((value): value is string => typeof value === 'string')
    .map((value) => Object.hasOwn(map, value) ? map[value] : undefined)
    .filter((value): value is AssuranceLevel => value !== undefined)
    .sort((left, right) => assuranceRank(right) - assuranceRank(left));
  const [highest] = mapped;
  if (!highest) {
    throw new OidcAssuranceError('unmapped-acr', acr, 'OIDC ACR did not map to a Formspec assurance level');
  }
  return highest;
}

async function defaultSubjectRefFactory(issuer: string, subject: string): Promise<string> {
  const payload = new TextEncoder().encode(`${issuer}\0${subject}`);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', payload);
    return `oidc:${hex(new Uint8Array(digest)).slice(0, 32)}`;
  }
  throw new Error('SHA-256 is unavailable; configure a subject reference mapper');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
