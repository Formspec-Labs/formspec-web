import { AnonymousAdapter } from '../../../src/adapters/identity/anonymous.ts';
import { MagicLinkAdapter } from '../../../src/adapters/identity/magic-link.ts';
import { OidcAdapter, type OidcClientDriver } from '../../../src/adapters/identity/oidc.ts';
import { stubIdentityProvider } from '../../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../../src/adapters/stub/notification-delivery.ts';
import type { IdentityClaim } from '../../../src/ports/identity-provider.ts';
import { defineIdentityProviderConformance } from '../_framework/conformance.ts';

defineIdentityProviderConformance('stub IdentityProvider conformance', () => ({
  adapter: stubIdentityProvider(),
}));

defineIdentityProviderConformance('anonymous IdentityProvider conformance', () => ({
  adapter: new AnonymousAdapter(),
}));

defineIdentityProviderConformance('OIDC IdentityProvider conformance', () => {
  const driver: OidcClientDriver = {
    getUser: async () => ({
      access_token: 'access-token',
      id_token: 'id-token',
      profile: {
        sub: 'subject-1',
        acr: 'urn:formspec:assurance:l3',
      },
    }),
  };
  return {
    adapter: new OidcAdapter({
      issuer: 'https://idp.example.test',
      clientId: 'formspec-web',
      minAssurance: 'L3',
      driver,
      subjectRefFactory: () => 'oidc:conformance-subject',
    }),
  };
});

defineIdentityProviderConformance('magic-link IdentityProvider conformance', () => ({
  adapter: new MagicLinkAdapter({
    notificationDelivery: stubNotificationDelivery(),
    callbackUrl: 'https://formspec.example.test/magic-link/callback',
    to: 'respondent@example.test',
    minAssurance: 'L3',
    exchange: async (): Promise<IdentityClaim> => ({
      provider: 'magic-link',
      adapter: 'magic-link@0',
      subjectRef: 'magic:conformance-subject',
      credentialType: 'provider-assertion',
      credentialRef: 'magic-link:conformance',
      subjectBinding: 'respondent',
      assuranceLevel: 'L3',
      privacyTier: 'pseudonymous',
    }),
  }),
}));
