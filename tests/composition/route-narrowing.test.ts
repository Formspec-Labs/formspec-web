import { describe, expect, it, vi } from 'vitest';
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

describe('explicit narrowed HTTP composition', () => {
  describe.each(ALL_DESCRIPTORS)('descriptor %j', route => {
    it('refuses absent server selection', () => {
      expect(() => createRouteNarrowedComposition({ route })).toThrow('explicit formspecServerUrl');
    });
    it('declares only configured route capabilities', async () => {
      const composition = createRouteNarrowedComposition({ config: productionConfig(), route });
      expect(composition.mode).toBe('production');
      expect(() => assertCompositionCoherence(composition)).not.toThrow();
      expect(composition.instanceCapabilities.trustedReviewer).toBe('unavailable');
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


describe('authenticated status reader injection', () => {
  function selected() {
    const session = { issuer: 'https://idp.test', subject: 'applicant', revision: 1, expiresAt: '2099-01-01T00:00:00Z' };
    const provider = { discover: async () => [], authenticate: vi.fn(), revoke: async () => {}, subscribe: () => () => {} };
    const browserAuthSession = { getSession: async () => session, begin: async () => {}, completeCallback: async () => session,
      completeSilentCallback: async () => {}, renew: async () => session, logout: async () => {}, completeLogoutCallback: async () => {},
      accessToken: async () => 'current-bearer', subscribe: () => () => {}, dispose: () => {} };
    const config: FormspecWebConfig = { ...productionConfig(), identity: { mode: 'oidc-required',
      oidc: { issuer: session.issuer, clientId: 'fixture', redirectUri: '/callback', minAssurance: 'L2' } } };
    return { config, identityBinding: { provider, browserAuthSession, accessToken: browserAuthSession.accessToken },
      statusReader: { readStatus: vi.fn(async () => undefined) } };
  }
  it('uses the explicitly selected identity and reader without constructing form ports', async () => {
    const input = selected();
    const composition = createRouteNarrowedComposition({ ...input, route: STATUS_ROUTE_NARROWING });
    expect(composition.identityProvider).toBe(input.identityBinding.provider);
    expect(composition.instanceCapabilities.status).toBe('available');
    expect(composition.instanceCapabilities.recordLifecycle).toBe('unavailable');
    expect(() => assertCompositionCoherence(composition)).not.toThrow();
    await composition.statusReader.readStatus({ resourceRef: 'opaque-ledger' });
    expect(input.statusReader.readStatus).toHaveBeenCalledWith({ resourceRef: 'opaque-ledger' });
    await expect(composition.definitionSource.getDefinition('anything')).rejects.toThrow();
  });
  it('rejects reader injection without the selected ordinary OIDC session', () => {
    const input = selected();
    expect(() => createRouteNarrowedComposition({ config: input.config, statusReader: input.statusReader,
      route: STATUS_ROUTE_NARROWING })).toThrow('authenticated OIDC');
    expect(() => createRouteNarrowedComposition({ ...input, config: { ...productionConfig(), identity: { mode: 'anonymous-allowed' } },
      route: STATUS_ROUTE_NARROWING })).toThrow('authenticated OIDC');
    expect(() => createRouteNarrowedComposition({ ...input, route: DOCUMENTS_ROUTE_NARROWING })).toThrow('authenticated OIDC');
  });
});
