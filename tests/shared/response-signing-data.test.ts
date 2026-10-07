import { describe, expect, it } from 'vitest';
import { resolveDataSourceDescriptor, type DataSourceLoadRequest } from '@formspec-org/surface';
import { SIGNING_CEREMONY_WIDGET_SHAPE, type SigningCeremonyData } from '@formspec-org/surface-react';
import type { DataSourcesDocument } from '@formspec-org/types';
import { createResponseSigningDataSourceRuntime } from '../../src/shared/response-signing-data.ts';

function fixture() {
  const catalog: DataSourcesDocument = {
    $formspecDataSources: '1.0', id: 'urn:test:catalog', version: '1.0',
    sources: SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs.map(({ name }) => ({
      id: `host:${name}`, kind: 'host-state', owner: 'host', scope: 'route',
      availability: { level: 'slot', surfaceRef: 'urn:test:surface', routeRef: 'signing', slotId: 'ceremony' },
      runtime: { delivery: 'live', cache: { mode: 'subscribe' }, authorizationBoundary: 'host',
        failureMode: 'block-render', provenance: { kind: 'host-state', source: `admitted-signing-cohort:${name}` } },
      schema: { type: 'object' },
    })) as DataSourcesDocument['sources'],
  };
  const bindings = Object.fromEntries(SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs.map(({ name }) =>
    [name, { catalogRef: catalog.id, sourceRef: `host:${name}` }]));
  const snapshot = {
    content: { captured: true }, response: { data: { answer: 'captured' } },
    draft: { id: 'owned-draft', version: 7, responseHash: 'captured-hash' },
    actor: { id: 'owned-actor' }, signingResult: { state: 'unsigned' }, actionLabels: { sign: 'Sign' },
  } as unknown as SigningCeremonyData;
  let current = true;
  const input = { catalogs: [{ catalogRef: catalog.id, document: catalog }], bindings, snapshot,
    generation: 'generation', assertCurrent: () => { if (!current) throw new Error('disposed'); },
    validatePayload: () => ({ valid: true as const }) };
  const request = (name: string): DataSourceLoadRequest => ({
    descriptor: resolveDataSourceDescriptor(input.catalogs, bindings[name]!)!,
    context: { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'signing', slotId: 'ceremony',
      params: {}, sessionGeneration: 'generation' },
  });
  return { input, catalog, request, invalidate: () => { current = false; } };
}

describe('registered signing ceremony data producer', () => {
  it('captures every maintained input at one owned revision and preserves payload validation', () => {
    const { input, request } = fixture();
    const runtime = createResponseSigningDataSourceRuntime(input);
    input.snapshot.draft.version = 99;
    input.snapshot.response.data.answer = 'changed';
    for (const { name } of SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs) {
      expect(runtime.authorizeDataSource(request(name))).toEqual({ status: 'authorized' });
      expect(runtime.dataSourceLoader(request(name))).toMatchObject({ status: 'loaded', recordId: 'owned-draft', revision: 7 });
    }
    expect(runtime.dataSourceLoader(request('response'))).toMatchObject({ value: { data: { answer: 'captured' } } });
    expect(runtime.validateDataSourcePayload).toBe(input.validatePayload);
  });

  it.each(SIGNING_CEREMONY_WIDGET_SHAPE.dataInputs.filter(field => field.required).map(field => field.name))(
    'refuses a missing required %s binding before registration', name => {
      const { input } = fixture(); delete input.bindings[name];
      expect(() => createResponseSigningDataSourceRuntime(input)).toThrow(/required/);
    });

  it('refuses unknown fields, missing values, and mismatched producer provenance', () => {
    const unknown = fixture().input; unknown.bindings.other = unknown.bindings.actor!;
    expect(() => createResponseSigningDataSourceRuntime(unknown)).toThrow(/undeclared/);
    const missing = fixture().input; delete (missing.snapshot as unknown as Record<string, unknown>).actor;
    expect(() => createResponseSigningDataSourceRuntime(missing)).toThrow(/required/);
    const wrong = fixture(); wrong.catalog.sources[0]!.runtime.provenance.source = 'other-producer';
    expect(() => createResponseSigningDataSourceRuntime(wrong.input)).toThrow(/registered producer/);
  });

  it('refuses ambiguous authored sources and invalidated private generation', () => {
    const duplicate = fixture(); duplicate.catalog.sources.push(duplicate.catalog.sources[0]!);
    expect(() => createResponseSigningDataSourceRuntime(duplicate.input)).toThrow();
    const { input, request, invalidate } = fixture();
    const runtime = createResponseSigningDataSourceRuntime(input); invalidate();
    expect(runtime.authorizeDataSource(request('response'))).toMatchObject({ status: 'refused' });
    expect(runtime.dataSourceLoader(request('response'))).toMatchObject({ status: 'unavailable' });
  });

  it('refuses accessor-bearing snapshots without reading them', () => {
    const { input } = fixture(); let reads = 0;
    Object.defineProperty(input.snapshot, 'actor', { enumerable: true, get: () => { reads++; return { id: 'untrusted' }; } });
    expect(() => createResponseSigningDataSourceRuntime(input)).toThrow();
    expect(reads).toBe(0);
  });
});
