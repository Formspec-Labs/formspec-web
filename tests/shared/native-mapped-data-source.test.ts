import { describe, expect, it, vi } from 'vitest';
import { resolveDataSourceDescriptor } from '@formspec-org/surface';
import type { DataSourcesDocument, MappingDocument } from '@formspec-org/types';
import { createNativeMappedDataSource, type NativeMappedDataSourceInput } from 'formspec-web/shared';

function fixture() {
  const catalog: DataSourcesDocument = { $formspecDataSources: '1.0', id: 'urn:test:catalog', version: '1', sources: [{
    id: 'mapped', kind: 'host-state', owner: 'host', scope: 'route',
    availability: { level: 'slot', surfaceRef: 'urn:test:surface', routeRef: 'review', slotId: 'review' },
    runtime: { delivery: 'live', cache: { mode: 'subscribe' }, authorizationBoundary: 'host', failureMode: 'block-render', provenance: { kind: 'host-state', source: 'protected' } },
    schema: { type: 'object', required: ['value'] },
  }] };
  const descriptor = resolveDataSourceDescriptor([{ catalogRef: catalog.id, document: catalog }], { catalogRef: catalog.id, sourceRef: 'mapped' })!;
  const request = { descriptor, context: { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'review', slotId: 'review', params: {}, sessionGeneration: 1 } };
  let current = true;
  const guard = () => { if (!current) throw new Error('retired'); };
  const reverse = vi.fn(() => ({ direction: 'reverse' as const, output: { value: 'native-output' }, appliedRules: 1, diagnostics: [] }));
  const read = vi.fn<NativeMappedDataSourceInput['read']>(async () => ({ result: { status: 'loaded', value: { protected: true }, recordId: 'actual-process', revision: '2026-10-09T10:00:00Z', freshness: 'fresh' }, assertCurrent: guard }));
  const options: NativeMappedDataSourceInput = { descriptor, mapping: { mappingRef: 'selected', artifactRef: 'urn:test:mapping', document: { $formspecMapping: '1.0', version: '1', definitionRef: 'urn:test:definition', definitionVersion: '1', targetSchema: { format: 'json' }, direction: 'reverse', rules: [{ sourcePath: 'protected', targetPath: 'value', transform: 'preserve' }] } satisfies MappingDocument },
    direction: 'reverse', assertCurrent: guard, authorize: () => ({ status: 'authorized' }), read, validateInput: () => true, validateOutput: () => ({ valid: true }), createEngine: () => ({ reverse, forward: () => { throw new Error('wrong direction'); } }) };
  return { options, request, read, reverse, retire: () => { current = false; } };
}
describe('native mapped data source', () => {
  it('executes reverse and preserves exact reader identity and refreshed timestamp', async () => {
    const f = fixture(); const ports = createNativeMappedDataSource(f.options);
    expect(await ports.dataSourceLoader(f.request)).toEqual({ status: 'loaded', value: { value: 'native-output' }, recordId: 'actual-process', revision: '2026-10-09T10:00:00Z', freshness: 'fresh' });
    expect(f.reverse).toHaveBeenCalledWith({ protected: true });
  });
  it.each(['access', 'input', 'output', 'retired', 'foreign'] as const)('refuses %s without delivering raw protected data', async kind => {
    const f = fixture();
    if (kind === 'access') Object.assign(f.options, { authorize: () => ({ status: 'refused' }) });
    if (kind === 'input') Object.assign(f.options, { validateInput: () => false });
    if (kind === 'output') Object.assign(f.options, { validateOutput: () => ({ valid: false }) });
    if (kind === 'foreign') f.request.context.slotId = 'foreign';
    const ports = createNativeMappedDataSource(f.options); if (kind === 'retired') f.retire();
    expect(await ports.dataSourceLoader(f.request)).toMatchObject({ status: 'unavailable' });
    if (['access', 'foreign', 'retired'].includes(kind)) expect(f.read).not.toHaveBeenCalled();
  });
  it('snapshots public payload-validation input before an asynchronous validator', async () => {
    const f = fixture(); let release!: () => void; let captured: unknown;
    Object.assign(f.options, { validateOutput: async (request: { value: unknown }) => {
      await new Promise<void>(resolve => { release = resolve; }); captured = request.value; return { valid: true };
    } });
    const ports = createNativeMappedDataSource(f.options);
    const request = { ...f.request, schema: f.request.descriptor.source.schema!, value: { value: 'original' } };
    const pending = ports.validateDataSourcePayload(request);
    request.value.value = 'changed'; release();
    expect(await pending).toEqual({ valid: true });
    expect(captured).toEqual({ value: 'original' });
  });
  it('refuses every native diagnostic rather than installing partial output', async () => {
    const f = fixture();
    Object.assign(f.options, { createEngine: () => ({ reverse: () => ({ direction: 'reverse', output: { value: 'partial' }, appliedRules: 0,
      diagnostics: [{ ruleIndex: 0, errorCode: 'FEL_RUNTIME', message: 'refused' }] }), forward: () => { throw new Error('wrong direction'); } }) });
    expect(await createNativeMappedDataSource(f.options).dataSourceLoader(f.request)).toMatchObject({ status: 'unavailable' });
  });
  it('refuses owner retirement during schema validation', async () => {
    const f = fixture();
    Object.assign(f.options, { validateInput: async () => { f.retire(); return true; } });
    const ports = createNativeMappedDataSource(f.options);
    expect(await ports.dataSourceLoader(f.request)).toMatchObject({ status: 'unavailable' });
    expect(f.reverse).not.toHaveBeenCalled();
  });
});
