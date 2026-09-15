import Ajv2020, {
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type {
  AppGraphSchemaValidator,
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
    readonly schemaId: string;
    readonly validate: ValidateFunction;
  }>
>;

let pendingArtifactValidators: Promise<CompiledArtifactValidators> | undefined;

/**
 * Load the canonical schemas and build the synchronous callback Surface bundle
 * admission requires.
 *
 * The schemas themselves live behind an `import()` (see `canonical-schemas.ts`)
 * because admission is the only thing that reads them and admission already
 * awaits a network fetch. Every AppGraph artifact kind resolves to one vendored
 * canonical schema; unknown kinds and unexpected schema ids fail closed, so no
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
    if (input.schemaId !== undefined && input.schemaId !== compiled.schemaId) {
      return invalidOutcome({
        code: 'SURFACE-BUNDLE-SCHEMA-ID-MISMATCH',
        message: `Schema '${input.schemaId}' is not supported for artifact kind '${input.artifactKind}'.`,
        details: {
          expectedSchemaId: compiled.schemaId,
          observedSchemaId: input.schemaId,
        },
      });
    }

    if (compiled.validate(input.document)) {
      return Object.freeze({ ok: true });
    }

    return Object.freeze({
      ok: false,
      issues: schemaIssues(compiled.validate.errors),
    });
  };
  return validate;
}

/**
 * Build the host validator for a Data Sources entry's declared payload schema.
 *
 * Catalog schemas are untrusted until the signed app graph is admitted. This
 * boundary accepts only a valid local JSON Schema, refuses remote references,
 * and caches a validator only after compilation succeeds.
 */
export function createSurfaceDataSourcePayloadValidator(): DataSourcePayloadValidator {
  const ajv = createPayloadAjv();
  const compiledSchemas = new WeakMap<object, ValidateFunction>();

  return ({ schema, value }) => {
    if (!isSchemaObject(schema)) {
      return payloadValidationFailure('The data source does not declare a valid payload schema.');
    }

    let validate = compiledSchemas.get(schema);
    if (!validate) {
      if (containsRemoteReference(schema)) {
        return payloadValidationFailure(
          'The data source payload schema uses an unsupported remote reference.',
        );
      }
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
  const { ARTIFACT_SCHEMA_DOCUMENTS, DEPENDENCY_SCHEMA_DOCUMENTS } = await import(
    './canonical-schemas.ts'
  );

  const ajv = createCanonicalAjv();
  for (const document of DEPENDENCY_SCHEMA_DOCUMENTS) {
    ajv.addSchema(canonicalSchema(document));
  }
  const artifactSchemas = Object.entries(ARTIFACT_SCHEMA_DOCUMENTS)
    .map(([artifactKind, document]) => [artifactKind, canonicalSchema(document)] as const);
  for (const [, schema] of artifactSchemas) {
    ajv.addSchema(schema);
  }

  const entries = artifactSchemas.map(([artifactKind, schema]) => {
    const validate = ajv.getSchema(schema.$id);
    if (!validate) {
      throw new Error(`Canonical schema '${schema.$id}' did not compile.`);
    }
    return [
      artifactKind,
      Object.freeze({
        schemaId: schema.$id,
        validate,
      }),
    ] as const;
  });

  return Object.freeze(Object.fromEntries(entries)) as CompiledArtifactValidators;
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
