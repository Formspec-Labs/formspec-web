import type * as SurfaceReact from '@formspec-org/surface-react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativePackageRespondentHostProps } from '../../src/app/NativePackageRespondentHost.tsx';
import { NativePackageRespondentHost } from '../../src/app/NativePackageRespondentHost.tsx';
const test = vi.hoisted(() => ({ slot: undefined as unknown, received: undefined as unknown }));
vi.mock('@formspec-org/surface-react', async importOriginal => {
  const actual = await importOriginal<typeof SurfaceReact>();
  return { ...actual, useSurfaceApp: () => ({ app: {} }), deriveSurfaceRuntimeGeneration: () => 'visit',
    SurfaceApp: ({ renderDefinitionForm }: { renderDefinitionForm: (slot: unknown) => unknown }) => renderDefinitionForm(test.slot) };
});
vi.mock('../../src/app/RespondentRuntime.tsx', () => ({ RespondentDefinitionController: ({ form }: { form: unknown }) => {
  test.received = form; return <div>Selected form</div>;
} }));
afterEach(() => { cleanup(); test.received = undefined; });
describe('selected native form initial-data forwarding', () => {
  it('preserves qualified initial data and its provenance through the actual custom renderer', () => {
    const definition = { $formspec: '1.0', url: 'urn:test:form', version: '1', items: [] };
    const componentDocument = { $formspecComponent: '1.0', version: '1', targetDefinition: { url: definition.url, version: '1' }, tree: { component: 'Stack', children: [] } };
    const initialData = { data: { declared: false }, freshness: 'fresh', recordId: 'external-record', revision: 3, generation: 'visit' };
    test.slot = { plan: { definition, slotId: 'form', registryEntries: [] }, route: { surfaceId: 'surface', surfaceRef: 'urn:test:surface', routeId: 'form', params: {} },
      grant: { themeDocument: {} }, initialData };
    const snapshot = { locale: 'en', sessionGeneration: 1, cleared: false };
    const props = { host: { definition, bundle: { definitions: new Map([[definition.url, definition]]), surfaces: [], manifest: { surfaces: [] } }, widgetModules: [], moduleId: 'generic',
      subscribe: () => () => {}, getSnapshot: () => snapshot, allocateSurfaceSessionMarker: () => 'visit',
      createSurfaceVisit: () => ({ activate() {}, dispose() {}, bindRuntime: () => ({}) }) },
      composition: { draftStore: {} }, config: {}, componentDocument, componentRouteResolver: () => ({ status: 'ready', component: { document: componentDocument } }), localeDocuments: [], location: '/form', onNavigate() {} } as unknown as NativePackageRespondentHostProps;
    render(<NativePackageRespondentHost {...props} />);
    expect(screen.getByText('Selected form')).toBeTruthy();
    expect(test.received).toMatchObject({ initialData });
  });
});
