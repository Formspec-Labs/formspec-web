/** @filedesc Tools WASM — lazy init and wrappers for `formspec_wasm_tools` (lint, mapping, assembly, FEL authoring helpers). */
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { nodeFsModuleName, resolveWasmAssetPathForNode, } from './wasm-bridge-shared.js';
import { getWasmModule, isWasmReady } from './wasm-bridge-runtime.js';
let _wasmToolsReady = false;
let _initToolsPromise = null;
let _wasmTools = null;
/** Count of `import()` executions for tools glue (excludes early-return paths). For tests only. */
let _toolsWasmDynamicImportCount = 0;
/** Whether the tools WASM module has been initialized and is ready for use. */
export function isWasmToolsReady() {
    return _wasmToolsReady;
}
/**
 * Initialize the tools WASM module (lazy-only paths: lint/registry/mapping/changelog/assembly).
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export async function initWasmTools() {
    if (_wasmToolsReady)
        return;
    if (_initToolsPromise)
        return _initToolsPromise;
    _initToolsPromise = (async () => {
        try {
            if (!isWasmReady()) {
                throw new Error('Cannot load tools WASM: runtime WASM is not ready. Call await initFormspecEngine() first, then await initFormspecEngineTools().');
            }
            getWasmModule();
            _toolsWasmDynamicImportCount += 1;
            const tools = await import('../wasm-pkg-tools/formspec_wasm_tools.js');
            const runningInNode = typeof globalThis.process !== 'undefined'
                && globalThis.process.versions?.node;
            let wasmBytes = null;
            if (runningInNode && typeof tools.initSync === 'function') {
                const { readFileSync } = await import(/* @vite-ignore */ nodeFsModuleName);
                const wasmPath = await resolveWasmAssetPathForNode('../wasm-pkg-tools/formspec_wasm_tools_bg.wasm');
                wasmBytes = readFileSync(wasmPath);
            }
            if (typeof tools.initSync === 'function' && wasmBytes) {
                tools.initSync({ module: wasmBytes });
            }
            else if (typeof tools.default === 'function') {
                await tools.default({
                    module_or_path: new URL('../wasm-pkg-tools/formspec_wasm_tools_bg.wasm', import.meta.url),
                });
            }
            _wasmTools = tools;
            verifyRuntimeToolsCompatibility(tools);
            _wasmToolsReady = true;
        }
        catch (e) {
            _initToolsPromise = null;
            if (e instanceof Error && e.message.startsWith('Cannot load tools WASM')) {
                throw e;
            }
            if (e instanceof Error && e.message.includes('compatibility mismatch')) {
                throw e;
            }
            const inner = e instanceof Error ? e.message : String(e);
            throw new Error(`Formspec tools WASM failed to load: ${inner}. Ensure wasm-pkg-tools is built (npm run build:wasm) ` +
                'and call await initFormspecEngineTools() after the runtime is ready.');
        }
    })();
    return _initToolsPromise;
}
function wasmTools() {
    if (!isWasmReady()) {
        throw new Error('This API needs runtime WASM first. Call await initFormspecEngine() before tools-only functions (lint, mapping, tokenize, …).');
    }
    if (!_wasmTools || !_wasmToolsReady) {
        throw new Error('Formspec tools WASM is not loaded. Call await initFormspecEngineTools() before lint/mapping/assembly/tokenize APIs, ' +
            'or await assembleDefinition() to load tools lazily.');
    }
    return _wasmTools;
}
/** Throws unless tools WASM is ready — use before sync tools calls. */
function assertWasmToolsReadySync() {
    if (!isWasmReady()) {
        throw new Error('This API needs runtime WASM first. Call await initFormspecEngine() before tools-only functions.');
    }
    if (!_wasmToolsReady || !_wasmTools) {
        throw new Error('Formspec tools WASM is not loaded. Call await initFormspecEngineTools() after await initFormspecEngine(), ' +
            'or use await assembleDefinition() to load tools lazily.');
    }
}
/**
 * Validates paired runtime/tools split ABI strings (same contract as `formspecWasmSplitAbiVersion()` in WASM).
 * Exported for unit tests; `initWasmTools` uses this after loading the tools module.
 */
export function assertRuntimeToolsSplitAbiMatch(runtimeVersion, toolsVersion) {
    if (runtimeVersion !== toolsVersion) {
        throw new Error(`WASM runtime/tools compatibility mismatch: runtime ABI=${runtimeVersion}, tools ABI=${toolsVersion}. ` +
            'Rebuild wasm-pkg-runtime and wasm-pkg-tools from the same formspec-wasm commit.');
    }
}
function verifyRuntimeToolsCompatibility(toolsMod) {
    assertRuntimeToolsSplitAbiMatch(getWasmModule().formspecWasmSplitAbiVersion(), toolsMod.formspecWasmSplitAbiVersion());
}
/** @internal Test helper — dynamic `import()` count for tools JS glue. */
export function getToolsWasmDynamicImportCountForTest() {
    return _toolsWasmDynamicImportCount;
}
/** @internal Reset import counter (use only in isolated test processes). */
export function resetToolsWasmDynamicImportCountForTest() {
    _toolsWasmDynamicImportCount = 0;
}
// ---------------------------------------------------------------------------
// Typed wrappers — tools `formspec_wasm_tools` only
// ---------------------------------------------------------------------------
const verifiedObjectToken = new WeakMap();
const verifiedRecordToken = new WeakMap();
/**
 * Parse exact JSON once and return an unforgeable token proving the text is
 * one complete JSON object so `selectResponses` can embed it without re-parsing.
 */
export function parseVerifiedJsonObject(text) {
    if (typeof text !== 'string') {
        throw new TypeError('A selection record must contain one Response object.');
    }
    const value = parseJsonExact(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError('A selection record must contain one Response object.');
    }
    const token = Object.freeze({});
    verifiedObjectToken.set(token, text);
    return { value: value, token };
}
/** Associate a previously verified JSON object token with a shallow copy of a selection record. */
export function attachVerifiedJsonToken(record, token) {
    const tagged = { ...record };
    verifiedRecordToken.set(tagged, token);
    return tagged;
}
/**
 * Execute an authorized preview Response selection after initializing tools WASM.
 * Set `context.upstreamSubject` to null when the upstream Definition has no subject.
 */
export const selectResponses = (records, selection, context) => {
    const recordJson = records.map(record => {
        if (record.responseJson === undefined)
            return JSON.stringify(record);
        const { scope, kind, implicitSubjectId, responseJson } = record;
        // Validate one complete object before embedding it. A bracket check alone
        // would allow the text to inject sibling record fields. Pass the original
        // text to Rust as RawValue so digits and duplicate members stay visible.
        const token = verifiedRecordToken.get(record);
        if (token === undefined || verifiedObjectToken.get(token) !== responseJson) {
            if (typeof responseJson !== 'string') {
                throw new TypeError('A selection record must contain one Response object.');
            }
            const parsed = JSON.parse(responseJson);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new TypeError('A selection record must contain one Response object.');
            }
        }
        const metadata = JSON.stringify({ scope, kind, implicitSubjectId });
        return `${metadata.slice(0, -1)},"response":${responseJson}}`;
    });
    const resultJson = wasmTools().selectResponsesJson(`[${recordJson.join(',')}]`, JSON.stringify(selection), JSON.stringify(context));
    return parseJsonExact(resultJson);
};
/** Check whether authored specifies a valid Response ordering instant. */
export function isValidResponseAuthored(authored) {
    return wasmTools().isValidResponseAuthored(authored);
}
/** Parse a FEL expression and return whether it's valid. */
export function wasmParseFel(expression) {
    assertWasmToolsReadySync();
    const fn = wasmTools().parseFel;
    return fn(expression);
}
/** Tokenize a FEL expression and return positioned token records. */
export function wasmTokenizeFel(expression) {
    assertWasmToolsReadySync();
    const fn = wasmTools().tokenizeFel;
    const resultJson = fn(expression);
    return JSON.parse(resultJson);
}
/** Extract full dependency info from a FEL expression. */
export function wasmExtractDependencies(expression) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().extractDependencies(expression);
    return JSON.parse(resultJson);
}
/** Detect the document type of a Formspec JSON document. */
export function wasmDetectDocumentType(doc) {
    assertWasmToolsReadySync();
    return wasmTools().detectDocumentType(JSON.stringify(doc)) ?? null;
}
/** Convert a JSON Pointer into a JSONPath string. */
export function wasmJsonPointerToJsonPath(pointer) {
    assertWasmToolsReadySync();
    return wasmTools().jsonPointerToJsonPath(pointer);
}
/** Plan schema validation dispatch and component-node target enumeration. */
export function wasmPlanSchemaValidation(doc, documentType) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().planSchemaValidation(JSON.stringify(doc), documentType ?? undefined);
    return JSON.parse(resultJson);
}
/** Assemble a definition by resolving $ref inclusions. */
export function wasmAssembleDefinition(definition, fragments) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().assembleDefinition(JSON.stringify(definition), JSON.stringify(fragments));
    return JSON.parse(resultJson);
}
/** Execute a mapping transform. */
export function wasmExecuteMapping(rules, source, direction) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().executeMappingRules(JSON.stringify(rules), JSON.stringify(source), direction);
    return JSON.parse(resultJson);
}
/** Execute a full mapping document (rules + defaults + autoMap). */
export function wasmExecuteMappingDoc(doc, source, direction) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().executeMappingDocument(JSON.stringify(doc), JSON.stringify(source), direction);
    return JSON.parse(resultJson);
}
/** Check an instance or catalog source against every eligible upstream Definition. */
export function checkInstanceProjection(source, projectionConsumer, upstreamDefinitions) {
    assertWasmToolsReadySync();
    return JSON.parse(wasmTools().checkResponseProjection(JSON.stringify(source), JSON.stringify(projectionConsumer), JSON.stringify(upstreamDefinitions)));
}
/** Lint a Formspec document, or check a response projection when given upstream Definitions. */
export function wasmLintDocument(doc, options) {
    if (options?.upstreamDefinitions !== undefined) {
        if (options.projectionConsumer === undefined) {
            throw new TypeError('Projection checks require the receiving form and binding, or null for a widget.');
        }
        const instanceProjectionDiagnostics = checkInstanceProjection(doc, options.projectionConsumer, options.upstreamDefinitions);
        return { documentType: null, valid: instanceProjectionDiagnostics.length === 0, diagnostics: [], instanceProjectionDiagnostics };
    }
    assertWasmToolsReadySync();
    const optionsJson = options === undefined ? undefined : JSON.stringify(options);
    // WASM glue is regenerated by `npm run build:wasm:tools`; optional second arg matches Rust `lint_document`.
    const lintDocument = wasmTools().lintDocument;
    const resultJson = lintDocument(JSON.stringify(doc), optionsJson);
    return JSON.parse(resultJson);
}
/** @deprecated Use `wasmLintDocument(doc, { registryDocuments })`. */
export function wasmLintDocumentWithRegistries(doc, registries) {
    return wasmLintDocument(doc, { registryDocuments: registries });
}
/** Collect the rewriteable targets in a FEL expression. */
export function wasmCollectFelRewriteTargets(expression) {
    assertWasmToolsReadySync();
    const fn = wasmTools().collectFelRewriteTargets;
    const resultJson = fn(expression);
    return JSON.parse(resultJson);
}
/** Rewrite a FEL expression using explicit rewrite maps. */
export function wasmRewriteFelReferences(expression, rewrites) {
    assertWasmToolsReadySync();
    const fn = wasmTools().rewriteFelReferences;
    return fn(expression, JSON.stringify(rewrites));
}
/** Rewrite FEL using definition-assembly `RewriteMap` JSON (fragment + host keys). */
export function wasmRewriteFelForAssembly(expression, mapJson) {
    assertWasmToolsReadySync();
    return wasmTools().rewriteFelForAssembly(expression, mapJson);
}
/** Rewrite FEL expressions embedded in {{...}} interpolation segments. */
export function wasmRewriteMessageTemplate(message, rewrites) {
    assertWasmToolsReadySync();
    return wasmTools().rewriteMessageTemplate(message, JSON.stringify(rewrites));
}
/** Print a FEL expression AST back to normalized source. */
export function wasmPrintFel(expression) {
    assertWasmToolsReadySync();
    const fn = wasmTools().printFel;
    return fn(expression);
}
/** Parse FEL and lift a homogeneous `and` / `or` chain into Studio condition-group JSON when possible. */
export function wasmTryLiftConditionGroup(expression) {
    assertWasmToolsReadySync();
    return JSON.parse(wasmTools().tryLiftConditionGroup(expression));
}
/** Return the builtin FEL function catalog exported by the Rust runtime. */
export function wasmListBuiltinFunctions() {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().listBuiltinFunctions();
    return JSON.parse(resultJson);
}
/** Parse and validate a registry document, returning summary metadata. */
export function wasmParseRegistry(registry) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().parseRegistry(JSON.stringify(registry));
    return JSON.parse(resultJson);
}
/** Find the highest-version registry entry matching a name and version constraint. */
export function wasmFindRegistryEntry(registry, name, versionConstraint = '') {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().findRegistryEntry(JSON.stringify(registry), name, versionConstraint);
    return JSON.parse(resultJson);
}
/** Derive the JSON-LD `@context` for a definition from an ontology document's concept bindings (Ontology §6.2). */
export function wasmDeriveJsonLdContext(definition, ontology) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().deriveJsonLdContext(JSON.stringify(definition), JSON.stringify(ontology));
    return JSON.parse(resultJson);
}
/** Validate a lifecycle transition between two registry statuses. */
export function wasmValidateLifecycleTransition(from, to) {
    assertWasmToolsReadySync();
    return wasmTools().validateLifecycleTransition(from, to);
}
/** Construct a well-known registry URL from a base URL. */
export function wasmWellKnownRegistryUrl(baseUrl) {
    assertWasmToolsReadySync();
    return wasmTools().wellKnownRegistryUrl(baseUrl);
}
/** Generate a structured changelog between two definitions. */
export function wasmGenerateChangelog(oldDefinition, newDefinition, definitionUrl) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().generateChangelog(JSON.stringify(oldDefinition), JSON.stringify(newDefinition), definitionUrl);
    return JSON.parse(resultJson);
}
/** Validate enabled x-extension usage in an item tree against registry entries. */
export function wasmValidateExtensionUsage(items, registryEntries) {
    assertWasmToolsReadySync();
    const resultJson = wasmTools().validateExtensionUsage(JSON.stringify(items), JSON.stringify(registryEntries));
    return JSON.parse(resultJson);
}
