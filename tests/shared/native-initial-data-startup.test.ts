import { describe, expect, it, vi } from 'vitest';
import { resolveDataSourceDescriptor, type BundleExport } from '@formspec-org/surface';
import type { FormDefinition, DataSourcesDocument } from '@formspec-org/types';
import { createNativePackageSigningHost, type NativePackageSigningHostPolicy } from '../../src/shared/native-package-signing-host.ts';
function fixture() {
  const definition: FormDefinition = { $formspec: '1.0', url: 'urn:test:form', version: '1.0.0', title: 'Initial data startup test', items: [], instances: { host: { readonly: false, data: { ready: false, owned: false } } } };
  const catalog: DataSourcesDocument = { $formspecDataSources: '1.0', id: 'urn:test:sources', version: '1.0.0', sources: [{ id: 'prefill', kind: 'host-state', owner: 'host', scope: 'route',
    availability: { level: 'slot', surfaceRef: 'urn:test:surface', routeRef: 'form', slotId: 'form' }, runtime: { delivery: 'live', cache: { mode: 'subscribe' }, authorizationBoundary: 'host', failureMode: 'block-render', provenance: { kind: 'host-state', source: 'external-owner' } }, schema: { type: 'object' } }] };
  const bundle: BundleExport = { manifest: { version: '2.4', definitions: [{ url: definition.url, version: definition.version }], surfaces: [{ url: 'urn:test:surface' }],
    entrySurface: 'urn:test:surface', dataSources: [{ url: catalog.id }], mappings: [{ handle: 'seed', url: 'urn:test:mapping', version: '1.0.0' }], modules: [{ id: 'x-test', version: '0.1.0' }] }, documents: {
    [definition.url]: definition, [catalog.id]: catalog,
    'urn:test:surface': { $formspecSurface: '0.3', id: 'surface', entry: 'form', routes: [{ id: 'form', path: '/start', routeClass: 'intake', slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: definition.url, initialData: { catalogRef: catalog.id, sourceRef: 'prefill', mappingRef: 'seed' } } }] }] },
    'urn:test:mapping': { $formspecMapping: '1.0', version: '1.0.0', definitionRef: definition.url, definitionVersion: '1.0.0', direction: 'reverse', targetSchema: { format: 'json' }, rules: [] },
  } };
  const factory = vi.fn(() => ({ authorizeDataSource: () => ({ status: 'authorized' as const }),
    dataSourceLoader: () => ({ status: 'loaded' as const, freshness: 'fresh' as const, value: { declared: false }, recordId: 'external' }), validateDataSourcePayload: () => ({ valid: true as const }) }));
  const policy = { bundle, definition, moduleId: 'x-test', registryEntries: [], locales: [], controller: { roles: {} }, publication: { formId: 'form', formVersionId: 'publication' },
    initialLocale: 'en', readiness: { instance: 'host', readyPath: 'ready', ownedPath: 'owned' }, bindings: {}, initialDataSources: factory,
    actionLabels: () => ({}), validatePayload: () => ({ valid: true }), attachmentStore: {}, invalidateAuthority() {}, assertOwner() {},
    clearDraftAccess: async () => {}, signingContext: () => { throw new Error('not a signing operation'); }, semanticScope: () => { throw new Error('not mounted'); },
    reviewResponseDigest: async () => 'digest', canonicalResponseHandoffBytes: () => new Uint8Array() } as unknown as NativePackageSigningHostPolicy;
  return { policy, factory, catalog };
}
describe('native initial-data startup admission', () => {
  it('rejects missing trusted source capability before the form mounts', () => {
    const f = fixture(); expect(() => createNativePackageSigningHost({ ...f.policy, initialDataSources: undefined })).toThrow('native-initial-data-source-capability-unavailable');
    expect(f.factory).not.toHaveBeenCalled();
  });
  it('plans an actual manifested Mapping handle and delivers pre-mount source data in the active visit', async () => {
    const f = fixture(); const host = createNativePackageSigningHost(f.policy);
    expect(host.getStartupRoute('/start')).toMatchObject({ entryHref: '/start', requiresHostState: false });
    const marker = host.allocateSurfaceSessionMarker(host.getSnapshot().sessionGeneration);
    const visit = host.createSurfaceVisit(marker, host.getSnapshot().sessionGeneration); const ports = visit.bindRuntime();
    expect(f.factory).not.toHaveBeenCalled(); visit.activate();
    const descriptor = resolveDataSourceDescriptor([{ catalogRef: f.catalog.id, document: f.catalog }], { catalogRef: f.catalog.id, sourceRef: 'prefill' })!;
    expect(await ports.dataSourceLoader({ descriptor, context: { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'form', slotId: 'form', definitionRef: 'urn:test:form', params: {}, sessionGeneration: marker } })).toMatchObject({ status: 'loaded', value: { declared: false } });
    expect(f.factory).toHaveBeenCalledOnce(); visit.dispose(); host.dispose();
  });
});
