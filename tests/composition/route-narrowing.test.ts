import { describe, expect, it } from 'vitest';
import {
  createRouteNarrowedComposition,
  type RouteNarrowing,
} from '../../src/composition/route-narrowing.ts';
import { DOCUMENTS_ROUTE_NARROWING } from '../../src/app/documents-route.ts';
import { HISTORY_ROUTE_NARROWING } from '../../src/app/history-route.ts';
import { OBLIGATIONS_ROUTE_NARROWING } from '../../src/app/obligations-route.ts';
import { REVIEWER_ROUTE_NARROWING } from '../../src/app/reviewer-route.ts';
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
  REVIEWER_ROUTE_NARROWING,
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

describe('explicit narrowed HTTP composition', () => {
  describe.each(ALL_DESCRIPTORS)('descriptor %j', route => {
    it('refuses absent server selection', () => {
      expect(() => createRouteNarrowedComposition({ route })).toThrow('explicit formspecServerUrl');
    });
    it('declares only configured route capabilities', async () => {
      const composition = createRouteNarrowedComposition({ config: productionConfig(), route });
      expect(composition.mode).toBe('production');
      expect(() => assertCompositionCoherence(composition)).not.toThrow();
      expect(composition.instanceCapabilities.trustedReviewer).toBe(route.consumes.has('trustedReviewer') ? 'available' : 'unavailable');
      expect(composition.instanceCapabilities.status).toBe('unavailable');
      expect(composition.instanceCapabilities.respondentPlace).toBe('unavailable');
      expect(composition.formRuntimePolicyExtractor.extract(sampleFormDefinition).features).toEqual({});
      await expect(composition.definitionSource.getDefinition('urn:test:form')).rejects.toThrow();
      await expect(composition.draftStore.load({ formUrl: 'urn:test:form', subjectRef: 'test-owner' })).rejects.toThrow();
      await expect(composition.submitTransport.submit({} as never, 'operation')).rejects.toThrow();
    });
    it('uses only known feature keys', () => {
      expect([...route.consumes].every(isRuntimeFeatureKey)).toBe(true);
    });
  });
});
