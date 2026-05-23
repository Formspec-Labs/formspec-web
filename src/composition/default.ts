import { HttpDefinitionSource } from '../adapters/http/definition-source.ts';
import { HttpDraftStore } from '../adapters/http/draft-store.ts';
import { HttpSubmitTransport } from '../adapters/http/submit-transport.ts';
import { AnonymousAdapter } from '../adapters/identity/anonymous.ts';
import { MagicLinkAdapter } from '../adapters/identity/magic-link.ts';
import { OidcAdapter } from '../adapters/identity/oidc.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import { demoSampleFormUrl } from '../demo/index.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';
import type { IntakeHandoff } from '../ports/submit-transport.ts';
import { departmentAppProfile } from '../profiles/profiles.ts';
import { createDemoComposition } from './demo.ts';
import type { Composition } from './types.ts';

/**
 * Default composition for the OSS reference deployment. Without an explicit
 * FORMSPEC server URL it stays in demo mode; production mode is selected by
 * runtime env and wires the M4 HTTP reference adapters.
 */
export function createDefaultComposition(config: FormspecWebConfig = departmentAppProfile): Composition {
  const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
  if (!serverUrl) {
    return createDemoComposition();
  }

  const notificationDelivery = stubNotificationDelivery();
  const httpConfig = {
    baseUrl: serverUrl,
    tenantBinding: config.tenantBinding,
  };

  return {
    mode: 'production',
    initialDefinitionUrl: productionInitialDefinitionUrl(serverUrl),
    definitionSource: new HttpDefinitionSource(httpConfig),
    draftStore: new HttpDraftStore(httpConfig),
    submitTransport: new HttpSubmitTransport({
      ...httpConfig,
      draftIdResolver: draftIdFromHandoff,
    }),
    identityProvider: identityProviderFor(config, notificationDelivery),
    notificationDelivery,
  };
}

function identityProviderFor(
  config: FormspecWebConfig,
  notificationDelivery: ReturnType<typeof stubNotificationDelivery>,
): IdentityProvider {
  if (config.ports.identityProvider === 'anonymous') {
    return new AnonymousAdapter();
  }

  if (config.ports.identityProvider === 'oidc' && config.identity.oidc) {
    return new OidcAdapter(config.identity.oidc);
  }

  const magicLink =
    config.identity.mode === 'anonymous-allowed' ? config.identity.magicLink : undefined;
  if (config.ports.identityProvider === 'magic-link' && magicLink) {
    return new MagicLinkAdapter({
      notificationDelivery,
      callbackUrl: magicLink.callbackPath,
      to: 'respondent@example.test',
      minAssurance: magicLink.minAssurance,
      exchange: async () => ({
        provider: 'magic-link',
        adapter: 'magic-link@0',
        subjectRef: 'magic-link:pending',
        credentialType: 'provider-assertion',
        subjectBinding: 'respondent',
        assuranceLevel: magicLink.minAssurance,
        privacyTier: 'pseudonymous',
      }),
    });
  }

  return new AnonymousAdapter();
}

function draftIdFromHandoff(handoff: IntakeHandoff): string | undefined {
  const draftId = handoff.extensions?.['x-formspec-draft-id'];
  return typeof draftId === 'string' ? draftId : undefined;
}

function productionInitialDefinitionUrl(serverUrl: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/runtime/forms/${demoFormId()}`;
}

function demoFormId(): string {
  return demoSampleFormUrl.split('/').filter(Boolean).at(-1) ?? 'demo-intake';
}
