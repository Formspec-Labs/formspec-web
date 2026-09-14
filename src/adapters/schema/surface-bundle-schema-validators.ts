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
import bundleManifestSchemaJson from '../../../vendor/formspec-schemas/bundle-manifest.schema.json';
import commonSchemaJson from '../../../vendor/formspec-schemas/common.schema.json';
import componentSchemaJson from '../../../vendor/formspec-schemas/component.schema.json';
import dataSourcesSchemaJson from '../../../vendor/formspec-schemas/data-sources.schema.json';
import definitionSchemaJson from '../../../vendor/formspec-schemas/definition.schema.json';
import experienceSchemaJson from '../../../vendor/formspec-schemas/experience.schema.json';
import issuerSchemaJson from '../../../vendor/formspec-schemas/issuer.schema.json';
import localeSchemaJson from '../../../vendor/formspec-schemas/locale.schema.json';
import mappingSchemaJson from '../../../vendor/formspec-schemas/mapping.schema.json';
import ontologySchemaJson from '../../../vendor/formspec-schemas/ontology.schema.json';
import referencesSchemaJson from '../../../vendor/formspec-schemas/references.schema.json';
import registrySchemaJson from '../../../vendor/formspec-schemas/registry.schema.json';
import responseSchemaJson from '../../../vendor/formspec-schemas/response.schema.json';
import responseActionsSchemaJson from '../../../vendor/formspec-schemas/response-actions.schema.json';
import screenerSchemaJson from '../../../vendor/formspec-schemas/screener.schema.json';
import surfaceSchemaJson from '../../../vendor/formspec-schemas/surface.schema.json';
import themeSchemaJson from '../../../vendor/formspec-schemas/theme.schema.json';
import validationMappingSchemaJson from '../../../vendor/formspec-schemas/validation-mapping.schema.json';
import validationResultSchemaJson from '../../../vendor/formspec-schemas/validation-result.schema.json';
import verificationReceiptSchemaJson from '../../../vendor/formspec-schemas/verification-receipt.schema.json';

type CanonicalSchema = AnySchemaObject & { readonly $id: string };

export type SurfaceBundleSchemaValidators = NonNullable<
  SurfaceBundleValidationConfig['schemaValidators']
>;

const bundleManifestSchema = canonicalSchema(bundleManifestSchemaJson);
const commonSchema = canonicalSchema(commonSchemaJson);
const componentSchema = canonicalSchema(componentSchemaJson);
const dataSourcesSchema = canonicalSchema(dataSourcesSchemaJson);
const definitionSchema = canonicalSchema(definitionSchemaJson);
const experienceSchema = canonicalSchema(experienceSchemaJson);
const issuerSchema = canonicalSchema(issuerSchemaJson);
const localeSchema = canonicalSchema(localeSchemaJson);
const mappingSchema = canonicalSchema(mappingSchemaJson);
const ontologySchema = canonicalSchema(ontologySchemaJson);
const referencesSchema = canonicalSchema(referencesSchemaJson);
const registrySchema = canonicalSchema(registrySchemaJson);
const responseActionsSchema = canonicalSchema(responseActionsSchemaJson);
const screenerSchema = canonicalSchema(screenerSchemaJson);
const surfaceSchema = canonicalSchema(surfaceSchemaJson);
const themeSchema = canonicalSchema(themeSchemaJson);
const validationMappingSchema = canonicalSchema(validationMappingSchemaJson);

const dependencySchemas = Object.freeze([
  commonSchema,
  issuerSchema,
  validationMappingSchema,
  // Data Sources filters reference Response's ResponseStatus.
  canonicalSchema(responseSchemaJson),
  canonicalSchema(validationResultSchemaJson),
  canonicalSchema(verificationReceiptSchemaJson),
]);

/**
 * Exact artifact kinds emitted by the vendored AppGraph ArtifactResolver.
 *
 * This is deliberately a closed map. A future artifact kind must bring its
 * canonical schema into this adapter before a signed bundle can be admitted.
 */
const artifactSchemas = Object.freeze({
  appManifest: bundleManifestSchema,
  definition: definitionSchema,
  experience: experienceSchema,
  responseActions: responseActionsSchema,
  component: componentSchema,
  theme: themeSchema,
  references: referencesSchema,
  ontology: ontologySchema,
  registry: registrySchema,
  surface: surfaceSchema,
  screener: screenerSchema,
  dataSources: dataSourcesSchema,
  locale: localeSchema,
  mapping: mappingSchema,
});

type SupportedArtifactKind = keyof typeof artifactSchemas;
type CompiledArtifactValidators = Readonly<
  Record<SupportedArtifactKind, {
    readonly schemaId: string;
    readonly validate: ValidateFunction;
  }>
>;

let compiledArtifactValidators: CompiledArtifactValidators | undefined;

/**
 * Build the synchronous schema callback required by Surface bundle admission.
 *
 * Every AppGraph artifact kind resolves to one vendored canonical schema.
 * Unknown kinds and unexpected schema ids fail closed; no document can fall
 * through to an implicit or always-successful validator.
 */
export function createSurfaceBundleSchemaValidators(): SurfaceBundleSchemaValidators {
  const validators = getCompiledArtifactValidators();
  const validate: AppGraphSchemaValidator = (input) => {
    if (!isSupportedArtifactKind(input.artifactKind)) {
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

function getCompiledArtifactValidators(): CompiledArtifactValidators {
  if (compiledArtifactValidators) return compiledArtifactValidators;

  const ajv = createCanonicalAjv();
  for (const schema of dependencySchemas) {
    ajv.addSchema(schema);
  }
  for (const schema of Object.values(artifactSchemas)) {
    ajv.addSchema(schema);
  }

  const entries = Object.entries(artifactSchemas).map(([artifactKind, schema]) => {
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

  compiledArtifactValidators = Object.freeze(
    Object.fromEntries(entries),
  ) as CompiledArtifactValidators;
  return compiledArtifactValidators;
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

function isSupportedArtifactKind(value: string): value is SupportedArtifactKind {
  return Object.prototype.hasOwnProperty.call(artifactSchemas, value);
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
