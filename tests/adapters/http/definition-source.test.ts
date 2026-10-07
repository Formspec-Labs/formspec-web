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
const COMPONENT_GRAPH_CONTEXT_SCHEMA_ID = 'https://formspec.org/schemas/componentGraphProjectionContext/0.1';

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
        component_graph: componentGraph,
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
        host_evidence: hostEvidence,
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

  it('preserves direct Component graph context host evidence from runtime payloads', async () => {
    const componentGraph = componentGraphContextForRuntime();
    const hostEvidence = componentGraphHostEvidence(componentGraph);
    const { fetch, requests } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        componentGraph,
        hostEvidence,
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getLayoutHostEvidence(sampleFormDefinition.url)).resolves.toEqual(
      hostEvidence,
    );
    expect(requests).toHaveLength(1);
  });

  it('assembles Component graph context host evidence from split sidecar fields', async () => {
    const componentGraph = componentGraphContextForRuntime();
    const hostEvidence = componentGraphHostEvidence(componentGraph);
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        app_graph_validation_report: hostEvidence.appGraphReport,
        component_graph_contexts: hostEvidence.componentGraphContexts,
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getLayoutHostEvidence(sampleFormDefinition.url)).resolves.toEqual(
      hostEvidence,
    );
  });

  it('rejects malformed Component graph context evidence lists without reindexing slots', async () => {
    const componentGraph = componentGraphContextForRuntime();
    const hostEvidence = componentGraphHostEvidence(componentGraph);
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        app_graph_validation_report: hostEvidence.appGraphReport,
        component_graph_contexts: [
          { schemaId: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID, source: 'host://component-graph/bad' },
          hostEvidence.componentGraphContexts?.[0],
        ],
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getLayoutHostEvidence(sampleFormDefinition.url)).resolves.toEqual({
      appGraphReport: hostEvidence.appGraphReport,
    });
  });

  it('ignores stale graph proof hidden inside runtime_config', async () => {
    const componentGraph = componentGraphContextForRuntime();
    const hostEvidence = componentGraphHostEvidence(componentGraph);
    const { fetch } = recordingFetch(() =>
      jsonResponse({
        definition: sampleFormDefinition,
        runtime_config: {
          component_graph: componentGraph,
          componentGraph,
          host_evidence: hostEvidence,
          hostEvidence,
          app_graph_validation_report: hostEvidence.appGraphReport,
          appGraphValidationReport: hostEvidence.appGraphReport,
          component_graph_contexts: hostEvidence.componentGraphContexts,
          componentGraphContexts: hostEvidence.componentGraphContexts,
        },
        runtimeConfig: {
          component_graph: componentGraph,
          host_evidence: hostEvidence,
          app_graph_validation_report: hostEvidence.appGraphReport,
          component_graph_contexts: hostEvidence.componentGraphContexts,
        },
      }),
    );
    const adapter = new HttpDefinitionSource({
      baseUrl: 'https://formspec-server.example.test',
      fetchImpl: fetch,
    });

    await expect(adapter.getComponentGraphContext(sampleFormDefinition.url)).resolves.toBeNull();
    await expect(adapter.getLayoutHostEvidence(sampleFormDefinition.url)).resolves.toBeNull();
  });
});

function localeDocumentFor(
  definitionUrl: string,
  locale: string,
  strings: Record<string, string>,
): LocaleDocument {
  return {
    $formspecLocale: '2.0',
    url: `https://formspec-server.example.test/runtime/locales/${locale}`,
    version: '1.0.0',
    locale,
    target: { kind: 'definition', url: definitionUrl },
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

function componentGraphContextForRuntime(): ComponentGraphProjectionContext {
  return {
    component: {
      handle: 'respondent',
      url: 'https://components.example.test/respondent',
      version: '1.0.0',
    },
    surface: {
      url: 'https://surfaces.example.test/intake',
      version: '1.0.0',
    },
    route: 'apply',
  };
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

function componentGraphHostEvidence(
  componentGraph: ComponentGraphProjectionContext,
): LayoutHostEvidence {
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
        evidenceSlot: 'hostEvidence.componentGraphContexts[0]',
        schemaId: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
        source: 'host://component-graph/respondent',
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
    componentGraphContexts: [{
      schemaId: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
      source: 'host://component-graph/respondent',
      document: componentGraph,
    }],
  };
}

async function publishedRuntime() {
  const { computeJcsSha256Digest } = await import('../../../src/adapters/http/response-action-ledger.ts');
  return {
    form_id: 'conformance', form_version_id: 'publication-version-1',
    definition_url: sampleFormDefinition.url, definition_version: sampleFormDefinition.version,
    definition_hash: await computeJcsSha256Digest(sampleFormDefinition),
    definition: structuredClone(sampleFormDefinition),
  };
}

describe('HttpDefinitionSource published Definition identity', () => {
  it('qualifies root publication metadata through the same cached scoped GET and returns defensive copies', async () => {
    const payload = await publishedRuntime();
    const { fetch, requests } = recordingFetch(() => jsonResponse(payload));
    const source = new HttpDefinitionSource({ baseUrl: 'https://server.example.test', fetchImpl: fetch,
      tenantBinding: { kind: 'bound', scope: { tenant: 'test-tenant', workspace: 'test-workspace', environment: 'test-environment', cell: 'test-cell' } } });
    const [definition, published] = await Promise.all([
      source.getDefinition(sampleFormDefinition.url),
      source.getPublishedDefinition(sampleFormDefinition.url, sampleFormDefinition),
    ]);
    expect(definition).toEqual(sampleFormDefinition);
    expect(published).toEqual(payload);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].headers.get('authorization')).toBeNull();
    expect(requests[0].headers.get('x-formspec-tenant-id')).toBe('test-tenant');
    expect(requests[0].headers.get('x-formspec-workspace-id')).toBe('test-workspace');
    expect(requests[0].headers.get('x-formspec-environment-id')).toBe('test-environment');
    expect(requests[0].headers.get('x-formspec-cell-id')).toBe('test-cell');
    published.definition.items[0].label = 'Changed by caller';
    expect(await source.getPublishedDefinition(sampleFormDefinition.url, sampleFormDefinition)).toEqual(payload);
    expect(requests).toHaveLength(1);
  });

  it.each([
    ['missing form id', (p: Record<string, unknown>) => { delete p.form_id; }],
    ['blank version id', (p: Record<string, unknown>) => { p.form_version_id = '  '; }],
    ['wrong form id', (p: Record<string, unknown>) => { p.form_id = 'wrong'; }],
    ['missing definition URL', (p: Record<string, unknown>) => { delete p.definition_url; }],
    ['wrong definition URL', (p: Record<string, unknown>) => { p.definition_url = 'https://other.test/form'; }],
    ['wrong definition version', (p: Record<string, unknown>) => { p.definition_version = '2.0.0'; }],
    ['missing definition hash', (p: Record<string, unknown>) => { delete p.definition_hash; }],
    ['wrong hash', (p: Record<string, unknown>) => { p.definition_hash = `sha256:${'0'.repeat(64)}`; }],
    ['uppercase hash', (p: Record<string, unknown>) => { p.definition_hash = String(p.definition_hash).toUpperCase(); }],
    ['changed Definition content', (p: Record<string, unknown>) => {
      p.definition = { ...sampleFormDefinition, items: [{ ...sampleFormDefinition.items[0], label: 'Changed' }] };
    }],
  ])('refuses %s', async (_name, mutate) => {
    const payload = await publishedRuntime(); mutate(payload);
    const { fetch } = recordingFetch(() => jsonResponse(payload));
    const source = new HttpDefinitionSource({ baseUrl: 'https://server.example.test', fetchImpl: fetch });
    await expect(source.getPublishedDefinition(sampleFormDefinition.url, sampleFormDefinition)).rejects.toThrow('HTTP published Definition');
  });

  it('uses the configured resolver rather than deriving an id from the Definition URL', async () => {
    const payload = { ...await publishedRuntime(), form_id: 'actual-server-form' };
    const { fetch, requests } = recordingFetch(() => jsonResponse(payload));
    const source = new HttpDefinitionSource({ baseUrl: 'https://server.example.test', fetchImpl: fetch,
      formIdResolver: () => 'actual-server-form' });
    expect((await source.getPublishedDefinition('https://local.test/alias', sampleFormDefinition)).form_id).toBe('actual-server-form');
    expect(requests[0].url).toBe('https://server.example.test/runtime/forms/actual-server-form');
  });

  it('refuses raw Definition fallback and metadata hidden below the root', async () => {
    const payload = await publishedRuntime();
    for (const candidate of [sampleFormDefinition, { definition: sampleFormDefinition, runtime_config: payload }]) {
      const { fetch } = recordingFetch(() => jsonResponse(candidate));
      const source = new HttpDefinitionSource({ baseUrl: 'https://server.example.test', fetchImpl: fetch });
      await expect(source.getPublishedDefinition(sampleFormDefinition.url, sampleFormDefinition)).rejects.toThrow('metadata');
    }
  });

  it('refuses changed content even when the server hash matches the changed Definition', async () => {
    const payload = await publishedRuntime();
    payload.definition.title = 'Changed publication';
    const { computeJcsSha256Digest } = await import('../../../src/adapters/http/response-action-ledger.ts');
    payload.definition_hash = await computeJcsSha256Digest(payload.definition);
    const { fetch } = recordingFetch(() => jsonResponse(payload));
    await expect(new HttpDefinitionSource({ baseUrl: 'https://server.example.test', fetchImpl: fetch })
      .getPublishedDefinition(sampleFormDefinition.url, sampleFormDefinition)).rejects.toThrow('content');
  });
});


it('compares publication content as JCS rather than object insertion order', async () => {
  const payload = await publishedRuntime();
  payload.definition = Object.fromEntries(Object.entries(payload.definition).reverse()) as typeof payload.definition;
  const { fetch } = recordingFetch(() => jsonResponse(payload));
  const source = new HttpDefinitionSource({ baseUrl: 'https://server.example.test', fetchImpl: fetch });
  expect(await source.getPublishedDefinition(sampleFormDefinition.url, sampleFormDefinition)).toEqual(payload);
});
