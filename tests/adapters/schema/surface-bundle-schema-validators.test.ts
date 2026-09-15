import { describe, expect, it } from 'vitest';
import type {
  AppGraphSchemaValidator,
  SchemaValidationOutcome,
} from '@formspec-org/app-graph';
import {
  createSurfaceDataSourcePayloadValidator,
  loadSurfaceBundleSchemaValidators,
} from '../../../src/adapters/schema/index.ts';

const DEFINITION_URL = 'https://example.gov/forms/intake';

const validArtifacts = Object.freeze([
  {
    artifactKind: 'appManifest',
    schemaId: 'https://formspec.org/schemas/bundleManifest/2.4',
    document: {
      $formspecBundle: '2.4',
      version: '1.0.0',
      id: 'https://example.gov/apps/intake',
      definitions: [],
    },
  },
  {
    artifactKind: 'definition',
    schemaId: 'https://formspec.org/schemas/definition/1.0',
    document: {
      $formspec: '1.0',
      url: DEFINITION_URL,
      version: '1.0.0',
      status: 'draft',
      title: 'Intake',
      items: [],
    },
  },
  {
    artifactKind: 'experience',
    schemaId: 'https://formspec.org/schemas/experience/1.0',
    document: {
      $formspecExperience: '1.0',
      version: '1.0.0',
    },
  },
  {
    artifactKind: 'responseActions',
    schemaId: 'https://formspec.org/schemas/responseActions/1.0',
    document: {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_URL },
      actions: [{
        id: 'submit',
        intent: 'submit',
        label: { literal: 'Submit' },
        effects: [{ type: 'hostEvent', eventName: 'submitted' }],
      }],
    },
  },
  {
    artifactKind: 'component',
    schemaId: 'https://formspec.org/schemas/component/1.2',
    document: {
      $formspecComponent: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_URL },
      tree: { component: 'Stack', children: [] },
    },
  },
  {
    artifactKind: 'theme',
    schemaId: 'https://formspec.org/schemas/theme/1.0',
    document: {
      $formspecTheme: '1.0',
      version: '1.0.0',
    },
  },
  {
    artifactKind: 'references',
    schemaId: 'https://formspec.org/schemas/references/1.0',
    document: {
      $formspecReferences: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_URL },
      references: [],
    },
  },
  {
    artifactKind: 'ontology',
    schemaId: 'https://formspec.org/schemas/ontology/1.0',
    document: {
      $formspecOntology: '1.0',
      version: '1.0.0',
      targetDefinition: { url: DEFINITION_URL },
    },
  },
  {
    artifactKind: 'registry',
    schemaId: 'https://formspec.org/schemas/registry/v1.1/registry.json',
    document: {
      $formspecRegistry: '1.1',
      publisher: { name: 'Example agency' },
      published: '2026-07-28T00:00:00Z',
      entries: [],
    },
  },
  {
    artifactKind: 'surface',
    schemaId: 'https://formspec.org/schemas/surface/0.2',
    document: {
      $formspecSurface: '0.2',
      id: 'intake',
      entry: 'start',
      routes: [{
        id: 'start',
        path: '/',
        slots: [{
          id: 'content',
          slotType: 'static-content',
          binding: { kind: 'text', content: 'Start here.' },
        }],
      }],
    },
  },
  {
    artifactKind: 'screener',
    schemaId: 'https://formspec.org/schemas/screener/1.0',
    document: {
      $formspecScreener: '1.0',
      url: 'https://example.gov/screeners/intake',
      version: '1.0.0',
      title: 'Eligibility',
      items: [],
      evaluation: [],
    },
  },
  {
    artifactKind: 'dataSources',
    schemaId: 'https://formspec.org/schemas/dataSources/1.0',
    document: {
      $formspecDataSources: '1.0',
      version: '1.0.0',
      id: 'https://example.gov/apps/intake/data-sources',
      sources: [{
        id: 'host:receipt',
        kind: 'host-state',
        owner: 'host',
        scope: 'session',
        availability: { level: 'app' },
        runtime: {
          delivery: 'snapshot',
          cache: { mode: 'snapshot' },
          authorizationBoundary: 'host',
          failureMode: 'block-render',
          provenance: {
            kind: 'host-state',
            source: 'submission-confirmation',
          },
        },
        schema: {
          type: 'object',
          required: ['caseRef'],
          additionalProperties: false,
          properties: {
            caseRef: { type: 'string', minLength: 1 },
          },
        },
      }],
    },
  },
  {
    artifactKind: 'locale',
    schemaId: 'https://formspec.org/schemas/locale/2.0',
    document: {
      $formspecLocale: '2.0',
      version: '1.0.0',
      locale: 'en-US',
      target: {
        kind: 'app',
        url: 'https://example.gov/apps/intake',
      },
      strings: {},
    },
  },
  {
    artifactKind: 'mapping',
    schemaId: 'https://formspec.org/schemas/mapping/1.0',
    document: {
      $formspecMapping: '1.0',
      version: '1.0.0',
      definitionRef: DEFINITION_URL,
      definitionVersion: '1.0.0',
      targetSchema: { format: 'json' },
      rules: [{
        sourcePath: 'name',
        targetPath: 'name',
        transform: 'preserve',
      }],
    },
  },
] as const);

describe('loadSurfaceBundleSchemaValidators', () => {
  it('accepts a canonical valid document for every AppGraph artifact kind', async () => {
    const validate = await schemaValidator();

    for (const fixture of validArtifacts) {
      const outcome = validateArtifact(validate, fixture);
      expect(outcome.ok, fixture.artifactKind).toBe(true);
    }
  });

  it('routes every supported artifact kind to a real validator', async () => {
    const validate = await schemaValidator();

    for (const fixture of validArtifacts) {
      const outcome = validateArtifact(validate, {
        ...fixture,
        document: {},
      });
      expect(outcome.ok, fixture.artifactKind).toBe(false);
      expect(outcome.issues?.[0]?.code, fixture.artifactKind).toBe(
        'SURFACE-BUNDLE-SCHEMA-INVALID',
      );
    }
  });

  it('validates Data Sources 1.0 instead of treating it as an unknown document', async () => {
    const validate = await schemaValidator();
    const fixture = validArtifacts.find(
      (candidate) => candidate.artifactKind === 'dataSources',
    );
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const invalid = structuredClone(fixture.document) as unknown as {
      sources: Array<{
        runtime: {
          provenance: {
            kind: string;
          };
        };
      }>;
    };
    invalid.sources[0].runtime.provenance.kind = 'query-result';
    const outcome = validateArtifact(validate, {
      ...fixture,
      document: invalid,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SURFACE-BUNDLE-SCHEMA-INVALID',
        path: '/sources/0/runtime/provenance/kind',
      }),
    ]));
  });

  it('fails closed for unknown artifact kinds and unexpected schema ids', async () => {
    const validate = await schemaValidator();
    const unknown = validateArtifact(validate, {
      artifactKind: 'futureArtifact',
      document: {},
    });
    expect(unknown).toMatchObject({
      ok: false,
      issues: [{
        code: 'SURFACE-BUNDLE-SCHEMA-UNKNOWN-ARTIFACT',
      }],
    });

    const fixture = validArtifacts[0];
    const mismatched = validateArtifact(validate, {
      ...fixture,
      schemaId: 'https://formspec.org/schemas/bundleManifest/future',
    });
    expect(mismatched).toMatchObject({
      ok: false,
      issues: [{
        code: 'SURFACE-BUNDLE-SCHEMA-ID-MISMATCH',
      }],
    });
  });
});

describe('createSurfaceDataSourcePayloadValidator', () => {
  const receiptSchema = Object.freeze({
    type: 'object',
    required: ['caseRef'],
    additionalProperties: false,
    properties: {
      caseRef: { type: 'string', minLength: 1 },
      submittedAt: { type: 'string', format: 'date-time' },
    },
  });

  it('validates a loaded receipt against the source-declared schema', async () => {
    const validate = createSurfaceDataSourcePayloadValidator();

    expect(await validate(payloadRequest(receiptSchema, {
      caseRef: 'CASE-2026-0042',
      submittedAt: '2026-07-28T18:30:00Z',
    }))).toEqual({ valid: true });
  });

  it('fails closed for an invalid receipt payload', async () => {
    const validate = createSurfaceDataSourcePayloadValidator();

    expect(await validate(payloadRequest(receiptSchema, {
      submittedAt: 'not-a-time',
    }))).toEqual({
      valid: false,
      reason: 'The data source payload does not match its declared schema.',
    });
  });

  it('refuses missing, invalid, unknown, and remote payload schemas', async () => {
    const validate = createSurfaceDataSourcePayloadValidator();

    expect(await validate(payloadRequest(undefined, {}))).toMatchObject({
      valid: false,
    });
    expect(await validate(payloadRequest({
      type: 'object',
      properties: {
        caseRef: { minLenght: 1 },
      },
    }, {}))).toMatchObject({
      valid: false,
    });
    expect(await validate(payloadRequest({
      $ref: 'https://schemas.example/receipt.json',
    }, {}))).toEqual({
      valid: false,
      reason: 'The data source payload schema uses an unsupported remote reference.',
    });
  });

  it('admits local schema references and reuses a successfully compiled schema', async () => {
    const validate = createSurfaceDataSourcePayloadValidator();
    const schema = {
      $defs: {
        receipt: {
          type: 'object',
          required: ['caseRef'],
          properties: {
            caseRef: { type: 'string' },
          },
        },
      },
      $ref: '#/$defs/receipt',
    };

    expect(await validate(payloadRequest(schema, { caseRef: 'A-1' }))).toEqual({
      valid: true,
    });
    expect(await validate(payloadRequest(schema, {}))).toMatchObject({
      valid: false,
    });
  });
});

async function schemaValidator(): Promise<AppGraphSchemaValidator> {
  const validators = await loadSurfaceBundleSchemaValidators();
  if (typeof validators !== 'function') {
    throw new Error('Surface bundle schema adapter must return one closed validator.');
  }
  return validators;
}

function validateArtifact(
  validate: AppGraphSchemaValidator,
  fixture: {
    readonly artifactKind: string;
    readonly schemaId?: string;
    readonly document: unknown;
  },
): SchemaValidationOutcome {
  return validate({
    handle: {
      slot: fixture.artifactKind,
      artifactKind: fixture.artifactKind,
      status: 'loaded',
      document: fixture.document,
      ...(fixture.schemaId ? { schemaId: fixture.schemaId } : {}),
    },
    artifactKind: fixture.artifactKind,
    document: fixture.document,
    ...(fixture.schemaId ? { schemaId: fixture.schemaId } : {}),
  });
}

function payloadRequest(schema: unknown, value: unknown) {
  return {
    descriptor: {
      catalogRef: 'https://example.gov/apps/intake/data-sources',
      sourceRef: 'host:receipt',
      catalog: {} as never,
      source: {} as never,
    },
    context: {
      surfaceId: 'intake',
      routeId: 'receipt',
      slotId: 'receipt',
      moduleId: 'x-formspec-starter',
      widgetName: 'x-receipt-panel',
      params: { caseRef: 'CASE-2026-0042' },
    },
    schema: schema as object,
    value,
  };
}
