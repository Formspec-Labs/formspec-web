import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleFormDefinition } from '../../src/adapter-conformance/fixtures.ts';
import { createDefaultComposition } from '../../src/composition/default.ts';
import { resolveActiveConfig } from '../../src/config/runtime.ts';
import { publicPortalProfile } from '../../src/profiles/profiles.ts';

const selectedUrl = 'selected-server-form';
const theme = { $formspecTheme: '1.0', targetDefinition: { url: sampleFormDefinition.url }, tokens: { color: 'navy' } };
const actions = { $formspecResponseActions: '1.0', actions: [] };
const locale = { $formspecLocale: '2.0', url: 'https://example.test/locales/es', version: '1.0.0', locale: 'es', target: { kind: 'definition', url: sampleFormDefinition.url }, strings: { title: 'Example' } };
const componentRef = { handle: 'intake', url: 'urn:formspec:test:component:intake', version: '1.0.0' };
const component = { $formspecComponent: '1.2', url: componentRef.url, version: componentRef.version,
  targetDefinition: { url: sampleFormDefinition.url, compatibleVersions: sampleFormDefinition.version },
  tree: { component: 'Stack', children: [{ component: 'Text', text: 'Authored preview' }] } };

afterEach(() => vi.unstubAllGlobals());

function preview(withComponent = false) {
  vi.stubGlobal('crypto', webcrypto);
  const definition = withComponent ? { ...sampleFormDefinition, status: 'active' } : sampleFormDefinition;
  const surfaceUrl = 'https://example.test/surfaces/preview';
  const documents: Record<string, unknown> = {
    'definition.json': definition,
    'theme.json': theme,
    'actions.json': actions,
    'locale.json': locale,
    ...(withComponent ? {
      'component.json': component,
      'native.json': {
        manifest: { $formspecBundle: '2.4', id: 'https://example.test/apps/preview', version: '1.0.0',
          definitions: [{ url: definition.url, version: definition.version }],
          locales: [{ url: locale.url, version: locale.version, locale: locale.locale }],
          components: [componentRef], surfaces: [{ url: surfaceUrl, version: '1.0.0' }], entrySurface: surfaceUrl },
        documents: {
          [definition.url]: definition,
          [locale.url]: locale,
          [surfaceUrl]: { $formspecSurface: '0.2', id: 'preview', entry: 'start', routes: [
            { id: 'start', path: '/', slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: definition.url } }] },
          ] },
        },
      },
    } : {}),
  };
  const bytes = Object.fromEntries(Object.entries(documents).map(([path, document]) => [path, JSON.stringify(document)]));
  const pin = (path: string) => ({ path, sha256: createHash('sha256').update(bytes[path]).digest('hex') });
  const manifest = { files: { definition: pin('definition.json'), theme: pin('theme.json'), responseActions: pin('actions.json'), locales: [pin('locale.json')],
    ...(withComponent ? { nativeBundle: pin('native.json'), component: { ...pin('component.json'), ref: componentRef } } : {}) } };
  const fetch = vi.fn(async (input: URL) => {
    const path = input.pathname.split('/').at(-1)!;
    if (path === 'package.json') return new Response(JSON.stringify(manifest));
    if (!(path in bytes)) throw new Error(`Unexpected fetch: ${input}`);
    return new Response(bytes[path]);
  });
  vi.stubGlobal('fetch', fetch);
  const config = resolveActiveConfig(publicPortalProfile, { formspecServerUrl: 'http://127.0.0.1:18080' });
  return { composition: createDefaultComposition(config, { initialDefinitionUrl: selectedUrl, packageUrl: '/package.json' }), fetch };
}

describe('package preview Definition binding', () => {
  it('forwards a qualified authored Component through the selected server alias', async () => {
    const { composition, fetch } = preview(true);
    expect(await composition.definitionSource.getComponentDocument!(selectedUrl, sampleFormDefinition.version)).toEqual(component);
    expect(await composition.definitionSource.getDefinition(selectedUrl)).toMatchObject({ url: sampleFormDefinition.url, version: sampleFormDefinition.version });
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it('loads the selected server alias while preserving the canonical Definition and cached presentation', async () => {
    const { composition, fetch } = preview();
    const source = composition.definitionSource;
    expect(composition.initialDefinitionUrl).toBe(selectedUrl);
    expect(selectedUrl).not.toBe(sampleFormDefinition.url);
    const definition = await source.getDefinition(composition.initialDefinitionUrl!, sampleFormDefinition.version);
    expect(definition).toEqual(sampleFormDefinition);
    expect(await source.getDefinition(selectedUrl)).toEqual(sampleFormDefinition);
    expect(await source.getThemeDocument!(selectedUrl, sampleFormDefinition.version)).toEqual(theme);
    expect(await source.getResponseActionsDocument!(selectedUrl)).toEqual(actions);
    expect(await source.getLocaleDocuments!(selectedUrl)).toEqual([locale]);
    expect(await source.getComponentDocument!(selectedUrl)).toBeNull();
    definition.title = 'Caller mutation';
    expect(await source.getDefinition(selectedUrl)).toEqual(sampleFormDefinition);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(await composition.identityProvider.discover()).toEqual([]);
  });

  it.each([
    ['foreign-server-form', sampleFormDefinition.version],
    [sampleFormDefinition.url, sampleFormDefinition.version],
    ['', sampleFormDefinition.version],
    [selectedUrl, '99.0.0'],
    [selectedUrl, ''],
  ])('refuses a foreign preview selector or version: %s @ %s', async (url, version) => {
    const { composition } = preview();
    const source = composition.definitionSource;
    const reads: Array<(url: string, version?: string) => Promise<unknown>> = [source.getDefinition, source.getThemeDocument!, source.getResponseActionsDocument!, source.getLocaleDocuments!, source.getComponentDocument!];
    for (const read of reads) {
      await expect(read(url, version)).rejects.toThrow('selection mismatch');
    }
    expect(await source.getDefinition(selectedUrl, sampleFormDefinition.version)).toEqual(sampleFormDefinition);
  });
});
