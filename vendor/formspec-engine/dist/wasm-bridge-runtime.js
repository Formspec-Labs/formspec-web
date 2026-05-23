/** @filedesc Runtime WASM — init, accessors, and wrappers that use only the runtime `formspec_wasm_runtime` module. */
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
 * In Node.js, uses `initSync()` with bytes read from disk.
 * In browsers, the generated wasm-bindgen loader fetches the sibling `.wasm` asset via URL.
 */
export async function initWasm() {
    if (_wasmReady)
        return;
    if (_initPromise)
        return _initPromise;
    _initPromise = (async () => {
        try {
            const runtime = await import('../wasm-pkg-runtime/formspec_wasm_runtime.js');
            const runningInNode = typeof globalThis.process !== 'undefined'
                && globalThis.process.versions?.node;
            let wasmBytes = null;
            if (runningInNode && typeof runtime.initSync === 'function') {
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
    const parsed = JSON.parse(resultJson);
    if (parsed &&
        typeof parsed === 'object' &&
        'value' in parsed &&
        typeof parsed.hasErrorDiagnostics === 'boolean') {
        return parsed;
    }
    throw new Error('evalFEL returned unexpected JSON (expected { value, hasErrorDiagnostics })');
}
/** Evaluate a FEL expression with optional field values. Returns the evaluated value. */
export function wasmEvalFEL(expression, fields = {}) {
    return parseFelEvalEnvelope(wasm().evalFEL(expression, JSON.stringify(fields))).value;
}
/** Evaluate a FEL expression with full FormspecEnvironment context (value + diagnostics flag). */
export function wasmEvalFELWithContextEnvelope(expression, context) {
    const resultJson = wasm().evalFELWithContext(expression, JSON.stringify(context));
    return parseFelEvalEnvelope(resultJson);
}
/** Evaluate a FEL expression with full FormspecEnvironment context. Returns the value only. */
export function wasmEvalFELWithContext(expression, context) {
    return wasmEvalFELWithContextEnvelope(expression, context).value;
}
/**
 * Evaluate a FEL expression with a structured trace of evaluation steps.
 *
 * Opt-in tracing path — use when surfacing evaluation to humans or LLMs
 * (MCP tools, error explainers). Values in the trace are projected to JSON,
 * losing FEL type fidelity (money/date) but gaining universal readability.
 */
export function wasmEvalFELWithTrace(expression, fields = {}) {
    const resultJson = wasm().evalFELWithTrace(expression, JSON.stringify(fields));
    return JSON.parse(resultJson);
}
/** Locale §3.3.1 — true if the expression AST is only literals and unary `not` / `!` / `-`. */
export function wasmFelExprIsInterpolationStaticLiteral(expression) {
    return wasm().felExprIsInterpolationStaticLiteral(expression);
}
/** Normalize FEL source before evaluation (bare `$`, repeat qualifiers, repeat aliases). */
export function wasmPrepareFelExpression(optionsJson) {
    return wasm().prepareFelExpression(optionsJson);
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
export function wasmGetFELDependencies(expression) {
    const resultJson = wasm().getFELDependencies(expression);
    return JSON.parse(resultJson);
}
/** Normalize a dotted path by stripping repeat indices. */
export function wasmNormalizeIndexedPath(path) {
    return wasm().normalizeIndexedPath(path);
}
/** Resolve an item in a nested item tree by dotted path. */
export function wasmItemAtPath(items, path) {
    const resultJson = wasm().itemAtPath(JSON.stringify(items), path);
    const result = JSON.parse(resultJson);
    return result === null ? undefined : result;
}
/** Resolve an item's parent path, index, and value in a nested item tree. */
export function wasmItemLocationAtPath(items, path) {
    const resultJson = wasm().itemLocationAtPath(JSON.stringify(items), path);
    const result = JSON.parse(resultJson);
    return result === null ? undefined : result;
}
/** Evaluate a Formspec definition against provided data. */
export function wasmEvaluateDefinition(definition, data, context) {
    const resultJson = wasm().evaluateDefinition(JSON.stringify(definition), JSON.stringify(data), context ? JSON.stringify(context) : undefined);
    return JSON.parse(resultJson);
}
/** Evaluate a standalone Screener Document against respondent inputs.
 *  Returns a Determination Record (always non-null). */
export function wasmEvaluateScreenerDocument(screener, answers, context) {
    const resultJson = wasm().evaluateScreenerDocument(JSON.stringify(screener), JSON.stringify(answers), context ? JSON.stringify(context) : undefined);
    return JSON.parse(resultJson);
}
/** Analyze a FEL expression and return structural info. */
export function wasmAnalyzeFEL(expression) {
    const resultJson = wasm().analyzeFEL(expression);
    return JSON.parse(resultJson);
}
/** Analyze a FEL expression with field data type context for type-mismatch warnings. */
export function wasmAnalyzeFELWithFieldTypes(expression, fieldTypes) {
    const resultJson = wasm().analyzeFELWithFieldTypes(expression, JSON.stringify(fieldTypes));
    return JSON.parse(resultJson);
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
    return JSON.parse(resultJson);
}
