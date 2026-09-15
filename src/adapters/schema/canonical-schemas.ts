/**
 * Vendored canonical Formspec schemas, held apart from the render path.
 *
 * These documents are the largest single payload the signed respondent surface
 * carries, and they are read exactly once per admission run — after the bundle
 * has been fetched and its signature verified. Nothing imports this module
 * statically: reaching it only through `import()` keeps roughly a third of the
 * surface chunk out of the bytes that gate the first paint, and lets it
 * download alongside the bundle instead of ahead of it.
 *
 * Import this module with `import()` only. A static import folds the schemas
 * back into whatever chunk reaches them and `npm run check:bundle-budget`
 * fails on the result.
 */
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

/**
 * Exact artifact kinds emitted by the vendored AppGraph ArtifactResolver.
 *
 * This is deliberately a closed map. A future artifact kind must bring its
 * canonical schema in here before a signed bundle can be admitted.
 */
export const ARTIFACT_SCHEMA_DOCUMENTS = Object.freeze({
  appManifest: bundleManifestSchemaJson,
  definition: definitionSchemaJson,
  experience: experienceSchemaJson,
  responseActions: responseActionsSchemaJson,
  component: componentSchemaJson,
  theme: themeSchemaJson,
  references: referencesSchemaJson,
  ontology: ontologySchemaJson,
  registry: registrySchemaJson,
  surface: surfaceSchemaJson,
  screener: screenerSchemaJson,
  dataSources: dataSourcesSchemaJson,
  locale: localeSchemaJson,
  mapping: mappingSchemaJson,
});

export type SupportedArtifactKind = keyof typeof ARTIFACT_SCHEMA_DOCUMENTS;

/** Schemas no artifact kind resolves to, referenced by the ones that do. */
export const DEPENDENCY_SCHEMA_DOCUMENTS: readonly unknown[] = Object.freeze([
  commonSchemaJson,
  issuerSchemaJson,
  validationMappingSchemaJson,
  // Data Sources filters reference Response's ResponseStatus.
  responseSchemaJson,
  validationResultSchemaJson,
  verificationReceiptSchemaJson,
]);
