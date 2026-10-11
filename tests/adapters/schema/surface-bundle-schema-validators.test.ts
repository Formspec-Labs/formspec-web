import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { loadCanonicalModulePayloadSchemaResources } from 'formspec-web/adapters/schema';
import { sampleFormResponse } from '../../../src/adapter-conformance/fixtures.ts';
import type {
  AppGraphSchemaValidator,
  SchemaValidationOutcome,
} from '@formspec-org/app-graph';
import {
  createSurfaceDataSourcePayloadValidator,
  createSigningDataSourcePayloadValidator,
  loadSurfaceBundleSchemaValidators,
  loadCanonicalSigningContentValidator,
} from '../../../src/adapters/schema/index.ts';

const DEFINITION_URL = 'https://example.gov/forms/intake';
const RESPONSE_REF = 'https://formspec.org/schemas/response/1.0';
const CONTENT_REF = 'https://formspec.org/schemas/common/1.0#/$defs/SigningContent';

describe('public canonical module payload resources', () => {
  it('returns only the exact pinned common root through the public adapter entry', async () => {
    const bytes = readFileSync(resolve(process.cwd(), 'vendor/formspec-schemas/common.schema.json'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('5045b78db0ebffea56520f6e0b52a1302a65ef39f0a4bb637d61761328a5798a');
    const resources = await loadCanonicalModulePayloadSchemaResources();
    expect(resources).toEqual([{ uri: 'https://formspec.org/schemas/common/1.0', schema: JSON.parse(bytes.toString()) }]);
    const ids = resources.map(resource => resource.uri);
    expect(new Set(ids).size).toBe(resources.length);
    const references: string[] = [];
    function inspect(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref' || key === '$dynamicRef') {
          expect(typeof child).toBe('string');
          references.push(String(child));
        }
        inspect(child);
      }
    }
    inspect(resources[0].schema);
    expect(references).toHaveLength(20);
    expect(references.every(ref => ref.startsWith('#/'))).toBe(true);
  });

  it('deeply freezes the detached resource and isolates later consumers from caller copies', async () => {
    const resources = await loadCanonicalModulePayloadSchemaResources();
    const before = JSON.stringify(resources);
    function checkFrozen(value: unknown): void {
      if (!value || typeof value !== 'object') return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) checkFrozen(child);
    }
    checkFrozen(resources);
    expect(Reflect.set(resources, '0', { uri: 'https://invalid.example', schema: {} })).toBe(false);
    expect(Reflect.set(resources[0], 'uri', 'https://invalid.example')).toBe(false);
    const callerCopy = structuredClone(resources);
    Reflect.set(callerCopy[0], 'schema', { $id: 'https://invalid.example', type: 'null' });
    expect(JSON.stringify(await loadCanonicalModulePayloadSchemaResources())).toBe(before);
  });
});
const signingContent = {
  source: { ref: `${DEFINITION_URL}#/extensions/x-formspec-signing-content/entries/en`, version: '1' },
  locale: 'en', documentId: 'demo', signingIntent: 'urn:example:sign', declaration: 'Declaration.',
  electronicConsent: { textRef: 'urn:example:consent', version: '1', text: 'Consent.', controlLabel: 'I agree' },
  paperAlternative: 'Paper option.', affirmationText: 'Affirmation.', delegatedSigningNotice: 'Delegated notice.',
};

// Exact closed signing-result structure authored by the ceremony candidate.
const signingResultSchema = {
  oneOf: [
    { type: 'object', additionalProperties: false, required: ['state'], properties: { state: { const: 'unsigned' } } },
    { type: 'object', additionalProperties: false, required: ['state', 'response', 'draft', 'verification'], properties: {
      state: { const: 'signed' }, response: { $ref: RESPONSE_REF },
      draft: { type: 'object', additionalProperties: false, required: ['id', 'version'], properties: {
        id: { type: 'string', minLength: 1 }, version: { type: 'integer', minimum: 0 },
      } },
      verification: { type: 'object', additionalProperties: false, required: ['mode', 'provider', 'keyId'], properties: {
        mode: { const: 'delegated-service-key' }, provider: { type: 'string', minLength: 1 }, keyId: { type: 'string', minLength: 1 },
      } },
    } },
  ],
};

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
  it('admits external Mapping sources while preserving exclusive Definition association', async () => {
    const validate = await schemaValidator();
    const fixture = validArtifacts.find(candidate => candidate.artifactKind === 'mapping')!;
    const { definitionRef, definitionVersion, ...base } = fixture.document;
    const document = { ...base, sourceSchema: {
      url: 'urn:example:current-record', version: '1.0.0',
      schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
    } };
    expect(validateArtifact(validate, { ...fixture, document }).ok).toBe(true);
    expect(validateArtifact(validate, fixture).ok).toBe(true);
    for (const invalid of [
      base,
      { ...document, definitionRef },
      { ...document, definitionVersion },
      { ...document, definitionRef, definitionVersion },
      { ...document, sourceSchema: { ...document.sourceSchema, url: 'not a URI' } },
      { ...document, sourceSchema: { ...document.sourceSchema, version: '1' } },
      { ...document, sourceSchema: { ...document.sourceSchema, schema: null } },
    ]) {
      expect(validateArtifact(validate, { ...fixture, document: invalid })).toMatchObject({
        ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: 'SURFACE-BUNDLE-SCHEMA-INVALID' })]),
      });
    }
  });

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

  it('selects exact authored Surface schema versions and refuses crossed or absent identities', async () => {
    const validate = await schemaValidator();
    const old = validArtifacts.find(candidate => candidate.artifactKind === 'surface')!;
    const native = {
      artifactKind: 'surface', schemaId: 'https://formspec.org/schemas/surface/0.3',
      document: { $formspecSurface: '0.3', id: 'eligibility', entry: 'screen', routes: [{
        id: 'screen', path: '/', slots: [{ id: 'screen', slotType: 'screener', binding: {
          screenerRef: 'urn:example:screener', allowedTargets: ['surface:intake'],
        } }],
      }] },
    };
    expect(validateArtifact(validate, old).ok).toBe(true);
    expect(validateArtifact(validate, native).ok).toBe(true);
    expect(validateArtifact(validate, { ...native, schemaId: old.schemaId }).ok).toBe(false);
    expect(validateArtifact(validate, { ...old, schemaId: native.schemaId }).ok).toBe(false);
    expect(validateArtifact(validate, { ...native, schemaId: undefined }).ok).toBe(true);
    expect(validateArtifact(validate, { ...old, schemaId: undefined }).ok).toBe(true);
    expect(validateArtifact(validate, { ...native, schemaId: undefined,
      document: { ...native.document, $formspecSurface: '0.4' } })).toMatchObject({
      ok: false, issues: [{ code: 'SURFACE-BUNDLE-SCHEMA-ID-MISMATCH' }],
    });
    expect(validateArtifact(validate, { ...native, schemaId: 'https://formspec.org/schemas/surface/0.4' }).ok).toBe(false);
    const invalid = structuredClone(native);
    invalid.document.routes[0].slots[0].binding.allowedTargets = [];
    expect(validateArtifact(validate, invalid).ok).toBe(false);
    const oldWithNativeSlot = { ...native, schemaId: old.schemaId,
      document: { ...native.document, $formspecSurface: '0.2' } };
    expect(validateArtifact(validate, oldWithNativeSlot).ok).toBe(false);
  });

  it('selects exact authored Locale versions and preserves published 2.0 without a fallback', async () => {
    const validate = await schemaValidator();
    const old = validArtifacts.find(candidate => candidate.artifactKind === 'locale')!;
    const native = {
      artifactKind: 'locale', schemaId: 'https://formspec.org/schemas/locale/2.1',
      document: { $formspecLocale: '2.1', version: '1.0.0', locale: 'es-US',
        target: { kind: 'screener', url: 'https://example.gov/screeners/eligibility' }, strings: {} },
    };
    for (const artifact of [old, native]) {
      expect(validateArtifact(validate, artifact).ok).toBe(true);
      expect(validateArtifact(validate, { ...artifact, schemaId: undefined }).ok).toBe(true);
    }
    expect(validateArtifact(validate, { ...native, schemaId: old.schemaId }).ok).toBe(false);
    expect(validateArtifact(validate, { ...old, schemaId: native.schemaId }).ok).toBe(false);
    for (const marker of ['2.2', undefined]) {
      expect(validateArtifact(validate, { ...native, schemaId: undefined,
        document: { ...native.document, $formspecLocale: marker } }).ok).toBe(false);
      expect(validateArtifact(validate, { ...native,
        document: { ...native.document, $formspecLocale: marker } }).ok).toBe(false);
    }
    expect(validateArtifact(validate, { ...native, schemaId: 'https://formspec.org/schemas/locale/2.2' }).ok).toBe(false);
    expect(validateArtifact(validate, { ...native, schemaId: old.schemaId,
      document: { ...native.document, $formspecLocale: '2.0' } }).ok).toBe(false);
    expect(validateArtifact(validate, { ...native,
      document: { ...native.document, target: { kind: 'screener' } } }).ok).toBe(false);
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

  it('validates closed signing wording with the maintained common schema', async () => {
    const validate = await loadCanonicalSigningContentValidator();
    const content = {
      source: { ref: 'urn:example:form#/extensions/x-formspec-signing-content/entries/en', version: '1' },
      locale: 'en', documentId: 'demo', signingIntent: 'urn:example:sign',
      declaration: 'Example declaration.',
      electronicConsent: { textRef: 'urn:example:consent', version: '1', text: 'Example consent.', controlLabel: 'I agree' },
      paperAlternative: 'Example paper option.', affirmationText: 'Example affirmation.',
      delegatedSigningNotice: 'Example delegated signing notice.',
    };
    expect(validate(content)).toBe(true);
    expect(validate({ ...content, delegatedSigningNotice: '' })).toBe(false);
    expect(validate({ ...content, unexpected: true })).toBe(false);
    expect(validate({ ...content, electronicConsent: { ...content.electronicConsent, version: null } })).toBe(false);
  });

  it('validates the exact bundled Response root without remote resolution', async () => {
    const validate = createSurfaceDataSourcePayloadValidator();
    const schema = { $ref: 'https://formspec.org/schemas/response/1.0' };
    expect(await validate(payloadRequest(schema, sampleFormResponse))).toEqual({ valid: true });
    expect(await validate(payloadRequest(schema, { ...sampleFormResponse, data: null })))
      .toMatchObject({ valid: false });
    for (const unsupported of [
      { $ref: 'https://formspec.org/schemas/response/2.0' },
      { $ref: schema.$ref, required: ['unmet'] },
      { allOf: [schema] },
    ]) {
      expect(await validate(payloadRequest(unsupported, sampleFormResponse))).toEqual({
        valid: false, reason: 'The data source payload schema uses an unsupported remote reference.',
      });
    }
  });

  it('refuses a remote reference added to a previously compiled local schema', async () => {
    const validate = createSurfaceDataSourcePayloadValidator();
    const schema: Record<string, unknown> = { type: 'object' };
    expect(await validate(payloadRequest(schema, {}))).toEqual({ valid: true });
    schema.$ref = 'https://schemas.example/unknown.json';
    expect(await validate(payloadRequest(schema, {}))).toEqual({
      valid: false, reason: 'The data source payload schema uses an unsupported remote reference.',
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

describe('opt-in signing data source canonical reference profile', () => {
  it('qualifies full canonical Definition review input while retaining closed references and siblings', async () => {
    const validate = createSigningDataSourcePayloadValidator();
    const definition = validArtifacts.find(artifact => artifact.artifactKind === 'definition')!.document;
    const schema = { $ref: 'https://formspec.org/schemas/definition/1.0' };
    expect(await validate(payloadRequest(schema, definition))).toEqual({ valid: true });
    expect(await validate(payloadRequest(schema, { ...definition, items: 'invalid' }))).toMatchObject({ valid: false });
    expect(await validate(payloadRequest({ ...schema, required: ['missing'] }, definition))).toMatchObject({ valid: false });
    expect(await validate(payloadRequest({ $ref: `${schema.$ref}#/$defs/Item` }, definition))).toMatchObject({ valid: false });
    expect(await createSurfaceDataSourcePayloadValidator()(payloadRequest(schema, definition))).toMatchObject({ valid: false });
  });
  it('validates exact SigningContent and nested Response through maintained schemas', async () => {
    const validate = createSigningDataSourcePayloadValidator();
    const contentSchema = { $ref: CONTENT_REF };
    expect(await validate(payloadRequest(contentSchema, signingContent))).toEqual({ valid: true });
    for (const invalid of [{ ...signingContent, declaration: '' }, { ...signingContent, extra: true }]) {
      expect(await validate(payloadRequest(contentSchema, invalid))).toMatchObject({ valid: false });
    }
    const { RESPONSE_SCHEMA_DOCUMENT } = await import('../../../src/adapters/schema/canonical-schemas.ts');
    const signature = RESPONSE_SCHEMA_DOCUMENT.properties.authoredSignatures.examples[0][0];
    const signedResponse = { ...sampleFormResponse, id: signature.signedPayload.responseId, authoredSignatures: [signature] };
    const signed = { state: 'signed', response: signedResponse, draft: { id: 'owned', version: 4 },
      verification: { mode: 'delegated-service-key', provider: 'urn:provider', keyId: 'key' } };
    expect(await validate(payloadRequest(signingResultSchema, { state: 'unsigned' }))).toEqual({ valid: true });
    expect(await validate(payloadRequest(signingResultSchema, signed))).toEqual({ valid: true });
    for (const invalid of [
      { ...signed, response: { ...sampleFormResponse, data: null } },
      { ...signed, response: { ...sampleFormResponse, id: 'response', authoredSignatures: [] } },
      { ...signed, extra: true }, { ...signed, draft: { ...signed.draft, extra: true } },
    ]) expect(await validate(payloadRequest(signingResultSchema, invalid))).toMatchObject({ valid: false });
    expect(await createSurfaceDataSourcePayloadValidator()(payloadRequest(contentSchema, signingContent))).toMatchObject({ valid: false });
    expect(await createSurfaceDataSourcePayloadValidator()(payloadRequest(signingResultSchema, signed))).toMatchObject({ valid: false });
  });

  it('applies sibling constraints and recompiles changed local constraints without cross-instance contamination', async () => {
    const validate = createSigningDataSourcePayloadValidator();
    const sibling = { $ref: RESPONSE_REF, required: ['missing'] };
    expect(await validate(payloadRequest(sibling, sampleFormResponse))).toMatchObject({ valid: false });
    const schema = { type: 'object', properties: { value: { type: 'string', minLength: 1 } } };
    expect(await validate(payloadRequest(schema, { value: 'a' }))).toEqual({ valid: true });
    schema.properties.value.minLength = 2;
    expect(await validate(payloadRequest(schema, { value: 'a' }))).toMatchObject({ valid: false });
    expect(await createSigningDataSourcePayloadValidator()(payloadRequest(schema, { value: 'a' }))).toMatchObject({ valid: false });
    expect(await validate(payloadRequest({ $defs: { value: { type: 'string' } }, $ref: '#/$defs/value' }, 'local'))).toEqual({ valid: true });
  });

  it.each([
    { $ref: `${RESPONSE_REF}#/$defs/AuthoredSignature` }, { $ref: 'https://formspec.org/schemas/common/1.0' },
    { $ref: 'https://formspec.org/schemas/common/1.0#/$defs/SigningContent/unknown' },
    { properties: { nested: { $ref: 'https://example.test/remote' } } }, { $ref: './response.json' },
    { $dynamicRef: '#local' }, { $dynamicRef: RESPONSE_REF }, { $id: RESPONSE_REF, type: 'object' },
    { properties: { nested: { $id: 'https://example.test/base', $ref: RESPONSE_REF } } },
    { $anchor: 'SigningContent', type: 'object' }, { $async: true, type: 'object' },
  ])('refuses unsupported references/identity %j without fetching', async schema => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await createSigningDataSourcePayloadValidator()(payloadRequest(schema, {}))).toMatchObject({ valid: false });
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it('rechecks references before using a cached schema and snapshots before asynchronous loading', async () => {
    const validate = createSigningDataSourcePayloadValidator();
    const schema: Record<string, unknown> = { type: 'object' };
    const first = validate(payloadRequest(schema, {}));
    schema.$ref = 'https://example.test/remote';
    expect(await first).toEqual({ valid: true });
    expect(await validate(payloadRequest(schema, {}))).toMatchObject({ valid: false });
    delete schema.$ref;
    schema.$id = RESPONSE_REF;
    expect(await validate(payloadRequest(schema, {}))).toMatchObject({ valid: false });
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
