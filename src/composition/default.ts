import { HttpDefinitionSource } from '../adapters/http/definition-source.ts';
import { HttpDraftStore } from '../adapters/http/draft-store.ts';
import { HttpSubmitTransport } from '../adapters/http/submit-transport.ts';
import {
  AnonymousSessionBridge,
  HttpAnonymousIdentityProvider,
} from '../adapters/http/anonymous-session.ts';
import { AnonymousAdapter } from '../adapters/identity/anonymous.ts';
import { MagicLinkAdapter } from '../adapters/identity/magic-link.ts';
import { OidcAdapter } from '../adapters/identity/oidc.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import {
  assertCompositionCoherence,
  type FormRuntimePolicy,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../policy/index.ts';
import { demoSampleFormUrl } from '../demo/index.ts';
import type { AccessTokenProvider } from '../adapters/http/http-client.ts';
import type { DraftKey } from '../ports/draft-store.ts';
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
  assertReferenceHttpDataPorts(config);

  const notificationDelivery = stubNotificationDelivery();
  const baseHttpConfig = {
    baseUrl: serverUrl,
    tenantBinding: config.tenantBinding,
  };
  const initialDefinitionUrl = productionInitialDefinitionUrl(serverUrl);
  const anonymousSessions = new AnonymousSessionBridge(baseHttpConfig);
  const identityBinding = identityProviderFor(config, notificationDelivery, {
    anonymousSessions,
    initialDefinitionUrl,
  });
  const httpConfig = identityBinding.accessToken
    ? { ...baseHttpConfig, accessToken: identityBinding.accessToken }
    : baseHttpConfig;
  const draftStore = new HttpDraftStore({
    ...httpConfig,
    anonymousSessionToken: (key) => anonymousSessions.tokenForDraftKey(key),
  });

  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl,
    definitionSource: new HttpDefinitionSource(httpConfig),
    draftStore,
    submitTransport: new HttpSubmitTransport({
      ...httpConfig,
      draftIdResolver: (handoff) => draftIdFromHandoff(handoff, draftStore),
      anonymousSessionToken: (handoff) => anonymousSessions.tokenForHandoff(handoff),
    }),
    identityProvider: identityBinding.provider,
    notificationDelivery,
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    // ADR-0011 §Rationale #1 ("reference deployments must be honest"):
    // production composition wires the unavailable* sentinels and declares
    // `unavailable` to match. Adopters who need the capability swap BOTH —
    // the wired adapter (per web ADR-0010 for respondent-place, FW-0039 for
    // status) AND the declaration. assertCompositionCoherence (Task 10b)
    // catches forks that update only one half.
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  assertCompositionCoherence(composition);
  return composition;
}

function assertReferenceHttpDataPorts(config: FormspecWebConfig): void {
  const mismatches = (['definitionSource', 'draftStore', 'submitTransport'] as const)
    .filter((portName) => config.ports[portName] !== 'reference-http');
  if (mismatches.length > 0) {
    throw new Error(
      `formspecServerUrl requires reference-http data ports: ${mismatches.join(', ')}`,
    );
  }
}

interface IdentityBinding {
  provider: IdentityProvider;
  accessToken?: AccessTokenProvider;
}

function identityProviderFor(
  config: FormspecWebConfig,
  notificationDelivery: ReturnType<typeof stubNotificationDelivery>,
  productionContext?: {
    anonymousSessions: AnonymousSessionBridge;
    initialDefinitionUrl: string;
  },
): IdentityBinding {
  if (config.ports.identityProvider === 'anonymous') {
    if (productionContext) {
      return {
        provider: new HttpAnonymousIdentityProvider({
          bridge: productionContext.anonymousSessions,
          formUrl: productionContext.initialDefinitionUrl,
        }),
      };
    }
    return { provider: new AnonymousAdapter() };
  }

  if (config.ports.identityProvider === 'oidc' && config.identity.oidc) {
    const provider = new OidcAdapter(config.identity.oidc);
    return {
      provider,
      accessToken: () => provider.currentAccessToken(),
    };
  }

  const magicLink =
    config.identity.mode === 'anonymous-allowed' ? config.identity.magicLink : undefined;
  if (config.ports.identityProvider === 'magic-link' && magicLink) {
    return {
      provider: new MagicLinkAdapter({
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
      }),
    };
  }

  return { provider: new AnonymousAdapter() };
}

function draftIdFromHandoff(
  handoff: IntakeHandoff,
  draftStore: HttpDraftStore,
): string | undefined {
  const draftId = handoff.extensions?.['x-formspec-draft-id'];
  if (typeof draftId === 'string') {
    return draftId;
  }
  const draftKey = draftKeyFromHandoff(handoff);
  return draftKey ? draftStore.draftIdFor(draftKey) : undefined;
}

function draftKeyFromHandoff(handoff: IntakeHandoff): DraftKey | undefined {
  const candidate = handoff.extensions?.['x-formspec-draft-key'];
  if (!isRecord(candidate) || typeof candidate.formUrl !== 'string') {
    return undefined;
  }
  return {
    formUrl: candidate.formUrl,
    formVersion: typeof candidate.formVersion === 'string' ? candidate.formVersion : undefined,
    subjectRef: typeof candidate.subjectRef === 'string' ? candidate.subjectRef : undefined,
  };
}

function productionInitialDefinitionUrl(serverUrl: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/runtime/forms/${demoFormId()}`;
}

function demoFormId(): string {
  return demoSampleFormUrl.split('/').filter(Boolean).at(-1) ?? 'demo-intake';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
