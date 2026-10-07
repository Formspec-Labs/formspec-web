import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { PinnedPackageDefinitionSource } from '../../../src/adapters/http/pinned-package-definition-source.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';

afterEach(() => vi.unstubAllGlobals());

describe('PinnedPackageDefinitionSource', () => {
  it('preserves authored data and shares the verified load across consumers', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const bytes = JSON.stringify(sampleFormDefinition);
    const sha256 = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes)))].map(b => b.toString(16).padStart(2, '0')).join('');
    const fetch = vi.fn(async (url: URL) => new Response(url.pathname.endsWith('package.json')
      ? JSON.stringify({ files: { definition: { path: 'definition.json', sha256 } } }) : bytes));
    vi.stubGlobal('fetch', fetch);
    const source = new PinnedPackageDefinitionSource('/package.json');
    const [definition, locales] = await Promise.all([source.getDefinition(), source.getLocaleDocuments()]);
    expect(definition).toEqual(sampleFormDefinition);
    expect(locales).toEqual([]);
    expect(await source.getNativeBundleExport()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses altered file bytes before the form can load', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('fetch', async (url: URL) => new Response(url.pathname.endsWith('package.json')
      ? JSON.stringify({ files: { definition: { path: 'definition.json', sha256: 'wrong' } } })
      : JSON.stringify(sampleFormDefinition)));
    await expect(new PinnedPackageDefinitionSource('/package.json').getDefinition()).rejects.toThrow('Package hash mismatch');
  });

  it('refuses a cross-origin package source', async () => {
    await expect(new PinnedPackageDefinitionSource('https://other.example/package.json').getDefinition()).rejects.toThrow('this app origin');
  });
});

const nativeDefinition = { ...sampleFormDefinition, status: 'active' as const };
const surfaceUrl = 'https://example.test/surfaces/native';
const localeUrl = 'https://example.test/locales/es';
const locale = {
  $formspecLocale: '2.0', url: localeUrl, version: '1.0.0', locale: 'es',
  target: { kind: 'definition', url: sampleFormDefinition.url }, strings: {},
};
function nativeBundle() {
  return {
    manifest: {
      $formspecBundle: '2.4', id: 'https://example.test/apps/native', version: '1.0.0',
      definitions: [{ url: sampleFormDefinition.url, version: sampleFormDefinition.version }],
      locales: [{ url: localeUrl, version: locale.version, locale: 'es' }],
      surfaces: [{ url: surfaceUrl, version: '1.0.0' }], entrySurface: surfaceUrl,
    },
    documents: {
      [sampleFormDefinition.url]: structuredClone(nativeDefinition),
      [localeUrl]: structuredClone(locale),
      [surfaceUrl]: { $formspecSurface: '0.2', id: 'native', entry: 'start',
        routes: [{ id: 'start', path: '/', slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: sampleFormDefinition.url } }] }] },
    } as Record<string, unknown>,
  };
}
async function mockNativePackage(candidate: unknown = nativeBundle(), options: {
  nativePath?: string; nativeBytes?: string; expectedNativeBytes?: string; duplicateLocale?: boolean;
} = {}) {
  vi.stubGlobal('crypto', webcrypto);
  const texts = {
    'definition.json': JSON.stringify(nativeDefinition),
    'locale.json': JSON.stringify(locale),
    'native.json': options.nativeBytes ?? JSON.stringify(candidate),
  };
  const pin = async (path: string, bytes: string) => ({ path, sha256: [...new Uint8Array(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes)),
  )].map(value => value.toString(16).padStart(2, '0')).join('') });
  const files = {
    definition: await pin('definition.json', texts['definition.json']),
    locales: await Promise.all((options.duplicateLocale ? [1, 2] : [1]).map(() => pin('locale.json', texts['locale.json']))),
    nativeBundle: await pin(options.nativePath ?? 'native.json', options.expectedNativeBytes ?? texts['native.json']),
  };
  const fetch = vi.fn(async (url: URL, _init?: RequestInit) => {
    const name = url.pathname.split('/').at(-1)!;
    const text = name === 'package.json' ? JSON.stringify({ files }) : texts[name as keyof typeof texts];
    if (text === undefined) throw new Error(`Unexpected resource fetch: ${url.href}`);
    return new Response(text);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('hash-pinned native package closure', () => {
  it('qualifies coherent resources once and returns independent native exports', async () => {
    const candidate = nativeBundle();
    const fetch = await mockNativePackage(candidate);
    const source = new PinnedPackageDefinitionSource('/package.json');
    const [bundle, definition, locales] = await Promise.all([
      source.getNativeBundleExport(), source.getDefinition(), source.getLocaleDocuments(),
    ]);
    expect(bundle).toEqual(candidate);
    expect(definition).toEqual(nativeDefinition);
    expect(locales).toEqual([locale]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([, init]) => init?.redirect === 'error')).toBe(true);
    (bundle!.documents as Record<string, unknown>)[sampleFormDefinition.url] = { changed: true };
    bundle!.manifest.title = 'Changed';
    definition.title = 'Changed sidecar';
    locales[0].strings = { changed: 'Changed' };
    expect(await source.getDefinition()).toEqual(nativeDefinition);
    expect(await source.getLocaleDocuments()).toEqual([locale]);
    expect(await source.getNativeBundleExport()).toEqual(candidate);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['non-export shape', () => ({ resources: {} })],
    ['schema-invalid Surface', () => {
      const b = nativeBundle(); b.documents[surfaceUrl] = { $formspecSurface: '0.2' }; return b;
    }],
    ['missing manifested document', () => {
      const b = nativeBundle(); delete b.documents[surfaceUrl]; return b;
    }],
    ['unmanifested document', () => {
      const b = nativeBundle(); b.documents['https://example.test/extra'] = {}; return b;
    }],
    ['unknown module without host support', () => ({
      ...nativeBundle(), manifest: { ...nativeBundle().manifest, modules: [{ id: 'x-unknown', version: '1.0.0' }] },
    })],
    ['wrong Definition pin', () => {
      const b = nativeBundle(); b.manifest.definitions[0].version = '2.0.0'; return b;
    }],
    ['Definition content mismatch', () => {
      const b = nativeBundle(); b.documents[sampleFormDefinition.url] = { ...nativeDefinition, title: 'Different' }; return b;
    }],
    ['wrong Locale pin', () => {
      const b = nativeBundle(); b.manifest.locales[0].version = '2.0.0'; return b;
    }],
    ['Locale content mismatch', () => {
      const b = nativeBundle(); b.documents[localeUrl] = { ...locale, strings: { greeting: 'Different' } }; return b;
    }],
    ['Locale sidecar omitted', () => {
      const b = nativeBundle(); b.manifest.locales = []; delete b.documents[localeUrl]; return b;
    }],
  ])('refuses %s before exposing the Definition', async (_name, build) => {
    const fetch = await mockNativePackage(build());
    const source = new PinnedPackageDefinitionSource('/package.json');
    await expect(source.getDefinition()).rejects.toThrow('Package native bundle');
    await expect(source.getNativeBundleExport()).rejects.toThrow('Package native bundle');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('refuses a cross-origin native file without fetching it', async () => {
    const fetch = await mockNativePackage(undefined, { nativePath: 'https://other.test/native.json' });
    await expect(new PinnedPackageDefinitionSource('/package.json').getNativeBundleExport()).rejects.toThrow('this app origin');
    expect(fetch.mock.calls.some(([url]) => url.origin === 'https://other.test')).toBe(false);
  });
  it('checks native bytes before parsing altered malformed JSON', async () => {
    await mockNativePackage(undefined, { nativeBytes: '{broken', expectedNativeBytes: '{}' });
    await expect(new PinnedPackageDefinitionSource('/package.json').getNativeBundleExport()).rejects.toThrow('Package hash mismatch: native.json');
  });
  it('refuses malformed native JSON whose bytes match the pin', async () => {
    await mockNativePackage(undefined, { nativeBytes: '{broken' });
    await expect(new PinnedPackageDefinitionSource('/package.json').getNativeBundleExport()).rejects.toThrow();
  });
});

function widgetBundle() {
  const bundle = nativeBundle();
  const registryUrl = 'https://example.test/registries/widgets';
  const module = { id: 'x-example', version: '1.0.0' };
  const entry = { version: '1.0.0', status: 'stable', description: 'Example contribution',
    compatibility: { formspecVersion: '>=1.0.0' } };
  bundle.documents[registryUrl] = {
    $formspecRegistry: '1.1', publisher: { name: 'Example', url: 'https://example.test' },
    published: '2026-01-01T00:00:00Z', entries: [
      { ...entry, name: module.id, category: 'module', contributes: ['x-example-widget'] },
      { ...entry, name: 'x-example-widget', category: 'widget', widgetShape: {
        props: { type: 'object', additionalProperties: false },
      } },
    ],
  };
  bundle.documents[surfaceUrl] = {
    $formspecSurface: '0.2', id: 'native', modules: [module], entry: 'start', routes: [
      { id: 'start', path: '/', slots: [{ id: 'widget', slotType: 'module-widget',
        binding: { moduleId: module.id, widgetName: 'x-example-widget', config: {} } }] },
    ],
  };
  return { ...bundle, manifest: { ...bundle.manifest, modules: [module],
    registries: [{ url: registryUrl }] } };
}

it('requires explicit host admission and support for a valid Registry-backed widget', async () => {
  const candidate = widgetBundle();
  await mockNativePackage(candidate);
  await expect(new PinnedPackageDefinitionSource('/package.json').getNativeBundleExport()).rejects.toThrow('widgets require explicit host');
  const admitted = new PinnedPackageDefinitionSource('/package.json', {
    moduleAdmission: { allowedModules: [{ id: 'x-example', version: '1.0.0' }] }, moduleSupport: {},
  });
  expect(await admitted.getNativeBundleExport()).toEqual(candidate);
  await expect(new PinnedPackageDefinitionSource('/package.json', {
    moduleAdmission: { allowedModules: [{ id: 'x-other', version: '1.0.0' }] }, moduleSupport: {},
  }).getNativeBundleExport()).rejects.toThrow('MODULE-ADMISSION-DENIED');
});


it('rejects a malformed native file descriptor rather than treating it as absent', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ files: {
    definition: { path: 'definition.json', sha256: 'unused' }, nativeBundle: null,
  } })));
  await expect(new PinnedPackageDefinitionSource('/package.json').getNativeBundleExport()).rejects.toThrow('native bundle file pin is malformed');
});


it('refuses duplicate sidecars that leave another native Locale without a matching sidecar', async () => {
  const bundle = nativeBundle();
  const otherUrl = 'https://example.test/locales/fr';
  bundle.manifest.locales.push({ url: otherUrl, version: '1.0.0', locale: 'fr' });
  bundle.documents[otherUrl] = { ...locale, url: otherUrl, locale: 'fr' };
  await mockNativePackage(bundle, { duplicateLocale: true });
  await expect(new PinnedPackageDefinitionSource('/package.json').getNativeBundleExport()).rejects.toThrow('Locales differ');
});
