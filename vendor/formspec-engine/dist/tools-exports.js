/** @filedesc Tools-side public surface — FEL facade, assembly, mapping, view-models, taxonomy, locale store, WASM eval/lint/screener (ADR 0050 §8 — excluded from `engine-render-entry`). */
export { normalizeIndexedPath, itemAtPath, tokenizeFEL, analyzeFEL, normalizePathSegment, splitNormalizedPath, itemLocationAtPath, rewriteFELReferences, rewriteMessageTemplate, lintDocument, parseRegistry, findRegistryEntry, validateLifecycleTransition, wellKnownRegistryUrl, generateChangelog, printFEL, tryLiftConditionGroup, evaluateDefinition, getBuiltinFELFunctionCatalog, getFELDependencies, isValidFELIdentifier, sanitizeFELIdentifier, validateExtensionUsage, createSchemaValidator, rewriteFEL, } from './fel/fel-api.js';
export { createMappingEngine, RuntimeMappingEngine } from './mapping/RuntimeMappingEngine.js';
/** FEL eval for tooling (WASM); returns a JSON-compatible value. */
export { wasmEvalFEL as evalFEL } from './wasm-bridge-runtime.js';
/** @deprecated Use `lintDocument(doc, { registryDocuments })`. */
export { wasmLintDocumentWithRegistries as lintDocumentWithRegistries } from './wasm-bridge-tools.js';
export { wasmEvaluateScreenerDocument } from './wasm-bridge-runtime.js';
export { assembleDefinition, assembleDefinitionSync } from './assembly/assembleDefinition.js';
export { isNumericType, isDateType, isChoiceType, isTextType, isBinaryType, isBooleanType, isMoneyType, isUriType, } from './taxonomy.js';
export { interpolateMessage } from './interpolate-message.js';
export { LocaleStore } from './locale.js';
export { analyzeExperience, coverageFindings, referentialIntegrityFindings, targetDefinitionFindings, unresolvedItemRefFindings, } from './experience.js';
export { createFieldViewModel } from './field-view-model.js';
export { optionMatchesComboboxQuery } from './combobox-option-filter.js';
export { createFormViewModel } from './form-view-model.js';
