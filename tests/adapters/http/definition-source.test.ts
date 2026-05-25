import { describe, expect, it } from 'vitest';
import { HttpDefinitionSource } from '../../../src/adapters/http/definition-source.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';
import type { LocaleDocument } from '../../../src/ports/index.ts';
import { jsonResponse, problemResponse, recordingFetch } from './test-fetch.ts';

describe('HttpDefinitionSource', () => {
  it('mirrors formspec-server GET /runtime/forms/{form_id}', async () => {
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({ definition: sampleFormDefinition }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition(sampleFormDefinition.url)).resolves.toEqual(
      sampleFormDefinition,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      'https://formspec-server.example.test/runtime/forms/conformance',
    );
  });

  it('rejects missing runtime definitions', async () => {
    const { fetch } = recordingFetch(() => problemResponse(404, 'not_found'));
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition('https://formspec.example.test/forms/missing')).rejects
      .toThrow();
  });

  it('extracts server-supplied Locale Documents from published runtime payloads', async () => {
    const localeDocument = localeDocumentFor(sampleFormDefinition.url, 'es', {
      '$form.title': 'Titulo desde el servidor',
    });
    const unrelatedLocaleDocument = localeDocumentFor('https://other.example.test/forms/other', 'es', {
      '$form.title': 'Wrong target',
    });
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        locales: {
          es: localeDocument,
          unrelated: unrelatedLocaleDocument,
        },
        locale_refs: ['en', 'es'],
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition(sampleFormDefinition.url)).resolves.toEqual(
      sampleFormDefinition,
    );
    await expect(adapter.getLocaleDocuments(sampleFormDefinition.url)).resolves.toEqual([
      localeDocument,
    ]);
    expect(requests).toHaveLength(1);
  });

  it('accepts locale_documents / localeDocuments arrays and ignores legacy locale_refs', async () => {
    const snakeCaseLocale = localeDocumentFor(sampleFormDefinition.url, 'es', {
      '$form.title': 'Titulo desde locale_documents',
    });
    const camelCaseLocale = localeDocumentFor(sampleFormDefinition.url, 'fr', {
      '$form.title': 'Titre depuis localeDocuments',
    });
    const legacyRefDocument = localeDocumentFor(sampleFormDefinition.url, 'de', {
      '$form.title': 'Title from a legacy ref field',
    });
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        locale_documents: [snakeCaseLocale],
        localeDocuments: [camelCaseLocale],
        locale_refs: ['en', 'es', 'fr', legacyRefDocument],
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getLocaleDocuments(sampleFormDefinition.url)).resolves.toEqual([
      snakeCaseLocale,
      camelCaseLocale,
    ]);
  });

  it('reuses the original runtime payload when Locale Documents are requested with the same source URL', async () => {
    const localeDocument = localeDocumentFor(sampleFormDefinition.url, 'es', {
      '$form.title': 'Titulo desde el servidor',
    });
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        locales: { es: localeDocument },
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition(sampleFormDefinition.url)).resolves.toEqual(
      sampleFormDefinition,
    );
    await expect(adapter.getLocaleDocuments(sampleFormDefinition.url)).resolves.toEqual([
      localeDocument,
    ]);
    expect(requests).toHaveLength(1);
  });
});

function localeDocumentFor(
  definitionUrl: string,
  locale: string,
  strings: Record<string, string>,
): LocaleDocument {
  return {
    $formspecLocale: '1.0',
    url: `https://formspec-server.example.test/runtime/locales/${locale}`,
    version: '1.0.0',
    locale,
    targetDefinition: { url: definitionUrl },
    strings,
  };
}
