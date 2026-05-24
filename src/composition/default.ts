import { HttpDefinitionSource } from '../adapters/http/definition-source.ts';
import { HttpDraftStore } from '../adapters/http/draft-store.ts';
import { HttpSubmitTransport } from '../adapters/http/submit-transport.ts';
import {
  AnonymousSessionBridge,
  HttpAnonymousIdentityProvider,
} from '../adapters/http/anonymous-session.ts';
import { AttachmentRequirementExtractor } from '../adapters/composing/form-runtime-policy-extractor.ts';
import { AnonymousAdapter } from '../adapters/identity/anonymous.ts';
import { MagicLinkAdapter } from '../adapters/identity/magic-link.ts';
import { OidcAdapter } from '../adapters/identity/oidc.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import {
  freezeComposition,
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
 *
 * Narrowed-route compositions (`/status` per FW-0068, `/obligations` per
 * FW-0055, `/documents` per FW-0056) live in `./route-narrowing.ts` and are
 * parameterized by descriptor (FW-0070) — they are not siblings of this
 * factory; this file owns the full-app form-route composition only.
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
    attachmentStore: unavailableAttachmentStore(),
    // ADR-0011 §Rationale #1 ("reference deployments must be honest"):
    // production composition wires the unavailable* sentinels and declares
    // `unavailable` to match. Adopters who need the capability swap BOTH —
    // the wired adapter (per web ADR-0010 for respondent-place, FW-0039 for
    // status, FW-0033 for fileUpload) AND the declaration.
    // assertCompositionCoherence catches forks that update only one half.
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
      // FW-0056 slice 1: no production VP stack yet. SC-4 ratifies the
      // Verifiable Presentation Profile; EXT-18 lands the HPKE wrapper for
      // passkey-derived wallet encryption. Until those land, every production
      // composition declares documentPresentation unavailable — paired with
      // the same unavailable respondent-place sentinel (transitional port
      // mapping per feature-port-map.ts).
      documentPresentation: 'unavailable',
      // FW-0033 slice 1: the OSS reference composition does not ship an
      // object-store adapter — adopters fork to wire S3 / R2 / Azure Blob /
      // server-bundled / IPFS per their deployment. Forms with attachment
      // fields will fail-load with UnsupportedRequiredFeatureError until an
      // adapter is wired.
      fileUpload: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
      },
    } satisfies OrgRuntimePolicy,
    // FW-0066: AttachmentRequirementExtractor wraps the FW-0033 walker as a
    // FormRuntimePolicyExtractor port instance. Production deployments compose
    // additional extractors here as future feature ADRs land definition-
    // introspective walkers (via CompositeFormRuntimePolicyExtractor).
    formRuntimePolicyExtractor: new AttachmentRequirementExtractor(),
  };
  return freezeComposition(composition);
}

/**
 * Builds the real identity binding for a narrowed route. Split out from
 * the factory body so the construction only runs when MED-4's gate clears —
 * the function body still references `AnonymousSessionBridge` etc. but no
 * adapter is invoked until the function is called. Exported so the
 * parameterized route-narrowing factory (FW-0070) can reuse the same wiring
 * without duplicating the OIDC / magic-link / anonymous selection rules.
 */
export function buildRealIdentityProvider(
  config: FormspecWebConfig,
  notificationDelivery: ReturnType<typeof stubNotificationDelivery>,
  serverUrl: string,
): IdentityBinding {
  const baseHttpConfig = {
    baseUrl: serverUrl,
    tenantBinding: config.tenantBinding,
  };
  const initialDefinitionUrl = productionInitialDefinitionUrl(serverUrl);
  const anonymousSessions = new AnonymousSessionBridge(baseHttpConfig);
  return identityProviderFor(config, notificationDelivery, {
    anonymousSessions,
    initialDefinitionUrl,
  });
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

export interface IdentityBinding {
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
