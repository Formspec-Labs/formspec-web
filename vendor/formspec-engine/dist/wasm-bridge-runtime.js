/** @filedesc Runtime WASM — init, accessors, and wrappers that use only the runtime `formspec_wasm_runtime` module. */
import { parseJsonExact } from '@formspec-org/integrity-canonical';
/** Decode the maintained WASM protocol without rounding its numeric leaves. */
function parseWasmJson(text) { return parseJsonExact(text); }
import { nodeFsModuleName, resolveWasmAssetPathForNode, } from './wasm-bridge-shared.js';
let _wasmReady = false;
let _initPromise = null;
let _wasm = null;
/** Whether the WASM module has been initialized and is ready for use. */
export function isWasmReady() {
    return _wasmReady;
}
/**
 * Initialize the WASM module. Safe to call multiple times — subsequent calls
 * return the same promise. Resolves when WASM is ready; rejects on failure.
 *
 * With `wasmBytes`, instantiates from those bytes.
 * In Node.js, otherwise uses `initSync()` with bytes read from disk.
 * In browsers, otherwise the generated wasm-bindgen loader fetches the sibling `.wasm` asset via URL.
 */
export async function initWasm(options = {}) {
    if (_wasmReady)
        return;
    if (_initPromise)
        return _initPromise;
    _initPromise = (async () => {
        try {
            const runtime = await import('../wasm-pkg-runtime/formspec_wasm_runtime.js');
            const runningInNode = typeof globalThis.process !== 'undefined'
                && globalThis.process.versions?.node;
            let wasmBytes = options.wasmBytes ?? null;
            if (!wasmBytes && runningInNode && typeof runtime.initSync === 'function') {
                const { readFileSync } = await import(/* @vite-ignore */ nodeFsModuleName);
                const wasmPath = await resolveWasmAssetPathForNode('../wasm-pkg-runtime/formspec_wasm_runtime_bg.wasm');
                wasmBytes = readFileSync(wasmPath);
            }
            if (typeof runtime.initSync === 'function' && wasmBytes) {
                runtime.initSync({ module: wasmBytes });
            }
            else if (typeof runtime.default === 'function') {
                await runtime.default({
                    module_or_path: new URL('../wasm-pkg-runtime/formspec_wasm_runtime_bg.wasm', import.meta.url),
                });
            }
            _wasm = runtime;
            _wasmReady = true;
        }
        catch (e) {
            _initPromise = null;
            throw e;
        }
    })();
    return _initPromise;
}
function wasm() {
    if (!_wasm || !_wasmReady) {
        throw new Error('Formspec runtime WASM is not initialized. Call await initFormspecEngine() (or await initWasm()) before using the engine.');
    }
    return _wasm;
}
/**
 * Initialized runtime module — for `wasm-bridge-tools` only (ABI check).
 * Not re-exported from the public `wasm-bridge` barrel.
 */
export function getWasmModule() {
    return wasm();
}
function parseFelEvalEnvelope(resultJson) {
    const parsed = parseWasmJson(resultJson);
    if (parsed &&
        typeof parsed === 'object' &&
        'value' in parsed &&
        typeof parsed.hasErrorDiagnostics === 'boolean') {
        return parsed;
    }
    throw new Error('evalFel returned unexpected JSON (expected { value, hasErrorDiagnostics })');
}
/** Evaluate a FEL expression with optional field values. Returns the evaluated value. */
export function wasmEvalFel(expression, fields = {}) {
    const fn = wasm().evalFel;
    return parseFelEvalEnvelope(fn(expression, JSON.stringify(fields))).value;
}
/** Evaluate a FEL expression with full FormspecEnvironment context (value + diagnostics flag). */
export function wasmEvalFelWithContextEnvelope(expression, context, extensions) {
    const fn = wasm().evalFelWithContext;
    const resultJson = fn(expression, JSON.stringify(context), extensions);
    return parseFelEvalEnvelope(resultJson);
}
/** Throws when `name` may not be an extension function: a FEL built-in or reserved word (Core §3.12). */
export function wasmCheckFelExtensionName(name) {
    wasm().checkFelExtensionName(name);
}
/**
 * Evaluate a FEL expression with a structured trace of evaluation steps.
 *
 * Opt-in tracing path — use when surfacing evaluation to humans or LLMs
 * (MCP tools, error explainers). Values in the trace are projected to JSON,
 * losing FEL type fidelity (money/date) but gaining universal readability.
 */
export function wasmEvalFelWithTrace(expression, fields = {}) {
    const fn = wasm().evalFelWithTrace;
    const resultJson = fn(expression, JSON.stringify(fields));
    return parseWasmJson(resultJson);
}
/** Evaluate a FEL expression against full FormspecEnvironment context and trace each step. */
export function wasmEvalFelWithContextTrace(expression, context, extensions) {
    const fn = wasm().evalFelWithContextTrace;
    const resultJson = fn(expression, JSON.stringify(context), extensions);
    return parseWasmJson(resultJson);
}
/** Locale §3.3.1: resolve every `{{expression}}` in `template` against a FEL context, in one call. */
export function wasmInterpolateFelTemplate(template, context, extensions) {
    const fn = wasm().interpolateFelTemplate;
    return parseWasmJson(fn(template, JSON.stringify(context), extensions));
}
/**
 * Locale §3.3.1 with a host evaluator: Rust scans the template and applies the escape, failure,
 * and coercion rules; `evaluate(expression)` returns JSON `{ value, hasErrorDiagnostics? }` or throws.
 */
export function wasmInterpolateTemplate(template, evaluate) {
    return parseWasmJson(wasm().interpolateTemplate(template, evaluate));
}
/** Creates a resident FEL context from a Definition's leaf typing and `excludedValue: "null"` binds. */
export function wasmCreateFelContext(schema) {
    return new (wasm().FelContext)(JSON.stringify(schema));
}
/** Inline `optionSet` references from `optionSets` on a definition JSON document. */
export function wasmResolveOptionSetsOnDefinition(definitionJson) {
    return wasm().resolveOptionSetsOnDefinition(definitionJson);
}
/** Apply `migrations` on a definition to flat response data (FEL transforms in Rust). */
export function wasmApplyMigrationsToResponseData(definitionJson, responseDataJson, fromVersion, nowIso) {
    return wasm().applyMigrationsToResponseData(definitionJson, responseDataJson, fromVersion, nowIso);
}
/** Coerce an inbound field value (whitespace, numeric strings, money, precision). */
export function wasmCoerceFieldValue(itemJson, bindJson, definitionJson, valueJson) {
    return wasm().coerceFieldValue(itemJson, bindJson, definitionJson, valueJson);
}
/** Extract field path dependencies from a FEL expression. Returns an array of path strings. */
export function wasmGetFelDependencies(expression) {
    const resultJson = wasm().getFelDependencies(expression);
    return parseWasmJson(resultJson);
}
/** Normalize a dotted path by stripping repeat indices. */
export function wasmNormalizeIndexedPath(path) {
    return wasm().normalizeIndexedPath(path);
}
/** Resolve an item in a nested item tree by dotted path. */
export function wasmItemAtPath(items, path) {
    const resultJson = wasm().itemAtPath(JSON.stringify(items), path);
    const result = parseWasmJson(resultJson);
    return result === null ? undefined : result;
}
/** Resolve an item's parent path, index, and value in a nested item tree. */
export function wasmItemLocationAtPath(items, path) {
    const resultJson = wasm().itemLocationAtPath(JSON.stringify(items), path);
    const result = parseWasmJson(resultJson);
    return result === null ? undefined : result;
}
/** Apply creation-time values to a new Response or resolve its pending values. */
export function wasmCreateResponse(definition, data, context, extensions) {
    return parseWasmJson(wasm().createResponse(JSON.stringify(definition), JSON.stringify(data), JSON.stringify(context), extensions));
}
/** Create a new row at the end of the given repeat. */
export function wasmCreateRepeatRow(definition, data, groupPath, context, extensions) {
    return parseWasmJson(wasm().createRepeatRow(JSON.stringify(definition), JSON.stringify(data), groupPath, JSON.stringify(context), extensions));
}
/** Evaluate a Formspec definition against provided data. */
export function wasmEvaluateDefinition(definition, data, context, extensions) {
    const resultJson = wasm().evaluateDefinition(JSON.stringify(definition), JSON.stringify(data), context ? JSON.stringify(context) : undefined, extensions);
    return parseWasmJson(resultJson);
}
/**
 * Evaluate a standalone Screener Document against respondent inputs.
 * Returns a Determination Record (always non-null).
 *
 * `extensions` resolves host extension functions (Core §3.12) in route `condition` / `score` and
 * phase `activeWhen`; without them such a call is a definition error and the route is eliminated.
 */
export function wasmEvaluateScreenerDocument(screener, answers, context, extensions) {
    const resultJson = wasm().evaluateScreenerDocument(JSON.stringify(screener), JSON.stringify(answers), context ? JSON.stringify(context) : undefined, extensions);
    return parseWasmJson(resultJson);
}
/** Analyze a FEL expression and return structural info. */
export function wasmAnalyzeFel(expression) {
    const resultJson = wasm().analyzeFel(expression);
    return parseWasmJson(resultJson);
}
/** Analyze a FEL expression with field data type context for type-mismatch warnings. */
export function wasmAnalyzeFelWithFieldTypes(expression, fieldTypes) {
    const resultJson = wasm().analyzeFelWithFieldTypes(expression, JSON.stringify(fieldTypes));
    return parseWasmJson(resultJson);
}
/** Check if a string is a valid FEL identifier. */
export function wasmIsValidFelIdentifier(s) {
    return wasm().isValidFelIdentifier(s);
}
/** Sanitize a string into a valid FEL identifier. */
export function wasmSanitizeFelIdentifier(s) {
    return wasm().sanitizeFelIdentifier(s);
}
/** Compute dependency groups from recorded changeset entries (JSON round-trip to Rust). */
export function wasmComputeDependencyGroups(entriesJson) {
    const resultJson = wasm().computeDependencyGroups(entriesJson);
    return parseWasmJson(resultJson);
}
