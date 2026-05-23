import { describe, expect, it } from 'vitest';
import { MagicLinkAdapter } from '../../../src/adapters/identity/magic-link.ts';
import { stubNotificationDelivery } from '../../../src/adapters/stub/notification-delivery.ts';
import type { IdentityClaim } from '../../../src/ports/identity-provider.ts';

describe('MagicLinkAdapter', () => {
  it('sends a magic-link notification and exchanges the callback for a claim', async () => {
    const notifications = stubNotificationDelivery();
    const exchangedClaim: IdentityClaim = {
      provider: 'magic-link',
      adapter: 'magic-link@0',
      subjectRef: 'magic:subject-1',
      credentialType: 'provider-assertion',
      credentialRef: 'magic-link:nonce-1',
      subjectBinding: 'respondent',
      assuranceLevel: 'L3',
      privacyTier: 'pseudonymous',
    };
    const adapter = new MagicLinkAdapter({
      notificationDelivery: notifications,
      callbackUrl: 'https://formspec.example.test/magic-link/callback',
      to: 'respondent@example.test',
      minAssurance: 'L3',
      nonceFactory: () => 'nonce-1',
      exchange: async (request) => {
        expect(request.magicLinkUrl).toBe(
          'https://formspec.example.test/magic-link/callback?token=nonce-1',
        );
        return exchangedClaim;
      },
    });
    const [option] = await adapter.discover('L3');
    if (!option) throw new Error('expected magic-link option');

    await expect(adapter.authenticate(option)).resolves.toEqual(exchangedClaim);
    expect(notifications.sent).toHaveLength(1);
    expect(notifications.sent[0]?.message.body).toContain(
      'https://formspec.example.test/magic-link/callback?token=nonce-1',
    );
  });

  it('rejects exchanges that return less assurance than the configured floor', async () => {
    const adapter = new MagicLinkAdapter({
      notificationDelivery: stubNotificationDelivery(),
      callbackUrl: 'https://formspec.example.test/magic-link/callback',
      to: 'respondent@example.test',
      minAssurance: 'L3',
      exchange: async () => ({
        provider: 'magic-link',
        adapter: 'magic-link@0',
        subjectRef: 'magic:subject-1',
        credentialType: 'provider-assertion',
        subjectBinding: 'respondent',
        assuranceLevel: 'L2',
        privacyTier: 'pseudonymous',
      }),
    });
    const [option] = await adapter.discover('L3');
    if (!option) throw new Error('expected magic-link option');

    await expect(adapter.authenticate(option)).rejects.toThrow(/below required/);
  });
});
