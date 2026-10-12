import Ajv2020, {
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type {
  AppGraphSchemaValidator,
  ModulePayloadSchemaResource,
  SchemaValidationIssue,
} from '@formspec-org/app-graph';
import type { DataSourcePayloadValidator } from '@formspec-org/surface';
import type {
  SurfaceBundleValidationConfig,
} from '../../verifying-surface/admission.ts';
import type { SupportedArtifactKind } from './canonical-schemas.ts';

type CanonicalSchema = AnySchemaObject & { readonly $id: string };

export type SurfaceBundleSchemaValidators = NonNullable<
  SurfaceBundleValidationConfig['schemaValidators']
>;

type CompiledArtifactValidators = Readonly<
  Record<SupportedArtifactKind, {
    readonly schemas: Readonly<Record<string, ValidateFunction>>;
    readonly identity?: { readonly versionField: string; readonly versions: Readonly<Record<string, string>> };
  }>
>;

let compiledResponseValidator: ValidateFunction | undefined;
let compiledSigningContentValidator: ValidateFunction | undefined;

let pendingArtifactValidators: Promise<CompiledArtifactValidators> | undefined;
let pendingModulePayloadResources: Promise<readonly ModulePayloadSchemaResource[]> | undefined;

/** Locally qualified canonical references for the maintained module props compiler. */
export function loadCanonicalModulePayloadSchemaResources(): Promise<readonly ModulePayloadSchemaResource[]> {
  pendingModulePayloadResources ??= import('./canonical-schemas.ts').then(({ DEPENDENCY_SCHEMA_DOCUMENTS }) => {
    const uri = 'https://formspec.org/schemas/common/1.0';
    const matches = DEPENDENCY_SCHEMA_DOCUMENTS.filter(document => isSchemaObject(document) && document.$id === uri);
    if (matches.length !== 1) throw new Error('Canonical common schema resource is unavailable or ambiguous');
    const schema = structuredClone(canonicalSchema(matches[0]));
    freezeSchemaSnapshot(schema);
    return Object.freeze([Object.freeze({ uri, schema })]);
  }).catch((error: unknown) => {
    pendingModulePayloadResources = undefined;
    throw error;
  });
  return pendingModulePayloadResources;
}

// Only detached, locally loaded JSON schema documents reach this helper.
function freezeSchemaSnapshot(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  for (const child of Object.values(value)) freezeSchemaSnapshot(child);
  Object.freeze(value);
}

/**
 * Load the canonical schemas and build the synchronous callback Surface bundle
 * admission requires.
 *
 * The schemas themselves live behind an `import()` (see `canonical-schemas.ts`)
 * because admission is the only thing that reads them and admission already
 * awaits a network fetch. Every AppGraph artifact kind has an explicit inventory of vendored
 * canonical schema URIs; unknown kinds and unexpected schema ids fail closed, so no
 * document can fall through to an implicit or always-successful validator.
 */
export async function loadSurfaceBundleSchemaValidators(): Promise<SurfaceBundleSchemaValidators> {
  const validators = await getCompiledArtifactValidators();
  const validate: AppGraphSchemaValidator = (input) => {
    if (!isSupportedArtifactKind(validators, input.artifactKind)) {
      return invalidOutcome({
        code: 'SURFACE-BUNDLE-SCHEMA-UNKNOWN-ARTIFACT',
        message: `No canonical schema is registered for artifact kind '${input.artifactKind}'.`,
      });
    }

    const compiled = validators[input.artifactKind];
    const schemaIds = Object.keys(compiled.schemas);
    const version = compiled.identity && isSchemaObject(input.document)
      ? input.document[compiled.identity.versionField] : undefined;
    const authoredSchemaId = typeof version === 'string' && compiled.identity
      && Object.hasOwn(compiled.identity.versions, version) ? compiled.identity.versions[version] : undefined;
    const schemaId = input.schemaId ?? (compiled.identity ? authoredSchemaId : schemaIds[0]);
    const validateDocument = schemaId !== undefined && Object.hasOwn(compiled.schemas, schemaId)
      ? compiled.schemas[schemaId] : undefined;
    if (!validateDocument || authoredSchemaId !== undefined && input.schemaId !== undefined && input.schemaId !== authoredSchemaId) {
      return invalidOutcome({
        code: 'SURFACE-BUNDLE-SCHEMA-ID-MISMATCH',
        message: `Schema '${input.schemaId}' is not supported for artifact kind '${input.artifactKind}'.`,
        details: {
          supportedSchemaIds: schemaIds,
          observedSchemaId: input.schemaId,
        },
      });
    }

    if (validateDocument(input.document)) {
      return Object.freeze({ ok: true });
    }

    return Object.freeze({
      ok: false,
      issues: schemaIssues(validateDocument.errors),
    });
  };
  return validate;
}

/** Validate a complete Response using the same maintained canonical schema compiler. */
export async function validateCanonicalFormResponse(document: unknown): Promise<boolean> {
  await getCompiledArtifactValidators();
  if (!compiledResponseValidator) throw new Error('Canonical Response schema did not compile');
  return compiledResponseValidator(document);
}

/** Load the maintained common SigningContent schema as a synchronous host callback. */
export async function loadCanonicalSigningContentValidator(): Promise<(value: unknown) => boolean> {
  await getCompiledArtifactValidators();
  if (!compiledSigningContentValidator) throw new Error('Canonical SigningContent schema did not compile');
  const validate = compiledSigningContentValidator;
  return value => Boolean(validate(value));
}

/**
 * Build the host validator for a Data Sources entry's declared payload schema.
 *
 * Catalog schemas are untrusted until the signed app graph is admitted. This
 * boundary accepts a valid local JSON Schema or the exact bundled Response root reference, refuses other remote references,
 * and caches a validator only after compilation succeeds.
 */
export function createSurfaceDataSourcePayloadValidator(): DataSourcePayloadValidator {
  const ajv = createPayloadAjv();
  const compiledSchemas = new WeakMap<object, ValidateFunction>();

  return ({ schema, value }) => {
    if (!isSchemaObject(schema)) {
      return payloadValidationFailure('The data source does not declare a valid payload schema.');
    }

    // This exact maintained root schema is bundled locally; do not resolve URLs.
    if (schema.$ref === 'https://formspec.org/schemas/response/1.0'
      && Object.keys(schema).length === 1) {
      return validateCanonicalFormResponse(value).then(valid => valid
        ? Object.freeze({ valid: true as const })
        : payloadValidationFailure('The data source payload does not match its declared schema.'));
    }

    if (containsRemoteReference(schema)) {
      return payloadValidationFailure(
        'The data source payload schema uses an unsupported remote reference.',
      );
    }
    let validate = compiledSchemas.get(schema);
    if (!validate) {
      try {
        if (!ajv.validateSchema(schema)) {
          return payloadValidationFailure(
            'The data source does not declare a valid payload schema.',
          );
        }
        validate = ajv.compile(schema);
      } catch {
        return payloadValidationFailure(
          'The data source does not declare a supported payload schema.',
        );
      }
      compiledSchemas.set(schema, validate);
    }

    return validate(value)
      ? Object.freeze({ valid: true as const })
      : payloadValidationFailure(
        'The data source payload does not match its declared schema.',
      );
  };
}

const SIGNING_PAYLOAD_REFERENCES = new Set([
  'https://formspec.org/schemas/definition/1.0',
  'https://formspec.org/schemas/response/1.0',
  'https://formspec.org/schemas/common/1.0#/$defs/SigningContent',
]);

/** Opt-in review and ceremony payload profile using exact bundled canonical references. */
export function createSigningDataSourcePayloadValidator(): DataSourcePayloadValidator {
  let pendingAjv: Promise<Ajv2020> | undefined;
  const compiledSchemas = new WeakMap<object, { fingerprint: string; validate: ValidateFunction }>();
  return async ({ schema, value }) => {
    if (!isSchemaObject(schema) || containsUnsupportedSigningReference(schema)) {
      return payloadValidationFailure('The signing payload schema uses an unsupported reference or schema identity.');
    }
    try {
      // Capture before awaiting the compiler; later caller mutations cannot change this admission.
      const snapshot = structuredClone(schema);
      const fingerprint = JSON.stringify(snapshot);
      let compiled = compiledSchemas.get(schema);
      if (!compiled || compiled.fingerprint !== fingerprint) {
        pendingAjv ??= loadCanonicalSchemaAjv().then(({ ajv }) => ajv).catch((error: unknown) => {
          pendingAjv = undefined;
          throw error;
        });
        const ajv = await pendingAjv;
        if (!ajv.validateSchema(snapshot)) return payloadValidationFailure('The signing payload schema is invalid.');
        compiled = { fingerprint, validate: ajv.compile(snapshot) };
        compiledSchemas.set(schema, compiled);
      }
      return compiled.validate(value) ? Object.freeze({ valid: true as const })
        : payloadValidationFailure('The data source payload does not match its declared schema.');
    } catch {
      return payloadValidationFailure('The signing payload schema is unsupported.');
    }
  };
}

function containsUnsupportedSigningReference(schema: object): boolean {
  const pending: unknown[] = [schema];
  const visited = new WeakSet<object>();
  while (pending.length) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null || visited.has(current)) continue;
    visited.add(current);
    if (!Array.isArray(current)) {
      const record = current as Record<string, unknown>;
      if (['$id', '$anchor', '$dynamicAnchor', '$dynamicRef', '$recursiveRef', '$async'].some(keyword => keyword in record)) return true;
      if ('$ref' in record) {
        const ref = record.$ref;
        if (typeof ref !== 'string' || (!ref.startsWith('#') && !SIGNING_PAYLOAD_REFERENCES.has(ref))) return true;
      }
    }
    pending.push(...Object.values(current));
  }
  return false;
}

function getCompiledArtifactValidators(): Promise<CompiledArtifactValidators> {
  // A failed load or compile must not poison every later admission, so the
  // memo only survives success.
  pendingArtifactValidators ??= compileArtifactValidators().catch((error: unknown) => {
    pendingArtifactValidators = undefined;
    throw error;
  });
  return pendingArtifactValidators;
}

async function compileArtifactValidators(): Promise<CompiledArtifactValidators> {
  const { ajv, artifactSchemas, identities } = await loadCanonicalSchemaAjv();

  const entries = artifactSchemas.map(([artifactKind, schemas]) => {
    const validators = schemas.map(schema => {
      const validate = ajv.getSchema(schema.$id);
      if (!validate) throw new Error(`Canonical schema '${schema.$id}' did not compile.`);
      return [schema.$id, validate] as const;
    });
    const identity = identities[artifactKind as keyof typeof identities];
    return [artifactKind, Object.freeze({ schemas: Object.freeze(Object.fromEntries(validators)),
      ...(identity ? { identity } : {}) })] as const;
  });
  compiledResponseValidator = ajv.getSchema('https://formspec.org/schemas/response/1.0');
  compiledSigningContentValidator = ajv.getSchema('https://formspec.org/schemas/common/1.0#/$defs/SigningContent');
  return Object.freeze(Object.fromEntries(entries)) as unknown as CompiledArtifactValidators;
}

async function loadCanonicalSchemaAjv() {
  const { ARTIFACT_SCHEMA_DOCUMENTS, ARTIFACT_SCHEMA_IDENTITIES, DEPENDENCY_SCHEMA_DOCUMENTS, RESPONSE_SCHEMA_DOCUMENT } = await import(
    './canonical-schemas.ts'
  );

  const ajv = createCanonicalAjv();
  for (const document of DEPENDENCY_SCHEMA_DOCUMENTS) {
    ajv.addSchema(canonicalSchema(document));
  }
  const artifactSchemas = Object.entries(ARTIFACT_SCHEMA_DOCUMENTS)
    .map(([artifactKind, documents]) => [artifactKind, documents.map(canonicalSchema)] as const);
  for (const [, schemas] of artifactSchemas) {
    for (const schema of schemas) ajv.addSchema(schema);
  }

  // Response is currently a dependency; retain explicit registration if that inventory changes.
  if (!ajv.getSchema(canonicalSchema(RESPONSE_SCHEMA_DOCUMENT).$id)) ajv.addSchema(canonicalSchema(RESPONSE_SCHEMA_DOCUMENT));
  return { ajv, artifactSchemas, identities: ARTIFACT_SCHEMA_IDENTITIES };
}

function createCanonicalAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    coerceTypes: false,
    removeAdditional: false,
    strict: false,
    useDefaults: false,
    validateFormats: true,
  });
  addFormats(ajv);
  // Canonical Formspec schemas use this documentation-only annotation.
  ajv.addKeyword({ keyword: 'x-lm' });
  return ajv;
}

function createPayloadAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    addUsedSchema: false,
    allErrors: false,
    coerceTypes: false,
    removeAdditional: false,
    strictRequired: false,
    strictSchema: true,
    strictTuples: false,
    strictTypes: false,
    useDefaults: false,
    validateFormats: true,
    validateSchema: true,
  });
  addFormats(ajv);
  return ajv;
}

function canonicalSchema(value: unknown): CanonicalSchema {
  if (!isSchemaObject(value) || typeof value.$id !== 'string' || value.$id === '') {
    throw new Error('Vendored canonical schema is missing its $id.');
  }
  return value as CanonicalSchema;
}

function isSupportedArtifactKind(
  validators: CompiledArtifactValidators,
  value: string,
): value is SupportedArtifactKind {
  return Object.prototype.hasOwnProperty.call(validators, value);
}

function isSchemaObject(value: unknown): value is AnySchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaIssues(errors: ErrorObject[] | null | undefined): SchemaValidationIssue[] {
  if (!errors || errors.length === 0) {
    return [Object.freeze({
      code: 'SURFACE-BUNDLE-SCHEMA-INVALID',
      message: 'The document does not match its canonical schema.',
    })];
  }

  return errors.map((error) => Object.freeze({
    code: 'SURFACE-BUNDLE-SCHEMA-INVALID',
    path: error.instancePath,
    keyword: error.keyword,
    message: error.message ?? 'The document does not match its canonical schema.',
    details: { ...error.params },
  }));
}

function invalidOutcome(issue: SchemaValidationIssue) {
  return Object.freeze({
    ok: false,
    issues: [Object.freeze(issue)],
  });
}

function payloadValidationFailure(reason: string) {
  return Object.freeze({
    valid: false as const,
    reason,
  });
}

function containsRemoteReference(schema: object): boolean {
  const pending: unknown[] = [schema];
  const visited = new WeakSet<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== 'object' || current === null || visited.has(current)) {
      continue;
    }
    visited.add(current);
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const keyword of ['$ref', '$dynamicRef'] as const) {
      const reference = record[keyword];
      if (typeof reference === 'string' && !reference.startsWith('#')) {
        return true;
      }
    }
    pending.push(...Object.values(record));
  }

  return false;
}
