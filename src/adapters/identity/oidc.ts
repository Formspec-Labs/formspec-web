import { UserManager, type User, type UserManagerSettings } from 'oidc-client-ts';
import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';
import { IdentitySession, assuranceRank, meetsAssurance } from './assurance.ts';

export interface OidcClientDriver {
  getUser(): Promise<OidcUserLike | null>;
  signinSilent?(): Promise<OidcUserLike | null>;
  signinRedirect?(): Promise<void>;
  removeUser?(): Promise<void>;
}

export interface OidcUserLike {
  access_token?: string;
  id_token?: string;
  profile: {
    sub?: unknown;
    acr?: unknown;
    email?: unknown;
    name?: unknown;
  } & Record<string, unknown>;
  expires_at?: number;
}

export type AcrAssuranceMap = Record<string, AssuranceLevel>;

export interface OidcAdapterConfig {
  issuer: string;
  clientId: string;
  redirectUri?: string;
  displayName?: string;
  minAssurance: AssuranceLevel;
  driver?: OidcClientDriver;
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
  private readonly driver: OidcClientDriver;
  private readonly session = new IdentitySession();

  constructor(config: OidcAdapterConfig) {
    this.config = config;
    this.driver = config.driver ?? createOidcClientTsDriver(config);
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
    if (option.kind !== 'oidc') {
      throw new Error('OidcAdapter can only authenticate oidc options');
    }
    const user = await this.resolveUser();
    const subject = user.profile.sub;
    if (typeof subject !== 'string' || !subject) {
      throw new Error('OIDC profile did not include a usable subject');
    }
    const assuranceLevel = assuranceLevelFromAcr(
      user.profile.acr,
      this.config.acrAssuranceMap ?? defaultAcrAssuranceMap,
    );
    if (assuranceRank(assuranceLevel) < assuranceRank(option.minAssurance)) {
      throw new Error(
        `OIDC ACR resolved to ${assuranceLevel}, below required ${option.minAssurance}`,
      );
    }
    const subjectRef = await (this.config.subjectRefFactory ?? defaultSubjectRefFactory)(
      this.config.issuer,
      subject,
    );
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
      expiresAt: expiresAt(user),
    };
    this.session.set(claim);
    return claim;
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    await this.driver.removeUser?.();
    this.session.set(null);
  }

  async currentAccessToken(): Promise<string | undefined> {
    const current = await this.driver.getUser();
    const token = accessTokenFromUser(current);
    if (token || !this.driver.signinSilent || !tokenNeedsSilentRenewal(current)) {
      return token;
    }
    try {
      return accessTokenFromUser(await this.driver.signinSilent());
    } catch {
      return undefined;
    }
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    return this.session.subscribe(listener);
  }

  private async resolveUser(): Promise<OidcUserLike> {
    const silentUser = await this.driver.signinSilent?.();
    const user = silentUser ?? (await this.driver.getUser());
    if (user) {
      return user;
    }
    if (!this.driver.signinRedirect) {
      throw new Error('OIDC authentication redirect is not configured');
    }
    await this.driver.signinRedirect();
    throw new IdentityInteractionStartedError(
      'OIDC authentication redirect started before a user claim was available',
    );
  }
}

export function createOidcAdapter(config: OidcAdapterConfig): OidcAdapter {
  return new OidcAdapter(config);
}

export function assuranceLevelFromAcr(acr: unknown, map: AcrAssuranceMap): AssuranceLevel {
  const acrValues = Array.isArray(acr) ? acr : [acr];
  const mapped = acrValues
    .filter((value): value is string => typeof value === 'string')
    .map((value) => map[value])
    .filter((value): value is AssuranceLevel => value !== undefined)
    .sort((left, right) => assuranceRank(right) - assuranceRank(left));
  const [highest] = mapped;
  if (!highest) {
    throw new Error('OIDC ACR did not map to a Formspec assurance level');
  }
  return highest;
}

function createOidcClientTsDriver(config: OidcAdapterConfig): OidcClientDriver {
  const settings: UserManagerSettings = {
    authority: config.issuer,
    client_id: config.clientId,
    redirect_uri: config.redirectUri ?? globalThis.location?.href,
    response_type: 'code',
    scope: 'openid profile email',
  };
  const manager = new UserManager(settings);
  return {
    getUser: () => manager.getUser() as Promise<User | null>,
    signinSilent: () => manager.signinSilent() as Promise<User | null>,
    signinRedirect: () => manager.signinRedirect(),
    removeUser: () => manager.removeUser(),
  };
}

async function defaultSubjectRefFactory(issuer: string, subject: string): Promise<string> {
  const payload = new TextEncoder().encode(`${issuer}\0${subject}`);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', payload);
    return `oidc:${hex(new Uint8Array(digest)).slice(0, 32)}`;
  }
  return `oidc:${fallbackHash(`${issuer}\0${subject}`)}`;
}

function expiresAt(user: OidcUserLike): string | undefined {
  return user.expires_at ? new Date(user.expires_at * 1000).toISOString() : undefined;
}

function accessTokenFromUser(user: OidcUserLike | null | undefined): string | undefined {
  if (!user?.access_token || tokenNeedsSilentRenewal(user)) {
    return undefined;
  }
  return user.access_token;
}

function tokenNeedsSilentRenewal(user: OidcUserLike | null | undefined): boolean {
  if (!user?.expires_at) {
    return false;
  }
  return user.expires_at * 1000 <= Date.now();
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
