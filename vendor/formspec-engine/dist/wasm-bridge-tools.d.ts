/** @filedesc Tools WASM — lazy init and wrappers for `formspec_wasm_tools` (lint, mapping, assembly, FEL authoring helpers). */
import type { ResponseSelectionRecord, SelectResponses } from '@formspec-org/types';
import { type FELDependencies } from './wasm-bridge-runtime.js';
import type { FELConditionGroupLiftResult } from './interfaces.js';
export type WasmToolsModule = typeof import('../wasm-pkg-tools/formspec_wasm_tools.js');
/** Return each instance's sorted paths across FEL and creation-time declarations. */
export declare function getDefinitionInstanceReads(definition: unknown): Record<string, string[]>;
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
/**
 * Parse exact JSON once and return an unforgeable token proving the text is
 * one complete JSON object so `selectResponses` can embed it without re-parsing.
 */
export declare function parseVerifiedJsonObject(text: string): {
    value: Record<string, unknown>;
    token: object;
};
/** Associate a previously verified JSON object token with a shallow copy of a selection record. */
export declare function attachVerifiedJsonToken(record: ResponseSelectionRecord, token: object): ResponseSelectionRecord;
/**
 * Execute an authorized preview Response selection after initializing tools WASM.
 * Set `context.upstreamSubject` to null when the upstream Definition has no subject.
 */
export declare const selectResponses: SelectResponses;
/** Check whether authored specifies a valid Response ordering instant. */
export declare function isValidResponseAuthored(authored: string): boolean;
/** Parse a FEL expression and return whether it's valid. */
export declare function wasmParseFel(expression: string): boolean;
/** Tokenize a FEL expression and return positioned token records. */
export declare function wasmTokenizeFel(expression: string): Array<{
    tokenType: string;
    text: string;
    start: number;
    end: number;
}>;
/** Extract full dependency info from a FEL expression. */
export declare function wasmExtractDependencies(expression: string): FELDependencies;
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
/** The receiving Definition and the authored binding for a response read. */
export type ProjectionConsumer = {
    kind: 'instance';
    name: string;
    definition: unknown;
} | {
    kind: 'prefill';
    mapped: boolean;
    definition: unknown;
};
export interface WasmLintDocumentOptions {
    registryDocuments?: unknown[];
    mode?: string;
    definitionDocument?: unknown;
    /** Host input for a Definition-associated Mapping. Requires the paired Definition. */
    mappingSourceContext?: {
        /** JSON Schema for the host metadata and the Definition data root. */
        schema: unknown;
        /** Dotted path to the Definition data object within the host input. */
        dataPath: string;
    };
    /** Exact paired freestanding Screener for Locale 2.1 item and target checks. */
    screenerDocument?: unknown;
    themeDocument?: unknown;
    componentDocuments?: unknown[];
    localeDocuments?: unknown[];
    appGraphValidationReport?: unknown;
    schemaOnly?: boolean;
    noFel?: boolean;
    /** For an AppGraph projection check, pass all loaded Definitions for the selected URL. */
    upstreamDefinitions?: readonly unknown[];
    /** The consuming form and how it receives data, or null for a widget. */
    projectionConsumer?: ProjectionConsumer | null;
}
/** Analyze an expression with the same Definition declarations used by document lint. */
export declare function analyzeExpressionInDefinition(definition: unknown, expression: string, registryDocuments: readonly unknown[], target?: string, mapping?: boolean): {
    errors: import("./interfaces.js").FELAnalysisError[];
    valid: boolean;
    warnings: string[];
    references: string[];
    variables: string[];
    functions: string[];
    findings: Array<{
        name: string;
        code: string;
        severity: "error" | "warning";
        message: string;
        variableHint: boolean;
    }>;
};
export interface InstanceProjectionDiagnostic {
    code: string;
    jsonPointer: string;
    upstreamVersion: string | null;
    message: string;
}
/** Check an instance or catalog source against every eligible upstream Definition. */
export declare function checkInstanceProjection(source: unknown, projectionConsumer: ProjectionConsumer | null, upstreamDefinitions: readonly unknown[]): InstanceProjectionDiagnostic[];
/** Lint a Formspec document, or check a response projection when given upstream Definitions. */
export declare function wasmLintDocument(doc: unknown, options?: WasmLintDocumentOptions): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
    appGraphReport?: {
        ok: boolean;
        diagnostics: any[];
    };
    instanceProjectionDiagnostics?: InstanceProjectionDiagnostic[];
};
/** @deprecated Use `wasmLintDocument(doc, { registryDocuments })`. */
export declare function wasmLintDocumentWithRegistries(doc: unknown, registries: unknown[]): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
};
/** Collect the rewriteable targets in a FEL expression. */
export declare function wasmCollectFelRewriteTargets(expression: string): {
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
export declare function wasmRewriteFelReferences(expression: string, rewrites: {
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
export declare function wasmPrintFel(expression: string): string;
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
/** One thing the JSON-LD context derivation could not honor (Ontology spec §6.2). */
export interface JsonLdContextDiagnostic {
    kind: 'collision' | 'unbound-repeatable' | 'unsupported-type';
    /** Dotted Definition path of the item that could not be honored. */
    path: string;
    /** The item's JSON key. */
    key: string;
    /** Term definition that stays in the context (collisions only). */
    existingId?: string;
    /** Term definition the item needed. */
    newId?: string;
}
/** Derive the JSON-LD `@context` for a definition from an ontology document's concept bindings (Ontology §6.2). */
export declare function wasmDeriveJsonLdContext(definition: unknown, ontology: unknown): {
    context: Record<string, unknown>;
    diagnostics: JsonLdContextDiagnostic[];
};
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
