/** @filedesc Tools WASM — lazy init and wrappers for `formspec_wasm_tools` (lint, mapping, assembly, FEL authoring helpers). */
import type { FELConditionGroupLiftResult } from './interfaces.js';
export type WasmToolsModule = typeof import('../wasm-pkg-tools/formspec_wasm_tools.js');
/** Whether the tools WASM module has been initialized and is ready for use. */
export declare function isWasmToolsReady(): boolean;
/**
 * Initialize the tools WASM module (lazy-only paths: lint/registry/mapping/changelog/assembly).
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export declare function initWasmTools(): Promise<void>;
/**
 * Validates paired runtime/tools split ABI strings (same contract as `formspecWasmSplitAbiVersion()` in WASM).
 * Exported for unit tests; `initWasmTools` uses this after loading the tools module.
 */
export declare function assertRuntimeToolsSplitAbiMatch(runtimeVersion: string, toolsVersion: string): void;
/** @internal Test helper — dynamic `import()` count for tools JS glue. */
export declare function getToolsWasmDynamicImportCountForTest(): number;
/** @internal Reset import counter (use only in isolated test processes). */
export declare function resetToolsWasmDynamicImportCountForTest(): void;
/** Parse a FEL expression and return whether it's valid. */
export declare function wasmParseFEL(expression: string): boolean;
/** Tokenize a FEL expression and return positioned token records. */
export declare function wasmTokenizeFEL(expression: string): Array<{
    tokenType: string;
    text: string;
    start: number;
    end: number;
}>;
/** Extract full dependency info from a FEL expression. */
export declare function wasmExtractDependencies(expression: string): {
    fields: string[];
    contextRefs: string[];
    instanceRefs: string[];
    mipDeps: string[];
    hasSelfRef: boolean;
    hasWildcard: boolean;
    usesPrevNext: boolean;
};
/** Detect the document type of a Formspec JSON document. */
export declare function wasmDetectDocumentType(doc: unknown): string | null;
/** Convert a JSON Pointer into a JSONPath string. */
export declare function wasmJsonPointerToJsonPath(pointer: string): string;
/** Plan schema validation dispatch and component-node target enumeration. */
export declare function wasmPlanSchemaValidation(doc: unknown, documentType?: string | null): {
    documentType: string | null;
    mode: 'unknown' | 'document' | 'component';
    componentTargets: Array<{
        pointer: string;
        component: string;
        node: any;
    }>;
    error?: string | null;
};
/** Assemble a definition by resolving $ref inclusions. */
export declare function wasmAssembleDefinition(definition: unknown, fragments: Record<string, unknown>): {
    definition: any;
    warnings: string[];
    errors: string[];
    assembledFrom?: Array<{
        url: string;
        version: string;
        keyPrefix?: string;
        fragment?: string;
    }>;
};
/** Execute a mapping transform. */
export declare function wasmExecuteMapping(rules: unknown[], source: unknown, direction: 'forward' | 'reverse'): {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
};
/** Execute a full mapping document (rules + defaults + autoMap). */
export declare function wasmExecuteMappingDoc(doc: unknown, source: unknown, direction: 'forward' | 'reverse'): {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
};
export interface WasmLintDocumentOptions {
    registryDocuments?: unknown[];
    mode?: string;
    definitionDocument?: unknown;
    themeDocument?: unknown;
    componentDocuments?: unknown[];
    localeDocuments?: unknown[];
    schemaOnly?: boolean;
    noFel?: boolean;
}
/** Lint a Formspec document. */
export declare function wasmLintDocument(doc: unknown, options?: WasmLintDocumentOptions): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
};
/** @deprecated Use `wasmLintDocument(doc, { registryDocuments })`. */
export declare function wasmLintDocumentWithRegistries(doc: unknown, registries: unknown[]): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
};
/** Collect the rewriteable targets in a FEL expression. */
export declare function wasmCollectFELRewriteTargets(expression: string): {
    fieldPaths: string[];
    currentPaths: string[];
    variables: string[];
    instanceNames: string[];
    navigationTargets: Array<{
        functionName: 'prev' | 'next' | 'parent';
        name: string;
    }>;
};
/** Rewrite a FEL expression using explicit rewrite maps. */
export declare function wasmRewriteFELReferences(expression: string, rewrites: {
    fieldPaths?: Record<string, string>;
    currentPaths?: Record<string, string>;
    variables?: Record<string, string>;
    instanceNames?: Record<string, string>;
    navigationTargets?: Record<string, string>;
}): string;
/** Rewrite FEL using definition-assembly `RewriteMap` JSON (fragment + host keys). */
export declare function wasmRewriteFelForAssembly(expression: string, mapJson: string): string;
/** Rewrite FEL expressions embedded in {{...}} interpolation segments. */
export declare function wasmRewriteMessageTemplate(message: string, rewrites: {
    fieldPaths?: Record<string, string>;
    currentPaths?: Record<string, string>;
    variables?: Record<string, string>;
    instanceNames?: Record<string, string>;
    navigationTargets?: Record<string, string>;
}): string;
/** Print a FEL expression AST back to normalized source. */
export declare function wasmPrintFEL(expression: string): string;
/** Parse FEL and lift a homogeneous `and` / `or` chain into Studio condition-group JSON when possible. */
export declare function wasmTryLiftConditionGroup(expression: string): FELConditionGroupLiftResult;
/** Return the builtin FEL function catalog exported by the Rust runtime. */
export declare function wasmListBuiltinFunctions(): Array<{
    name: string;
    category: string;
    signature: string;
    description: string;
}>;
/** Parse and validate a registry document, returning summary metadata. */
export declare function wasmParseRegistry(registry: unknown): {
    publisher: {
        name?: string | Record<string, string>;
        identifier?: string | null;
        homepage?: string | null;
        url?: string | null;
        contactPoint?: Array<{
            contactType?: string | null;
            email?: string | null;
            telephone?: string | null;
            url?: string | null;
            availableLanguage?: string[];
        }>;
        contact?: string | null;
    };
    published?: string;
    entryCount: number;
    validationIssues: any[];
    warnings: Array<{
        kind: 'deprecatedField';
        field: string;
        replacement: string;
    }>;
};
/** Find the highest-version registry entry matching a name and version constraint. */
export declare function wasmFindRegistryEntry(registry: unknown, name: string, versionConstraint?: string): any | null;
/** Validate a lifecycle transition between two registry statuses. */
export declare function wasmValidateLifecycleTransition(from: string, to: string): boolean;
/** Construct a well-known registry URL from a base URL. */
export declare function wasmWellKnownRegistryUrl(baseUrl: string): string;
/** Generate a structured changelog between two definitions. */
export declare function wasmGenerateChangelog(oldDefinition: unknown, newDefinition: unknown, definitionUrl: string): any;
/** Validate enabled x-extension usage in an item tree against registry entries. */
export declare function wasmValidateExtensionUsage(items: unknown[], registryEntries: Record<string, unknown>): Array<{
    path: string;
    extension: string;
    severity: 'error' | 'warning' | 'info';
    code: 'UNRESOLVED_EXTENSION' | 'EXTENSION_RETIRED' | 'EXTENSION_DEPRECATED';
    message: string;
}>;
