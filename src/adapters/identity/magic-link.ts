import type {
  AssuranceLevel,
  IdentityClaim,
  IdentityProvider,
  IdpOption,
  Unsubscribe,
} from '../../ports/identity-provider.ts';
import type {
  NotificationChannel,
  NotificationDelivery,
} from '../../ports/notification-delivery.ts';
import { generateIdempotencyKey } from '../../shared/idempotency-key.ts';
import { IdentitySession, assuranceRank, meetsAssurance, randomUuid } from './assurance.ts';

export interface MagicLinkExchangeRequest {
  nonce: string;
  channel: NotificationChannel;
  to: string;
  magicLinkUrl: string;
  minAssurance: AssuranceLevel;
}

export interface MagicLinkAdapterConfig {
  notificationDelivery: NotificationDelivery;
  exchange: (request: MagicLinkExchangeRequest) => Promise<IdentityClaim>;
  callbackUrl: string | ((nonce: string) => string);
  to: string;
  channel?: Extract<NotificationChannel, 'email' | 'sms'>;
  minAssurance: Extract<AssuranceLevel, 'L2' | 'L3' | 'L4'>;
  subject?: string;
  body?: (magicLinkUrl: string) => string;
  nonceFactory?: () => string;
  idempotencyKeyFactory?: () => string;
}

export class MagicLinkAdapter implements IdentityProvider {
  private readonly config: MagicLinkAdapterConfig;
  private readonly session = new IdentitySession();

  constructor(config: MagicLinkAdapterConfig) {
    this.config = config;
  }

  async discover(formAssuranceRequirements?: AssuranceLevel): Promise<IdpOption[]> {
    const option: IdpOption = {
      kind: 'magic-link',
      channel: this.config.channel ?? 'email',
      minAssurance: this.config.minAssurance,
    };
    return meetsAssurance(option.minAssurance, formAssuranceRequirements) ? [option] : [];
  }

  async authenticate(option: IdpOption): Promise<IdentityClaim> {
    if (option.kind !== 'magic-link') {
      throw new Error('MagicLinkAdapter can only authenticate magic-link options');
    }
    const nonce = this.config.nonceFactory?.() ?? randomUuid();
    const magicLinkUrl = resolveMagicLinkUrl(this.config.callbackUrl, nonce);
    await this.config.notificationDelivery.send(
      {
        channel: this.config.channel ?? 'email',
        to: this.config.to,
        subject: this.config.subject ?? 'Your Formspec sign-in link',
        body: this.config.body?.(magicLinkUrl) ?? `Use this link to continue: ${magicLinkUrl}`,
        extensions: { 'x-formspec-magic-link-url': magicLinkUrl },
      },
      this.config.idempotencyKeyFactory?.() ?? generateIdempotencyKey(),
    );
    const claim = await this.config.exchange({
      nonce,
      channel: this.config.channel ?? 'email',
      to: this.config.to,
      magicLinkUrl,
      minAssurance: this.config.minAssurance,
    });
    if (assuranceRank(claim.assuranceLevel) < assuranceRank(this.config.minAssurance)) {
      throw new Error(
        `Magic-link exchange returned ${claim.assuranceLevel}, below required ${this.config.minAssurance}`,
      );
    }
    const normalizedClaim = { ...claim, adapter: claim.adapter || 'magic-link@0' };
    this.session.set(normalizedClaim);
    return normalizedClaim;
  }

  async revoke(_claim: IdentityClaim): Promise<void> {
    this.session.set(null);
  }

  subscribe(listener: (claim: IdentityClaim | null) => void): Unsubscribe {
    return this.session.subscribe(listener);
  }
}

export function createMagicLinkAdapter(config: MagicLinkAdapterConfig): MagicLinkAdapter {
  return new MagicLinkAdapter(config);
}

function resolveMagicLinkUrl(callbackUrl: MagicLinkAdapterConfig['callbackUrl'], nonce: string): string {
  if (typeof callbackUrl === 'function') {
    return callbackUrl(nonce);
  }
  const url = new URL(callbackUrl, globalThis.location?.origin ?? 'https://formspec.local');
  url.searchParams.set('token', nonce);
  return url.toString();
}
