/**
 * Parameterized route-narrowing factory (FW-0070, FW-0080).
 *
 * Replaces the 4 × 3 = 12 sibling factory functions that landed inline
 * across FW-0068 (`/status`), FW-0055 (`/obligations`), and FW-0056
 * (`/documents`). Each narrowed-route call site supplies a `RouteNarrowing`
 * descriptor (co-located with the route parser in `src/app/*-route.ts`)
 * and selects mode; the factory body encodes the wiring rules every
 * sibling factory previously duplicated:
 *
 * - Form-shaped MVP ports (`definitionSource`, `draftStore`,
 *   `submitTransport`) are unconditionally noop. No narrowed route reads
 *   them — that is the definition of "narrowed."
 * - `statusReader` is the demo stub in `'stub'` mode, the unavailable
 *   sentinel in `'default'` mode. Uniform across narrowed routes per the
 *   FW-0068 Finding 1 reshape (instanceCapabilities describes deployment
 *   posture, not per-surface narrowing).
 * - `respondentPlaceSource` mirrors `statusReader` — demo stub in `'stub'`
 *   mode (the place sidecar is non-trivial in demo so the post-FW-0068
 *   reshape kept the demo stub even on `/status`), unavailable sentinel in
 *   `'default'` mode.
 * - `respondentHistorySource` is driven by `consumes.has('crossIssuerHistory')`:
 *   demo factory wires the stub + declares `'demo-stub'` when consumed,
 *   sentinel + `'unavailable'` otherwise. Production always wires the
 *   sentinel today (XS-2 token bag is upstream-queued); when the
 *   production adapter ships, wire it conditionally on the same membership
 *   check.
 * - Identity provider: per `identityBound` + the MED-4 gate (production
 *   wires the real provider only when `respondentPlace === 'available'`;
 *   today's posture is always `'unavailable'`, so production always
 *   short-circuits to noop).
 *
 * All output funnels through `freezeComposition` per FW-0068 §Acceptance
 * #1 — the coherence assertion still runs at construction time.
 */
import { EmptyFormRuntimePolicyExtractor } from '../adapters/composing/form-runtime-policy-extractor.ts';
import {
  noopDefinitionSource,
  noopDraftStore,
  noopIdentityProvider,
  noopSubmitTransport,
} from '../adapters/noop-for-narrowed-route/index.ts';
import { stubIdentityProvider } from '../adapters/stub/identity-provider.ts';
import { stubNotificationDelivery } from '../adapters/stub/notification-delivery.ts';
import { stubRespondentPlaceSource } from '../adapters/stub/respondent-place-source.ts';
import { stubStatusReader } from '../adapters/stub/status-reader.ts';
import {
  demoApplicantCaseDetail,
  demoRespondentPlaceSnapshot,
} from '../demo/respondent-place.ts';
import { unavailableAttachmentStore } from '../adapters/unavailable/attachment-store.ts';
import { unavailableEmbedTransport } from '../adapters/unavailable/embed-transport.ts';
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import { unavailablePaymentRailAdapter } from '../adapters/unavailable/payment-rail-adapter.ts';
import { unavailablePreallocatedFeaturePort } from '../adapters/unavailable/preallocated-feature-port.ts';
import { unavailableRespondentHistorySource } from '../adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableScreenerDocumentSource } from '../adapters/unavailable/screener-document-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import { stubRespondentHistorySource } from '../adapters/stub/respondent-history-source.ts';
import { stubScreenerDocumentSource } from '../adapters/stub/screener-document-source.ts';
import { demoHistorySnapshot } from '../demo/respondent-history.ts';
import { demoScreenerCatalog } from '../demo/screener.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
  type RuntimeFeatureKey,
} from '../policy/index.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';
import { departmentAppProfile } from '../profiles/profiles.ts';
import { buildRealIdentityProvider } from './default.ts';
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
 * `respondentPlace` + `status` keep uniform demo-stub / unavailable
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
   * `crossIssuerHistory` drives a wiring switch (demo factory chooses
   * stub vs sentinel + `'demo-stub'` vs `'unavailable'` declaration).
   * `fileUpload` and `offlineSubmit` have no narrowed-route consumer
   * today — they stay uniformly `'unavailable'` across descriptors.
   */
  readonly consumes: ReadonlySet<RuntimeFeatureKey>;
  /**
   * Whether the surface is identity-bound. When `true` AND production
   * `respondentPlace` capability is `available`, the production factory
   * wires the real identity provider; otherwise short-circuits to noop per
   * MED-4. The demo composition wires the demo identity provider when
   * `true`; noop otherwise (matches `/status`'s identity-agnostic shape).
   */
  readonly identityBound: boolean;
}

export type RouteNarrowingMode = 'default' | 'stub';

/**
 * Builds a route-narrowed Composition from a descriptor. The 12 named
 * sibling factories collapse to three callers of this helper (one per
 * route descriptor); the demo-mode shape collapses into `'stub'`,
 * matching the existing `createDemoComposition` → `createStubComposition`
 * one-line delegation.
 *
 * Naming note: caller-side `mode: 'stub'` produces a Composition whose
 * `composition.mode === 'demo'` (the runtime tag the React shell + the
 * coherence assertion consume). Caller and runtime tags differ deliberately
 * — caller names the FACTORY MODE (which adapters wire), runtime names the
 * DEPLOYMENT POSTURE (which the shell renders). Same delegation pattern as
 * `createDemoComposition` → `createStubComposition`.
 */
export function createRouteNarrowedComposition({
  mode,
  config = departmentAppProfile,
  route,
}: {
  mode: RouteNarrowingMode;
  config?: FormspecWebConfig;
  route: RouteNarrowing;
}): Composition {
  if (mode === 'default') {
    const serverUrl = config.referenceAdapters?.formspecStack?.formspecServerUrl;
    if (!serverUrl) {
      return createRouteNarrowedComposition({ mode: 'stub', config, route });
    }
    return buildProductionNarrowedComposition({ config, route, serverUrl });
  }
  return buildDemoNarrowedComposition({ route });
}

function buildProductionNarrowedComposition({
  config,
  route,
  serverUrl,
}: {
  config: FormspecWebConfig;
  route: RouteNarrowing;
  serverUrl: string;
}): Composition {
  const instanceCapabilities: InstanceCapabilities = {
    respondentPlace: 'unavailable',
    status: 'unavailable',
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
    bringYourOwnAssistant: 'unavailable',
    safeAddress: 'unavailable',
    duressAware: 'unavailable',
    multiParty: 'unavailable',
    recordLifecycle: 'unavailable',
  };
  const notificationDelivery = stubNotificationDelivery();
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
    route.identityBound && instanceCapabilities.respondentPlace === 'available'
      ? buildRealIdentityProvider(config, notificationDelivery, serverUrl).provider
      : noopIdentityProvider(route.routeCite);

  const composition: Composition = {
    mode: 'production',
    initialDefinitionUrl: route.initialDefinitionUrlSentinel,
    definitionSource: noopDefinitionSource(route.routeCite),
    draftStore: noopDraftStore(route.routeCite),
    submitTransport: noopSubmitTransport(route.routeCite),
    identityProvider,
    notificationDelivery,
    respondentPlaceSource: unavailableRespondentPlaceSource(),
    statusReader: unavailableStatusReader(),
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
    reviewerSession: unavailablePreallocatedFeaturePort('trustedReviewer', 'ReviewerSession'),
    reviewThreadStore: unavailablePreallocatedFeaturePort('trustedReviewer', 'ReviewThreadStore'),
    safeAddressDirectory: unavailablePreallocatedFeaturePort('safeAddress', 'SafeAddressDirectory'),
    lifecycleActionClient: unavailablePreallocatedFeaturePort(
      'recordLifecycle',
      'LifecycleActionClient',
    ),
    instanceCapabilities,
    orgRuntimePolicy: defaultOrgRuntimePolicy(),
    formRuntimePolicyExtractor: new EmptyFormRuntimePolicyExtractor(),
  };
  return freezeComposition(composition);
}

function buildDemoNarrowedComposition({ route }: { route: RouteNarrowing }): Composition {
  // FW-0068 Finding 1 reshape: instanceCapabilities describes deployment
  // posture, not per-surface narrowing. Every demo narrowed route declares
  // the same `demo-stub` posture as the full stub composition and wires the
  // same demo stub adapters.
  const composition: Composition = {
    mode: 'demo',
    initialDefinitionUrl: route.initialDefinitionUrlSentinel,
    definitionSource: noopDefinitionSource(route.routeCite),
    draftStore: noopDraftStore(route.routeCite),
    submitTransport: noopSubmitTransport(route.routeCite),
    identityProvider: route.identityBound
      ? stubIdentityProvider()
      : noopIdentityProvider(route.routeCite),
    respondentPlaceSource: stubRespondentPlaceSource(demoRespondentPlaceSnapshot()),
    statusReader: stubStatusReader([
      ['urn:wos:case_demo_0001', demoApplicantCaseDetail()],
    ]),
    attachmentStore: unavailableAttachmentStore(),
    respondentHistorySource: route.consumes.has('crossIssuerHistory')
      ? stubRespondentHistorySource(demoHistorySnapshot())
      : unavailableRespondentHistorySource(),
    // FW-0044 slice 1: no narrowed route renders a form; no queue affordance
    // is reachable. Uniform unavailable across all descriptors regardless of
    // mode (the sentinel pairs with the 'unavailable' declaration).
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
    // FW-0027 slice 1: no narrowed route renders a form; no payment
    // affordance is reachable. Uniform unavailable regardless of mode.
    paymentRailAdapter: unavailablePaymentRailAdapter(),
    // FW-0040 slice 1: no narrowed route mounts in a host iframe; no
    // embed-transport substrate is reachable. Uniform unavailable
    // regardless of mode.
    embedTransport: unavailableEmbedTransport(),
    // FW-0046 slice 1: only the /screener route consumes the screener
    // catalog. Other narrowed routes wire the unavailable sentinel +
    // declare 'unavailable' because they don't render the screener.
    screenerDocumentSource: route.consumes.has('screener')
      ? stubScreenerDocumentSource(demoScreenerCatalog())
      : unavailableScreenerDocumentSource(),
    reviewerSession: unavailablePreallocatedFeaturePort('trustedReviewer', 'ReviewerSession'),
    reviewThreadStore: unavailablePreallocatedFeaturePort('trustedReviewer', 'ReviewThreadStore'),
    safeAddressDirectory: unavailablePreallocatedFeaturePort('safeAddress', 'SafeAddressDirectory'),
    lifecycleActionClient: unavailablePreallocatedFeaturePort(
      'recordLifecycle',
      'LifecycleActionClient',
    ),
    instanceCapabilities: {
      respondentPlace: 'demo-stub',
      status: 'demo-stub',
      // FW-0056 design line 121 + arch-review MED-1: no demo VP stack
      // exists anywhere, so the demo composition declares
      // documentPresentation unavailable. The shared-slot independent-
      // declarations rule (composition-coherence.ts) accepts this: the
      // unavailable declaration opts out of the slot, and the demo-stub-
      // marked place adapter satisfies only the respondentPlace key.
      documentPresentation: 'unavailable',
      // FW-0033 slice 1: narrowed routes (status / obligations / documents)
      // do not render forms, so upload affordance is not reachable. Both
      // stub mode and production mode declare unavailable to match the wired
      // sentinel.
      fileUpload: 'unavailable',
      // FW-0057 slice 1: only the /history route consumes the cross-issuer
      // history adapter. Other narrowed routes (status / obligations /
      // documents) wire the unavailable sentinel + declare 'unavailable'
      // because they don't render history.
      crossIssuerHistory: route.consumes.has('crossIssuerHistory') ? 'demo-stub' : 'unavailable',
      // FW-0044 slice 1: narrowed routes do not submit forms; uniform
      // unavailable to match the wired sentinel.
      offlineSubmit: 'unavailable',
      // FW-0027 slice 1: narrowed routes do not submit forms; uniform
      // unavailable to match the wired sentinel.
      payment: 'unavailable',
      // FW-0040 slice 1: narrowed routes do not mount forms in host
      // iframes; uniform unavailable to match the wired sentinel.
      embed: 'unavailable',
      // FW-0046 slice 1: only the /screener descriptor consumes the
      // screener catalog. Other narrowed routes wire the sentinel +
      // declare 'unavailable' because they don't render pre-flight
      // routing.
      screener: route.consumes.has('screener') ? 'demo-stub' : 'unavailable',
      trustedReviewer: 'unavailable',
      bringYourOwnAssistant: 'unavailable',
      safeAddress: 'unavailable',
      duressAware: 'unavailable',
      multiParty: 'unavailable',
      recordLifecycle: 'unavailable',
    },
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
