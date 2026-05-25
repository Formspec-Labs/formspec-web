import { describe, expect, it } from 'vitest';
import {
  createRouteNarrowedComposition,
  type RouteNarrowing,
} from '../../src/composition/route-narrowing.ts';
import { DOCUMENTS_ROUTE_NARROWING } from '../../src/app/documents-route.ts';
import { HISTORY_ROUTE_NARROWING } from '../../src/app/history-route.ts';
import { OBLIGATIONS_ROUTE_NARROWING } from '../../src/app/obligations-route.ts';
import { STATUS_ROUTE_NARROWING } from '../../src/app/status-route.ts';
import { assertCompositionCoherence } from '../../src/policy/composition-coherence.ts';
import { isRuntimeFeatureKey } from '../../src/policy/feature-keys.ts';
import { departmentAppProfile } from '../../src/profiles/profiles.ts';
import { sampleFormDefinition } from '../../src/adapter-conformance/fixtures.ts';
import type { FormspecWebConfig, PortCompositionConfig } from '../../src/config/types.ts';

const ALL_DESCRIPTORS: readonly RouteNarrowing[] = [
  STATUS_ROUTE_NARROWING,
  OBLIGATIONS_ROUTE_NARROWING,
  DOCUMENTS_ROUTE_NARROWING,
  HISTORY_ROUTE_NARROWING,
];

function productionConfig(): FormspecWebConfig {
  return {
    ...departmentAppProfile,
    ports: referenceHttpDataPorts(departmentAppProfile.ports),
    referenceAdapters: {
      formspecStack: {
        ...departmentAppProfile.referenceAdapters?.formspecStack,
        tenantHeaderDialect: 'formspec',
        formspecServerUrl: 'https://formspec-server.example.test',
      },
    },
  };
}

function referenceHttpDataPorts(ports: PortCompositionConfig): PortCompositionConfig {
  return {
    ...ports,
    definitionSource: 'reference-http',
    draftStore: 'reference-http',
    submitTransport: 'reference-http',
  };
}

describe('createRouteNarrowedComposition — descriptor contracts (FW-0070)', () => {
  describe.each(ALL_DESCRIPTORS)('descriptor %j', (route) => {
    it('default mode without server URL short-circuits to stub', () => {
      const composition = createRouteNarrowedComposition({ mode: 'default', route });
      expect(composition.mode).toBe('demo');
    });

    it('default mode with server URL produces a production composition', () => {
      const composition = createRouteNarrowedComposition({
        mode: 'default',
        config: productionConfig(),
        route,
      });
      expect(composition.mode).toBe('production');
    });

    it('stub mode produces a demo composition', () => {
      const composition = createRouteNarrowedComposition({ mode: 'stub', route });
      expect(composition.mode).toBe('demo');
    });

    it('result passes assertCompositionCoherence in both modes', () => {
      const stubComposition = createRouteNarrowedComposition({ mode: 'stub', route });
      expect(() => assertCompositionCoherence(stubComposition)).not.toThrow();
      const productionComposition = createRouteNarrowedComposition({
        mode: 'default',
        config: productionConfig(),
        route,
      });
      expect(() => assertCompositionCoherence(productionComposition)).not.toThrow();
    });

    it('form-shaped MVP ports throw with the route cite on call (production)', async () => {
      const c = createRouteNarrowedComposition({
        mode: 'default',
        config: productionConfig(),
        route,
      });
      await expect(c.definitionSource.getDefinition('https://x')).rejects.toThrow(
        /FW-0068/,
      );
      await expect(
        c.draftStore.load({ formUrl: 'https://x', subjectRef: 's' }),
      ).rejects.toThrow(/FW-0068/);
      await expect(c.submitTransport.submit({} as never, 'k')).rejects.toThrow(/FW-0068/);
    });

    it('form-shaped MVP ports throw with the route cite on call (stub)', async () => {
      const c = createRouteNarrowedComposition({ mode: 'stub', route });
      await expect(c.definitionSource.getDefinition('https://x')).rejects.toThrow(
        /FW-0068/,
      );
      await expect(c.submitTransport.submit({} as never, 'k')).rejects.toThrow(/FW-0068/);
    });

    it('initialDefinitionUrl mirrors the descriptor sentinel', () => {
      const c = createRouteNarrowedComposition({ mode: 'stub', route });
      expect(c.initialDefinitionUrl).toBe(route.initialDefinitionUrlSentinel);
    });

    it('orgRuntimePolicy allows every closed-taxonomy feature key', () => {
      const c = createRouteNarrowedComposition({ mode: 'stub', route });
      expect(c.orgRuntimePolicy.features).toMatchObject({
        respondentPlace: 'allowed',
        status: 'allowed',
        documentPresentation: 'allowed',
        fileUpload: 'allowed',
        crossIssuerHistory: 'allowed',
        offlineSubmit: 'allowed',
        payment: 'allowed',
      });
    });

    it('formRuntimePolicyExtractor returns empty form policy (routes synthesize per-surface)', () => {
      const c = createRouteNarrowedComposition({ mode: 'stub', route });
      expect(c.formRuntimePolicyExtractor.extract(sampleFormDefinition)).toEqual({ features: {} });
    });
  });
});

describe('createRouteNarrowedComposition — identity-bound vs identity-agnostic surfaces (FW-0070)', () => {
  it('identityBound=true: stub mode wires the demo identity provider (real, not noop)', async () => {
    const c = createRouteNarrowedComposition({
      mode: 'stub',
      route: OBLIGATIONS_ROUTE_NARROWING,
    });
    await expect(c.identityProvider.discover()).resolves.toBeDefined();
  });

  it('identityBound=false: stub mode wires the noop identity provider', async () => {
    const c = createRouteNarrowedComposition({
      mode: 'stub',
      route: STATUS_ROUTE_NARROWING,
    });
    await expect(c.identityProvider.discover()).rejects.toThrow(/FW-0068/);
  });

  it('identityBound=true: production mode short-circuits to noop while respondentPlace is unavailable (MED-4)', async () => {
    const c = createRouteNarrowedComposition({
      mode: 'default',
      config: productionConfig(),
      route: DOCUMENTS_ROUTE_NARROWING,
    });
    expect(c.instanceCapabilities.respondentPlace).toBe('unavailable');
    await expect(c.identityProvider.discover()).rejects.toThrow(/FW-0068/);
  });
});

describe('createRouteNarrowedComposition — per-mode wiring posture (FW-0070)', () => {
  it('stub mode preserves the FW-0068 Finding 1 reshape — respondentPlace stays demo-stub on /status', async () => {
    const c = createRouteNarrowedComposition({
      mode: 'stub',
      route: STATUS_ROUTE_NARROWING,
    });
    expect(c.instanceCapabilities.respondentPlace).toBe('demo-stub');
    expect(c.instanceCapabilities.status).toBe('demo-stub');
    const snapshot = await c.respondentPlaceSource.readPlace({});
    expect(snapshot.obligations).toBeDefined();
  });

  it('production mode declares unavailable for the gated keys on every descriptor', () => {
    for (const route of ALL_DESCRIPTORS) {
      const c = createRouteNarrowedComposition({
        mode: 'default',
        config: productionConfig(),
        route,
      });
      expect(c.instanceCapabilities.respondentPlace).toBe('unavailable');
      expect(c.instanceCapabilities.status).toBe('unavailable');
      expect(c.instanceCapabilities.documentPresentation).toBe('unavailable');
    }
  });

  it('status reader resolves the demo URN under stub mode regardless of descriptor', async () => {
    for (const route of ALL_DESCRIPTORS) {
      const c = createRouteNarrowedComposition({ mode: 'stub', route });
      await expect(
        c.statusReader.readStatus({ resourceRef: 'urn:wos:case_demo_0001' }),
      ).resolves.toBeDefined();
    }
  });
});

describe('createRouteNarrowedComposition — crossIssuerHistory consumption (FW-0057, FW-0080)', () => {
  it('descriptor consumes crossIssuerHistory: stub mode wires the history stub + declares demo-stub', async () => {
    expect(HISTORY_ROUTE_NARROWING.consumes.has('crossIssuerHistory')).toBe(true);
    const c = createRouteNarrowedComposition({ mode: 'stub', route: HISTORY_ROUTE_NARROWING });
    expect(c.instanceCapabilities.crossIssuerHistory).toBe('demo-stub');
    const snapshot = await c.respondentHistorySource.readHistory({});
    expect(snapshot.entries.length).toBeGreaterThan(0);
  });

  it('descriptor does NOT consume crossIssuerHistory: stub mode wires the unavailable sentinel + declares unavailable', async () => {
    expect(STATUS_ROUTE_NARROWING.consumes.has('crossIssuerHistory')).toBe(false);
    const c = createRouteNarrowedComposition({ mode: 'stub', route: STATUS_ROUTE_NARROWING });
    expect(c.instanceCapabilities.crossIssuerHistory).toBe('unavailable');
    await expect(c.respondentHistorySource.readHistory({})).rejects.toThrow();
  });

  it('production mode always wires the sentinel today (XS-2 not yet shipped)', async () => {
    const c = createRouteNarrowedComposition({
      mode: 'default',
      config: productionConfig(),
      route: HISTORY_ROUTE_NARROWING,
    });
    expect(c.instanceCapabilities.crossIssuerHistory).toBe('unavailable');
    await expect(c.respondentHistorySource.readHistory({})).rejects.toThrow();
  });
});

// FW-0080: the `consumes*` boolean ladder (consumesRespondentPlace /
// consumesStatus / consumesHistory) consolidated into a single
// `consumes: ReadonlySet<RuntimeFeatureKey>` driven by the closed
// RuntimeFeatureKey taxonomy. Adding a future feature key with a narrowed
// surface needs ONE Set entry, not a new boolean flag on RouteNarrowing.
describe('RouteNarrowing.consumes — closed-taxonomy Set shape (FW-0080)', () => {
  it.each(ALL_DESCRIPTORS)('descriptor %j carries a ReadonlySet<RuntimeFeatureKey>', (route) => {
    expect(route.consumes).toBeInstanceOf(Set);
    for (const key of route.consumes) {
      expect(isRuntimeFeatureKey(key)).toBe(true);
    }
  });

  it('STATUS_ROUTE_NARROWING consumes exactly {status}', () => {
    expect(Array.from(STATUS_ROUTE_NARROWING.consumes).sort()).toEqual(['status']);
  });

  it('OBLIGATIONS_ROUTE_NARROWING consumes exactly {respondentPlace}', () => {
    expect(Array.from(OBLIGATIONS_ROUTE_NARROWING.consumes).sort()).toEqual(['respondentPlace']);
  });

  it('DOCUMENTS_ROUTE_NARROWING consumes exactly {respondentPlace}', () => {
    expect(Array.from(DOCUMENTS_ROUTE_NARROWING.consumes).sort()).toEqual(['respondentPlace']);
  });

  it('HISTORY_ROUTE_NARROWING consumes exactly {crossIssuerHistory}', () => {
    expect(Array.from(HISTORY_ROUTE_NARROWING.consumes).sort()).toEqual(['crossIssuerHistory']);
  });

  it('no descriptor consumes fileUpload / offlineSubmit / payment / embed today (no narrowed-route consumer)', () => {
    for (const route of ALL_DESCRIPTORS) {
      expect(route.consumes.has('fileUpload')).toBe(false);
      expect(route.consumes.has('offlineSubmit')).toBe(false);
      expect(route.consumes.has('payment')).toBe(false);
      expect(route.consumes.has('embed')).toBe(false);
    }
  });
});
