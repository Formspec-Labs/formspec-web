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

/**
 * Coerce a field value using item + bind + definition metadata (JSON in/out).
 *
 * `bind_json` may be empty, `"null"`, or a JSON object. Mirrors TS `coerceFieldValue`.
 */
export function coerceFieldValue(item_json: string, bind_json: string, definition_json: string, value_json: string): string;

/**
 * Compute dependency groups from recorded changeset entries.
 *
 * Accepts a JSON array of `RecordedEntry` objects and returns a JSON array
 * of `DependencyGroup` objects.
 */
export function computeDependencyGroups(entries_json: string): string;

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
 * Whether the expression is an interpolation static literal (locale spec §3.3.1).
 */
export function felExprIsInterpolationStaticLiteral(expression: string): boolean;

/**
 * Returns the split-module ABI version string (must match across runtime/tools builds).
 */
export function formspecWasmSplitAbiVersion(): string;

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

export function normalizeIndexedPath(path: string): string;

/**
 * Normalize FEL source for host evaluation (bare `$`, repeat qualifiers, repeat aliases).
 * `options_json`: `{ expression, currentItemPath?, replaceSelfRef?, repeatCounts?, valuesByPath? | fieldPaths? }`.
 */
export function prepareFelExpression(options_json: string): string;

/**
 * Copy `optionSets` entries onto fields that reference `optionSet` (mutates a JSON clone).
 */
export function resolveOptionSetsOnDefinition(definition_json: string): string;

/**
 * Sanitize a string into a valid FEL identifier.
 */
export function sanitizeFelIdentifier(s: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly computeDependencyGroups: (a: number, b: number, c: number) => void;
    readonly resolveOptionSetsOnDefinition: (a: number, b: number, c: number) => void;
    readonly applyMigrationsToResponseData: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly evaluateDefinition: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly evaluateScreenerDocument: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly felExprIsInterpolationStaticLiteral: (a: number, b: number) => number;
    readonly evalFEL: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly evalFELWithTrace: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly evalFELWithContext: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly getFELDependencies: (a: number, b: number, c: number) => void;
    readonly analyzeFEL: (a: number, b: number, c: number) => void;
    readonly analyzeFELWithFieldTypes: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly prepareFelExpression: (a: number, b: number, c: number) => void;
    readonly normalizeIndexedPath: (a: number, b: number, c: number) => void;
    readonly itemAtPath: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly itemLocationAtPath: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly isValidFelIdentifier: (a: number, b: number) => number;
    readonly sanitizeFelIdentifier: (a: number, b: number, c: number) => void;
    readonly formspecWasmSplitAbiVersion: (a: number) => void;
    readonly coerceFieldValue: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
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
