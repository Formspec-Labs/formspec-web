/* tslint:disable */
/* eslint-disable */

export function analyzeFEL(expression: string): string;

/**
 * Analyze a FEL expression with field data type context for type-mismatch warnings.
 *
 * `field_types_json` is a JSON object mapping field paths to data type strings,
 * e.g. `{"revenue": "money", "age": "number"}`.
 */
export function analyzeFELWithFieldTypes(expression: string, field_types_json: string): string;

/**
 * Apply `definition.migrations` to flat response `data` (FEL `transform` steps run in Rust).
 */
export function applyMigrationsToResponseData(definition_json: string, response_data_json: string, from_version: string, now_iso: string): string;

export function assembleDefinition(definition_json: string, fragments_json: string): string;

/**
 * Coerce a field value using item + bind + definition metadata (JSON in/out).
 *
 * `bind_json` may be empty, `"null"`, or a JSON object. Mirrors TS `coerceFieldValue`.
 */
export function coerceFieldValue(item_json: string, bind_json: string, definition_json: string, value_json: string): string;

export function collectFELRewriteTargets(expression: string): string;

/**
 * Compute dependency groups from recorded changeset entries.
 *
 * Accepts a JSON array of `RecordedEntry` objects and returns a JSON array
 * of `DependencyGroup` objects.
 */
export function computeDependencyGroups(entries_json: string): string;

/**
 * Detect the document type of a Formspec JSON document.
 * Returns the document type string or null.
 */
export function detectDocumentType(doc_json: string): any;

/**
 * Parse and evaluate a FEL expression with optional field values (JSON object).
 * Returns the result as a JSON string.
 */
export function evalFEL(expression: string, fields_json: string): string;

/**
 * Evaluate a FEL expression with full FormspecEnvironment context.
 * `context_json` is a JSON object: { fields, variables?, mipStates?, repeatContext? }
 */
export function evalFELWithContext(expression: string, context_json: string): string;

/**
 * Evaluate a FEL expression with a structured trace of evaluation steps.
 *
 * Returns a JSON string of shape `{ "value": ..., "diagnostics": [...], "trace": [TraceStep, ...] }`.
 * TraceStep is the tagged union from [`fel_core::TraceStep`] (`kind` = `"FieldResolved"`,
 * `"FunctionCalled"`, `"BinaryOp"`, `"IfBranch"`, `"ShortCircuit"`).
 */
export function evalFELWithTrace(expression: string, fields_json: string): string;

/**
 * Evaluate a Formspec definition against provided data (4-phase batch processor).
 * Returns JSON: { values, validations, nonRelevant, variables, required, readonly }
 */
export function evaluateDefinition(definition_json: string, data_json: string, context_json?: string | null): string;

/**
 * Evaluate a standalone Screener Document against respondent inputs.
 *
 * Returns a Determination Record JSON string (always non-null).
 *
 * `context_json` is an optional JSON object with:
 * - `answerStates`: `Record<string, "answered"|"declined"|"not-presented">` — per-item states
 * - `nowIso`: ISO 8601 datetime string for availability/validity checks
 */
export function evaluateScreenerDocument(screener_json: string, answers_json: string, context_json?: string | null): string;

/**
 * Execute a full Mapping Document (rules + defaults + autoMap) against `source`.
 * JS name `executeMappingDocument`.
 */
export function executeMappingDocument(doc_json: string, source_json: string, direction: string): string;

/**
 * Execute a `MappingRule[]` array against `source`. JS name `executeMappingRules`.
 */
export function executeMappingRules(rules_json: string, source_json: string, direction: string): string;

/**
 * Extract full dependency info from a FEL expression.
 */
export function extractDependencies(expression: string): string;

/**
 * Whether the expression is an interpolation static literal (locale spec §3.3.1).
 */
export function felExprIsInterpolationStaticLiteral(expression: string): boolean;

export function findRegistryEntry(registry_json: string, name: string, version_constraint: string): string;

/**
 * Returns the split-module ABI version string (must match across runtime/tools builds).
 */
export function formspecWasmSplitAbiVersion(): string;

/**
 * Diff two Formspec definition versions and produce a structured changelog.
 * Returns JSON with camelCase keys.
 */
export function generateChangelog(old_def_json: string, new_def_json: string, definition_url: string): string;

/**
 * Extract field dependencies from a FEL expression.
 */
export function getFELDependencies(expression: string): string;

/**
 * Check if a string is a valid FEL identifier.
 */
export function isValidFelIdentifier(s: string): boolean;

export function itemAtPath(items_json: string, path: string): string;

export function itemLocationAtPath(items_json: string, path: string): string;

/**
 * Convert a JSON Pointer string into a JSONPath string.
 */
export function jsonPointerToJsonPath(pointer: string): string;

/**
 * Lint a Formspec document (7-pass static analysis).
 * Returns JSON: { documentType, valid, diagnostics: [...] }
 */
export function lintDocument(doc_json: string, options_json?: string | null): string;

export function listBuiltinFunctions(): string;

export function normalizeIndexedPath(path: string): string;

/**
 * Parse a FEL expression and return whether it's valid.
 */
export function parseFEL(expression: string): boolean;

export function parseRegistry(registry_json: string): string;

/**
 * Plan schema validation execution for a document.
 */
export function planSchemaValidation(doc_json: string, document_type_override?: string | null): string;

/**
 * Normalize FEL source for host evaluation (bare `$`, repeat qualifiers, repeat aliases).
 * `options_json`: `{ expression, currentItemPath?, replaceSelfRef?, repeatCounts?, valuesByPath? | fieldPaths? }`.
 */
export function prepareFelExpression(options_json: string): string;

/**
 * Print a FEL expression AST back to normalized source string.
 */
export function printFEL(expression: string): string;

/**
 * Copy `optionSets` entries onto fields that reference `optionSet` (mutates a JSON clone).
 */
export function resolveOptionSetsOnDefinition(definition_json: string): string;

export function rewriteFELReferences(expression: string, rewrites_json: string): string;

/**
 * Rewrite FEL using assembly `RewriteMap` JSON (`fragmentRootKey`, `hostGroupKey`, `importedKeys`, `keyPrefix`).
 */
export function rewriteFelForAssembly(expression: string, map_json: string): string;

export function rewriteMessageTemplate(message: string, rewrites_json: string): string;

/**
 * Sanitize a string into a valid FEL identifier.
 */
export function sanitizeFelIdentifier(s: string): string;

export function tokenizeFEL(expression: string): string;

/**
 * Try to lift a FEL expression into Studio `ConditionGroup` JSON (`lifted` / `unlifted`).
 */
export function tryLiftConditionGroup(expression: string): string;

export function validateExtensionUsage(items_json: string, registry_entries_json: string): string;

export function validateLifecycleTransition(from: string, to: string): boolean;

export function wellKnownRegistryUrl(base_url: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly generateChangelog: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly computeDependencyGroups: (a: number, b: number, c: number) => void;
    readonly assembleDefinition: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly resolveOptionSetsOnDefinition: (a: number, b: number, c: number) => void;
    readonly applyMigrationsToResponseData: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly detectDocumentType: (a: number, b: number, c: number) => void;
    readonly jsonPointerToJsonPath: (a: number, b: number, c: number) => void;
    readonly planSchemaValidation: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly lintDocument: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly evaluateDefinition: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly evaluateScreenerDocument: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly felExprIsInterpolationStaticLiteral: (a: number, b: number) => number;
    readonly evalFEL: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly evalFELWithTrace: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly evalFELWithContext: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly parseFEL: (a: number, b: number) => number;
    readonly tokenizeFEL: (a: number, b: number, c: number) => void;
    readonly printFEL: (a: number, b: number, c: number) => void;
    readonly tryLiftConditionGroup: (a: number, b: number, c: number) => void;
    readonly getFELDependencies: (a: number, b: number, c: number) => void;
    readonly extractDependencies: (a: number, b: number, c: number) => void;
    readonly analyzeFEL: (a: number, b: number, c: number) => void;
    readonly analyzeFELWithFieldTypes: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly collectFELRewriteTargets: (a: number, b: number, c: number) => void;
    readonly rewriteFELReferences: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rewriteMessageTemplate: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rewriteFelForAssembly: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly listBuiltinFunctions: (a: number) => void;
    readonly prepareFelExpression: (a: number, b: number, c: number) => void;
    readonly normalizeIndexedPath: (a: number, b: number, c: number) => void;
    readonly itemAtPath: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly itemLocationAtPath: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly isValidFelIdentifier: (a: number, b: number) => number;
    readonly sanitizeFelIdentifier: (a: number, b: number, c: number) => void;
    readonly executeMappingRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly executeMappingDocument: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly parseRegistry: (a: number, b: number, c: number) => void;
    readonly findRegistryEntry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly validateLifecycleTransition: (a: number, b: number, c: number, d: number) => number;
    readonly wellKnownRegistryUrl: (a: number, b: number, c: number) => void;
    readonly validateExtensionUsage: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly formspecWasmSplitAbiVersion: (a: number) => void;
    readonly coerceFieldValue: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
