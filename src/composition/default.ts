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
import {
  noopDefinitionSource,
  noopDraftStore,
  noopIdentityProvider,
  noopSubmitTransport,
} from '../adapters/noop-for-status-route/index.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import {
  freezeComposition,
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
import {
  createDemoComposition,
  createDemoObligationsRouteComposition,
  createDemoStatusRouteComposition,
} from './demo.ts';
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
  return freezeComposition(composition);
}

/**
 * Status-route sibling of {@link createDefaultComposition} (FW-0068).
 *
 * Wires the production `statusReader` + the runtime-profile / policy slots
 * StatusRuntime reads; every other port is a noop that throws on call (see
 * `src/adapters/noop-for-status-route/`). Constructed when `main.tsx` parses
 * the URL as a `/status?case=...` route, so the production HTTP / OIDC /
 * anonymous-session machinery never boots on that surface.
 *
 * Closes the FW-0039 H-1 architectural debt — the slice-1 accountless-access
 * claim was honest at the consumer level (`StatusRuntime` does not USE
 * non-status ports) but false at the composition level until this factory
 * landed.
 */
export function createDefaultStatusRouteComposition(
  config: FormspecWebConfig = departmentAppProfile,
): Composition {
  const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
  if (!serverUrl) {
    return createDemoStatusRouteComposition();
  }
  // Production-mode status route. statusReader stays on the
  // unavailable sentinel until the production ProxiedApplicantStatusAdapter
  // ships (FW-0039 release gap b). Non-status MVP ports are noops because the
  // /status route never reads them — and the coherence assertion runs
  // through freezeComposition just like the full-app sibling.
  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl: 'about:not-constructed#fw-0068',
    definitionSource: noopDefinitionSource(),
    draftStore: noopDraftStore(),
    submitTransport: noopSubmitTransport(),
    identityProvider: noopIdentityProvider(),
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
}

/**
 * Obligations-route sibling of {@link createDefaultComposition} (FW-0055
 * slice 1, coordinated with FW-0068).
 *
 * Wires `respondentPlaceSource` + `identityProvider` (real — the /obligations
 * surface is identity-bound per design §"Why identity-required") + the runtime-
 * profile / policy slots. Form-shaped MVP ports (`definitionSource`,
 * `draftStore`, `submitTransport`) are noop because the obligations route never
 * reads them. `statusReader` stays on the unavailable sentinel — the obligations
 * page links to `/status` via hyperlink, not via direct port call.
 *
 * Mirrors the FW-0068 status-route factory's coherence funnel through
 * `freezeComposition`.
 */
export function createDefaultObligationsRouteComposition(
  config: FormspecWebConfig = departmentAppProfile,
): Composition {
  const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
  if (!serverUrl) {
    return createDemoObligationsRouteComposition();
  }
  const notificationDelivery = stubNotificationDelivery();
  const baseHttpConfig = {
    baseUrl: serverUrl,
    tenantBinding: config.tenantBinding,
  };
  const initialDefinitionUrl = productionInitialDefinitionUrl(serverUrl);
  // Identity-required surface: wire the real identity provider so the
  // auth-required state can render. Anonymous-session bridge stays available
  // for adopters who wire an anonymous identity binding, identical to the
  // full-app factory.
  const anonymousSessions = new AnonymousSessionBridge(baseHttpConfig);
  const identityBinding = identityProviderFor(config, notificationDelivery, {
    anonymousSessions,
    initialDefinitionUrl,
  });

  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl: 'about:not-constructed#fw-0055',
    definitionSource: noopDefinitionSource(),
    draftStore: noopDraftStore(),
    submitTransport: noopSubmitTransport(),
    identityProvider: identityBinding.provider,
    notificationDelivery,
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
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
