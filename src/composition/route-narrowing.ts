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
import { unavailableRespondentPlaceSource } from '../adapters/unavailable/respondent-place-source.ts';
import { unavailableStatusReader } from '../adapters/unavailable/status-reader.ts';
import type { FormspecWebConfig } from '../config/types.ts';
import {
  freezeComposition,
  type FormRuntimePolicy,
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
  };
  const notificationDelivery = stubNotificationDelivery();
  // MED-4: identity is only wired when the gated respondent-place capability
  // is `available`. Today's production posture always declares
  // `unavailable`, so identity-bound routes short-circuit to noop and never
  // construct OIDC / magic-link / anonymous-session machinery. When a real
  // production respondent-place adapter ships and the declaration moves to
  // `available`, this branch picks up real identity wiring automatically.
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
    instanceCapabilities,
    orgRuntimePolicy: defaultOrgRuntimePolicy(),
    getFormRuntimePolicy: emptyFormRuntimePolicy,
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
    },
    orgRuntimePolicy: defaultOrgRuntimePolicy(),
    getFormRuntimePolicy: emptyFormRuntimePolicy,
  };
  return freezeComposition(composition);
}

function defaultOrgRuntimePolicy(): OrgRuntimePolicy {
  return {
    features: {
      respondentPlace: 'allowed',
      status: 'allowed',
      documentPresentation: 'allowed',
    },
  };
}

function emptyFormRuntimePolicy(): FormRuntimePolicy {
  return { features: {} };
}
