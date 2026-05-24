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
} from '../adapters/noop-for-narrowed-route/index.ts';
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
  createDemoDocumentsRouteComposition,
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
      // FW-0056 slice 1: no production VP stack yet. SC-4 ratifies the
      // Verifiable Presentation Profile; EXT-18 lands the HPKE wrapper for
      // passkey-derived wallet encryption. Until those land, every production
      // composition declares documentPresentation unavailable — paired with
      // the same unavailable respondent-place sentinel (transitional port
      // mapping per feature-port-map.ts).
      documentPresentation: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
      },
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
 * `src/adapters/noop-for-narrowed-route/`). Constructed when `main.tsx` parses
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
    definitionSource: noopDefinitionSource('/status'),
    draftStore: noopDraftStore('/status'),
    submitTransport: noopSubmitTransport('/status'),
    identityProvider: noopIdentityProvider('/status'),
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    instanceCapabilities: {
      respondentPlace: 'unavailable',
      status: 'unavailable',
      // FW-0056 slice 1: no production VP stack (see createDefaultComposition
      // for rationale). Same unavailable declaration on every narrowed-route
      // sibling factory until SC-4 + EXT-18 land.
      documentPresentation: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
      },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
}

/**
 * Obligations-route sibling of {@link createDefaultComposition} (FW-0055
 * slice 1, coordinated with FW-0068).
 *
 * Wires `respondentPlaceSource` + the runtime-profile / policy slots.
 * Form-shaped MVP ports (`definitionSource`, `draftStore`, `submitTransport`)
 * are noop because the obligations route never reads them. `statusReader`
 * stays on the unavailable sentinel — the obligations page links to `/status`
 * via hyperlink, not via direct port call.
 *
 * Identity provider is gated on the gated `respondentPlace` capability
 * (MED-4): when the production composition declares `respondentPlace =
 * 'unavailable'` the surface renders the "not shared" copy and never reads
 * identity, so we short-circuit to `noopIdentityProvider()` rather than
 * eagerly construct an OIDC/magic-link/anonymous adapter that the page won't
 * use. The "check the declaration, then construct only what we need" shape
 * preserves boot honesty for future identity adapters that DO eager-work
 * (token refresh, IndexedDB reads) — those won't boot-fail when the gated
 * capability is off.
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
  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'unavailable',
    status: 'unavailable',
    // FW-0056 slice 1: see createDefaultComposition for the documentPresentation
    // unavailable rationale. The /obligations surface itself doesn't consume
    // documentPresentation; the key is declared here so the closed-taxonomy
    // type-check passes on every InstanceCapabilities literal.
    documentPresentation: 'unavailable',
  };
  const notificationDelivery = stubNotificationDelivery();
  // MED-4: identity is only wired when the gated respondent-place capability
  // is available. Today the production factory always declares
  // `respondentPlace: 'unavailable'`, so the noop branch always fires —
  // identical to the status-route factory's posture. When a real production
  // respondent-place adapter ships and the declaration moves to 'available',
  // this branch picks up identity wiring automatically.
  const identityProvider: IdentityProvider =
    instanceCapabilities.respondentPlace === 'available'
      ? buildRealIdentityProvider(config, notificationDelivery, serverUrl).provider
      : noopIdentityProvider('/obligations');

  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl: 'about:not-constructed#fw-0055',
    definitionSource: noopDefinitionSource('/obligations'),
    draftStore: noopDraftStore('/obligations'),
    submitTransport: noopSubmitTransport('/obligations'),
    identityProvider,
    notificationDelivery,
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    instanceCapabilities,
    orgRuntimePolicy: {
      features: { respondentPlace: 'allowed', status: 'allowed' },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
}

/**
 * Documents-route sibling of {@link createDefaultComposition} (FW-0056
 * slice 1, coordinated with FW-0068).
 *
 * Wires `respondentPlaceSource` (load-bearing — documents come from the
 * snapshot) + the runtime-profile / policy slots. Form-shaped MVP ports
 * (`definitionSource`, `draftStore`, `submitTransport`) are noop because the
 * documents route never reads them. `statusReader` stays on the unavailable
 * sentinel — `DocumentsRuntime` does not call it.
 *
 * Identity provider is gated on the gated `respondentPlace` capability per
 * the MED-4 pattern FW-0055 established: when the production composition
 * declares `respondentPlace = 'unavailable'`, the surface renders the
 * "not available" copy and never reads identity, so we short-circuit to
 * `noopIdentityProvider()` rather than eagerly construct OIDC/magic-link/
 * anonymous adapters that the page won't use. When a real production
 * respondent-place adapter ships, this branch picks up identity wiring
 * automatically.
 *
 * `documentPresentation` shares the `respondentPlaceSource` slot per the
 * transitional port mapping (see feature-port-map.ts); declared `unavailable`
 * here paired with `unavailableRespondentPlaceSource()` — same slot, same
 * provenance — to keep the coherence assertion satisfied. When SC-4 + EXT-18
 * ratify the real VP port, the slot mapping splits.
 *
 * Mirrors the FW-0068 status-route + FW-0055 obligations-route factories'
 * coherence funnel through `freezeComposition`.
 */
export function createDefaultDocumentsRouteComposition(
  config: FormspecWebConfig = departmentAppProfile,
): Composition {
  const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
  if (!serverUrl) {
    return createDemoDocumentsRouteComposition();
  }
  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'unavailable',
    status: 'unavailable',
    documentPresentation: 'unavailable',
  };
  const notificationDelivery = stubNotificationDelivery();
  const identityProvider: IdentityProvider =
    instanceCapabilities.respondentPlace === 'available'
      ? buildRealIdentityProvider(config, notificationDelivery, serverUrl).provider
      : noopIdentityProvider('/documents');

  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl: 'about:not-constructed#fw-0056',
    definitionSource: noopDefinitionSource('/documents'),
    draftStore: noopDraftStore('/documents'),
    submitTransport: noopSubmitTransport('/documents'),
    identityProvider,
    notificationDelivery,
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    instanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
      },
    } satisfies OrgRuntimePolicy,
    getFormRuntimePolicy: (): FormRuntimePolicy => ({ features: {} }),
  };
  return freezeComposition(composition);
}

/**
 * Builds the real identity binding for the obligations route. Split out from
 * the factory body so the construction only runs when MED-4's gate clears —
 * the function body still references `AnonymousSessionBridge` etc. but no
 * adapter is invoked until the function is called.
 */
function buildRealIdentityProvider(
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
