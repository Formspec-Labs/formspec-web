import { describe, expect, it } from 'vitest';
import { resolveDataSourceDescriptor, type DataSourceLoadRequest } from '@formspec-org/surface';
import type { DataSourcesDocument } from '@formspec-org/types';
import { createFrozenHostStateDataSourceRuntime } from '../../src/shared/frozen-host-state-data.ts';

function source(id: string): DataSourcesDocument['sources'][number] {
  return {
    id, kind: 'host-state' as const, owner: 'host' as const, scope: 'route' as const,
    availability: { level: 'slot' as const, surfaceRef: 'urn:test:surface', routeRef: 'review', slotId: 'review' },
    runtime: { delivery: 'live' as const, cache: { mode: 'subscribe' as const }, authorizationBoundary: 'host' as const,
      failureMode: 'block-render' as const, provenance: { kind: 'host-state' as const, source: `owned:${id}` } },
    schema: { type: 'object' },
  };
}
const catalog: DataSourcesDocument = {
  $formspecDataSources: '1.0', id: 'urn:test:catalog', version: '1.0', sources: [source('response'), source('draft')],
};
function fixture() {
  const descriptors = catalog.sources.map(source => resolveDataSourceDescriptor([{ catalogRef: catalog.id, document: structuredClone(catalog) }],
    { catalogRef: catalog.id, sourceRef: source.id })!);
  const entries = descriptors.map(descriptor => ({ descriptor, value: { answer: { value: 'captured' } } }));
  let current = true;
  const input = { entries, generation: 'generation-1', recordId: 'owned-draft', revision: 3,
    assertCurrent: () => { if (!current) throw new Error('disposed'); }, validatePayload: () => ({ valid: true as const }) };
  const runtime = createFrozenHostStateDataSourceRuntime(input);
  const request: DataSourceLoadRequest = { descriptor: descriptors[0]!, context: {
    surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'review', slotId: 'review', params: {}, sessionGeneration: 'generation-1',
  } };
  return { input, runtime, request, invalidate: () => { current = false; } };
}

describe('frozen host-state data delivery', () => {
  it('delivers one captured revision and defensive values after caller mutations', () => {
    const { input, runtime, request } = fixture();
    input.entries[0]!.value.answer.value = 'later';
    input.revision = 99;
    expect(runtime.authorizeDataSource(request)).toEqual({ status: 'authorized' });
    const first = runtime.dataSourceLoader(request);
    expect(first).toMatchObject({ status: 'loaded', recordId: 'owned-draft', revision: 3, freshness: 'fresh', value: { answer: { value: 'captured' } } });
    if (!('then' in first) && first.status === 'loaded') (first.value as { answer: { value: string } }).answer.value = 'tampered';
    expect(runtime.dataSourceLoader(request)).toMatchObject({ value: { answer: { value: 'captured' } } });
    expect(runtime.validateDataSourcePayload).toBe(input.validatePayload);
  });

  it.each(['routeId', 'slotId', 'surfaceRef', 'sessionGeneration'] as const)('refuses different %s at authorization and direct load', key => {
    const { runtime, request } = fixture(); request.context[key] = 'other';
    expect(runtime.authorizeDataSource(request)).toMatchObject({ status: 'refused' });
    expect(runtime.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
  });

  it('requires the current private session independently of the generation string', () => {
    const { runtime, request, invalidate } = fixture(); invalidate();
    expect(runtime.authorizeDataSource(request)).toMatchObject({ status: 'refused' });
    expect(runtime.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
  });

  it.each(['source', 'catalog', 'sourceRef', 'catalogRef'] as const)('refuses changed qualified descriptor %s', key => {
    const { runtime, request } = fixture();
    if (key === 'source') request.descriptor.source = { ...request.descriptor.source, schema: { type: 'string' } };
    else if (key === 'catalog') request.descriptor.catalog = { ...request.descriptor.catalog, version: 'changed' };
    else request.descriptor[key] = 'other';
    expect(runtime.authorizeDataSource(request)).toMatchObject({ status: 'refused' });
    expect(runtime.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
  });

  it('refuses duplicate registrations and a source that is absent or duplicated in the catalog', () => {
    const { input } = fixture();
    expect(() => createFrozenHostStateDataSourceRuntime({ ...input, entries: [input.entries[0]!, input.entries[0]!] })).toThrow(/ambiguous/);
    input.entries[0]!.descriptor.catalog.sources.push(input.entries[0]!.descriptor.source);
    expect(() => createFrozenHostStateDataSourceRuntime(input)).toThrow(/exact admitted/);
  });

  it('refuses non-JSON values without invoking their getters', () => {
    const { input } = fixture();
    let reads = 0;
    Object.defineProperty(input.entries[0]!.value, 'getter', { enumerable: true, get: () => { reads++; return 'secret'; } });
    expect(() => createFrozenHostStateDataSourceRuntime(input)).toThrow();
    expect(reads).toBe(0);
    const fresh = fixture().input;
    (fresh.entries[0]!.value as unknown as { answer: unknown }).answer = Number.NaN;
    expect(() => createFrozenHostStateDataSourceRuntime(fresh)).toThrow();
  });

  it('refuses sources without host ownership and supplied caller metadata without valid revision', () => {
    const { input } = fixture();
    input.entries[0]!.descriptor.source.runtime.authorizationBoundary = 'module';
    expect(() => createFrozenHostStateDataSourceRuntime(input)).toThrow();
    const fresh = fixture().input;
    expect(() => createFrozenHostStateDataSourceRuntime({ ...fresh, revision: -1 })).toThrow();
    expect(() => createFrozenHostStateDataSourceRuntime({ ...fresh, generation: Number.NaN })).toThrow();
  });

  it('refuses accessor-bearing request descriptors without invoking them', () => {
    const { runtime, request } = fixture();
    let reads = 0;
    Object.defineProperty(request.descriptor, 'sourceRef', { enumerable: true, get: () => { reads++; return 'response'; } });
    expect(runtime.authorizeDataSource(request)).toMatchObject({ status: 'refused' });
    expect(runtime.dataSourceLoader(request)).toMatchObject({ status: 'unavailable' });
    expect(reads).toBe(0);
  });
});
