/** Reference narrowed-route wiring; application-owned sample ports must be supplied explicitly. */
import { EmptyFormRuntimePolicyExtractor } from '../adapters/composing/form-runtime-policy-extractor.ts';
import {
  noopDefinitionSource,
  noopDraftStore,
  noopIdentityProvider,
  noopSubmitTransport,
} from '../adapters/noop-for-narrowed-route/index.ts';
import { unavailableNotificationDelivery } from '../adapters/unavailable/notification-delivery.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableEmbedTransport } from '../adapters/unavailable/embed-transport.ts';
import { unavailableLifecycleActionClient } from '../adapters/unavailable/lifecycle-action-client.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import { unavailablePaymentRailAdapter } from '../adapters/unavailable/payment-rail-adapter.ts';
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
  type RuntimeFeatureKey,
} from '../policy/index.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';
import { departmentAppProfile } from '../profiles/profiles.ts';
import { buildRealIdentityProvider, type IdentityBinding } from './default.ts';
import type { StatusReader } from '../ports/status-reader.ts';
import type { Composition } from './types.ts';

/**
 * Per-route narrowing descriptor. Co-located with the route parser so
 * adding a route requires touching one file (the route file) plus the
 * `chooseComposition` dispatch helper.
 *
 * `consumes` is the closed-taxonomy set of `RuntimeFeatureKey` values
 * the route reads (FW-0080 consolidation of the prior `consumes*` boolean
 * ladder). Adding a future feature key with a narrowed surface needs one
 * Set entry — no new boolean flag on this interface. Membership drives
 * adapter wiring for every key that has per-route narrowing semantics
 * today (`crossIssuerHistory`); per the FW-0068 Finding 1 reshape,
 * `respondentPlace` + `status` keep uniform unavailable
 * wiring across narrowed routes regardless of membership, but their
 * presence in the set documents the route's intent honestly.
 *
 * `identityBound` stays a dedicated boolean — it is not a `consumes*`
 * pattern. It gates real-vs-noop identity adapter wiring via the MED-4
 * gate (production wires the real provider only when
 * `respondentPlace === 'available'`; today always short-circuits to noop).
 * FW-0079 revisits per-route identity gating post-FW-0078.
 */
export interface RouteNarrowing {
  /** Cite used in noop-adapter error messages (e.g. '/status'). */
  readonly routeCite: string;
  /**
   * Sentinel string written to `Composition.initialDefinitionUrl`.
   * Surfaces never read this on a narrowed route; the noopDefinitionSource
   * throws on `getDefinition` regardless.
   */
  readonly initialDefinitionUrlSentinel: string;
  /**
   * Closed-set of `RuntimeFeatureKey` values the route reads. Per-route
   * narrowed wiring derives from membership: today only
   * `crossIssuerHistory` drives a wiring switch (the reference factory selects configured adapters).
   * `fileUpload` and `offlineSubmit` have no narrowed-route consumer
   * today — they stay uniformly `'unavailable'` across descriptors.
   */
  readonly consumes: ReadonlySet<RuntimeFeatureKey>;
  /**
   * Whether the surface is identity-bound. When `true` AND production
   * `respondentPlace` capability is `available`, the production factory
   * wires the real identity provider; otherwise short-circuits to noop per
   * MED-4. The demo composition wires the demo identity provider when
   * `true`; noop otherwise.
   */
  readonly identityBound: boolean;
}

/** Construct reference HTTP ports for an explicitly selected narrowed route. */
export function createRouteNarrowedComposition({ config = departmentAppProfile, route, statusReader, identityBinding }: {
  config?: FormspecWebConfig;
  route: RouteNarrowing;
  /** Protected applicant reader, supplied by the authenticated host. */
  statusReader?: StatusReader;
  identityBinding?: IdentityBinding;
}): Composition {
  const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
  if (!serverUrl) throw new Error('Reference narrowed composition requires an explicit formspecServerUrl');
  if (statusReader && (!route.consumes.has('status') || !route.identityBound
    || config.identity.mode !== 'oidc-required' || !config.identity.oidc
    || !identityBinding?.browserAuthSession || !identityBinding.accessToken)) {
    throw new Error('Status reader requires the selected authenticated OIDC session');
  }
  return buildProductionNarrowedComposition({ config, route, serverUrl, statusReader, identityBinding });
}

function buildProductionNarrowedComposition({
  config,
  route,
  serverUrl,
  statusReader,
  identityBinding,
}: {
  config: FormspecWebConfig;
  route: RouteNarrowing;
  serverUrl: string;
  statusReader?: StatusReader;
  identityBinding?: IdentityBinding;
}): Composition {
  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'unavailable',
    status: statusReader ? 'available' : 'unavailable',
    documentPresentation: 'unavailable',
    // FW-0033 slice 1: narrowed routes do not accept uploads. Uniformly
    // unavailable across all narrowed-route descriptors today; if a future
    // route needs an upload affordance, add `'fileUpload'` to the
    // descriptor's `consumes` set (FW-0080 shape) and branch the
    // attachmentStore slot here.
    fileUpload: 'unavailable',
    // FW-0057 slice 1: production composition has no cross-issuer history
    // adapter yet (XS-2 token bag is upstream-queued); narrowed routes
    // including /history declare 'unavailable' in production mode + render
    // the disabled-cause copy honestly. When the production adapter ships,
    // wire it conditionally on `route.consumes.has('crossIssuerHistory')` here.
    crossIssuerHistory: 'unavailable',
    // FW-0044 slice 1: narrowed routes do not submit forms; no queue
    // affordance is reachable. Uniform unavailable across all descriptors.
    offlineSubmit: 'unavailable',
    // FW-0027 slice 1: narrowed routes do not submit forms; no payment
    // affordance is reachable. Uniform unavailable across all descriptors.
    payment: 'unavailable',
    // FW-0040 slice 1: no narrowed route mounts a form, so no iframe-
    // context gate fires regardless of host. Uniform unavailable across
    // all descriptors; a future narrowed surface that needs to mount in
    // a host iframe would add `'embed'` to its `consumes` set and branch.
    embed: 'unavailable',
    // FW-0046 slice 1: production composition has no screener catalog
    // adapter yet (adopters fork per their deployment). Narrowed routes
    // including /screener declare 'unavailable' in production mode +
    // render the disabled-cause copy honestly. When the adopter wires a
    // real catalog adapter, branch this slot on
    // `route.consumes.has('screener')` here (mirrors the
    // crossIssuerHistory pattern).
    screener: 'unavailable',
    trustedReviewer: 'unavailable',
    preparerFiling: 'unavailable',
    bringYourOwnAssistant: 'unavailable',
    safeAddress: 'unavailable',
    duressAware: 'unavailable',
    multiParty: 'unavailable',
    recordLifecycle: 'unavailable',
  };
  const notificationDelivery = unavailableNotificationDelivery();
  // MED-4: identity is only wired when the gated respondent-place capability
  // is `available`. Today's production posture always declares
  // `unavailable`, so identity-bound routes short-circuit to noop and never
  // construct OIDC / magic-link / anonymous-session machinery. When a real
  // production respondent-place adapter ships and the declaration moves to
  // `available`, this branch picks up real identity wiring automatically.
  // TODO(FW-0079): per-route identity gating. Today's gate-on-respondentPlace
  // is correct because crossIssuerHistory is always 'unavailable' in
  // production; revisit when FW-0078 ships a production history adapter and
  // `/history` is identity-bound but does NOT consume respondentPlace.
  const identityProvider: IdentityProvider =
    statusReader && identityBinding ? identityBinding.provider
      : route.identityBound && instanceCapabilities.respondentPlace === 'available'
      ? buildRealIdentityProvider(config, notificationDelivery, serverUrl, route.initialDefinitionUrlSentinel).provider
      : noopIdentityProvider(route.routeCite);

  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl: route.initialDefinitionUrlSentinel,
    definitionSource: noopDefinitionSource(route.routeCite),
    surfaceBundleSource: unavailableSurfaceBundleSource(),
    surfaceBundleVerifier: unavailableSurfaceBundleVerifier(),
    draftStore: noopDraftStore(route.routeCite),
    submitTransport: noopSubmitTransport(route.routeCite),
    identityProvider,
    browserAuthSession: statusReader ? identityBinding?.browserAuthSession : undefined,
    notificationDelivery,
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: statusReader ?? unavailableStatusReader(),
    attachmentStore: unavailableAttachmentStore(),
    respondentHistorySource: unavailableRespondentHistorySource(),
    // FW-0044 slice 1: narrowed routes do not submit forms (no form-fill
    // surface). Uniformly unavailable across all descriptors today; if a
    // future route ever needs an offline-queue affordance, add
    // `'offlineSubmit'` to the descriptor's `consumes` set and branch
    // here per FW-0080's closed-taxonomy shape.
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    // FW-0027 slice 1: narrowed routes do not submit forms; no payment
    // affordance is reachable. Uniform unavailable across all descriptors;
    // a future route needing payment would add `'payment'` to its
    // `consumes` set and branch here.
    paymentRailAdapter: unavailablePaymentRailAdapter(),
    // FW-0040 slice 1: narrowed routes do not mount forms in host iframes;
    // no embed-transport substrate is reachable. Uniform unavailable across
    // all descriptors; a future narrowed surface needing embed would add
    // `'embed'` to its `consumes` set and branch here.
    embedTransport: unavailableEmbedTransport(),
    // FW-0046 slice 1: production composition has no screener catalog
    // adapter yet. Narrowed routes including /screener wire the sentinel
    // + render the disabled-cause copy honestly. Adopter forks branch on
    // `route.consumes.has('screener')` to wire their real adapter.
    screenerDocumentSource: unavailableScreenerDocumentSource(),
    safeAddressDirectory: unavailableSafeAddressDirectory(),
    lifecycleActionClient: unavailableLifecycleActionClient(),
    instanceCapabilities,
    orgRuntimePolicy: defaultOrgRuntimePolicy(),
    formRuntimePolicyExtractor: new EmptyFormRuntimePolicyExtractor(),
  };
  return freezeComposition(composition);
}

function defaultOrgRuntimePolicy(): OrgRuntimePolicy {
  return {
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
    // FW-0040 slice 1: narrowed routes don't mount in host iframes, so
    // the allow-list is irrelevant — fail-closed default mirrors the
    // full-app composition shape.
    limits: { embed: { allowedOrigins: [] } },
  };
}
