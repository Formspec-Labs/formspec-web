import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { dereferenceBundleExport, flattenRegistryEntries, resolveDataSourceDescriptor, type BundleExport } from '@formspec-org/surface';
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

function completeTaskFixture() {
  const f = fixture();
  const bundle = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/task-initial-data-complete-v1.bundle.json'), 'utf8')) as BundleExport;
  const resolved = dereferenceBundleExport(bundle);
  const definition = resolved.definitions.get('urn:formspec:demo:d1:passport-renewal')!;
  const factory = vi.fn(() => ({ authorizeDataSource: () => ({ status: 'refused' as const }),
    dataSourceLoader: () => ({ status: 'unavailable' as const, reason: 'Actual protected task context not supplied' }), validateDataSourcePayload: () => ({ valid: false as const }) }));
  const policy: NativePackageSigningHostPolicy = { ...f.policy, bundle, definition,
    moduleId: 'x-demo-signing', modules: bundle.manifest.modules,
    structuredPanelWidgets: [{ moduleId: 'x-case-file-review', registryEntryVersion: '0.1.1' }],
    registryEntries: flattenRegistryEntries(resolved.registries).entries,
    locales: Object.values(bundle.documents).filter((v): v is NativePackageSigningHostPolicy['locales'][number] => !!v && typeof v === 'object' && '$formspecLocale' in v),
    initialDataSources: factory, candidateHydration: { qualifySaved: async () => { throw new Error('Actual Source proof required'); }, retireFacts() {}, dispose() {} },
    readiness: { instance: 'draftReadiness', readyPath: 'ready', ownedPath: 'owned' },
    hostEvents: [{ artifactRef: 'urn:formspec:demo:d1:signing-app:response-actions', actionRef: 'paper', eventName: 'formspec-review-paper-alternative', handle: async () => {} }, { artifactRef: 'urn:formspec:demo:d1:signing-app:response-actions', actionRef: 'inspect-photo', eventName: 'formspec-attachment-inspection-request', handle: async context => context.refreshSavedFacts() }],
  };
  return { policy, factory, resolved };
}
describe('complete native task initial-data admission', () => {
  it('admits all 51 documents with the existing task candidate and source factory; unqualified correction context remains unavailable', async () => {
    const f = completeTaskFixture(); expect(Object.keys(f.policy.bundle.documents)).toHaveLength(51);
    const host = createNativePackageSigningHost(f.policy);
    const generation = host.getSnapshot().sessionGeneration;
    const marker = host.allocateSurfaceSessionMarker(generation); const visit = host.createSurfaceVisit(marker, generation);
    const ports = visit.bindRuntime(); visit.activate();
    const descriptor = resolveDataSourceDescriptor(f.resolved.dataSources!, { catalogRef: 'urn:formspec:demo:d1:complete-app:data-sources:applicant-tasks', sourceRef: 'host:qualified-correction-case' })!;
    const surface = f.resolved.surfaces.find(v => f.resolved.surfaceRefs?.get(v) === 'urn:formspec:demo:d1:complete-app:surface:correction')!;
    expect(await ports.dataSourceLoader({ descriptor, context: { surfaceId: surface.id, surfaceRef: 'urn:formspec:demo:d1:complete-app:surface:correction', routeId: 'correction', slotId: 'full-original-form', definitionRef: f.policy.definition.url, params: {}, sessionGeneration: marker } })).toMatchObject({ status: 'unavailable' });
    expect(f.factory).toHaveBeenCalledOnce(); visit.dispose(); host.dispose();
  });
  it('refuses the complete task bundle when its required initial-data provider is missing', () => {
    const f = completeTaskFixture();
    expect(() => createNativePackageSigningHost({ ...f.policy, initialDataSources: undefined })).toThrow('native-initial-data-source-capability-unavailable');
    expect(f.factory).not.toHaveBeenCalled();
  });
});
