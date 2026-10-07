import { STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA } from '@formspec-org/surface-react';
import { loadCanonicalModulePayloadSchemaResources } from '../../../src/adapters/schema/index.ts';
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
  nativePath?: string; nativeBytes?: string; expectedNativeBytes?: string; duplicateLocale?: boolean; component?: unknown; componentRef?: unknown; componentPath?: string;
  componentBytes?: string; expectedComponentBytes?: string; omitNative?: boolean; definition?: typeof nativeDefinition; localeDocument?: typeof locale;
} = {}) {
  vi.stubGlobal('crypto', webcrypto);
  const texts = {
    'definition.json': JSON.stringify(options.definition ?? nativeDefinition),
    'locale.json': JSON.stringify(options.localeDocument ?? locale),
    'native.json': options.nativeBytes ?? JSON.stringify(candidate),
    'component.json': options.componentBytes ?? JSON.stringify(options.component),
  };
  const pin = async (path: string, bytes: string) => ({ path, sha256: [...new Uint8Array(
    await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes)),
  )].map(value => value.toString(16).padStart(2, '0')).join('') });
  const files = {
    definition: await pin('definition.json', texts['definition.json']),
    locales: await Promise.all((options.duplicateLocale ? [1, 2] : [1]).map(() => pin('locale.json', texts['locale.json']))),
    ...(!options.omitNative ? { nativeBundle: await pin(options.nativePath ?? 'native.json', options.expectedNativeBytes ?? texts['native.json']) } : {}),
    ...(options.component !== undefined ? { component: {
      ...await pin(options.componentPath ?? 'component.json', options.expectedComponentBytes ?? texts['component.json']),
      ref: options.componentRef,
    } } : {}),
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

const componentRef = { handle: 'intake', url: 'urn:formspec:test:component:intake', version: '0.1.5' };
function componentDocument() {
  return { $formspecComponent: '1.2', url: componentRef.url, version: componentRef.version,
    targetDefinition: { url: nativeDefinition.url, compatibleVersions: nativeDefinition.version },
    tree: { component: 'Stack', children: [{ component: 'Text', text: 'Authored intake' }] } };
}
function componentBundle() {
  const bundle = nativeBundle();
  return { ...bundle, manifest: { ...bundle.manifest, components: [{ ...componentRef }] } };
}

describe('external hash-pinned Component closure', () => {
  it('qualifies one declared Component and preserves the original export with independent cached clones', async () => {
    const component = componentDocument();
    const candidate = componentBundle();
    const fetch = await mockNativePackage(candidate, { component, componentRef });
    const source = new PinnedPackageDefinitionSource('/package.json');
    const loaded = await source.getComponentDocument();
    expect(loaded).toEqual(component);
    expect(await source.getNativeBundleExport()).toEqual(candidate);
    expect(Object.hasOwn((await source.getNativeBundleExport())!.documents, componentRef.url)).toBe(false);
    loaded!.tree = { component: 'Text', text: 'Changed' };
    expect(await source.getComponentDocument()).toEqual(component);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch.mock.calls.every(([, init]) => init?.redirect === 'error')).toBe(true);
  });

  it.each([
    ['missing explicit reference', () => ({ componentRef: undefined })],
    ['wrong handle alias', () => ({ componentRef: { ...componentRef, handle: 'alias' } })],
    ['wrong document URL', () => ({ component: { ...componentDocument(), url: 'urn:other' } })],
    ['wrong document version', () => ({ component: { ...componentDocument(), version: '0.1.6' } })],
    ['wrong Definition target', () => ({ component: { ...componentDocument(), targetDefinition: { url: 'urn:other' } } })],
    ['incompatible Definition version', () => ({ component: { ...componentDocument(), targetDefinition: { url: nativeDefinition.url, compatibleVersions: '99.0.0' } } })],
    ['malformed target', () => ({ component: { ...componentDocument(), targetDefinition: 'wrong' } })],
    ['non-string compatible versions', () => ({ component: { ...componentDocument(), targetDefinition: { url: nativeDefinition.url, compatibleVersions: 42 } } })],
    ['null compatible versions', () => ({ component: { ...componentDocument(), targetDefinition: { url: nativeDefinition.url, compatibleVersions: null } } })],
    ['schema-invalid tree', () => ({ component: { ...componentDocument(), tree: { component: 'Stack', children: 'invalid' } } })],
    ['Component without native bundle', () => ({ omitNative: true })],
  ])('refuses %s before exposing any packaged resource', async (_name, overrides) => {
    await mockNativePackage(componentBundle(), { component: componentDocument(), componentRef, ...overrides() });
    const source = new PinnedPackageDefinitionSource('/package.json');
    await expect(source.getComponentDocument()).rejects.toThrow();
    await expect(source.getDefinition()).rejects.toThrow();
  });

  it.each([
    ['unused external Component', () => nativeBundle()],
    ['multiple Component references', () => {
      const bundle = componentBundle();
      bundle.manifest.components.push({ ...componentRef, handle: 'second', url: 'urn:second' });
      return bundle;
    }],
    ['inline and external collision', () => {
      const bundle = componentBundle(); bundle.documents[componentRef.url] = componentDocument(); return bundle;
    }],
    ['unlisted inline resource', () => {
      const bundle = componentBundle(); bundle.documents['urn:unknown'] = {}; return bundle;
    }],
  ])('refuses %s through the closed graph loader', async (_name, build) => {
    const fetch = await mockNativePackage(build(), { component: componentDocument(), componentRef });
    await expect(new PinnedPackageDefinitionSource('/package.json').getComponentDocument()).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('refuses cross-origin Component bytes before fetching them', async () => {
    const fetch = await mockNativePackage(componentBundle(), { component: componentDocument(), componentRef,
      componentPath: 'https://other.test/component.json' });
    await expect(new PinnedPackageDefinitionSource('/package.json').getComponentDocument()).rejects.toThrow('this app origin');
    expect(fetch.mock.calls.some(([url]) => url.origin === 'https://other.test')).toBe(false);
  });

  it('checks Component bytes before parsing and refuses matching malformed JSON', async () => {
    await mockNativePackage(componentBundle(), { component: componentDocument(), componentRef,
      componentBytes: '{broken', expectedComponentBytes: '{}' });
    await expect(new PinnedPackageDefinitionSource('/package.json').getComponentDocument()).rejects.toThrow('hash mismatch: component.json');
    await mockNativePackage(componentBundle(), { component: componentDocument(), componentRef, componentBytes: '{broken' });
    await expect(new PinnedPackageDefinitionSource('/package.json').getComponentDocument()).rejects.toThrow();
  });

  it('keeps packages without a Component usable', async () => {
    await mockNativePackage();
    expect(await new PinnedPackageDefinitionSource('/package.json').getComponentDocument()).toBeNull();
  });
});

// Exact reviewed Studio 0.1.5-r3 Component bytes; portable fixture for the generic loader.
const studioComponentBytes = `{
  "$formspecComponent": "1.2",
  "version": "0.1.5",
  "targetDefinition": {
    "url": "urn:formspec:demo:d1:passport-renewal",
    "compatibleVersions": "0.1.5"
  },
  "url": "urn:formspec:demo:d1:signing-app:component:intake",
  "tree": {
    "component": "Stack",
    "x-generation": {
      "anchors": [
        "need:review-and-sign-demo-response@2"
      ]
    },
    "children": [
      {
        "component": "Text",
        "x-generation": {
          "anchors": [
            "need:recognize-demo-sample-limits@2"
          ]
        },
        "text": "Demo application with fictional details. This sample is not an official DS-82 form.",
        "bind": "demoNotice"
      },
      {
        "component": "Toggle",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "renewalEligible"
      },
      {
        "component": "Text",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "text": "Confirm your renewal details",
        "bind": "detailsHeading"
      },
      {
        "component": "TextInput",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "fullName"
      },
      {
        "component": "DatePicker",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "dateOfBirth"
      },
      {
        "component": "TextInput",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "placeOfBirth"
      },
      {
        "component": "TextInput",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "email"
      },
      {
        "component": "TextInput",
        "maxLines": 4,
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "mailingAddress"
      },
      {
        "component": "TextInput",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "priorPassportNumber"
      },
      {
        "component": "DatePicker",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "priorPassportIssueDate"
      },
      {
        "component": "Toggle",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "ssnIssued"
      },
      {
        "component": "TextInput",
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "socialSecurityNumber"
      },
      {
        "component": "TextInput",
        "maxLines": 4,
        "x-generation": {
          "anchors": [
            "need:complete-demo-renewal-response@2"
          ]
        },
        "bind": "neverIssuedStatement"
      },
      {
        "component": "FileUpload",
        "x-generation": {
          "anchors": [
            "need:attach-demo-renewal-photo@1"
          ]
        },
        "bind": "photo"
      },
      {
        "component": "Text",
        "x-generation": {
          "anchors": [
            "need:understand-demo-privacy@2"
          ]
        },
        "text": "Sample privacy notice: submitted answers and photo are visible to authorized demo reviewers. Official legal authority and permitted-sharing wording remain unqualified. Do not enter real personal data.",
        "bind": "privacyNotice"
      },
      {
        "component": "Text",
        "x-generation": {
          "anchors": [
            "need:review-demo-paper-option@1"
          ]
        },
        "text": "Also available by mail (DS-82) or in person (DS-11).",
        "bind": "paperAlternative"
      },
      {
        "component": "Text",
        "x-generation": {
          "anchors": [
            "need:review-and-sign-demo-response@2"
          ]
        },
        "text": "I declare that my answers are true and complete to the best of my knowledge. Acknowledging this declaration does not sign the application.",
        "bind": "declaration"
      },
      {
        "component": "Toggle",
        "x-generation": {
          "anchors": [
            "need:review-and-sign-demo-response@2"
          ]
        },
        "bind": "declarationAcknowledged"
      }
    ]
  }
}
`;

it('admits the exact reviewed Studio r3 Component through its explicit native reference', async () => {
  const component = JSON.parse(studioComponentBytes);
  const digest = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(studioComponentBytes)))].map(value => value.toString(16).padStart(2, '0')).join('');
  expect(digest).toBe('528495ed80d612b9b352cd73beaa18ccd95b6f41dbb3249ecb321bd8a88694a9');
  const definition = { ...nativeDefinition, url: component.targetDefinition.url, version: component.targetDefinition.compatibleVersions };
  const localeDocument = { ...locale, target: { kind: 'definition', url: definition.url } };
  const candidate = nativeBundle();
  candidate.manifest.definitions = [{ url: definition.url, version: definition.version }];
  candidate.documents[definition.url] = definition;
  delete candidate.documents[nativeDefinition.url];
  candidate.documents[localeUrl] = localeDocument;
  candidate.documents[surfaceUrl] = { $formspecSurface: '0.2', id: 'native', entry: 'start', routes: [
    { id: 'start', path: '/', slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: definition.url } }] },
  ] };
  const ref = { handle: 'intake', url: component.url, version: component.version };
  const bundle = { ...candidate, manifest: { ...candidate.manifest, components: [ref] } };
  await mockNativePackage(bundle, { component, componentRef: ref, componentBytes: studioComponentBytes, definition, localeDocument });
  const source = new PinnedPackageDefinitionSource('/package.json');
  expect(await source.getComponentDocument()).toEqual(component);
  expect(await source.getNativeBundleExport()).toEqual(bundle);
});

function structuredEvidenceBundle(failure?: 'path' | 'generation' | 'reference') {
  const bundle = widgetBundle();
  const registry = bundle.documents['https://example.test/registries/widgets'] as { entries: { widgetShape?: { props: unknown } }[] };
  registry.entries[1].widgetShape!.props = failure === 'reference'
    ? { $ref: 'https://unknown.example/schema' }
    : { type: 'object', required: ['blocks'], properties: { blocks: { type: 'array', items: STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA } } };
  const surface = bundle.documents[surfaceUrl] as { routes: { slots: { binding: { config: unknown } }[] }[] };
  surface.routes[0].slots[0].binding.config = { blocks: [{ type: 'json', id: 'evidence', emptyMessage: 'No evidence', unavailableMessage: 'Unavailable evidence', path: failure === 'path' ? 'bad..path' : 'evidence',
    'x-generation': { anchors: failure === 'generation' ? [42] : ['need:inspect-evidence@1'] } }] };
  return bundle;
}

describe('automatic Surface props validation with pinned canonical resources', () => {
  it('admits exact published JSON props through hash-pinned fetch and graph extraction', async () => {
    const candidate = structuredEvidenceBundle();
    const fetch = await mockNativePackage(candidate);
    const source = new PinnedPackageDefinitionSource('/package.json', {
      moduleAdmission: { allowedModules: [{ id: 'x-example', version: '1.0.0' }] },
      moduleSupport: { payloadSchemaResources: await loadCanonicalModulePayloadSchemaResources() },
    });
    expect(await source.getNativeBundleExport()).toEqual(candidate);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each(['path', 'generation', 'reference', 'absent'] as const)('refuses %s before exposing pinned resources', async failure => {
    await mockNativePackage(structuredEvidenceBundle(failure === 'absent' ? undefined : failure));
    const source = new PinnedPackageDefinitionSource('/package.json', {
      moduleAdmission: { allowedModules: [{ id: 'x-example', version: '1.0.0' }] },
      moduleSupport: failure === 'absent' ? {} : { payloadSchemaResources: await loadCanonicalModulePayloadSchemaResources() },
    });
    await expect(source.getDefinition()).rejects.toThrow('MODULE-PAYLOAD-SCHEMA-MISMATCH');
    await expect(source.getNativeBundleExport()).rejects.toThrow('MODULE-PAYLOAD-SCHEMA-MISMATCH');
  });
});


describe('actual pinned package resource identity and isolation', () => {
  it.each(['duplicate', 'mismatched-id'] as const)('refuses %s canonical resource identity before exposing a Definition', async failure => {
    const canonical = await loadCanonicalModulePayloadSchemaResources();
    const resources = failure === 'duplicate' ? [...canonical, canonical[0]]
      : [{ ...canonical[0], uri: 'https://wrong.example/common' }];
    await mockNativePackage(structuredEvidenceBundle());
    const source = new PinnedPackageDefinitionSource('/package.json', {
      moduleAdmission: { allowedModules: [{ id: 'x-example', version: '1.0.0' }] },
      moduleSupport: { payloadSchemaResources: resources },
    });
    await expect(source.getDefinition()).rejects.toThrow('MODULE-PAYLOAD-SCHEMA-MISMATCH');
    await expect(source.getNativeBundleExport()).rejects.toThrow('MODULE-PAYLOAD-SCHEMA-MISMATCH');
  });

  it('isolates a mutated caller copy and a refused graph from the next canonical admission and cached export', async () => {
    const canonical = await loadCanonicalModulePayloadSchemaResources();
    const callerCopy = structuredClone(canonical);
    await mockNativePackage(structuredEvidenceBundle());
    const options = { moduleAdmission: { allowedModules: [{ id: 'x-example', version: '1.0.0' }] },
      moduleSupport: { payloadSchemaResources: callerCopy } };
    const source = new PinnedPackageDefinitionSource('/package.json', options);
    const admitted = await source.getNativeBundleExport();
    callerCopy[0].uri = 'https://wrong.example/common';
    expect(await source.getNativeBundleExport()).toEqual(admitted);
    await expect(new PinnedPackageDefinitionSource('/package.json', options).getDefinition()).rejects.toThrow('MODULE-PAYLOAD-SCHEMA-MISMATCH');
    expect(await new PinnedPackageDefinitionSource('/package.json', {
      moduleAdmission: options.moduleAdmission,
      moduleSupport: { payloadSchemaResources: await loadCanonicalModulePayloadSchemaResources() },
    }).getNativeBundleExport()).toEqual(admitted);
    expect(canonical[0].uri).toBe('https://formspec.org/schemas/common/1.0');
  });
});
