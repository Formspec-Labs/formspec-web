import { describe, expect, it } from 'vitest';
import { HttpDefinitionSource } from '../../../src/adapters/http/definition-source.ts';
import { sampleFormDefinition } from '../../../src/adapter-conformance/fixtures.ts';
import type {
  ComponentDocument,
  ComponentGraphProjectionContext,
  LayoutHostEvidence,
  LocaleDocument,
} from '../../../src/ports/index.ts';
import { jsonResponse, problemResponse, recordingFetch } from './test-fetch.ts';

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

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

  it('extracts Component sidecars from the shared runtime payload without widening getDefinition', async () => {
    const componentDocument = componentDocumentForRuntime();
    const componentGraph: ComponentGraphProjectionContext = {
      component: {
        handle: 'respondent',
        url: componentDocument.url,
        version: componentDocument.version,
      },
      surface: {
        url: 'https://surfaces.example.test/intake',
        version: '1.0.0',
      },
      route: 'apply',
    };
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        component_document: componentDocument,
        runtime_config: {
          component_graph: componentGraph,
        },
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition(sampleFormDefinition.url)).resolves.toEqual(
      sampleFormDefinition,
    );
    await expect(adapter.getComponentDocument(sampleFormDefinition.url)).resolves.toEqual(
      componentDocument,
    );
    await expect(adapter.getComponentGraphContext(sampleFormDefinition.url)).resolves.toEqual(
      componentGraph,
    );
    expect(requests).toHaveLength(1);
  });

  it('extracts LayoutHostEvidence from the shared runtime payload without widening getDefinition', async () => {
    const hostEvidence = uiGraphPolicyHostEvidence();
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        runtime_config: {
          hostEvidence,
        },
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getDefinition(sampleFormDefinition.url)).resolves.toEqual(
      sampleFormDefinition,
    );
    await expect(adapter.getLayoutHostEvidence(sampleFormDefinition.url)).resolves.toEqual(
      hostEvidence,
    );
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

function componentDocumentForRuntime(): ComponentDocument {
  return {
    $formspecComponent: '1.2',
    url: 'https://components.example.test/respondent',
    version: '1.0.0',
    targetSurfaceRoutes: [
      {
        surface: {
          url: 'https://surfaces.example.test/intake',
          version: '1.0.0',
        },
        route: 'apply',
      },
    ],
    tree: {
      component: 'Stack',
      id: 'root-stack',
      children: [
        {
          component: 'TextInput',
          bind: 'sample',
          id: 'sample-node',
        },
      ],
    },
  } as unknown as ComponentDocument;
}

function uiGraphPolicyHostEvidence(): LayoutHostEvidence {
  return {
    appGraphReport: {
      ok: true,
      summary: {
        artifacts: 0,
        loadedArtifacts: 0,
        schemaFailures: 0,
        unvalidatedArtifacts: 0,
        graphErrors: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        importedDiagnostics: 0,
        unsupportedFeatures: 0,
        skippedPhases: 0,
      },
      schemaResults: [],
      evidenceResults: [{
        evidenceSlot: 'hostEvidence.uiGraphPolicies[0]',
        schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
        source: 'host://policy/respondent-ui-policy',
        status: 'completed',
        ok: true,
        diagnostics: [],
      }],
      diagnostics: [],
      phases: [
        { phase: 'schema', status: 'completed' },
        { phase: 'cross-artifact', status: 'completed' },
      ],
    },
    uiGraphPolicies: [{
      schemaId: UI_GRAPH_POLICY_SCHEMA_ID,
      source: 'host://policy/respondent-ui-policy',
      document: {
        $formspecUiGraphPolicy: '0.1',
        version: '1.0.0',
        targetSurface: {
          url: 'https://surfaces.example.test/intake',
          version: '1.0.0',
        },
        routePolicies: [{
          routeId: 'apply',
          a11y: {
            landmark: 'main',
            keyboardNavigation: true,
          },
          responsive: {
            minColumns: 1,
            collapseOrder: ['summary', 'details'],
          },
        }],
      },
    }],
  };
}
