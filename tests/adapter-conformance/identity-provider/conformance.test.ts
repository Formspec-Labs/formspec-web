import {
  AnonymousSessionBridge,
  HttpAnonymousIdentityProvider,
} from '../../../src/adapters/http/anonymous-session.ts';
import { CompositeIdentityProvider } from '../../../src/adapters/composing/identity-provider.ts';
import { AnonymousAdapter } from '../../../src/adapters/identity/anonymous.ts';
import { MagicLinkAdapter } from '../../../src/adapters/identity/magic-link.ts';
import { OidcAdapter, type OidcClientDriver } from '../../../src/adapters/identity/oidc.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';
import { stubIdentityProvider } from '../../../src/adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../../../src/adapters/stub/notification-delivery.ts';
import type { IdentityClaim } from '../../../src/ports/identity-provider.ts';
import { jsonResponse, recordingFetch } from '../../adapters/http/test-fetch.ts';
import { defineIdentityProviderConformance } from '../_framework/conformance.ts';

defineIdentityProviderConformance('stub IdentityProvider conformance', () => ({
  adapter: stubIdentityProvider(),
}));

defineIdentityProviderConformance('anonymous IdentityProvider conformance', () => ({
  adapter: new AnonymousAdapter(),
}));

defineIdentityProviderConformance('HTTP anonymous IdentityProvider conformance', () => {
  const { fetch } = recordingFetch(() =>
    jsonResponse({
      session_token: 'anonymous-token-1',
      subject_ref: 'anon:server-subject',
      form_id: 'conformance',
      expires_at: '2099-01-01T00:00:00.000Z',
    }),
  );
  const bridge = new AnonymousSessionBridge({
    baseUrl: 'https://formspec-server.example.test',
    fetchImpl: fetch,
  });
  return {
    adapter: new HttpAnonymousIdentityProvider({
      bridge,
      formUrl: sampleFormDefinition.url,
      formVersion: sampleFormDefinition.version,
    }),
  };
});

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

// FW-0028 — the composing adapter that aggregates multiple IdentityProviders
// behind one port slot must itself satisfy the same conformance contract.
defineIdentityProviderConformance('composite IdentityProvider conformance', () => ({
  adapter: new CompositeIdentityProvider([
    new AnonymousAdapter(),
    new MagicLinkAdapter({
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
  ]),
}));
