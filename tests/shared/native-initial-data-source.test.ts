import { describe, expect, it, vi } from 'vitest';
import { resolveDataSourceDescriptor, type DataSourceLoadRequest } from '@formspec-org/surface';
import type { DataSourcesDocument } from '@formspec-org/types';
import { createNativeInitialDataSourceRuntime, type NativeInitialDataSourcePorts } from '../../src/shared/native-initial-data-source.ts';
function fixture() {
  const catalog: DataSourcesDocument = { $formspecDataSources: '1.0', id: 'urn:test:sources', version: '1', sources: [{ id: 'prefill', kind: 'host-state', owner: 'host', scope: 'route',
    availability: { level: 'slot', surfaceRef: 'urn:test:surface', routeRef: 'form', slotId: 'form' },
    runtime: { delivery: 'live', cache: { mode: 'subscribe' }, authorizationBoundary: 'host', failureMode: 'block-render', provenance: { kind: 'host-state', source: 'external-owner' } }, schema: { type: 'object' } }] };
  const descriptor = resolveDataSourceDescriptor([{ catalogRef: catalog.id, document: catalog }], { catalogRef: catalog.id, sourceRef: 'prefill' })!;
  const context = { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'form', slotId: 'form', definitionRef: 'urn:test:form' };
  const request: DataSourceLoadRequest = { descriptor, context: { ...context, params: {}, sessionGeneration: 'visit' } };
  let active = false;
  const ports: NativeInitialDataSourcePorts = { authorizeDataSource: vi.fn(() => ({ status: 'authorized' as const })),
    dataSourceLoader: vi.fn(async () => ({ status: 'loaded' as const, freshness: 'fresh' as const, value: { declared: false }, recordId: 'selected-record', revision: 2 })), validateDataSourcePayload: vi.fn(() => ({ valid: true })) };
  const input = { sites: [{ descriptor, context }], sessionGeneration: 'visit', assertCurrent: () => { if (!active) throw new Error('inactive visit'); }, createPorts: vi.fn(() => ports) };
  return { input, request, ports, activate: () => { active = true; }, retire: () => { active = false; } };
}
describe('pre-mount native initial-data ownership', () => {
  it('reports missing selected source capability before creating a provider or form', () => {
    const f = fixture(); expect(() => createNativeInitialDataSourceRuntime({ ...f.input, createPorts: undefined })).toThrow('native-initial-data-source-capability-unavailable');
    expect(f.input.createPorts).not.toHaveBeenCalled();
  });
  it('constructs once after visit activation and loads without a response runtime', async () => {
    const f = fixture(); const runtime = createNativeInitialDataSourceRuntime(f.input);
    expect(f.input.createPorts).not.toHaveBeenCalled();
    expect(await runtime.dataSourceLoader(f.request)).toMatchObject({ status: 'unavailable' });
    f.activate();
    expect(await runtime.dataSourceLoader(f.request)).toMatchObject({ status: 'loaded', value: { declared: false }, recordId: 'selected-record', revision: 2 });
    await runtime.dataSourceLoader(f.request); expect(f.input.createPorts).toHaveBeenCalledOnce();
  });
  it.each(['routeId', 'slotId', 'definitionRef', 'sessionGeneration'])('refuses foreign %s', field => {
    const f = fixture(); f.activate(); const runtime = createNativeInitialDataSourceRuntime(f.input);
    Object.assign(f.request.context, { [field]: 'foreign' });
    return expect(runtime.dataSourceLoader(f.request)).resolves.toMatchObject({ status: 'unavailable' });
  });
  it('keeps changed descriptors in the owned branch and refuses them', async () => {
    const f = fixture(); f.activate(); const runtime = createNativeInitialDataSourceRuntime(f.input);
    f.request.descriptor = { ...f.request.descriptor, source: { ...f.request.descriptor.source, schema: { type: 'string' } } };
    expect(runtime.owns(f.request)).toBe(true); expect(await runtime.dataSourceLoader(f.request)).toMatchObject({ status: 'unavailable' });
    expect(f.ports.dataSourceLoader).not.toHaveBeenCalled();
  });
  it('refuses owner denial without reading or falling back', async () => {
    const f = fixture(); f.activate();
    Object.assign(f.ports, { authorizeDataSource: () => ({ status: 'refused' }) });
    expect(await createNativeInitialDataSourceRuntime(f.input).dataSourceLoader(f.request)).toMatchObject({ status: 'unavailable' });
    expect(f.ports.dataSourceLoader).not.toHaveBeenCalled();
  });
  it('refuses retirement during asynchronous reads', async () => {
    const f = fixture(); f.activate();
    Object.assign(f.ports, { dataSourceLoader: async () => { f.retire(); return { status: 'loaded' as const, freshness: 'fresh' as const, value: { declared: false } }; } });
    expect(await createNativeInitialDataSourceRuntime(f.input).dataSourceLoader(f.request)).toMatchObject({ status: 'unavailable' });
  });
});
