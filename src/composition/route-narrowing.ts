/**
 * Parameterized route-narrowing factory (FW-0070).
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
 *   sentinel in `'default'` mode. The `consumesStatus` descriptor flag
 *   exists so future routes can opt OUT of the demo stub on `/status`-style
 *   surfaces, but every shipped descriptor today keeps the existing
 *   instanceCapabilities posture (FW-0068 Finding 1).
 * - `respondentPlaceSource` mirrors `statusReader` — demo stub in `'stub'`
 *   mode (the place sidecar is non-trivial in demo so the post-FW-0068
 *   reshape kept the demo stub even on `/status`), unavailable sentinel in
 *   `'default'` mode.
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
import { unavailableOfflineSubmitQueue } from '../adapters/unavailable/offline-submit-queue.ts';
import { unavailableRespondentHistorySource } from '../adapters/unavailable/respondent-history-source.ts';
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import { stubRespondentHistorySource } from '../adapters/stub/respondent-history-source.ts';
import { demoHistorySnapshot } from '../demo/respondent-history.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import {
  freezeComposition,
  type InstanceCapabilities,
  type OrgRuntimePolicy,
} from '../policy/index.ts';
import type { IdentityProvider } from '../ports/identity-provider.ts';
import { departmentAppProfile } from '../profiles/profiles.ts';
import { buildRealIdentityProvider } from './default.ts';
import type { Composition } from './types.ts';

/**
 * Per-route narrowing descriptor. Co-located with the route parser so
 * adding a route requires touching one file (the route file) plus the
 * `chooseComposition` dispatch helper.
 */
// TODO(FW-0080): consolidate the `consumes*` boolean ladder below into a
// single `consumes: ReadonlySet<RuntimeFeatureKey>` driven by FEATURE_PORT_MAP.
// The ladder mirrors RuntimeFeatureKey by hand; the set form scales to future
// keys (fileUpload eligible per FW-0057 design line 158-161) without growing
// the RouteNarrowing shape. Pull forward when a sixth RuntimeFeatureKey lands
// or when a fourth `consumes*` flag is about to be added — whichever fires.
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
   * Whether the route reads the respondent-place sidecar. Drives identity
   * wiring via the MED-4 gate and (today) clarifies intent in the
   * descriptor table; the place adapter slot keeps the same demo-stub /
   * unavailable wiring on every narrowed route per the FW-0068 Finding 1
   * reshape (instanceCapabilities describes deployment posture, not
   * per-surface narrowing).
   */
  readonly consumesRespondentPlace: boolean;
  /** Whether the route reads the status reader. Today only `/status`. */
  readonly consumesStatus: boolean;
  /**
   * Whether the route reads the cross-issuer history (FW-0057). Today only
   * `/history`. Drives the `respondentHistorySource` adapter wiring and the
   * `instanceCapabilities.crossIssuerHistory` declaration: when `true`, the
   * demo factory wires the stub fixture + declares `'demo-stub'`; when
   * `false`, the demo factory wires the unavailable sentinel + declares
   * `'unavailable'`. Production always wires the sentinel + declares
   * `'unavailable'` today (post-XS-2 the production adapter ships and this
   * branch picks it up automatically).
   */
  readonly consumesHistory: boolean;
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
    // route needs an upload affordance, add a `consumesAttachmentStore` flag
    // to RouteNarrowing then.
    fileUpload: 'unavailable',
    // FW-0057 slice 1: production composition has no cross-issuer history
    // adapter yet (XS-2 token bag is upstream-queued); narrowed routes
    // including /history declare 'unavailable' in production mode + render
    // the disabled-cause copy honestly. When the production adapter ships,
    // wire it conditionally on `route.consumesHistory` here.
    crossIssuerHistory: 'unavailable',
    // FW-0044 slice 1: narrowed routes do not submit forms; no queue
    // affordance is reachable. Uniform unavailable across all descriptors.
    offlineSubmit: 'unavailable',
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
    // future route ever needs an offline-queue affordance, add a
    // `consumesOfflineSubmit` flag — or (per FW-0080's explicit trigger
    // fired by this row) finish the `consumes*` boolean-ladder
    // consolidation first.
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
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
    respondentHistorySource: route.consumesHistory
      ? stubRespondentHistorySource(demoHistorySnapshot())
      : unavailableRespondentHistorySource(),
    // FW-0044 slice 1: no narrowed route renders a form; no queue affordance
    // is reachable. Uniform unavailable across all descriptors regardless of
    // mode (the sentinel pairs with the 'unavailable' declaration).
    offlineSubmitQueue: unavailableOfflineSubmitQueue(),
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
      crossIssuerHistory: route.consumesHistory ? 'demo-stub' : 'unavailable',
      // FW-0044 slice 1: narrowed routes do not submit forms; uniform
      // unavailable to match the wired sentinel.
      offlineSubmit: 'unavailable',
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
    },
  };
}
