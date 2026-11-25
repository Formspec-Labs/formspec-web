/* tslint:disable */
/* eslint-disable */

/** Host extension functions (Core §3.12), shaped like fel-core's `ExtensionFunctions`. */
export interface FelExtensionHost {
    /** Arity bounds for a registered name; `undefined` when `name` is not an extension. */
    arity(name: string): { minArgs: number; maxArgs?: number } | undefined;
    /** Calls `name` with a JSON array of non-null arguments; returns the result as JSON. */
    invoke(name: string, argsJson: string): string;
}



/**
 * One form's FEL state, resident across calls.
 *
 * `new` takes the Definition's leaf typing; `load` replaces the per-evaluation snapshot;
 * `evaluate`, `evaluateTrace`, and `interpolate` read it by Item path.
 */
export class FelContext {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Evaluates `expression` in the binding scope of `item_path`; JSON `{ value, hasErrorDiagnostics }`.
     */
    evaluate(expression: string, item_path: string, replace_self_ref: boolean, now_iso?: string | null, extensions?: FelExtensionHost | null): string;
    /**
     * [`FelContextHandle::evaluate`] plus `diagnostics` and an ordered `trace`.
     */
    evaluateTrace(expression: string, item_path: string, replace_self_ref: boolean, now_iso?: string | null, extensions?: FelExtensionHost | null): string;
    /**
     * Resolves every `{{expression}}` in `template` in the scope of `item_path` (Locale §3.3.1);
     * `replace_self_ref` binds bare `$` to the item, as a validation message needs.
     */
    interpolate(template: string, item_path: string, replace_self_ref: boolean, now_iso?: string | null, extensions?: FelExtensionHost | null): string;
    /**
     * Replaces the form-scope snapshot:
     * `{ values, mips, repeatCounts, variables, instances, locale, dateFormats, meta, subjectKeys }`.
     */
    load(snapshot_json: string): void;
    /**
     * Context for a Definition: `{ dataTypes: { path: dataType }, excludedValueNull: [path] }`.
     */
    constructor(schema_json: string);
}

/**
 * Analyze a draft FEL expression in its Definition or Mapping editor context.
 */
export function analyzeExpressionInDefinition(document_json: string, expression: string, registry_documents_json: string, target: string | null | undefined, mapping: boolean): string;

export function analyzeFel(expression: string): string;

/**
 * Analyze a FEL expression with field data type context for type-mismatch warnings.
 *
 * `field_types_json` is a JSON object mapping field paths to data type strings,
 * e.g. `{"revenue": "money", "age": "number"}`.
 */
export function analyzeFelWithFieldTypes(expression: string, field_types_json: string): string;

/**
 * Apply `definition.migrations` to flat response `data` (FEL `transform` steps run in Rust).
 */
export function applyMigrationsToResponseData(definition_json: string, response_data_json: string, from_version: string, now_iso: string): string;

/**
 * Attach the evidence from available Response instance resolutions.
 *
 * # Errors
 * Returns a JavaScript error if input cannot be decoded or delivery validation fails.
 */
export function assembleCandidate(definition_json: string, response_json: string, evaluation_json: string, resolution_json: string): string;

export function assembleDefinition(definition_json: string, fragments_json: string): string;

/**
 * Canonicalize Response `data` against a Definition's declared fields and authored Binds.
 */
export function canonicalizeResponseData(definition_json: string, data_json: string): string;

/**
 * Throws when `name` may not be registered: a FEL built-in or reserved word (Core §3.12 rule 1).
 */
export function checkFelExtensionName(name: string): void;

/**
 * Return projection diagnostics for every eligible published upstream Definition version.
 *
 * Pass the instance or prefill consumer as JSON, or `null` for widget route
 * parameters. Pass all published Definitions for the upstream URL as a JSON array.
 *
 * # Errors
 *
 * Returns a JavaScript error on invalid input JSON.
 */
export function checkResponseProjection(instance_json: string, consumer_json: string, upstream_definitions_json: string): string;

/**
 * Coerce a field value using item + bind + definition metadata (JSON in/out).
 *
 * `bind_json` may be empty, `"null"`, or a JSON object. Mirrors TS `coerceFieldValue`.
 */
export function coerceFieldValue(item_json: string, bind_json: string, definition_json: string, value_json: string): string;

export function collectFelRewriteTargets(expression: string): string;

/**
 * Compute dependency groups from recorded changeset entries.
 *
 * Accepts a JSON array of `RecordedEntry` objects and returns a JSON array
 * of `DependencyGroup` objects.
 */
export function computeDependencyGroups(entries_json: string): string;

/**
 * Initialize one added repeat row in its Response context.
 */
export function createRepeatRow(definition_json: string, data_json: string, group_path: string, context_json?: string | null, extensions?: FelExtensionHost | null): string;

/**
 * Create a new Response from host prefill and available sources.
 */
export function createResponse(definition_json: string, prefill_json: string, context_json?: string | null, extensions?: FelExtensionHost | null): string;

/**
 * Derive the JSON-LD `@context` for a Definition from an Ontology document's bindings.
 *
 * Returns JSON `{ "context": {...}, "diagnostics": [{ kind, path, key, existingId?, newId? }] }`
 * (Ontology spec §6.2). Errors when either argument is not JSON.
 */
export function deriveJsonLdContext(definition_json: string, ontology_json: string): string;

/**
 * Detect the document type of a Formspec JSON document.
 * Returns the document type string or null.
 */
export function detectDocumentType(doc_json: string): any;

/**
 * Parse and evaluate a FEL expression with optional field values (JSON object).
 * Returns the result as a JSON string.
 */
export function evalFel(expression: string, fields_json: string): string;

/**
 * Evaluate a FEL expression with full FormspecEnvironment context.
 * `context_json` is a JSON object: { fields, variables?, mipStates?, repeatContext? }
 *
 * `extensions` resolves calls to host extension functions (Core §3.12).
 */
export function evalFelWithContext(expression: string, context_json: string, extensions?: FelExtensionHost | null): string;

/**
 * Evaluate a FEL expression with full context and trace each evaluation step.
 *
 * `extensions` resolves calls to host extension functions (Core §3.12).
 */
export function evalFelWithContextTrace(expression: string, context_json: string, extensions?: FelExtensionHost | null): string;

/**
 * Evaluate a FEL expression with a structured trace of evaluation steps.
 *
 * Returns a JSON string of shape `{ "value": ..., "diagnostics": [...], "trace": [TraceStep, ...] }`.
 * TraceStep is the tagged union from [`fel_core::TraceStep`] (`kind` = `"FieldResolved"`,
 * `"FunctionCalled"`, `"BinaryOp"`, `"IfBranch"`, `"ShortCircuit"`).
 */
export function evalFelWithTrace(expression: string, fields_json: string): string;

/**
 * Evaluate a Formspec definition against provided data (4-phase batch processor).
 * Returns the camelCase evaluation report with the browser's editing state.
 *
 * `context_json.subjectType` and `context_json.subjectKeys` supply the current Response's subject.
 * `extensions` resolves Definition calls to host extension functions (Core §3.12).
 */
export function evaluateDefinition(definition_json: string, data_json: string, context_json?: string | null, extensions?: FelExtensionHost | null): string;

/**
 * Prepare stable Response data and its submit verdict with the supplied clock.
 *
 * # Errors
 *
 * Returns an error for invalid JSON, invalid context, or data that do not settle.
 */
export function evaluateFiled(definition_json: string, data_json: string, context_json?: string | null, extensions?: FelExtensionHost | null): string;

/**
 * Evaluate a standalone Screener Document against respondent inputs.
 *
 * Returns a Determination Record JSON string (always non-null).
 *
 * `context_json` is an optional JSON object with:
 * - `answerStates`: `Record<string, "answered"|"declined"|"not-presented">` — per-item states
 * - `nowIso`: ISO 8601 datetime string for availability/validity checks
 *
 * `extensions` resolves host extension functions (Core §3.12) in route conditions and scores.
 */
export function evaluateScreenerDocument(screener_json: string, answers_json: string, context_json?: string | null, extensions?: FelExtensionHost | null): string;

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
 * Collect instance reads from every authored expression and creation declaration.
 *
 * # Errors
 *
 * Returns the authored location of an invalid expression or an input JSON error.
 */
export function getDefinitionInstanceReads(definition_json: string): string;

/**
 * Extract static dependencies from a FEL expression.
 */
export function getFelDependencies(expression: string): string;

/**
 * Resolve `{{expression}}` sequences in `template` against a FEL context (Locale §3.3.1).
 *
 * `context_json` has the `evalFelWithContext` shape; `extensions` resolves host
 * extension functions. Returns JSON `{ text, warnings: [{ expression, message }] }`.
 */
export function interpolateFelTemplate(template: string, context_json: string, extensions?: FelExtensionHost | null): string;

/**
 * Resolve `{{expression}}` sequences with a host evaluator under Rust's template rules.
 *
 * `evaluate(expression)` returns JSON `{ value, hasErrorDiagnostics? }` or throws; a
 * throw keeps the expression literal. Returns JSON `{ text, warnings }`.
 */
export function interpolateTemplate(template: string, evaluate: Function): string;

/**
 * Check if a string is a valid FEL identifier.
 */
export function isValidFelIdentifier(s: string): boolean;

/**
 * Check whether a Response's authored timestamp identifies an instant.
 */
export function isValidResponseAuthored(authored: string): boolean;

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
export function parseFel(expression: string): boolean;

export function parseRegistry(registry_json: string): string;

/**
 * Plan schema validation execution for a document.
 */
export function planSchemaValidation(doc_json: string, document_type_override?: string | null): string;

/**
 * Print a FEL expression AST back to normalized source string.
 */
export function printFel(expression: string): string;

/**
 * Copy `optionSets` entries onto fields that reference `optionSet` (mutates a JSON clone).
 */
export function resolveOptionSetsOnDefinition(definition_json: string): string;

/**
 * Rewrite FEL using assembly `RewriteMap` JSON (`fragmentRootKey`, `hostGroupKey`, `importedKeys`, `keyPrefix`).
 */
export function rewriteFelForAssembly(expression: string, map_json: string): string;

export function rewriteFelReferences(expression: string, rewrites_json: string): string;

export function rewriteMessageTemplate(message: string, rewrites_json: string): string;

/**
 * Sanitize a string into a valid FEL identifier.
 */
export function sanitizeFelIdentifier(s: string): string;

/**
 * Select an authorized Response read and return its exact JSON value and evidence.
 *
 * # Errors
 *
 * Records require a store-owned `kind` of `open-draft` or `filing`.
 * Returns an error for invalid input JSON, including an omitted `upstreamSubject`.
 * Supply JSON null when the upstream Definition declares no subject.
 */
export function selectResponsesJson(records_json: string, selection_json: string, context_json: string): string;

/**
 * Derive the canonical id of a typed Response subject.
 *
 * Respondent hosts key drafts by this id before an engine exists; the engine derives
 * `Response.subject.id` through the same function.
 *
 * # Errors
 *
 * Returns an error for malformed or untyped keys JSON or an out-of-range integer key.
 */
export function subjectIdJson(subject_type: string, keys_json: string): string;

export function tokenizeFel(expression: string): string;

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
    readonly __wbg_felcontext_free: (a: number, b: number) => void;
    readonly analyzeExpressionInDefinition: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly analyzeFel: (a: number, b: number, c: number) => void;
    readonly analyzeFelWithFieldTypes: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly applyMigrationsToResponseData: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly assembleCandidate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly assembleDefinition: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly canonicalizeResponseData: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly checkFelExtensionName: (a: number, b: number, c: number) => void;
    readonly checkResponseProjection: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly coerceFieldValue: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly collectFelRewriteTargets: (a: number, b: number, c: number) => void;
    readonly computeDependencyGroups: (a: number, b: number, c: number) => void;
    readonly createRepeatRow: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly createResponse: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly deriveJsonLdContext: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly detectDocumentType: (a: number, b: number, c: number) => void;
    readonly evalFel: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly evalFelWithContext: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly evalFelWithContextTrace: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly evalFelWithTrace: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly evaluateDefinition: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly evaluateFiled: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly evaluateScreenerDocument: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly executeMappingDocument: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly executeMappingRules: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly extractDependencies: (a: number, b: number, c: number) => void;
    readonly felcontext_evaluate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly felcontext_evaluateTrace: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly felcontext_interpolate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => void;
    readonly felcontext_load: (a: number, b: number, c: number, d: number) => void;
    readonly felcontext_new: (a: number, b: number, c: number) => void;
    readonly findRegistryEntry: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly formspecWasmSplitAbiVersion: (a: number) => void;
    readonly generateChangelog: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly getDefinitionInstanceReads: (a: number, b: number, c: number) => void;
    readonly getFelDependencies: (a: number, b: number, c: number) => void;
    readonly interpolateFelTemplate: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly interpolateTemplate: (a: number, b: number, c: number, d: number) => void;
    readonly isValidFelIdentifier: (a: number, b: number) => number;
    readonly isValidResponseAuthored: (a: number, b: number) => number;
    readonly itemAtPath: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly itemLocationAtPath: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly jsonPointerToJsonPath: (a: number, b: number, c: number) => void;
    readonly lintDocument: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly listBuiltinFunctions: (a: number) => void;
    readonly normalizeIndexedPath: (a: number, b: number, c: number) => void;
    readonly parseFel: (a: number, b: number) => number;
    readonly parseRegistry: (a: number, b: number, c: number) => void;
    readonly planSchemaValidation: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly printFel: (a: number, b: number, c: number) => void;
    readonly resolveOptionSetsOnDefinition: (a: number, b: number, c: number) => void;
    readonly rewriteFelForAssembly: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rewriteFelReferences: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly rewriteMessageTemplate: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly sanitizeFelIdentifier: (a: number, b: number, c: number) => void;
    readonly selectResponsesJson: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly subjectIdJson: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly tokenizeFel: (a: number, b: number, c: number) => void;
    readonly tryLiftConditionGroup: (a: number, b: number, c: number) => void;
    readonly validateExtensionUsage: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly validateLifecycleTransition: (a: number, b: number, c: number, d: number) => number;
    readonly wellKnownRegistryUrl: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
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
