import type { SurfaceScreenerCompletionPolicy } from '@formspec-org/surface-react';
import { OidcBrowserAuthSession } from '../adapters/identity/oidc-browser-session.ts';
import type { BrowserAuthSession } from '../ports/browser-auth-session.ts';
import type { OidcClientConfig } from '../config/types.ts';
import { respondentSurfaceDeploymentIsConfigured } from '../config/respondent-surface.ts';
import { readNativePackageSigningConfig } from '../config/native-package-signing.ts';
import { createNativePackageComposition } from './native-package.ts';
import { HttpAttachmentStore } from '../adapters/http/attachment-store.ts';
import { publishedDefinitionDraftStore } from '../adapters/composing/published-definition-draft-store.ts';
import { createHttpAdapterCohort } from '../adapters/http/cohort.ts';
import { createBrowserDraftResumeMetadataStore } from '../adapters/browser/draft-resume-metadata.ts';
import { PinnedPackageDefinitionSource } from '../adapters/http/pinned-package-definition-source.ts';
import { defaultFormIdResolver } from '../adapters/http/form-id.ts';
import { HttpDefinitionSource } from '../adapters/http/definition-source.ts';
import {
  AnonymousSessionBridge,
  HttpAnonymousIdentityProvider,
} from '../adapters/http/anonymous-session.ts';
import {
  createHttpResponseActionLedgerCapabilityProvider,
  createHttpResponseActionLedgerInvokerFactory,
} from '../adapters/http/response-action-ledger.ts';
import { createBrowserSurfaceRouter } from '../adapters/browser/surface-router.ts';
import {
  AttachmentRequirementExtractor,
  CompositeFormRuntimePolicyExtractor,
  EmbeddableExtractor,
  MultiPartyPolicyExtractor,
  OfflineSubmitRequirementExtractor,
  PaymentRequirementExtractor,
  RecordLifecycleExtractor,
  SafeAddressPolicyExtractor,
  TrustedReviewerPolicyExtractor,
} from '../adapters/composing/form-runtime-policy-extractor.ts';
import { AnonymousAdapter } from '../adapters/identity/anonymous.ts';
import { MagicLinkAdapter } from '../adapters/identity/magic-link.ts';
import { OidcAdapter } from '../adapters/identity/oidc.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableEmbedTransport } from '../adapters/unavailable/embed-transport.ts';
import { unavailableLifecycleActionClient } from '../adapters/unavailable/lifecycle-action-client.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import { unavailablePaymentRailAdapter } from '../adapters/unavailable/payment-rail-adapter.ts';
import { unavailableReviewerSession } from '../adapters/unavailable/reviewer-session.ts';
import { unavailableReviewThreadStore } from '../adapters/unavailable/review-thread-store.ts';
import { unavailableSafeAddressDirectory } from '../adapters/unavailable/safe-address-directory.ts';
import { unavailableRespondentHistorySource } from '../adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableScreenerDocumentSource } from '../adapters/unavailable/screener-document-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import { unavailableSurfaceBundleSource } from '../adapters/unavailable/surface-bundle-source.ts';
import { unavailableSurfaceBundleVerifier } from '../adapters/unavailable/surface-bundle-verifier.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../policy/index.ts';
import { demoSampleFormUrl } from '../demo/index.ts';
import type { AccessTokenProvider } from '../adapters/http/http-client.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';
import { departmentAppProfile } from '../profiles/profiles.ts';
import { createDemoComposition } from './demo.ts';
import type { Composition } from './types.ts';
import type { SurfaceRouteState } from '../ports/surface-router.ts';

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
export interface DefaultCompositionOptions {
  initialDefinitionUrl?: string;
  packageUrl?: string;
  selectedResponseId?: string;
  surfaceRoute?: SurfaceRouteState;
  /** Application-owned identity and API credential dependencies. */
  identityBinding?: IdentityBinding;
  /** Explicit trusted host policy for native package Screener completion. */
  screenerCompletion?: SurfaceScreenerCompletionPolicy;
}

export function createDefaultComposition(
  config: FormspecWebConfig = departmentAppProfile,
  options: DefaultCompositionOptions = {},
): Composition {
  const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
  const nativeSigning = readNativePackageSigningConfig(config.referenceAdapters?.formspecStack);
  if (nativeSigning) {
    if (respondentSurfaceDeploymentIsConfigured(config)) throw new Error('Native package and signed Surface deployments cannot both be active');
    if (!serverUrl || !options.packageUrl) throw new Error('Native package signing requires an explicit package URL and server');
    assertReferenceHttpDataPorts(config);
    const identityBinding = config.ports.identityProvider === 'oidc'
      ? options.identityBinding ?? (config.identity.oidc ? createOidcIdentityBinding(config.identity.oidc) : undefined)
      : undefined;
    return createNativePackageComposition(config, { signing: nativeSigning, packageUrl: options.packageUrl, identityBinding, screenerCompletion: options.screenerCompletion,
      initialDefinitionUrl: options.initialDefinitionUrl ?? productionInitialDefinitionUrl(serverUrl) });
  }
  if (!serverUrl) {
    return createDemoComposition();
  }
  assertReferenceHttpDataPorts(config);
  if (config.identity.mode === 'oidc-required' && config.ports.identityProvider !== 'oidc') {
    throw new Error('OIDC-required identity policy requires the OIDC provider');
  }

  const notificationDelivery = stubNotificationDelivery();
  const baseHttpConfig = {
    baseUrl: serverUrl,
    tenantBinding: config.tenantBinding,
  };
  const initialDefinitionUrl = options.initialDefinitionUrl ?? productionInitialDefinitionUrl(serverUrl);
  const packageSource = options.packageUrl ? new PinnedPackageDefinitionSource(options.packageUrl) : undefined;
  const resumeMetadata = options.packageUrl
    ? createBrowserDraftResumeMetadataStore(baseHttpConfig)
    : undefined;
  const packageFormIdResolver = options.packageUrl
    ? () => defaultFormIdResolver(initialDefinitionUrl)
    : undefined;
  const anonymousSessions = new AnonymousSessionBridge({
    ...baseHttpConfig,
    resumeMetadata,
    ...(packageSource ? { validateFormContext: async (formUrl: string, version?: string) => {
      const definition = await packageSource.getDefinition();
      if ((formUrl !== initialDefinitionUrl && formUrl !== definition.url)
        || (version !== undefined && version !== definition.version)) {
        throw new Error('Anonymous package session does not match its declared form URL and version');
      }
    } } : {}),
    ...(packageFormIdResolver ? { formIdResolver: packageFormIdResolver } : {}),
  });
  // Authored local preview is an explicit anonymous package capability.
  // It has no sign-in lifecycle or external bearer, even under a managed profile.
  const previewIdentityProvider: IdentityProvider = {
    async discover() { return []; },
    async authenticate() { throw new Error('Local package preview has no sign-in provider'); },
    async revoke() {},
    subscribe(listener) { listener(null); return () => {}; },
  };
  const authenticatedPackage = !!options.packageUrl && config.ports.identityProvider === 'oidc';
  const identityBinding: IdentityBinding = options.packageUrl && !authenticatedPackage
    ? { provider: previewIdentityProvider }
    : options.identityBinding ?? identityProviderFor(config, notificationDelivery, {
    anonymousSessions,
    initialDefinitionUrl,
  });
  if (authenticatedPackage && (!identityBinding.accessToken || !identityBinding.browserAuthSession)) {
    throw new Error('Authenticated package requires the selected OIDC session and bearer provider');
  }
  const accessToken = authenticatedPackage ? async () => {
    const token = await identityBinding.accessToken!();
    if (!token) throw new Error('Selected OIDC session is unavailable');
    return token;
  } : identityBinding.accessToken;
  const httpConfig = accessToken
    ? { ...baseHttpConfig, accessToken }
    : baseHttpConfig;
  const { draftStore, submitTransport } = createHttpAdapterCohort({
    ...httpConfig,
    anonymousSessions,
    resumeMetadata,
    ...(packageFormIdResolver ? { formIdResolver: packageFormIdResolver } : {}),
    ...(options.selectedResponseId
      ? { responseIdResolver: () => options.selectedResponseId }
      : {}),
  });
  if (options.packageUrl) {
    // Local authored-package preview uses shared host controls with real server
    // attachment custody, drafts, and submission.
    const preview = createDemoComposition();
    const source = packageSource!;
    return freezeComposition({
      ...preview,
      localPackagePreview: true,
      // Preserve an explicitly selected OIDC identity; anonymous previews use server sessions.
      identityProvider: identityBinding.provider,
      browserAuthSession: identityBinding.browserAuthSession,
      offlineSubmitQueue: unavailableOfflineSubmitQueue(),
      instanceCapabilities: { ...preview.instanceCapabilities, offlineSubmit: 'unavailable', fileUpload: 'available' },
      attachmentStore: new HttpAttachmentStore({
        ...httpConfig,
        maxUploadBytes: config.referenceAdapters?.formspecStack?.attachments?.maxUploadBytes,
        formId: defaultFormIdResolver(initialDefinitionUrl),
        accessToken: accessToken
          ?? (async () => (await anonymousSessions.sessionForForm(initialDefinitionUrl)).sessionToken),
      }),
      initialDefinitionUrl,
      definitionSource: source,
      draftStore: publishedDefinitionDraftStore(
        draftStore,
        () => source.getDefinition(),
        () => new HttpDefinitionSource(httpConfig).getDefinition(initialDefinitionUrl),
      ),
      submitTransport,
    });
  }
  const responseActionCapabilityUrl =
    config.referenceAdapters?.formspecStack?.responseActionLedgerCapabilityUrl;
  const responseActionInvoker = responseActionCapabilityUrl
    ? createHttpResponseActionLedgerInvokerFactory({
        endpoint: serverUrl,
        tenantBinding: config.tenantBinding,
        anonymousSessions,
        capabilityProvider: createHttpResponseActionLedgerCapabilityProvider({
          endpoint: responseActionCapabilityUrl,
          tenantBinding: config.tenantBinding,
          accessToken: identityBinding.accessToken,
        }),
      })
    : undefined;

  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl,
    definitionSource: new HttpDefinitionSource(httpConfig),
    surfaceBundleSource: unavailableSurfaceBundleSource(),
    surfaceBundleVerifier: unavailableSurfaceBundleVerifier(),
    draftStore,
    submitTransport,
    identityProvider: identityBinding.provider,
    browserAuthSession: identityBinding.browserAuthSession,
    notificationDelivery,
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
    attachmentStore: unavailableAttachmentStore(),
    respondentHistorySource: unavailableRespondentHistorySource(),
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    paymentRailAdapter: unavailablePaymentRailAdapter(),
    embedTransport: unavailableEmbedTransport(),
    screenerDocumentSource: unavailableScreenerDocumentSource(),
    reviewerSession: unavailableReviewerSession(),
    reviewThreadStore: unavailableReviewThreadStore(),
    safeAddressDirectory: unavailableSafeAddressDirectory(),
    lifecycleActionClient: unavailableLifecycleActionClient(),
    ...(responseActionInvoker ? { responseActionInvoker } : {}),
    ...(options.surfaceRoute
      ? { surfaceRouter: createBrowserSurfaceRouter(options.surfaceRoute) }
      : {}),
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
      // FW-0057 slice 1: cross-issuer history adapter requires XS-2 (multi-
      // issuer client-side token bag per stack-root ADR-0068 D-1 + D-3).
      // Production composition declares `unavailable` until that lands; the
      // /history route honestly renders "Your history is not available." copy.
      crossIssuerHistory: 'unavailable',
      // FW-0044 slice 1: the OSS reference composition does not ship a
      // production queue adapter — adopters fork to wire IndexedDB / OPFS /
      // service-worker-backed substrate per their deployment. Forms that
      // declare `x-formspec-offline-submit: true` load normally (the
      // extractor declares `optional`, not `required`); the offline path is
      // not reachable until an adapter is wired. FW-0082 carries the
      // production IndexedDB reference adapter.
      offlineSubmit: 'unavailable',
      // FW-0027 slice 1: the OSS reference composition does not ship a
      // production payment rail. Adopters fork to wire Stripe / Square /
      // W3C Payment Request / PayNearMe / in-person POS per their merchant
      // relationships. Forms that declare `x-formspec-payment-required: true`
      // fail-load with UnsupportedRequiredFeatureError + the plain-language
      // "This form requires payment, but this site is not set up to accept
      // payments." copy until an adapter is wired.
      payment: 'unavailable',
      // FW-0040 slice 1: the OSS reference composition does not ship a
      // production embed transport. Adopters fork to wire postMessage RPC,
      // penpal / comlink wrappers, or the future Custom Element message
      // channel (FW-0053, FW-0102, FW-0103) per their host integration.
      // Forms loaded inside an iframe on this composition fail-closed at
      // form load with the "this form is not set up to be shown on this
      // site." copy until an adapter is wired.
      embed: 'unavailable',
      // FW-0046 slice 1: the OSS reference composition does not ship a
      // production screener catalog adapter — adopters fork to wire a
      // catalog service, static bundle, IPFS-pinned JSON, or an
      // authoring-tool preview path per their deployment. The /screener
      // route renders the plain-language "Pre-flight routing is not
      // available on this site." copy until an adapter is wired.
      screener: 'unavailable',
      // 2026-05-25 namespace preallocation: these post-MVP capabilities stay
      // unavailable in the OSS production composition until their build rows
      // replace the sentinel slots / deferred port bindings. FW-0038 has a
      // real port now, but no production reference adapter ships yet.
      trustedReviewer: 'unavailable',
      preparerFiling: 'unavailable',
      bringYourOwnAssistant: 'unavailable',
      safeAddress: 'unavailable',
      duressAware: 'unavailable',
      multiParty: 'unavailable',
      recordLifecycle: 'unavailable',
    } satisfies InstanceCapabilities,
    orgRuntimePolicy: {
      features: {
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
        crossIssuerHistory: 'allowed',
        offlineSubmit: 'allowed',
        payment: 'allowed',
        embed: 'allowed',
        screener: 'allowed',
        trustedReviewer: 'allowed',
        preparerFiling: 'allowed',
        bringYourOwnAssistant: 'allowed',
        safeAddress: 'allowed',
        duressAware: 'allowed',
        multiParty: 'allowed',
        recordLifecycle: 'allowed',
      },
      // FW-0040 slice 1: fail-closed default. Adopters who wire a
      // production embed transport MUST also populate
      // `limits.embed.allowedOrigins` with the host page origins they
      // expect to be embedded under; the literal '*' opts into any-origin
      // and MUST be documented per the adopter doc warning.
      limits: { embed: { allowedOrigins: [] } },
    } satisfies OrgRuntimePolicy,
    // FW-0066: composite extractor wraps the FW-0033 attachment-field walker,
    // the FW-0044 offline-extension walker, and the FW-0027 payment-extension
    // walker as FormRuntimePolicyExtractor port instances. Production
    // deployments compose additional extractors here as future feature ADRs
    // land definition-introspective walkers.
    formRuntimePolicyExtractor: new CompositeFormRuntimePolicyExtractor([
      new AttachmentRequirementExtractor(),
      new OfflineSubmitRequirementExtractor(),
      new PaymentRequirementExtractor(),
      new EmbeddableExtractor(),
      new TrustedReviewerPolicyExtractor(),
      new MultiPartyPolicyExtractor(),
      new RecordLifecycleExtractor(),
      new SafeAddressPolicyExtractor(),
    ]),
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
  browserAuthSession?: BrowserAuthSession;
}

function identityProviderFor(
  config: FormspecWebConfig,
  notificationDelivery: ReturnType<typeof stubNotificationDelivery>,
  productionContext?: {
    anonymousSessions: AnonymousSessionBridge;
    initialDefinitionUrl: string;
  },
): IdentityBinding {
  if (config.identity.mode === 'oidc-required' && config.ports.identityProvider !== 'oidc') {
    throw new Error('OIDC-required identity policy requires the OIDC provider');
  }
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
    return createOidcIdentityBinding(config.identity.oidc);
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

  throw new Error(`Selected identity provider is not configured: ${config.ports.identityProvider}`);
}

/** Concrete OIDC selection belongs to the composition root. */
export function createOidcIdentityBinding(config: OidcClientConfig): IdentityBinding {
  const browserAuthSession = new OidcBrowserAuthSession(config);
  const provider = new OidcAdapter({ ...config, browserSession: browserAuthSession });
  return { provider, browserAuthSession, accessToken: () => browserAuthSession.accessToken() };
}

/** Callback startup uses the same maintained lifecycle adapter as the form host. */
export function createConfiguredBrowserAuthSession(config: OidcClientConfig): BrowserAuthSession {
  return new OidcBrowserAuthSession(config);
}

function productionInitialDefinitionUrl(serverUrl: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/runtime/forms/${demoFormId()}`;
}

function demoFormId(): string {
  return demoSampleFormUrl.split('/').filter(Boolean).at(-1) ?? 'demo-intake';
}
